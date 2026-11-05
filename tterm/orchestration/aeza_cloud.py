"""
Aeza Cloud API Integration Client.

Manages provisioning and lifecycle of hourly VPS machines for live testing,
demonstration, and staging of tTerm deployments.
"""
from __future__ import annotations

import json
import logging
import ssl
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("tterm.orchestration.aeza")

AEZA_BASE_URL = "https://my.aeza.ru/api/v2"
AEZA_DEFAULT_KEY = "1404_2fd3f63e0ec3f58608beb52a738da83b"


def _get_ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
        try:
            ctx.load_default_certs()
        except Exception:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        return ctx


class AezaClient:
    def __init__(self, api_key: str = AEZA_DEFAULT_KEY):
        self.api_key = api_key
        self.base_url = AEZA_BASE_URL
        self._ssl_ctx = _get_ssl_context()

    def _request(self, endpoint: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        body = json.dumps(data).encode("utf-8") if data is not None else None
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "User-Agent": "tTerm-CloudOrchestrator/1.0",
        }
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        last_err = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=15, context=self._ssl_ctx) as resp:
                    raw = resp.read().decode("utf-8")
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                log.error("Aeza API HTTPError %d [%s]: %s", e.code, url, err_body)
                raise RuntimeError(f"Aeza API Error ({e.code}): {err_body}")
            except Exception as e:
                last_err = e
                log.warning("Aeza API connection attempt %d error [%s]: %s", attempt + 1, url, str(e))
        log.error("Aeza API connection failed [%s]: %s", url, str(last_err))
        raise RuntimeError(f"Aeza connection failed: {str(last_err)}")

    def get_account_info(self) -> Dict[str, Any]:
        """Retrieves account balance, email, and currency."""
        res = self._request("/accounts/me")
        # In Aeza, balance is usually in kopecks / cents
        balance_kopecks = res.get("balance", 0)
        return {
            "id": res.get("id"),
            "email": res.get("email"),
            "status": res.get("status"),
            "balance_rub": balance_kopecks / 100.0 if balance_kopecks else 0.0,
            "balance_raw": balance_kopecks,
            "currency": res.get("currency", "RUB"),
        }

    def list_ssh_keys(self) -> List[Dict[str, Any]]:
        """Lists SSH public keys stored in account."""
        res = self._request("/services/ssh-keys")
        return res.get("items", [])

    def register_ssh_key(self, name: str, public_key: str, auto_assign: bool = True) -> Dict[str, Any]:
        """Uploads a new SSH public key."""
        payload = {
            "name": name,
            "publicKey": public_key.strip(),
            "autoAssign": auto_assign,
        }
        return self._request("/services/ssh-keys", method="POST", data=payload)

    def list_vps_plans(self, hourly_only: bool = True) -> List[Dict[str, Any]]:
        """Lists available VPS plans with hourly pricing."""
        res = self._request("/services/products")
        items = res.get("items", [])
        plans = []
        for p in items:
            p_type = p.get("type", {})
            type_slug = p_type.get("slug", "") if isinstance(p_type, dict) else str(p_type)
            if type_slug != "vps":
                continue

            raw_prices = p.get("rawPrices", {})
            hour_price_kopecks = raw_prices.get("hour")
            if hourly_only and not hour_price_kopecks:
                continue

            params = p.get("parameters", {})
            plans.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "group": p.get("group", {}).get("name", "Shared"),
                "cpu": params.get("cpu", 1),
                "ram_gb": params.get("ram", 2),
                "disk_gb": params.get("rom", 30),
                "network_mbps": params.get("net", 1000) / 1000.0,
                "hour_price_rub": (hour_price_kopecks / 100.0) if hour_price_kopecks else None,
                "month_price_rub": (raw_prices.get("month", 0) / 100.0) if raw_prices.get("month") else None,
                "is_available": p.get("isAvailable", True),
            })

        # Sort by hour_price ascending
        plans.sort(key=lambda x: (x["hour_price_rub"] or 999999))
        return plans

    def calculate_price(self, product_id: int, hours: int = 10) -> Dict[str, Any]:
        """Calculates exact order price for given product and duration."""
        endpoint = f"/services/orders/price?productId={product_id}&paymentTerm=hour&termCount={hours}"
        res = self._request(endpoint)
        total_kopecks = res.get("totalPrice", 0)
        return {
            "product_id": product_id,
            "hours": hours,
            "total_price_rub": total_kopecks / 100.0,
            "is_available": res.get("availability", {}).get("status") == "ok",
        }

    def order_vps(
        self,
        name: str = "tterm-demo",
        product_id: int = 52,        # 52 is MSKs-1 (1.40 RUB/hr, 1 vCPU, 2GB RAM, 30GB NVMe)
        hours: int = 5,
        os_id: int = 1,              # 1 is Ubuntu 24.04
        ssh_key_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Provisions a new hourly VPS machine on Aeza."""
        if ssh_key_ids is None:
            # Auto-discover registered keys
            keys = self.list_ssh_keys()
            ssh_key_ids = [k["id"] for k in keys if "id" in k]

        order_item = {
            "productId": product_id,
            "count": 1,
            "name": name,
            "term": "hour",
            "termCount": hours,
            "autoProlong": False,
            "parameters": {
                "os": os_id,
            },
            "sshKeyIds": ssh_key_ids,
        }

        payload = {
            "method": "balance",
            "orders": [order_item],
        }

        log.info("Ordering Aeza VPS: %s (Product: %d, Hours: %d)", name, product_id, hours)
        res = self._request("/services/orders", method="POST", data=payload)
        return res

    def list_services(self) -> List[Dict[str, Any]]:
        """Lists active provisioned services."""
        res = self._request("/services")
        return res.get("items", [])

    def get_service_details(self, service_id: int) -> Dict[str, Any]:
        """Gets detailed status and network credentials for a service."""
        return self._request(f"/services/{service_id}")

    def restart_service(self, service_id: int) -> Dict[str, Any]:
        """Restarts a VPS service."""
        return self._request(f"/services/{service_id}/ctl/restart", method="POST")


aeza_client = AezaClient()

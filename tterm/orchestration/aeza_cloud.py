"""
Aeza Cloud API Integration Client.

Manages provisioning and lifecycle of hourly VPS machines for live testing,
demonstration, and staging of tTerm deployments.
Keys are isolated per user profile and stored securely in the user's vault.
"""
from __future__ import annotations

import json
import logging
import os
import ssl
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

log = logging.getLogger("tterm.orchestration.aeza")

AEZA_BASE_URL = "https://my.aeza.ru/api/v2"


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


class AezaKeyStore:
    """Secure per-user storage for Aeza Cloud API credentials."""

    def __init__(self, filepath: Optional[str] = None):
        if filepath:
            self.filepath = filepath
        else:
            env_path = os.environ.get("AEZA_KEYS_FILE")
            if env_path:
                self.filepath = env_path
            else:
                # Default to .user_aeza_keys.json in workspace or fallback to home
                base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                self.filepath = os.path.join(base_dir, ".user_aeza_keys.json")

        self._keys: Dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._keys = {str(k): str(v) for k, v in data.items()}
            except Exception as e:
                log.warning("Could not read Aeza keys from %s: %s", self.filepath, e)

        # Fallback check in user home directory if workspace file has no keys
        home_fallback = os.path.expanduser("~/.tterm_aeza_keys.json")
        if not self._keys and os.path.exists(home_fallback):
            try:
                with open(home_fallback, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._keys.update({str(k): str(v) for k, v in data.items()})
            except Exception:
                pass

    def _save(self) -> None:
        try:
            dirpath = os.path.dirname(self.filepath)
            if dirpath and not os.path.exists(dirpath):
                os.makedirs(dirpath, exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self._keys, f, indent=2)
        except Exception as e:
            log.warning("Could not persist Aeza keys to %s: %s", self.filepath, e)

    def get_key(self, user_id: str) -> Optional[str]:
        return self._keys.get(str(user_id))

    def set_key(self, user_id: str, api_key: str) -> None:
        self._keys[str(user_id)] = api_key.strip()
        self._save()

    def delete_key(self, user_id: str) -> bool:
        uid = str(user_id)
        if uid in self._keys:
            del self._keys[uid]
            self._save()
            return True
        return False

    def has_key(self, user_id: str) -> bool:
        return bool(self._keys.get(str(user_id)))

    def list_users(self) -> List[str]:
        return list(self._keys.keys())

    def get_any_key(self) -> Optional[str]:
        if self._keys:
            return next(iter(self._keys.values()))
        return None


# Module singleton keystore
_keystore = AezaKeyStore()


def save_user_key(user_id: str, api_key: str) -> None:
    """Saves or updates the personal Aeza API key for the given user."""
    _keystore.set_key(user_id, api_key)


def get_user_key(user_id: str) -> Optional[str]:
    """Retrieves the Aeza API key associated with the user, if present."""
    return _keystore.get_key(user_id)


def delete_user_key(user_id: str) -> bool:
    """Removes the personal Aeza API key for the specified user."""
    return _keystore.delete_key(user_id)


def mask_api_key(key: Optional[str]) -> Optional[str]:
    """Returns a masked version of the key for secure UI presentation."""
    if not key:
        return None
    s = str(key).strip()
    if len(s) <= 8:
        return "***"
    return f"{s[:6]}...{s[-4:]}"


class AezaClient:
    """Client for Aeza Cloud REST API v2."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key or "").strip()
        self.base_url = AEZA_BASE_URL
        self._ssl_ctx = _get_ssl_context()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _request(self, endpoint: str, method: str = "GET", data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("Aeza API key is not configured. Please set your API key in Account settings.")

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


def get_aeza_client(user_id: Optional[str] = None, explicit_key: Optional[str] = None) -> AezaClient:
    """
    Returns an AezaClient configured for the specified user.
    Strictly isolates keys per user: if user_id is provided, only that user's key is used.
    """
    key = explicit_key
    if not key and user_id:
        key = get_user_key(user_id)
    elif not key and not user_id:
        key = os.environ.get("AEZA_API_KEY") or get_user_key("owner-user") or get_user_key("default_user")

    return AezaClient(api_key=key or "")


class _DynamicAezaClient(AezaClient):
    """Dynamic proxy for backward compatibility with code importing `aeza_client`."""

    def __init__(self):
        super().__init__(api_key="")

    def _get_active(self) -> AezaClient:
        return get_aeza_client()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._get_active(), name)


aeza_client = _DynamicAezaClient()

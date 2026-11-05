"""
Web Bot & Multi-Device Push Broadcast System for tTerm.

Features:
1. Multi-Device Push Broadcast: Delivers notifications to all connected user devices
   (MacBook, iPhone, Android, remote browsers) in real time via Server-Sent Events (SSE)
   and Web Push.
2. Watchdog for Long-Running Terminal Commands: Tracks running commands and marks completion
   with duration and exit code.
3. Webhook Integration: Dispatches webhook alerts for bots (Telegram, Slack, HTTP hooks).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from .models import (
    CommandCompletedDTO, DeviceRegistrationDTO,
    NotificationDTO, WatchedProcessDTO, WatchRequestDTO,
)
from .notifications import notification_hub

log = logging.getLogger("tterm.orchestration.notifications_bot")


class DeviceRegistry:
    """Tracks connected client devices for multi-device broadcast."""

    def __init__(self):
        # device_id -> DeviceRegistrationDTO
        self._devices: Dict[str, DeviceRegistrationDTO] = {}

    def register(
        self,
        device_id: str,
        name: str,
        user_id: str,
        push_subscription: Optional[Dict[str, Any]] = None,
    ) -> DeviceRegistrationDTO:
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        dev = DeviceRegistrationDTO(
            device_id=device_id,
            name=name or "Unknown Device",
            user_id=user_id or "default_user",
            push_subscription=push_subscription,
            last_seen=now_iso,
        )
        self._devices[device_id] = dev
        log.info("Registered device %s ('%s') for user %s", device_id, name, user_id)
        return dev

    def touch(self, device_id: str) -> None:
        if device_id in self._devices:
            self._devices[device_id].last_seen = datetime.now(timezone.utc).isoformat(timespec="seconds")

    def list_devices(self, user_id: Optional[str] = None) -> List[DeviceRegistrationDTO]:
        if user_id:
            return [d for d in self._devices.values() if d.user_id == user_id]
        return list(self._devices.values())

    def remove(self, device_id: str) -> bool:
        return self._devices.pop(device_id, None) is not None


class NotificationsBot:
    """
    Central Web-Bot and Multi-Device Push Broadcast Engine.
    Coordinates command watching, multi-device SSE event streams, and webhooks.
    """

    def __init__(self):
        self.devices = DeviceRegistry()
        # watch_id -> WatchedProcessDTO
        self._watches: Dict[str, WatchedProcessDTO] = {}
        # Active SSE subscriber queues
        self._subscribers: Set[asyncio.Queue] = set()

    # ------------------------------------------------ Device Management
    def register_device(
        self,
        device_id: str,
        name: str,
        user_id: str,
        push_subscription: Optional[Dict[str, Any]] = None,
    ) -> DeviceRegistrationDTO:
        return self.devices.register(device_id, name, user_id, push_subscription)

    def list_devices(self, user_id: Optional[str] = None) -> List[DeviceRegistrationDTO]:
        return self.devices.list_devices(user_id)

    # ------------------------------------------------ SSE Multi-Device Streaming
    def subscribe(self) -> asyncio.Queue:
        """Subscribes an active client connection to real-time notification events."""
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(queue)
        log.debug("New SSE subscriber added. Total subscribers: %d", len(self._subscribers))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Removes a disconnected client connection."""
        self._subscribers.discard(queue)
        log.debug("SSE subscriber removed. Total subscribers: %d", len(self._subscribers))

    def broadcast_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcasts a structured JSON event to all connected devices across browsers/mobiles."""
        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        for q in list(self._subscribers):
            try:
                q.put_nowait(message)
            except Exception as e:
                log.warning("Failed to queue event for subscriber: %s", e)

    # ------------------------------------------------ Long-Running Command Watchdog
    def watch_process(
        self,
        terminal_id: str,
        command: str,
        user_id: str = "default_user",
        block_id: Optional[str] = None,
        initiator_device_id: Optional[str] = None,
        webhook_url: Optional[str] = None,
    ) -> WatchedProcessDTO:
        """Subscribes a long-running process/command to completion notification."""
        watch_id = f"watch_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        watch = WatchedProcessDTO(
            id=watch_id,
            terminal_id=terminal_id,
            block_id=block_id,
            command=command,
            user_id=user_id,
            initiator_device_id=initiator_device_id,
            created_at=now_iso,
            status="running",
            webhook_url=webhook_url,
        )
        self._watches[watch_id] = watch
        log.info(
            "Watching command '%s' (block: %s, terminal: %s) for user %s [watch_id=%s]",
            command[:40], block_id, terminal_id, user_id, watch_id,
        )

        # Notify active clients immediately about the newly watched process
        self.broadcast_event(
            "watch_started",
            {
                "watch_id": watch_id,
                "terminal_id": terminal_id,
                "block_id": block_id,
                "command": command,
                "user_id": user_id,
                "initiator_device_id": initiator_device_id,
            },
        )
        return watch

    def unwatch_process(self, watch_id: str) -> bool:
        """Removes a watched process subscription."""
        removed = self._watches.pop(watch_id, None) is not None
        if removed:
            log.info("Unwatched process %s", watch_id)
        return removed

    def get_active_watches(
        self, user_id: Optional[str] = None, terminal_id: Optional[str] = None
    ) -> List[WatchedProcessDTO]:
        """Returns currently running watched processes."""
        watches = [w for w in self._watches.values() if w.status == "running"]
        if user_id:
            watches = [w for w in watches if w.user_id == user_id]
        if terminal_id:
            watches = [w for w in watches if w.terminal_id == terminal_id]
        return watches

    def get_watch_status(self, watch_id: str) -> Optional[WatchedProcessDTO]:
        return self._watches.get(watch_id)

    # ------------------------------------------------ Completion & Multi-Device Broadcast
    async def broadcast_command_completed(
        self,
        terminal_id: str,
        command: str,
        exit_code: int = 0,
        duration_sec: float = 0.0,
        block_id: Optional[str] = None,
        user_id: Optional[str] = None,
        initiator_device_id: Optional[str] = None,
    ) -> List[WatchedProcessDTO]:
        """
        Dispatches completion notification to ALL user devices (MacBook, iPhone, etc.),
        updates watched processes, dispatches in-app notification, and triggers webhooks.
        """
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        status = "completed" if exit_code == 0 else "failed"
        resolved_watches: List[WatchedProcessDTO] = []

        # Find matching watches by block_id or terminal_id + command
        for w in list(self._watches.values()):
            if w.status != "running":
                continue
            match = False
            if block_id and w.block_id == block_id:
                match = True
            elif w.terminal_id == terminal_id and (
                not w.command or not command or w.command.strip() == command.strip()
            ):
                match = True

            if match:
                w.status = status
                w.exit_code = exit_code
                w.duration_sec = round(duration_sec, 2)
                w.completed_at = now_iso
                resolved_watches.append(w)
                # Dispatch webhook if configured on the watch
                if w.webhook_url:
                    asyncio.create_task(self._send_webhook(w))

        target_user = user_id or (resolved_watches[0].user_id if resolved_watches else "default_user")

        # 1. Dispatch in-app notification to NotificationHub
        status_text = "успешно" if exit_code == 0 else f"с ошибкой (код {exit_code})"
        title = f"{'✅' if exit_code == 0 else '❌'} Процесс завершен: {command[:35]}"
        body = f"Команда '{command[:40]}' выполнена {status_text} за {duration_sec:.1f}с на терминале {terminal_id}"

        notification_hub.dispatch_notification(
            user_id=target_user,
            notification_type="command_finished",
            title=title,
            body=body,
            entity_id=terminal_id,
        )

        # 2. Multi-device Broadcast over SSE to all connected sessions (iPhone, MacBook, etc.)
        broadcast_payload = {
            "terminal_id": terminal_id,
            "block_id": block_id,
            "command": command,
            "exit_code": exit_code,
            "duration_sec": round(duration_sec, 2),
            "user_id": target_user,
            "initiator_device_id": initiator_device_id,
            "title": title,
            "body": body,
            "resolved_watches": [w.id for w in resolved_watches],
            "timestamp": now_iso,
        }

        self.broadcast_event("command_completed", broadcast_payload)
        log.info(
            "Broadcasted command completion '%s' (exit=%s, duration=%.1fs) to all %d connected clients",
            command[:30], exit_code, duration_sec, len(self._subscribers),
        )

        # 3. Multi-Device Push Alert via Telegram Bot (Independent of HTTP/HTTPS)
        try:
            tg_cfg = get_user_telegram_config(target_user)
            if tg_cfg.get("configured") and tg_cfg.get("enabled", True):
                tg_token = tg_cfg.get("bot_token")
                tg_chat = tg_cfg.get("chat_id")
                if tg_token and tg_chat:
                    meta = {
                        "command": command,
                        "duration": round(duration_sec, 2),
                        "node_name": terminal_id,
                        "exit_code": exit_code,
                    }
                    asyncio.create_task(
                        async_send_telegram_alert(
                            bot_token=tg_token,
                            chat_id=tg_chat,
                            title=title,
                            body=body,
                            metadata=meta,
                        )
                    )
        except Exception as tg_err:
            log.warning("Could not dispatch Telegram alert for %s: %s", target_user, tg_err)

        return resolved_watches

    async def _send_webhook(self, watch: WatchedProcessDTO) -> None:
        """Sends an external HTTP webhook (e.g. to a Telegram bot bridge or Slack)."""
        if not watch.webhook_url:
            return
        try:
            import urllib.request
            data = json.dumps(watch.model_dump()).encode("utf-8")
            req = urllib.request.Request(
                watch.webhook_url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            # Run in executor to not block async loop
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=5))
            log.info("Dispatched webhook for watch %s to %s", watch.id, watch.webhook_url)
        except Exception as e:
            log.warning("Failed to dispatch webhook for watch %s: %s", watch.id, e)


notifications_bot = NotificationsBot()


# ---------------------------------------------------------------------- Telegram Push Notification Bot
def send_telegram_alert(
    bot_token: str,
    chat_id: str,
    title: str,
    body: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Dispatches push notification to a user's Telegram chat via official Bot API:
    https://api.telegram.org/bot<token>/sendMessage

    Formats message cleanly:
    🔔 *tTerm: Завершена фоновая команда*
    💻 *Команда:* `{command}`
    ⏱ *Время:* {duration} сек.
    📍 *Нода:* {node_name}
    📊 *Код завершения:* {exit_code}
    """
    token = (bot_token or "").strip()
    target_chat = (str(chat_id) or "").strip()
    if not token or not target_chat:
        log.warning("Telegram notification aborted: bot_token or chat_id is missing")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"

    meta = metadata or {}
    command = meta.get("command")
    duration = meta.get("duration", meta.get("duration_sec", 0))
    node_name = meta.get("node_name", meta.get("node", meta.get("terminal_id", "tTerm Node")))
    exit_code = meta.get("exit_code", 0)

    if command is not None and str(command).strip():
        safe_cmd = str(command).strip().replace("`", "'")
        is_error = bool(exit_code != 0)
        icon = "❌" if is_error else "🔔"
        status_label = "Команда завершилась с ошибкой" if is_error else "Завершена фоновая команда"
        text = (
            f"{icon} *tTerm: {status_label}*\n"
            f"💻 *Команда:* `{safe_cmd}`\n"
            f"⏱ *Время:* {duration} сек.\n"
            f"📍 *Нода:* {node_name}\n"
            f"📊 *Код завершения:* {exit_code}"
        )
    else:
        text = f"🔔 *{title}*\n\n{body}" if title else body

    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                log.info("Telegram notification sent successfully to chat %s", target_chat)
                return True
    except urllib.error.HTTPError as he:
        # If Markdown entity parsing failed, retry plain text
        log.warning("Telegram HTTP %s error: trying plain text fallback", he.code)
        try:
            plain_text = text.replace("*", "").replace("`", "")
            payload["text"] = plain_text
            payload.pop("parse_mode", None)
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp2:
                if resp2.status == 200:
                    log.info("Telegram notification sent via plain text fallback to chat %s", target_chat)
                    return True
        except Exception as retry_err:
            log.error("Telegram plain text retry failed: %s", retry_err)
            return False
    except Exception as e:
        log.error("Failed to send Telegram alert: %s", e)
        return False

    return False


async def async_send_telegram_alert(
    bot_token: str,
    chat_id: str,
    title: str,
    body: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """Non-blocking async runner for send_telegram_alert."""
    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: send_telegram_alert(bot_token, chat_id, title, body, metadata)
        )
    except RuntimeError:
        return send_telegram_alert(bot_token, chat_id, title, body, metadata)


class TelegramBotStore:
    """Secure storage for user Telegram Bot credentials and chat IDs."""

    def __init__(self, filepath: Optional[str] = None):
        if filepath:
            self.filepath = filepath
        else:
            env_path = os.environ.get("TELEGRAM_BOT_FILE")
            if env_path:
                self.filepath = env_path
            else:
                base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                self.filepath = os.path.join(base_dir, ".user_telegram_bot.json")
        self._configs: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._configs = data
            except Exception as e:
                log.warning("Could not read Telegram bot configs from %s: %s", self.filepath, e)

        home_fallback = os.path.expanduser("~/.tterm_telegram_bot.json")
        if not self._configs and os.path.exists(home_fallback):
            try:
                with open(home_fallback, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._configs.update(data)
            except Exception:
                pass

    def _save(self) -> None:
        try:
            dirpath = os.path.dirname(self.filepath)
            if dirpath and not os.path.exists(dirpath):
                os.makedirs(dirpath, exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self._configs, f, indent=2, ensure_ascii=False)
        except Exception as e:
            log.warning("Could not save Telegram bot configs to %s: %s", self.filepath, e)

    def get_user_config(self, user_id: str) -> Dict[str, Any]:
        cfg = self._configs.get(user_id) or self._configs.get("default_user") or {}
        token = cfg.get("bot_token", "")
        chat_id = cfg.get("chat_id", "")
        enabled = cfg.get("enabled", True)

        # Check EncryptedUserVault if not in local memory/file
        if not token or not chat_id:
            try:
                from .encrypted_vault import encrypted_vault
                vault_secrets = encrypted_vault.load_secrets_sync(user_id)
                v_tok = vault_secrets.get("telegram_bot_token")
                v_chat = vault_secrets.get("telegram_chat_id")
                v_en = vault_secrets.get("telegram_enabled", True)
                if v_tok and v_chat:
                    token = str(v_tok).strip()
                    chat_id = str(v_chat).strip()
                    enabled = bool(v_en)
            except Exception:
                pass

        return {
            "configured": bool(token and chat_id),
            "enabled": bool(enabled),
            "chat_id": str(chat_id) if chat_id else "",
            "masked_token": mask_telegram_token(token),
            "bot_token": token,
            "user_id": user_id,
        }

    def save_user_config(
        self, user_id: str, bot_token: str, chat_id: str, enabled: bool = True
    ) -> Dict[str, Any]:
        cur = self._configs.get(user_id, {})
        new_token = bot_token.strip() if bot_token else cur.get("bot_token", "")
        new_chat = str(chat_id).strip() if chat_id else cur.get("chat_id", "")
        self._configs[user_id] = {
            "bot_token": new_token,
            "chat_id": new_chat,
            "enabled": enabled,
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        self._save()

        # Persist to EncryptedUserVault
        try:
            from .encrypted_vault import encrypted_vault
            encrypted_vault.save_secrets_sync(
                user_id,
                {
                    "telegram_bot_token": new_token,
                    "telegram_chat_id": new_chat,
                    "telegram_enabled": enabled,
                },
                merge=True,
            )
        except Exception as ve:
            log.debug("EncryptedUserVault sync note: %s", ve)

        return self.get_user_config(user_id)

    def delete_user_config(self, user_id: str) -> bool:
        deleted = False
        if user_id in self._configs:
            del self._configs[user_id]
            self._save()
            deleted = True
        try:
            from .encrypted_vault import encrypted_vault
            encrypted_vault.save_secrets_sync(
                user_id,
                {
                    "telegram_bot_token": "",
                    "telegram_chat_id": "",
                    "telegram_enabled": False,
                },
                merge=True,
            )
            deleted = True
        except Exception:
            pass
        return deleted


def mask_telegram_token(token: Optional[str]) -> str:
    if not token:
        return ""
    token_str = str(token).strip()
    if len(token_str) <= 10:
        return "••••••••"
    return f"{token_str[:6]}••••••••{token_str[-4:]}"


_telegram_store = TelegramBotStore()


def get_user_telegram_config(user_id: str) -> Dict[str, Any]:
    return _telegram_store.get_user_config(user_id)


def save_user_telegram_config(
    user_id: str, bot_token: str, chat_id: str, enabled: bool = True
) -> Dict[str, Any]:
    return _telegram_store.save_user_config(user_id, bot_token, chat_id, enabled)


def delete_user_telegram_config(user_id: str) -> bool:
    return _telegram_store.delete_user_config(user_id)


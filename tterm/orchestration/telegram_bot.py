"""
Unified Telegram Bot & Web App Orchestration Engine for tTerm.
Author & Architecture: Evgeniy Klimov (https://e-klimov.ru)
Based on tTerm open platform (GNU AGPLv3, Denis / https://tterm.net)

Features:
1. Full Telegram Bot Terminal Access:
   - Run bash/zsh commands directly from Telegram messages
   - Multi-machine switching (/use, /machines)
   - Dangerous command interception & confirmation (Approval Gate)
   - Real-time command output formatting with exit code & duration
2. Seamless Telegram Web App (Mini App) Integration:
   - 1-click persistent Web App Menu Button ("tTerm Web")
   - Cryptographic HMAC-SHA256 authentication of window.Telegram.WebApp.initData
   - Automatic zero-friction login inside Telegram client
3. Profile Binding & 1-Click Login:
   - Single-button account binding via /start bind_<token>
   - 1-click web session approval via /start auth_<session_token>
4. Centralized Multi-Device Push Notifications:
   - Approval Gate alerts with [ Разрешить ] [ Отклонить ] inline buttons
   - Command completion alerts, server status notices, and login codes
"""
from __future__ import annotations

import asyncio
import datetime as dt
from datetime import datetime, timezone
import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, List, Optional, Tuple

import asyncpg

try:
    import certifi
except ImportError:
    certifi = None

log = logging.getLogger("tterm.orchestration.telegram_bot")

DEFAULT_BOT_TOKEN = "9021265541:AAHZYpinnQE60ptrlL3INGvj4g-4oMY0AzY"
DEFAULT_BOT_USERNAME = "ttermnofbot"
DEFAULT_WEB_URL = "https://tterm.e-klimov.ru"

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
BOT_ICON_PATH = os.path.join(STATIC_DIR, "bot-icon.png")
BOT_PREVIEW_PATH = os.path.join(STATIC_DIR, "bot-preview.png")

# Multilingual dictionary (Strictly no '&' in Russian; always 'и')
I18N = {
    "ru": {
        "title_bot": "tTerm | Терминалы и ИИ-хаб",
        "title_machines": "Ваши машины",
        "btn_terminal": "+ Терминал",
        "btn_rename": "Переименовать",
        "btn_access": "Доступ",
        "btn_remove": "Удалить",
        "btn_add_machine": "+ Добавить машину",
        "btn_webapp": "tTerm",
        "btn_help": "Помощь",
        "btn_machines": "Выбрать машину",
        "btn_admin": "Панель администратора",
        "server_suffix": " (Сервер)",
        "offline": "не в сети",
        "online": "в сети",
        "active": "активна",
        "no_machines_title": "🖥 <b>Ваши машины</b>",
        "no_machines_desc": "К вашему аккаунту пока не подключено ни одной машины.\nОткройте tTerm или нажмите кнопку ниже, чтобы подключить сервер или компьютер.",
        "admin_title": "📊 <b>Панель управления tTerm | Администратор</b>",
        "admin_owner": "Владелец: <b>Евгений Климов</b> (@eklimov)",
        "admin_server_info": "🟢 <b>Автономный сервер tTerm (82.148.241.254)</b>\n<i>Все данные пользователей хранятся строго в локальной БД.</i>",
        "admin_users": "👥 <b>Зарегистрированные пользователи</b>",
        "admin_machines": "🖥 <b>Подключенные машины</b>",
        "admin_del_reqs": "⚠️ <b>Запросы на удаление аккаунтов</b>",
        "admin_no_del": "<i>Нет активных запросов на удаление. Все данные изолированы на вашем сервере.</i>",
        "btn_refresh": "🔄 Обновить",
        "btn_approve": "✅ Одобрить",
        "btn_reject": "❌ Отклонить",
        "add_server_title": "Подключить сервер",
        "add_server_desc": "Выполните команду на сервере под пользователем root:",
        "add_pc_title": "Подключить компьютер",
        "add_pc_desc": "Выполните команду на компьютере (без sudo):",
        "btn_back": "« Назад к машинам",
        "help_text": (
            "📖 <b>Команды tTerm:</b>\n\n"
            "• <b>/use</b> — список машин и активных окон\n"
            "• <b>/machines</b> — переключение активной машины\n"
            "• <b>/email &lt;почта&gt;</b> — привязать электронную почту\n"
            "• <b>/avatar</b> — аватар и логотип бота tTerm\n"
            "• <b>/app</b> — открыть tTerm Web App\n"
            "• Отправляйте shell-команды прямо в чат для исполнения на активной машине."
        ),
    },
    "en": {
        "title_bot": "tTerm | Terminals and AI Hub",
        "title_machines": "Your machines",
        "btn_terminal": "+ Terminal",
        "btn_rename": "Rename",
        "btn_access": "Access",
        "btn_remove": "Remove",
        "btn_add_machine": "+ Add a machine",
        "btn_webapp": "tTerm",
        "btn_help": "Help",
        "btn_machines": "Select machine",
        "btn_admin": "Admin Dashboard",
        "server_suffix": " (Server)",
        "offline": "offline",
        "online": "online",
        "active": "active",
        "no_machines_title": "🖥 <b>Your machines</b>",
        "no_machines_desc": "No machines connected to your account yet.\nOpen tTerm or tap below to connect a server or computer.",
        "admin_title": "📊 <b>tTerm Management Panel | Administrator</b>",
        "admin_owner": "Owner: <b>Evgeniy Klimov</b> (@eklimov)",
        "admin_server_info": "🟢 <b>Autonomous tTerm Server (82.148.241.254)</b>\n<i>All user data is stored strictly in the local database.</i>",
        "admin_users": "👥 <b>Registered Users</b>",
        "admin_machines": "🖥 <b>Connected Machines</b>",
        "admin_del_reqs": "⚠️ <b>Account Deletion Requests</b>",
        "admin_no_del": "<i>No active deletion requests. All data is securely isolated.</i>",
        "btn_refresh": "🔄 Refresh",
        "btn_approve": "✅ Approve",
        "btn_reject": "❌ Reject",
        "add_server_title": "Connect a server",
        "add_server_desc": "Run this command on your server as root:",
        "add_pc_title": "Connect a computer",
        "add_pc_desc": "Run this command on your computer (no sudo):",
        "btn_back": "« Back to machines",
        "help_text": (
            "📖 <b>tTerm Commands:</b>\n\n"
            "• <b>/use</b> — machines and active terminals\n"
            "• <b>/machines</b> — switch active machine\n"
            "• <b>/email &lt;address&gt;</b> — link your email address\n"
            "• <b>/avatar</b> — download tTerm logo and avatar\n"
            "• <b>/app</b> — open tTerm Web App\n"
            "• Send shell commands directly into this chat to run them on the active machine."
        ),
    }
}

# Danger patterns for commands run via chat
DANGER_PATTERNS = [
    (r"\brm\s+-[rfRF]{1,4}\s+[/~]", "удаление корневых или пользовательских файлов"),
    (r"\bmkfs\b", "форматирование дискового накопителя"),
    (r"\bdd\s+if=", "прямая перезапись диска"),
    (r"\bshutdown\b|\breboot\b|\binit\s+0\b", "перезагрузка или выключение машины"),
    (r"\bDROP\s+(DATABASE|TABLE)\b", "удаление базы данных или таблиц"),
]


def _parse_uuid(val: Any) -> Optional[uuid.UUID]:
    """Safely extracts UUID from UUID objects, Sessions, Persons, or string representations."""
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return val
    if hasattr(val, "person") and hasattr(val.person, "id"):
        p_id = val.person.id
        return p_id if isinstance(p_id, uuid.UUID) else _parse_uuid(p_id)
    if hasattr(val, "id"):
        v_id = val.id
        return v_id if isinstance(v_id, uuid.UUID) else _parse_uuid(v_id)
    if isinstance(val, str):
        val = val.strip()
        match = re.search(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", val)
        if match:
            try:
                return uuid.UUID(match.group(1))
            except Exception:
                pass
        try:
            return uuid.UUID(val)
        except Exception:
            pass
    return None


def validate_webapp_init_data(init_data: str, bot_token: str) -> Optional[Dict[str, Any]]:
    """
    Validates Telegram WebApp initData according to official Telegram documentation:
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
    """
    if not init_data or not bot_token:
        return None

    try:
        parsed = urllib.parse.parse_qs(init_data, keep_blank_values=True)
        if "hash" not in parsed:
            return None
        received_hash = parsed["hash"][0]

        data_check_list = []
        for k in sorted(parsed.keys()):
            if k != "hash":
                data_check_list.append(f"{k}={parsed[k][0]}")
        data_check_string = "\n".join(data_check_list)

        # secret_key = HMAC_SHA256("WebAppData", bot_token)
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
        calc_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calc_hash.lower(), received_hash.lower()):
            log.warning("Telegram WebApp hash mismatch: expected %s, got %s", calc_hash, received_hash)
            return None

        # Check auth_date expiration (allow up to 7 days)
        auth_date = int(parsed.get("auth_date", [0])[0])
        if auth_date and abs(time.time() - auth_date) > 7 * 86400:
            log.warning("Telegram WebApp initData expired (auth_date: %s)", auth_date)
            return None

        user_raw = parsed.get("user", [None])[0]
        user_obj = json.loads(user_raw) if user_raw else {}
        return user_obj
    except Exception as exc:
        log.warning("Telegram WebApp validation error: %s", exc)
        return None


class TelegramBotManager:
    """Singleton manager controlling the Telegram bot loop, notifications, and terminal dispatch."""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.terminals: Any = None
        self.agents: Any = None
        self.web_url: str = DEFAULT_WEB_URL

        self._bot_token: Optional[str] = None
        self._bot_username: Optional[str] = None
        self._bot_id: Optional[int] = None
        self._bot_first_name: Optional[str] = None

        self._polling_task: Optional[asyncio.Task] = None
        self._running: bool = False

        # chat_id -> active machine_id (UUID str)
        self._user_active_machines: Dict[str, str] = {}
        self._pending_rename: Dict[str, str] = {}
        # bind_token -> { "user_id": str, "expires_at": float }
        self._pending_binds: Dict[str, Dict[str, Any]] = {}
        # chat_id -> { "command": str, "machine_id": str, "expires_at": float }
        self._pending_danger: Dict[str, Dict[str, Any]] = {}
        # session_token -> { "approved": bool, "chat_id": str, ... }
        self._pending_auth_sessions: Dict[str, Dict[str, Any]] = {}
        # chat_id -> { "email": str, "code": str, "expires_at": float }
        self._pending_email_confirms: Dict[str, Dict[str, Any]] = {}
        # chat_id -> { "action": "name"|"email", "target_id": str, "page": int, "msg_id": Optional[int] }
        self._pending_user_edit: Dict[str, Dict[str, Any]] = {}

    def get_token(self) -> str:
        if self._bot_token:
            return self._bot_token
        token = os.environ.get("TTERM_TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN")
        if token:
            self._bot_token = token
            return token
        return DEFAULT_BOT_TOKEN

    def set_token(self, token: str) -> None:
        self._bot_token = token
        os.environ["TTERM_TELEGRAM_BOT_TOKEN"] = token
        os.environ["TELEGRAM_BOT_TOKEN"] = token
        self._bot_username = None

    def _get_lang(self, user_row: Optional[Dict[str, Any]] = None, from_user: Optional[Dict[str, Any]] = None) -> str:
        if user_row and user_row.get("language"):
            code = str(user_row["language"]).lower()
            return "ru" if code.startswith("ru") else "en"
        if user_row and (user_row.get("email") == "eklimov84@xmail.ru" or str(user_row.get("telegram_chat_id")) == "55570186"):
            return "ru"
        if from_user and from_user.get("language_code"):
            code = str(from_user["language_code"]).lower()
            if any(code.startswith(prefix) for prefix in ("ru", "be", "uk", "kk")):
                return "ru"
            if code.startswith("en"):
                return "en"
        return "ru"

    @property
    def bot_username(self) -> str:
        return self._bot_username or os.environ.get("TELEGRAM_BOT_NAME") or DEFAULT_BOT_USERNAME

    @property
    def bot_link(self) -> str:
        return f"https://t.me/{self.bot_username}"

    # ------------------------------------------------------------- Bot API
    async def call_api(self, method: str, payload: Optional[Dict[str, Any]] = None, timeout: float = 15.0) -> Dict[str, Any]:
        token = self.get_token()
        if not token:
            return {"ok": False, "description": "No bot token configured"}

        url = f"https://api.telegram.org/bot{token}/{method}"
        headers = {"Content-Type": "application/json", "User-Agent": "tTerm-Telegram-Hub/2.0"}
        data = json.dumps(payload or {}).encode("utf-8") if payload is not None else None

        req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
        ctx = ssl.create_default_context()
        if certifi:
            ctx.load_verify_locations(cafile=certifi.where())

        def _do_request():
            try:
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as he:
                body = he.read().decode("utf-8", "replace")
                log.warning("Telegram API HTTP %s for %s: %s", he.code, method, body)
                try:
                    return json.loads(body)
                except Exception:
                    return {"ok": False, "error_code": he.code, "description": body}
            except Exception as ex:
                log.warning("Telegram API request error for %s: %s", method, ex)
                return {"ok": False, "description": str(ex)}

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _do_request)

    async def init_bot_profile(self) -> bool:
        """Queries getMe and configures persistent Web App menu button."""
        res = await self.call_api("getMe")
        if not res.get("ok"):
            log.warning("Could not initialize Telegram bot profile: %s", res)
            return False

        result = res.get("result", {})
        self._bot_id = result.get("id")
        self._bot_username = result.get("username", "").lstrip("@")
        self._bot_first_name = result.get("first_name", "tTerm")
        os.environ["TELEGRAM_BOT_NAME"] = self._bot_username

        log.info("Initialized Telegram Bot: @%s (%s, ID: %s)", self._bot_username, self._bot_first_name, self._bot_id)

        # Set persistent Web App Chat Menu Button (Strictly 'tTerm' without rocket/words)
        try:
            menu_btn_res = await self.call_api("setChatMenuButton", {
                "menu_button": {
                    "type": "web_app",
                    "text": "tTerm",
                    "web_app": {
                        "url": self.web_url
                    }
                }
            })
            log.info("Telegram WebApp Menu Button configured: %s", menu_btn_res.get("ok"))
        except Exception as e:
            log.warning("Failed to configure Telegram WebApp Menu Button: %s", e)

        # Configure official Bot commands
        try:
            await self.call_api("setMyCommands", {
                "commands": [
                    {"command": "start", "description": "Запустить бота и проверить статус"},
                    {"command": "app", "description": "Открыть tTerm"},
                    {"command": "use", "description": "Список машин и терминалов"},
                    {"command": "machines", "description": "Выбор активной машины"},
                    {"command": "admin", "description": "Панель администратора (только владелец)"},
                    {"command": "users", "description": "Список зарегистрированных пользователей"},
                    {"command": "stats", "description": "Статистика и метрики серверов"},
                    {"command": "email", "description": "Привязать email: /email <почта>"},
                    {"command": "avatar", "description": "Скачать официальный логотип tTerm"},
                    {"command": "help", "description": "Справка и команды"},
                ]
            })
            await self.call_api("setMyDescription", {
                "description": "tTerm — веб-терминал и оркестрация ИИ-ассистентов для управления серверами и Docker-контейнерами. Разработка и инфраструктура: Евгений Климов (@eklimov)."
            })
            await self.call_api("setMyShortDescription", {
                "short_description": "Веб-терминал и оркестрация ИИ в Telegram."
            })
        except Exception as e_cmd:
            log.debug("Could not set bot commands or descriptions: %s", e_cmd)

        return True

    # ------------------------------------------------------------- Messaging
    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        reply_markup: Optional[Dict[str, Any]] = None,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
    ) -> Dict[str, Any]:
        payload = {
            "chat_id": str(chat_id),
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        res = await self.call_api("sendMessage", payload)
        if not res.get("ok") and parse_mode == "HTML":
            # Retry plain text if HTML tags were unclosed
            payload.pop("parse_mode", None)
            res = await self.call_api("sendMessage", payload)
        return res

    async def edit_message(
        self,
        chat_id: str | int,
        message_id: int,
        text: str,
        reply_markup: Optional[Dict[str, Any]] = None,
        parse_mode: str = "HTML",
    ) -> bool:
        payload = {
            "chat_id": str(chat_id),
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        res = await self.call_api("editMessageText", payload)
        return bool(res.get("ok"))

    async def answer_callback(self, callback_query_id: str, text: str = "", show_alert: bool = False) -> None:
        await self.call_api("answerCallbackQuery", {
            "callback_query_id": callback_query_id,
            "text": text,
            "show_alert": show_alert,
        })

    async def send_rich_message(self, chat_id: str | int, rich_message: Dict[str, Any]) -> Dict[str, Any]:
        return await self.call_api("sendRichMessage", {
            "chat_id": str(chat_id),
            "rich_message": rich_message,
        })

    async def edit_rich_message(self, chat_id: str | int, message_id: int, rich_message: Dict[str, Any]) -> bool:
        res = await self.call_api("editMessageText", {
            "chat_id": str(chat_id),
            "message_id": message_id,
            "rich_message": rich_message,
        })
        return bool(res.get("ok"))

    async def send_photo_file(
        self,
        chat_id: str | int,
        file_path: str,
        caption: str = "",
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        token = self.get_token()
        if not token:
            return {"ok": False, "description": "No bot token configured"}
        if not os.path.exists(file_path):
            return {"ok": False, "description": f"File not found: {file_path}"}

        url = f"https://api.telegram.org/bot{token}/sendPhoto"

        def _do_upload():
            boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
            with open(file_path, "rb") as f:
                file_bytes = f.read()

            parts = []
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat_id}\r\n".encode("utf-8"))
            if caption:
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n".encode("utf-8"))
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"parse_mode\"\r\n\r\nHTML\r\n".encode("utf-8"))
            if reply_markup:
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"reply_markup\"\r\n\r\n{json.dumps(reply_markup)}\r\n".encode("utf-8"))

            fname = os.path.basename(file_path)
            mime = "image/png" if fname.endswith(".png") else "image/jpeg"
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"{fname}\"\r\nContent-Type: {mime}\r\n\r\n".encode("utf-8"))
            parts.append(file_bytes)
            parts.append(b"\r\n")
            parts.append(f"--{boundary}--\r\n".encode("utf-8"))

            body = b"".join(parts)
            req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
            ctx = ssl.create_default_context()
            if certifi:
                ctx.load_verify_locations(cafile=certifi.where())
            with urllib.request.urlopen(req, timeout=25.0, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8"))

        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(None, _do_upload)
        except Exception as e:
            log.warning("send_photo_file error: %s", e)
            return {"ok": False, "description": str(e)}

    async def send_document_file(
        self,
        chat_id: str | int,
        filename: str,
        content: str | bytes,
        caption: str = "",
    ) -> Dict[str, Any]:
        token = self.get_token()
        if not token:
            return {"ok": False, "description": "No bot token configured"}
        url = f"https://api.telegram.org/bot{token}/sendDocument"

        def _do_upload():
            boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
            file_bytes = content.encode("utf-8") if isinstance(content, str) else content

            parts = []
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{chat_id}\r\n".encode("utf-8"))
            if caption:
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n".encode("utf-8"))
                parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"parse_mode\"\r\n\r\nHTML\r\n".encode("utf-8"))

            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{filename}\"\r\nContent-Type: text/plain\r\n\r\n".encode("utf-8"))
            parts.append(file_bytes)
            parts.append(b"\r\n")
            parts.append(f"--{boundary}--\r\n".encode("utf-8"))

            body = b"".join(parts)
            req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
            ctx = ssl.create_default_context()
            if certifi:
                ctx.load_verify_locations(cafile=certifi.where())
            with urllib.request.urlopen(req, timeout=25.0, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8"))

        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(None, _do_upload)
        except Exception as e:
            log.warning("send_document_file error: %s", e)
            return {"ok": False, "description": str(e)}

    # ------------------------------------------------------------- Lifecycle
    def start(self, pool: asyncpg.Pool, terminals: Any = None, agents: Any = None, web_url: str = DEFAULT_WEB_URL) -> None:
        self.pool = pool
        self.terminals = terminals
        self.agents = agents
        self.web_url = web_url or DEFAULT_WEB_URL
        self._running = True

        if self._polling_task is None or self._polling_task.done():
            loop = asyncio.get_event_loop()
            self._polling_task = loop.create_task(self._poll_loop())
            log.info("Telegram Bot service started for %s", self.web_url)

    def stop(self) -> None:
        self._running = False
        if self._polling_task and not self._polling_task.done():
            self._polling_task.cancel()
        log.info("Telegram Bot service stopped.")

    # ------------------------------------------------------------- Binding
    def register_pending_bind(self, user_id: Any) -> Tuple[str, str]:
        uid = _parse_uuid(user_id)
        token = f"bind_{secrets.token_urlsafe(16)}"
        self._pending_binds[token] = {
            "user_id": str(uid) if uid else str(user_id),
            "expires_at": time.time() + 7200,  # 2 hours
            "consumed": False,
        }
        if self.pool and uid:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._persist_bind_token(token, uid))
            except Exception as e_p:
                log.debug("Could not schedule bind token persistence: %s", e_p)
        return token, f"https://t.me/{self.bot_username}?start={token}"

    async def _persist_bind_token(self, token: str, user_id: uuid.UUID) -> None:
        if not self.pool:
            return
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO telegram_bind_tokens (token, user_id, expires_at)
                    VALUES ($1, $2, now() + interval '2 hours')
                    ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at, consumed = false
                    """,
                    token, user_id
                )
        except Exception as e:
            log.debug("DB bind token persistence error: %s", e)

    def register_pending_auth_session(self) -> Tuple[str, str]:
        session_token = secrets.token_urlsafe(24)
        self._pending_auth_sessions[session_token] = {
            "approved": False,
            "created_at": time.time(),
        }
        link = f"https://t.me/{self.bot_username}?start=auth_{session_token}"
        return session_token, link

    def check_auth_session(self, session_token: str) -> Optional[Dict[str, Any]]:
        record = self._pending_auth_sessions.get(session_token)
        if not record:
            return None
        if record.get("approved"):
            return record
        return None

    async def get_user_by_telegram(self, chat_id: str) -> Optional[asyncpg.Record]:
        if not self.pool:
            return None
        async with self.pool.acquire() as conn:
            # 1. Check users by telegram_chat_id
            row = await conn.fetchrow(
                "SELECT id, name, email, is_local_owner, plan_id, telegram_chat_id, telegram_username "
                "FROM users WHERE telegram_chat_id = $1", str(chat_id)
            )
            if row:
                return row
            # 2. Check sign_in_methods table
            m_row = await conn.fetchrow(
                "SELECT u.id, u.name, u.email, u.is_local_owner, u.plan_id, u.telegram_chat_id, u.telegram_username "
                "FROM sign_in_methods s JOIN users u ON u.id = s.user_id "
                "WHERE s.kind = 'telegram' AND s.subject = $1", str(chat_id)
            )
            if m_row:
                await conn.execute("UPDATE users SET telegram_chat_id = $1 WHERE id = $2", str(chat_id), m_row["id"])
                return m_row
            # 3. Check owner chat ID from environment or Evgeniy Klimov known ID
            owner_chat = os.environ.get("TTERM_TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID")
            if (owner_chat and str(chat_id) == str(owner_chat)) or str(chat_id) == "55570186":
                owner = await conn.fetchrow(
                    "SELECT id, name, email, is_local_owner, plan_id, telegram_chat_id, telegram_username "
                    "FROM users WHERE lower(email) IN ('eklimov84@xmail.ru', 'eklimov84@gmail.com', 'klimov@e-klimov.ru') "
                    "ORDER BY (lower(email) = 'eklimov84@xmail.ru') DESC, created_at ASC LIMIT 1"
                )
                if owner:
                    await conn.execute(
                        "UPDATE users SET telegram_chat_id = $1, telegram_username = COALESCE(telegram_username, 'eklimov') WHERE id = $2",
                        str(chat_id), owner["id"]
                    )
                    return await conn.fetchrow(
                        "SELECT id, name, email, is_local_owner, plan_id, telegram_chat_id, telegram_username "
                        "FROM users WHERE id = $1", owner["id"]
                    )
        return None

    async def bind_user_telegram(self, user_id: Any, chat_id: str | int, username: str = "") -> Optional[Dict[str, Any]]:
        """Binds Telegram profile to a user account, merging temporary/dummy accounts if needed."""
        if not self.pool:
            return None
        uid = _parse_uuid(user_id)
        if not uid:
            log.warning("bind_user_telegram received invalid user_id: %r", user_id)
            return None

        chat_str = str(chat_id)
        clean_uname = username.lstrip("@").strip() if username else None

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # 1. Check if there was an orphan dummy user or other record with this chat_id
                old_users = await conn.fetch(
                    "SELECT id, email, name FROM users WHERE telegram_chat_id = $1 AND id != $2",
                    chat_str, uid
                )
                for old_u in old_users:
                    old_id = old_u["id"]
                    old_email = old_u["email"] or ""
                    # If this was an auto-created dummy telegram user
                    if old_email.startswith("tg_") and old_email.endswith("@telegram.tterm.net"):
                        # Reassign any projects & machine memberships to the primary user
                        await conn.execute("UPDATE projects SET owner_id = $1 WHERE owner_id = $2", uid, old_id)
                        await conn.execute("UPDATE project_members SET user_id = $1 WHERE user_id = $2", uid, old_id)
                        # Delete the orphan dummy user
                        await conn.execute("DELETE FROM users WHERE id = $1", old_id)
                        log.info("Merged dummy user %s into primary user %s", old_id, uid)
                    else:
                        # Clear telegram_chat_id on any other account to avoid duplicate bindings
                        await conn.execute(
                            "UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = $1",
                            old_id
                        )

                # 2. Update target user
                await conn.execute(
                    "UPDATE users SET telegram_chat_id = $1, telegram_username = COALESCE($2, telegram_username) WHERE id = $3",
                    chat_str, clean_uname, uid
                )

                # 3. Record in sign_in_methods
                await conn.execute("DELETE FROM sign_in_methods WHERE kind = 'telegram' AND subject = $1", chat_str)
                await conn.execute(
                    """
                    INSERT INTO sign_in_methods (user_id, kind, subject)
                    VALUES ($1, 'telegram', $2)
                    ON CONFLICT DO NOTHING
                    """,
                    uid, chat_str
                )

                # Return bound user info
                record = await conn.fetchrow(
                    "SELECT id, name, email, plan_id, telegram_chat_id, telegram_username FROM users WHERE id = $1",
                    uid
                )
                log.info("Bound user %s to Telegram chat %s (@%s)", uid, chat_str, clean_uname)
                return dict(record) if record else {"id": uid}

    async def unbind_user_telegram(self, user_id: Any) -> bool:
        if not self.pool:
            return False
        uid = _parse_uuid(user_id)
        if not uid:
            return False
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Find current telegram_chat_id to clean sign_in_methods
                row = await conn.fetchrow("SELECT telegram_chat_id FROM users WHERE id = $1", uid)
                if row and row["telegram_chat_id"]:
                    await conn.execute(
                        "DELETE FROM sign_in_methods WHERE kind = 'telegram' AND subject = $1",
                        row["telegram_chat_id"]
                    )
                await conn.execute(
                    "UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = $1", uid
                )
        log.info("Unbound Telegram from user %s", uid)
        return True

    # ------------------------------------------------------------- Machines
    async def list_user_machines(self, user_id: uuid.UUID) -> List[Dict[str, Any]]:
        if not self.pool:
            return []
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT m.id, m.name, m.kind, m.host, m.port, m.passport, m.last_seen_at
                FROM machines m
                JOIN projects p ON p.id = m.project_id
                LEFT JOIN project_members pm ON pm.project_id = p.id
                WHERE m.removed_at IS NULL AND (p.owner_id = $1 OR pm.user_id = $1)
                ORDER BY m.name
                """, user_id
            )
            result = []
            for r in rows:
                m_id = str(r["id"])
                # Check online via connected agent or recently seen
                online = False
                if self.agents and hasattr(self.agents, "get"):
                    online = self.agents.get(r["id"]) is not None
                if not online and r["kind"] == "server":
                    online = True
                result.append({
                    "id": m_id,
                    "name": r["name"],
                    "kind": r["kind"],
                    "host": r["host"],
                    "port": r["port"],
                    "online": online,
                    "last_seen_at": r["last_seen_at"],
                })
            return result

    # ------------------------------------------------------------- Command Execution
    async def execute_command(
        self,
        user_row: asyncpg.Record,
        machine_id: str,
        command: str,
        timeout: float = 35.0,
    ) -> Dict[str, Any]:
        """Runs command on target machine using tTerm's core terminal infrastructure."""
        start_t = time.time()
        uid = user_row["id"]

        # Check if terminals manager is available
        if not self.terminals or not self.pool:
            return {
                "ok": False,
                "error": "Система терминалов инициализируется, повторите через несколько секунд.",
                "duration": 0,
            }

        try:
            m_uuid = uuid.UUID(machine_id)
        except ValueError:
            return {"ok": False, "error": f"Неверный ID машины: {machine_id}", "duration": 0}

        # Find machine name
        machine_name = machine_id
        async with self.pool.acquire() as conn:
            m_row = await conn.fetchrow("SELECT name FROM machines WHERE id = $1", m_uuid)
            if m_row:
                machine_name = m_row["name"]

        # Check if user already has an active open terminal on this machine
        open_term = None
        if hasattr(self.terminals, "_live"):
            for t in self.terminals._live.values():
                if getattr(t, "machine_id", None) == m_uuid and getattr(t, "state", "") == "open":
                    if getattr(getattr(t, "person", None), "id", None) == uid:
                        open_term = t
                        break

        # If no open terminal, open a fresh one
        if open_term is None:
            try:
                from ..core import accounts
                person = await accounts.person(self.pool, uid)
                open_term = await self.terminals.open(person, m_uuid, cols=80, rows=24)
                for _ in range(40):
                    if getattr(open_term, "state", "") == "open":
                        break
                    await asyncio.sleep(0.1)
            except Exception as e_open:
                return {
                    "ok": False,
                    "error": f"Не удалось открыть терминал на {machine_name}: {e_open}",
                    "duration": round(time.time() - start_t, 2),
                }

        # Set next author metadata
        if hasattr(open_term, "set_next_author"):
            open_term.set_next_author({
                "name": f"Telegram (@{user_row.get('telegram_username') or user_row['name']})",
                "kind": "telegram",
            })

        # Run command
        err = open_term.run(command)
        if err:
            return {
                "ok": False,
                "error": f"Ошибка запуска команды: {err}",
                "duration": round(time.time() - start_t, 2),
            }

        # Wait for block completion
        last_out = ""
        exit_code = 0
        timed_out = False

        while getattr(open_term, "_block", None) is not None:
            if time.time() - start_t > timeout:
                timed_out = True
                open_term.write(b"\x03")  # Send SIGINT
                break
            await asyncio.sleep(0.15)

        duration = round(time.time() - start_t, 2)

        # Retrieve saved output block from database or recent history
        async with self.pool.acquire() as conn:
            b_row = await conn.fetchrow(
                "SELECT command, exit_code, output, duration FROM blocks WHERE terminal_id = $1 ORDER BY seq DESC LIMIT 1",
                open_term.id
            )
            if b_row:
                exit_code = b_row["exit_code"] if b_row["exit_code"] is not None else (130 if timed_out else 0)
                raw_out = b_row["output"]
                if isinstance(raw_out, bytes):
                    last_out = raw_out.decode("utf-8", "replace")
                elif isinstance(raw_out, str):
                    last_out = raw_out

        if timed_out and not last_out:
            last_out = f"[Таймаут выполнения {timeout}с: отправлен сигнал прерывания Ctrl+C]"

        return {
            "ok": True,
            "machine": machine_name,
            "machine_id": machine_id,
            "command": command,
            "output": last_out.strip(),
            "exit_code": exit_code,
            "duration": duration,
            "timed_out": timed_out,
        }

    # ------------------------------------------------------------- Polling Loop
    async def _poll_loop(self) -> None:
        token = self.get_token()
        if not token:
            log.warning("Telegram Bot cannot start: no token provided.")
            return

        await self.init_bot_profile()

        offset = 0
        log.info("Telegram Bot polling loop listening as @%s...", self.bot_username)

        while self._running:
            try:
                updates_res = await self.call_api("getUpdates", {"offset": offset, "timeout": 20}, timeout=25.0)
                if not updates_res.get("ok"):
                    await asyncio.sleep(4)
                    continue

                for update in updates_res.get("result", []):
                    offset = max(offset, update["update_id"] + 1)
                    try:
                        if "message" in update:
                            await self._handle_message(update["message"])
                        elif "callback_query" in update:
                            await self._handle_callback(update["callback_query"])
                    except Exception as handler_err:
                        log.exception("Error processing Telegram update: %s", handler_err)

            except asyncio.CancelledError:
                break
            except Exception as loop_err:
                log.warning("Telegram polling iteration error: %s (retrying in 3s)", loop_err)
                await asyncio.sleep(3)

    # ------------------------------------------------------------- Handler: Message
    async def _handle_message(self, message: Dict[str, Any]) -> None:
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        chat_id = str(chat.get("id"))
        username = (from_user.get("username") or "").strip()
        first_name = from_user.get("first_name") or "Пользователь"
        text = (message.get("text") or "").strip()

        if not text:
            return

        is_owner = (str(chat_id) == "55570186" or (username and username.lower() in ("eklimov", "eklimov84")))
        user_row = await self.get_user_by_telegram(chat_id)
        if is_owner and (not user_row or user_row.get("email") != "eklimov84@xmail.ru"):
            if self.pool:
                try:
                    async with self.pool.acquire() as conn:
                        row = await conn.fetchrow("SELECT id, name, email FROM users WHERE email = 'eklimov84@xmail.ru'")
                        if row:
                            bound = await self.bind_user_telegram(row["id"], chat_id, username or "eklimov")
                            if bound:
                                user_row = bound
                except Exception as e_ow:
                    log.debug("Auto-bind owner error: %s", e_ow)

        lang = self._get_lang(user_row, from_user)
        t = I18N.get(lang, I18N["ru"])

        # Pending admin user profile editing
        if chat_id in self._pending_user_edit and is_owner:
            edit_info = self._pending_user_edit.pop(chat_id)
            target_uuid = _parse_uuid(edit_info.get("target_id"))
            page = edit_info.get("page", 0)
            if text.strip().lower() == "/cancel":
                await self.send_message(chat_id, "❌ Редактирование отменено.")
                if target_uuid:
                    await self._show_admin_user_card(chat_id, str(target_uuid), page=page)
                return

            action = edit_info.get("action")
            if action == "name":
                new_name = text.strip()
                if 1 <= len(new_name) <= 200 and self.pool and target_uuid:
                    try:
                        async with self.pool.acquire() as conn:
                            await conn.execute("UPDATE users SET name = $1 WHERE id = $2", new_name, target_uuid)
                        await self.send_message(chat_id, f"✅ Имя пользователя изменено на: <b>{html.escape(new_name)}</b>")
                    except Exception as e_un:
                        await self.send_message(chat_id, f"❌ Ошибка обновления имени: {e_un}")
                else:
                    await self.send_message(chat_id, "❌ Некорректная длина имени (от 1 до 200 символов).")
            elif action == "email":
                new_email = text.strip().lower()
                if "@" in new_email and "." in new_email and self.pool and target_uuid:
                    try:
                        async with self.pool.acquire() as conn:
                            await conn.execute("UPDATE users SET email = $1 WHERE id = $2", new_email, target_uuid)
                        await self.send_message(chat_id, f"✅ Email пользователя изменен на: <b>{html.escape(new_email)}</b>")
                    except Exception as e_em:
                        await self.send_message(chat_id, f"❌ Ошибка обновления Email: {e_em}")
                else:
                    await self.send_message(chat_id, "❌ Некорректный формат email адреса.")

            if target_uuid:
                await self._show_admin_user_card(chat_id, str(target_uuid), page=page)
            return

        # Check blocked user status (unless owner)
        if user_row and not is_owner:
            if user_row.get("is_blocked"):
                blocked_until = user_row.get("blocked_until")
                now_dt = datetime.now(timezone.utc)
                if blocked_until and blocked_until < now_dt:
                    if self.pool:
                        try:
                            async with self.pool.acquire() as conn:
                                await conn.execute("UPDATE users SET is_blocked = false, blocked_until = NULL, blocked_reason = NULL WHERE id = $1", user_row["id"])
                        except Exception:
                            pass
                    user_row = dict(user_row)
                    user_row["is_blocked"] = False
                else:
                    reason = user_row.get("blocked_reason") or "Доступ к сервису временно ограничен администрацией платформы."
                    until_str = f"\nСрок: до <b>{blocked_until.strftime('%d.%m.%Y %H:%M UTC')}</b>" if blocked_until else "\nСрок: <b>бессрочно</b>"
                    await self.send_message(
                        chat_id,
                        f"🚫 <b>Доступ ограничен</b>\n\nВаш аккаунт в tTerm заблокирован.\nПричина: <i>{html.escape(reason)}</i>{until_str}\n\nПо вопросам разблокировки: @eklimov"
                    )
                    return

        # Pending rename response
        if chat_id in self._pending_rename and not text.startswith("/"):
            m_id = self._pending_rename.pop(chat_id)
            m_uuid = _parse_uuid(m_id)
            new_name = text.strip()
            if m_uuid and self.pool:
                try:
                    async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE machines SET name = $1 WHERE id = $2", new_name, m_uuid)
                    await self.send_message(chat_id, f"✅ Имя машины обновлено: <b>{html.escape(new_name)}</b>")
                except Exception as e_rn:
                    log.error("Rename machine failed: %s", e_rn)
                    await self.send_message(chat_id, f"❌ Ошибка переименования: {e_rn}")
            await self._show_machines_menu(chat_id, from_user=from_user)
            return

        # Language command /lang or /language
        if text.startswith(("/lang", "/language")):
            parts = text.split()
            if len(parts) > 1 and parts[1].lower() in ("ru", "en"):
                new_lang = parts[1].lower()
                if user_row and self.pool:
                    async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE users SET language = $1 WHERE id = $2", new_lang, user_row["id"])
                lang_msg = "🇷🇺 Язык интерфейса переключен на русский." if new_lang == "ru" else "🇬🇧 Interface language set to English."
                await self.send_message(chat_id, lang_msg, reply_markup=self._main_keyboard(is_owner=is_owner, lang=new_lang))
                await self._show_machines_menu(chat_id, from_user=from_user)
                return
            lang_kb = {
                "inline_keyboard": [
                    [
                        {"text": "🇷🇺 Русский", "callback_data": "setlang:ru"},
                        {"text": "🇬🇧 English", "callback_data": "setlang:en"},
                    ]
                ]
            }
            await self.send_message(chat_id, "🌐 Выберите язык интерфейса / Select interface language:", reply_markup=lang_kb)
            return

        # Admin commands: /admin, /users, /stats, /dashboard
        if text.startswith("/users"):
            if not is_owner:
                await self.send_message(chat_id, "⛔ Доступ разрешён только владельцу (@eklimov).")
                return
            await self._show_admin_users_list(chat_id, page=0)
            return

        if text.startswith(("/admin", "/stats", "/dashboard")):
            if not is_owner:
                await self.send_message(chat_id, "⛔ Доступ к панели администратора разрешён только владельцу (@eklimov).")
                return
            await self._show_admin_dashboard(chat_id)
            return

        # 1. Command /start
        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            param = parts[1].strip() if len(parts) > 1 else ""

            # 1a. Handle /start bind_<token>
            if param.startswith("bind_"):
                target_user_id = None
                bind_data = self._pending_binds.get(param)
                if bind_data and (time.time() <= bind_data.get("expires_at", 0)):
                    target_user_id = bind_data["user_id"]
                    bind_data["consumed"] = True
                elif self.pool:
                    try:
                        async with self.pool.acquire() as conn:
                            row = await conn.fetchrow(
                                "SELECT user_id, expires_at, consumed FROM telegram_bind_tokens WHERE token = ", param
                            )
                            if row and not row["consumed"]:
                                target_user_id = row["user_id"]
                                await conn.execute("UPDATE telegram_bind_tokens SET consumed = true WHERE token = ", param)
                    except Exception as e_lk:
                        log.debug("Token DB lookup error: %s", e_lk)

                if target_user_id:
                    bound_user = await self.bind_user_telegram(target_user_id, chat_id, username)
                    if bound_user:
                        user_row = bound_user
                        u_email = user_row.get("email") or "аккаунт tTerm"
                        u_name = user_row.get("name") or first_name
                        msg_bound = (
                            f"✅ <b>Telegram успешно привязан!</b>\n\n"
                            f"Здравствуйте, <b>{u_name}</b>!\n"
                            f"Ваш профиль Telegram (@{username or chat_id}) связан с аккаунтом:\n"
                            f"📧 <b>{u_email}</b>\n\n"
                            "💡 <i>Отправляйте shell-команды прямо в этот чат или выберите активную машину:</i>"
                        )
                        await self.send_message(chat_id, msg_bound)
                        await self._show_machines_menu(chat_id, from_user=from_user)
                        return

                if not user_row and is_owner:
                    if self.pool:
                        async with self.pool.acquire() as conn:
                            row = await conn.fetchrow("SELECT id, name, email FROM users WHERE email = 'eklimov84@xmail.ru'")
                            if row:
                                user_row = await self.bind_user_telegram(row["id"], chat_id, username or "eklimov")

                if user_row:
                    u_email = user_row.get("email") or "аккаунт tTerm"
                    u_name = user_row.get("name") or first_name
                    msg_auth = (
                        f"✅ <b>Вы авторизованы в tTerm!</b>\n\n"
                        f"Здравствуйте, <b>{u_name}</b>!\n"
                        f"Ваш Telegram-профиль (@{username or chat_id}) связан с аккаунтом:\n"
                        f"📧 <b>{u_email}</b>\n\n"
                        "💡 <i>Отправляйте shell-команды прямо в этот чат или выберите активную машину:</i>"
                    )
                    await self.send_message(chat_id, msg_auth)
                    await self._show_machines_menu(chat_id, from_user=from_user)
                    return
                else:
                    await self.send_message(
                        chat_id,
                        "⚠️ <b>Срок действия ссылки привязки истёк.</b>\n"
                        "Пожалуйста, нажмите «Привязать Telegram» в настройках веб-интерфейса tTerm заново.",
                        reply_markup=self._main_keyboard(is_owner=is_owner, lang=lang),
                    )
                    return

                        # 1b. Handle /start auth_<session_token> (1-click browser login)
            if param.startswith("auth_") or param.startswith("login_"):
                session_key = param.split("_", 1)[1]
                code = f"{secrets.randbelow(900000) + 100000}"
                self._pending_auth_sessions[session_key] = {
                    "approved": True,
                    "chat_id": chat_id,
                    "username": username,
                    "first_name": first_name,
                    "code": code,
                    "at": time.time(),
                }
                await self.send_message(
                    chat_id,
                    f"✅ <b>Вход в tTerm подтверждён!</b>\n\n"
                    f"Здравствуйте, <b>{first_name}</b>!\n"
                    f"Сессия в браузере авторизована и сейчас откроется автоматически.\n\n"
                    f"Резервный проверочный код: <code>{code}</code>",
                    reply_markup=self._main_keyboard(is_owner=is_owner, lang=lang),
                )
                return

            # 1c. Regular /start
            if user_row:
                await self._show_machines_menu(chat_id, from_user=from_user)
            else:
                preview_caption = (
                    f"👋 Здравствуйте, <b>{first_name}</b>!\n\n"
                    f"<b>tTerm · Оркестрация ИИ и веб-терминала</b>\n\n"
                    f"💻 <b>Web App:</b> Полноценный терминал прямо в Telegram\n"
                    f"💬 <b>Серверы:</b> Выполнение команд через сообщения бота\n"
                    f"🔔 <b>Push-уведомления:</b> Окончание команд, сборка Docker\n"
                    f"🛡 <b>Безопасность:</b> Подтверждение опасных команд\n"
                    f"🧠 <b>MCP-хаб:</b> Управление терминалами для ИИ-ассистентов\n\n"
                    f"<i>Нажмите кнопку <b>tTerm</b> ниже для открытия терминала или отправьте <code>/email ваша_почта@домен.ru</code> для привязки.</i>"
                )
                if os.path.exists(BOT_PREVIEW_PATH):
                    res = await self.send_photo_file(chat_id, BOT_PREVIEW_PATH, caption=preview_caption, reply_markup=self._unbound_keyboard(lang=lang))
                    if not res.get("ok"):
                        await self.send_message(chat_id, preview_caption, reply_markup=self._unbound_keyboard(lang=lang))
                else:
                    await self.send_message(chat_id, preview_caption, reply_markup=self._unbound_keyboard(lang=lang))
            return

        # 2. Command /avatar (send bot logo for BotFather)
        if text in ("/avatar", "/icon", "/logo") or text.startswith("/avatar ") or text.startswith("/icon "):
            caption = (
                "🖼 <b>Официальный аватар для бота tTerm</b>\n\n"
                "Чтобы установить этот аватар в Telegram:\n"
                "1. Сохраните эту картинку на устройство.\n"
                "2. Откройте диалог с @BotFather\n"
                "3. Отправьте команду <code>/setuserpic</code>\n"
                "4. Выберите бота <b>@ttermnofbot</b>\n"
                "5. Отправьте эту картинку в чат с BotFather.\n\n"
                f"Прямая ссылка на аватар: {self.web_url}/bot-icon.png\n\n"
                "<i>Готово! Логотип сразу обновится.</i>"
            )
            if os.path.exists(BOT_ICON_PATH):
                res = await self.send_photo_file(chat_id, BOT_ICON_PATH, caption=caption)
                if not res.get("ok"):
                    await self.send_message(chat_id, caption)
            else:
                await self.send_message(chat_id, caption)
            return

        # 3. Command /email (link email from Telegram chat)
        if text.startswith("/email"):
            parts = text.split(maxsplit=1)
            if len(parts) < 2 or "@" not in parts[1]:
                await self.send_message(
                    chat_id,
                    "📧 <b>Привязка электронной почты:</b>\n\n"
                    "Отправьте команду в формате:\n"
                    "<code>/email ваша_почта@домен.ru</code>\n\n"
                    "Мы вышлем 6-значный проверочный код для объединения ваших терминалов и проектов.",
                    reply_markup=self._main_keyboard(),
                )
                return

            req_email = parts[1].strip().lower()
            code = f"{secrets.randbelow(900000) + 100000}"
            self._pending_email_confirms[chat_id] = {
                "email": req_email,
                "code": code,
                "expires_at": time.time() + 900,
            }

            try:
                smtp_host = os.environ.get("TTERM_SMTP_HOST") or os.environ.get("SMTP_HOST") or "smtp.beget.com"
                smtp_port = int(os.environ.get("TTERM_SMTP_PORT") or os.environ.get("SMTP_PORT") or "2525")
                smtp_user = os.environ.get("TTERM_SMTP_USER") or os.environ.get("SMTP_USER") or "klimov@e-klimov.ru"
                smtp_pass = os.environ.get("TTERM_SMTP_PASSWORD") or os.environ.get("SMTP_PASSWORD") or "17Ry5912@_"
                smtp_ssl = (os.environ.get("TTERM_SMTP_SSL") or os.environ.get("SMTP_SSL") or "false").lower() == "true"
                sender = f"tTerm <{smtp_user}>"

                from tterm.core import mail
                mailer = mail.SmtpMailer(smtp_host, smtp_port, smtp_user, smtp_pass, sender, use_ssl=smtp_ssl)
                subject = f"{code} — код привязки в tTerm"
                mail_text = f"Здравствуйте!\n\nВаш код для привязки Telegram к tTerm: {code}\nКод действует 15 минут.\n\n— Команда tTerm"
                await mailer.send(mail.Email(to=req_email, subject=subject, text=mail_text))
            except Exception as e_em:
                log.warning("Could not send email: %s", e_em)

            await self.send_message(
                chat_id,
                f"📧 Мы отправили 6-значный проверочный код на <code>{req_email}</code>.\n\n"
                f"Отправьте полученный код сюда в чат для завершения привязки.",
            )
            return

        # 4. Check if user typed 6-digit code for pending email confirm
        if re.fullmatch(r"\d{6}", text) and chat_id in self._pending_email_confirms:
            pending = self._pending_email_confirms[chat_id]
            if time.time() <= pending["expires_at"] and text == pending["code"]:
                confirm_email = pending["email"]
                self._pending_email_confirms.pop(chat_id, None)

                if self.pool:
                    async with self.pool.acquire() as conn:
                        async with conn.transaction():
                            existing = await conn.fetchrow(
                                "SELECT id, name, email FROM users WHERE lower(email) = $1", confirm_email
                            )
                            tg_user = await conn.fetchrow(
                                "SELECT id, name FROM users WHERE telegram_chat_id = $1", chat_id
                            )

                            if existing:
                                target_id = existing["id"]
                                if tg_user and tg_user["id"] != target_id:
                                    await conn.execute("UPDATE projects SET owner_id = $1 WHERE owner_id = $2", target_id, tg_user["id"])
                                    await conn.execute("UPDATE project_members SET user_id = $1 WHERE user_id = $2 AND project_id NOT IN (SELECT project_id FROM project_members WHERE user_id = $1)", target_id, tg_user["id"])
                                    await conn.execute("DELETE FROM users WHERE id = $1", tg_user["id"])
                                await conn.execute(
                                    "UPDATE users SET telegram_chat_id = $1, telegram_username = COALESCE($2, telegram_username) WHERE id = $3",
                                    chat_id, username or None, target_id
                                )
                            elif tg_user:
                                await conn.execute("UPDATE users SET email = $1 WHERE id = $2", confirm_email, tg_user["id"])

                await self.send_message(
                    chat_id,
                    f"✅ <b>Почта {confirm_email} успешно привязана!</b>\n\n"
                    f"Ваш Telegram теперь связан с вашим основным аккаунтом.\n"
                    f"Все проекты, серверы и терминалы объединены.",
                    reply_markup=self._main_keyboard(),
                )
                return

        # 5. Command /web or /login (1-click browser login)
        if text.startswith("/web") or text.startswith("/login"):
            user_row = await self.get_user_by_telegram(chat_id)
            if user_row and self.pool:
                async with self.pool.acquire() as conn:
                    from tterm.core import auth
                    sess_token, _ = await auth._new_session(
                        conn, user_row["id"], method="telegram", label="Telegram Bot 1-Click Login", ip="127.0.0.1"
                    )
                    login_url = f"{self.web_url}/?auth={sess_token}"
                    await self.send_message(
                        chat_id,
                        f"🌐 <b>Вход в веб-интерфейс tTerm</b>\n\n"
                        f"Ваша персональная ссылка для мгновенного входа:\n"
                        f"👉 <a href='{login_url}'><b>Войти в tTerm Web ↗</b></a>\n\n"
                        f"<i>Действует 30 дней. Открывает все ваши проекты.</i>",
                        reply_markup={"inline_keyboard": [[{"text": "🌐 Открыть веб-интерфейс", "url": login_url}]]}
                    )
                    return

        # 6. Command /app (open Web App)
        if text.startswith("/app"):
            await self.send_message(
                chat_id,
                "💻 <b>tTerm</b>\n"
                "Нажмите кнопку ниже, чтобы открыть терминал прямо внутри Telegram:",
                reply_markup={
                    "inline_keyboard": [
                        [{"text": "tTerm", "web_app": {"url": self.web_url}}]
                    ]
                },
            )
            return

        # 7. Command /machines or /use
        if text.startswith("/machines") or text.startswith("/use") or text == "🖥 Машины":
            await self._show_machines_menu(chat_id, from_user=from_user)
            return

        # 8. Command /help
        if text.startswith("/help") or text == "ℹ️ Помощь":
            await self.send_message(
                chat_id,
                "📖 <b>Команды tTerm Telegram Bot</b>\n\n"
                "• <b>/use</b> или <b>/machines</b> — список ваших машин и выбор активной\n"
                "• <b>/email &lt;почта&gt;</b> — привязать электронную почту к Telegram\n"
                "• <b>/web</b> — ссылка для входа в веб-интерфейс без паролей\n"
                "• <b>/avatar</b> — скачать официальный логотип бота для @BotFather\n"
                "• <b>Любая команда</b> — запуск на выбранной машине (например: <code>uptime</code>, <code>git status</code>)\n\n"
                "🛡 <i>Опасные команды (rm -rf, mkfs) требуют подтверждения кнопкой.</i>",
                reply_markup=self._main_keyboard(),
            )
            return

        # 9. Non-command text -> Execute on active machine!
        user_row = await self.get_user_by_telegram(chat_id)
        if not user_row:
            await self.send_message(
                chat_id,
                "⚠️ <b>Аккаунт не привязан.</b>\n"
                "Для выполнения команд привяжите свой Telegram-аккаунт через /email или откройте tTerm:",
                reply_markup=self._unbound_keyboard(),
            )
            return

        # Determine active machine
        active_id = self._user_active_machines.get(chat_id)
        machines = await self.list_user_machines(user_row["id"])
        online_machines = [m for m in machines if m["online"]]

        if not active_id:
            if len(online_machines) == 1:
                active_id = online_machines[0]["id"]
                self._user_active_machines[chat_id] = active_id
            elif not online_machines:
                await self.send_message(
                    chat_id,
                    "⚠️ <b>Нет подключенных онлайн-машин.</b>\n"
                    "Запустите агент на компьютере или включите сервер, чтобы выполнять команды.",
                    reply_markup=self._main_keyboard(),
                )
                return
            else:
                await self._show_machines_menu(chat_id, note="Выберите машину для выполнения команды:", from_user=from_user)
                return

        # Find active machine name
        active_m_name = "machine"
        active_m_kind = "server"
        for m in machines:
            if m["id"] == active_id:
                active_m_name = m["name"]
                active_m_kind = m["kind"]
                break

        # Check for dangerous command
        danger_desc = None
        for pattern, desc in DANGER_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                danger_desc = desc
                break

        if danger_desc:
            danger_key = secrets.token_hex(6)
            self._pending_danger[danger_key] = {
                "command": text,
                "machine_id": active_id,
                "chat_id": chat_id,
                "user_id": user_row["id"],
                "expires_at": time.time() + 120,
            }
            await self.send_message(
                chat_id,
                f"⚠️ <b>Внимание: опасная команда!</b>\n\n"
                f"Команда: <code>{html.escape(text)}</code>\n"
                f"Действие: <b>{danger_desc}</b>.\n\n"
                f"Вы уверены, что хотите выполнить её?",
                reply_markup={
                    "inline_keyboard": [
                        [
                            {"text": "⚠️ Да, выполнить", "callback_data": f"danger:run:{danger_key}"},
                            {"text": "❌ Отмена", "callback_data": f"danger:cancel:{danger_key}"},
                        ]
                    ]
                },
            )
            return

        # Execute command with in-place streaming card!
        m_icon = "🖥" if active_m_kind == "computer" else "🌐"
        init_res = await self.send_message(
            chat_id,
            f"{m_icon} <b>{html.escape(active_m_name)}</b>\n⏳ <i>выполняется...</i>",
            reply_markup={"inline_keyboard": [[{"text": "⏹ Прервать (Ctrl+C)", "callback_data": f"stop:{active_id}"}]]}
        )
        msg_id = init_res.get("result", {}).get("message_id") if isinstance(init_res, dict) else None

        res = await self.execute_command(user_row, active_id, text)
        await self._send_command_result(chat_id, res, initial_msg_id=msg_id)

    # ------------------------------------------------------------- Handler: Callback Query
    async def _handle_callback(self, callback: Dict[str, Any]) -> None:
        cq_id = callback["id"]
        data = callback.get("data") or ""
        msg = callback.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = str(chat.get("id"))
        msg_id = msg.get("message_id")
        from_user = callback.get("from") or {}
        username = (from_user.get("username") or "").strip()
        is_owner = (str(chat_id) == "55570186" or (username and username.lower() in ("eklimov", "eklimov84")))

        if data == "menu:machines":
            await self.answer_callback(cq_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            if user_row:
                machines = await self.list_user_machines(user_row["id"])
                active_id = self._user_active_machines.get(chat_id) or (machines[0]["id"] if machines else "")
                if msg_id and machines:
                    rich_payload = self._build_rich_machines_payload(machines, active_id, lang=lang)
                    res = await self.call_api("editMessageText", {
                        "chat_id": chat_id,
                        "message_id": msg_id,
                        "rich_message": rich_payload,
                    })
                    if res.get("ok"):
                        return
            await self._show_machines_menu(chat_id, from_user=callback.get("from"))
            return

        if data == "menu:help":
            await self.answer_callback(cq_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            t = I18N.get(lang, I18N["ru"])
            is_owner = (str(chat_id) == "55570186" or (user_row and user_row.get("email") == "eklimov84@xmail.ru"))
            await self.send_message(
                chat_id,
                t["help_text"],
                reply_markup=self._main_keyboard(is_owner=is_owner, lang=lang),
            )
            return

        if data == "admin:refresh":
            await self.answer_callback(cq_id, "Обновление...")
            if str(chat_id) == "55570186" or (username and username.lower() in ("eklimov", "eklimov84")):
                await self._show_admin_dashboard(chat_id, msg_id=msg_id)
            return

        # Admin User Management Callbacks
        if data.startswith("u:"):
            if not is_owner:
                await self.answer_callback(cq_id, "Доступ только для владельца (@eklimov)", show_alert=True)
                return

            parts = data.split(":")
            subaction = parts[1] if len(parts) > 1 else ""

            if subaction == "list":
                page = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
                await self.answer_callback(cq_id)
                await self._show_admin_users_list(chat_id, page=page, msg_id=msg_id)
                return

            if subaction == "view":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                await self.answer_callback(cq_id)
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "block":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        target_row = await conn.fetchrow("SELECT telegram_chat_id, email FROM users WHERE id = $1", t_uuid)
                        if target_row and (str(target_row["telegram_chat_id"]) == "55570186" or target_row["email"] == "eklimov84@xmail.ru"):
                            await self.answer_callback(cq_id, "Нельзя заблокировать владельца платформы!", show_alert=True)
                            return
                        await conn.execute("UPDATE users SET is_blocked = true, blocked_reason = 'Заблокирован администратором', blocked_until = NULL WHERE id = $1", t_uuid)
                        if target_row and target_row["telegram_chat_id"]:
                            try:
                                await self.send_message(target_row["telegram_chat_id"], "🚫 <b>Ваш аккаунт в tTerm заблокирован администратором платформы.</b>\nПо вопросам: @eklimov")
                            except Exception:
                                pass
                await self.answer_callback(cq_id, "Пользователь заблокирован")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "block24":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        target_row = await conn.fetchrow("SELECT telegram_chat_id, email FROM users WHERE id = $1", t_uuid)
                        if target_row and (str(target_row["telegram_chat_id"]) == "55570186" or target_row["email"] == "eklimov84@xmail.ru"):
                            await self.answer_callback(cq_id, "Нельзя заблокировать владельца!", show_alert=True)
                            return
                        await conn.execute("UPDATE users SET is_blocked = true, blocked_reason = 'Временное ограничение доступа (24 часа)', blocked_until = now() + INTERVAL '24 hours' WHERE id = $1", t_uuid)
                        if target_row and target_row["telegram_chat_id"]:
                            try:
                                await self.send_message(target_row["telegram_chat_id"], "⏱ <b>Доступ к tTerm временно ограничен на 24 часа.</b>\nПо вопросам: @eklimov")
                            except Exception:
                                pass
                await self.answer_callback(cq_id, "Блок на 24ч установлен")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "unblock":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE users SET is_blocked = false, blocked_reason = NULL, blocked_until = NULL WHERE id = $1", t_uuid)
                        target_row = await conn.fetchrow("SELECT telegram_chat_id FROM users WHERE id = $1", t_uuid)
                        if target_row and target_row["telegram_chat_id"]:
                            try:
                                await self.send_message(target_row["telegram_chat_id"], "✅ <b>Ваш аккаунт в tTerm разблокирован.</b> Доступ восстановлен.")
                            except Exception:
                                pass
                await self.answer_callback(cq_id, "Пользователь разблокирован")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "unbind":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        target_row = await conn.fetchrow("SELECT telegram_chat_id, email FROM users WHERE id = $1", t_uuid)
                        if target_row and (str(target_row["telegram_chat_id"]) == "55570186" or target_row["email"] == "eklimov84@xmail.ru"):
                            await self.answer_callback(cq_id, "Нельзя отвязать Telegram владельца!", show_alert=True)
                            return
                        old_tg = target_row["telegram_chat_id"] if target_row else None
                        await conn.execute("UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = $1", t_uuid)
                        if old_tg:
                            try:
                                await self.send_message(old_tg, "ℹ️ Ваш Telegram-аккаунт был отвязан от профиля tTerm администратором платформы.")
                            except Exception:
                                pass
                await self.answer_callback(cq_id, "Telegram успешно отвязан")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "bindlink":
                target_user_id = parts[2] if len(parts) > 2 else ""
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid:
                    token, url = self.register_pending_bind(t_uuid)
                    await self.answer_callback(cq_id)
                    await self.send_message(
                        chat_id,
                        f"🔑 <b>Ссылка для привязки Telegram пользователя:</b>\n\n<code>{url}</code>\n\nОтправьте эту ссылку пользователю. Срок действия: 2 часа."
                    )
                return

            if subaction == "plan_menu":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                await self.answer_callback(cq_id)
                await self._show_admin_plan_menu(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "set_plan":
                target_user_id = parts[2] if len(parts) > 2 else ""
                new_plan = parts[3] if len(parts) > 3 else "free"
                page = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool and new_plan in ("free", "pro", "enterprise"):
                    async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE users SET plan_id = $1 WHERE id = $2", new_plan, t_uuid)
                    await self.answer_callback(cq_id, f"Тариф изменён на {new_plan.upper()}")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "sub_menu":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                await self.answer_callback(cq_id)
                await self._show_admin_sub_menu(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "set_sub":
                target_user_id = parts[2] if len(parts) > 2 else ""
                sub_val = parts[3] if len(parts) > 3 else "forever"
                page = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        if sub_val == "forever":
                            await conn.execute("UPDATE users SET subscription_expires_at = NULL WHERE id = $1", t_uuid)
                            await self.answer_callback(cq_id, "Подписка бессрочно")
                        elif sub_val.isdigit():
                            days = int(sub_val)
                            await conn.execute(
                                "UPDATE users SET subscription_expires_at = COALESCE(GREATEST(subscription_expires_at, now()), now()) + ($1 || ' days')::interval WHERE id = $2",
                                str(days), t_uuid
                            )
                            await self.answer_callback(cq_id, f"Подписка продлена на {days} дн.")
                await self._show_admin_user_card(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "edit_name":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                self._pending_user_edit[chat_id] = {
                    "action": "name",
                    "target_id": target_user_id,
                    "page": page,
                    "msg_id": msg_id
                }
                await self.answer_callback(cq_id)
                await self.send_message(
                    chat_id,
                    "✏️ <b>Изменение имени пользователя:</b>\n\nОтправьте новое имя следующим сообщением (или введите <code>/cancel</code> для отмены):"
                )
                return

            if subaction == "edit_email":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                self._pending_user_edit[chat_id] = {
                    "action": "email",
                    "target_id": target_user_id,
                    "page": page,
                    "msg_id": msg_id
                }
                await self.answer_callback(cq_id)
                await self.send_message(
                    chat_id,
                    "✉️ <b>Изменение Email пользователя:</b>\n\nОтправьте новый email следующим сообщением (или введите <code>/cancel</code> для отмены):"
                )
                return

            if subaction == "ask_del":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                await self.answer_callback(cq_id)
                await self._show_admin_del_confirm(chat_id, target_user_id, page=page, msg_id=msg_id)
                return

            if subaction == "do_del":
                target_user_id = parts[2] if len(parts) > 2 else ""
                page = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
                t_uuid = _parse_uuid(target_user_id)
                if t_uuid and self.pool:
                    async with self.pool.acquire() as conn:
                        target_row = await conn.fetchrow("SELECT telegram_chat_id, email, name FROM users WHERE id = $1", t_uuid)
                        if target_row and (str(target_row["telegram_chat_id"]) == "55570186" or target_row["email"] == "eklimov84@xmail.ru"):
                            await self.answer_callback(cq_id, "Нельзя удалить владельца платформы!", show_alert=True)
                            return
                        old_tg = target_row["telegram_chat_id"] if target_row else None
                        del_email = target_row["email"] if target_row else "User"
                        async with conn.transaction():
                            await conn.execute("UPDATE machines SET created_by = NULL WHERE created_by = $1", t_uuid)
                            await conn.execute("DELETE FROM terminals WHERE owner_id = $1", t_uuid)
                            await conn.execute("DELETE FROM projects WHERE owner_id = $1", t_uuid)
                            await conn.execute("DELETE FROM users WHERE id = $1", t_uuid)
                        if old_tg:
                            try:
                                await self.send_message(old_tg, "ℹ️ Ваш аккаунт в сервисе tTerm был удален администратором платформы.")
                            except Exception:
                                pass
                    await self.answer_callback(cq_id, f"Пользователь {del_email} удален", show_alert=True)
                await self._show_admin_users_list(chat_id, page=page, msg_id=msg_id)
                return


        if data.startswith("deluser:confirm:"):
            req_id_str = data[len("deluser:confirm:"):]
            if str(chat_id) != "55570186" and (not username or username.lower() not in ("eklimov", "eklimov84")):
                await self.answer_callback(cq_id, "Отказано в доступе", show_alert=True)
                return
            await self.answer_callback(cq_id, "Удаление пользователя...")
            if self.pool:
                try:
                    req_uuid = uuid.UUID(req_id_str)
                    async with self.pool.acquire() as conn:
                        async with conn.transaction():
                            req = await conn.fetchrow("SELECT user_id, user_email, telegram_chat_id FROM account_deletion_requests WHERE id = $1", req_uuid)
                            if req:
                                await conn.execute("UPDATE account_deletion_requests SET status = 'approved', resolved_at = now() WHERE id = $1", req_uuid)
                                await conn.execute("DELETE FROM users WHERE id = $1", req["user_id"])
                                if req["telegram_chat_id"]:
                                    try:
                                        await self.send_message(req["telegram_chat_id"], "ℹ️ Ваш аккаунт в tTerm был удален администратором платформы по вашему запросу.")
                                    except Exception:
                                        pass
                    await self.send_message(chat_id, f"✅ Аккаунт <b>{req['user_email']}</b> успешно удален по запросу.")
                    await self._show_admin_dashboard(chat_id, msg_id=msg_id)
                except Exception as e_del:
                    log.error("Failed to approve deletion request: %s", e_del)
                    await self.send_message(chat_id, f"❌ Ошибка удаления: {e_del}")
            return

        if data.startswith("deluser:reject:"):
            req_id_str = data[len("deluser:reject:"):]
            if str(chat_id) != "55570186" and (not username or username.lower() not in ("eklimov", "eklimov84")):
                await self.answer_callback(cq_id, "Отказано в доступе", show_alert=True)
                return
            await self.answer_callback(cq_id, "Запрос отклонен")
            if self.pool:
                try:
                    req_uuid = uuid.UUID(req_id_str)
                    async with self.pool.acquire() as conn:
                        req = await conn.fetchrow("SELECT user_id, user_email, telegram_chat_id FROM account_deletion_requests WHERE id = $1", req_uuid)
                        if req:
                            await conn.execute("UPDATE account_deletion_requests SET status = 'rejected', resolved_at = now() WHERE id = $1", req_uuid)
                            if req["telegram_chat_id"]:
                                try:
                                    await self.send_message(req["telegram_chat_id"], "ℹ️ Ваш запрос на удаление аккаунта в tTerm был отклонен администратором.")
                                except Exception:
                                    pass
                    await self.send_message(chat_id, f"❌ Запрос на удаление <b>{req['user_email']}</b> отклонен.")
                    await self._show_admin_dashboard(chat_id, msg_id=msg_id)
                except Exception as e_rej:
                    log.error("Failed to reject deletion request: %s", e_rej)
            return

        if data.startswith("use:"):
            machine_id = data[4:]
            self._user_active_machines[chat_id] = machine_id
            m_uuid = _parse_uuid(machine_id)
            m_name = machine_id
            m_kind = "server"
            if self.pool and m_uuid:
                async with self.pool.acquire() as conn:
                    m_row = await conn.fetchrow("SELECT name, kind FROM machines WHERE id = $1", m_uuid)
                    if m_row:
                        m_name = m_row["name"]
                        m_kind = m_row["kind"]

            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            t = I18N.get(lang, I18N["ru"])

            await self.answer_callback(cq_id, f"{m_name} {t['active']}")

            # Update the menu in-place with rich formatting
            try:
                if user_row and msg_id:
                    machines = await self.list_user_machines(user_row["id"])
                    rich_payload = self._build_rich_machines_payload(machines, machine_id, lang=lang)
                    res = await self.call_api("editMessageText", {
                        "chat_id": chat_id,
                        "message_id": msg_id,
                        "rich_message": rich_payload,
                    })
                    if not res.get("ok"):
                        text, kb = self._build_plain_machines_menu(machines, machine_id, lang=lang)
                        await self.edit_message(chat_id, msg_id, text, reply_markup=kb)
            except Exception as e_ed:
                log.debug("Could not edit machines view: %s", e_ed)
            return

        if data.startswith("rerun:"):
            cmd = data[6:]
            await self.answer_callback(cq_id, "Повторный запуск...")
            user_row = await self.get_user_by_telegram(chat_id)
            active_id = self._user_active_machines.get(chat_id)
            if user_row and active_id:
                init_res = await self.send_message(chat_id, f"⏳ Повторный запуск: <code>{html.escape(cmd)}</code>...")
                n_msg_id = init_res.get("result", {}).get("message_id") if isinstance(init_res, dict) else None
                res = await self.execute_command(user_row, active_id, cmd)
                await self._send_command_result(chat_id, res, initial_msg_id=n_msg_id)
            return

        if data.startswith("newterm:"):
            m_id = data[8:]
            m_uuid = _parse_uuid(m_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            m_name = m_id
            if self.pool and m_uuid:
                async with self.pool.acquire() as conn:
                    m_row = await conn.fetchrow("SELECT name FROM machines WHERE id = $1", m_uuid)
                    if m_row:
                        m_name = m_row["name"]
            self._user_active_machines[chat_id] = m_id
            await self.answer_callback(cq_id, "Терминал готов" if lang == "ru" else "Terminal ready")
            await self.send_message(
                chat_id,
                f"🖥 <b>Терминал активен: {html.escape(m_name)}</b>\n\n"
                f"Отправляйте команды прямо в этот чат (например: <code>uptime</code>, <code>git status</code>, <code>docker ps</code>).\n"
                f"Или откройте терминал в Web App через кнопку <b>tTerm</b> ниже.",
                reply_markup={"inline_keyboard": [[{"text": "💻 Открыть терминал в Web App", "web_app": {"url": self.web_url}}]]}
            )
            return

        if data.startswith("rename:"):
            m_id = data[7:]
            await self.answer_callback(cq_id)
            self._pending_rename[chat_id] = m_id
            await self.send_message(
                chat_id,
                "✏️ <b>Переименование машины</b>\nОтправьте новое имя для этой машины ответным сообщением в чат:"
            )
            return

        if data.startswith("access:"):
            m_id = data[7:]
            await self.answer_callback(cq_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            t = I18N.get(lang, I18N["ru"])
            m_uuid = _parse_uuid(m_id)
            m_name = m_id
            members_list = []
            if self.pool and m_uuid:
                async with self.pool.acquire() as conn:
                    m_row = await conn.fetchrow("SELECT name, project_id FROM machines WHERE id = $1", m_uuid)
                    if m_row:
                        m_name = m_row["name"]
                        rows = await conn.fetch(
                            """SELECT u.name, u.email, pm.role
                            FROM project_members pm
                            JOIN users u ON u.id = pm.user_id
                            WHERE pm.project_id = $1""", m_row["project_id"]
                        )
                        for r in rows:
                            members_list.append(f"• <b>{r['name'] or r['email']}</b> ({r['role']})")

            members_text = "\n".join(members_list) if members_list else ("• <i>Доступ только у владельца</i>" if lang == "ru" else "• <i>Owner only</i>")
            acc_blocks = [
                {
                    "type": "paragraph",
                    "text": [{"type": "bold", "text": f"Доступ к машине: {m_name}" if lang == "ru" else f"Access to machine: {m_name}"}]
                },
                {
                    "type": "paragraph",
                    "text": [f"Участники с доступом к этой машине:\n{members_text}" if lang == "ru" else f"Project members with access:\n{members_text}"]
                },
                {
                    "type": "buttons",
                    "align": "left",
                    "buttons": [
                        {"text": t["btn_back"], "callback_data": "menu:machines"}
                    ]
                }
            ]
            if msg_id:
                res = await self.call_api("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "rich_message": {"blocks": acc_blocks}
                })
                if res.get("ok"):
                    return
            await self.send_message(chat_id, f"🔑 <b>Доступ к {m_name}</b>\n\n{members_text}", reply_markup={"inline_keyboard": [[{"text": t["btn_back"], "callback_data": "menu:machines"}]]})
            return

        if data.startswith("askrm:"):
            m_id = data[6:]
            await self.answer_callback(cq_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            t = I18N.get(lang, I18N["ru"])
            m_name = m_id
            m_uuid = _parse_uuid(m_id)
            if self.pool and m_uuid:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("SELECT name FROM machines WHERE id = $1", m_uuid)
                    if row:
                        m_name = row["name"]

            rm_title = f"Удалить машину {m_name} из списка?" if lang == "ru" else f"Remove {m_name} from list?"
            rm_desc = "Подключение будет разорвано. Вы сможете добавить эту машину повторно в любое время." if lang == "ru" else "The connection will be removed. You can reconnect it at any time."
            rm_yes = "Да, удалить" if lang == "ru" else "Yes, remove"
            rm_cancel = "Отмена" if lang == "ru" else "Cancel"

            rm_blocks = [
                {
                    "type": "paragraph",
                    "text": [{"type": "bold", "text": rm_title}]
                },
                {
                    "type": "paragraph",
                    "text": [rm_desc]
                },
                {
                    "type": "buttons",
                    "align": "left",
                    "buttons": [
                        {"text": f"🗑 {rm_yes}", "callback_data": f"remove:{m_id}", "style": "danger"},
                        {"text": rm_cancel, "callback_data": "menu:machines"}
                    ]
                }
            ]
            if msg_id:
                res = await self.call_api("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "rich_message": {"blocks": rm_blocks}
                })
                if res.get("ok"):
                    return
            await self.send_message(chat_id, f"⚠️ <b>{rm_title}</b>\n\n{rm_desc}", reply_markup={"inline_keyboard": [
                [{"text": f"🗑 {rm_yes}", "callback_data": f"remove:{m_id}"}, {"text": rm_cancel, "callback_data": "menu:machines"}]
            ]})
            return

        if data.startswith("remove:"):
            m_id = data[7:]
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            await self.answer_callback(cq_id, "Машина удалена" if lang == "ru" else "Machine removed")
            m_uuid = _parse_uuid(m_id)
            if self.pool and m_uuid:
                async with self.pool.acquire() as conn:
                    await conn.execute("UPDATE machines SET removed_at = now() WHERE id = $1", m_uuid)

            # Switch active machine if needed
            if self._user_active_machines.get(chat_id) == m_id:
                self._user_active_machines.pop(chat_id, None)

            if user_row and msg_id:
                machines = await self.list_user_machines(user_row["id"])
                active_id = self._user_active_machines.get(chat_id) or (machines[0]["id"] if machines else "")
                rich_payload = self._build_rich_machines_payload(machines, active_id, lang=lang)
                res = await self.call_api("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "rich_message": rich_payload,
                })
                if res.get("ok"):
                    return
            await self._show_machines_menu(chat_id, from_user=callback.get("from"))
            return

        if data == "togglelang":
            user_row = await self.get_user_by_telegram(chat_id)
            curr_lang = self._get_lang(user_row, callback.get("from"))
            new_lang = "en" if curr_lang == "ru" else "ru"
            if user_row and self.pool:
                async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE users SET language = $1 WHERE id = $2", new_lang, user_row["id"])
            await self.answer_callback(cq_id, "Язык: Русский" if new_lang == "ru" else "Language: English")
            if user_row and msg_id:
                machines = await self.list_user_machines(user_row["id"])
                active_id = self._user_active_machines.get(chat_id) or (machines[0]["id"] if machines else "")
                rich_payload = self._build_rich_machines_payload(machines, active_id, lang=new_lang)
                res = await self.call_api("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "rich_message": rich_payload,
                })
                if res.get("ok"):
                    return
            await self._show_machines_menu(chat_id, from_user=callback.get("from"))
            return

        if data.startswith("setlang:"):
            new_lang = data[8:]
            user_row = await self.get_user_by_telegram(chat_id)
            if user_row and self.pool:
                async with self.pool.acquire() as conn:
                        await conn.execute("UPDATE users SET language = $1 WHERE id = $2", new_lang, user_row["id"])
            await self.answer_callback(cq_id, "Язык: Русский" if new_lang == "ru" else "Language: English")
            await self._show_machines_menu(chat_id, from_user=callback.get("from"))
            return

        if data == "addmachine" or data == "addhost":
            await self.answer_callback(cq_id)
            user_row = await self.get_user_by_telegram(chat_id)
            lang = self._get_lang(user_row, callback.get("from"))
            t = I18N.get(lang, I18N["ru"])

            server_cmd = f"curl -sSL {self.web_url}/connect.sh | bash"
            pc_cmd = f"curl -sSL {self.web_url}/a/connect | bash"
            add_blocks = [
                {
                    "type": "paragraph",
                    "text": [{"type": "bold", "text": t["add_server_title"]}]
                },
                {
                    "type": "paragraph",
                    "text": [t["add_server_desc"]]
                },
                {
                    "type": "paragraph",
                    "text": [{"type": "code", "text": server_cmd}]
                },
                {
                    "type": "paragraph",
                    "text": [{"type": "bold", "text": t["add_pc_title"]}]
                },
                {
                    "type": "paragraph",
                    "text": [t["add_pc_desc"]]
                },
                {
                    "type": "paragraph",
                    "text": [{"type": "code", "text": pc_cmd}]
                },
                {
                    "type": "buttons",
                    "align": "left",
                    "buttons": [
                        {"text": t["btn_back"], "callback_data": "menu:machines"}
                    ]
                }
            ]
            if msg_id:
                res = await self.call_api("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": msg_id,
                    "rich_message": {"blocks": add_blocks}
                })
                if not res.get("ok"):
                    await self.send_message(
                        chat_id,
                        f"<b>{t['add_server_title']}</b>\n{t['add_server_desc']}\n<code>{server_cmd}</code>\n\n"
                        f"<b>{t['add_pc_title']}</b>\n{t['add_pc_desc']}\n<code>{pc_cmd}</code>",
                        reply_markup={"inline_keyboard": [[{"text": t["btn_back"], "callback_data": "menu:machines"}]]}
                    )
            return

        if data.startswith("danger:run:"):
            key = data[11:]
            pending = self._pending_danger.pop(key, None)
            if not pending or time.time() > pending["expires_at"]:
                await self.answer_callback(cq_id, "Срок подтверждения истёк", show_alert=True)
                return

            await self.answer_callback(cq_id, "Выполняю подтверждённую команду...")
            if msg_id:
                await self.edit_message(chat_id, msg_id, f"⏳ Выполняется: <code>{html.escape(pending['command'])}</code>...")

            user_row = await self.get_user_by_telegram(chat_id)
            if user_row:
                res = await self.execute_command(user_row, pending["machine_id"], pending["command"])
                await self._send_command_result(chat_id, res, initial_msg_id=msg_id)
            return

        if data.startswith("danger:cancel:"):
            key = data[14:]
            self._pending_danger.pop(key, None)
            await self.answer_callback(cq_id, "Команда отменена")
            if msg_id:
                await self.edit_message(chat_id, msg_id, "❌ Выполнение опасной команды отменено.")
            return

        if data.startswith("approval:"):
            parts = data.split(":")
            action, appr_id = parts[1], parts[2]
            try:
                from .approvals import approval_manager
                verdict = "approved" if action == "approve" else "rejected"
                resolved = approval_manager.resolve(appr_id, verdict=verdict, resolver="Telegram Admin")
                if resolved:
                    icon = "✅" if verdict == "approved" else "❌"
                    label = "разрешено" if verdict == "approved" else "отклонено"
                    await self.answer_callback(cq_id, f"Действие {label}")
                    if msg_id:
                        await self.edit_message(chat_id, msg_id, f"{icon} Действие <b>{label}</b> администратором через Telegram.")
                else:
                    await self.answer_callback(cq_id, "Запрос уже обработан или не найден", show_alert=True)
            except Exception as e:
                log.warning("Approval callback error: %s", e)
                await self.answer_callback(cq_id, "Ошибка обработки", show_alert=True)
            return

        await self.answer_callback(cq_id)

    # ------------------------------------------------------------- Helpers & Formatting
    async def _show_machines_menu(self, chat_id: str, note: str = "", from_user: Optional[Dict[str, Any]] = None) -> None:
        user_row = await self.get_user_by_telegram(chat_id)
        lang = self._get_lang(user_row, from_user)
        t = I18N.get(lang, I18N["ru"])
        is_owner = (str(chat_id) == "55570186" or (user_row and user_row.get("email") == "eklimov84@xmail.ru"))

        if not user_row:
            await self.send_message(chat_id, "⚠️ Аккаунт не привязан." if lang == "ru" else "⚠️ Account is not linked.", reply_markup=self._unbound_keyboard(lang=lang))
            return

        machines = await self.list_user_machines(user_row["id"])
        if not machines:
            await self.send_message(
                chat_id,
                f"{t['no_machines_title']}\n\n{t['no_machines_desc']}",
                reply_markup=self._main_keyboard(is_owner=is_owner, lang=lang),
            )
            return

        active_id = self._user_active_machines.get(chat_id)
        if not active_id and machines:
            active_id = machines[0]["id"]
            self._user_active_machines[chat_id] = active_id

        # 1. Try sending via modern Telegram Rich Message (InputRichMessage) with user language
        rich_payload = self._build_rich_machines_payload(machines, active_id, lang=lang)
        res = await self.call_api("sendRichMessage", {
            "chat_id": str(chat_id),
            "rich_message": rich_payload,
        })
        if res.get("ok"):
            return

        # 2. Fallback to clean HTML and standard inline buttons
        text, kb = self._build_plain_machines_menu(machines, active_id, lang=lang)
        await self.send_message(chat_id, text, reply_markup=kb)

    def _build_rich_machines_payload(self, machines: List[Dict[str, Any]], active_id: str, lang: str = "ru") -> Dict[str, Any]:
        """Builds rich message block structure matching author's tTerm bot specification with multilingual support."""
        t = I18N.get(lang, I18N["ru"])
        blocks = [
            {
                "type": "paragraph",
                "text": [{"type": "bold", "text": t["title_machines"]}]
            }
        ]

        for idx, m in enumerate(machines, 1):
            is_active = (str(m["id"]) == str(active_id))
            icon = "🖥" if m["kind"] == "computer" else "🌐"
            ip_val = m.get("host") or m.get("ip") or ("компьютер" if m["kind"] == "computer" else "82.148.241.254")
            if lang == "en":
                ip_val = m.get("host") or m.get("ip") or ("computer" if m["kind"] == "computer" else "82.148.241.254")
            tail = ip_val if m.get("online", True) else t["offline"]
            m_label = m["name"]
            if m["kind"] == "server" and not m_label.endswith(")"):
                m_label = f"{m_label}{t['server_suffix']}"

            btn_dict = {
                "text": m_label,
                "callback_data": f"use:{m['id']}",
            }
            if is_active:
                btn_dict["style"] = "primary"
            blocks.append({
                "type": "paragraph",
                "text": [
                    f"{icon} ",
                    {"type": "code", "text": f"#{idx}"},
                    " ",
                    {
                        "type": "button",
                        "button": btn_dict
                    },
                    {"type": "italic", "text": f"  {tail}"}
                ]
            })

        # Actions row for active machine
        blocks.append({
            "type": "buttons",
            "align": "left",
            "buttons": [
                {"text": t["btn_terminal"], "callback_data": f"newterm:{active_id}"},
                {"text": t["btn_rename"], "callback_data": f"rename:{active_id}"},
                {"text": t["btn_access"], "callback_data": f"access:{active_id}"},
                {"text": t["btn_remove"], "callback_data": f"askrm:{active_id}", "style": "danger"},
            ]
        })
        blocks.append({
            "type": "buttons",
            "align": "left",
            "buttons": [
                {"text": t["btn_add_machine"], "callback_data": "addmachine", "style": "success"},
                {"text": "🇷🇺/🇬🇧 Язык", "callback_data": "togglelang"},
            ]
        })
        return {"blocks": blocks}

    def _build_plain_machines_menu(self, machines: List[Dict[str, Any]], active_id: str, lang: str = "ru") -> Tuple[str, Dict[str, Any]]:
        t = I18N.get(lang, I18N["ru"])
        lines = [f"<b>{t['title_machines']}</b>\n"]
        for idx, m in enumerate(machines, 1):
            is_active = (m["id"] == active_id)
            icon = "🖥" if m["kind"] == "computer" else "🌐"
            ip_val = m.get("host") or m.get("ip") or ("computer" if m["kind"] == "computer" else "82.148.241.254")
            tail = ip_val if m.get("online", True) else t["offline"]
            name_str = f"<b>{html.escape(m['name'])}</b>" if is_active else html.escape(m["name"])
            lines.append(f"{icon} <code>#{idx}</code> {name_str} <i>{tail}</i>")

        kb = [
            [
                {"text": t["btn_terminal"], "callback_data": f"newterm:{active_id}"},
                {"text": t["btn_rename"], "callback_data": f"rename:{active_id}"},
                {"text": t["btn_access"], "callback_data": f"access:{active_id}"},
                {"text": t["btn_remove"], "callback_data": f"remove:{active_id}"},
            ],
            [
                {"text": t["btn_add_machine"], "callback_data": "addmachine"},
                {"text": t["btn_webapp"], "web_app": {"url": self.web_url}},
            ]
        ]
        return "\n".join(lines), {"inline_keyboard": kb}

    async def _show_admin_dashboard(self, chat_id: str | int, msg_id: Optional[int] = None) -> None:
        if not self.pool:
            await self.send_message(chat_id, "⚠️ База данных недоступна.")
            return

        user_row = await self.get_user_by_telegram(str(chat_id))
        lang = self._get_lang(user_row)
        t = I18N.get(lang, I18N["ru"])

        async with self.pool.acquire() as conn:
            users = await conn.fetch("SELECT id, name, email, telegram_chat_id, telegram_username, created_at FROM users ORDER BY created_at DESC LIMIT 15;")
            machines = await conn.fetch("SELECT m.name, m.kind, m.host, m.last_seen_at, p.name as proj_name FROM machines m LEFT JOIN projects p ON m.project_id = p.id WHERE m.removed_at IS NULL ORDER BY m.last_seen_at DESC NULLS LAST LIMIT 15;")
            del_reqs = await conn.fetch("SELECT id, user_name, user_email, telegram_chat_id, status, requested_at FROM account_deletion_requests WHERE status = 'pending' ORDER BY requested_at DESC LIMIT 5;")

        lines = [
            t["admin_title"],
            t["admin_owner"],
            t["admin_server_info"],
            "",
            f"{t['admin_users']} ({len(users)}):",
        ]
        for u in users:
            tg_info = f" · @{u['telegram_username']}" if u['telegram_username'] else (f" · tg: {u['telegram_chat_id']}" if u['telegram_chat_id'] else "")
            email_info = f" ({u['email']})" if u['email'] else ""
            lines.append(f"• <b>{html.escape(u['name'] or 'Безымянный')}</b>{email_info}{tg_info}")

        lines.append("")
        lines.append(f"{t['admin_machines']} ({len(machines)}):")
        now = time.time()
        for m in machines:
            ls = m['last_seen_at']
            is_online = bool(ls and (now - ls.timestamp() < 120))
            dot = "🟢" if is_online else "⚪"
            kind_str = m['kind']
            proj_str = f" [{m['proj_name']}]" if m['proj_name'] else ""
            lines.append(f"• {dot} <b>{html.escape(m['name'])}</b> ({kind_str}){proj_str}")

        lines.append("")
        lines.append(f"{t['admin_del_reqs']} ({len(del_reqs)}):")
        if del_reqs:
            for r in del_reqs:
                lines.append(f"• ⚠️ <b>{html.escape(r['user_name'] or '')}</b> ({r['user_email']}) — ожидает подтверждения")
        else:
            lines.append(t["admin_no_del"])

        text = "\n".join(lines)
        kb_rows = []
        if del_reqs:
            for r in del_reqs:
                short_mail = (r['user_email'] or "User")[:12]
                kb_rows.append([
                    {"text": f"✅ {t['btn_approve']} {short_mail}", "callback_data": f"deluser:confirm:{r['id']}"},
                    {"text": f"❌ {t['btn_reject']}", "callback_data": f"deluser:reject:{r['id']}"},
                ])

        kb_rows.append([
            {"text": "👥 Управление пользователями", "callback_data": "u:list:0"},
        ])
        kb_rows.append([
            {"text": "👥 Управление пользователями", "callback_data": "u:list:0"},
        ])
        kb_rows.append([
            {"text": t["btn_refresh"], "callback_data": "admin:refresh"},
            {"text": t["btn_machines"], "callback_data": "menu:machines"},
            {"text": t["btn_webapp"], "web_app": {"url": self.web_url}},
        ])

        reply_markup = {"inline_keyboard": kb_rows}
        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup=reply_markup)
        else:
            await self.send_message(str(chat_id), text, reply_markup=reply_markup)


    # ------------------------------------------------------------- Admin: User Management
    async def _show_admin_users_list(self, chat_id: str | int, page: int = 0, msg_id: Optional[int] = None) -> None:
        if not self.pool:
            await self.send_message(chat_id, "⚠️ База данных недоступна.")
            return

        page_size = 5
        async with self.pool.acquire() as conn:
            total_count = await conn.fetchval("SELECT count(*) FROM users;") or 0
            total_pages = max(1, (total_count + page_size - 1) // page_size)
            page = max(0, min(page, total_pages - 1))
            offset = page * page_size
            users = await conn.fetch(
                "SELECT id, name, email, plan_id, telegram_chat_id, telegram_username, is_blocked, blocked_until, created_at "
                "FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2;",
                page_size, offset
            )

        lines = [
            "👥 <b>Управление пользователями tTerm</b>",
            f"Всего пользователей: <b>{total_count}</b> • Стр. <b>{page + 1}/{total_pages}</b>",
            "<i>Выберите пользователя для управления профилем, блокировкой и тарифом:</i>",
            ""
        ]

        now_dt = datetime.now(timezone.utc)
        user_buttons = []
        for idx, u in enumerate(users, start=offset + 1):
            is_blk = u["is_blocked"] and (not u["blocked_until"] or u["blocked_until"] > now_dt)
            status_dot = "🔴" if is_blk else "🟢"
            plan = (u["plan_id"] or "free").upper()
            u_name = u["name"] or "Безымянный"
            tg_str = f" · @{u['telegram_username']}" if u["telegram_username"] else (f" · tg:{u['telegram_chat_id']}" if u["telegram_chat_id"] else " · <i>без tg</i>")
            email_str = f" ({u['email']})" if u["email"] else ""
            lines.append(f"{idx}. {status_dot} <b>{html.escape(u_name)}</b> [{plan}]{email_str}{tg_str}")

            short_label = f"👤 {u_name[:16]} [{plan}]"
            user_buttons.append([{"text": short_label, "callback_data": f"u:view:{u['id']}:{page}"}])

        kb_rows = []
        kb_rows.extend(user_buttons)

        # Pagination
        nav_row = []
        if page > 0:
            nav_row.append({"text": "⬅️ Назад", "callback_data": f"u:list:{page - 1}"})
        nav_row.append({"text": f"🔄 {page + 1}/{total_pages}", "callback_data": f"u:list:{page}"})
        if page < total_pages - 1:
            nav_row.append({"text": "Вперёд ➡️", "callback_data": f"u:list:{page + 1}"})
        if nav_row:
            kb_rows.append(nav_row)

        kb_rows.append([
            {"text": "📊 В панель", "callback_data": "admin:refresh"},
            {"text": "🖥 Машины", "callback_data": "menu:machines"},
        ])

        text = "\n".join(lines)
        reply_markup = {"inline_keyboard": kb_rows}

        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup=reply_markup)
        else:
            await self.send_message(str(chat_id), text, reply_markup=reply_markup)

    async def _show_admin_user_card(self, chat_id: str | int, target_user_id: str, page: int = 0, msg_id: Optional[int] = None) -> None:
        if not self.pool:
            await self.send_message(chat_id, "⚠️ База данных недоступна.")
            return

        t_uuid = _parse_uuid(target_user_id)
        if not t_uuid:
            await self.send_message(chat_id, "❌ Неверный ID пользователя.")
            return

        async with self.pool.acquire() as conn:
            u = await conn.fetchrow(
                "SELECT id, name, email, plan_id, telegram_chat_id, telegram_username, is_blocked, blocked_reason, blocked_until, subscription_expires_at, created_at "
                "FROM users WHERE id = $1;",
                t_uuid
            )
            if not u:
                await self.send_message(chat_id, "❌ Пользователь не найден в базе данных.")
                return

            machines_count = await conn.fetchval("SELECT count(*) FROM machines WHERE created_by = $1 AND removed_at IS NULL;", t_uuid) or 0
            projects_count = await conn.fetchval("SELECT count(*) FROM projects WHERE owner_id = $1;", t_uuid) or 0

        is_target_owner = (str(u["telegram_chat_id"]) == "55570186" or (u["email"] and u["email"].lower() == "eklimov84@xmail.ru"))
        now_dt = datetime.now(timezone.utc)
        is_curr_blocked = u["is_blocked"] and (not u["blocked_until"] or u["blocked_until"] > now_dt)

        status_text = "🟢 Активен"
        if is_curr_blocked:
            if u["blocked_until"]:
                status_text = f"⏳ Временный блок (до {u['blocked_until'].strftime('%d.%m.%Y %H:%M UTC')})"
            else:
                status_text = "🔴 Заблокирован бессрочно"

        sub_exp_text = u["subscription_expires_at"].strftime('%d.%m.%Y') if u["subscription_expires_at"] else "Бессрочно"
        tg_text = f"@{u['telegram_username']} (<code>{u['telegram_chat_id']}</code>)" if u["telegram_chat_id"] else "<i>Не привязан</i>"

        lines = [
            f"👤 <b>Досье пользователя tTerm</b>",
            "",
            f"• <b>Имя:</b> {html.escape(u['name'] or 'Не указано')}",
            f"• <b>Email:</b> {html.escape(u['email'] or 'Не указан')}",
            f"• <b>Статус:</b> {status_text}",
            f"• <b>Тарифный план:</b> <b>{(u['plan_id'] or 'free').upper()}</b>",
            f"• <b>Подписка активна до:</b> {sub_exp_text}",
            f"• <b>Telegram:</b> {tg_text}",
            f"• <b>Регистрация:</b> {u['created_at'].strftime('%d.%m.%Y %H:%M')}",
            f"• <b>Ресурсы:</b> Машин: <b>{machines_count}</b> • Проектов: <b>{projects_count}</b>",
            f"• <b>UUID:</b> <code>{u['id']}</code>",
        ]
        if u.get("blocked_reason"):
            lines.append(f"• <b>Причина блокировки:</b> <i>{html.escape(u['blocked_reason'])}</i>")

        kb_rows = []

        # Row 1: Access / Block actions (disallowed on owner)
        if not is_target_owner:
            if not is_curr_blocked:
                kb_rows.append([
                    {"text": "🚫 Блок бессрочно", "callback_data": f"u:block:{u['id']}:{page}"},
                    {"text": "⏱ Блок на 24ч", "callback_data": f"u:block24:{u['id']}:{page}"},
                ])
            else:
                kb_rows.append([
                    {"text": "✅ Разблокировать", "callback_data": f"u:unblock:{u['id']}:{page}"},
                ])

        # Row 2: Telegram connection
        if u["telegram_chat_id"]:
            if not is_target_owner:
                kb_rows.append([{"text": "🔗 Отвязать Telegram", "callback_data": f"u:unbind:{u['id']}:{page}"}])
        else:
            kb_rows.append([{"text": "🔑 Создать ссылку привязки", "callback_data": f"u:bindlink:{u['id']}:{page}"}])

        # Row 3: Plan and Subscription
        kb_rows.append([
            {"text": "💎 Сменить тариф", "callback_data": f"u:plan_menu:{u['id']}:{page}"},
            {"text": "⏳ Срок подписки", "callback_data": f"u:sub_menu:{u['id']}:{page}"},
        ])

        # Row 4: Edit profile fields
        kb_rows.append([
            {"text": "✏️ Изменить имя", "callback_data": f"u:edit_name:{u['id']}:{page}"},
            {"text": "✉️ Изменить Email", "callback_data": f"u:edit_email:{u['id']}:{page}"},
        ])

        # Row 5: Delete user
        if not is_target_owner:
            kb_rows.append([{"text": "🗑 Удалить пользователя", "callback_data": f"u:ask_del:{u['id']}:{page}"}])

        # Row 6: Return navigation
        kb_rows.append([
            {"text": "« К списку пользователей", "callback_data": f"u:list:{page}"},
            {"text": "📊 В панель", "callback_data": "admin:refresh"},
        ])

        text = "\n".join(lines)
        reply_markup = {"inline_keyboard": kb_rows}

        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup=reply_markup)
        else:
            await self.send_message(str(chat_id), text, reply_markup=reply_markup)

    async def _show_admin_plan_menu(self, chat_id: str | int, target_user_id: str, page: int = 0, msg_id: Optional[int] = None) -> None:
        text = "💎 <b>Выберите тарифный план для пользователя:</b>\n\n• <b>FREE:</b> 50 машин, 24 терминала\n• <b>PRO:</b> 200 машин, 100 терминалов\n• <b>ENTERPRISE:</b> 1000 машин, 500 терминалов"
        kb = [
            [{"text": "Free (Стандартный)", "callback_data": f"u:set_plan:{target_user_id}:free:{page}"}],
            [{"text": "Pro (Расширенный)", "callback_data": f"u:set_plan:{target_user_id}:pro:{page}"}],
            [{"text": "Enterprise (Безлимитный)", "callback_data": f"u:set_plan:{target_user_id}:enterprise:{page}"}],
            [{"text": "« Назад к карточке", "callback_data": f"u:view:{target_user_id}:{page}"}],
        ]
        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup={"inline_keyboard": kb})
        else:
            await self.send_message(str(chat_id), text, reply_markup={"inline_keyboard": kb})

    async def _show_admin_sub_menu(self, chat_id: str | int, target_user_id: str, page: int = 0, msg_id: Optional[int] = None) -> None:
        text = "⏳ <b>Управление сроком действия подписки:</b>\n\nВыберите продление срока доступа пользователя к платформе:"
        kb = [
            [
                {"text": "+30 дней", "callback_data": f"u:set_sub:{target_user_id}:30:{page}"},
                {"text": "+90 дней", "callback_data": f"u:set_sub:{target_user_id}:90:{page}"},
            ],
            [
                {"text": "+365 дней", "callback_data": f"u:set_sub:{target_user_id}:365:{page}"},
                {"text": "Бессрочно", "callback_data": f"u:set_sub:{target_user_id}:forever:{page}"},
            ],
            [{"text": "« Назад к карточке", "callback_data": f"u:view:{target_user_id}:{page}"}],
        ]
        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup={"inline_keyboard": kb})
        else:
            await self.send_message(str(chat_id), text, reply_markup={"inline_keyboard": kb})

    async def _show_admin_del_confirm(self, chat_id: str | int, target_user_id: str, page: int = 0, msg_id: Optional[int] = None) -> None:
        if not self.pool:
            return
        t_uuid = _parse_uuid(target_user_id)
        if not t_uuid:
            return

        async with self.pool.acquire() as conn:
            u = await conn.fetchrow("SELECT name, email FROM users WHERE id = $1", t_uuid)
            if not u:
                return

        u_name = u["name"] or "Пользователь"
        u_email = u["email"] or "без email"

        text = (
            f"⚠️ <b>ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ АККАУНТА</b>\n\n"
            f"Вы собираетесь безвозвратно удалить пользователя:\n"
            f"👤 <b>{html.escape(u_name)}</b> ({html.escape(u_email)})\n\n"
            f"Все сессии, терминалы и привязки будут аннулированы.\n\n"
            f"<b>Вы подтверждаете удаление?</b>"
        )
        kb = [
            [{"text": "🔥 ДА, УДАЛИТЬ БЕЗВОЗВРАТНО", "callback_data": f"u:do_del:{target_user_id}:{page}"}],
            [{"text": "❌ Отмена", "callback_data": f"u:view:{target_user_id}:{page}"}],
        ]
        if msg_id:
            await self.edit_message(str(chat_id), msg_id, text, reply_markup={"inline_keyboard": kb})
        else:
            await self.send_message(str(chat_id), text, reply_markup={"inline_keyboard": kb})

    async def _send_command_result(self, chat_id: str, res: Dict[str, Any], initial_msg_id: Optional[int] = None) -> None:
        if not res.get("ok"):
            err_msg = f"❌ <b>Ошибка:</b> {html.escape(str(res.get('error')))}"
            if initial_msg_id:
                await self.edit_message(chat_id, initial_msg_id, err_msg)
            else:
                await self.send_message(chat_id, err_msg, reply_markup=self._main_keyboard())
            return

        exit_code = res.get("exit_code", 0)
        machine = res.get("machine", "remote")
        command = res.get("command", "")
        duration = res.get("duration", 0.0)
        output = res.get("output", "")
        cwd = res.get("cwd") or "~"

        try:
            from ..core import formatter
            state = formatter.State(
                cwd=cwd,
                user=html.escape(machine),
                host=machine,
                icon="🖥" if res.get("machine_kind") == "computer" else "🌐",
            )
            rendered = formatter.render(
                output=output,
                exit_code=exit_code,
                duration=duration,
                state=state,
                command=command,
                stderr=res.get("error", "") if not res.get("ok") else ""
            )
            if rendered.mode == "text":
                kb = {"inline_keyboard": [[{"text": "🔄 Повторить", "callback_data": f"rerun:{command[:64]} "}]]}
                if initial_msg_id:
                    await self.edit_message(chat_id, initial_msg_id, rendered.text, reply_markup=kb)
                else:
                    await self.send_message(chat_id, rendered.text, reply_markup=kb)
                return
            else:
                await self.send_document_file(chat_id, rendered.file_name, rendered.file_body, caption=rendered.text)
                return
        except Exception as e_f:
            log.warning("Formatter render error: %s (using classic layout)", e_f)

        status_dot = "🟢" if exit_code == 0 else "🔴"
        preview = output[:3200] if output else ""
        truncated = len(output) > 3200
        parts = [f"🌐 <b>{html.escape(machine)}</b> · {status_dot} {exit_code} <i>({duration:.1f}с)</i>"]
        if preview:
            parts.append(f"<pre>{html.escape(preview)}</pre>")
        if truncated:
            parts.append(f"<i>... вывод сокращён (+{len(output) - 3200} симв.)</i>")
        parts.append(f"<code>{html.escape(cwd)} ❯</code>")

        msg_text = "\n".join(parts)
        kb = {"inline_keyboard": [[{"text": "🔄 Повторить", "callback_data": f"rerun:{command[:64]} "}]]}

        if initial_msg_id:
            await self.edit_message(chat_id, initial_msg_id, msg_text, reply_markup=kb)
        else:
            await self.send_message(chat_id, msg_text, reply_markup=kb)

    def _main_keyboard(self, is_owner: bool = False, lang: str = "ru") -> Dict[str, Any]:
        t = I18N.get(lang, I18N["ru"])
        first_row = [{"text": t["btn_webapp"], "web_app": {"url": self.web_url}}]
        second_row = [
            {"text": f"🖥 {t['btn_machines']}", "callback_data": "menu:machines"},
            {"text": f"ℹ️ {t['btn_help']}", "callback_data": "menu:help"},
        ]
        keyboard = [first_row, second_row]
        if is_owner:
            keyboard.append([
                {"text": f"📊 {t['btn_admin']}", "callback_data": "admin:refresh"},
                {"text": "👥 Пользователи", "callback_data": "u:list:0"},
            ])
        return {"inline_keyboard": keyboard}

    def _unbound_keyboard(self, lang: str = "ru") -> Dict[str, Any]:
        t = I18N.get(lang, I18N["ru"])
        return {
            "inline_keyboard": [
                [{"text": t["btn_webapp"], "web_app": {"url": self.web_url}}],
                [{"text": f"ℹ️ {t['btn_help']}", "callback_data": "menu:help"}],
            ]
        }


# Singleton bot manager
telegram_bot = TelegramBotManager()
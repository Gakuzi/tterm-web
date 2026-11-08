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
        # bind_token -> { "user_id": str, "expires_at": float }
        self._pending_binds: Dict[str, Dict[str, Any]] = {}
        # chat_id -> { "command": str, "machine_id": str, "expires_at": float }
        self._pending_danger: Dict[str, Dict[str, Any]] = {}
        # session_token -> { "approved": bool, "chat_id": str, ... }
        self._pending_auth_sessions: Dict[str, Dict[str, Any]] = {}

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
        self._bot_id = None

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
                    {"command": "machines", "description": "Выбор активной машины"},
                    {"command": "help", "description": "Справка и команды"},
                ]
            })
        except Exception as e_cmd:
            log.debug("Could not set bot commands: %s", e_cmd)

        return True

    # ------------------------------------------------------------- Messaging
    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        reply_markup: Optional[Dict[str, Any]] = None,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
    ) -> bool:
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
        return bool(res.get("ok"))

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
            "expires_at": time.time() + 600,
        }
        return token, f"https://t.me/{self.bot_username}?start={token}"

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
            # Check users by telegram_chat_id
            row = await conn.fetchrow(
                "SELECT id, name, email, is_local_owner, plan_id, telegram_chat_id, telegram_username "
                "FROM users WHERE telegram_chat_id = $1", str(chat_id)
            )
            if row:
                return row
            # Check if this chat_id matches the single owner configured in environment
            owner_chat = os.environ.get("TTERM_TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID")
            if owner_chat and str(chat_id) == str(owner_chat):
                owner = await conn.fetchrow("SELECT id, name, email, is_local_owner, plan_id FROM users WHERE is_local_owner = true LIMIT 1")
                if owner:
                    await conn.execute("UPDATE users SET telegram_chat_id = $1 WHERE id = $2", str(chat_id), owner["id"])
                    return await conn.fetchrow("SELECT id, name, email, is_local_owner, plan_id, telegram_chat_id, telegram_username FROM users WHERE id = $1", owner["id"])
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

        # 1. Command /start
        if text.startswith("/start"):
            parts = text.split(maxsplit=1)
            param = parts[1].strip() if len(parts) > 1 else ""

            # 1a. Handle /start bind_<token>
            if param.startswith("bind_"):
                bind_data = self._pending_binds.pop(param, None)
                if not bind_data or time.time() > bind_data["expires_at"]:
                    await self.send_message(
                        chat_id,
                        "⚠️ <b>Срок действия ссылки привязки истёк.</b>\n"
                        "Пожалуйста, нажмите «Привязать Telegram» в настройках веб-интерфейса tTerm заново.",
                        reply_markup=self._main_keyboard(),
                    )
                    return

                target_user_id = bind_data["user_id"]
                bound_user = await self.bind_user_telegram(target_user_id, chat_id, username)
                if bound_user:
                    u_email = bound_user.get("email") or "аккаунт"
                    u_name = bound_user.get("name") or first_name
                    await self.send_message(
                        chat_id,
                        f"✅ <b>Telegram успешно привязан!</b>\n\n"
                        f"Здравствуйте, <b>{first_name}</b>!\n"
                        f"Ваш профиль Telegram (@{username or chat_id}) успешно связан с аккаунтом:\n"
                        f"📧 <b>{u_email}</b> ({u_name})\n\n"
                        f"💡 <b>Теперь вам доступно:</b>\n"
                        f"• Вход в <b>tTerm</b> в 1 клик через Web App прямо из этого чата без повторного ввода паролей и кодов\n"
                        f"• Доступ ко всем вашим терминалам и проектам\n"
                        f"• Мгновенные уведомления о статусах и завершении команд\n\n"
                        f"Нажмите кнопку <b>tTerm</b> ниже, чтобы открыть терминал:",
                        reply_markup=self._main_keyboard(),
                    )
                else:
                    await self.send_message(chat_id, "❌ Не удалось привязать профиль к базе данных.")
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
                    reply_markup=self._main_keyboard(),
                )
                return

            # 1c. Regular /start
            user_row = await self.get_user_by_telegram(chat_id)
            if user_row:
                active_m_name = "не выбрана"
                active_id = self._user_active_machines.get(chat_id)
                if active_id and self.pool:
                    async with self.pool.acquire() as conn:
                        m_row = await conn.fetchrow("SELECT name FROM machines WHERE id = $1", uuid.UUID(active_id))
                        if m_row:
                            active_m_name = m_row["name"]

                await self.send_message(
                    chat_id,
                    f"👋 <b>Добро пожаловать в tTerm AI Hub!</b>\n\n"
                    f"👤 Профиль: <b>{user_row['name']}</b> (@{username or chat_id})\n"
                    f"🖥 Активная машина: <b>{active_m_name}</b>\n\n"
                    f"💡 <i>Отправьте любую команду (например: <code>uptime</code>, <code>free -m</code>, <code>docker ps</code>) для запуска на активной машине.</i>",
                    reply_markup=self._main_keyboard(),
                )
            else:
                await self.send_message(
                    chat_id,
                    f"👋 Здравствуйте, <b>{first_name}</b>!\n\n"
                    f"Добро пожаловать в <b>tTerm AI Hub</b> (авторская надстройка Евгения Климова на базе tTerm AGPLv3).\n\n"
                    f"Для привязки этого Telegram к вашему аккаунту нажмите кнопку «Привязать Telegram» в настройках на сайте или откройте встроенный Web App:",
                    reply_markup=self._unbound_keyboard(),
                )
            return

        # 2. Command /app (open Web App)
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

        # 3. Command /machines or /use
        if text.startswith("/machines") or text.startswith("/use") or text == "🖥 Машины":
            await self._show_machines_menu(chat_id)
            return

        # 4. Command /help
        if text.startswith("/help") or text == "ℹ️ Помощь":
            await self.send_message(
                chat_id,
                "📖 <b>Команды tTerm Telegram Bot</b>\n\n"
                "• <b>/machines</b> или <b>/use</b> — выбор активной машины\n"
                "• <b>/app</b> — открыть терминал в Telegram Web App\n"
                "• <b>Любой текст</b> — выполнение команды на выбранной машине\n\n"
                "🛡 <b>Безопасность:</b>\n"
                "Разрушительные команды (rm -rf, mkfs, DROP) требуют явного подтверждения кнопкой.\n\n"
                "⚖️ <i>Основано на открытой платформе tTerm (Denis / GNU AGPLv3). Модернизация: Евгений Климов.</i>",
                reply_markup=self._main_keyboard(),
            )
            return

        # 5. Non-command text -> Execute on active machine!
        user_row = await self.get_user_by_telegram(chat_id)
        if not user_row:
            await self.send_message(
                chat_id,
                "⚠️ <b>Аккаунт не привязан.</b>\n"
                "Для выполнения команд привяжите свой Telegram-аккаунт в настройках tTerm:",
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
                    "Установите агент на компьютер или запустите сервер, чтобы выполнять команды.",
                    reply_markup=self._main_keyboard(),
                )
                return
            else:
                # Multiple machines: prompt user to pick
                await self._show_machines_menu(chat_id, note="Выберите машину для выполнения команды:")
                return

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

        # Execute command!
        await self.send_message(chat_id, f"⏳ Запуск <code>{html.escape(text)}</code>...")
        res = await self.execute_command(user_row, active_id, text)
        await self._send_command_result(chat_id, res)

    # ------------------------------------------------------------- Handler: Callback Query
    async def _handle_callback(self, callback: Dict[str, Any]) -> None:
        cq_id = callback["id"]
        data = callback.get("data") or ""
        msg = callback.get("message") or {}
        chat = msg.get("chat") or {}
        chat_id = str(chat.get("id"))
        msg_id = msg.get("message_id")

        if data.startswith("use:"):
            machine_id = data[4:]
            self._user_active_machines[chat_id] = machine_id
            m_name = machine_id
            if self.pool:
                async with self.pool.acquire() as conn:
                    m_row = await conn.fetchrow("SELECT name FROM machines WHERE id = $1", uuid.UUID(machine_id))
                    if m_row:
                        m_name = m_row["name"]

            await self.answer_callback(cq_id, f"Выбрана машина: {m_name}")
            if msg_id:
                await self.edit_message(
                    chat_id, msg_id,
                    f"✅ Активная машина установлена: <b>{m_name}</b>\n\n"
                    f"Теперь отправляйте консольные команды прямо в чат.",
                    reply_markup=self._main_keyboard(),
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
                await self._send_command_result(chat_id, res)
            return

        if data.startswith("danger:cancel:"):
            key = data[14:]
            self._pending_danger.pop(key, None)
            await self.answer_callback(cq_id, "Команда отменена")
            if msg_id:
                await self.edit_message(chat_id, msg_id, "❌ Выполнение опасной команды отменено.")
            return

        if data.startswith("approval:"):
            # Approval gate reaction: approval:approve:<id> or approval:reject:<id>
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
    async def _show_machines_menu(self, chat_id: str, note: str = "") -> None:
        user_row = await self.get_user_by_telegram(chat_id)
        if not user_row:
            await self.send_message(chat_id, "⚠️ Аккаунт не привязан.", reply_markup=self._unbound_keyboard())
            return

        machines = await self.list_user_machines(user_row["id"])
        if not machines:
            await self.send_message(
                chat_id,
                "🖥 <b>Список машин</b>\n\n"
                "К вашему аккаунту пока не подключено ни одной машины.\n"
                "Откройте tTerm, чтобы добавить компьютер или сервер.",
                reply_markup=self._main_keyboard(),
            )
            return

        active_id = self._user_active_machines.get(chat_id)
        lines = ["🖥 <b>Доступные машины в проектах:</b>\n"]
        buttons = []

        for m in machines:
            is_active = (m["id"] == active_id)
            status_dot = "🟢" if m["online"] else "⚪"
            active_mark = " (активна)" if is_active else ""
            lines.append(f"{status_dot} <b>{m['name']}</b> ({m['kind']}){active_mark}")

            btn_text = f"{'⭐ ' if is_active else ''}{m['name']} ({'онлайн' if m['online'] else 'офлайн'})"
            buttons.append([{"text": btn_text, "callback_data": f"use:{m['id']}"}])

        lines.append(f"\n{note or 'Нажмите на кнопку, чтобы выбрать машину для выполнения команд:'}")
        await self.send_message(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def _send_command_result(self, chat_id: str, res: Dict[str, Any]) -> None:
        if not res.get("ok"):
            await self.send_message(chat_id, f"❌ <b>Ошибка:</b> {res.get('error')}", reply_markup=self._main_keyboard())
            return

        exit_code = res.get("exit_code", 0)
        status_icon = "✅" if exit_code == 0 else f"❌ ({exit_code})"
        machine = res.get("machine", "remote")
        command = res.get("command", "")
        duration = res.get("duration", 0)
        output = res.get("output", "")

        # Format output preview
        preview = output[:3400] if output else "[команда выполнилась без вывода]"
        truncated = len(output) > 3400

        msg_text = (
            f"🖥 <b>{machine}</b> · {status_icon} <i>({duration}с)</i>\n"
            f"<code>$ {html.escape(command)}</code>\n\n"
            f"<pre>{html.escape(preview)}</pre>"
        )
        if truncated:
            msg_text += f"\n\n<i>... вывод обрезан (+{len(output) - 3400} символов)</i>"

        await self.send_message(
            chat_id, msg_text,
            reply_markup={
                "inline_keyboard": [
                    [{"text": "tTerm", "web_app": {"url": self.web_url}}]
                ]
            }
        )

    def _main_keyboard(self) -> Dict[str, Any]:
        return {
            "inline_keyboard": [
                [{"text": "tTerm", "web_app": {"url": self.web_url}}],
                [
                    {"text": "🖥 Выбрать машину", "callback_data": "menu:machines"},
                    {"text": "ℹ️ Помощь", "callback_data": "menu:help"},
                ],
            ]
        }

    def _unbound_keyboard(self) -> Dict[str, Any]:
        return {
            "inline_keyboard": [
                [{"text": "tTerm", "web_app": {"url": self.web_url}}]
            ]
        }


# Singleton bot manager
telegram_bot = TelegramBotManager()

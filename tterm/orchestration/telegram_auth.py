"""
Telegram Authentication Provider for tTerm.
Allows users to sign in instantly via Telegram:
1. Deep-link 1-click login: User clicks link to open Bot -> taps Start -> web page logs in automatically.
2. 6-digit verification code: User enters Telegram username or Chat ID -> Bot dispatches code -> User signs in.
3. Official Telegram Login Widget: Instant HMAC verification.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
import ssl
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional, Tuple

try:
    import certifi
except ImportError:
    certifi = None

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..core import auth
from ..core.auth import SESSION_COOKIE, _account, _make_account, _new_session
from .encrypted_vault import encrypted_vault
from .notifications_bot import (
    get_user_telegram_config,
    save_user_telegram_config,
)
from .telegram_bot import telegram_bot, validate_webapp_init_data

log = logging.getLogger("tterm.orchestration.telegram_auth")

DEFAULT_BOT_TOKEN = "9021265541:AAHZYpinnQE60ptrlL3INGvj4g-4oMY0AzY"
DEFAULT_BOT_USERNAME = "ttermnofbot"
DEFAULT_CHAT_ID = "55570186"
DEFAULT_CLIENT_ID = "9021265541"
DEFAULT_CLIENT_SECRET = "OSsKQSzSRNrVfUrO4b2rXPJGT_Gtzl-NGZEn7d1VuX4Q9u2im6JQ6g"

router = APIRouter(prefix="/api/auth/telegram", tags=["telegram-auth"])

# Pending verification codes: id (chat_id or username.lower()) -> { code, expires_at, name, email, chat_id }
_pending_codes: Dict[str, Dict[str, Any]] = {}

# Known telegram users: username.lower() / str(id) -> { chat_id, username, first_name, id }
_known_telegram_users: Dict[str, Dict[str, Any]] = {}

# Pending 1-click deep-link sessions: session_token -> { approved: bool, telegram_id, username, name, code, at }
_pending_login_sessions: Dict[str, Dict[str, Any]] = {}

_polling_task: Optional[asyncio.Task] = None
_cached_bot_username: Optional[str] = None


def _get_bot_token_and_chat(user_id: str = "owner-user") -> tuple[Optional[str], Optional[str]]:
    """Retrieves bot token and default chat from environment, vault or config."""
    env_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    env_chat = os.environ.get("TELEGRAM_CHAT_ID")
    if env_token:
        return env_token, env_chat

    cfg = get_user_telegram_config(user_id)
    if cfg.get("configured") and cfg.get("bot_token"):
        return cfg.get("bot_token"), cfg.get("chat_id")

    # Check default user config
    default_cfg = get_user_telegram_config("default")
    if default_cfg.get("configured") and default_cfg.get("bot_token"):
        return default_cfg.get("bot_token"), default_cfg.get("chat_id")

    # Check encrypted vault
    secrets = encrypted_vault.load_secrets_sync(user_id)
    token = secrets.get("telegram_bot_token")
    chat = secrets.get("telegram_chat_id")
    if token:
        return str(token), str(chat) if chat else None

    return DEFAULT_BOT_TOKEN, DEFAULT_CHAT_ID


def _get_client_id(token: Optional[str] = None, user_id: str = "owner-user") -> str:
    """Returns Telegram Client ID (the bot's numeric identifier)."""
    env_id = os.environ.get("TELEGRAM_CLIENT_ID")
    if env_id:
        return env_id
    secrets = encrypted_vault.load_secrets_sync(user_id)
    if secrets.get("telegram_client_id"):
        return str(secrets["telegram_client_id"])
    if not token:
        token, _ = _get_bot_token_and_chat(user_id)
    if token and ":" in token:
        return token.split(":", 1)[0]
    return "9021265541"


def _get_client_secret(user_id: str = "owner-user") -> Optional[str]:
    """Returns Telegram Client Secret."""
    env_sec = os.environ.get("TELEGRAM_CLIENT_SECRET")
    if env_sec:
        return env_sec
    secrets = encrypted_vault.load_secrets_sync(user_id)
    return secrets.get("telegram_client_secret") or "OSsKQSzSRNrVfUrO4b2rXPJGT_Gtzl-NGZEn7d1VuX4Q9u2im6JQ6g"


def _get_bot_username(token: Optional[str] = None) -> str:
    """Returns the bot's username (without @), querying getMe if not cached."""
    global _cached_bot_username
    env_name = os.environ.get("TELEGRAM_BOT_NAME")
    if env_name:
        return env_name.lstrip("@")
    if _cached_bot_username:
        return _cached_bot_username

    if not token:
        token, _ = _get_bot_token_and_chat()
    if not token:
        return DEFAULT_BOT_USERNAME

    try:
        url = f"https://api.telegram.org/bot{token}/getMe"
        req = urllib.request.Request(url, headers={"User-Agent": "tTerm-Bot/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                username = data.get("result", {}).get("username")
                if username:
                    _cached_bot_username = username
                    os.environ["TELEGRAM_BOT_NAME"] = username
                    return username
    except Exception as e:
        log.warning("Could not resolve bot username via getMe: %s", e)

    return DEFAULT_BOT_USERNAME


def _send_telegram_raw(token: str, chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    """Directly sends a message via Telegram Bot API sendMessage."""
    if not token or not chat_id:
        return False
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": str(chat_id),
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "tTerm-Auth/1.0"},
        )
        ctx = ssl.create_default_context()
        if certifi:
            ctx.load_verify_locations(cafile=certifi.where())
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            return res_data.get("ok", False)
    except Exception as exc:
        log.warning("Telegram sendMessage error to %s: %s", chat_id, exc)
        return False


async def _async_send_telegram(token: str, chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    """Async wrapper for direct Telegram sendMessage."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _send_telegram_raw(token, chat_id, text, parse_mode))


async def _telegram_polling_worker(token: str):
    """Background long-polling worker to receive /start, /login and message updates."""
    log.info("Telegram Bot background polling worker started.")
    offset = 0
    _get_bot_username(token)

    while True:
        try:
            url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset}&timeout=20"
            req = urllib.request.Request(url, headers={"User-Agent": "tTerm-Bot/1.0"})
            loop = asyncio.get_running_loop()

            def fetch_updates():
                try:
                    with urllib.request.urlopen(req, timeout=25) as resp:
                        return resp.read()
                except Exception as ex:
                    log.debug("Telegram polling connection: %s", ex)
                    return None

            resp_bytes = await loop.run_in_executor(None, fetch_updates)
            if not resp_bytes:
                await asyncio.sleep(3)
                continue

            data = json.loads(resp_bytes.decode("utf-8"))
            if not data.get("ok"):
                await asyncio.sleep(5)
                continue

            for update in data.get("result", []):
                offset = max(offset, update["update_id"] + 1)
                msg = update.get("message") or update.get("callback_query", {}).get("message")
                if not msg:
                    continue

                from_user = msg.get("from") or {}
                chat = msg.get("chat") or {}
                chat_id = str(chat.get("id"))
                username = (from_user.get("username") or "").lower().strip()
                first_name = from_user.get("first_name") or "User"
                text = (msg.get("text") or "").strip()

                user_meta = {
                    "chat_id": chat_id,
                    "first_name": first_name,
                    "username": username,
                    "id": from_user.get("id"),
                }
                if username:
                    _known_telegram_users[username] = user_meta
                _known_telegram_users[chat_id] = user_meta

                # Process /start or /login
                if text.startswith("/start") or text.startswith("/login"):
                    parts = text.split(maxsplit=1)
                    param = parts[1] if len(parts) > 1 else ""

                    code = f"{random.randint(100000, 999999)}"
                    now = time.time()
                    code_entry = {
                        "code": code,
                        "expires_at": now + 600,
                        "name": first_name,
                        "chat_id": chat_id,
                        "username": username,
                    }
                    _pending_codes[chat_id] = code_entry
                    if username:
                        _pending_codes[username] = code_entry

                    # Check if user clicked an auth session deep-link: /start auth_<session_token>
                    approved_session = False
                    if param and param.startswith("auth_"):
                        token_key = param[5:]
                        _pending_login_sessions[token_key] = {
                            "approved": True,
                            "telegram_id": chat_id,
                            "username": username,
                            "name": first_name,
                            "code": code,
                            "at": now,
                        }
                        approved_session = True

                    if approved_session:
                        reply = (
                            f"✅ <b>Вход в tTerm подтвержден!</b>\n\n"
                            f"Здравствуйте, <b>{first_name}</b>!\n"
                            f"Ваша веб-сессия сейчас автоматически откроется в браузере.\n\n"
                            f"Резервный проверочный код: <code>{code}</code>"
                        )
                    else:
                        reply = (
                            f"👋 Здравствуйте, <b>{first_name}</b>!\n\n"
                            f"🔐 Ваш проверочный код для входа в <b>tTerm</b>:\n\n"
                            f"👉 <code>{code}</code>\n\n"
                            f"⏳ <i>Код действителен 10 минут. Введите его на сайте для входа.</i>"
                        )

                    sent_ok = await _async_send_telegram(token, chat_id, reply, parse_mode="HTML")
                    log.info("Telegram Bot dispatched code %s to %s (@%s), ok=%s", code, chat_id, username, sent_ok)

        except asyncio.CancelledError:
            log.info("Telegram polling worker stopped.")
            break
        except Exception as e:
            log.warning("Telegram polling error: %s (reconnecting in 4s)", e)
            await asyncio.sleep(4)


def _ensure_polling_started():
    """Delegated to unified telegram_bot engine to prevent 409 getUpdates conflict."""
    pass


class TelegramCodeRequest(BaseModel):
    telegram_id: str = Field(..., description="Telegram username, Chat ID, or phone")
    name: Optional[str] = Field(None, description="Display name for new accounts")


class TelegramVerifyRequest(BaseModel):
    telegram_id: str = Field(..., description="Telegram username, Chat ID, or phone")
    code: str = Field(..., description="6-digit verification code")


class TelegramWidgetAuth(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class TelegramWebAppLoginRequest(BaseModel):
    init_data: str = Field(..., description="Raw window.Telegram.WebApp.initData")


class TelegramConfigureDTO(BaseModel):
    bot_token: str = Field(..., description="Telegram Bot API Token from @BotFather")
    bot_username: Optional[str] = Field(None, description="Bot username without @")
    chat_id: Optional[str] = Field(None, description="Default admin chat ID")
    client_id: Optional[str] = Field(None, description="Telegram Client ID")
    client_secret: Optional[str] = Field(None, description="Telegram Client Secret")


@router.get("/status")
async def telegram_auth_status(request: Request):
    """Returns whether Telegram Bot login is available, and the bot username/link."""
    token, chat = _get_bot_token_and_chat()
    bot_name = _get_bot_username(token) if token else ""
    _ensure_polling_started()

    return {
        "ok": True,
        "bot_configured": bool(token),
        "bot_username": bot_name,
        "bot_link": f"https://t.me/{bot_name}" if bot_name else None,
        "client_id": _get_client_id(token),
        "has_client_secret": bool(_get_client_secret()),
    }


@router.post("/configure")
async def configure_telegram_bot(data: TelegramConfigureDTO, request: Request):
    """Validates and saves Telegram Bot credentials, launching polling immediately."""
    global _polling_task, _cached_bot_username
    token = data.bot_token.strip()
    if not token or ":" not in token:
        raise HTTPException(status_code=400, detail="Неверный формат токена Telegram бота (ожидается ID:ХЭШ)")

    # Verify token with getMe
    detected_username = data.bot_username
    try:
        url = f"https://api.telegram.org/bot{token}/getMe"
        req = urllib.request.Request(url, headers={"User-Agent": "tTerm-Bot/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            me_data = json.loads(resp.read().decode("utf-8"))
            if not me_data.get("ok"):
                raise HTTPException(status_code=400, detail="Telegram API отклонил токен бота (getMe вернул ошибку)")
            bot_info = me_data.get("result", {})
            detected_username = bot_info.get("username") or detected_username
    except urllib.error.HTTPError as he:
        raise HTTPException(status_code=400, detail=f"Ошибка проверки токена Telegram API: {he.code}")
    except Exception as ex:
        log.warning("Could not reach Telegram API to verify getMe: %s", ex)

    # Save token & username
    os.environ["TELEGRAM_BOT_TOKEN"] = token
    if detected_username:
        _cached_bot_username = detected_username
        os.environ["TELEGRAM_BOT_NAME"] = detected_username

    save_user_telegram_config("owner-user", token, data.chat_id or "", True)
    save_user_telegram_config("default", token, data.chat_id or "", True)
    
    vault_data = {
        "telegram_bot_token": token,
        "telegram_bot_username": detected_username,
        "telegram_chat_id": data.chat_id or "",
        "telegram_client_id": data.client_id or _get_client_id(token),
    }
    if data.client_secret:
        vault_data["telegram_client_secret"] = data.client_secret.strip()

    encrypted_vault.save_secrets_sync("owner-user", vault_data)

    # Restart polling task
    if _polling_task and not _polling_task.done():
        _polling_task.cancel()
    _polling_task = asyncio.create_task(_telegram_polling_worker(token))

    return {
        "ok": True,
        "bot_configured": True,
        "bot_username": detected_username,
        "bot_link": f"https://t.me/{detected_username}" if detected_username else None,
        "message": f"Telegram-бот @{detected_username} успешно подключен и готов к авторизации!",
    }


@router.post("/create-session")
async def create_auth_session():
    """Creates a temporary login session token for 1-click deep-link authentication."""
    token, _ = _get_bot_token_and_chat()
    bot_name = _get_bot_username(token)
    session_token = uuid.uuid4().hex[:12]
    _pending_login_sessions[session_token] = {
        "approved": False,
        "created_at": time.time(),
    }
    _ensure_polling_started()

    link = f"https://t.me/{bot_name}?start=auth_{session_token}" if bot_name else None
    return {
        "ok": True,
        "session_token": session_token,
        "bot_username": bot_name,
        "bot_link": link,
        "auth_url": link,
    }


@router.get("/check-session")
async def check_auth_session(token: str, request: Request, response: Response):
    """Checks whether the user tapped Start in the bot for the given session token."""
    sess = _pending_login_sessions.get(token)
    if not sess:
        return {"ok": False, "approved": False}

    if not sess.get("approved"):
        return {"ok": True, "approved": False}

    # Session was approved in Telegram! Finalize sign in
    _pending_login_sessions.pop(token, None)
    clean_id = sess.get("telegram_id")
    user_name = sess.get("name") or "Telegram User"

    res = await _finalize_telegram_signin(
        clean_id=clean_id,
        user_name=user_name,
        request=request,
        response=response,
        method_label=f"Telegram Deep-link (@{sess.get('username') or clean_id})",
    )
    return {
        "ok": True,
        "approved": True,
        "signedIn": True,
        "result": res,
        **res,
    }


@router.post("/request-code")
async def request_telegram_code(data: TelegramCodeRequest, request: Request):
    """Generates a 6-digit sign-in code and sends it via Telegram bot."""
    _ensure_polling_started()
    clean_id = str(data.telegram_id).strip().lstrip("@")
    if not clean_id:
        raise HTTPException(status_code=400, detail="Укажите Telegram ID или @username")

    code = f"{random.randint(100000, 999999)}"
    now = time.time()
    expires_at = now + 600  # 10 minutes

    # Look up known user
    user_meta = _known_telegram_users.get(clean_id.lower())
    chat_id = user_meta.get("chat_id") if user_meta else (clean_id if clean_id.lstrip("-").isdigit() else None)

    code_data = {
        "code": code,
        "expires_at": expires_at,
        "name": data.name or (user_meta.get("first_name") if user_meta else f"Telegram User {clean_id}"),
        "chat_id": chat_id,
        "username": clean_id,
    }
    _pending_codes[clean_id.lower()] = code_data
    if chat_id:
        _pending_codes[chat_id] = code_data

    # Format Telegram message
    msg = (
        f"🔐 <b>Код авторизации в tTerm:</b> <code>{code}</code>\n\n"
        f"⏳ Действителен в течение 10 минут.\n"
        f"Если вы не запрашивали вход, проигнорируйте это сообщение."
    )

    token, default_chat = _get_bot_token_and_chat()
    target_chat = chat_id or default_chat
    delivered = False
    bot_name = _get_bot_username(token)

    if token and target_chat:
        try:
            delivered = await _async_send_telegram(token, target_chat, msg, parse_mode="HTML")
        except Exception as e:
            log.warning("Could not send Telegram auth code via bot: %s", e)

    print(f"\n[TELEGRAM AUTH CODE] User @{clean_id}: {code} (expires in 10 min, delivered={delivered})\n", flush=True)

    note = (
        f"Код отправлен в Telegram ботом @{bot_name}"
        if delivered
        else f"Откройте бота @{bot_name} в Telegram (t.me/{bot_name}) и нажмите «Начать» для мгновенного получения кода"
    )

    return {
        "ok": True,
        "sent": True,
        "delivered_via_bot": delivered,
        "telegram_id": clean_id,
        "bot_username": bot_name,
        "bot_link": f"https://t.me/{bot_name}" if bot_name else None,
        "expires_in_seconds": 600,
        "note": note,
    }


@router.post("/verify-code")
async def verify_telegram_code(data: TelegramVerifyRequest, request: Request, response: Response):
    """Verifies 6-digit code and creates a full tTerm session."""
    clean_id = str(data.telegram_id).strip().lstrip("@").lower()
    clean_code = str(data.code).strip().replace(" ", "").replace("-", "")

    record = _pending_codes.get(clean_id)
    if not record:
        # Check by chat_id
        for k, v in list(_pending_codes.items()):
            if v.get("code") == clean_code:
                record = v
                clean_id = k
                break

    if not record:
        raise HTTPException(status_code=401, detail="Код не запрашивался или срок его действия истек")

    if time.time() > record["expires_at"]:
        _pending_codes.pop(clean_id, None)
        raise HTTPException(status_code=401, detail="Срок действия кода истек. Запросите новый код.")

    if record["code"] != clean_code:
        raise HTTPException(status_code=401, detail="Неверный проверочный код. Проверьте ввод.")

    # Code is valid, remove it
    _pending_codes.pop(clean_id, None)
    user_name = record.get("name") or f"Telegram User {clean_id}"

    return await _finalize_telegram_signin(
        clean_id=clean_id,
        user_name=user_name,
        request=request,
        response=response,
        method_label=f"Telegram Code (@{clean_id})",
    )


@router.post("/login-widget")
async def telegram_widget_login(data: TelegramWidgetAuth, request: Request, response: Response):
    """Authenticates via official Telegram Login Widget data."""
    token, _ = _get_bot_token_and_chat()
    client_secret = _get_client_secret()

    if abs(time.time() - data.auth_date) > 86400:
        raise HTTPException(status_code=401, detail="Данные авторизации устарели")

    check_dict = {
        "id": data.id,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "username": data.username,
        "photo_url": data.photo_url,
        "auth_date": data.auth_date,
    }
    check_arr = [f"{k}={v}" for k, v in sorted(check_dict.items()) if v is not None]
    data_check_string = "\n".join(check_arr)

    # Validate against candidate secret keys:
    # 1. SHA256 of bot token (official widget HMAC)
    # 2. SHA256 of client_secret
    # 3. Raw client_secret
    candidates = []
    if token:
        candidates.append(hashlib.sha256(token.encode("utf-8")).digest())
    if client_secret:
        candidates.append(hashlib.sha256(client_secret.encode("utf-8")).digest())
        candidates.append(client_secret.encode("utf-8"))

    valid = False
    for key in candidates:
        expected_hash = hmac.new(key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected_hash.lower(), data.hash.lower()):
            valid = True
            break

    if not valid and candidates:
        raise HTTPException(status_code=401, detail="Неверная подпись данных Telegram")

    tg_id_str = str(data.id)
    name = f"{data.first_name or ''} {data.last_name or ''}".strip() or (data.username or f"TG {data.id}")

    return await _finalize_telegram_signin(
        clean_id=tg_id_str,
        user_name=name,
        request=request,
        response=response,
        method_label=f"Telegram Widget (@{data.username or tg_id_str})",
        username=data.username or "",
    )


@router.post("/webapp-login")
async def telegram_webapp_login(data: TelegramWebAppLoginRequest, request: Request, response: Response):
    """Authenticates via official Telegram WebApp initData HMAC-SHA256."""
    token = telegram_bot.get_token()
    user_data = validate_webapp_init_data(data.init_data, token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Неверная подпись данных Telegram WebApp")

    tg_id_str = str(user_data.get("id"))
    username = user_data.get("username", "")
    first_name = user_data.get("first_name", "")
    last_name = user_data.get("last_name", "")
    name = f"{first_name} {last_name}".strip() or (username or f"TG {tg_id_str}")

    return await _finalize_telegram_signin(
        clean_id=tg_id_str,
        user_name=name,
        request=request,
        response=response,
        method_label=f"Telegram WebApp (@{username or tg_id_str})",
        username=username,
    )


@router.get("/bind-link")
async def telegram_bind_link(request: Request):
    """Generates a secure 1-click binding link for the currently signed-in user."""
    pool_obj = getattr(getattr(request.app, "state", None), "pool", None)
    if not pool_obj:
        raise HTTPException(status_code=500, detail="Database not ready")
    token = request.cookies.get(auth.SESSION_COOKIE) or request.cookies.get(f"__Host-{auth.SESSION_COOKIE}")
    user_id = await auth.session(pool_obj, token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    token_str, link = telegram_bot.register_pending_bind(str(user_id))
    return {
        "ok": True,
        "bind_token": token_str,
        "bot_username": telegram_bot.bot_username,
        "bind_url": link,
    }


@router.get("/status")
async def telegram_status_endpoint(request: Request):
    """Returns Telegram bot status and current user's Telegram binding state."""
    pool_obj = getattr(getattr(request.app, "state", None), "pool", None)
    token = request.cookies.get(auth.SESSION_COOKIE) or request.cookies.get(f"__Host-{auth.SESSION_COOKIE}")
    user_id = await auth.session(pool_obj, token) if pool_obj and token else None

    bound = False
    chat_id = None
    username = None

    if user_id and pool_obj:
        try:
            async with pool_obj.acquire() as conn:
                u_row = await conn.fetchrow(
                    "SELECT telegram_chat_id, telegram_username FROM users WHERE id = $1", user_id
                )
                if u_row and u_row["telegram_chat_id"]:
                    bound = True
                    chat_id = u_row["telegram_chat_id"]
                    username = u_row["telegram_username"]
        except Exception as e_st:
            log.debug("Error checking telegram status for user: %s", e_st)

    return {
        "ok": True,
        "configured": bool(telegram_bot.get_token()),
        "bound": bound,
        "chat_id": chat_id,
        "username": username,
        "bot_username": telegram_bot.bot_username,
        "bot_link": telegram_bot.bot_link,
    }


@router.post("/unbind")
async def telegram_unbind_endpoint(request: Request):
    """Unbinds Telegram profile from the currently signed-in user."""
    pool_obj = getattr(getattr(request.app, "state", None), "pool", None)
    token = request.cookies.get(auth.SESSION_COOKIE) or request.cookies.get(f"__Host-{auth.SESSION_COOKIE}")
    user_id = await auth.session(pool_obj, token) if pool_obj and token else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    await telegram_bot.unbind_user_telegram(user_id)
    return {"ok": True, "bound": False}


async def _finalize_telegram_signin(
    clean_id: str,
    user_name: str,
    request: Request,
    response: Response,
    method_label: str = "Telegram Login",
    username: str = "",
) -> Dict[str, Any]:
    """Helper that creates or retrieves user account, writes session in DB, and sets cookie."""
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None

    # Derive email
    admin_email = os.environ.get("TTERM_OWNER_EMAIL") or os.environ.get("ADMIN_EMAIL") or "eklimov84@gmail.com"
    # Check if this Telegram ID matches owner
    is_admin = clean_id in ("eklimov84", "owner-user") or clean_id == os.environ.get("TELEGRAM_CHAT_ID")
    email = admin_email if is_admin else f"tg_{clean_id}@telegram.tterm.net"

    first_name = user_name
    is_new = False

    if pool_obj:
        try:
            async with pool_obj.acquire() as conn:
                # 1. Check if user with this telegram_chat_id already exists in users table
                existing = await conn.fetchrow(
                    "SELECT id, name, email FROM users WHERE telegram_chat_id = $1", str(clean_id)
                )
                if existing:
                    email = existing["email"]
                    person = await _account(conn, email)
                else:
                    person = await _account(conn, email)
                    if not person:
                        person = await _make_account(conn, email, user_name)
                        is_new = True

                if person:
                    first_name = getattr(person, "first_name", user_name)
                    # Automatically update telegram binding in DB
                    try:
                        await conn.execute(
                            "UPDATE users SET telegram_chat_id = $1, "
                            "telegram_username = COALESCE($2, telegram_username) WHERE id = $3",
                            str(clean_id), username or None, person.id
                        )
                    except Exception as e_upd:
                        log.debug("Could not update telegram_chat_id in users: %s", e_upd)

                    try:
                        token, _ = await _new_session(
                            conn,
                            person.id,
                            method="telegram",
                            label=method_label,
                            ip=request.client.host if request.client else "127.0.0.1",
                        )
                    except Exception as e_m:
                        log.warning("Falling back to method='code' for Telegram auth session: %s", e_m)
                        token, _ = await _new_session(
                            conn,
                            person.id,
                            method="code",
                            label=method_label,
                            ip=request.client.host if request.client else "127.0.0.1",
                        )

                    is_secure = request.url.scheme == "https"
                    cookie_name = f"__Host-{SESSION_COOKIE}" if is_secure else SESSION_COOKIE
                    response.set_cookie(
                        cookie_name,
                        token,
                        max_age=30 * 24 * 3600,
                        path="/",
                        secure=is_secure,
                        httponly=True,
                        samesite="strict",
                    )
        except Exception as e:
            log.warning("Database session creation failed in Telegram auth: %s", e)

    return {
        "ok": True,
        "signedIn": True,
        "new": is_new,
        "name": first_name,
        "email": email,
        "offerPin": False,
        "pinDigits": 6,
        "telegram_id": clean_id,
    }

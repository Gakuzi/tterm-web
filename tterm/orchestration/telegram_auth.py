"""
Telegram Authentication Provider for tTerm.
Allows users to sign in instantly via Telegram:
1. User enters Telegram username, Chat ID or ID.
2. Server dispatches a 6-digit verification code directly to their Telegram app via Bot.
3. User enters the code and is authenticated with a standard tTerm session cookie.
Also supports one-click Telegram Login Widget hash verification.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..core import auth
from ..core.auth import SESSION_COOKIE, _account, _make_account, _new_session
from .encrypted_vault import encrypted_vault
from .notifications_bot import async_send_telegram_alert, get_user_telegram_config

log = logging.getLogger("tterm.orchestration.telegram_auth")

router = APIRouter(prefix="/api/auth/telegram", tags=["telegram-auth"])

# Pending verification codes: chat_id -> { code, expires_at, name, email }
_pending_codes: Dict[str, Dict[str, Any]] = {}


def _get_bot_token_and_chat(user_id: str = "owner-user") -> tuple[Optional[str], Optional[str]]:
    """Retrieves bot token and default chat from vault or environment."""
    env_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    env_chat = os.environ.get("TELEGRAM_CHAT_ID")
    if env_token:
        return env_token, env_chat

    cfg = get_user_telegram_config(user_id)
    if cfg.get("configured") and cfg.get("bot_token"):
        return cfg.get("bot_token"), cfg.get("chat_id")

    # Check encrypted vault
    secrets = encrypted_vault.load_secrets_sync(user_id)
    token = secrets.get("telegram_bot_token")
    chat = secrets.get("telegram_chat_id")
    if token:
        return str(token), str(chat) if chat else None

    return None, None


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


@router.get("/status")
async def telegram_auth_status(request: Request):
    """Returns whether Telegram Bot login is available."""
    token, chat = _get_bot_token_and_chat()
    return {
        "ok": True,
        "bot_configured": bool(token),
        "bot_username": os.environ.get("TELEGRAM_BOT_NAME") or "tTermAuthBot",
    }


@router.post("/request-code")
async def request_telegram_code(data: TelegramCodeRequest, request: Request):
    """Generates a 6-digit sign-in code and sends it via Telegram bot."""
    clean_id = str(data.telegram_id).strip().lstrip("@")
    if not clean_id:
        raise HTTPException(status_code=400, detail="Укажите Telegram ID или Chat ID")

    code = f"{random.randint(100000, 999999)}"
    now = time.time()
    expires_at = now + 600  # 10 minutes

    _pending_codes[clean_id] = {
        "code": code,
        "expires_at": expires_at,
        "name": data.name or f"Telegram User {clean_id}",
    }

    # Format message
    msg = (
        f"🔐 <b>Код авторизации в tTerm:</b> <code>{code}</code>\n\n"
        f"Действителен в течение 10 минут.\n"
        f"Если вы не запрашивали вход, проигнорируйте это сообщение."
    )

    # Attempt to dispatch via bot
    token, default_chat = _get_bot_token_and_chat()
    target_chat = clean_id if clean_id.lstrip("-").isdigit() else default_chat

    delivered = False
    if token and target_chat:
        try:
            delivered = await async_send_telegram_alert(token, target_chat, msg, markdown=False)
        except Exception as e:
            log.warning("Could not send Telegram auth code via bot: %s", e)

    # Always log code to server console (like email fallback in dev.py)
    print(f"\n[TELEGRAM AUTH CODE] User @{clean_id}: {code} (expires in 10 min)\n", flush=True)

    return {
        "ok": True,
        "sent": True,
        "delivered_via_bot": delivered,
        "telegram_id": clean_id,
        "expires_in_seconds": 600,
        "note": "Код отправлен в Telegram бота" if delivered else "Код сгенерирован и зафиксирован в консоли сервера",
    }


@router.post("/verify-code")
async def verify_telegram_code(data: TelegramVerifyRequest, request: Request, response: Response):
    """Verifies 6-digit code and creates a full tTerm session."""
    clean_id = str(data.telegram_id).strip().lstrip("@")
    clean_code = str(data.code).strip().replace(" ", "").replace("-", "")

    record = _pending_codes.get(clean_id)
    if not record:
        raise HTTPException(status_code=401, detail="Код не запрашивался или срок его действия истек")

    if time.time() > record["expires_at"]:
        _pending_codes.pop(clean_id, None)
        raise HTTPException(status_code=401, detail="Срок действия кода истек. Запросите новый код.")

    if record["code"] != clean_code:
        raise HTTPException(status_code=401, detail="Неверный проверочный код. Проверьте ввод.")

    # Code is valid, remove it
    _pending_codes.pop(clean_id, None)

    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None

    # Derive email & user representation
    # Check if admin email configured
    admin_email = os.environ.get("TTERM_OWNER_EMAIL") or os.environ.get("ADMIN_EMAIL")
    email = admin_email if admin_email else f"tg_{clean_id}@telegram.tterm.net"
    user_name = record.get("name") or f"Telegram User {clean_id}"

    user_id = None
    first_name = user_name

    if pool_obj:
        try:
            async with pool_obj.acquire() as conn:
                # Find or create account
                person = await _account(conn, email)
                if not person:
                    person = await _make_account(conn, email, user_name)

                if person:
                    user_id = person.id
                    first_name = getattr(person, "first_name", user_name)

                    # Create session in sessions table
                    token, session_id = await _new_session(
                        conn,
                        user_id,
                        method="telegram",
                        label="Telegram Web Login",
                        ip=request.client.host if request.client else "127.0.0.1",
                    )

                    # Set session cookie
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
        "name": first_name,
        "email": email,
        "telegram_id": clean_id,
    }


@router.post("/login-widget")
async def telegram_widget_login(data: TelegramWidgetAuth, request: Request, response: Response):
    """Authenticates via official Telegram Login Widget data."""
    token, _ = _get_bot_token_and_chat()
    if token:
        # Verify HMAC-SHA256 signature
        secret_key = hashlib.sha256(token.encode("utf-8")).digest()
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
        expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected_hash, data.hash):
            raise HTTPException(status_code=401, detail="Неверная подпись данных Telegram")

        if time.time() - data.auth_date > 86400:
            raise HTTPException(status_code=401, detail="Данные авторизации устарели")

    # Success: log in
    tg_id_str = str(data.id)
    name = f"{data.first_name or ''} {data.last_name or ''}".strip() or (data.username or f"TG {data.id}")
    email = f"tg_{tg_id_str}@telegram.tterm.net"

    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None

    if pool_obj:
        async with pool_obj.acquire() as conn:
            person = await _account(conn, email)
            if not person:
                person = await _make_account(conn, email, name)
            if person:
                token, _ = await _new_session(
                    conn,
                    person.id,
                    method="telegram",
                    label=f"Telegram Widget (@{data.username or tg_id_str})",
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

    return {
        "ok": True,
        "signedIn": True,
        "name": name,
        "email": email,
        "telegram_id": tg_id_str,
    }

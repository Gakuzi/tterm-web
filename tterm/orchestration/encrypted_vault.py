"""
Encrypted User Cloud Vault for tTerm.

Provides AES-256-GCM encryption at rest for sensitive user credentials:
  - GitHub PAT & OAuth tokens
  - Aeza Cloud VPS API keys
  - Telegram Bot tokens and Chat IDs for cross-device alerts
  - MCP AI session keys and workspace tokens
  - Notification preferences

Keys are derived using PBKDF2-HMAC-SHA256 from the server master secret + unique user salt.
Stored securely in PostgreSQL (table `user_encrypted_vault`) with local encrypted cache fallback.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import secrets
from hashlib import pbkdf2_hmac
from pathlib import Path
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

log = logging.getLogger("tterm.orchestration.vault")

# Default server secret fallback if not yet initialized in auth.key
_DEFAULT_FALLBACK_SECRET = b"tterm-orchestrator-vault-master-key-seed-32bytes!!"
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_ENCRYPTED_VAULT_FILE = _DATA_DIR / ".vault_cloud_encrypted.json"


def _get_master_secret() -> bytes:
    """Loads server master secret from auth.key or environment."""
    env_sec = os.environ.get("APP_SECRET") or os.environ.get("TTERM_SECRET")
    if env_sec:
        return env_sec.encode("utf-8")
    auth_key_path = _DATA_DIR / "auth.key"
    if auth_key_path.exists():
        try:
            return auth_key_path.read_bytes()[:32]
        except Exception:
            pass
    return _DEFAULT_FALLBACK_SECRET


def _derive_user_key(user_id: str, salt: bytes) -> bytes:
    """Derives a 256-bit AES-GCM key from server master secret + user salt."""
    master = _get_master_secret()
    info = f"tterm-user-vault:{user_id}".encode("utf-8")
    return pbkdf2_hmac("sha256", master + info, salt, iterations=100_000, dklen=32)


def mask_secret(value: Optional[str], show_prefix: int = 4, show_suffix: int = 3) -> Optional[str]:
    """Masks secret tokens for UI display, e.g. 'ghp_****123' or '1404_****83b'."""
    if not value or len(value) <= (show_prefix + show_suffix):
        return "********" if value else None
    return f"{value[:show_prefix]}...{value[-show_suffix:]}"


class EncryptedUserVault:
    """Manages encrypted user secrets in PostgreSQL and encrypted local cache."""

    def __init__(self) -> None:
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._salts: Dict[str, bytes] = {}
        self._init_local_cache()

    def _init_local_cache(self) -> None:
        """Loads and decrypts local cached secrets if file exists."""
        if not _ENCRYPTED_VAULT_FILE.exists():
            return
        try:
            raw_text = _ENCRYPTED_VAULT_FILE.read_text("utf-8")
            data = json.loads(raw_text)
            for uid, record in data.items():
                if not isinstance(record, dict) or "nonce" not in record or "salt" not in record or "ciphertext" not in record:
                    continue
                salt = base64.b64decode(record["salt"])
                nonce = base64.b64decode(record["nonce"])
                ciphertext = base64.b64decode(record["ciphertext"])
                key = _derive_user_key(uid, salt)
                aesgcm = AESGCM(key)
                decrypted = aesgcm.decrypt(nonce, ciphertext, None)
                self._memory_cache[uid] = json.loads(decrypted.decode("utf-8"))
                self._salts[uid] = salt
        except Exception as e:
            log.warning("Could not decrypt local vault file: %s", e)

    def _save_local_cache(self) -> None:
        """Persists all in-memory vaults to local encrypted file."""
        try:
            _DATA_DIR.mkdir(parents=True, exist_ok=True)
            export_data: Dict[str, Any] = {}
            for uid, secrets_dict in self._memory_cache.items():
                salt = self._salts.get(uid) or secrets.token_bytes(16)
                self._salts[uid] = salt
                key = _derive_user_key(uid, salt)
                aesgcm = AESGCM(key)
                nonce = secrets.token_bytes(12)
                plaintext = json.dumps(secrets_dict).encode("utf-8")
                ciphertext = aesgcm.encrypt(nonce, plaintext, None)
                export_data[uid] = {
                    "salt": base64.b64encode(salt).decode("utf-8"),
                    "nonce": base64.b64encode(nonce).decode("utf-8"),
                    "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
                }
            _ENCRYPTED_VAULT_FILE.write_text(json.dumps(export_data, indent=2), "utf-8")
            os.chmod(str(_ENCRYPTED_VAULT_FILE), 0o600)
        except Exception as e:
            log.warning("Failed to write local encrypted vault cache: %s", e)

    async def _ensure_db_table(self, pool: Any) -> None:
        """Ensures the encrypted vault table exists in PostgreSQL."""
        if not pool:
            return
        query = """
        CREATE TABLE IF NOT EXISTS user_encrypted_vault (
            user_id VARCHAR(128) PRIMARY KEY,
            encrypted_payload TEXT NOT NULL,
            salt VARCHAR(64) NOT NULL,
            nonce VARCHAR(64) NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
        try:
            async with pool.acquire() as conn:
                await conn.execute(query)
        except Exception as e:
            log.warning("Could not ensure user_encrypted_vault table: %s", e)

    async def save_secrets(
        self,
        user_id: str,
        new_secrets: Dict[str, Any],
        pool: Any = None,
        merge: bool = True,
    ) -> Dict[str, Any]:
        """Encrypts and persists user secrets in DB and local encrypted cache."""
        clean_uid = str(user_id).strip() or "owner-user"
        if merge:
            current = await self.load_secrets(clean_uid, pool=pool)
            current.update(new_secrets)
        else:
            current = dict(new_secrets)
        self._memory_cache[clean_uid] = current

        # Encrypt
        salt = self._salts.get(clean_uid) or secrets.token_bytes(16)
        self._salts[clean_uid] = salt
        key = _derive_user_key(clean_uid, salt)
        aesgcm = AESGCM(key)
        nonce = secrets.token_bytes(12)
        plaintext = json.dumps(current).encode("utf-8")
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)

        b64_salt = base64.b64encode(salt).decode("utf-8")
        b64_nonce = base64.b64encode(nonce).decode("utf-8")
        b64_cipher = base64.b64encode(ciphertext).decode("utf-8")

        # Save to DB if pool available
        if pool:
            await self._ensure_db_table(pool)
            query = """
            INSERT INTO user_encrypted_vault (user_id, encrypted_payload, salt, nonce, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                encrypted_payload = EXCLUDED.encrypted_payload,
                salt = EXCLUDED.salt,
                nonce = EXCLUDED.nonce,
                updated_at = NOW();
            """
            try:
                async with pool.acquire() as conn:
                    await conn.execute(query, clean_uid, b64_cipher, b64_salt, b64_nonce)
            except Exception as e:
                log.warning("DB save to user_encrypted_vault failed, relying on file cache: %s", e)

        # Save to local file cache
        self._save_local_cache()
        log.info("Encrypted secrets saved successfully for user '%s'", clean_uid)
        return current

    async def load_secrets(self, user_id: str, pool: Any = None) -> Dict[str, Any]:
        """Loads and decrypts user secrets from DB or local encrypted cache."""
        clean_uid = str(user_id).strip() or "owner-user"

        # Check DB first if pool provided
        if pool:
            await self._ensure_db_table(pool)
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        "SELECT encrypted_payload, salt, nonce FROM user_encrypted_vault WHERE user_id = $1",
                        clean_uid,
                    )
                    if row:
                        salt = base64.b64decode(row["salt"])
                        nonce = base64.b64decode(row["nonce"])
                        ciphertext = base64.b64decode(row["encrypted_payload"])
                        key = _derive_user_key(clean_uid, salt)
                        aesgcm = AESGCM(key)
                        decrypted = aesgcm.decrypt(nonce, ciphertext, None)
                        data = json.loads(decrypted.decode("utf-8"))
                        self._memory_cache[clean_uid] = data
                        self._salts[clean_uid] = salt
                        return data
            except Exception as e:
                log.warning("Failed to load secrets from DB for %s: %s", clean_uid, e)

        # Fallback to memory / local file cache
        if clean_uid in self._memory_cache:
            return self._memory_cache[clean_uid]

        return {}

    async def get_masked_overview(self, user_id: str, pool: Any = None) -> Dict[str, Any]:
        """Returns safe overview with masked secrets for frontend display."""
        clean_uid = str(user_id).strip() or "owner-user"
        sec = await self.load_secrets(clean_uid, pool=pool)

        github_token = sec.get("github_token") or sec.get("github_pat")
        aeza_key = sec.get("aeza_api_key")
        tg_token = sec.get("telegram_bot_token")
        tg_chat = sec.get("telegram_chat_id")

        return {
            "ok": True,
            "user_id": clean_uid,
            "vault_active": True,
            "encryption_algorithm": "AES-256-GCM (PBKDF2-100k)",
            "github": {
                "configured": bool(github_token),
                "masked_token": mask_secret(github_token, 4, 3),
                "username": sec.get("github_username"),
            },
            "aeza": {
                "configured": bool(aeza_key),
                "masked_key": mask_secret(aeza_key, 4, 3),
                "account_email": sec.get("aeza_email"),
            },
            "telegram": {
                "configured": bool(tg_token and tg_chat),
                "masked_token": mask_secret(tg_token, 4, 3),
                "chat_id": tg_chat,
                "enabled": sec.get("telegram_enabled", True),
            },
            "notifications": sec.get("notification_settings", {}),
        }


    async def delete_secret_keys(
        self,
        user_id: str,
        keys: List[str],
        pool: Any = None,
    ) -> bool:
        """Deletes specified secret keys from the user's encrypted vault."""
        clean_uid = str(user_id).strip() or "owner-user"
        current = await self.load_secrets(clean_uid, pool=pool)
        changed = False
        for k in keys:
            if k in current:
                del current[k]
                changed = True

        if not changed:
            return True

        if current:
            await self.save_secrets(clean_uid, current, pool=pool, merge=False)
        else:
            # Vault is empty for this user
            if clean_uid in self._memory_cache:
                del self._memory_cache[clean_uid]
            if clean_uid in self._salts:
                del self._salts[clean_uid]
            self._save_local_cache()
            if pool:
                await self._ensure_db_table(pool)
                try:
                    async with pool.acquire() as conn:
                        await conn.execute("DELETE FROM user_encrypted_vault WHERE user_id = $1", clean_uid)
                except Exception as e:
                    log.warning("Could not delete from user_encrypted_vault: %s", e)
        return True

    def delete_secret_keys_sync(self, user_id: str, keys: List[str]) -> bool:
        """Synchronously deletes specified secret keys from user's encrypted vault."""
        clean_uid = str(user_id).strip() or "owner-user"
        current = self.load_secrets_sync(clean_uid)
        changed = False
        for k in keys:
            if k in current:
                del current[k]
                changed = True

        if not changed:
            return True

        if current:
            self._memory_cache[clean_uid] = current
            self._save_local_cache()
        else:
            if clean_uid in self._memory_cache:
                del self._memory_cache[clean_uid]
            if clean_uid in self._salts:
                del self._salts[clean_uid]
            self._save_local_cache()
        return True

    def load_secrets_sync(self, user_id: str) -> Dict[str, Any]:
        """Synchronously loads secrets from memory or local encrypted cache."""
        clean_uid = str(user_id).strip() or "owner-user"
        if clean_uid in self._memory_cache:
            return self._memory_cache[clean_uid]
        self._init_local_cache()
        return self._memory_cache.get(clean_uid, {})

    def save_secrets_sync(self, user_id: str, new_secrets: Dict[str, Any]) -> Dict[str, Any]:
        """Synchronously saves secrets to memory and local encrypted cache."""
        clean_uid = str(user_id).strip() or "owner-user"
        current = self.load_secrets_sync(clean_uid)
        current.update(new_secrets)
        self._memory_cache[clean_uid] = current
        self._save_local_cache()
        return current


# Global Singleton Instance
user_encrypted_vault = EncryptedUserVault()
encrypted_vault = user_encrypted_vault


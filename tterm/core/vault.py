"""The vault of SSH keys, and the relay that signs a login with one of them.

A person's SSH private keys live in their vault, encrypted end to end. The
core never sees a private key or the vault key in the clear: it keeps only
the sealed blobs, the wraps of the vault key for each lock, the salts and
the public halves (see migration 013 and the contract, vault-design.md).

What the core does with the crypto is narrow and all it can do without the
secrets:

* it checks what the person uploads — that a public key parses, its type
  matches, its fingerprint is the SHA256 one, and the sealed sizes are
  right (a wrap of the 32-byte vault key is exactly 60 bytes; a sealed key
  at most 16 KB; an X25519 key 32 bytes; a commit 32 bytes), strictly
  base64url-decoded;
* it runs the pairing state machine, where it checks the revealed public
  key against the commit the new browser posted first;
* it builds the SSH signature blob from the raw signature the device makes
  and verifies it with the stored public key before a login uses it.

Nothing sealed, no wrap and no signature is ever logged.

Signing a login with a vault key (login_method 'key'): asyncssh calls
`sign_async` on the client key when it has one. RelayKeyPair's `sign_async`
asks one capable page socket of the person at a time (VaultRelay), takes the
raw signature back, builds the blob, verifies it, records `vault.signed`,
and returns it. With no capable socket the terminal waits and says so; it
goes on by itself when a socket announces the key.
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hashlib
import logging
import re
import uuid
from dataclasses import dataclass, field

import asyncpg
import asyncssh
from asyncssh.packet import MPInt, String

from . import accounts, reach

log = logging.getLogger("tterm.vault")

#: The vault key is 32 bytes; box = nonce(12) || ciphertext || tag(16), so a
#: wrap of it (ciphertext 32) is exactly 60 bytes. An X25519 public key and a
#: pairing commit are 32 bytes; a sealed private key is at most 16 KB.
WRAP_LEN = 60
X25519_LEN = 32
COMMIT_LEN = 32
PRF_SALT_LEN = 32
RECOVERY_SALT_LEN = 16
SEALED_MAX = 16 * 1024
#: A credential id (a WebAuthn credential) is short; cap it so nothing odd
#: is stored.
CREDENTIAL_ID_MAX = 1024
NAME_MAX = 64
SOURCE_LABEL_MAX = 200

#: The key types a vault holds, and so the SSH key algorithms the relay signs
#: for. The public key's own algorithm must be one of these.
KEY_TYPES = ("ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384",
             "ssh-rsa")
#: The signature algorithms the page may be asked to sign with, and the raw
#: signature's exact length where it is fixed (P1363 r||s for ECDSA, 64 bytes
#: for Ed25519; RSA is the modulus length, checked by the verify instead).
SIG_ALGS = {
    "ssh-ed25519": 64,
    "ecdsa-sha2-nistp256": 64,
    "ecdsa-sha2-nistp384": 96,
    "rsa-sha2-256": None,
    "rsa-sha2-512": None,
}
#: A raw signature is never larger than this (a 16384-bit RSA key signs into
#: 2048 bytes); anything larger is not a signature.
RAW_SIG_MAX = 2048

#: A pairing lives five minutes; one answer, one reveal, one approval.
PAIRING_MINUTES = 5
#: Pairings one person may start in an hour: far more than anyone needs, few
#: enough that nobody fills the table.
PAIRINGS_PER_HOUR = 30
#: The methods for the page's "method" field of a pairing.
PAIRING_METHODS = ("code",)

#: How long the core waits on one capable page socket for a signature.
SIGN_TIMEOUT = 20.0

#: The labels for the commit, the SAS and the key's aad.
PAIR_COMMIT_LABEL = b"tterm/vault/pair/commit/v1"
PAIR_SAS_LABEL = b"tterm/vault/pair/sas/v1"


# --------------------------------------------------------------- refusals

class Refused(Exception):
    """Not done; the message says why, `status` is the HTTP answer."""
    status = 422


class NotFound(Refused):
    status = 404


class Taken(Refused):
    """A vault, a lock or a key is already there, or out of order."""
    status = 409


class TooSoon(Refused):
    status = 429


# ---------------------------------------------------------------- the words

def decode_b64u(raw: object, *, exact: int | None = None,
                most: int | None = None, least: int | None = None,
                what: str = "value") -> bytes:
    """Strict base64url without padding, within the size the caller allows.

    Strict means canonical: the string decodes and encodes back to itself, so
    extra bits, padding or the standard alphabet are refused. The size is
    checked on the bytes, not the text, so a wrong length is caught here
    rather than in the database."""
    if not isinstance(raw, str) or not re.fullmatch(r"[A-Za-z0-9_-]*", raw):
        raise Refused(f"The {what} is not base64url.")
    try:
        data = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    except (ValueError, Exception):     # noqa: BLE001 - any decode trouble
        raise Refused(f"The {what} is not base64url.") from None
    if base64.urlsafe_b64encode(data).rstrip(b"=").decode() != raw:
        raise Refused(f"The {what} is not base64url.")
    if exact is not None and len(data) != exact:
        raise Refused(f"The {what} is the wrong size.")
    if most is not None and len(data) > most:
        raise Refused(f"The {what} is too big.")
    if least is not None and len(data) < least:
        raise Refused(f"The {what} is too small.")
    return data


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def is_uuid(raw: object) -> uuid.UUID:
    """A UUID the client picked, or a refusal: ids of vaults, locks and keys
    come from the client (the aad binds to them), so their form is checked."""
    if isinstance(raw, uuid.UUID):
        return raw
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        raise Refused("That is not a valid id.") from None


def clean_name(raw: object) -> str | None:
    """A key's name as its owner gives it: one line, 1 to 64 characters."""
    if not isinstance(raw, str):
        return None
    name = accounts.one_line(raw)
    return name if 1 <= len(name) <= NAME_MAX else None


def clean_label(raw: object, most: int = SOURCE_LABEL_MAX) -> str:
    """A label the page sends (a device, where a key came from): printable,
    one line, trimmed. Empty is fine."""
    if not isinstance(raw, str):
        return ""
    return accounts.one_line(raw)[:most]


def check_public_key(public_key: object, type_: object,
                     fingerprint: object) -> None:
    """The public key parses as one line of OpenSSH, its algorithm is the
    type the client gave, and the fingerprint is its SHA256 one. Raised
    otherwise, so a key whose parts do not match is never stored."""
    if not isinstance(public_key, str) or len(public_key) > 8192:
        raise Refused("The public key is missing.")
    if type_ not in KEY_TYPES:
        raise Refused("That key type is not one the vault holds.")
    try:
        key = asyncssh.import_public_key(public_key)
    except (asyncssh.KeyImportError, Exception):   # noqa: BLE001
        raise Refused("The public key could not be read.") from None
    if key.get_algorithm() != type_:
        raise Refused("The public key is not of the type given.")
    if key.get_fingerprint() != fingerprint:
        raise Refused("The fingerprint is not this key's.")


def commit_of(pub_b: bytes) -> bytes:
    """The commit a new browser posts for its X25519 public key."""
    return hashlib.sha256(PAIR_COMMIT_LABEL + pub_b).digest()


def sas_of(pub_a: bytes, pub_b: bytes) -> str:
    """The six digits both sides show, as "482 913"."""
    digest = hashlib.sha256(PAIR_SAS_LABEL + pub_a + pub_b).digest()
    number = int.from_bytes(digest[:4], "big") % 1_000_000
    return f"{number // 1000:03d} {number % 1000:03d}"


# ---------------------------------------------------------- the signature

def build_ssh_signature(alg: bytes, raw: bytes) -> bytes:
    """The SSH signature blob from the raw signature the device returned.

    Ed25519 is 64 bytes; RSA is the PKCS#1 v1.5 signature, the modulus
    length; ECDSA is r || s of fixed length (P1363, what WebCrypto returns),
    which becomes two mpints. A wrong length is refused here; the verify that
    follows catches the rest. Raises ValueError, which asyncssh turns into a
    refused login."""
    name = alg.decode()
    want = SIG_ALGS.get(name)
    if want is None and name not in SIG_ALGS:
        raise ValueError(f"not a signature algorithm: {name}")
    if len(raw) == 0 or len(raw) > RAW_SIG_MAX:
        raise ValueError("the raw signature is the wrong size")
    if want is not None and len(raw) != want:
        raise ValueError("the raw signature is the wrong size")
    if name.startswith("ecdsa-"):
        half = len(raw) // 2
        r = int.from_bytes(raw[:half], "big")
        s = int.from_bytes(raw[half:], "big")
        return String(alg) + String(MPInt(r) + MPInt(s))
    # Ed25519 and RSA: the raw signature goes in as one string.
    return String(alg) + String(raw)


def verify_ssh_signature(public_key: str, data: bytes, alg: bytes,
                         raw: bytes) -> bytes:
    """Builds the blob and checks it with the public key; the blob, or a
    ValueError if it does not verify (a refused login)."""
    blob = build_ssh_signature(alg, raw)
    try:
        key = asyncssh.import_public_key(public_key)
    except Exception:                    # noqa: BLE001
        raise ValueError("the key's public half could not be read") from None
    if not key.verify(data, blob):
        raise ValueError("the vault signature did not verify")
    return blob


# --------------------------------------------------------------- the vault

def _ms(when: dt.datetime | None) -> int | None:
    return int(when.timestamp() * 1000) if when else None


async def _vault_row(conn, user_id: uuid.UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "SELECT id, prf_salt, created_at, recovery_at FROM vaults "
        "WHERE user_id = $1", user_id)


async def get_vault(pool: asyncpg.Pool, user_id: uuid.UUID,
                    device_id: uuid.UUID | None) -> dict | None:
    """The whole vault for its owner: the salts the page needs, the locks
    (which one is this browser's), and the keys with the servers that use
    each. None when the person has no vault yet."""
    async with pool.acquire() as conn:
        vault = await _vault_row(conn, user_id)
        if vault is None:
            return None
        # Each lock's wrap goes with it: the device that holds the lock's
        # KEK (a browser's passkey, the app's keychain) opens VK with it.
        locks = await conn.fetch(
            "SELECT id, kind, label, credential_id, device_id, wrap, "
            "created_at, last_used_at FROM vault_locks WHERE vault_id = $1 "
            "AND removed_at IS NULL ORDER BY created_at", vault["id"])
        keys = await conn.fetch(
            "SELECT id, name, type, public_key, fingerprint, sealed, source, "
            "source_label, created_at, last_used_at FROM vault_keys "
            "WHERE vault_id = $1 AND removed_at IS NULL ORDER BY created_at",
            vault["id"])
        key_ids = [k["id"] for k in keys]
        servers: dict[uuid.UUID, list[dict]] = {}
        if key_ids:
            for m in await conn.fetch(
                    "SELECT m.id, m.name, m.vault_key_id, p.name AS project "
                    "FROM machines m JOIN projects p ON p.id = m.project_id "
                    "WHERE m.vault_key_id = ANY($1::uuid[]) "
                    "AND m.removed_at IS NULL ORDER BY lower(m.name)", key_ids):
                servers.setdefault(m["vault_key_id"], []).append(
                    {"id": str(m["id"]), "name": m["name"],
                     "project": m["project"]})
    return {
        "id": str(vault["id"]),
        "prfSalt": b64u(bytes(vault["prf_salt"])),
        "createdAt": _ms(vault["created_at"]),
        "recoveryAt": _ms(vault["recovery_at"]),
        "locks": [{
            "id": str(lk["id"]), "kind": lk["kind"], "label": lk["label"],
            "credentialId": b64u(bytes(lk["credential_id"]))
            if lk["credential_id"] is not None else None,
            "wrap": b64u(bytes(lk["wrap"])),
            "createdAt": _ms(lk["created_at"]),
            "lastUsedAt": _ms(lk["last_used_at"]),
            "thisDevice": device_id is not None and lk["device_id"] == device_id,
        } for lk in locks],
        "keys": [{
            "id": str(k["id"]), "name": k["name"], "type": k["type"],
            "publicKey": k["public_key"], "fingerprint": k["fingerprint"],
            "sealed": b64u(bytes(k["sealed"])), "source": k["source"],
            "sourceLabel": k["source_label"],
            "createdAt": _ms(k["created_at"]),
            "lastUsedAt": _ms(k["last_used_at"]),
            "servers": servers.get(k["id"], []),
        } for k in keys],
    }


def _check_lock(lock: object) -> dict:
    """A lock as the page sends it: id, kind, wrap, and for a passkey its
    credential id. Returns the checked parts; raises on anything wrong."""
    if not isinstance(lock, dict):
        raise Refused("The lock is missing.")
    kind = lock.get("kind")
    if kind not in ("passkey", "app"):
        raise Refused("A lock is a passkey or the app.")
    out = {
        "id": is_uuid(lock.get("id")),
        "kind": kind,
        "wrap": decode_b64u(lock.get("wrap"), exact=WRAP_LEN, what="wrap"),
        "label": clean_label(lock.get("label")),
        "credential_id": None,
    }
    cred = lock.get("credentialId")
    if cred is not None:
        out["credential_id"] = decode_b64u(cred, most=CREDENTIAL_ID_MAX,
                                           what="credential id")
    if kind == "passkey" and out["credential_id"] is None:
        raise Refused("A passkey lock needs its credential id.")
    return out


async def create_vault(pool: asyncpg.Pool, user_id: uuid.UUID, *, id: object,
                       recovery_salt: object, recovery_wrap: object,
                       lock: object, device_id: uuid.UUID | None) -> dict:
    """Makes the person's one vault, with its first lock and its recovery
    code. The server makes prf_salt. 409 if a vault is already there.

    The lock may be left out (None): a browser that makes the vault adds its
    passkey lock right after, with POST /api/vault/locks, since the PRF input
    is the prf_salt made here; a browser without PRF has no lock at all, and
    opens the vault with the recovery code."""
    vault_id = is_uuid(id)
    salt = decode_b64u(recovery_salt, exact=RECOVERY_SALT_LEN,
                       what="recovery salt")
    wrap = decode_b64u(recovery_wrap, exact=WRAP_LEN, what="recovery wrap")
    first = _check_lock(lock) if lock is not None else None
    prf_salt = _random(PRF_SALT_LEN)
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"vault:{user_id}")
        if await _vault_row(conn, user_id) is not None:
            raise Taken("This account already has a vault.")
        await conn.execute(
            "INSERT INTO vaults (id, user_id, prf_salt, recovery_salt, "
            "recovery_wrap) VALUES ($1, $2, $3, $4, $5)",
            vault_id, user_id, prf_salt, salt, wrap)
        if first is not None:
            await _insert_lock(conn, vault_id, first, device_id)
        await accounts.journal(conn, "vault.created", user_id=user_id,
                               details={"lock": first["kind"] if first
                                        else None})
    log.info("vault created for %s", user_id)
    return await get_vault(pool, user_id, device_id)


async def _insert_lock(conn, vault_id: uuid.UUID, lock: dict,
                       device_id: uuid.UUID | None) -> None:
    await conn.execute(
        "INSERT INTO vault_locks (id, vault_id, kind, device_id, label, "
        "credential_id, wrap) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        lock["id"], vault_id, lock["kind"], device_id, lock["label"],
        lock["credential_id"], lock["wrap"])


async def add_lock(pool: asyncpg.Pool, user_id: uuid.UUID, *, lock: object,
                   device_id: uuid.UUID | None) -> dict:
    """Another way to open the vault: a browser's passkey, or the app. A
    passkey lock is tied to this session's device."""
    checked = _check_lock(lock)
    async with pool.acquire() as conn, conn.transaction():
        vault = await _vault_row(conn, user_id)
        if vault is None:
            raise NotFound("This account has no vault.")
        try:
            await _insert_lock(conn, vault["id"], checked, device_id)
        except asyncpg.UniqueViolationError:
            raise Taken("This lock is already there.") from None
        await accounts.journal(conn, "vault.lock.added", user_id=user_id,
                               details={"lock": checked["kind"],
                                        "label": checked["label"]})
    return await get_vault(pool, user_id, device_id)


async def remove_lock(pool: asyncpg.Pool, user_id: uuid.UUID,
                      lock_id: uuid.UUID, device_id: uuid.UUID | None) -> dict:
    """Takes a lock off the vault. The last lock stays: a vault with no lock
    could never be opened again except by the recovery code, which Make a new
    recovery code is for."""
    async with pool.acquire() as conn, conn.transaction():
        vault = await _vault_row(conn, user_id)
        if vault is None:
            raise NotFound("This account has no vault.")
        row = await conn.fetchrow(
            "SELECT kind, label FROM vault_locks WHERE id = $1 AND vault_id = $2 "
            "AND removed_at IS NULL FOR UPDATE", lock_id, vault["id"])
        if row is None:
            raise NotFound("No such lock.")
        left = await conn.fetchval(
            "SELECT count(*) FROM vault_locks WHERE vault_id = $1 "
            "AND removed_at IS NULL", vault["id"])
        if left <= 1:
            raise Refused("This is the only lock. Add another way to open the "
                          "vault first, or make a new recovery code.")
        # The wrap and the credential go at once (the Privacy Policy says
        # "deleted"); the rest of the row stays for the record.
        await conn.execute("UPDATE vault_locks SET removed_at = now(), "
                           "wrap = NULL, credential_id = NULL WHERE id = $1",
                           lock_id)
        await accounts.journal(conn, "vault.lock.removed", user_id=user_id,
                               details={"lock": row["kind"],
                                        "label": row["label"]})
    return await get_vault(pool, user_id, device_id)


async def lock_used(pool: asyncpg.Pool, user_id: uuid.UUID,
                    lock_id: uuid.UUID) -> bool:
    """Notes that a lock opened the vault just now (last used)."""
    found = await pool.fetchval(
        "UPDATE vault_locks lk SET last_used_at = now() FROM vaults v "
        "WHERE lk.id = $1 AND lk.vault_id = v.id AND v.user_id = $2 "
        "AND lk.removed_at IS NULL RETURNING lk.id", lock_id, user_id)
    return found is not None


async def recovery(pool: asyncpg.Pool, user_id: uuid.UUID) -> dict:
    """The recovery salt and wrap, for opening the vault with the code."""
    row = await pool.fetchrow(
        "SELECT recovery_salt, recovery_wrap FROM vaults WHERE user_id = $1",
        user_id)
    if row is None:
        raise NotFound("This account has no vault.")
    return {"recoverySalt": b64u(bytes(row["recovery_salt"])),
            "recoveryWrap": b64u(bytes(row["recovery_wrap"]))}


async def set_recovery(pool: asyncpg.Pool, user_id: uuid.UUID, *,
                       recovery_salt: object, recovery_wrap: object) -> None:
    """Make a new recovery code: a new salt and wrap replace the old, so the
    code shown before stops working."""
    salt = decode_b64u(recovery_salt, exact=RECOVERY_SALT_LEN,
                       what="recovery salt")
    wrap = decode_b64u(recovery_wrap, exact=WRAP_LEN, what="recovery wrap")
    async with pool.acquire() as conn, conn.transaction():
        done = await conn.fetchval(
            "UPDATE vaults SET recovery_salt = $2, recovery_wrap = $3, "
            "recovery_at = now() WHERE user_id = $1 RETURNING id",
            user_id, salt, wrap)
        if done is None:
            raise NotFound("This account has no vault.")
        await accounts.journal(conn, "vault.recovery.changed", user_id=user_id)


async def add_key(pool: asyncpg.Pool, user_id: uuid.UUID, *, id: object,
                  name: object, type: object, public_key: object,
                  fingerprint: object, sealed: object, source: object,
                  source_label: object, device_id: uuid.UUID | None) -> dict:
    """A private key into the vault. The core checks the public key's parts
    match and the sealed blob is not too big; the same key (by fingerprint)
    is not stored twice."""
    key_id = is_uuid(id)
    clean = clean_name(name)
    if clean is None:
        raise Refused(f"Name the key: 1 to {NAME_MAX} characters.")
    check_public_key(public_key, type, fingerprint)
    sealed_bytes = decode_b64u(sealed, most=SEALED_MAX, least=1,
                               what="sealed key")
    if source not in ("mac", "file"):
        raise Refused("A key comes from the Mac or from a file.")
    async with pool.acquire() as conn, conn.transaction():
        vault = await _vault_row(conn, user_id)
        if vault is None:
            raise NotFound("This account has no vault.")
        exists = await conn.fetchval(
            "SELECT id FROM vault_keys WHERE vault_id = $1 AND fingerprint = $2 "
            "AND removed_at IS NULL", vault["id"], fingerprint)
        if exists is not None:
            raise Taken("This key is in the vault already.")
        try:
            await conn.execute(
                "INSERT INTO vault_keys (id, vault_id, name, type, public_key, "
                "fingerprint, sealed, source, source_label) VALUES "
                "($1, $2, $3, $4, $5, $6, $7, $8, $9)",
                key_id, vault["id"], clean, type, public_key, fingerprint,
                sealed_bytes, source, clean_label(source_label))
        except asyncpg.UniqueViolationError:
            raise Taken("This key is in the vault already.") from None
        await accounts.journal(conn, "vault.key.added", user_id=user_id,
                               details={"fingerprint": fingerprint,
                                        "name": clean, "type": type})
    return await get_vault(pool, user_id, device_id)


async def remove_key(pool: asyncpg.Pool, user_id: uuid.UUID,
                     key_id: uuid.UUID, device_id: uuid.UUID | None) -> dict:
    """Takes a key out of the vault. Machines using it stay; they show "key
    removed" and cannot open until another way in is chosen."""
    async with pool.acquire() as conn, conn.transaction():
        vault = await _vault_row(conn, user_id)
        if vault is None:
            raise NotFound("This account has no vault.")
        row = await conn.fetchrow(
            "SELECT fingerprint, name FROM vault_keys WHERE id = $1 "
            "AND vault_id = $2 AND removed_at IS NULL FOR UPDATE",
            key_id, vault["id"])
        if row is None:
            raise NotFound("No such key.")
        # The sealed key goes at once; the row stays for the journal and for
        # the machines that still point to it ("key removed").
        await conn.execute("UPDATE vault_keys SET removed_at = now(), "
                           "sealed = NULL WHERE id = $1", key_id)
        await accounts.journal(conn, "vault.key.removed", user_id=user_id,
                               details={"fingerprint": row["fingerprint"],
                                        "name": row["name"]})
    return await get_vault(pool, user_id, device_id)


async def key_for(pool: asyncpg.Pool, user_id: uuid.UUID,
                  key_id: uuid.UUID) -> asyncpg.Record | None:
    """A key of the person's vault, for registering a machine that uses it:
    its public key, type and fingerprint. None if there is no such key."""
    return await pool.fetchrow(
        "SELECT k.id, k.name, k.type, k.public_key, k.fingerprint "
        "FROM vault_keys k JOIN vaults v ON v.id = k.vault_id "
        "WHERE k.id = $1 AND v.user_id = $2 AND k.removed_at IS NULL",
        key_id, user_id)


# -------------------------------------------------------------- pairing

@dataclass
class _Pairing:
    id: uuid.UUID
    state: str
    commit: bytes
    pub_a: bytes | None
    pub_b: bytes | None
    sealed: bytes | None
    expired: bool


def _pairing_row(row: asyncpg.Record) -> _Pairing:
    return _Pairing(row["id"], row["state"], bytes(row["commit"]),
                    bytes(row["pub_a"]) if row["pub_a"] is not None else None,
                    bytes(row["pub_b"]) if row["pub_b"] is not None else None,
                    bytes(row["sealed"]) if row["sealed"] is not None else None,
                    row["expired"])


async def create_pairing(pool: asyncpg.Pool, user_id: uuid.UUID,
                         session_id: uuid.UUID, *, commit: object,
                         device: str, ip: str) -> dict:
    """A new browser posts the commit to its X25519 public key. Starting
    pairings is rate-limited per person. The pairing belongs to this new
    browser's session (B)."""
    commit_bytes = decode_b64u(commit, exact=COMMIT_LEN, what="commit")
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"vault-pairings:{user_id}")
        recent = await conn.fetchval(
            "SELECT count(*) FROM vault_pairings WHERE user_id = $1 "
            "AND created_at > now() - interval '1 hour'", user_id)
        if recent >= PAIRINGS_PER_HOUR:
            raise TooSoon("Too many pairing requests. Try again in an hour.")
        row = await conn.fetchrow(
            "INSERT INTO vault_pairings (user_id, session_id, commit, device, "
            "method, ip, expires_at) VALUES ($1, $2, $3, $4, 'code', $5, "
            "now() + make_interval(mins => $6)) RETURNING id, expires_at",
            user_id, session_id, commit_bytes, device[:200], ip,
            PAIRING_MINUTES)
    return {"id": str(row["id"]), "expiresAt": row["expires_at"].isoformat()}


#: Clears a pairing's keys and the sealed vault key, once nobody needs them.
_CLEAR_PAIRING = ("pub_a = NULL, pub_b = NULL, sealed = NULL")


async def pairing_view(pool: asyncpg.Pool, user_id: uuid.UUID,
                       pairing_id: uuid.UUID,
                       by_session: uuid.UUID | None = None) -> dict | None:
    """A pairing as its owner sees it, from any of their sessions. Expiry
    shows as the state, so a stale one reads as over.

    What only the moment needed is cleared as soon as its outcome is seen:
    an expired one's keys at once; an approved one's keys and sealed vault
    key once the new browser (`by_session`, the session that made it) has
    read them, here, in the same transaction. A denied one was cleared when
    it was denied."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT id, state, session_id, commit, pub_a, pub_b, sealed, "
            "device, method, ip, created_at, expires_at, "
            "expires_at <= now() AS expired "
            "FROM vault_pairings WHERE id = $1 AND user_id = $2 FOR UPDATE",
            pairing_id, user_id)
        if row is None:
            return None
        state = row["state"]
        secrets_ = (row["pub_a"], row["pub_b"], row["sealed"])
        if state in ("waiting", "answered", "revealed") and row["expired"]:
            state = "expired"
            secrets_ = (None, None, None)
            await conn.execute("UPDATE vault_pairings SET state = 'expired', "
                               f"{_CLEAR_PAIRING} WHERE id = $1", pairing_id)
        elif (state == "approved" and by_session is not None
              and row["session_id"] == by_session
              and any(v is not None for v in secrets_)):
            await conn.execute(f"UPDATE vault_pairings SET {_CLEAR_PAIRING} "
                               "WHERE id = $1", pairing_id)
    pub_a, pub_b, sealed = secrets_
    return {
        "id": str(row["id"]), "state": state,
        "commit": b64u(bytes(row["commit"])),
        "pubA": b64u(bytes(pub_a)) if pub_a is not None else None,
        "pubB": b64u(bytes(pub_b)) if pub_b is not None else None,
        "sealed": b64u(bytes(sealed)) if sealed is not None else None,
        "device": row["device"], "method": row["method"], "ip": row["ip"],
        "createdAt": _ms(row["created_at"]),
        "expiresAt": row["expires_at"].isoformat(),
    }


class _Expired(Taken):
    """A step on a pairing past its time. The step's transaction is rolled
    back; _expired marks the pairing so, and clears it, after."""


async def _expired(pool: asyncpg.Pool, pairing_id: uuid.UUID) -> None:
    """A pairing seen past its time: expired, its keys and sealed key gone."""
    await pool.execute(
        f"UPDATE vault_pairings SET state = 'expired', {_CLEAR_PAIRING} "
        "WHERE id = $1 AND state IN ('waiting', 'answered', 'revealed') "
        "AND expires_at <= now()", pairing_id)


async def _locked_step(conn, user_id: uuid.UUID, pairing_id: uuid.UUID,
                       want: str, *, by_session: uuid.UUID | None) -> _Pairing:
    """In a transaction: the pairing under a lock, if it is in `want`, not
    expired, and (when given) this session's. One past its time raises
    _Expired, for the caller to mark once its transaction is over."""
    row = await conn.fetchrow(
        "SELECT id, state, session_id, commit, pub_a, pub_b, sealed, "
        "expires_at <= now() AS expired FROM vault_pairings "
        "WHERE id = $1 AND user_id = $2 FOR UPDATE", pairing_id, user_id)
    if row is None or (by_session is not None
                       and row["session_id"] != by_session):
        raise NotFound("No such pairing.")
    if row["state"] == "expired" or (
            row["expired"] and row["state"] in ("waiting", "answered",
                                                "revealed")):
        raise _Expired("This request has expired. Start again.")
    if row["state"] != want:
        raise Taken("This request is not at that step.")
    return _pairing_row(row)


async def answer_pairing(pool: asyncpg.Pool, user_id: uuid.UUID,
                         pairing_id: uuid.UUID, *, pub_a: object) -> str:
    """The Mac (A), when the person opens the request, posts its own X25519
    public key. Once only. Returns the new state."""
    key = decode_b64u(pub_a, exact=X25519_LEN, what="public key")
    try:
        async with pool.acquire() as conn, conn.transaction():
            await _locked_step(conn, user_id, pairing_id, "waiting",
                               by_session=None)
            await conn.execute(
                "UPDATE vault_pairings SET pub_a = $2, state = 'answered' "
                "WHERE id = $1", pairing_id, key)
    except _Expired:
        await _expired(pool, pairing_id)
        raise
    return "answered"


async def reveal_pairing(pool: asyncpg.Pool, user_id: uuid.UUID,
                         pairing_id: uuid.UUID, *, pub_b: object,
                         by_session: uuid.UUID) -> str:
    """The new browser (B), once it has A's key, reveals its own; the core
    checks it against the commit B posted first. Only B's session. A mismatch
    is the end: the commit is B's word, and it was broken."""
    key = decode_b64u(pub_b, exact=X25519_LEN, what="public key")
    mismatch = False
    try:
        async with pool.acquire() as conn, conn.transaction():
            pairing = await _locked_step(conn, user_id, pairing_id, "answered",
                                         by_session=by_session)
            if commit_of(key) != pairing.commit:
                # The denial is kept, so this is committed, not rolled back.
                await conn.execute("UPDATE vault_pairings SET state = 'denied', "
                                   f"{_CLEAR_PAIRING} WHERE id = $1", pairing_id)
                mismatch = True
            else:
                await conn.execute(
                    "UPDATE vault_pairings SET pub_b = $2, state = 'revealed' "
                    "WHERE id = $1", pairing_id, key)
    except _Expired:
        await _expired(pool, pairing_id)
        raise
    if mismatch:
        raise Taken("The public key did not match the commit.")
    return "revealed"


async def approve_pairing(pool: asyncpg.Pool, user_id: uuid.UUID,
                          pairing_id: uuid.UUID, *, sealed: object) -> str:
    """The Mac (A), on Allow, seals the vault key for B and posts it. Once;
    the new browser then opens the vault with it."""
    sealed_bytes = decode_b64u(sealed, exact=WRAP_LEN, what="sealed vault key")
    try:
        async with pool.acquire() as conn, conn.transaction():
            await _locked_step(conn, user_id, pairing_id, "revealed",
                               by_session=None)
            await conn.execute(
                "UPDATE vault_pairings SET sealed = $2, state = 'approved' "
                "WHERE id = $1", pairing_id, sealed_bytes)
            await accounts.journal(conn, "vault.pairing.approved",
                                   user_id=user_id)
    except _Expired:
        await _expired(pool, pairing_id)
        raise
    return "approved"


async def deny_pairing(pool: asyncpg.Pool, user_id: uuid.UUID,
                       pairing_id: uuid.UUID) -> uuid.UUID | None:
    """"It's not me": the pairing is denied and the new browser's session
    ends at once. Returns that session's id, for closing its sockets."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT state, session_id FROM vault_pairings WHERE id = $1 "
            "AND user_id = $2 FOR UPDATE", pairing_id, user_id)
        if row is None:
            raise NotFound("No such pairing.")
        if row["state"] in ("approved", "denied", "expired"):
            raise Taken("This request is already settled.")
        await conn.execute("UPDATE vault_pairings SET state = 'denied', "
                           f"{_CLEAR_PAIRING} WHERE id = $1", pairing_id)
        session_id = await conn.fetchval(
            "UPDATE sessions SET ended_at = now() WHERE id = $1 "
            "AND ended_at IS NULL RETURNING id", row["session_id"])
        await accounts.journal(conn, "vault.pairing.denied", user_id=user_id)
    return session_id


def _random(n: int) -> bytes:
    import secrets
    return secrets.token_bytes(n)


# ----------------------------------------------------------- the relay

class RelayKeyPair(asyncssh.public_key.SSHKeyPair):
    """A client key for a vault key: it holds only the public half, and signs
    by asking `sign` (the VaultRelay) for the blob. asyncssh calls
    `sign_async` when it signs the user-auth request."""

    _key_type = "vault"

    def __init__(self, public, sign) -> None:
        self._public = public
        self._sign = sign
        super().__init__(public.algorithm, public.algorithm,
                         public.sig_algorithms, public.sig_algorithms,
                         public.public_data, public.get_comment_bytes())

    async def sign_async(self, data: bytes) -> bytes:
        # sig_algorithm is the one negotiated with the server (rsa-sha2-256
        # or -512 for RSA, the key's own otherwise): the page signs with it.
        return await self._sign(self.sig_algorithm, data)


class VaultRelay:
    """The page sockets that can sign for a person's vault keys now, and the
    relay of one signature at a time to a capable one of them.

    A page socket joins when its connection opens, announces which
    fingerprints it can sign for (vault.can), and leaves when it closes. The
    engine of tTerm for Mac sits on the same socket and answers for its keys
    itself; to the core a source is a source.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool
        self._sources: set = set()
        self._pending: dict[str, asyncio.Future] = {}
        #: The per-person rate limit for the hosts the person typed (the
        #: dials the core makes for their own machines, and the reachable
        #: check); shared so one count covers both.
        self.limiter = reach.Limiter()
        #: Set once whenever the capabilities change, then replaced: a waiter
        #: takes it before looking and waits on it, as terminals do (tick).
        self._tick = asyncio.Event()

    # ------------------------------------------------------ the sources

    def join(self, source) -> None:
        self._sources.add(source)
        self._announce()

    def leave(self, source) -> None:
        self._sources.discard(source)
        self._announce()

    def announced(self) -> None:
        """A source changed which keys it can sign for: wake what waits."""
        self._announce()

    def _announce(self) -> None:
        self._tick.set()
        self._tick = asyncio.Event()

    def _capable(self, user_id: uuid.UUID, fingerprint: str) -> list:
        return [s for s in self._sources
                if s.user_id == user_id and fingerprint in s.vault_can()]

    async def wait_capable(self, user_id: uuid.UUID, fingerprint: str,
                           waiting) -> None:
        """Until a socket can sign with this key, saying meanwhile that the
        terminal waits for the vault (`waiting`, as sign_blob does). A key
        server's login waits here, before it dials (0.1.19): waiting inside
        the SSH connection ran into its timeout (ssh.CONNECT_TIMEOUT, 12 s),
        and the terminal ended with "No answer from SSH" while the person
        was opening their vault (the app's checks, 01.11)."""
        told = False
        try:
            while True:
                tick = self._tick
                if self._capable(user_id, fingerprint):
                    return
                if not told:
                    waiting(True)
                    told = True
                await tick.wait()
        finally:
            if told:
                waiting(False)

    def answer(self, request_id: str, raw: bytes | None) -> None:
        """A socket answered vault.signed (raw bytes) or vault.unable
        (None)."""
        fut = self._pending.get(request_id)
        if fut is not None and not fut.done():
            fut.set_result(raw)

    async def _ask(self, source, *, fingerprint: str, alg: str, data: bytes,
                   machine: str, key_name: str) -> bytes | None:
        request_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[request_id] = fut
        try:
            await source.vault_sign({
                "op": "vault.sign", "id": request_id, "key": fingerprint,
                "alg": alg, "data": b64u(data), "machine": machine,
                "keyName": key_name})
        except Exception:               # noqa: BLE001 - the socket went away
            self._pending.pop(request_id, None)
            return None
        try:
            return await asyncio.wait_for(fut, SIGN_TIMEOUT)
        except asyncio.TimeoutError:
            return None
        finally:
            self._pending.pop(request_id, None)

    # ------------------------------------------------------- the signing

    async def sign_blob(self, alg: bytes, data: bytes, *, public_key: str,
                        user_id: uuid.UUID, fingerprint: str, key_name: str,
                        machine: str, machine_id: uuid.UUID,
                        project_id: uuid.UUID, waiting) -> bytes:
        """Gets the raw signature from a capable socket, builds the blob,
        verifies it with the public key, records vault.signed, and returns
        it. Asks one socket at a time (SIGN_TIMEOUT each); a socket that says
        unable or times out is passed over for the next. With none capable
        the terminal waits (`waiting(True)`) until a socket announces the
        key. A signature that does not verify is a ValueError: the login is
        refused, not retried."""
        alg_name = alg.decode()
        told = False
        try:
            while True:
                tick = self._tick
                for source in self._capable(user_id, fingerprint):
                    raw = await self._ask(source, fingerprint=fingerprint,
                                          alg=alg_name, data=data,
                                          machine=machine, key_name=key_name)
                    if raw is None:
                        continue
                    blob = verify_ssh_signature(public_key, data, alg, raw)
                    if told:
                        waiting(False)
                        told = False
                    await self._signed(project_id, user_id, machine_id,
                                       machine, fingerprint, source.label())
                    return blob
                if not told:
                    waiting(True)
                    told = True
                await tick.wait()
        finally:
            if told:
                waiting(False)

    async def _signed(self, project_id, user_id, machine_id, machine,
                      fingerprint, by) -> None:
        try:
            async with self.pool.acquire() as conn:
                await accounts.journal(
                    conn, "vault.signed", project_id=project_id,
                    user_id=user_id, machine_id=machine_id,
                    details={"fingerprint": fingerprint, "machine": machine,
                             "by": by})
                # Settings › Keys says when each key was last used.
                await conn.execute(
                    "UPDATE vault_keys k SET last_used_at = now() FROM vaults v "
                    "WHERE k.vault_id = v.id AND v.user_id = $1 "
                    "AND k.fingerprint = $2 AND k.removed_at IS NULL",
                    user_id, fingerprint)
        except Exception:               # noqa: BLE001 - the login goes on
            log.exception("could not record vault.signed")

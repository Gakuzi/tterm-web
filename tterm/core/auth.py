"""Signing in: a code from email, then, on a device the person trusts, a
four-digit code for quick sign-in. Open to everyone: an address without an
account gets one after its first code that works.

    1. The page asks for a code for an address. Six digits go there by
       email; they work for ten minutes, five tries, and only in the browser
       that asked (its own cookie, BROWSER_COOKIE): a code read out to
       someone over the phone is no use in their browser.
    2. The code signs the person in. For an address without an account it
       does not yet: first the person gives their name and accepts the
       Terms of Service, having read the Privacy Policy (sign_up), in the same
       browser within half an hour.
    3. Right after, the page offers a quick code for this device; "Not now"
       leaves the browser a stranger, and next time it is email again.
    4. A quick code makes the browser a device: a long random key the
       browser keeps (DEVICE_COOKIE) and, here, its hash and the quick
       code's. The quick code works only with that key, so it is no use
       anywhere else; five wrong ones and the device is forgotten, and it
       is email again.

A session is a cookie as well (SESSION_COOKIE). It ends after eight hours
without anything done, on Sign out, or with its device. Only hashes are
kept: of the random tokens plainly, of the codes and the quick codes with a
secret of this server's that never goes to the database (`auth.key` in the
data folder), so that a copy of the database alone guesses nothing.

From 0.1.6 tTerm for the computer signs in with the browser (stage 3 of the
app). The app opens /connect in the browser with a challenge: the SHA-256
of a secret only the app knows (PKCE, RFC 7636). The person, signed in
there, allows it (allow_app), and the page takes a one-time code to the app
on 127.0.0.1, on that very computer, as RFC 8252 has it for apps on a
computer. The app trades the code and its secret for a device key of its own
(exchange_app): a device of kind "app", with no quick code, which the app
keeps in the system's keychain and asks sessions with (app_session). A link
someone else sends leads their browser to its own 127.0.0.1, so allowing it
gives them nothing; and a code caught on the way is no use without the
secret. Forget in Devices and Forget all devices sign the app out, as they
do a browser.

Allowing an app makes a key that lasts, so, as for the quick code, it takes
a sign-in made just now (APP_ALLOW_FRESH): whoever finds a browser open, or
watches one, hands out no key. An older session is asked to confirm, with
the quick code or a code from email, and the page then allows. A code not
yet traded dies with the session that allowed it: Sign out and Forget all
devices take it back too.
"""
from __future__ import annotations

import base64
import contextlib
import datetime as dt
import hashlib
import hmac
import ipaddress
import logging
import os
import re
import secrets
import uuid
from dataclasses import dataclass
from pathlib import Path

import asyncpg

from . import accounts, letters
from .accounts import Person
from .mail import Mailer, MailFailed

log = logging.getLogger("tterm.auth")

CODE_DIGITS = 6
CODE_MINUTES = 10
CODE_TRIES = 5
#: Seconds between two codes for one address.
CODE_EVERY = 60
CODES_PER_ADDRESS_HOUR = 5
#: Per network: an IPv4 address, or an IPv6 /64.
CODES_PER_IP_HOUR = 10
#: All the codes tTerm Web sends in a day, under Brevo's free 300.
CODES_PER_DAY = 250
#: Of those, the most for addresses without an account: the rest is kept
#: for the people who have one.
SIGNUPS_PER_DAY = 150
#: How long after its code an address without an account may still be
#: signed up in that browser.
SIGN_UP_TIME = dt.timedelta(minutes=30)
#: A person's name, at most.
NAME_MAX = 100
PIN_DIGITS = 4
PIN_TRIES = 5
#: How long after signing in with a code from email a quick code may be set.
PIN_OFFER = dt.timedelta(minutes=15)
#: A device not signed in with for this long is not trusted any more, and
#: the sweep deletes it, as it does one forgotten (the Privacy Policy).
DEVICE_DAYS = 90
#: A session ends after this long without anything done.
IDLE = dt.timedelta(hours=8)
#: A session's last activity is written at most this often.
TOUCH_EVERY = dt.timedelta(minutes=1)

SESSION_COOKIE = "tterm-session"
DEVICE_COOKIE = "tterm-device"
BROWSER_COOKIE = "tterm-browser"

#: The apps that sign in with the browser, as the device's label names them.
APPS = {"mac": "Mac", "windows": "Windows", "linux": "Linux"}
#: What the browser allowed works this long, once.
APP_GRANT_MINUTES = 2
#: Apps one person may allow in an hour: far more than anyone signs in.
APP_GRANTS_PER_HOUR = 20
#: A computer's name in the device's label, at most.
COMPUTER_NAME_MAX = 64
#: Allowing an app takes a sign-in this recent, as the quick code does.
APP_ALLOW_FRESH = PIN_OFFER
#: RFC 7636: the challenge is the base64url of a SHA-256, the secret 43 to
#: 128 of these characters. Whole strings only (fullmatch): "$" would let a
#: newline at the end through.
_CHALLENGE = re.compile(r"[A-Za-z0-9_-]{43}")
_VERIFIER = re.compile(r"[A-Za-z0-9._~-]{43,128}")
#: A one-time code or a device key, as new_token makes them.
_TOKEN = re.compile(r"[A-Za-z0-9_-]{32,64}")

#: An address as people have them: no quotes, no brackets, no spaces.
_EMAIL = re.compile(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}"
                    r"@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
                    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$")


# --------------------------------------------------------------- refusals

class Refused(Exception):
    """Something the person is told, with an HTTP status for the page."""

    status = 400

    def __init__(self, message: str, **details) -> None:
        super().__init__(message)
        self.details = details


class TooSoon(Refused):
    status = 429


class WrongCode(Refused):
    status = 401


class DeviceForgotten(Refused):
    """The device's key is unknown, or no longer trusted: email again."""
    status = 410


class NotSignedIn(Refused):
    status = 401


# ---------------------------------------------------------------- secrets

def load_secret(path: Path) -> bytes:
    """This server's secret for the hashes of codes, made on the first
    start and readable by this user only."""
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        pass
    else:
        if len(data) < 32:
            raise RuntimeError(
                f"{path} is damaged. Delete it and start again: the quick "
                "codes set until now stop working, and everyone signs in "
                "with a code from email once.")
        return data
    path.parent.mkdir(parents=True, exist_ok=True)
    fresh = path.with_name(path.name + ".new")
    fd = os.open(fresh, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(secrets.token_bytes(32))
    os.replace(fresh, path)
    return path.read_bytes()


def _mac(secret: bytes, *parts: str | bytes) -> bytes:
    mac = hmac.new(secret, digestmod=hashlib.sha256)
    for part in parts:
        data = part.encode() if isinstance(part, str) else part
        mac.update(len(data).to_bytes(4, "big"))
        mac.update(data)
    return mac.digest()


def token_hash(token: str) -> bytes:
    """Tokens are long and random: a plain hash is enough."""
    return hashlib.sha256(token.encode()).digest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


# -------------------------------------------------------------- the words

def normalize_email(raw: object) -> str | None:
    """The address in lower case, or None if it cannot be one."""
    if not isinstance(raw, str):
        return None
    email = raw.strip().lower()
    if not 3 <= len(email) <= 254 or not email.isprintable():
        return None
    return email if _EMAIL.match(email) else None


def network_of(ip: str) -> str:
    """Where the limits per network count: an IPv4 address on its own, an
    IPv6 one by its /64, which one home or one server gets whole; with only
    its full address, anyone with IPv6 would have endless networks."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if address.version == 6:
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)


def digits(raw: object, count: int) -> str | None:
    """Exactly `count` digits, spaces around and inside forgiven."""
    if not isinstance(raw, str):
        return None
    value = "".join(raw.split())
    if len(value) == count and value.isascii() and value.isdigit():
        return value
    return None


def too_easy(pin: str) -> bool:
    """A quick code anyone would try first: one digit four times, or the
    digits in a row (1234, 9876)."""
    steps = {int(b) - int(a) for a, b in zip(pin, pin[1:])}
    return len(set(pin)) == 1 or steps in ({1}, {-1})


def clean_name(raw: object) -> str | None:
    """The name as the person typed it, its spaces tidied; None if it cannot
    be one: empty, too long, with no letter or digit, or with characters
    that do not print."""
    if not isinstance(raw, str):
        return None
    name = " ".join(raw.split())
    if not 1 <= len(name) <= NAME_MAX or not name.isprintable():
        return None
    return name if re.search(r"[^\W_]", name) else None


def device_label(user_agent: str) -> str:
    """"Chrome on macOS", from what the browser says about itself."""
    ua = user_agent or ""
    if "Edg/" in ua:
        browser = "Edge"
    elif "OPR/" in ua:
        browser = "Opera"
    elif "Firefox/" in ua or "FxiOS" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "A browser"
    if "iPhone" in ua:
        system = "iPhone"
    elif "iPad" in ua:
        system = "iPad"
    elif "Android" in ua:
        system = "Android"
    elif "Macintosh" in ua or "Mac OS X" in ua:
        system = "macOS"
    elif "Windows" in ua:
        system = "Windows"
    elif "Linux" in ua or "X11" in ua:
        system = "Linux"
    else:
        return browser
    return f"{browser} on {system}"


def computer_name(raw: object) -> str | None:
    """The computer's name as its app says it, for the device's label and
    the page in the browser: its spaces tidied, printable, up to
    COMPUTER_NAME_MAX; None if it cannot be one."""
    if not isinstance(raw, str):
        return None
    name = " ".join(raw.split())
    if not 1 <= len(name) <= COMPUTER_NAME_MAX or not name.isprintable():
        return None
    return name


def app_label(app: str, name: str) -> str:
    """"tTerm for Mac on MacBook-Pro-Denis": the app's device in Devices."""
    return f"tTerm for {APPS.get(app, 'the computer')} on {name}"


def pkce_challenge(verifier: str) -> str:
    """The challenge of a secret, as RFC 7636 makes it (S256)."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def is_challenge(raw: object) -> bool:
    return isinstance(raw, str) and bool(_CHALLENGE.fullmatch(raw))


def is_verifier(raw: object) -> bool:
    return isinstance(raw, str) and bool(_VERIFIER.fullmatch(raw))


def is_token(raw: object) -> bool:
    return isinstance(raw, str) and bool(_TOKEN.fullmatch(raw))


# ------------------------------------------------------------------ codes

async def ask_code(pool: asyncpg.Pool, secret: bytes, mailer: Mailer, *,
                   email: str, browser: str, ip: str, page_url: str,
                   support: str = letters.SUPPORT, lang: str = "en") -> None:
    """Sends a code for signing in to `email`, for this browser. Refuses,
    saying when to try again, when codes come too often: to one address,
    from one network, or in all. An email that does not go out does not
    count."""
    code = f"{secrets.randbelow(10 ** CODE_DIGITS):0{CODE_DIGITS}d}"
    net = network_of(ip) if ip else ""
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"login-code:{email}")
        last = await conn.fetchval(
            "SELECT extract(epoch FROM now() - max(created_at)) FROM login_codes "
            "WHERE email = $1", email)
        if last is not None and last < CODE_EVERY:
            wait = int(CODE_EVERY - last) + 1
            raise TooSoon(f"A code was sent a moment ago. You can ask for "
                          f"another in {wait} seconds.", wait=wait)
        hour = await conn.fetchval(
            "SELECT count(*) FROM login_codes WHERE email = $1 "
            "AND created_at > now() - interval '1 hour'", email)
        if hour >= CODES_PER_ADDRESS_HOUR:
            raise TooSoon("Too many codes for this address. Try again in an "
                          "hour.", wait=3600)
        if net and await conn.fetchval(
                "SELECT count(*) FROM login_codes WHERE net = $1 "
                "AND created_at > now() - interval '1 hour'",
                net) >= CODES_PER_IP_HOUR:
            raise TooSoon("Too many codes from this network. Try again in an "
                          "hour.", wait=3600)
        new = not await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1)", email)
        day = await conn.fetchrow(
            "SELECT count(*) AS codes, count(*) FILTER (WHERE new_account) "
            "AS signups FROM login_codes "
            "WHERE created_at > now() - interval '1 day'")
        if day["codes"] >= CODES_PER_DAY:
            log.error("the day's codes are used up")
            raise TooSoon("No more email can go out today. Try again "
                          "tomorrow.", wait=3600)
        if new and day["signups"] >= SIGNUPS_PER_DAY:
            log.error("the day's sign-ups are used up")
            raise TooSoon("No more new accounts today. Try again tomorrow.",
                          wait=3600)
        code_id = await conn.fetchval(
            "INSERT INTO login_codes (email, code_hash, browser, ip, net, "
            "new_account, expires_at) VALUES ($1, $2, $3, $4, $5, $6, "
            "now() + make_interval(mins => $7)) RETURNING id",
            email, _mac(secret, "code", email, code), token_hash(browser), ip,
            net, new, CODE_MINUTES)
    try:
        await mailer.send(letters.code_email(
            to=email, code=code, minutes=CODE_MINUTES, page_url=page_url,
            support=support, lang=lang))
    except MailFailed:
        # Nothing went out: it counts against no limit, and a new try may
        # come at once.
        await pool.execute("DELETE FROM login_codes WHERE id = $1", code_id)
        raise Refused("The email could not be sent. Try again.")


@dataclass(frozen=True)
class SignedIn:
    person: Person
    email: str
    #: The session's token, for its cookie.
    token: str
    session_id: uuid.UUID
    #: The account was made just now.
    new: bool = False


@dataclass(frozen=True)
class SignUp:
    """The code was right, and the address has no account yet: the person
    gives their name and accepts the terms first (sign_up)."""
    email: str


class SignUpOver(Refused):
    """Too late, or in another browser: a new code, then."""
    status = 410


async def check_code(pool: asyncpg.Pool, secret: bytes, mailer: Mailer, *,
                     email: str, code: str, browser: str, ip: str,
                     label: str, page_url: str,
                     support: str = letters.SUPPORT) -> SignedIn | SignUp:
    """Signs in with a code from email; for an address without an account,
    says that the account is to be made first. Only the latest code for the
    address in this browser counts."""
    wrong = await _try_code(pool, secret, email=email, code=code,
                            browser=browser)
    if wrong is not None:
        raise wrong
    async with pool.acquire() as conn, conn.transaction():
        # Used now, if no one else used it in the meantime.
        used = await conn.fetchval(
            """
            UPDATE login_codes SET used_at = now()
            WHERE id = (SELECT id FROM login_codes
                        WHERE email = $1 AND browser = $2 AND used_at IS NULL
                          AND expires_at > now()
                        ORDER BY created_at DESC LIMIT 1)
              AND used_at IS NULL AND code_hash = $3 AND tries < $4
            RETURNING id
            """, email, token_hash(browser), _mac(secret, "code", email, code),
            CODE_TRIES)
        if used is None:
            raise WrongCode("This code no longer works. Ask for a new one.",
                            left=0)
        person = await _account(conn, email)
        if person is None:
            await conn.execute(
                "UPDATE login_codes SET signup_by = now() + $2::interval "
                "WHERE id = $1", used, SIGN_UP_TIME)
            return SignUp(email)
        token, session_id = await _new_session(
            conn, person.id, method="code", label=label, ip=ip)
        await accounts.journal(conn, "user.signed_in", user_id=person.id,
                               details={"how": "code", "device": label,
                                        "ip": ip})
    # The person hears of every sign-in from a browser tTerm Web does not
    # know. A sign-in they did not make means someone has their email.
    with contextlib.suppress(MailFailed):
        await mailer.send(letters.sign_in_email(
            to=email, label=label, ip=ip,
            at=dt.datetime.now(dt.timezone.utc), page_url=page_url,
            support=support))
    return SignedIn(person, email, token, session_id)


async def sign_up(pool: asyncpg.Pool, *, email: str, browser: str, name: str,
                  ip: str, label: str) -> SignedIn:
    """Makes the account of `email`, whose code this browser entered, with
    the person's name and their yes to the Terms of Service, and signs them in.
    Once only, and only while the address has no account: one made
    meanwhile is signed in to with a new code, as always. `name` is clean
    (clean_name); the page asks for the tick before it comes here."""
    # Raised after the transaction, which keeps the sign-up used up.
    refusal: Refused | None = None
    async with pool.acquire() as conn, conn.transaction():
        found = await conn.fetchval(
            """
            UPDATE login_codes SET signup_by = NULL
            WHERE id = (SELECT id FROM login_codes
                        WHERE browser = $1 AND email = $2 AND signup_by > now()
                        ORDER BY used_at DESC LIMIT 1)
              AND signup_by > now()
            RETURNING id
            """, token_hash(browser), email)
        if found is None:
            raise SignUpOver("Too much time has passed since the code. Ask "
                             "for a new one.")
        person = await _make_account(conn, email, name)
        if person is None:
            refusal = SignUpOver("This address has an account now. Ask for a "
                                 "new code to sign in.")
        else:
            token, session_id = await _new_session(
                conn, person.id, method="code", label=label, ip=ip)
            await accounts.journal(conn, "user.signed_in", user_id=person.id,
                                   details={"how": "code", "device": label,
                                            "ip": ip})
    if refusal is not None:
        raise refusal
    return SignedIn(person, email, token, session_id, True)


async def _try_code(pool: asyncpg.Pool, secret: bytes, *, email: str,
                    code: str, browser: str) -> WrongCode | None:
    """Checks the code; a wrong one counts as a try, kept even though the
    sign-in fails. What to tell the person, or None if the code is right."""
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT id, code_hash, tries FROM login_codes
            WHERE email = $1 AND browser = $2 AND used_at IS NULL
              AND expires_at > now()
            ORDER BY created_at DESC LIMIT 1
            FOR UPDATE
            """, email, token_hash(browser))
        if row is None or row["tries"] >= CODE_TRIES:
            return WrongCode("This code no longer works. Ask for a new one.",
                             left=0)
        if hmac.compare_digest(row["code_hash"],
                               _mac(secret, "code", email, code)):
            return None
        tries = row["tries"] + 1
        await conn.execute("UPDATE login_codes SET tries = $2 WHERE id = $1",
                           row["id"], tries)
    left = CODE_TRIES - tries
    if left <= 0:
        return WrongCode("Wrong code, and that was the last try. Ask for a "
                         "new one.", left=0)
    return WrongCode(f"Wrong code. {left} {'try' if left == 1 else 'tries'} "
                     "left.", left=left)


async def _account(conn: asyncpg.Connection, email: str) -> Person | None:
    """The account of an address, if it has one."""
    row = await conn.fetchrow(
        "SELECT id, name, theme, plan_id FROM users WHERE lower(email) = $1",
        email)
    if row is None:
        return None
    return Person(row["id"], row["name"], row["theme"], row["plan_id"], email)


async def _make_account(conn: asyncpg.Connection, email: str,
                        name: str) -> Person | None:
    """A new account for an address, with its Personal project, as the
    local owner's was, and the time its person accepted the terms; None if
    the address has one already. Sign-ups for it still waiting in other
    browsers get None, and sign_up refuses them: from now on it is signing
    in. (Not by touching their rows here: their own transactions may hold
    them while waiting for this lock.)"""
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                       f"user:{email}")
    if await _account(conn, email) is not None:
        return None
    user_id = await conn.fetchval(
        "INSERT INTO users (name, email, terms_accepted_at) "
        "VALUES ($1, $2, now()) RETURNING id", name, email)
    await conn.execute(
        "INSERT INTO sign_in_methods (user_id, kind, subject) "
        "VALUES ($1, 'email', $2) ON CONFLICT DO NOTHING", user_id, email)
    await accounts.journal(conn, "user.created", user_id=user_id,
                           details={"via": "email"})
    await accounts.create_project(conn, user_id, "Personal", "P")
    return Person(user_id, name, "system", "free", email)


async def _new_session(conn: asyncpg.Connection, user_id: uuid.UUID, *,
                       method: str, label: str, ip: str,
                       device_id: uuid.UUID | None = None
                       ) -> tuple[str, uuid.UUID]:
    token = new_token()
    session_id = await conn.fetchval(
        "INSERT INTO sessions (user_id, token_hash, device_id, method, label, ip) "
        "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        user_id, token_hash(token), device_id, method, label[:200], ip)
    return token, session_id


async def open_session(pool: asyncpg.Pool, user_id: uuid.UUID, *,
                       label: str = "", ip: str = "") -> str:
    """A session made directly, without a code: for the checks."""
    async with pool.acquire() as conn:
        token, _ = await _new_session(conn, user_id, method="code",
                                      label=label, ip=ip)
    return token


# ----------------------------------------------------- devices, quick code

async def trust_device(pool: asyncpg.Pool, secret: bytes, session: "Session",
                       pin: str, label: str, *, replaces: str | None = None
                       ) -> str:
    """This browser becomes a device of the person's, with a quick code.
    Only right after signing in with a code from email, and only once:
    a quick code is not changed by whoever finds the browser open.

    `replaces` is the key this browser kept until now, as a device of this
    person or someone else's: its cookie goes, so that device is forgotten.
    """
    late = Refused("A quick code is set right after signing in with a code "
                   "from email. Sign out and sign in again to set it.")
    if session.method != "code" or session.age > PIN_OFFER:
        raise late
    key = new_token()
    key_hash = token_hash(key)
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "SELECT device_id FROM sessions WHERE id = $1 AND ended_at IS NULL "
            "FOR UPDATE", session.id)
        if row is None or row["device_id"] is not None:
            raise late
        device_id = await conn.fetchval(
            "INSERT INTO devices (user_id, key_hash, pin_hash, label) "
            "VALUES ($1, $2, $3, $4) RETURNING id",
            session.person.id, key_hash, _mac(secret, "pin", key_hash, pin),
            label[:200])
        await conn.execute("UPDATE sessions SET device_id = $2 WHERE id = $1",
                           session.id, device_id)
        if replaces:
            old = await conn.fetchval(
                "SELECT id FROM devices WHERE key_hash = $1 "
                "AND kind = 'browser' AND forgotten_at IS NULL",
                token_hash(replaces))
            if old is not None:
                await _forget(conn, old)
        await accounts.journal(conn, "user.device_trusted",
                               user_id=session.person.id,
                               details={"device": label})
    return key


@dataclass(frozen=True)
class Device:
    id: uuid.UUID
    label: str
    name: str
    email: str


async def device(pool: asyncpg.Pool, key: str | None) -> Device | None:
    """The device this browser is, if it is one still trusted. An app's key
    is no browser's (0.1.6): it has no quick code."""
    if not key:
        return None
    row = await pool.fetchrow(
        """
        SELECT d.id, d.label, u.name, u.email FROM devices d
        JOIN users u ON u.id = d.user_id
        WHERE d.key_hash = $1 AND d.kind = 'browser' AND d.forgotten_at IS NULL
          AND d.last_used_at > now() - make_interval(days => $2)
        """, token_hash(key), DEVICE_DAYS)
    if row is None:
        return None
    return Device(row["id"], row["label"], row["name"], row["email"] or "")


async def check_pin(pool: asyncpg.Pool, secret: bytes, *, key: str, pin: str,
                    ip: str, label: str) -> SignedIn:
    """Signs in on a trusted device with its quick code. Five wrong ones
    and the device is forgotten."""
    key_hash = token_hash(key)
    # What the person is told when the code does not sign them in. It is
    # raised only after the transaction, which keeps the wrong try.
    refusal: Refused | None = None
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT d.id, d.user_id, d.pin_hash, d.pin_tries,
                   d.last_used_at > now() - make_interval(days => $2) AS fresh,
                   u.name, u.theme, u.plan_id, u.email
            FROM devices d JOIN users u ON u.id = d.user_id
            WHERE d.key_hash = $1 AND d.kind = 'browser'
              AND d.forgotten_at IS NULL
            FOR UPDATE OF d
            """, key_hash, DEVICE_DAYS)
        if row is None:
            refusal = DeviceForgotten("This device is not trusted any more. "
                                      "Sign in with a code from email.")
        elif not row["fresh"]:
            await _forget(conn, row["id"])
            refusal = DeviceForgotten(f"This device was not used for "
                                      f"{DEVICE_DAYS} days. Sign in with a "
                                      "code from email.")
        elif not hmac.compare_digest(row["pin_hash"],
                                     _mac(secret, "pin", key_hash, pin)):
            tries = row["pin_tries"] + 1
            if tries >= PIN_TRIES:
                await _forget(conn, row["id"])
                await accounts.journal(conn, "user.device_forgotten",
                                       user_id=row["user_id"],
                                       details={"why": "wrong codes", "ip": ip})
                refusal = DeviceForgotten(
                    f"{PIN_TRIES} wrong codes: this device is forgotten. Sign "
                    "in with a code from email.")
            else:
                await conn.execute(
                    "UPDATE devices SET pin_tries = $2 WHERE id = $1",
                    row["id"], tries)
                left = PIN_TRIES - tries
                refusal = WrongCode(f"Wrong code. {left} "
                                    f"{'try' if left == 1 else 'tries'} left.",
                                    left=left)
        else:
            await conn.execute(
                "UPDATE devices SET pin_tries = 0, last_used_at = now() "
                "WHERE id = $1", row["id"])
            token, session_id = await _new_session(
                conn, row["user_id"], method="pin", label=label, ip=ip,
                device_id=row["id"])
            await accounts.journal(conn, "user.signed_in",
                                   user_id=row["user_id"],
                                   details={"how": "pin", "device": label,
                                            "ip": ip})
    if refusal is not None:
        raise refusal
    person = Person(row["user_id"], row["name"], row["theme"], row["plan_id"],
                    row["email"])
    return SignedIn(person, row["email"] or "", token, session_id)


async def _forget(conn: asyncpg.Connection,
                  device_id: uuid.UUID) -> list[uuid.UUID]:
    """The device is no longer trusted, and its sessions end: their ids."""
    await conn.execute("UPDATE devices SET forgotten_at = now() WHERE id = $1",
                       device_id)
    rows = await conn.fetch("UPDATE sessions SET ended_at = now() "
                            "WHERE device_id = $1 AND ended_at IS NULL "
                            "RETURNING id", device_id)
    return [r["id"] for r in rows]


async def devices(pool: asyncpg.Pool, user_id: uuid.UUID,
                  current: uuid.UUID | None) -> list[dict]:
    """The person's devices: browsers with a quick code and, from 0.1.6,
    apps signed in with the browser ("kind")."""
    rows = await pool.fetch(
        "SELECT id, kind, label, created_at, last_used_at FROM devices "
        "WHERE user_id = $1 AND forgotten_at IS NULL "
        "AND last_used_at > now() - make_interval(days => $2) "
        "ORDER BY last_used_at DESC", user_id, DEVICE_DAYS)
    return [{"id": str(r["id"]), "kind": r["kind"], "label": r["label"],
             "createdAt": int(r["created_at"].timestamp() * 1000),
             "lastUsed": int(r["last_used_at"].timestamp() * 1000),
             "current": r["id"] == current} for r in rows]


async def forget_device(pool: asyncpg.Pool, user_id: uuid.UUID,
                        device_id: uuid.UUID) -> list[uuid.UUID] | None:
    """Forgets one of the person's devices; the sessions that ended with
    it, or None if there is no such device of theirs."""
    async with pool.acquire() as conn, conn.transaction():
        found = await conn.fetchval(
            "SELECT id FROM devices WHERE id = $1 AND user_id = $2 "
            "AND forgotten_at IS NULL FOR UPDATE", device_id, user_id)
        if found is None:
            return None
        ended = await _forget(conn, device_id)
        await accounts.journal(conn, "user.device_forgotten", user_id=user_id,
                               details={"why": "by hand"})
    return ended


# ------------------------------------- the app on a computer (from 0.1.6)

class AppGrantOver(Refused):
    """The code from the browser is unknown, used, too old, came without its
    secret, or its session ended: the app starts signing in again."""
    status = 410


class ConfirmFirst(Refused):
    """Allowing an app takes a sign-in made just now: the page asks the
    person to confirm it is them, then allows."""
    status = 403


async def allow_app(pool: asyncpg.Pool, session: "Session", *, app: str,
                    name: str, challenge: str) -> str:
    """The person, signed in in this browser, allows the app that opened it:
    a code for that app, which works for APP_GRANT_MINUTES, once, only with
    the secret whose challenge this is, and only while this session is on.
    `app` is a key of APPS, `name` clean (computer_name), `challenge`
    checked (is_challenge). Not from an app's own session: apps are allowed
    in a browser; and only within APP_ALLOW_FRESH of signing in."""
    if session.method == "app":
        raise Refused("Allow an app in a browser signed in to tTerm.")
    if session.age > APP_ALLOW_FRESH:
        raise ConfirmFirst("Confirm it is you first: a new app gets a key "
                           "that lasts.", confirm=True)
    code = new_token()
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"app-grants:{session.person.id}")
        recent = await conn.fetchval(
            "SELECT count(*) FROM app_grants WHERE user_id = $1 "
            "AND created_at > now() - interval '1 hour'", session.person.id)
        if recent >= APP_GRANTS_PER_HOUR:
            raise TooSoon("Too many apps were allowed in the last hour. Try "
                          "again in an hour.", wait=3600)
        await conn.execute(
            "INSERT INTO app_grants (user_id, session_id, code_hash, challenge, "
            "app, name, expires_at) VALUES ($1, $2, $3, $4, $5, $6, "
            "now() + make_interval(mins => $7))",
            session.person.id, session.id, token_hash(code), challenge, app,
            name, APP_GRANT_MINUTES)
        await accounts.journal(conn, "user.app_allowed",
                               user_id=session.person.id,
                               details={"app": app_label(app, name)})
    return code


@dataclass(frozen=True)
class AppSignedIn:
    person: Person
    #: The app's device key, for its keychain: it asks sessions with it.
    key: str
    device_id: uuid.UUID
    label: str
    #: The first session's token.
    token: str


async def exchange_app(pool: asyncpg.Pool, mailer: Mailer, *, code: str,
                       verifier: str, ip: str, page_url: str,
                       support: str = letters.SUPPORT) -> AppSignedIn:
    """The app trades the browser's code and its own secret for a device key
    of its own and a first session. One try per code: a wrong secret spends
    it, as a used or old code is spent. The person hears of the new app by
    email, as of every sign-in from a browser tTerm does not know."""
    over = AppGrantOver("This sign-in is over. Start again in tTerm with "
                        "Sign in with your browser.")
    signed: AppSignedIn | None = None
    async with pool.acquire() as conn, conn.transaction():
        # The person's sign-ins one at a time with Forget all devices: one
        # that comes while it runs waits for it, and then finds the session
        # that allowed the app ended.
        owner = await conn.fetchval(
            "SELECT user_id FROM app_grants WHERE code_hash = $1",
            token_hash(code))
        if owner is not None:
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                               f"sign-in:{owner}")
        # Only while the session that allowed it is on: Sign out and Forget
        # all devices end it, and with it what it allowed.
        grant = await conn.fetchrow(
            """
            UPDATE app_grants g SET used_at = now()
            FROM sessions s
            WHERE g.code_hash = $1 AND g.used_at IS NULL
              AND g.expires_at > now()
              AND s.id = g.session_id AND s.ended_at IS NULL
            RETURNING g.user_id, g.challenge, g.app, g.name
            """, token_hash(code))
        if grant is not None and hmac.compare_digest(
                grant["challenge"].encode(), pkce_challenge(verifier).encode()):
            user = await conn.fetchrow(
                "SELECT id, name, theme, plan_id, email FROM users WHERE id = $1",
                grant["user_id"])
            person = Person(user["id"], user["name"], user["theme"],
                            user["plan_id"], user["email"])
            label = app_label(grant["app"], grant["name"])
            key = new_token()
            device_id = await conn.fetchval(
                "INSERT INTO devices (user_id, kind, key_hash, pin_hash, label) "
                "VALUES ($1, 'app', $2, NULL, $3) RETURNING id",
                person.id, token_hash(key), label[:200])
            token, _ = await _new_session(conn, person.id, method="app",
                                          label=label, ip=ip,
                                          device_id=device_id)
            await accounts.journal(conn, "user.device_trusted",
                                   user_id=person.id,
                                   details={"device": label, "kind": "app"})
            await accounts.journal(conn, "user.signed_in", user_id=person.id,
                                   details={"how": "app", "device": label,
                                            "ip": ip})
            signed = AppSignedIn(person, key, device_id, label, token)
    # Raised after the transaction, which keeps the code spent.
    if signed is None:
        raise over
    if signed.person.email:
        with contextlib.suppress(MailFailed):
            await mailer.send(letters.sign_in_email(
                to=signed.person.email, label=signed.label, ip=ip,
                at=dt.datetime.now(dt.timezone.utc), page_url=page_url,
                support=support, app=True))
    return signed


async def app_session(pool: asyncpg.Pool, *, key: str,
                      ip: str) -> tuple[str, list[uuid.UUID]]:
    """A session for the app, by its device key: when it starts, and when
    its session ended (eight hours without anything done). Only the key of
    an app still trusted and used within DEVICE_DAYS; the app has one
    session at a time, so its others end. The token, and the sessions that
    ended."""
    refusal: Refused | None = None
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT id, user_id, label,
                   last_used_at > now() - make_interval(days => $2) AS fresh
            FROM devices
            WHERE key_hash = $1 AND kind = 'app' AND forgotten_at IS NULL
            FOR UPDATE
            """, token_hash(key), DEVICE_DAYS)
        if row is None:
            refusal = DeviceForgotten("This app was signed out of tTerm. Sign "
                                      "in again with your browser.")
        elif not row["fresh"]:
            await _forget(conn, row["id"])
            refusal = DeviceForgotten(f"This app was not used for {DEVICE_DAYS} "
                                      "days. Sign in again with your browser.")
        else:
            ended = [r["id"] for r in await conn.fetch(
                "UPDATE sessions SET ended_at = now() WHERE device_id = $1 "
                "AND ended_at IS NULL RETURNING id", row["id"])]
            await conn.execute("UPDATE devices SET last_used_at = now() "
                               "WHERE id = $1", row["id"])
            token, _ = await _new_session(conn, row["user_id"], method="app",
                                          label=row["label"], ip=ip,
                                          device_id=row["id"])
            await accounts.journal(conn, "user.signed_in",
                                   user_id=row["user_id"],
                                   details={"how": "app", "device": row["label"],
                                            "ip": ip})
    if refusal is not None:
        raise refusal
    return token, ended


# --------------------------------------------------------------- sessions

@dataclass(frozen=True)
class Session:
    id: uuid.UUID
    person: Person
    device_id: uuid.UUID | None
    method: str
    #: How long ago it began.
    age: dt.timedelta
    #: The device as it signed in: "tTerm for Mac on MacBook-Pro-Denis" for
    #: the app (from 0.1.17, for the journal of the vault's signatures).
    label: str = ""
    #: For the app: the computer it runs on, as it said by the computer's
    #: own key (0.1.28, devices.computer_id); that computer and the servers
    #: through it need no proof of open keys from it.
    computer_id: uuid.UUID | None = None


async def session(pool: asyncpg.Pool, token: str | None, *,
                  touch: bool = True) -> Session | None:
    """The session of this cookie, if it is still on. Notes it as used,
    unless `touch` is False: for what the page asks by itself, now and
    then, with nobody doing anything."""
    if not token:
        return None
    row = await pool.fetchrow(
        """
        SELECT s.id, s.user_id, s.device_id, s.method, s.label,
               now() - s.created_at AS age,
               s.last_seen_at < now() - $2::interval AS idle,
               s.last_seen_at < now() - $3::interval AS stale,
               d.forgotten_at IS NOT NULL AS forgotten,
               CASE WHEN s.method = 'app' THEN d.computer_id END AS computer_id,
               u.name, u.theme, u.plan_id, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN devices d ON d.id = s.device_id
        WHERE s.token_hash = $1 AND s.ended_at IS NULL
        """, token_hash(token), IDLE, TOUCH_EVERY)
    if row is None:
        return None
    if row["idle"] or row["forgotten"]:
        await pool.execute("UPDATE sessions SET ended_at = now() WHERE id = $1",
                           row["id"])
        return None
    if touch and row["stale"]:
        await pool.execute("UPDATE sessions SET last_seen_at = now() WHERE id = $1",
                           row["id"])
    person = Person(row["user_id"], row["name"], row["theme"], row["plan_id"],
                    row["email"])
    return Session(row["id"], person, row["device_id"], row["method"], row["age"],
                   row["label"] or "", row["computer_id"])


async def app_signed_in(pool: asyncpg.Pool, user_id: uuid.UUID) -> bool:
    """Whether the person has signed in with tTerm for Mac (0.1.18): a device
    of the app, not forgotten. The account menu stops offering the app then."""
    return bool(await pool.fetchval(
        "SELECT EXISTS (SELECT 1 FROM devices WHERE user_id = $1 "
        "AND kind = 'app' AND forgotten_at IS NULL)", user_id))


def socket_label(session: Session, user_agent: str) -> str:
    """What the journal names as the device of a page socket (0.1.17): the
    app by the device it signed in as, "tTerm for Mac on MacBook-Pro-Denis"
    (its engine opens the socket without a browser's User-Agent); a browser
    by its User-Agent, "Chrome on macOS"."""
    if session.method == "app":
        return session.label or "tTerm for Mac"
    return device_label(user_agent)


async def still_on(pool: asyncpg.Pool, session_id: uuid.UUID) -> bool:
    """Whether a session an open socket belongs to is still on. One that
    went idle ends here, as it would on the page's next request."""
    row = await pool.fetchrow(
        """
        SELECT s.ended_at IS NULL AS open,
               s.last_seen_at < now() - $2::interval AS idle,
               d.forgotten_at IS NOT NULL AS forgotten
        FROM sessions s LEFT JOIN devices d ON d.id = s.device_id
        WHERE s.id = $1
        """, session_id, IDLE)
    if row is None or not row["open"]:
        return False
    if row["idle"] or row["forgotten"]:
        await pool.execute("UPDATE sessions SET ended_at = now() "
                           "WHERE id = $1 AND ended_at IS NULL", session_id)
        return False
    return True


async def touch(pool: asyncpg.Pool, session_id: uuid.UUID) -> None:
    """Something was done in an open session (keys typed into a terminal)."""
    await pool.execute(
        "UPDATE sessions SET last_seen_at = now() WHERE id = $1 "
        "AND ended_at IS NULL AND last_seen_at < now() - $2::interval",
        session_id, TOUCH_EVERY)


async def sign_out(pool: asyncpg.Pool, token: str | None) -> uuid.UUID | None:
    """Ends the session of this cookie; its id, if it was on."""
    if not token:
        return None
    return await pool.fetchval("UPDATE sessions SET ended_at = now() "
                               "WHERE token_hash = $1 AND ended_at IS NULL "
                               "RETURNING id", token_hash(token))


async def forget_browser(pool: asyncpg.Pool, token: str | None,
                         key: str | None) -> list[uuid.UUID]:
    """Sign out, from 0.0.10: this browser forgets the person. Its session
    ends, and if the browser is a trusted device, the device is forgotten,
    with every session on it: next time it takes a code from email, which
    is also how one switches to another account. A session that merely ends
    (eight hours without anything done) keeps the device, and the quick
    code brings the person back. The sessions that ended."""
    ended: list[uuid.UUID] = []
    async with pool.acquire() as conn, conn.transaction():
        # The device first, then the sessions, in the order forget_device
        # and sign_out_everywhere take them: two of these at once (Sign out
        # here, Forget from a phone) then wait for each other instead of
        # deadlocking.
        device = None
        if key:
            device = await conn.fetchrow(
                "SELECT id, user_id FROM devices WHERE key_hash = $1 "
                "AND forgotten_at IS NULL FOR UPDATE", token_hash(key))
        row = None
        if token:
            row = await conn.fetchrow(
                "UPDATE sessions SET ended_at = now() WHERE token_hash = $1 "
                "AND ended_at IS NULL RETURNING id, user_id", token_hash(token))
        if row is not None:
            ended.append(row["id"])
        if device is not None:
            ended += await _forget(conn, device["id"])
        who = row["user_id"] if row is not None else (
            device["user_id"] if device is not None else None)
        if who is not None:
            await accounts.journal(conn, "user.signed_out", user_id=who,
                                   details={"device_forgotten": device is not None})
        if device is not None and device["user_id"] != who:
            # A shared browser: someone else's sign-out forgot it, and the
            # device's owner reads that in their own journal.
            await accounts.journal(conn, "user.device_forgotten",
                                   user_id=device["user_id"],
                                   details={"why": "signed out in that browser"})
    return ended


async def sign_out_everywhere(pool: asyncpg.Pool, user_id: uuid.UUID) -> None:
    """Every session ends and every device is forgotten: from anywhere,
    only a code from email signs in now. On the account page this is
    "Forget all devices" (0.0.10; in Settings from 0.1.4), so that it reads
    like Forget for one."""
    async with pool.acquire() as conn, conn.transaction():
        # As exchange_app takes it (0.1.6): an app's sign-in that comes
        # meanwhile waits, and finds this done.
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"sign-in:{user_id}")
        await conn.execute("UPDATE devices SET forgotten_at = now() "
                           "WHERE user_id = $1 AND forgotten_at IS NULL", user_id)
        await conn.execute("UPDATE sessions SET ended_at = now() "
                           "WHERE user_id = $1 AND ended_at IS NULL", user_id)
        await accounts.journal(conn, "user.signed_out_everywhere",
                               user_id=user_id)


async def sweep(pool: asyncpg.Pool) -> None:
    """Old codes and long-ended sessions go, and devices forgotten or not
    signed in with for DEVICE_DAYS (0.0.12), and from 0.1.6 the codes
    browsers gave apps, after a day. So does what is kept only
    for a while: commands with their output (30 days unless the project
    says less) and from 0.1.24 the folder a terminal ended in (30 days),
    the journal (a year) with the words of the machines' logs, from 0.1.25
    what people wrote to support (a year; the network of one written
    before signing in, which only its limit needs, a day),
    and from 0.1.17 the vault's pairings (a week; what they carried, an
    hour after they are over)."""
    await pool.execute("DELETE FROM login_codes "
                       "WHERE created_at < now() - interval '2 days'")
    # What browsers allowed apps: two minutes of use, a day for the record.
    await pool.execute("DELETE FROM app_grants "
                       "WHERE created_at < now() - interval '1 day'")
    await pool.execute("DELETE FROM sessions WHERE ended_at < now() - interval "
                       "'30 days' OR last_seen_at < now() - interval '30 days'")
    # Such a device signs no one in again, so nothing new starts on it. Its
    # sessions keep their own 30 days without it, and one still on goes on
    # as if signed in with a code from email (deleting the device alone
    # would take them along, ON DELETE CASCADE, and the usage counts would
    # miss them).
    async with pool.acquire() as conn, conn.transaction():
        gone = [r["id"] for r in await conn.fetch(
            "SELECT id FROM devices WHERE forgotten_at IS NOT NULL "
            "OR last_used_at < now() - make_interval(days => $1) FOR UPDATE",
            DEVICE_DAYS)]
        if gone:
            await conn.execute("UPDATE sessions SET device_id = NULL "
                               "WHERE device_id = ANY($1::uuid[])", gone)
            await conn.execute("DELETE FROM devices WHERE id = ANY($1::uuid[])",
                               gone)
    await pool.execute("DELETE FROM blocks WHERE expires_at <= now()")
    await pool.execute("DELETE FROM journal WHERE expires_at <= now()")
    # What people wrote to support (0.1.25): a year. The network of one
    # written before signing in counts towards its limit for an hour; it is
    # not kept past a day.
    await pool.execute("DELETE FROM support_messages WHERE expires_at <= now()")
    await pool.execute("UPDATE support_messages SET network = '' "
                       "WHERE network <> '' AND at < now() - interval '1 day'")
    # The folder a terminal ended in (0.1.24), for Open a new terminal on
    # it: as long as what its commands printed.
    await pool.execute(
        "UPDATE terminals SET last_cwd = NULL WHERE last_cwd IS NOT NULL "
        "AND closed_at < now() - interval '30 days'")
    # The words of the machine's log (0.1.20) go with their lines.
    await pool.execute(
        "DELETE FROM log_texts t WHERE t.expires_at <= now() "
        "AND NOT EXISTS (SELECT 1 FROM journal j WHERE j.text_id = t.id)")
    # The vault's pairings (0.1.17): their keys and a sealed vault key are
    # cleared once the outcome is seen (vault.py); those of a request over
    # for an hour that nobody looked at go here, and the rows after a week.
    await pool.execute(
        "UPDATE vault_pairings SET pub_a = NULL, pub_b = NULL, sealed = NULL, "
        "state = CASE WHEN state IN ('waiting', 'answered', 'revealed') "
        "THEN 'expired' ELSE state END "
        "WHERE expires_at < now() - interval '1 hour' "
        "AND (pub_a IS NOT NULL OR pub_b IS NOT NULL OR sealed IS NOT NULL)")
    await pool.execute("DELETE FROM vault_pairings "
                       "WHERE created_at < now() - interval '7 days'")

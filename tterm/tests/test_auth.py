"""Signing in: codes from email, quick codes on trusted devices, sessions,
and everyone seeing only their own."""
from __future__ import annotations

import asyncio
import contextlib
import http.server
import json
import os
import tempfile
import threading
import uuid
from pathlib import Path

import asyncpg
import asyncssh
import websockets

from ..api import ws as ws_module
from ..core import agents as agents_module
from ..core import auth, machines, mail, stats
from ..core import terminals as terminals_module
from ..core.machines import remember_cas
from .harness import free_socket, page_socket, request, sign_in_as

CHANGE = {"x-tterm": "1", "content-type": "application/json"}
#: What the sign-in screens link to, by default.
LEGAL = {"terms": "https://tterm.net/terms",
         "privacy": "https://tterm.net/privacy",
         "support": "support@tterm.net"}
CHROME_MAC = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 "
              "Safari/537.36")
SAFARI_IPHONE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                 "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 "
                 "Mobile/15E148 Safari/604.1")


class Browser:
    """One browser's cookies for one core's page, as a browser keeps them."""

    def __init__(self, port: int, *, agent: str = CHROME_MAC,
                 ip: str | None = None) -> None:
        self.port = port
        self.agent = agent
        self.ip = ip
        self.jar: dict[str, str] = {}
        #: What each Set-Cookie said, the last one per name.
        self.said: dict[str, str] = {}
        #: The address of the last code entered here, as the page shows it.
        self.entered = ""

    @property
    def cookie(self) -> str:
        return "; ".join(f"{k}={v}" for k, v in self.jar.items())

    async def call(self, method: str, path: str, body=None,
                   headers: dict[str, str] | None = None):
        sent = {"user-agent": self.agent, "cookie": self.cookie}
        if self.ip:
            sent["x-real-ip"] = self.ip
        if method not in ("GET", "HEAD"):
            sent.update(CHANGE)
        sent.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        r = await request(self.port, method, path, headers=sent, body=data)
        for line in r.set_cookies:
            pair, *attributes = [part.strip() for part in line.split(";")]
            name, value = pair.split("=", 1)
            value = value.strip('"')
            self.said[name] = line
            gone = any(a.lower() == "max-age=0" for a in attributes)
            if gone or not value:
                self.jar.pop(name, None)
            else:
                self.jar[name] = value
        return r

    async def ask(self, email: str):
        return await self.call("POST", "/api/auth/code", {"email": email})

    async def verify(self, email: str, code: str):
        self.entered = email
        return await self.call("POST", "/api/auth/verify",
                               {"email": email, "code": code})

    async def sign_up(self, name: str, *, email: str | None = None,
                      agree: bool = True):
        """The sign-up screen sends what it shows: the address of the code
        entered last, unless told another."""
        return await self.call("POST", "/api/auth/signup",
                               {"email": email or self.entered, "name": name,
                                "agree": agree})

    def socket(self):
        return page_socket(self.port, cookie=self.cookie)


def last_code(core, email: str) -> str:
    for sent in reversed(core.mailer.sent):
        if sent.to == email and sent.subject.endswith("sign-in code"):
            return sent.subject.split()[0]
    raise AssertionError(f"no code went to {email}")


async def sign_in(core, browser: Browser, email: str) -> dict:
    """The whole way in with a code from email, signing an address without
    an account up, named after it (anna@… is Anna); the answer that signed
    in."""
    r = await browser.ask(email)
    assert r.status == 202, r.text
    email = r.json()["email"]
    r = await browser.verify(email, last_code(core, email))
    assert r.status == 200, r.text
    if r.json().get("signUp"):
        r = await browser.sign_up(email.split("@")[0].replace(".", " ").title())
        assert r.status == 200, r.text
    return r.json()


async def codes_are_old(core) -> None:
    """As if the codes so far were asked for minutes ago."""
    await core.pool.execute(
        "UPDATE login_codes SET created_at = created_at - interval '2 minutes'")


async def away_for_hours(core) -> None:
    """As if eight hours went by with nothing done: each session ends on its
    next look, as in a bank, and a trusted device stays trusted, so that its
    quick code brings the person back. (Sign out forgets the browser, from
    0.0.10.)"""
    await core.pool.execute(
        "UPDATE sessions SET last_seen_at = now() - $1::interval",
        auth.IDLE + auth.TOUCH_EVERY)


async def closed_with(ws, timeout: float = 5.0) -> int | None:
    """The close code the socket ends with, waiting for it."""
    try:
        async with asyncio.timeout(timeout):
            while True:
                await ws.recv()
    except websockets.ConnectionClosed as closed:
        return closed.rcvd.code if closed.rcvd else None
    except TimeoutError:
        raise AssertionError("the socket stayed open") from None


async def answers(ws) -> None:
    """The socket is open and listening: an unknown terminal is gone."""
    await ws.send(json.dumps({"op": "attach", "ch": 1,
                              "id": str(uuid.uuid4())}))
    async with asyncio.timeout(5):
        while True:
            frame = await ws.recv()
            if isinstance(frame, str) and json.loads(frame)["op"] == "gone":
                return


# ------------------------------------------------------------- the words

def test_addresses_codes_names_and_labels():
    assert auth.normalize_email("  Denis.G@Example.COM ") == "denis.g@example.com"
    for bad in ("", "denis", "a@b", "a b@c.de", "x@-x.com", None, 5,
                "a@b.c\u200b", "@example.com", "a" * 65 + "@example.com",
                "<b>x</b>@d.com", '"q"@d.com', "a,b@d.com"):
        assert auth.normalize_email(bad) is None, bad
    assert auth.normalize_email("o'brien+tterm@example.ie") == \
        "o'brien+tterm@example.ie"
    assert auth.network_of("203.0.113.5") == "203.0.113.5"
    assert auth.network_of("2001:db8:1:2::1") == "2001:db8:1:2::/64"
    assert auth.network_of("2001:db8:1:2:ffff::9") == "2001:db8:1:2::/64"
    assert auth.network_of("::ffff:203.0.113.5") == "203.0.113.5"
    assert auth.digits(" 123 456 ", 6) == "123456"
    for easy in ("0000", "1111", "1234", "6789", "4321", "3210"):
        assert auth.too_easy(easy), easy
    for fine in ("2741", "1235", "1212", "9087", "0001"):
        assert not auth.too_easy(fine), fine
    for bad in ("12345", "1234567", "12a456", "１２３４５６", None):
        assert auth.digits(bad, 6) is None, bad
    assert auth.clean_name("  Anna \t Nikolaeva  ") == "Anna Nikolaeva"
    assert auth.clean_name("Денис") == "Денис"
    assert auth.clean_name("x" * auth.NAME_MAX) == "x" * auth.NAME_MAX
    for bad in ("", "   ", "x" * (auth.NAME_MAX + 1), "--", "_", "a​b",
                "a\x00b", None, 5):
        assert auth.clean_name(bad) is None, bad
    assert auth.device_label(CHROME_MAC) == "Chrome on macOS"
    assert auth.device_label(SAFARI_IPHONE) == "Safari on iPhone"
    assert auth.device_label("") == "A browser"
    a, b = auth.new_token(), auth.new_token()
    assert a != b and len(a) >= 40


def test_the_secret_is_made_once_and_kept_private():
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "data" / "auth.key"
        first = auth.load_secret(path)
        assert len(first) == 32 and auth.load_secret(path) == first
        assert path.stat().st_mode & 0o777 == 0o600
        path.write_bytes(b"short")
        try:
            auth.load_secret(path)
        except RuntimeError as exc:
            assert "damaged" in str(exc)
        else:
            raise AssertionError("a damaged secret was taken")


# ------------------------------------------------------- codes from email

async def test_a_new_address_signs_up_after_its_code(h):
    async with h.core(owner_email="") as core:
        assert core.owner is None
        anna = Browser(core.page_port)
        r = await anna.call("GET", "/api/auth/state")
        assert r.json() == {"signedIn": False, "device": None, "legal": LEGAL}
        r = await anna.call("GET", "/api/state")
        assert r.status == 401 and r.json()["signedOut"] is True
        r = await anna.ask("not an address")
        assert r.status == 422, r.status
        r = await anna.ask("  Anna.Nikolaeva@Example.COM ")
        assert r.status == 202, r.text
        assert r.json() == {"sent": True, "email": "anna.nikolaeva@example.com",
                            "minutes": 10}
        assert "tterm-browser" in anna.jar
        said = anna.said["tterm-browser"].lower()
        assert "httponly" in said and "samesite=strict" in said
        sent = core.mailer.sent[-1]
        code = last_code(core, "anna.nikolaeva@example.com")
        assert len(code) == 6 and code.isdigit()
        assert code in sent.text and f"localhost:{core.page_port}" in sent.text
        # And as HTML, with the logo from this page (from 0.0.11).
        assert f">{code}</td>" in sent.html
        assert f'src="http://localhost:{core.page_port}/mail/logo.png"' in sent.html
        r = await anna.verify("anna.nikolaeva@example.com", "12")
        assert r.status == 422, r.status
        browser = anna.jar["tterm-browser"]
        # The code is right: no account yet, and no session, until the
        # person names themselves and accepts the terms.
        r = await anna.verify("Anna.Nikolaeva@example.com", code)
        assert r.status == 200, r.text
        assert r.json() == {"signUp": True, "email": "anna.nikolaeva@example.com"}
        assert "tterm-session" not in anna.jar and "tterm-browser" in anna.jar
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 0
        # Not from another browser.
        stranger = Browser(core.page_port)
        stranger.jar["tterm-browser"] = auth.new_token()
        r = await stranger.sign_up("Mallory", email="anna.nikolaeva@example.com")
        assert r.status == 410 and "new one" in r.json()["error"], r.text
        r = await Browser(core.page_port).sign_up("Mallory")
        assert r.status == 410, r.text
        for name, agree, says in (
                ("  ", True, "your name"),
                ("x" * 101, True, "100 characters"),
                ("Anna", False, "Terms of Service and Privacy Policy")):
            r = await anna.sign_up(name, agree=agree)
            assert r.status == 422 and says in r.json()["error"], (name, r.text)
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 0
        r = await anna.sign_up("  Anna   Nikolaeva ")
        assert r.status == 200, r.text
        assert r.json() == {"signedIn": True, "new": True, "name": "Anna",
                            "offerPin": True, "pinDigits": 4}
        assert "tterm-session" in anna.jar and "tterm-browser" not in anna.jar
        state = (await anna.call("GET", "/api/state")).json()
        me = state["me"]
        assert (me["name"], me["email"], me["initials"]) == (
            "Anna Nikolaeva", "anna.nikolaeva@example.com", "AN"), me
        assert [(p["name"], p["code"], p["role"], p["machines"])
                for p in state["projects"]] == [("Personal", "P", "owner", [])]
        assert await core.pool.fetchval(
            "SELECT now() - terms_accepted_at < interval '1 minute' FROM users")
        kinds = [r["kind"] for r in await core.pool.fetch(
            "SELECT kind FROM journal ORDER BY id")]
        assert kinds == ["user.created", "project.created", "user.signed_in"], \
            kinds
        # A sign-up works once, and a code too.
        anna.jar["tterm-browser"] = browser
        r = await anna.sign_up("Anna")
        assert r.status == 410, r.text
        r = await anna.verify("anna.nikolaeva@example.com", code)
        assert r.status == 401 and "no longer works" in r.json()["error"]
        # Signing out ends the session.
        r = await anna.call("POST", "/api/auth/signout")
        assert r.status == 200 and "tterm-session" not in anna.jar
        assert await core.pool.fetchval(
            "SELECT count(*) FROM sessions WHERE ended_at IS NULL") == 0
        # The next time: the same account, and a note by email.
        await codes_are_old(core)
        again = await sign_in(core, Browser(core.page_port, agent=SAFARI_IPHONE),
                              "anna.nikolaeva@example.com")
        assert again["new"] is False
        note = core.mailer.sent[-1]
        assert note.subject == "New sign-in to tTerm", note.subject
        assert "Safari on iPhone" in note.text and "Forget all devices" in note.text
        assert "Safari on iPhone" in note.html and "/settings" in note.html
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 1


async def test_a_sign_up_waits_half_an_hour_at_most(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port)
        assert (await anna.ask("anna@example.com")).status == 202
        r = await anna.verify("anna@example.com", last_code(core, "anna@example.com"))
        assert r.json()["signUp"] is True
        await core.pool.execute("UPDATE login_codes SET signup_by = now() "
                                "- interval '1 second'")
        r = await anna.sign_up("Anna")
        assert r.status == 410 and "Too much time" in r.json()["error"], r.text
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 0
        # Two browsers at once, both with a right code: one account.
        await codes_are_old(core)
        laptop, phone = Browser(core.page_port), Browser(core.page_port)
        for browser in (laptop, phone):
            await codes_are_old(core)
            assert (await browser.ask("anna@example.com")).status == 202
            r = await browser.verify("anna@example.com",
                                     last_code(core, "anna@example.com"))
            assert r.json()["signUp"] is True, r.text
        first, second = await asyncio.gather(laptop.sign_up("Anna"),
                                             phone.sign_up("Anna N"))
        assert sorted([first.status, second.status]) == [200, 410], (
            first.text, second.text)
        late = second if second.status == 410 else first
        assert "has an account now" in late.json()["error"], late.text
        assert "tterm-session" not in (phone if late is second else laptop).jar
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 1
        # Made elsewhere while a sign-up waited here: that one is over, and
        # signing in is with a new code, which tells the owner by email.
        stranger = Browser(core.page_port)
        assert (await stranger.ask("boris@example.com")).status == 202
        r = await stranger.verify("boris@example.com",
                                  last_code(core, "boris@example.com"))
        assert r.json()["signUp"] is True
        await codes_are_old(core)
        await sign_in(core, Browser(core.page_port), "boris@example.com")
        r = await stranger.sign_up("Mallory")
        assert r.status == 410 and "has an account now" in r.json()["error"]
        assert await core.pool.fetchval(
            "SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE u.email = 'boris@example.com'") == 1


async def test_a_sign_up_makes_the_account_on_the_screen(h):
    """Two codes entered in one browser, in two tabs: each tab's sign-up
    makes the account of the address it shows."""
    async with h.core(owner_email="") as core:
        tabs = Browser(core.page_port)
        for email in ("anna@example.com", "boris@example.com"):
            await codes_are_old(core)
            assert (await tabs.ask(email)).status == 202
            r = await tabs.verify(email, last_code(core, email))
            assert r.json()["signUp"] is True, r.text
        r = await tabs.sign_up("Anna Nikolaeva", email="anna@example.com")
        assert r.status == 200, r.text
        rows = await core.pool.fetch("SELECT email, name FROM users")
        assert [(r["email"], r["name"]) for r in rows] == [
            ("anna@example.com", "Anna Nikolaeva")], rows
        r = await tabs.sign_up("Boris", email="nobody@example.com")
        assert r.status == 410, r.text


async def test_a_code_works_only_in_its_browser_and_for_five_tries(h):
    async with h.core(owner_email="") as core:
        email = "anna@example.com"
        anna = Browser(core.page_port)
        assert (await anna.ask(email)).status == 202
        code = last_code(core, email)
        # Read out over the phone, it is no use in another browser.
        stranger = Browser(core.page_port)
        r = await stranger.verify(email, code)
        assert r.status == 401 and "cookie" in r.json()["error"], r.text
        stranger.jar["tterm-browser"] = auth.new_token()
        r = await stranger.verify(email, code)
        assert r.status == 401 and "no longer works" in r.json()["error"]
        wrong = "000000" if code != "000000" else "111111"
        for left in (4, 3, 2, 1):
            r = await anna.verify(email, wrong)
            assert r.status == 401 and r.json()["left"] == left, r.text
        assert "1 try left" in r.json()["error"]
        r = await anna.verify(email, wrong)
        assert r.json()["left"] == 0 and "last try" in r.json()["error"]
        # The tries are kept even though each sign-in failed.
        assert await core.pool.fetchval("SELECT tries FROM login_codes") == 5
        r = await anna.verify(email, code)
        assert r.status == 401 and "no longer works" in r.json()["error"]
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 0


async def test_codes_come_no_faster_than_the_limits_allow(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port, ip="203.0.113.5")
        assert (await anna.ask("anna@example.com")).status == 202
        r = await anna.ask("anna@example.com")
        assert r.status == 429 and 0 < r.json()["wait"] <= 61, r.text
        for _ in range(4):
            await codes_are_old(core)
            assert (await anna.ask("anna@example.com")).status == 202
        await codes_are_old(core)
        r = await anna.ask("anna@example.com")
        assert r.status == 429 and "this address" in r.json()["error"], r.text
        # Many addresses from one network.
        for n in range(5):
            assert (await anna.ask(f"a{n}@example.com")).status == 202
        r = await anna.ask("one-more@example.com")
        assert r.status == 429 and "this network" in r.json()["error"], r.text
        # All the codes of a day: the email plan's limit.
        await core.pool.execute(
            "INSERT INTO login_codes (email, code_hash, browser, ip, expires_at, "
            "created_at) SELECT 'x' || n || '@example.com', '\\x00', '\\x00', "
            "'198.51.100.' || (n % 200), now(), now() - interval '2 hours' "
            "FROM generate_series(1, $1) n", auth.CODES_PER_DAY)
        r = await Browser(core.page_port, ip="192.0.2.1").ask("bob@example.com")
        assert r.status == 429 and "today" in r.json()["error"], r.text
        assert last_code(core, "anna@example.com")
        assert not any(e.to == "bob@example.com" for e in core.mailer.sent)


async def test_an_email_that_does_not_go_out_says_so(h):
    async with h.core(owner_email="") as core:
        works = core.mailer.send

        async def broken(email):
            raise mail.MailFailed("Brevo answered 401")
        core.mailer.send = broken
        anna = Browser(core.page_port)
        r = await anna.ask("anna@example.com")
        assert r.status == 400 and "could not be sent" in r.json()["error"]
        # Nothing went out, so nothing counts: a new try at once works.
        assert await core.pool.fetchval("SELECT count(*) FROM login_codes") == 0
        core.mailer.send = works
        assert (await anna.ask("anna@example.com")).status == 202


async def test_sign_ups_cannot_use_up_the_email_of_those_with_accounts(h):
    async with h.core() as core:
        # Made-up addresses, from many networks: the sign-ups' share.
        await core.pool.execute(
            "INSERT INTO login_codes (email, code_hash, browser, ip, net, "
            "new_account, expires_at, created_at) SELECT 'x' || n || "
            "'@example.com', '\\x00', '\\x00', '198.51.100.' || n, "
            "'198.51.100.' || n, true, now(), now() - interval '2 hours' "
            "FROM generate_series(1, $1) n", auth.SIGNUPS_PER_DAY)
        r = await Browser(core.page_port, ip="192.0.2.7").ask("new@example.com")
        assert r.status == 429 and "new accounts" in r.json()["error"], r.text
        # The laptop's owner has an account: his code still goes out.
        r = await Browser(core.page_port, ip="192.0.2.8").ask("denis@example.com")
        assert r.status == 202, r.text
        assert last_code(core, "denis@example.com")


async def test_an_ipv6_network_counts_by_its_64(h):
    async with h.core(owner_email="") as core:
        for n in range(auth.CODES_PER_IP_HOUR):
            r = await Browser(core.page_port, ip=f"2001:db8:5:6::{n + 1:x}").ask(
                f"v6-{n}@example.com")
            assert r.status == 202, (n, r.text)
        r = await Browser(core.page_port, ip="2001:db8:5:6:ffff::1").ask(
            "one-more@example.com")
        assert r.status == 429 and "this network" in r.json()["error"], r.text
        r = await Browser(core.page_port, ip="2001:db8:5:7::1").ask(
            "next-door@example.com")
        assert r.status == 202, "another /64 is another network"


async def test_the_local_owner_signs_in_with_their_address(h):
    async with h.core() as core:
        denis = Browser(core.page_port)
        answer = await sign_in(core, denis, "Denis@Example.com")
        assert answer["new"] is False
        state = (await denis.call("GET", "/api/state")).json()
        assert state["me"]["id"] == str(core.owner.id)
        assert state["me"]["email"] == "denis@example.com"
        assert await core.pool.fetchval("SELECT count(*) FROM users") == 1


# -------------------------------------------------------- the quick code

async def test_a_quick_code_signs_in_on_its_device(h):
    async with h.core(owner_email="") as core:
        email = "anna@example.com"
        anna = Browser(core.page_port)
        await sign_in(core, anna, email)
        r = await anna.call("POST", "/api/auth/pin", {"pin": "12a4"})
        assert r.status == 422, r.status
        for easy in ("1234", "7777", "9876"):
            r = await anna.call("POST", "/api/auth/pin", {"pin": easy})
            assert r.status == 422 and "first anyone" in r.json()["error"], easy
        r = await anna.call("POST", "/api/auth/pin", {"pin": "27 41"})
        assert r.status == 200 and r.json() == {"trusted": True}, r.text
        assert "tterm-device" in anna.jar
        assert f"max-age={auth.DEVICE_DAYS * 86400}" in \
            anna.said["tterm-device"].lower()
        # Once only: a browser found open does not get its code changed.
        r = await anna.call("POST", "/api/auth/pin", {"pin": "3916"})
        assert r.status == 400, r.status
        await away_for_hours(core)
        r = await anna.call("GET", "/api/auth/state")
        assert r.json() == {"signedIn": False, "device": {
            "label": "Chrome on macOS", "name": "Anna", "email": email},
            "legal": LEGAL}
        r = await anna.call("POST", "/api/auth/pin-login", {"pin": "0000"})
        assert r.status == 401 and r.json()["left"] == 4, r.text
        r = await anna.call("POST", "/api/auth/pin-login", {"pin": "2741"})
        assert r.status == 200 and r.json() == {"signedIn": True}, r.text
        assert (await anna.call("GET", "/api/state")).status == 200
        assert await core.pool.fetchval(
            "SELECT pin_tries FROM devices") == 0, "a right code starts over"
        # Signed in with the quick code, it is not set again.
        r = await anna.call("POST", "/api/auth/pin", {"pin": "3916"})
        assert r.status == 400, r.status
        await away_for_hours(core)
        # Someone else's key with Anna's code is nothing.
        thief = Browser(core.page_port)
        thief.jar["tterm-device"] = auth.new_token()
        r = await thief.call("POST", "/api/auth/pin-login", {"pin": "2741"})
        assert r.status == 410 and "tterm-device" not in thief.jar
        # Five wrong codes, and the device is forgotten.
        for left in (4, 3, 2, 1):
            r = await anna.call("POST", "/api/auth/pin-login", {"pin": "4321"})
            assert r.status == 401 and r.json()["left"] == left, r.text
        r = await anna.call("POST", "/api/auth/pin-login", {"pin": "4321"})
        assert r.status == 410 and "forgotten" in r.json()["error"], r.text
        assert "tterm-device" not in anna.jar
        assert await core.pool.fetchval(
            "SELECT forgotten_at IS NOT NULL FROM devices") is True
        r = await anna.call("GET", "/api/auth/state")
        assert r.json()["device"] is None
        kinds = [r["kind"] for r in await core.pool.fetch(
            "SELECT kind FROM journal ORDER BY id")]
        assert kinds.count("user.device_trusted") == 1
        assert kinds[-1] == "user.device_forgotten", kinds


async def test_a_quick_code_is_set_right_after_the_email_only(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port)
        await sign_in(core, anna, "anna@example.com")
        await core.pool.execute(
            "UPDATE sessions SET created_at = now() - interval '16 minutes'")
        r = await anna.call("POST", "/api/auth/pin", {"pin": "2741"})
        assert r.status == 400 and "right after" in r.json()["error"], r.text
        assert await core.pool.fetchval("SELECT count(*) FROM devices") == 0


async def test_a_browser_that_changes_hands_forgets_the_old_device(h):
    async with h.core(owner_email="") as core:
        shared = Browser(core.page_port)
        await sign_in(core, shared, "anna@example.com")
        await shared.call("POST", "/api/auth/pin", {"pin": "2741"})
        await away_for_hours(core)
        # Bob uses email on Anna's device and trusts it for himself.
        await codes_are_old(core)
        await sign_in(core, shared, "bob@example.com")
        r = await shared.call("POST", "/api/auth/pin", {"pin": "8135"})
        assert r.status == 200, r.text
        rows = await core.pool.fetch(
            "SELECT u.email, d.forgotten_at IS NULL AS trusted FROM devices d "
            "JOIN users u ON u.id = d.user_id ORDER BY d.created_at")
        assert [(r["email"], r["trusted"]) for r in rows] == [
            ("anna@example.com", False), ("bob@example.com", True)]


async def test_sign_out_makes_the_browser_forget_you(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port)
        await sign_in(core, anna, "anna@example.com")
        assert (await anna.call("POST", "/api/auth/pin", {"pin": "2741"})).status == 200
        phone = Browser(core.page_port, agent=SAFARI_IPHONE)
        await codes_are_old(core)
        await sign_in(core, phone, "anna@example.com")
        assert (await phone.call("POST", "/api/auth/pin", {"pin": "5824"})).status == 200
        async with anna.socket() as ws:
            await answers(ws)
            r = await anna.call("POST", "/api/auth/signout")
            assert r.status == 200 and r.json() == {"signedOut": True}, r.text
            assert await closed_with(ws, 3) == ws_module.SIGNED_OUT_CLOSE
        assert "tterm-session" not in anna.jar and "tterm-device" not in anna.jar
        # Next time this browser is a stranger: a code from email, which is
        # also how one switches to another account.
        r = await anna.call("GET", "/api/auth/state")
        assert r.json()["signedIn"] is False and r.json()["device"] is None, r.text
        rows = await core.pool.fetch(
            "SELECT label, forgotten_at IS NULL AS trusted FROM devices "
            "ORDER BY created_at")
        assert [(r["label"], r["trusted"]) for r in rows] == [
            ("Chrome on macOS", False), ("Safari on iPhone", True)], rows
        # The other device is not touched.
        assert (await phone.call("GET", "/api/state")).status == 200
        row = await core.pool.fetchrow(
            "SELECT kind, details->>'device_forgotten' AS forgot FROM journal "
            "ORDER BY id DESC LIMIT 1")
        assert (row["kind"], row["forgot"]) == ("user.signed_out", "true"), row
        # Again, or with no cookies at all: no error, and nothing else ends.
        assert (await anna.call("POST", "/api/auth/signout")).status == 200
        assert (await Browser(core.page_port).call(
            "POST", "/api/auth/signout")).status == 200
        assert (await phone.call("GET", "/api/state")).status == 200
        # A session that ends by itself keeps its device (the quick code).
        await away_for_hours(core)
        r = await phone.call("GET", "/api/auth/state")
        assert r.json()["device"]["label"] == "Safari on iPhone", r.text
        # A shared browser: Anna's device in it, Bob signed in by email
        # without a quick code. His Sign out forgets the browser, and
        # Anna's own journal says so.
        shared = Browser(core.page_port)
        await codes_are_old(core)
        await sign_in(core, shared, "anna@example.com")
        assert (await shared.call("POST", "/api/auth/pin", {"pin": "3916"})).status == 200
        await away_for_hours(core)
        await codes_are_old(core)
        await sign_in(core, shared, "bob@example.com")
        assert (await shared.call("POST", "/api/auth/signout")).status == 200
        rows = await core.pool.fetch(
            "SELECT u.email, j.kind, j.details->>'why' AS why FROM journal j "
            "JOIN users u ON u.id = j.user_id "
            "WHERE j.kind IN ('user.signed_out', 'user.device_forgotten') "
            "ORDER BY j.id DESC LIMIT 2")
        assert sorted((r["email"], r["kind"], r["why"]) for r in rows) == [
            ("anna@example.com", "user.device_forgotten",
             "signed out in that browser"),
            ("bob@example.com", "user.signed_out", None)], rows


# --------------------------------------------------------------- sessions

async def test_a_session_ends_after_eight_hours_without_anything_done(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port)
        await sign_in(core, anna, "anna@example.com")
        await core.pool.execute(
            "UPDATE sessions SET last_seen_at = now() - interval '2 minutes'")
        # What the page asks by itself is not something done.
        r = await anna.call("GET", "/api/state",
                            headers={"x-tterm-background": "1"})
        assert r.status == 200
        idle = await core.pool.fetchval(
            "SELECT extract(epoch FROM now() - last_seen_at) FROM sessions")
        assert idle > 100, idle
        r = await anna.call("GET", "/api/state")
        idle = await core.pool.fetchval(
            "SELECT extract(epoch FROM now() - last_seen_at) FROM sessions")
        assert r.status == 200 and idle < 10, idle
        await core.pool.execute(
            "UPDATE sessions SET last_seen_at = now() - interval '8 hours 1 minute'")
        r = await anna.call("GET", "/api/state",
                            headers={"x-tterm-background": "1"})
        assert r.status == 401 and r.json()["signedOut"], r.text
        assert await core.pool.fetchval(
            "SELECT ended_at IS NOT NULL FROM sessions") is True
        # The sweep takes long-ended sessions and old codes away.
        await core.pool.execute(
            "UPDATE sessions SET ended_at = now() - interval '31 days'")
        await core.pool.execute(
            "UPDATE login_codes SET created_at = now() - interval '3 days'")
        await core.pool.execute(
            "INSERT INTO journal (kind, expires_at) VALUES ('old', now()), "
            "('fresh', now() + interval '1 day')")
        await auth.sweep(core.pool)
        assert await core.pool.fetchval("SELECT count(*) FROM sessions") == 0
        assert await core.pool.fetchval("SELECT count(*) FROM login_codes") == 0
        assert [r["kind"] for r in await core.pool.fetch(
            "SELECT kind FROM journal WHERE kind IN ('old', 'fresh')")] == [
            "fresh"], "what expired leaves the journal"


async def test_the_socket_closes_when_the_session_ends(h):
    async with h.core(owner_email="") as core:
        anna = Browser(core.page_port)
        await sign_in(core, anna, "anna@example.com")
        async with page_socket(core.page_port, cookie="") as ws:
            assert await closed_with(ws) == ws_module.SIGNED_OUT_CLOSE
        # Sign out closes this browser's socket at once.
        async with anna.socket() as ws:
            await answers(ws)
            await anna.call("POST", "/api/auth/signout")
            assert await closed_with(ws, 3) == ws_module.SIGNED_OUT_CLOSE
        # Sign out everywhere: every browser's, and the devices forgotten.
        await codes_are_old(core)
        await sign_in(core, anna, "anna@example.com")
        await anna.call("POST", "/api/auth/pin", {"pin": "2741"})
        phone = Browser(core.page_port, agent=SAFARI_IPHONE)
        await codes_are_old(core)
        await sign_in(core, phone, "anna@example.com")
        async with anna.socket() as mine, phone.socket() as theirs:
            await answers(mine)
            await answers(theirs)
            r = await phone.call("POST", "/api/auth/signout-everywhere")
            assert r.status == 200 and "tterm-session" not in phone.jar
            assert await closed_with(mine, 3) == ws_module.SIGNED_OUT_CLOSE
            assert await closed_with(theirs, 3) == ws_module.SIGNED_OUT_CLOSE
        assert await core.pool.fetchval(
            "SELECT count(*) FROM devices WHERE forgotten_at IS NULL") == 0
        assert (await anna.call("GET", "/api/state")).status == 401
        # Ended any other way, within the socket's next check.
        await codes_are_old(core)
        await sign_in(core, anna, "anna@example.com")
        recheck = ws_module.RECHECK
        ws_module.RECHECK = 0.2
        try:
            async with anna.socket() as ws:
                await answers(ws)
                await core.pool.execute(
                    "UPDATE sessions SET last_seen_at = now() - interval '9 hours'")
                assert await closed_with(ws, 3) == ws_module.SIGNED_OUT_CLOSE
        finally:
            ws_module.RECHECK = recheck


async def test_devices_are_listed_and_forgotten(h):
    async with h.core() as core:
        email = "anna@example.com"
        laptop = Browser(core.page_port)
        await sign_in(core, laptop, email)
        await laptop.call("POST", "/api/auth/pin", {"pin": "2741"})
        phone = Browser(core.page_port, agent=SAFARI_IPHONE)
        await codes_are_old(core)
        await sign_in(core, phone, email)
        await phone.call("POST", "/api/auth/pin", {"pin": "6028"})
        listed = (await phone.call("GET", "/api/devices")).json()["devices"]
        assert sorted((d["label"], d["current"]) for d in listed) == [
            ("Chrome on macOS", False), ("Safari on iPhone", True)], listed
        on_laptop = next(d["id"] for d in listed if not d["current"])
        on_phone = next(d["id"] for d in listed if d["current"])
        # Not someone else's.
        r = await request(core.page_port, "DELETE", f"/api/devices/{on_laptop}",
                          headers=CHANGE)
        assert r.status == 404, r.status
        async with laptop.socket() as ws:
            await answers(ws)
            r = await phone.call("DELETE", f"/api/devices/{on_laptop}")
            assert r.status == 200 and r.json() == {"forgotten": True,
                                                    "current": False}
            assert await closed_with(ws, 3) == ws_module.SIGNED_OUT_CLOSE
        assert (await laptop.call("GET", "/api/state")).status == 401
        assert (await phone.call("GET", "/api/state")).status == 200
        r = await phone.call("DELETE", f"/api/devices/{on_phone}")
        assert r.json() == {"forgotten": True, "current": True}
        assert "tterm-session" not in phone.jar and "tterm-device" not in phone.jar
        assert (await phone.call("GET", "/api/state")).status == 401


async def test_the_sweep_deletes_devices_forgotten_or_not_used(h):
    # The Privacy Policy: a device is kept until it is forgotten, but no
    # longer than 90 days without a sign-in; a session up to 30 days after
    # it ends, with its device or without.
    async with h.core(owner_email="") as core:
        laptop = Browser(core.page_port)
        await sign_in(core, laptop, "anna@example.com")
        assert (await laptop.call("POST", "/api/auth/pin", {"pin": "2741"})).status == 200
        phone = Browser(core.page_port, agent=SAFARI_IPHONE)
        await codes_are_old(core)
        await sign_in(core, phone, "anna@example.com")
        assert (await phone.call("POST", "/api/auth/pin", {"pin": "5824"})).status == 200
        # Sign out forgets the laptop; the phone's quick code was last used
        # 91 days ago, though the session it began is still on.
        assert (await laptop.call("POST", "/api/auth/signout")).status == 200
        await core.pool.execute(
            "UPDATE devices SET last_used_at = now() - make_interval(days => $1) "
            "WHERE label = 'Safari on iPhone'", auth.DEVICE_DAYS + 1)
        await auth.sweep(core.pool)
        assert await core.pool.fetchval("SELECT count(*) FROM devices") == 0
        # Their sessions stay, without them: the laptop's ended, the phone's
        # still on, as if begun with a code from email.
        rows = await core.pool.fetch(
            "SELECT device_id IS NULL AS alone, ended_at IS NOT NULL AS ended "
            "FROM sessions ORDER BY created_at")
        assert [(r["alone"], r["ended"]) for r in rows] == [
            (True, True), (True, False)], rows
        assert (await phone.call("GET", "/api/state")).status == 200
        # When it ends, the quick code does not bring anyone back: next
        # time, a code from email.
        await away_for_hours(core)
        assert (await phone.call("GET", "/api/state")).status == 401
        assert await core.pool.fetchval("SELECT count(*) FROM sessions") == 2
        r = await phone.call("GET", "/api/auth/state")
        assert r.json()["signedIn"] is False and r.json()["device"] is None, r.text
        # A device in use stays.
        await codes_are_old(core)
        await sign_in(core, laptop, "anna@example.com")
        assert (await laptop.call("POST", "/api/auth/pin", {"pin": "3916"})).status == 200
        await away_for_hours(core)
        await auth.sweep(core.pool)
        r = await laptop.call("GET", "/api/auth/state")
        assert r.json()["device"]["label"] == "Chrome on macOS", r.text


async def test_cookies_on_https_are_host_only_and_secure(h):
    async with h.core(owner_email="", environ={
            "TTERM_PAGE_URL": "https://app.example.test"}) as core:
        r = await request(core.page_port, "GET", "/health")
        assert r.status == 421 and "https://app.example.test" in r.text
        r = await request(core.page_port, "POST", "/api/auth/code",
                          host="app.example.test",
                          headers={**CHANGE, "origin": "https://app.example.test"},
                          body=json.dumps({"email": "anna@example.com"}).encode())
        assert r.status == 202, r.text
        line = r.set_cookies[0]
        assert line.startswith("__Host-tterm-browser="), line
        assert "secure" in line.lower() and "path=/" in line.lower()
        r = await request(core.page_port, "POST", "/api/auth/code",
                          host="app.example.test",
                          headers={**CHANGE, "origin": "http://app.example.test"},
                          body=json.dumps({"email": "anna@example.com"}).encode())
        assert r.status == 403, "an origin of plain http is not the page's"


# ------------------------------------------------- everyone has their own

async def _server(core, *, port: int = 1, name: str = "lab",
                  owner_id=None) -> uuid.UUID:
    cas = await core.signer.keys()
    await remember_cas(core.pool, cas)
    ca = next(c for c in cas if c["active"])
    owner_id = owner_id or core.owner.id
    project = await core.pool.fetchval(
        "SELECT id FROM projects WHERE owner_id = $1", owner_id)
    return await core.pool.fetchval(
        """
        INSERT INTO machines (project_id, kind, name, host, port, login,
                              host_keys, ca_id, created_by)
        VALUES ($1, 'server', $2, '127.0.0.1', $3, 'tterm', $4, $5, $6)
        RETURNING id
        """, project, name, port,
        [asyncssh.generate_private_key("ssh-ed25519").export_public_key()
         .decode().strip()], ca["id"], owner_id)


async def test_each_person_sees_only_their_own(h):
    async with h.core() as core:
        silent = free_socket()      # answers, then never says a word
        try:
            machine = await _server(core, port=silent.getsockname()[1])
            mine = await core.terminals.open(core.owner, machine, 80, 24)
            ended = await core.pool.fetchval(
                "INSERT INTO terminals (machine_id, owner_id, name, kind, "
                "closed_at) VALUES ($1, $2, '9', 'term', now()) RETURNING id",
                machine, core.owner.id)
            r = await request(core.page_port, "POST", "/api/installs",
                              headers=CHANGE, body=json.dumps({
                                  "projectId": str(await core.pool.fetchval(
                                      "SELECT id FROM projects")),
                                  "kind": "server"}).encode())
            assert r.status == 201, r.text
            install = r.json()["id"]
            project = await core.pool.fetchval("SELECT id FROM projects")

            anna = await sign_in_as(core, "anna@example.com")
            as_anna = {"cookie": anna}
            state = (await request(core.page_port, "GET", "/api/state",
                                   headers=as_anna)).json()
            assert state["me"]["email"] == "anna@example.com"
            assert [(p["code"], p["machines"]) for p in state["projects"]] == [
                ("P", [])], state["projects"]
            assert state["terminals"] == []
            anna_id = uuid.UUID(state["me"]["id"])
            for method, path in (
                    ("GET", f"/api/machines/{machine}"),
                    ("DELETE", f"/api/machines/{machine}"),
                    ("GET", f"/api/terminals/{mine.id}"),
                    ("DELETE", f"/api/terminals/{mine.id}"),
                    ("GET", f"/api/terminals/{ended}"),
                    ("GET", f"/api/terminals/{ended}/blocks"),
                    ("GET", f"/api/terminals/{ended}/blocks/1/output"),
                    ("GET", f"/api/terminals/{ended}/history"),
                    ("GET", f"/api/installs/{install}")):
                r = await request(core.page_port, method, path,
                                  headers={**CHANGE, **as_anna})
                assert r.status == 404, f"{method} {path}: {r.status}"
            for path in ("complete", "dirs", "branches"):
                r = await request(core.page_port, "POST",
                                  f"/api/terminals/{mine.id}/{path}",
                                  headers={**CHANGE, **as_anna},
                                  body=b'{"line": "ls ", "cursor": 3}')
                assert r.status == 409, f"{path}: {r.status}"
            r = await request(core.page_port, "POST", "/api/terminals",
                              headers={**CHANGE, **as_anna},
                              body=json.dumps({"machineId": str(machine)}).encode())
            assert r.status == 404, r.status
            r = await request(core.page_port, "POST", "/api/installs",
                              headers={**CHANGE, **as_anna},
                              body=json.dumps({"projectId": str(project)}).encode())
            assert r.status == 403, r.status
            assert core.terminals.get(mine.id, anna_id) is None
            assert core.terminals.live(anna_id) == []
            assert await core.terminals.ended(ended, anna_id) is None
            async with page_socket(core.page_port, cookie=anna) as ws:
                # A socket's first word is the vault's challenge (0.1.28).
                first = json.loads(await asyncio.wait_for(ws.recv(), 5))
                assert first["op"] == "vault.challenge", first
                for terminal in (mine.id, ended):
                    await ws.send(json.dumps({"op": "attach", "ch": 1,
                                              "id": str(terminal)}))
                    gone = json.loads(await asyncio.wait_for(ws.recv(), 5))
                    assert gone == {"op": "gone", "ch": 1, "terminal": None}, gone
            # A member sees the server until the membership ends, and then
            # not even its details (the security audit of 18.10, #2).
            await core.pool.execute(
                "INSERT INTO project_members (project_id, user_id, role) "
                "VALUES ($1, $2, 'member')", project, anna_id)
            r = await request(core.page_port, "GET", f"/api/machines/{machine}",
                              headers=as_anna)
            assert r.status == 200, r.status
            await core.pool.execute(
                "UPDATE project_members SET until = now() - interval '1 minute' "
                "WHERE user_id = $1", anna_id)
            r = await request(core.page_port, "GET", f"/api/machines/{machine}",
                              headers=as_anna)
            assert r.status == 404, r.status
            # The owner still has it all.
            r = await request(core.page_port, "GET", f"/api/machines/{machine}")
            assert r.status == 200
            assert core.terminals.get(mine.id, core.owner.id) is mine
            await mine.close()
        finally:
            silent.close()


class _SlowInsert:
    """The core's pool, with a new terminal taking a moment to be written."""

    def __init__(self, pool) -> None:
        self._pool = pool

    def __getattr__(self, name):
        return getattr(self._pool, name)

    async def execute(self, sql, *args):
        if sql.lstrip().startswith("INSERT INTO terminals"):
            await asyncio.sleep(0.2)
        return await self._pool.execute(sql, *args)


async def test_the_plan_limits_machines_and_terminals(h):
    async with h.core() as core:
        assert json.loads(await core.pool.fetchval(
            "SELECT limits FROM plans WHERE id = 'free'")) == {
            "machines": 50, "terminals": 24}
        # Smaller, for the check; changed in the database, as on a server.
        await core.pool.execute("UPDATE plans SET limits = "
                                "'{\"machines\": 4, \"terminals\": 2}'")
        silent = free_socket()
        try:
            machine = await _server(core, port=silent.getsockname()[1])
            first = await core.terminals.open(core.owner, machine, 80, 24)
            second = await core.terminals.open(core.owner, machine, 80, 24)
            r = await request(core.page_port, "POST", "/api/terminals",
                              headers=CHANGE,
                              body=json.dumps({"machineId": str(machine)}).encode())
            assert r.status == 404 and r.json()["error"] == (
                "You have 2 terminals open, and the Free plan allows 2. End "
                "one to open another."), r.text
            # Many at once: still no more than the limit.
            await first.close()
            await second.close()
            # A slow database: without a lock per person, each of them
            # would count before any is written down.
            real = core.terminals.pool
            core.terminals.pool = _SlowInsert(real)
            try:
                burst = await asyncio.gather(*(
                    core.terminals.open(core.owner, machine, 80, 24)
                    for _ in range(8)), return_exceptions=True)
            finally:
                core.terminals.pool = real
            opened = [t for t in burst if not isinstance(t, BaseException)]
            assert len(opened) == 2, burst
            assert all(isinstance(t, terminals_module.NotAllowed)
                       for t in burst if t not in opened), burst
            assert len(core.terminals.live(core.owner.id)) == 2
            for t in opened:
                await t.close()
            first = await core.terminals.open(core.owner, machine, 80, 24)
            second = await core.terminals.open(core.owner, machine, 80, 24)
            # Someone else's terminals are not counted against this person.
            anna = await sign_in_as(core, "anna@example.com")
            anna_id = await core.pool.fetchval(
                "SELECT id FROM users WHERE email = 'anna@example.com'")
            hers = await _server(core, port=silent.getsockname()[1],
                                 owner_id=anna_id)
            r = await request(core.page_port, "POST", "/api/terminals",
                              headers={**CHANGE, "cookie": anna},
                              body=json.dumps({"machineId": str(hers)}).encode())
            assert r.status == 201, r.text
            await first.close()
            third = await core.terminals.open(core.owner, machine, 80, 24)
            for t in (second, third, core.terminals.get(
                    uuid.UUID(r.json()["id"]), anna_id)):
                await t.close()
        finally:
            silent.close()
        # Machines: four in all of a person's projects, Anna's not counted.
        project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
        for n in range(3):
            await _server(core, name=f"m{n}")
        r = await request(core.page_port, "POST", "/api/installs",
                          headers=CHANGE, body=json.dumps({
                              "projectId": str(project),
                              "kind": "computer"}).encode())
        assert r.status == 403 and r.json()["error"] == (
            "The Free plan allows 4 machines, all in use. Remove one in tTerm "
            "Web to add another."), r.text
        # A command asked for before there were four does not add a fifth.
        token = machines.new_token("computer")
        await core.pool.execute(
            "INSERT INTO install_tokens (project_id, kind, token_hash, "
            "created_by, expires_at) VALUES ($1, 'computer', $2, $3, "
            "now() + interval '10 minutes')", project,
            machines.token_hash(token), core.owner.id)
        problem = await agents_module._install_problem(core.pool, token)
        assert problem is not None and "4 machines" in problem[0], problem
        assert problem[1] is True, "the agent stops"
        assert await core.pool.fetchval(
            "SELECT error FROM install_tokens WHERE token_hash = $1",
            machines.token_hash(token)) == problem[0]
        removed = await core.pool.fetchval(
            "SELECT id FROM machines WHERE name = 'm0'")
        r = await request(core.page_port, "DELETE", f"/api/machines/{removed}",
                          headers=CHANGE)
        assert r.status == 200, r.text
        r = await request(core.page_port, "POST", "/api/installs",
                          headers=CHANGE, body=json.dumps({
                              "projectId": str(project),
                              "kind": "computer"}).encode())
        assert r.status == 201, r.text
        # Only whole numbers under known names: a typo is refused, rather
        # than quietly lifting a limit.
        for bad in ('{"machine": 4}', '{"machines": "4"}', '{"machines": -1}',
                    '{"machines": 2.5}', '{"machines": [4]}', '[]'):
            try:
                await core.pool.execute("UPDATE plans SET limits = $1::jsonb", bad)
            except asyncpg.CheckViolationError:
                continue
            raise AssertionError(f"limits {bad} were taken")
        await core.pool.execute("UPDATE plans SET limits = "
                                "jsonb_set(limits, '{machines}', '6.0')")
        assert await core.pool.fetchval("SELECT limits->>'machines' FROM plans") \
            == "6.0"
        # A plan that names no limit has none.
        await _server(core, name="m9")
        await core.pool.execute("UPDATE plans SET limits = '{}'")
        r = await request(core.page_port, "POST", "/api/installs",
                          headers=CHANGE, body=json.dumps({
                              "projectId": str(project),
                              "kind": "computer"}).encode())
        assert r.status == 201, r.text


# ------------------------------------------------------------ account page

async def test_the_account_page_has_the_name_plan_and_devices(h):
    async with h.core() as core:
        # The laptop's owner: no device trusted, nothing used yet.
        r = await request(core.page_port, "GET", "/api/account")
        assert r.status == 200 and r.headers["cache-control"] == "no-store"
        assert r.json() == {
            "plan": {"id": "free", "name": "Free",
                     "limits": {"machines": 50, "terminals": 24}},
            "usage": {"machines": 0, "terminals": 0},
            "devices": [], "legal": LEGAL}, r.text
        silent = free_socket()
        try:
            port = silent.getsockname()[1]
            machine = await _server(core, port=port)
            await _server(core, port=port, name="db")
            opened = await core.terminals.open(core.owner, machine, 80, 24)
            usage = (await request(core.page_port, "GET",
                                   "/api/account")).json()["usage"]
            assert usage == {"machines": 2, "terminals": 1}, usage
            await opened.close()
        finally:
            silent.close()
        # A limit the plan does not set is none.
        await core.pool.execute("UPDATE plans SET limits = '{\"machines\": 3}'")
        plan = (await request(core.page_port, "GET", "/api/account")).json()["plan"]
        assert plan["limits"] == {"machines": 3, "terminals": None}, plan
        # The name, changed there: its spaces tidied, at most 100 characters.
        r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                          body=json.dumps({"name": "  Denis   G. "}).encode())
        assert r.status == 200 and r.json() == {
            "name": "Denis G.", "firstName": "Denis", "initials": "DG"}, r.text
        me = (await request(core.page_port, "GET", "/api/state")).json()["me"]
        assert (me["name"], me["firstName"], me["initials"]) == (
            "Denis G.", "Denis", "DG"), me
        for bad in ("", "   ", "x" * 101, "___", "a\u0007b"):
            r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                              body=json.dumps({"name": bad}).encode())
            assert r.status == 422 and "name" in r.json()["error"], (bad, r.text)
        # A wrong theme with a good name: neither changes.
        r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                          body=json.dumps({"name": "Den", "theme": "blue"}).encode())
        assert r.status == 422, r.text
        assert await core.pool.fetchval(
            "SELECT name FROM users WHERE is_local_owner") == "Denis G."
        # Each changes only their own.
        anna = Browser(core.page_port)
        await sign_in(core, anna, "anna@example.com")
        r = await anna.call("PATCH", "/api/me", {"name": "Anna K"})
        assert r.status == 200 and r.json()["initials"] == "AK", r.text
        assert sorted(r["name"] for r in await core.pool.fetch(
            "SELECT name FROM users")) == ["Anna K", "Denis G."]
        assert await core.pool.fetchval(
            "SELECT count(*) FROM journal WHERE kind = 'user.renamed'") == 2
        # Without a session, nothing.
        r = await request(core.page_port, "GET", "/api/account",
                          headers={"cookie": ""})
        assert r.status == 401 and r.json()["signedOut"], r.status


# ------------------------------------------------------------ usage counts

async def test_usage_is_counted_every_hour(h):
    async with h.core() as core:
        # One count already, from the start.
        for _ in range(50):
            if await core.pool.fetchval("SELECT count(*) FROM usage_stats"):
                break
            await asyncio.sleep(0.1)
        taken = await core.pool.fetchval("SELECT count(*) FROM usage_stats")
        assert taken == 1, taken
        await sign_in(core, Browser(core.page_port), "anna@example.com")
        anna_id = await core.pool.fetchval(
            "SELECT id FROM users WHERE email = 'anna@example.com'")
        silent = free_socket()
        try:
            port = silent.getsockname()[1]
            mine = await _server(core, port=port)
            await _server(core, port=port, name="db")
            await _server(core, port=port, owner_id=anna_id)
            opened = [await core.terminals.open(core.owner, mine, 80, 24)
                      for _ in range(3)]
            await opened[0].close()
            peak, top = core.terminals.peaks()
            assert (peak, top) == (3, 3) and core.terminals.peaks() == (3, 3)
            await stats.take(core.pool,
                             computers_online=core.agents.connected(),
                             terminals_peak=peak, terminals_top=top)
            row = await core.pool.fetchrow(
                "SELECT * FROM usage_stats ORDER BY taken_at DESC LIMIT 1")
            assert dict(row, taken_at=None, database_bytes=None,
                        core_bytes=None) == {
                "taken_at": None, "users": 2, "active_day": 2,
                "signups_day": 2, "codes_day": 1, "machines": 3,
                "machines_top": 2, "computers_online": 0,
                "terminals_peak": 3, "terminals_top": 3, "commands_day": 0,
                "database_bytes": None, "core_bytes": None}, dict(row)
            assert row["database_bytes"] > 1_000_000, row["database_bytes"]
            # The core's memory is known only where /proc tells it: Linux,
            # as on the server. On a Mac it is written down as 0.
            if os.path.exists("/proc/self/statm"):
                assert row["core_bytes"] > 0, row["core_bytes"]
            else:
                assert row["core_bytes"] == 0, row["core_bytes"]
            # Written down, the peaks start again from what is open.
            core.terminals.restart_peaks()
            assert core.terminals.peaks() == (2, 2)
            for t in opened[1:]:
                await t.close()
        finally:
            silent.close()
        # A year, no longer.
        await core.pool.execute(
            "UPDATE usage_stats SET taken_at = taken_at - interval '366 days' "
            "WHERE taken_at = (SELECT min(taken_at) FROM usage_stats)")
        await stats.take(core.pool, computers_online=0, terminals_peak=0,
                         terminals_top=0)
        assert await core.pool.fetchval("SELECT count(*) FROM usage_stats") == 2


# ------------------------------------------------------------------ Brevo

class _Brevo(http.server.BaseHTTPRequestHandler):
    got: list = []
    status = 201

    def do_POST(self):
        body = self.rfile.read(int(self.headers["content-length"]))
        type(self).got.append((self.path,
                               {k.lower(): v for k, v in self.headers.items()},
                               json.loads(body)))
        self.send_response(type(self).status)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"messageId": "x"}')

    def log_message(self, *args):
        pass


async def test_brevo_gets_the_email_as_its_api_wants_it():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Brevo)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url, mail.BREVO_URL = mail.BREVO_URL, (
        f"http://127.0.0.1:{server.server_address[1]}/v3/smtp/email")
    saved = {k: os.environ.get(k) for k in ("no_proxy", "NO_PROXY")}
    os.environ["no_proxy"] = os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    try:
        mailer = mail.BrevoMailer("xkeysib-test", "tTerm <login@tterm.net>")
        await mailer.send(mail.Email("anna@example.com", "123456 is your code",
                                     "Your code: 123456"))
        path, headers, body = _Brevo.got[-1]
        assert path == "/v3/smtp/email"
        assert headers["api-key"] == "xkeysib-test"
        assert body == {"sender": {"name": "tTerm", "email": "login@tterm.net"},
                        "to": [{"email": "anna@example.com"}],
                        "subject": "123456 is your code",
                        "textContent": "Your code: 123456"}, body
        # With HTML, both parts go in one email (from 0.0.11).
        await mailer.send(mail.Email("anna@example.com", "123456 is your code",
                                     "Your code: 123456",
                                     html="<p>Your code: 123456</p>"))
        body = _Brevo.got[-1][2]
        assert body["htmlContent"] == "<p>Your code: 123456</p>", body
        assert body["textContent"] == "Your code: 123456", body
        assert "replyTo" not in body
        # A message to support is answered to its writer (0.1.25).
        await mailer.send(mail.Email("support@tterm.net", "Support: Anna: hi",
                                     "hi", reply_to="anna@example.com"))
        assert _Brevo.got[-1][2]["replyTo"] == {"email": "anna@example.com"}
        _Brevo.status = 401
        try:
            await mailer.send(mail.Email("anna@example.com", "s", "t"))
        except mail.MailFailed as exc:
            assert "401" in str(exc)
        else:
            raise AssertionError("a refused email passed for sent")
        assert mail.parse_sender("login@tterm.net") == ("", "login@tterm.net")
    finally:
        _Brevo.status = 201
        mail.BREVO_URL = url
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        server.shutdown()
        with contextlib.suppress(Exception):
            server.server_close()

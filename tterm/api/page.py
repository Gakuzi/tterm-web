"""The page and its API, for people.

Everyone signs in (from 0.0.9): the page and its files are open, the API
and the socket answer only within a session, and only about the person's
own projects, machines and terminals. Signing in is under /api/auth, see
core/auth.py.

The built page lives in web/dist. Every path that is not the API or a file of
the page gets index.html, so that addresses inside the page survive a reload.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import html
import re
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlencode

import asyncpg
from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from .. import __version__
from ..core import (accounts, auth, letters, logs, machines, notes,
                    photos, projects, reach, search, ssh, support, vault)
from ..core.mail import Mailer
from ..core.terminals import (KeysClosed, NotAllowed, NotOpen, Terminal,
                              Terminals)
from .connect import client_ip
from .security import PAGE_HEADERS, AddHeaders, PageGuard, page_csp
from .ws import SIGNED_OUT_CLOSE, PageSocket, page_json
from ..orchestration.api import router as orchestration_router

NO_STORE = {"cache-control": "no-store"}
#: Stage 1 builds the page with stable file names, so the browser must ask
#: every time whether a file changed. Cheap on localhost.
NO_CACHE = {"cache-control": "no-cache"}
#: tTerm's icon, 108 px, for the emails (letters.py).
MAIL_LOGO = Path(__file__).resolve().parent.parent / "templates" / "mail-logo.png"

PAGE_MISSING = """<!doctype html>
<meta charset="utf-8"><title>tTerm</title>
<p style="font: 15px sans-serif; margin: 40px">
The page is not built: <code>web/dist</code> is missing.
It comes ready in the release archive; unpack the archive again.
</p>
"""


class MePatch(BaseModel):
    #: Any of them. The name from 0.0.10, on the account page; how much of a
    #: project's color the sidebar shows from 0.1.1, badge or block; the
    #: language of the page from 0.1.16.
    theme: str | None = None
    name: str | None = None
    projectTint: str | None = None
    language: str | None = None


class EmailBody(BaseModel):
    email: str


class CodeBody(BaseModel):
    email: str
    code: str


class PinBody(BaseModel):
    pin: str


class SignUpBody(BaseModel):
    #: The address on the screen: its code is the one this browser entered.
    email: str
    name: str
    #: The one tick, for both documents: the Terms of Service and the Privacy
    #: Policy.
    agree: bool = False


class AppAllowBody(BaseModel):
    """What the app put in the address of /connect, as the page in the
    browser read it (0.1.6); and, from 0.1.8, the account the page asked
    about, so that Allow is for that one only."""
    app: str
    name: str
    port: int
    challenge: str
    state: str
    account: str | None = None


class AppExchangeBody(BaseModel):
    code: str
    verifier: str


class AppSessionBody(BaseModel):
    key: str


class ThisComputerBody(BaseModel):
    #: The computer's own key, as the agent sends it in its hello: only its
    #: hash is kept.
    key: str
    name: str = ""
    os: str = ""
    app: str = ""


#: The app's own address on its computer, where the browser takes the code.
APP_RETURN = "http://127.0.0.1:{port}/signed-in"
#: What the app says its state is: what new_token and secrets.token_urlsafe
#: make, of any reasonable length. Whole strings only (fullmatch).
APP_STATE_RE = re.compile(r"[A-Za-z0-9_-]{16,128}")


class SignedOut(Exception):
    """No session, or one that has ended: the page asks to sign in."""


#: How long the browser keeps a session's cookie; the session itself ends
#: sooner, after eight hours without anything done (auth.IDLE).
SESSION_DAYS = 30
#: The page marks what it asks by itself, now and then, with this header:
#: such a request is not something done, and does not keep a session on.
BACKGROUND_HEADER = "x-tterm-background"


class InstallRequest(BaseModel):
    projectId: uuid.UUID
    kind: str = "server"


class TerminalRequest(BaseModel):
    machineId: uuid.UUID
    cols: int = 80
    rows: int = 24
    #: The folder to start in (0.1.24): Open a new terminal on one that
    #: ended starts where it was. One the shell cannot be told is ignored
    #: (shell.start_in); the limit is only one for the size of the request.
    cwd: str = Field("", max_length=65536)


class SupportBody(BaseModel):
    """A message to support (0.1.25). The email only before signing in,
    from tTerm for Mac; signed in, the account's address is used."""
    text: str = Field(..., max_length=20000)
    details: str | None = Field(None, max_length=4000)
    email: str | None = Field(None, max_length=400)


class CompleteRequest(BaseModel):
    line: str
    cursor: int


class FolderBody(BaseModel):
    #: For a new folder: the project it goes in.
    projectId: uuid.UUID | None = None
    name: str


class NewNoteBody(BaseModel):
    folderId: uuid.UUID
    title: str = ""


class MoveNoteBody(BaseModel):
    #: The folder it goes to: in its project, or from 0.1.2 in another.
    folderId: uuid.UUID | None = None
    #: Or another project with no folder for it yet: there it goes into a
    #: folder named as the one it is in now, made for it (0.1.2).
    projectId: uuid.UUID | None = None


class TickBody(BaseModel):
    blockId: str
    done: bool


class ProjectBody(BaseModel):
    #: For a new project the name; the code and the color then come by
    #: themselves if not given. For a change, whichever changes.
    name: str | None = None
    code: str | None = None
    color: str | None = None


class MoveBody(BaseModel):
    projectId: uuid.UUID


class TerminalPatch(BaseModel):
    name: str


#: A line the input line may ask Tab about, at most.
MAX_LINE = 64 * 1024
NOT_OPEN = "The terminal is not open."
#: What the page gets of a terminal on a machine closed to its device
#: (0.1.28): enough to list it, dimmed with a lock, and nothing it did.
LOCKED_FIELDS = ("id", "machineId", "machine", "label", "name", "state",
                 "away", "awaySince", "openedAt")
#: A note's save, at most, in bytes: its blocks are kept to half that
#: (notes.BODY_MAX), and JSON from the page escapes a little on the way.
NOTE_SAVE_MAX = 1024 * 1024
#: A vault request, at most: a sealed key is up to 16 KB, with the public
#: key and the JSON around it there is room to spare.
VAULT_BODY_MAX = 64 * 1024


class ReachableBody(BaseModel):
    host: str
    port: int = 22


class OwnLineBody(BaseModel):
    project: uuid.UUID
    name: str = ""


class MachinePatch(BaseModel):
    name: str


class LogNoteBody(BaseModel):
    """A note under a line of a machine's log (0.1.20): the line by its id,
    or, from a terminal's feed, by the terminal and the block's number."""
    text: str
    entry: int | None = None
    terminalId: uuid.UUID | None = None
    seq: int | None = None


class RedactBody(BaseModel):
    reason: str


class TooBig(Exception):
    """A request's body over what its route takes, or without a length."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


async def small_json(request: Request, most: int):
    """The request's JSON, read only if it says how long it is and that is
    no more than `most` bytes: a note is the one big thing the page sends,
    and the core reads nothing bigger whole."""
    size = request.headers.get("content-length", "")
    if not size.isdigit():
        raise TooBig(411, "Say how long the request is.")
    if int(size) > most:
        raise TooBig(413, "The note is too long to save. Split it into two.")
    raw = await request.body()
    if len(raw) > most:
        raise TooBig(413, "The note is too long to save. Split it into two.")
    try:
        return page_json(raw)
    except ValueError:
        # Nested deeper than any request of the page's is not JSON either
        # (ws.page_json), on every Python.
        raise TooBig(422, "That is not JSON.") from None


def _with_nonce(page: str, nonce: str) -> str:
    """The page with its one-time style number in a meta tag, right after
    the charset, which must stay first."""
    meta = f'<meta name="tt-style-nonce" content="{html.escape(nonce)}">'
    at = page.find("<meta charset")
    end = page.find(">", at) if at >= 0 else -1
    if end >= 0:
        return page[:end + 1] + "\n    " + meta + page[end + 1:]
    at = page.lower().find("<head>")
    if at >= 0:
        return page[:at + 6] + meta + page[at + 6:]
    # No head written out: after the doctype, never before it, or the
    # browser would fall back to its old quirks.
    end = page.find(">") if page.lower().startswith("<!doctype") else -1
    return page[:end + 1] + meta + page[end + 1:]


def _json(data, status: int = 200) -> Response:
    return JSONResponse(data, status_code=status, headers=NO_STORE)


#: A moment the page names, in milliseconds since 1970: from then to 5138.
MOMENT_MAX = 10 ** 14


def _moment(ms: int | None) -> dt.datetime | None:
    """A moment from the page (its midnight, for the machines' logs), or
    None if it is not one."""
    if ms is None or not 0 <= ms < MOMENT_MAX:
        return None
    return dt.datetime.fromtimestamp(ms / 1000, dt.UTC)


def create_page_app(pool: asyncpg.Pool, dist: Path, page_url: str,
                    connect_url: str, terminals: Terminals | None = None,
                    agents=None, relay=None, *, secret: bytes, mailer: Mailer,
                    legal: dict[str, str] | None = None):
    """The ASGI app for the page, wrapped in the page's guard. `legal` has
    the addresses the sign-in screens link to: the Terms of Service, the
    Privacy Policy, and support's email."""
    legal = dict(legal or {})
    # Support's address, at the bottom of the emails too, and where the
    # page's messages to support go (0.1.25).
    support_address = legal.get("support") or letters.SUPPORT
    # The cookies: on https with the __Host- prefix, which a browser takes
    # only from this very host, over https, for the whole site. On the
    # laptop's plain http that prefix is not accepted, so they go without.
    secure = page_url.startswith("https://")

    def cookie_name(base: str) -> str:
        return f"__Host-{base}" if secure else base

    def cookie(request: Request | WebSocket, base: str) -> str | None:
        return request.cookies.get(cookie_name(base)) or None

    def set_cookie(response: Response, base: str, value: str,
                   seconds: int) -> None:
        response.set_cookie(cookie_name(base), value, max_age=seconds,
                            path="/", secure=secure, httponly=True,
                            samesite="strict")

    def clear_cookie(response: Response, base: str) -> None:
        response.delete_cookie(cookie_name(base), path="/", secure=secure,
                               httponly=True, samesite="strict")

    async def signed_in(request: Request) -> auth.Session:
        session = await auth.session(
            pool, cookie(request, auth.SESSION_COOKIE),
            touch=request.headers.get(BACKGROUND_HEADER) != "1")
        if session is None:
            raise SignedOut()
        return session

    #: The page sockets open now: a session that ends closes its own at once.
    sockets: set[PageSocket] = set()

    # Keys open on this device (0.1.28, vault-design.md v3). A request of a
    # session counts as made with the keys open when one of that session's
    # open sockets proved it; a guarded machine (a server with the person's
    # key, one through their Mac, a computer) is closed to it otherwise,
    # the app's own computer and the servers through it apart, and nothing
    # is while the person's keys guard nothing (vault.guarding: no vault a
    # device could prove open).

    def keys_open(session: auth.Session) -> bool:
        return any(s.keys_open for s in sockets if s.session.id == session.id)

    async def guarding(session: auth.Session) -> bool:
        async with pool.acquire() as conn:
            return await vault.guarding(conn, session.person.id)

    async def closed_to(session: auth.Session):
        """For a machine: whether this session's device sees nothing of it."""
        if keys_open(session) or not await guarding(session):
            return lambda machine: False
        return lambda machine: (vault.guarded(machine) and not
                                vault.exempt(session.computer_id, machine))

    async def log_closed_to(session: auth.Session, machine) -> bool:
        """As closed_to, for a log: only the person's own machines, since
        other members read a log by their role (the owner, 03.11)."""
        return (machine.created_by in (None, session.person.id)
                and (await closed_to(session))(machine))

    async def hidden_for(session: auth.Session, *, own_only: bool) -> list:
        """The machines this session's device sees nothing of, for the
        lists: history, search, the logs of the day."""
        if keys_open(session):
            return []
        async with pool.acquire() as conn:
            return await vault.closed_machines(conn, session.person.id,
                                               session.computer_id,
                                               own_only=own_only)

    def keys_closed(machine: str) -> Response:
        """423: the page shows its card, to open the keys here."""
        return _json({"error": "The keys are not open on this device: open "
                               f"them to reach {machine}.",
                      "locked": True, "machine": machine}, 423)

    async def keys_needed(session: auth.Session) -> Response | None:
        """423 for a change of the vault that only a device with the keys
        open makes, once they guard something (0.1.28): a key or a password
        put in from a device without them would prove them open there from
        then on, and a key taken out could leave nothing to prove. None to
        go on."""
        if keys_open(session) or not await guarding(session):
            return None
        return _json({"error": "Open the keys on this device first: then "
                               "change the vault.", "locked": True}, 423)

    def shown(terminal: Terminal, closed) -> dict:
        """A terminal as the page lists it. One on a machine closed to this
        device (`closed`) only by its name, where it is, and that it is
        locked: not its folder, branch or the command it runs."""
        described = terminal.describe()
        if not closed(terminal.machine):
            return described
        return {**{k: described[k] for k in LOCKED_FIELDS}, "locked": True}

    async def cut(ended) -> None:
        """Closes the sockets of sessions that ended, so that whatever was
        open there asks to sign in: `ended` tells them by their session."""
        doomed = [s for s in sockets if ended(s.session)]
        await asyncio.gather(*(s.sign_out() for s in doomed),
                             return_exceptions=True)

    async def vault_broadcast(user_id: uuid.UUID, message: dict, *,
                              exclude_session: uuid.UUID | None = None) -> None:
        """Sends a vault message to the person's open sockets (both sides of
        a pairing, or every browser after a change), optionally not to the
        session that caused it."""
        targets = [s for s in sockets if s.user_id == user_id
                   and (exclude_session is None
                        or s.session.id != exclude_session)]
        await asyncio.gather(*(s.json(message) for s in targets),
                             return_exceptions=True)

    async def vault_changed(user_id: uuid.UUID) -> None:
        await vault_broadcast(user_id, {"op": "vault.changed"})

    async def proofs_gone(user_id: uuid.UUID, keep: uuid.UUID) -> None:
        """A key out of the vault, a new password or recovery code (0.1.28):
        what proved the keys open on the person's other sessions may be
        gone, so each of their sockets is asked to prove again. The session
        that made the change keeps its proof: it has just shown it. So
        whoever proved with a guessed password or a key of their own is out
        once the person changes the password or takes the key out."""
        targets = [s for s in sockets if s.user_id == user_id
                   and s.session.id != keep]
        await asyncio.gather(*(s.prove_again() for s in targets),
                             return_exceptions=True)

    async def pairing_update(user_id: uuid.UUID, pairing_id: uuid.UUID,
                             state: str) -> None:
        await vault_broadcast(user_id, {"op": "vault.pairing.update",
                                        "id": str(pairing_id), "state": state})

    def refused(exc: auth.Refused) -> Response:
        return _json({"error": str(exc), **exc.details}, exc.status)

    def with_agents(machine: dict) -> dict:
        """A computer is online while its agent is connected; the page shows
        it and which agent it has."""
        if machine.get("kind") == "computer":
            agent = agents.describe(machine["id"]) if agents is not None else None
            machine["online"] = agent is not None
            machine["agent"] = agent
        return machine
    app = FastAPI(title="tTerm Web", version=__version__, docs_url=None,
                  redoc_url=None, openapi_url=None)
    app.include_router(orchestration_router)
    dist = dist.resolve()

    @app.exception_handler(SignedOut)
    async def signed_out(request: Request, exc: SignedOut) -> Response:
        return _json({"error": "Sign in to go on.", "signedOut": True}, 401)

    # ------------------------------------------------------------ sign in

    @app.get("/api/auth/state")
    async def auth_state(request: Request) -> Response:
        """Signed in or not; if not, whether this browser is a trusted
        device, so that the page asks for its quick code instead of email."""
        if await auth.session(pool, cookie(request, auth.SESSION_COOKIE)):
            return _json({"signedIn": True, "legal": legal})
        device = await auth.device(pool, cookie(request, auth.DEVICE_COOKIE))
        return _json({"signedIn": False, "device": {
            "label": device.label, "name": device.name, "email": device.email,
        } if device else None, "legal": legal})

    @app.post("/api/auth/code")
    async def ask_code(body: EmailBody, request: Request) -> Response:
        """A code for signing in, sent to the address, for this browser."""
        email = auth.normalize_email(body.email)
        if email is None:
            return _json({"error": "That does not look like an email address."},
                         422)
        browser = cookie(request, auth.BROWSER_COOKIE) or auth.new_token()
        try:
            await auth.ask_code(pool, secret, mailer, email=email,
                                browser=browser, ip=client_ip(request),
                                page_url=page_url, support=support_address)
        except auth.Refused as exc:
            return refused(exc)
        response = _json({"sent": True, "email": email,
                          "minutes": auth.CODE_MINUTES}, 202)
        set_cookie(response, auth.BROWSER_COOKIE, browser, 24 * 3600)
        return response

    @app.post("/api/auth/verify")
    async def check_code(body: CodeBody, request: Request) -> Response:
        email = auth.normalize_email(body.email)
        code = auth.digits(body.code, auth.CODE_DIGITS)
        if email is None or code is None:
            return _json({"error": "Enter the six digits from the email."}, 422)
        browser = cookie(request, auth.BROWSER_COOKIE)
        if browser is None:
            return _json({"error": "This browser did not keep the sign-in "
                          "cookie. Allow cookies for this site, then ask for a "
                          "new code.", "left": 0}, 401)
        try:
            signed = await auth.check_code(
                pool, secret, mailer, email=email, code=code, browser=browser,
                ip=client_ip(request),
                label=auth.device_label(request.headers.get("user-agent", "")),
                page_url=page_url, support=support_address)
        except auth.Refused as exc:
            return refused(exc)
        if isinstance(signed, auth.SignUp):
            # No account yet: the name and the tick first, in this
            # browser, which keeps its cookie for that.
            return _json({"signUp": True, "email": signed.email})
        return await signed_in_now(request, signed)

    @app.post("/api/auth/signup")
    async def sign_up(body: SignUpBody, request: Request) -> Response:
        """Makes the account of the address whose code this browser just
        entered: the person's name, and their yes to the Terms of Service and
        the Privacy Policy."""
        email = auth.normalize_email(body.email)
        name = auth.clean_name(body.name)
        if name is None:
            return _json({"error": "Enter your name: up to "
                          f"{auth.NAME_MAX} characters."}, 422)
        if not body.agree:
            return _json({"error": "Agree to the Terms of Service and Privacy "
                          "Policy to go on."}, 422)
        browser = cookie(request, auth.BROWSER_COOKIE)
        try:
            if browser is None or email is None:
                raise auth.SignUpOver("Ask for a new code.")
            signed = await auth.sign_up(
                pool, email=email, browser=browser, name=name,
                ip=client_ip(request),
                label=auth.device_label(request.headers.get("user-agent", "")))
        except auth.Refused as exc:
            return refused(exc)
        return await signed_in_now(request, signed)

    async def signed_in_now(request: Request, signed: auth.SignedIn) -> Response:
        """Signed in with a code from email: the session's cookie, and the
        offer of a quick code for this device."""
        # A session this browser may still have ends: its cookie is replaced.
        await auth.sign_out(pool, cookie(request, auth.SESSION_COOKIE))
        response = _json({"signedIn": True, "new": signed.new,
                          "name": signed.person.first_name,
                          "offerPin": True, "pinDigits": auth.PIN_DIGITS})
        set_cookie(response, auth.SESSION_COOKIE, signed.token,
                   SESSION_DAYS * 24 * 3600)
        clear_cookie(response, auth.BROWSER_COOKIE)
        return response

    @app.post("/api/auth/pin")
    async def set_pin(body: PinBody, request: Request,
                      session: auth.Session = Depends(signed_in)) -> Response:
        """Trusts this browser with a quick code, right after signing in
        with a code from email."""
        pin = auth.digits(body.pin, auth.PIN_DIGITS)
        if pin is None:
            return _json({"error": f"The quick code is {auth.PIN_DIGITS} "
                          "digits."}, 422)
        if auth.too_easy(pin):
            return _json({"error": "That one is the first anyone would try. "
                          "Choose digits that are not all the same and not "
                          "in a row."}, 422)
        try:
            key = await auth.trust_device(
                pool, secret, session, pin,
                auth.device_label(request.headers.get("user-agent", "")),
                replaces=cookie(request, auth.DEVICE_COOKIE))
        except auth.Refused as exc:
            return refused(exc)
        response = _json({"trusted": True})
        set_cookie(response, auth.DEVICE_COOKIE, key,
                   auth.DEVICE_DAYS * 24 * 3600)
        return response

    @app.post("/api/auth/pin-login")
    async def pin_login(body: PinBody, request: Request) -> Response:
        pin = auth.digits(body.pin, auth.PIN_DIGITS)
        if pin is None:
            return _json({"error": f"The quick code is {auth.PIN_DIGITS} "
                          "digits."}, 422)
        key = cookie(request, auth.DEVICE_COOKIE)
        try:
            if key is None:
                raise auth.DeviceForgotten("Sign in with a code from email.")
            signed = await auth.check_pin(
                pool, secret, key=key, pin=pin, ip=client_ip(request),
                label=auth.device_label(request.headers.get("user-agent", "")))
        except auth.DeviceForgotten as exc:
            response = refused(exc)
            clear_cookie(response, auth.DEVICE_COOKIE)
            return response
        except auth.Refused as exc:
            return refused(exc)
        await auth.sign_out(pool, cookie(request, auth.SESSION_COOKIE))
        response = _json({"signedIn": True})
        set_cookie(response, auth.SESSION_COOKIE, signed.token,
                   SESSION_DAYS * 24 * 3600)
        return response

    @app.post("/api/auth/signout")
    async def sign_out(request: Request) -> Response:
        """Sign out, in the menu of the account (on the account page before
        0.1.4): this browser forgets the person.
        The session ends, and a trusted device is forgotten too, so that
        next time it is a code from email; that is also how one switches
        to another account (from 0.0.10; until then the device stayed
        trusted, which is now what eight hours away does)."""
        ended = await auth.forget_browser(
            pool, cookie(request, auth.SESSION_COOKIE),
            cookie(request, auth.DEVICE_COOKIE))
        if ended:
            await cut(lambda s: s.id in ended)
        response = _json({"signedOut": True})
        clear_cookie(response, auth.SESSION_COOKIE)
        clear_cookie(response, auth.DEVICE_COOKIE)
        return response

    @app.post("/api/auth/end-session")
    async def end_session(request: Request) -> Response:
        """Ends this session only, as eight hours away would: a trusted
        browser stays one, so that the quick code brings the person back.
        The page asks for it when something wants a sign-in made just now,
        such as allowing an app (0.1.6)."""
        ended = await auth.sign_out(pool, cookie(request, auth.SESSION_COOKIE))
        if ended is not None:
            await cut(lambda s: s.id == ended)
        response = _json({"ended": ended is not None})
        clear_cookie(response, auth.SESSION_COOKIE)
        return response

    @app.post("/api/auth/signout-everywhere")
    async def sign_out_everywhere(
            session: auth.Session = Depends(signed_in)) -> Response:
        """Every session of the person ends and every device is forgotten:
        "Forget all devices" in Settings (on the account page before 0.1.4)."""
        await auth.sign_out_everywhere(pool, session.person.id)
        await cut(lambda s: s.person.id == session.person.id)
        response = _json({"signedOut": True})
        clear_cookie(response, auth.SESSION_COOKIE)
        clear_cookie(response, auth.DEVICE_COOKIE)
        return response

    @app.get("/api/devices")
    async def list_devices(
            session: auth.Session = Depends(signed_in)) -> Response:
        return _json({"devices": await auth.devices(pool, session.person.id,
                                                    session.device_id)})

    @app.delete("/api/devices/{device_id}")
    async def forget_device(device_id: uuid.UUID,
                            session: auth.Session = Depends(signed_in)) -> Response:
        ended = await auth.forget_device(pool, session.person.id, device_id)
        if ended is None:
            return _json({"error": "no such device"}, 404)
        await cut(lambda s: s.id in ended)
        response = _json({"forgotten": True,
                          "current": device_id == session.device_id})
        if device_id == session.device_id:
            # This very browser: its session went with it.
            clear_cookie(response, auth.DEVICE_COOKIE)
            clear_cookie(response, auth.SESSION_COOKIE)
        return response

    # ---------------------------- the app on a computer signs in (0.1.6)

    app_over = ("This sign-in is over. Start again in tTerm with Sign in "
                "with your browser.")

    @app.post("/api/auth/app/allow")
    async def allow_app(body: AppAllowBody,
                        session: auth.Session = Depends(signed_in)) -> Response:
        """The person allows the app that opened /connect in this browser.
        The answer is the app's own address on 127.0.0.1 with a one-time
        code: the page goes there, on this very computer, and nowhere else
        could the code be of use without the app's secret."""
        if body.account is not None and body.account != str(session.person.id):
            # Another tab of this browser signed in someone else since the
            # page asked (0.1.8): Allow goes to no account the page did not
            # name; the page asks again.
            return _json({"error": "This browser is signed in to another "
                          "account now. Check which one, then allow.",
                          "changed": True}, 409)
        name = auth.computer_name(body.name)
        if (body.app not in auth.APPS or name is None
                or not 1024 <= body.port <= 65535
                or not auth.is_challenge(body.challenge)
                or not APP_STATE_RE.fullmatch(body.state)):
            return _json({"error": "This link is not complete. Start again in "
                          "tTerm with Sign in with your browser."}, 422)
        try:
            code = await auth.allow_app(pool, session, app=body.app, name=name,
                                        challenge=body.challenge)
        except auth.Refused as exc:
            return refused(exc)
        query = urlencode({"code": code, "state": body.state})
        return _json({"redirect": f"{APP_RETURN.format(port=body.port)}?{query}"})

    @app.post("/api/auth/app/exchange")
    async def exchange_app(body: AppExchangeBody, request: Request) -> Response:
        """The app, with the code the browser brought it and its own secret:
        its device key, which it keeps in the keychain, and a first session.
        The session goes in the session cookie, named here: an app keeps no
        cookies of its own."""
        if not auth.is_token(body.code) or not auth.is_verifier(body.verifier):
            return refused(auth.AppGrantOver(app_over))
        try:
            signed = await auth.exchange_app(
                pool, mailer, code=body.code, verifier=body.verifier,
                ip=client_ip(request), page_url=page_url, support=support_address)
        except auth.Refused as exc:
            return refused(exc)
        return _json({
            "key": signed.key, "deviceId": str(signed.device_id),
            "label": signed.label, "session": signed.token,
            "cookie": cookie_name(auth.SESSION_COOKIE),
            "me": {"id": str(signed.person.id), "name": signed.person.name,
                   "email": signed.person.email},
            "hub": machines.hub_url(connect_url),
        })

    @app.post("/api/auth/app/session")
    async def app_session(body: AppSessionBody, request: Request) -> Response:
        """A session for the app by its device key, when it starts and when
        its session ended. A key no longer trusted: 410, and the app shows
        this computer only, as before signing in."""
        forgotten = ("This app was signed out of tTerm. Sign in again with "
                     "your browser.")
        if not auth.is_token(body.key):
            return refused(auth.DeviceForgotten(forgotten))
        try:
            token, ended = await auth.app_session(pool, key=body.key,
                                                  ip=client_ip(request))
        except auth.Refused as exc:
            return refused(exc)
        if ended:
            await cut(lambda s: s.id in ended)
        return _json({"session": token,
                      "cookie": cookie_name(auth.SESSION_COOKIE)})

    @app.post("/api/computers/this")
    async def this_computer(body: ThisComputerBody,
                            session: auth.Session = Depends(signed_in)) -> Response:
        """Which computer the app runs on, by the computer's own key (only
        its hash is kept): one of the person's, or a new one in Personal
        (machines.this_computer). Only from the app's own session."""
        if session.method != "app":
            return _json({"error": "Only tTerm for the computer says which "
                          "computer it runs on."}, 403)
        if not machines.KEY_RE.fullmatch(body.key):
            return _json({"error": "Say the computer's own key, as its agent "
                          "has it."}, 422)
        os_name = "".join(ch for ch in body.os if ch.isprintable())[:200]
        app_name = "".join(ch for ch in body.app if ch.isprintable())[:32]
        try:
            found = await machines.this_computer(
                pool, user_id=session.person.id, key=body.key,
                name=auth.computer_name(body.name) or "computer",
                os_name=os_name, app=app_name)
        except machines.ThisComputerRefused as exc:
            return _json({"error": str(exc)}, exc.status)
        # The app's device runs on this computer (0.1.28, v3): the computer's
        # own key shows it, which only that computer has. Its session needs
        # no proof of open keys for this computer and the servers through it.
        if session.device_id is not None:
            computer_id = uuid.UUID(found["machine"]["id"])
            done = await pool.execute(
                "UPDATE devices SET computer_id = $1 WHERE id = $2 "
                "AND user_id = $3 AND kind = 'app'",
                computer_id, session.device_id, session.person.id)
            if done != "UPDATE 0":
                for open_socket in sockets:
                    if open_socket.session.id == session.id:
                        open_socket.computer_id = computer_id
        return _json({**found, "hub": machines.hub_url(connect_url)},
                     201 if found["created"] else 200)

    @app.get("/health")
    async def health() -> Response:
        return _json({"ok": True, "service": "tterm-web page",
                      "version": __version__})

    # ------------------------------------------------- within a session

    @app.get("/api/state")
    async def state(session: auth.Session = Depends(signed_in)) -> Response:
        """Everything the page needs on start."""
        me = session.person
        listed = await accounts.projects_of(pool, me.id)
        closed = await closed_to(session)
        # Each project's folders of notes, with the notes listed but not
        # their text: the sidebar and the project's page (0.1.0).
        folders = await notes.folders_of(
            pool, [uuid.UUID(p["id"]) for p in listed])
        for project in listed:
            project["machines"] = [with_agents(m) for m in project["machines"]]
            project["folders"] = folders.get(project["id"], [])
        return _json({
            "version": __version__,
            "me": {
                "id": str(me.id),
                "name": me.name,
                "firstName": me.first_name,
                "initials": me.initials,
                "theme": me.theme,
                "projectTint": await projects.tint_of(pool, me.id),
                # The language chosen (0.1.16), or null: the browser's then.
                "language": await accounts.language_of(pool, me.id),
                "plan": me.plan,
                "email": me.email,
                # One's own photo (0.1.7), or null for the initials.
                "photo": await photos.url_of(pool, me.id),
                # Signed in with tTerm for Mac (0.1.18): no Download in the menu.
                "appSignedIn": await auth.app_signed_in(pool, me.id),
            },
            "projects": listed,
            # A device proves its keys open before anything of a guarded
            # machine reaches it (0.1.28, vault-design.md v3).
            "proofs": True,
            # Those closed to this device only by name (0.1.28).
            "terminals": ([shown(t, closed) for t in terminals.live(me.id)]
                          if terminals else []),
        })

    @app.patch("/api/me")
    async def patch_me(change: MePatch,
                       session: auth.Session = Depends(signed_in)) -> Response:
        """The person's own settings: the theme, from 0.0.10 the name, from
        0.1.16 the language. A new name comes back as the page shows it; the
        rest alone, with nothing."""
        me = session.person
        name = None
        if change.name is not None:
            name = auth.clean_name(change.name)
            if name is None:
                return _json({"error": "Enter your name: up to "
                              f"{auth.NAME_MAX} characters."}, 422)
        # All of it checked before any of it is saved.
        if change.theme is not None and change.theme not in accounts.THEMES:
            return _json({"error": "theme must be one of "
                          f"{', '.join(accounts.THEMES)}"}, 422)
        if change.projectTint is not None and \
                change.projectTint not in projects.TINTS:
            return _json({"error": "The tint is one of "
                          f"{', '.join(projects.TINTS)}."}, 422)
        if change.language is not None and \
                change.language not in accounts.LANGUAGES:
            return _json({"error": "The language is one of "
                          f"{', '.join(accounts.LANGUAGES)}."}, 422)
        if change.theme is not None:
            await accounts.set_theme(pool, me.id, change.theme)
        if change.language is not None:
            await accounts.set_language(pool, me.id, change.language)
        if change.projectTint is not None:
            await projects.set_tint(pool, me.id, change.projectTint)
        if name is None:
            return Response(status_code=204, headers=NO_STORE)
        await accounts.set_name(pool, me.id, name)
        return _json({"name": name, "firstName": accounts.first_name(name),
                      "initials": accounts.initials(name)})

    @app.get("/api/account")
    async def account(session: auth.Session = Depends(signed_in)) -> Response:
        """The account page (0.0.10): the plan with what counts against its
        limits, the trusted devices, and where the documents and support
        are. The name, the address and the theme come with /api/state."""
        me = session.person
        plan = await accounts.plan_of(pool, me.id)
        return _json({
            "plan": {"id": plan["id"], "name": plan["name"],
                     "limits": plan["limits"]},
            "usage": {"machines": plan["machines"],
                      "terminals": len(terminals.live(me.id)) if terminals else 0},
            "devices": await auth.devices(pool, me.id, session.device_id),
            "legal": legal,
        })

    # --------------------------------------------- the photo (0.1.7)

    @app.put("/api/me/photo")
    async def put_photo(request: Request,
                        session: auth.Session = Depends(signed_in)) -> Response:
        """One's own photo: the JPEG the page made, 256 pixels square, cut
        to what draws the picture (core/photos.py)."""
        kind = request.headers.get("content-type", "").split(";")[0].strip()
        if kind != "image/jpeg":
            return _json({"error": "The photo comes as a JPEG."}, 415)
        size = request.headers.get("content-length", "")
        if not size.isdigit():
            return _json({"error": "Say how long the request is."}, 411)
        if int(size) > photos.SIZE_MAX:
            return _json({"error": "The photo is too big."}, 413)
        data = await request.body()
        try:
            url = await photos.put(pool, session.person.id, data)
        except photos.NotAPhoto as exc:
            return _json({"error": f"tTerm cannot take this photo: {exc}"}, 422)
        return _json({"photo": url})

    @app.delete("/api/me/photo")
    async def remove_photo(session: auth.Session = Depends(signed_in)) -> Response:
        await photos.remove(pool, session.person.id)
        return _json({"photo": None})

    @app.get("/api/photos/{user_id}")
    async def photo(user_id: uuid.UUID, v: str | None = None,
                    session: auth.Session = Depends(signed_in)) -> Response:
        """Someone's photo, for whoever may see it: themselves, and from 0.2
        those in a project with them. Its address names its version: that
        one the browser keeps."""
        found = await photos.get(pool, session.person.id, user_id)
        if found is None:
            return _json({"error": "no such photo"}, 404)
        image, version = found
        cache = ("private, max-age=31536000, immutable" if v == version
                 else "private, no-cache")
        return Response(image, media_type="image/jpeg",
                        headers={"cache-control": cache})

    # ------------------------------------------- search over everything

    @app.get("/api/search")
    async def search_all(q: str = "", near: str = "",
                         session: auth.Session = Depends(signed_in)) -> Response:
        """Commands, their output and notes with every word of `q` in them
        (0.1.7); nothing typed, the commands run most on the machine
        `near`. The page finds terminals, machines and projects itself."""
        try:
            machine = uuid.UUID(near) if near else None
        except ValueError:
            machine = None
        found = await search.search(
            pool, session.person.id, q[:search.QUERY_MAX], near=machine,
            hidden=await hidden_for(session, own_only=False),
            hidden_logs=await hidden_for(session, own_only=True))
        return _json(found)

    @app.post("/api/installs")
    async def new_install(request: InstallRequest,
                          session: auth.Session = Depends(signed_in)) -> Response:
        """A one-time command that connects a server, for ten minutes; for a
        computer, the command that starts its agent with a new key."""
        try:
            install = await machines.create_install(
                pool, project_id=request.projectId, user_id=session.person.id,
                kind=request.kind, connect_url=connect_url)
        except PermissionError as exc:
            return _json({"error": str(exc)}, 403)
        except ValueError as exc:
            return _json({"error": str(exc)}, 422)
        return _json({"id": str(install.id), "command": install.command,
                      "windowsCommand": install.windows_command,
                      "byHand": install.by_hand,
                      "expiresAt": install.expires_at.isoformat(),
                      "minutes": machines.INSTALL_MINUTES}, 201)

    @app.get("/api/installs/{install_id}")
    async def install_status(install_id: uuid.UUID,
                             session: auth.Session = Depends(signed_in)) -> Response:
        status = await machines.install_status(pool, install_id,
                                               session.person.id)
        if status is None:
            return _json({"error": "no such install"}, 404)
        return _json(status)

    async def closed_machine(machine_id: uuid.UUID,
                             session: auth.Session) -> Response | None:
        """423 for a machine closed to this device; None to go on (also for
        no such machine: the route says)."""
        async with pool.acquire() as conn:
            machine = await vault.guard_of(conn, session.person.id,
                                           machine_id=machine_id)
        if machine is not None and (await closed_to(session))(machine):
            return keys_closed(machine.name)
        return None

    @app.get("/api/machines/{machine_id}")
    async def machine(machine_id: uuid.UUID,
                      session: auth.Session = Depends(signed_in)) -> Response:
        details = await machines.machine_details(pool, session.person.id,
                                                 machine_id)
        if details is None:
            return _json({"error": "no such machine"}, 404)
        return _json(with_agents(details))

    @app.delete("/api/machines/{machine_id}")
    async def remove_machine(machine_id: uuid.UUID,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """Takes the machine out of tTerm Web. Its terminals end, a
        computer's agent hears it is removed and stops; the history stays.
        From a server tTerm Web takes its line out itself, if it answers;
        if not, the answer carries the command that does it there. A guarded
        machine only from a device with the keys open (0.1.28)."""
        if (closed := await closed_machine(machine_id, session)) is not None:
            return closed
        try:
            removed = await machines.remove(pool, session.person.id, machine_id)
        except PermissionError as exc:
            return _json({"error": str(exc)}, 403)
        if removed is None:
            return _json({"error": "no such machine"}, 404)
        name = removed.answer["name"]
        ending = f"{name} was removed from tTerm Web."
        if agents is not None and removed.answer["kind"] == "computer":
            agents.revoke(machine_id, ending)
        if terminals is not None:
            await terminals.end_machine(machine_id, ending)
        who = ssh.key_id(session.person.name, str(session.person.id), name)
        return _json(await machines.take_back(
            pool, terminals.signer if terminals is not None else None,
            removed, who))

    @app.patch("/api/machines/{machine_id}")
    async def rename_machine(machine_id: uuid.UUID, body: MachinePatch,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """Gives the machine a new name within its project."""
        if (closed := await closed_machine(machine_id, session)) is not None:
            return closed
        try:
            updated = await machines.rename(pool, session.person.id, machine_id, body.name)
        except PermissionError as exc:
            return _json({"error": str(exc)}, 403)
        except ValueError as exc:
            return _json({"error": str(exc)}, 400)
        if updated is None:
            return _json({"error": "no such machine"}, 404)
        return _json(updated)

    @app.post("/api/machines/{machine_id}/move")
    async def move_machine(machine_id: uuid.UUID, body: MoveBody,
                           session: auth.Session = Depends(signed_in)) -> Response:
        """To another project of the person's own (0.1.1). Its terminals go
        on; nothing changes on the machine itself. A guarded machine only
        from a device with the keys open (0.1.28)."""
        if (closed := await closed_machine(machine_id, session)) is not None:
            return closed
        try:
            moved = await projects.move_machine(pool, session.person.id,
                                                machine_id, body.projectId)
        except notes.Refused as exc:
            return _json({"error": str(exc)}, exc.status)
        if terminals is not None:
            terminals.retag(machine_id, body.projectId, moved["code"],
                            moved["name"])
        return _json(moved)

    @app.post("/api/support")
    async def write_to_support(body: SupportBody, request: Request) -> Response:
        """Get help > Write to support (0.1.25): the message goes to
        support's address by email, answered to the person. Signed in, to
        the account's address, with a copy there; before signing in (tTerm
        for Mac passes it on) to the address typed, without a copy, and
        with tighter limits. See core/support.py. A session that has ended
        asks to sign in again, as everywhere: its message is not one from
        someone who never signed in."""
        token = cookie(request, auth.SESSION_COOKIE)
        session = await auth.session(pool, token)
        if token and session is None:
            raise SignedOut()
        try:
            result = await support.write(
                pool, mailer, person=session.person if session else None,
                email=body.email, text=body.text, details=body.details,
                ip=client_ip(request), support=support_address,
                page_url=page_url)
        except support.Refused as exc:
            return _json({"error": str(exc)}, exc.status)
        return _json(result)

    @app.post("/api/terminals")
    async def open_terminal(request: TerminalRequest,
                            session: auth.Session = Depends(signed_in)) -> Response:
        """A new terminal on a machine. It connects in the background; the
        page attaches to it over the socket and watches it come up. With
        `cwd` (0.1.24) it starts in that folder, if it can."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        try:
            terminal = await terminals.open(session.person, request.machineId,
                                            request.cols, request.rows,
                                            request.cwd, session_id=session.id,
                                            closed=await closed_to(session))
        except NotAllowed as exc:
            return _json({"error": str(exc)}, 404)
        except KeysClosed as exc:
            return keys_closed(exc.machine)
        return _json(terminal.describe(), 201)

    async def closed_terminal(terminal_id: uuid.UUID,
                              session: auth.Session) -> Response | None:
        """423 for a terminal on a machine closed to this device, running or
        ended; None to go on (also for no such terminal: the route says)."""
        machine = await terminals.machine_of(terminal_id, session.person.id)
        if machine is not None and (await closed_to(session))(machine):
            return keys_closed(machine.name)
        return None

    @app.get("/api/terminals/{terminal_id}")
    async def terminal_info(terminal_id: uuid.UUID,
                            session: auth.Session = Depends(signed_in)) -> Response:
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        terminal = terminals.get(terminal_id, session.person.id)
        if terminal is not None:
            return _json(terminal.describe())
        ended = await terminals.ended(terminal_id, session.person.id)
        if ended is None:
            return _json({"error": "no such terminal"}, 404)
        return _json(ended)

    @app.patch("/api/terminals/{terminal_id}")
    async def rename_terminal(terminal_id: uuid.UUID, body: TerminalPatch,
                              session: auth.Session = Depends(signed_in)) -> Response:
        """A name for the person's terminal, instead of its number (0.1.1)."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        try:
            terminal = await terminals.rename(terminal_id, session.person.id,
                                              body.name)
        except LookupError:
            return _json({"error": "no such terminal"}, 404)
        except NotOpen as exc:
            return _json({"error": str(exc)}, 409)
        except NotAllowed as exc:
            return _json({"error": str(exc)}, 422)
        return _json(terminal.describe())

    @app.delete("/api/terminals/{terminal_id}")
    async def end_terminal(terminal_id: uuid.UUID,
                           session: auth.Session = Depends(signed_in)) -> Response:
        """Ends a terminal: its shell gets a hangup, as when a window
        closes. One whose computer is away stops waiting for it, and the
        shell there ends when the computer is back."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        terminal = terminals.get(terminal_id, session.person.id)
        if terminal is None:
            return _json({"error": "no such terminal"}, 404)
        await terminal.close()
        return _json(terminal.describe())

    @app.get("/api/terminals/{terminal_id}/access")
    async def terminal_access_get(terminal_id: uuid.UUID,
                                  session: auth.Session = Depends(signed_in)) -> Response:
        """Terminal access permissions and RBAC state for AI agents and team."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        terminal = terminals.get(terminal_id, session.person.id)
        if terminal is None:
            return _json({"error": "no such terminal"}, 404)
        return _json({
            "terminalId": str(terminal.id),
            "machineId": str(terminal.machine.id),
            "machineName": terminal.machine.name,
            "label": terminal.label,
            "aiAccess": getattr(terminal, "ai_access", True),
            "aiMode": getattr(terminal, "ai_mode", "execute"),
        })

    @app.patch("/api/terminals/{terminal_id}/access")
    async def terminal_access_patch(terminal_id: uuid.UUID,
                                    data: dict,
                                    session: auth.Session = Depends(signed_in)) -> Response:
        """Updates AI and team access settings for this terminal."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        terminal = terminals.get(terminal_id, session.person.id)
        if terminal is None:
            return _json({"error": "no such terminal"}, 404)
        if "aiAccess" in data:
            terminal.ai_access = bool(data["aiAccess"])
        if "aiMode" in data and data["aiMode"] in ("execute", "guard", "readonly"):
            terminal.ai_mode = str(data["aiMode"])
        return _json({
            "terminalId": str(terminal.id),
            "aiAccess": terminal.ai_access,
            "aiMode": terminal.ai_mode,
        })

    @app.post("/api/terminals/{terminal_id}/revoke_ai")
    async def terminal_revoke_ai(terminal_id: uuid.UUID,
                                 session: auth.Session = Depends(signed_in)) -> Response:
        """Immediately revokes AI agent access to this terminal."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        terminal = terminals.get(terminal_id, session.person.id)
        if terminal is None:
            return _json({"error": "no such terminal"}, 404)
        terminal.ai_access = False
        return _json({"ok": True, "revoked": True, "terminalId": str(terminal.id)})

    @app.get("/api/terminals/{terminal_id}/blocks")
    async def terminal_blocks(terminal_id: uuid.UUID, before: int | None = None,
                              limit: int = 60,
                              session: auth.Session = Depends(signed_in)) -> Response:
        """The feed: finished blocks, the latest first page of them, each
        with the end of its output."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        feed = await terminals.feed(terminal_id, session.person.id, before,
                                    limit)
        if feed is None:
            return _json({"error": "no such terminal"}, 404)
        return _json(feed)

    @app.get("/api/terminals/{terminal_id}/blocks/{seq}/output")
    async def block_output(terminal_id: uuid.UUID, seq: int,
                           session: auth.Session = Depends(signed_in)) -> Response:
        """Everything a block kept of its output, as the terminal printed it."""
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        got = await terminals.block_output(terminal_id, session.person.id, seq)
        if got is None:
            return _json({"error": "no such block"}, 404)
        output, cut = got
        return Response(output, media_type="application/octet-stream",
                        headers={**NO_STORE, "x-tterm-cut": "1" if cut else "0"})

    @app.get("/api/terminals/{terminal_id}/history")
    async def terminal_history(terminal_id: uuid.UUID,
                               session: auth.Session = Depends(signed_in)) -> Response:
        if terminals is None:
            return _json({"error": "terminals are not running"}, 503)
        if (closed := await closed_terminal(terminal_id, session)) is not None:
            return closed
        commands = await terminals.history(
            terminal_id, session.person.id,
            hidden=await hidden_for(session, own_only=False))
        if commands is None:
            return _json({"error": "no such terminal"}, 404)
        return _json({"commands": commands})

    def _open(terminal_id: uuid.UUID, session: auth.Session) -> Terminal | None:
        terminal = (terminals.get(terminal_id, session.person.id)
                    if terminals else None)
        if terminal is None or terminal.state != "open":
            return None
        return terminal

    # Tab and the two lists run a small script on the machine: changes in
    # the HTTP sense or not, they carry the page's header like every POST.

    @app.post("/api/terminals/{terminal_id}/complete")
    async def complete_word(terminal_id: uuid.UUID, request: CompleteRequest,
                            session: auth.Session = Depends(signed_in)) -> Response:
        terminal = _open(terminal_id, session)
        if terminal is None:
            return _json({"error": NOT_OPEN}, 409)
        if (await closed_to(session))(terminal.machine):
            return keys_closed(terminal.machine.name)
        if len(request.line) > MAX_LINE:
            return _json({"error": "The line is too long."}, 422)
        try:
            return _json(await terminal.complete(request.line, request.cursor))
        except NotOpen:
            return _json({"error": NOT_OPEN}, 409)

    @app.post("/api/terminals/{terminal_id}/dirs")
    async def terminal_dirs(terminal_id: uuid.UUID,
                            session: auth.Session = Depends(signed_in)) -> Response:
        terminal = _open(terminal_id, session)
        if terminal is None:
            return _json({"error": NOT_OPEN}, 409)
        if (await closed_to(session))(terminal.machine):
            return keys_closed(terminal.machine.name)
        try:
            return _json(await terminal.dirs())
        except NotOpen:
            return _json({"error": NOT_OPEN}, 409)

    @app.post("/api/terminals/{terminal_id}/branches")
    async def terminal_branches(terminal_id: uuid.UUID,
                                session: auth.Session = Depends(signed_in)) -> Response:
        terminal = _open(terminal_id, session)
        if terminal is None:
            return _json({"error": NOT_OPEN}, 409)
        if (await closed_to(session))(terminal.machine):
            return keys_closed(terminal.machine.name)
        try:
            return _json(await terminal.branches())
        except NotOpen:
            return _json({"error": NOT_OPEN}, 409)

    # -------------------------------------------- projects (from 0.1.1)

    @app.post("/api/projects")
    async def new_project(body: ProjectBody,
                          session: auth.Session = Depends(signed_in)) -> Response:
        """A project of the person's own, as the sidebar lists it."""
        try:
            project = await projects.create(pool, session.person.id, body.name,
                                            body.code, body.color)
        except notes.Refused as exc:
            return _json({"error": str(exc)}, exc.status)
        return _json(project, 201)

    @app.patch("/api/projects/{project_id}")
    async def change_project(project_id: uuid.UUID, body: ProjectBody,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """The name, the code, the color: by the owner and admins. Running
        terminals take the new code at once."""
        try:
            changed = await projects.edit(pool, session.person.id, project_id,
                                          name=body.name, code=body.code,
                                          color=body.color)
        except notes.Refused as exc:
            return _json({"error": str(exc)}, exc.status)
        if terminals is not None:
            terminals.recode(project_id, changed["code"])
        return _json(changed)

    @app.delete("/api/projects/{project_id}")
    async def delete_project(project_id: uuid.UUID,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """A project of the person's own with no machines in it, with its
        notes. Personal stays."""
        try:
            return _json(await projects.delete(pool, session.person.id,
                                               project_id))
        except notes.Refused as exc:
            return _json({"error": str(exc)}, exc.status)

    # ----------------------------------------------- notes (from 0.1.0)

    def note_refused(exc: notes.Refused) -> Response:
        return _json({"error": str(exc)}, exc.status)

    @app.post("/api/folders")
    async def new_folder(body: FolderBody,
                         session: auth.Session = Depends(signed_in)) -> Response:
        if body.projectId is None:
            return _json({"error": "Say which project the folder is for."}, 422)
        try:
            folder = await notes.create_folder(pool, session.person.id,
                                               body.projectId, body.name)
        except notes.Refused as exc:
            return note_refused(exc)
        return _json(folder, 201)

    @app.patch("/api/folders/{folder_id}")
    async def rename_folder(folder_id: uuid.UUID, body: FolderBody,
                            session: auth.Session = Depends(signed_in)) -> Response:
        try:
            return _json(await notes.rename_folder(pool, session.person.id,
                                                   folder_id, body.name))
        except notes.Refused as exc:
            return note_refused(exc)

    @app.delete("/api/folders/{folder_id}")
    async def delete_folder(folder_id: uuid.UUID,
                            session: auth.Session = Depends(signed_in)) -> Response:
        """The folder and every note in it, for everyone in the project."""
        try:
            return _json(await notes.delete_folder(pool, session.person.id,
                                                   folder_id))
        except notes.Refused as exc:
            return note_refused(exc)

    @app.post("/api/notes")
    async def new_note(body: NewNoteBody,
                       session: auth.Session = Depends(signed_in)) -> Response:
        try:
            note = await notes.create_note(pool, session.person.id,
                                           body.folderId, body.title)
        except notes.Refused as exc:
            return note_refused(exc)
        return _json(note, 201)

    @app.get("/api/notes/{note_id}")
    async def note(note_id: uuid.UUID,
                   session: auth.Session = Depends(signed_in)) -> Response:
        """The whole note. The page asks again now and then while the note
        is open, in the background, to show what others wrote."""
        try:
            return _json(await notes.get_note(pool, session.person.id, note_id))
        except notes.Refused as exc:
            return note_refused(exc)

    @app.put("/api/notes/{note_id}")
    async def save_note(note_id: uuid.UUID, request: Request,
                        session: auth.Session = Depends(signed_in)) -> Response:
        """The title and the blocks as the page has them, made from the
        version it names. Where the same things changed elsewhere since,
        409 with the note as it is now: the page merges, asking whose change
        to keep where both changed, and saves from that version."""
        try:
            data = await small_json(request, NOTE_SAVE_MAX)
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        base = data.get("baseVersion") if isinstance(data, dict) else None
        if (not isinstance(base, int) or isinstance(base, bool)
                or not 0 < base < 2 ** 31):
            return _json({"error": "Say which version the save was made from."},
                         422)
        try:
            saved = await notes.save_note(
                pool, session.person.id, note_id, base, data.get("title", ""),
                data.get("blocks"))
        except notes.Conflict as exc:
            return _json({"error": str(exc), "conflict": True,
                          "note": exc.note}, 409)
        except notes.Refused as exc:
            return note_refused(exc)
        return _json(saved)

    @app.post("/api/notes/{note_id}/tick")
    async def tick(note_id: uuid.UUID, body: TickBody,
                   session: auth.Session = Depends(signed_in)) -> Response:
        """A checklist item ticked or not, at once: who and when are the
        core's to note."""
        try:
            return _json(await notes.tick(pool, session.person.id, note_id,
                                          body.blockId, body.done))
        except notes.Refused as exc:
            return note_refused(exc)

    @app.patch("/api/notes/{note_id}")
    async def move_note(note_id: uuid.UUID, body: MoveNoteBody,
                        session: auth.Session = Depends(signed_in)) -> Response:
        """To another folder of its project; from 0.1.2 also to another
        project, by its author, the owner and admins."""
        try:
            return _json(await notes.move_note(pool, session.person.id,
                                               note_id, body.folderId,
                                               project_id=body.projectId))
        except notes.Refused as exc:
            return note_refused(exc)

    @app.delete("/api/notes/{note_id}")
    async def delete_note(note_id: uuid.UUID,
                          session: auth.Session = Depends(signed_in)) -> Response:
        try:
            return _json(await notes.delete_note(pool, session.person.id,
                                                 note_id))
        except notes.Refused as exc:
            return note_refused(exc)

    # ------------------------------------------- machines' logs (0.1.20)

    def log_refused(exc: logs.Refused) -> Response:
        return _json({"error": str(exc)}, exc.status)

    async def closed_log(session: auth.Session, **where) -> Response | None:
        """423 for the log of a machine closed to this device (the person's
        own guarded machine, the keys not open here); None to go on."""
        async with pool.acquire() as conn:
            machine = await vault.guard_of(conn, session.person.id, **where)
        if machine is not None and await log_closed_to(session, machine):
            return keys_closed(machine.name)
        return None

    @app.get("/api/logs/today")
    async def logs_today(since: int,
                         session: auth.Session = Depends(signed_in)) -> Response:
        """How many commands each machine ran since `since`, the page's
        midnight: the Logs folder of the sidebar. Apart from /api/state,
        which the app answers itself before signing in."""
        midnight = _moment(since)
        if midnight is None:
            return _json({"error": "Say since when: the page's midnight."}, 422)
        counts = await logs.counts(pool, session.person.id, midnight)
        # A log closed to this device says nothing, not even how much it
        # has (0.1.28): the sidebar shows its lock.
        for machine_id in await hidden_for(session, own_only=True):
            counts.pop(str(machine_id), None)
        return _json({"counts": counts})

    @app.get("/api/machines/{machine_id}/log")
    async def machine_log(machine_id: uuid.UUID, start: int, end: int,
                          session: auth.Session = Depends(signed_in)) -> Response:
        """A day of the machine's log, from the page's midnight to the next:
        its lines, each command with its notes."""
        a, b = _moment(start), _moment(end)
        if a is None or b is None:
            return _json({"error": "Say which day: from one midnight to the "
                                   "next."}, 422)
        if (closed := await closed_log(session, machine_id=machine_id)) is not None:
            return closed
        try:
            return _json(await logs.day(pool, session.person.id, machine_id,
                                        a, b))
        except logs.Refused as exc:
            return log_refused(exc)

    @app.get("/api/machines/{machine_id}/log/find")
    async def machine_log_find(machine_id: uuid.UUID, q: str = "",
                               newest: bool = False,
                               session: auth.Session = Depends(signed_in)) -> Response:
        """Find in this log (0.1.21): the machine's commands, as far back as
        they are kept, with every word of `q` in the command or in the notes
        under it; the oldest first, or the newest."""
        if (closed := await closed_log(session, machine_id=machine_id)) is not None:
            return closed
        try:
            return _json(await logs.find(
                pool, session.person.id, machine_id,
                search.words(q[:search.QUERY_MAX]), newest=newest))
        except logs.Refused as exc:
            return log_refused(exc)

    @app.post("/api/log/notes")
    async def log_note(body: LogNoteBody,
                       session: auth.Session = Depends(signed_in)) -> Response:
        """A note under a line: what stays in the log as written."""
        if body.entry is not None:
            closed = await closed_log(session, entry_id=body.entry)
        else:
            closed = (await closed_log(session, terminal_id=body.terminalId)
                      if body.terminalId is not None else None)
        if closed is not None:
            return closed
        try:
            note = await logs.add_note(pool, session.person.id, body.text,
                                       entry_id=body.entry,
                                       terminal_id=body.terminalId,
                                       seq=body.seq)
        except logs.Refused as exc:
            return log_refused(exc)
        return _json(note, 201)

    @app.post("/api/log/{entry_id}/redact")
    async def log_redact(entry_id: int, body: RedactBody,
                         session: auth.Session = Depends(signed_in)) -> Response:
        """The words of a line or a note go for good, by the owner or an
        admin of the project the machine is in now (0.1.23); the log keeps
        who, when and why. A command's go from every line with the same
        words of the machines in that project, and the terminals of those
        that are running forget them too."""
        if (closed := await closed_log(session, entry_id=entry_id)) is not None:
            return closed
        try:
            # Not on the lines of machines closed to this device (0.1.28):
            # it would change their logs, and say where the words ran.
            done = await logs.redact(pool, session.person.id, entry_id,
                                     body.reason,
                                     hidden=await hidden_for(session, own_only=True))
        except logs.Refused as exc:
            return log_refused(exc)
        if terminals is not None and done["what"] == "command":
            for line in [done, *done["also"]]:
                if line["terminalId"] and line["seq"] is not None:
                    terminals.forget(uuid.UUID(line["terminalId"]), line["seq"],
                                     line["seqEnd"], done["redacted"])
        return _json(done)

    # ------------------------------------------------ the vault (0.1.17)

    def vault_refused(exc: vault.Refused) -> Response:
        return _json({"error": str(exc), **exc.details}, exc.status)

    async def vault_body(request: Request) -> dict:
        data = await small_json(request, VAULT_BODY_MAX)
        if not isinstance(data, dict):
            raise TooBig(422, "That is not a vault request.")
        return data

    def vault_device(request: Request, session: auth.Session) -> str:
        """The device the journal names for a vault password's change or
        wrong try: the app by the device it signed in as, a browser by its
        User-Agent. A wrong try also gets the address (client_ip, as a
        pairing's)."""
        return auth.socket_label(session, request.headers.get("user-agent", ""))

    @app.get("/api/vault")
    async def get_vault(session: auth.Session = Depends(signed_in)) -> Response:
        """The whole vault for its owner, or null when they have none."""
        return _json({"vault": await vault.get_vault(
            pool, session.person.id, session.device_id)})

    @app.post("/api/vault")
    async def create_vault(request: Request,
                           session: auth.Session = Depends(signed_in)) -> Response:
        """Makes the person's one vault, with its vault password (0.1.26) or,
        from tTerm for Mac 0.7.x, its recovery code, and its first lock if
        any; 409 if one is already there."""
        try:
            data = await vault_body(request)
            created = await vault.create_vault(
                pool, session.person.id, id=data.get("id"),
                password=data.get("password"),
                recovery_salt=data.get("recoverySalt"),
                recovery_wrap=data.get("recoveryWrap"), lock=data.get("lock"),
                device_id=session.device_id,
                device=vault_device(request, session))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await vault_changed(session.person.id)
        return _json({"vault": created}, 201)

    @app.post("/api/vault/password/open")
    async def open_vault_password(request: Request,
                                  session: auth.Session = Depends(signed_in)) -> Response:
        """The wrap of the vault key for the vault password, for the right
        proof (auth). 403 with the tries left for a wrong one; 429 with
        when to try again after ten wrong ones within an hour of each other,
        or thirty in a day; 404 when the vault has no password."""
        try:
            data = await vault_body(request)
            opened = await vault.open_with_password(
                pool, session.person.id, auth=data.get("auth"),
                device=vault_device(request, session), ip=client_ip(request))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        return _json(opened)

    @app.put("/api/vault/password")
    async def set_vault_password(request: Request,
                                 session: auth.Session = Depends(signed_in)) -> Response:
        """Sets the vault password, or replaces it; the recovery code goes,
        and the person's pages hear that the vault changed. Once the keys
        guard something, only from a device with them open (0.1.28)."""
        if (locked := await keys_needed(session)) is not None:
            return locked
        try:
            data = await vault_body(request)
            changed = await vault.set_password(
                pool, session.person.id, password=data,
                device_id=session.device_id,
                device=vault_device(request, session))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await proofs_gone(session.person.id, session.id)
        await vault_changed(session.person.id)
        return _json({"vault": changed})

    @app.get("/api/vault/recovery")
    async def vault_recovery(session: auth.Session = Depends(signed_in)) -> Response:
        """The recovery code's salt and wrap; 404 when the vault has no
        code (a password replaced it, or it was made with one)."""
        try:
            return _json(await vault.recovery(pool, session.person.id))
        except vault.Refused as exc:
            return vault_refused(exc)

    @app.put("/api/vault/recovery")
    async def set_vault_recovery(request: Request,
                                 session: auth.Session = Depends(signed_in)) -> Response:
        """Make a new recovery code: the one shown before stops working.
        Refused (409) for a vault with a password. Once the keys guard
        something, only from a device with them open (0.1.28)."""
        if (locked := await keys_needed(session)) is not None:
            return locked
        try:
            data = await vault_body(request)
            await vault.set_recovery(
                pool, session.person.id,
                recovery_salt=data.get("recoverySalt"),
                recovery_wrap=data.get("recoveryWrap"))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await proofs_gone(session.person.id, session.id)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/locks")
    async def add_vault_lock(request: Request,
                             session: auth.Session = Depends(signed_in)) -> Response:
        try:
            data = await vault_body(request)
            created = await vault.add_lock(pool, session.person.id, lock=data,
                                           device_id=session.device_id)
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await vault_changed(session.person.id)
        return _json({"vault": created}, 201)

    @app.delete("/api/vault/locks/{lock_id}")
    async def remove_vault_lock(lock_id: uuid.UUID,
                                session: auth.Session = Depends(signed_in)) -> Response:
        """Once the keys guard something, only from a device with them open
        (0.1.28): otherwise whoever got in could take the Mac's own lock
        off, and the Mac would forget its key to the vault."""
        if (locked := await keys_needed(session)) is not None:
            return locked
        try:
            await vault.remove_lock(pool, session.person.id, lock_id,
                                    session.device_id)
        except vault.Refused as exc:
            return vault_refused(exc)
        await vault_changed(session.person.id)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/locks/{lock_id}/used")
    async def vault_lock_used(lock_id: uuid.UUID,
                              session: auth.Session = Depends(signed_in)) -> Response:
        if not await vault.lock_used(pool, session.person.id, lock_id):
            return _json({"error": "no such lock"}, 404)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/keys")
    async def add_vault_key(request: Request,
                            session: auth.Session = Depends(signed_in)) -> Response:
        """A key into the vault: the core checks the public key parses, its
        type matches, and the fingerprint is its SHA256 one. Once the keys
        guard something, only from a device with them open (0.1.28): a key
        of its own would prove them open there."""
        if (locked := await keys_needed(session)) is not None:
            return locked
        try:
            data = await vault_body(request)
            created = await vault.add_key(
                pool, session.person.id, id=data.get("id"),
                name=data.get("name"), type=data.get("type"),
                public_key=data.get("publicKey"),
                fingerprint=data.get("fingerprint"), sealed=data.get("sealed"),
                source=data.get("source"), source_label=data.get("sourceLabel"),
                device_id=session.device_id)
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await vault_changed(session.person.id)
        return _json({"vault": created}, 201)

    @app.delete("/api/vault/keys/{key_id}")
    async def remove_vault_key(key_id: uuid.UUID,
                               session: auth.Session = Depends(signed_in)) -> Response:
        """Only from a device with the keys open (0.1.28); the person's
        other devices prove them open again, without it."""
        if (locked := await keys_needed(session)) is not None:
            return locked
        try:
            await vault.remove_key(pool, session.person.id, key_id,
                                   session.device_id)
        except vault.Refused as exc:
            return vault_refused(exc)
        await proofs_gone(session.person.id, session.id)
        await vault_changed(session.person.id)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/pairings")
    async def create_pairing(request: Request,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """A new browser posts the commit to its X25519 public key. The
        request goes to the person's other sockets (the Mac's side)."""
        try:
            data = await vault_body(request)
            device = auth.device_label(request.headers.get("user-agent", ""))
            made = await vault.create_pairing(
                pool, session.person.id, session.id, commit=data.get("commit"),
                device=device, ip=client_ip(request))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await vault_broadcast(session.person.id, {
            "op": "vault.pairing", "id": made["id"], "device": device,
            "method": "code", "ip": client_ip(request),
            "createdAt": made.get("createdAt")}, exclude_session=session.id)
        return _json(made, 201)

    @app.get("/api/vault/pairings/{pairing_id}")
    async def get_pairing(pairing_id: uuid.UUID,
                          session: auth.Session = Depends(signed_in)) -> Response:
        # The new browser's own read of an approved pairing clears its keys
        # and the sealed vault key (vault.pairing_view).
        view = await vault.pairing_view(pool, session.person.id, pairing_id,
                                        by_session=session.id)
        if view is None:
            return _json({"error": "no such pairing"}, 404)
        return _json(view)

    @app.post("/api/vault/pairings/{pairing_id}/answer")
    async def answer_pairing(pairing_id: uuid.UUID, request: Request,
                             session: auth.Session = Depends(signed_in)) -> Response:
        try:
            data = await vault_body(request)
            state = await vault.answer_pairing(pool, session.person.id,
                                               pairing_id, pub_a=data.get("pubA"))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await pairing_update(session.person.id, pairing_id, state)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/pairings/{pairing_id}/reveal")
    async def reveal_pairing(pairing_id: uuid.UUID, request: Request,
                             session: auth.Session = Depends(signed_in)) -> Response:
        """Only the session that made the pairing reveals its public key."""
        try:
            data = await vault_body(request)
            state = await vault.reveal_pairing(
                pool, session.person.id, pairing_id, pub_b=data.get("pubB"),
                by_session=session.id)
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            await pairing_update(session.person.id, pairing_id, "denied")
            return vault_refused(exc)
        await pairing_update(session.person.id, pairing_id, state)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/pairings/{pairing_id}/approve")
    async def approve_pairing(pairing_id: uuid.UUID, request: Request,
                              session: auth.Session = Depends(signed_in)) -> Response:
        try:
            data = await vault_body(request)
            state = await vault.approve_pairing(pool, session.person.id,
                                                pairing_id,
                                                sealed=data.get("sealed"))
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        except vault.Refused as exc:
            return vault_refused(exc)
        await pairing_update(session.person.id, pairing_id, state)
        return Response(status_code=204, headers=NO_STORE)

    @app.post("/api/vault/pairings/{pairing_id}/deny")
    async def deny_pairing(pairing_id: uuid.UUID,
                           session: auth.Session = Depends(signed_in)) -> Response:
        """"It's not me": the new browser's session ends and its sockets
        close the way sign-out does."""
        try:
            ended = await vault.deny_pairing(pool, session.person.id, pairing_id)
        except vault.Refused as exc:
            return vault_refused(exc)
        if ended is not None:
            await cut(lambda s: s.id == ended)
        await pairing_update(session.person.id, pairing_id, "denied")
        return Response(status_code=204, headers=NO_STORE)

    # ------------------------ servers the person adds themselves (0.1.17)

    @app.post("/api/machines/own/line")
    async def own_line(body: OwnLineBody,
                       session: auth.Session = Depends(signed_in)) -> Response:
        """For a 'cert' server: a principal and the CA line for the person's
        own authorized_keys on it."""
        if terminals is None:
            return _json({"error": "the signer is not running"}, 503)
        try:
            return _json(await machines.own_line(pool, terminals.signer,
                                                 session.person.id,
                                                 body.project))
        except machines.OwnRefused as exc:
            return _json({"error": str(exc)}, exc.status)
        except (ssh.SignerUnavailable, ssh.SignerRefused):
            return _json({"error": "tTerm Web cannot sign certificates right "
                          "now. Try again in a minute."}, 503)

    @app.post("/api/machines/own")
    async def add_own(request: Request,
                      session: auth.Session = Depends(signed_in)) -> Response:
        """A server the person adds: with their vault key, a certificate, or
        through their Mac."""
        if terminals is None:
            return _json({"error": "the signer is not running"}, 503)
        try:
            data = await vault_body(request)
        except TooBig as exc:
            return _json({"error": str(exc)}, exc.status)
        try:
            project_id = uuid.UUID(str(data.get("project")))
        except (TypeError, ValueError):
            return _json({"error": "Say which project the server is in."}, 422)
        # A guarded server (0.1.28): with the person's key, or through their
        # Mac, only from a device with the keys open, once they guard
        # something; else whoever got in would add one aimed at a host of
        # their own, named as a real one. Through the app's own computer, the
        # app needs none, as it needs none to reach it.
        method = data.get("method")
        own_via = (method == "mac" and session.computer_id is not None
                   and str(data.get("via")) == str(session.computer_id))
        if method in ("key", "mac") and not own_via and (
                locked := await keys_needed(session)) is not None:
            return locked
        try:
            made = await machines.add_own(
                pool, terminals.signer, relay, session.person.id,
                project_id=project_id, name=data.get("name"),
                host=data.get("host"), port=data.get("port"),
                login=data.get("login"), host_keys=data.get("hostKeys"),
                method=data.get("method"), key_id=data.get("keyId"),
                principal=data.get("principal"), jump=data.get("jump"),
                via=data.get("via"), target=data.get("target"),
                who_name=session.person.name)
        except machines.OwnRefused as exc:
            return _json({"error": str(exc)}, exc.status)
        except (ssh.SignerUnavailable, ssh.SignerRefused):
            return _json({"error": "tTerm Web cannot sign certificates right "
                          "now. Try again in a minute."}, 503)
        return _json(made, 201)

    @app.post("/api/machines/reachable")
    async def reachable(body: ReachableBody,
                        session: auth.Session = Depends(signed_in)) -> Response:
        """Whether the core can open a TCP connection to a host the person
        typed, after the address checks. Rate-limited per person."""
        limiter = relay.limiter if relay is not None else None
        try:
            if limiter is not None:
                limiter.check(session.person.id)
        except reach.TooSoon as exc:
            return _json({"error": str(exc)}, 429)
        if not 1 <= body.port <= 65535:
            return _json({"ok": False})
        return _json({"ok": await reach.reachable(body.host, body.port)})

    @app.websocket("/api/ws")
    async def socket(websocket: WebSocket) -> None:
        if terminals is None:
            await websocket.close(code=1013)
            return
        # The page opens its socket by itself, on start and after a lost
        # connection: not something done.
        session = await auth.session(
            pool, cookie(websocket, auth.SESSION_COOKIE), touch=False)
        if session is None:
            # Accepted to be closed with a reason the page understands.
            await websocket.accept()
            await websocket.close(code=SIGNED_OUT_CLOSE)
            return
        page_socket = PageSocket(
            websocket, terminals, session, pool, relay,
            label=auth.socket_label(session, websocket.headers.get("user-agent", "")),
            ip=client_ip(websocket))
        sockets.add(page_socket)
        try:
            await page_socket.run()
        finally:
            sockets.discard(page_socket)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH",
                                                "DELETE"])
    async def api_missing(rest: str) -> Response:
        return _json({"error": "no such API"}, 404)

    @app.get(letters.LOGO_PATH)
    async def mail_logo() -> Response:
        """The logo in the emails. Mail apps and their image proxies fetch
        it from wherever the email is read, so this one file, unlike the
        rest of the page, other sites may load."""
        return FileResponse(MAIL_LOGO, media_type="image/png", headers={
            "cache-control": "public, max-age=604800",
            "cross-origin-resource-policy": "cross-origin"})

    @app.get("/{path:path}")
    async def page(path: str) -> Response:
        if path:
            candidate = (dist / path).resolve()
            # Only files inside dist; `..` and absolute paths end up elsewhere.
            if candidate.is_file() and candidate.is_relative_to(dist):
                return FileResponse(candidate, headers=NO_CACHE)
            if Path(path).suffix:
                # Looks like a file of the page that is not there.
                return Response("Not found\n", status_code=404,
                                media_type="text/plain", headers=NO_CACHE)
        index = dist / "index.html"
        if not index.is_file():
            return HTMLResponse(PAGE_MISSING, status_code=503, headers=NO_STORE)
        # A fresh number for the page's own style elements, every time.
        nonce = secrets.token_urlsafe(18)
        text = _with_nonce(index.read_text(encoding="utf-8"), nonce)
        return HTMLResponse(text, headers={
            **NO_STORE, "content-security-policy": page_csp(nonce)})

    # The guard inside the headers, so that its refusals carry them too.
    return AddHeaders(PageGuard(app, page_url), PAGE_HEADERS)

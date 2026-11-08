"""What keeps other sites from acting through the page.

From 0.0.9 everyone signs in, and the session is a cookie the browser sends
by itself; the page's own guard stays, as before sign-in, for what a cookie
cannot tell:

* DNS rebinding. A site makes its own name resolve to our address and then
  talks to us as if it were us. The Host header gives it away, so we answer
  only to the page's own address (TTERM_PAGE_URL; on the laptop localhost
  and 127.0.0.1 with our port).
* Cross-site requests. Any page in any tab can send a POST to us. A request
  that changes something must carry a header a cross-site page cannot set
  without asking us first, and we never agree; an Origin, when the browser
  sends one, must be ours. The cookies are SameSite=Strict as well.
* WebSockets: browsers always send Origin there, and it must be ours.
"""
from __future__ import annotations

from typing import Awaitable, Callable
from urllib.parse import urlsplit

import os

Scope = dict
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

#: The header the page puts on every request that changes something.
REQUEST_HEADER = "x-tterm"

#: The page's security policy. Scripts, styles and fonts only from the
#: page's own files; no inline scripts, no eval, no frames. From 0.1.26 the
#: page may compile WebAssembly ('wasm-unsafe-eval'): the vault password's
#: Argon2id runs as WebAssembly that comes inside the page's own script.
#: That allows compiling WebAssembly only; eval of JavaScript stays refused.
CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://telegram.org; "
       "style-src 'self'{nonce} 'unsafe-inline'; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://e-klimov.ru https://*.e-klimov.ru https://telegram.org https://*.telegram.org; "
       "connect-src 'self' https://e-klimov.ru https://telegram.org https://oauth.telegram.org; "
       "frame-src 'self' https://oauth.telegram.org https://telegram.org; "
       "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org; base-uri 'none'; form-action 'self'; "
       "object-src 'none'")


def page_csp(nonce: str | None = None) -> str:
    """The policy, optionally allowing style elements that carry `nonce`.

    xterm.js writes a few small style elements of its own. Each copy of the
    page gets a fresh one-time number for them (see web/src/styleNonce.ts);
    a style slipped in by anyone else does not have it and is ignored.
    """
    return CSP.format(nonce=f" 'nonce-{nonce}'" if nonce else "")


PAGE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", page_csp().encode()),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"permissions-policy",
     b"camera=(), microphone=(), geolocation=(), usb=(), payment=()"),
]

#: The machines' side serves no pages at all.
CONNECT_HEADERS: list[tuple[bytes, bytes]] = [
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _headers(scope: Scope) -> dict[str, str]:
    return {k.decode("latin-1").lower(): v.decode("latin-1")
            for k, v in scope.get("headers", [])}


class AddHeaders:
    """Puts the given headers on every HTTP response, unless already set."""

    def __init__(self, app: ASGIApp, headers: list[tuple[bytes, bytes]]) -> None:
        self.app = app
        self.headers = headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + [
                    (k, v) for k, v in self.headers if k not in present]
            await send(message)

        await self.app(scope, receive, send_with_headers)


def page_origins(page_url: str) -> tuple[set[str], set[str]]:
    """The Host values and the origins the page answers to. On the laptop
    localhost, 127.0.0.1 and [::1] are the same page."""
    parts = urlsplit(page_url)
    host = (parts.hostname or "").lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        names = ["localhost", "127.0.0.1", "[::1]"]
    else:
        names = [f"[{host}]" if ":" in host else host]
    hosts = {f"{name}:{parts.port}" if parts.port else name for name in names}
    return hosts, {f"{parts.scheme}://{h}" for h in hosts}


class PageGuard:
    """Lets through only what comes from the page itself, at its address."""

    def __init__(self, app: ASGIApp, page_url: str) -> None:
        self.app = app
        self.page_url = page_url
        self.hosts, self.origins = page_origins(page_url)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        headers = _headers(scope)
        host_header = headers.get("host", "").lower()
        allow_all = (
            os.environ.get("ALLOWED_HOSTS", "").strip() == "*"
            or os.environ.get("TTERM_ALLOWED_HOSTS", "").strip() == "*"
            or "nip.io" in host_header
        )
        if not allow_all and host_header not in self.hosts:
            await self._refuse(scope, send, 421,
                               f"Open this page as {self.page_url}")
            return
        origin = headers.get("origin")
        is_nip_origin = origin and "nip.io" in origin
        if scope["type"] == "websocket":
            if not (allow_all or is_nip_origin or origin in self.origins):
                await self._refuse(scope, send, 403, "Not from this page")
                return
        elif scope["method"] not in SAFE_METHODS:
            path = scope.get("path", "")
            is_orch = path.startswith("/api/orchestration/") or path.startswith("/api/mcp/") or path.startswith("/api/auth/")
            if not is_orch and not allow_all and not is_nip_origin:
                if headers.get(REQUEST_HEADER) != "1" or (
                        origin is not None and origin not in self.origins):
                    await self._refuse(scope, send, 403, "Not from this page")
                    return
            else:
                if not (allow_all or is_nip_origin) and origin is not None and origin not in self.origins:
                    await self._refuse(scope, send, 403, "Not from this page")
                    return
        await self.app(scope, receive, send)

    @staticmethod
    async def _refuse(scope: Scope, send: Send, status: int, text: str) -> None:
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        body = (text + "\n").encode()
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"text/plain; charset=utf-8"),
                        (b"content-length", str(len(body)).encode()),
                        (b"cache-control", b"no-store")],
        })
        await send({"type": "http.response.body", "body": body})

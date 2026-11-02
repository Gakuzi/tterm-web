"""The running core: the page and its API, the machines' side, the guards."""
import json
import tempfile
from pathlib import Path

from .. import __version__
from ..server import Core, PortBusy, listen
from .harness import free_socket, request

CHANGE = {"x-tterm": "1", "content-type": "application/json"}


async def test_both_sides_answer(h):
    async with h.core() as core:
        page = await request(core.page_port, "GET", "/health")
        assert page.status == 200 and page.json()["service"] == "tterm-web page"
        machines = await request(core.connect_port, "GET", "/health",
                                 host="connect-dev.tterm.net")
        assert machines.status == 200, machines.status
        assert machines.json() == {"ok": True, "service": "tterm-web connect",
                                   "version": __version__}


async def test_state_has_owner_and_personal(h):
    async with h.core() as core:
        r = await request(core.page_port, "GET", "/api/state")
        assert r.status == 200, r.status
        assert r.headers["cache-control"] == "no-store"
        state = r.json()
        assert state["version"] == __version__
        me = state["me"]
        assert (me["name"], me["firstName"], me["initials"], me["theme"]) == (
            "Denis Gerasimenko", "Denis", "DG", "system"), me
        assert [(p["name"], p["code"], p["role"], p["machines"])
                for p in state["projects"]] == [("Personal", "P", "owner", [])]


async def test_the_state_says_whether_the_app_signed_in(h):
    """The account menu offers tTerm for Mac until the person has signed in
    with it (0.1.18): a device of the app, not forgotten."""
    async with h.core() as core:
        async def signed_in() -> bool:
            return (await request(core.page_port, "GET", "/api/state")).json()["me"]["appSignedIn"]
        assert await signed_in() is False
        device = await core.pool.fetchval(
            "INSERT INTO devices (user_id, kind, key_hash, pin_hash, label) "
            "VALUES ($1, 'app', 'k', NULL, 'tTerm for Mac on MacBook-Pro-Denis') RETURNING id",
            core.owner.id)
        assert await signed_in() is True
        await core.pool.execute("UPDATE devices SET forgotten_at = now() WHERE id = $1", device)
        assert await signed_in() is False


async def test_theme_change_needs_the_page_header(h):
    async with h.core() as core:
        body = json.dumps({"theme": "light"}).encode()
        r = await request(core.page_port, "PATCH", "/api/me", body=body,
                          headers={"content-type": "application/json"})
        assert r.status == 403, f"without x-tterm: {r.status}"
        r = await request(core.page_port, "PATCH", "/api/me", body=body,
                          headers=CHANGE)
        assert r.status == 204, r.status
        state = (await request(core.page_port, "GET", "/api/state")).json()
        assert state["me"]["theme"] == "light"
        r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                          body=json.dumps({"theme": "blue"}).encode())
        assert r.status == 422 and "error" in r.json(), r.text


async def test_the_language_is_kept_with_the_person(h):
    """0.1.16: none until chosen, then the one chosen, one of the twelve;
    a wrong one changes nothing, the theme beside it neither."""
    async with h.core() as core:
        state = (await request(core.page_port, "GET", "/api/state")).json()
        assert state["me"]["language"] is None, state["me"]
        for language in ("de", "pt-BR", "zh-CN", "en"):
            r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                              body=json.dumps({"language": language}).encode())
            assert r.status == 204, (language, r.status)
            state = (await request(core.page_port, "GET", "/api/state")).json()
            assert state["me"]["language"] == language, state["me"]
        for wrong in ("EN", "pt", "zh", "uk", "", "en-US"):
            r = await request(core.page_port, "PATCH", "/api/me", headers=CHANGE,
                              body=json.dumps({"theme": "dark",
                                               "language": wrong}).encode())
            assert r.status == 422 and "error" in r.json(), (wrong, r.text)
        state = (await request(core.page_port, "GET", "/api/state")).json()
        assert (state["me"]["language"], state["me"]["theme"]) == ("en", "system")
        r = await request(core.page_port, "PATCH", "/api/me",
                          body=json.dumps({"language": "ru"}).encode(),
                          headers={"content-type": "application/json"})
        assert r.status == 403, f"without x-tterm: {r.status}"


async def test_other_sites_cannot_act(h):
    async with h.core() as core:
        body = json.dumps({"theme": "dark"}).encode()
        # A page in another tab, even with our header, gives its own origin.
        r = await request(core.page_port, "PATCH", "/api/me", body=body,
                          headers={**CHANGE, "origin": "https://evil.example"})
        assert r.status == 403, r.status
        r = await request(core.page_port, "PATCH", "/api/me", body=body,
                          headers={**CHANGE,
                                   "origin": f"http://localhost:{core.page_port}"})
        assert r.status == 204, r.status


async def test_dns_rebinding_is_refused(h):
    async with h.core() as core:
        for host in ("evil.example", f"evil.example:{core.page_port}",
                     "localhost:1", "127.0.0.1"):
            r = await request(core.page_port, "GET", "/api/state", host=host)
            assert r.status == 421, f"{host}: {r.status}"
            assert "frame-ancestors 'none'" in r.headers.get(
                "content-security-policy", ""), "refusals carry the headers too"
        for host in (f"localhost:{core.page_port}",
                     f"127.0.0.1:{core.page_port}"):
            r = await request(core.page_port, "GET", "/api/state", host=host)
            assert r.status == 200, f"{host}: {r.status}"


def _policy(csp: str) -> dict[str, list[str]]:
    """A security policy as its directives, each with its sources."""
    directives: dict[str, list[str]] = {}
    for part in csp.split(";"):
        words = part.split()
        if words:
            assert words[0] not in directives, f"{words[0]} twice: {csp}"
            directives[words[0]] = words[1:]
    return directives


async def test_page_security_headers(h):
    """The policy directive by directive, on the page (with its style
    number) and on the API: from 0.1.26 script-src lets the page compile
    WebAssembly (the vault password's Argon2id), and nothing else is
    loosened: no eval, nothing inline, no other source anywhere."""
    async with h.core() as core:
        for path in ("/", "/api/state"):
            r = await request(core.page_port, "GET", path)
            csp = r.headers["content-security-policy"]
            policy = _policy(csp)
            assert policy.pop("script-src") == ["'self'", "'wasm-unsafe-eval'"], csp
            style = policy.pop("style-src")
            if path == "/":
                assert len(style) == 2 and style[1].startswith("'nonce-"), csp
                style = style[:1]
            assert style == ["'self'"], csp
            assert policy == {
                "default-src": ["'self'"], "font-src": ["'self'"],
                "img-src": ["'self'", "data:"], "connect-src": ["'self'"],
                "frame-ancestors": ["'none'"], "base-uri": ["'none'"],
                "form-action": ["'self'"], "object-src": ["'none'"]}, csp
            words = csp.replace(";", " ").split()
            assert "'unsafe-eval'" not in words and "'unsafe-inline'" not in words
            assert "unsafe-inline" not in csp, csp
            assert r.headers["x-content-type-options"] == "nosniff"
            assert r.headers["referrer-policy"] == "no-referrer"
            assert r.headers["x-frame-options"] == "DENY"


async def test_page_files_and_addresses_inside_the_page(h):
    async with h.core() as core:
        index = await request(core.page_port, "GET", "/")
        assert index.status == 200 and "<div id=root>" in index.text
        # Each copy carries its own one-time style number: never kept.
        assert index.headers["cache-control"] == "no-store"
        # An address inside the page survives a reload.
        deep = await request(core.page_port, "GET", "/projects/p/overview")
        assert deep.status == 200 and "<div id=root>" in deep.text
        asset = await request(core.page_port, "GET", "/assets/index.js")
        assert asset.status == 200 and asset.text == "console.log(1)"
        missing = await request(core.page_port, "GET", "/assets/nope.js")
        assert missing.status == 404, missing.status
        api = await request(core.page_port, "GET", "/api/nope")
        assert api.status == 404 and api.json() == {"error": "no such API"}


async def test_the_emails_logo_may_be_loaded_from_anywhere(h):
    """Mail apps and their image proxies fetch it from wherever the email is
    read, without a session; the rest of the page stays its own."""
    async with h.core() as core:
        r = await request(core.page_port, "GET", "/mail/logo.png",
                          headers={"cookie": ""})
        assert r.status == 200, r.status
        assert r.headers["content-type"] == "image/png", r.headers
        assert r.body.startswith(b"\x89PNG"), r.body[:8]
        assert r.headers["cross-origin-resource-policy"] == "cross-origin"
        assert r.headers["cache-control"].startswith("public"), r.headers
        other = await request(core.page_port, "GET", "/assets/index.js")
        assert other.headers["cross-origin-resource-policy"] == "same-origin"


async def test_page_files_stay_inside_dist(h):
    async with h.core() as core:
        for path in ("/../tterm/server.py", "/%2e%2e/tterm/server.py",
                     "/assets/../../tterm/server.py", "//etc/passwd"):
            r = await request(core.page_port, "GET", path)
            assert "import" not in r.text and "root:" not in r.text, path


async def test_machines_side_has_no_page_and_no_api(h):
    async with h.core() as core:
        for path in ("/", "/api/state", "/assets/index.js"):
            r = await request(core.connect_port, "GET", path,
                              host="connect-dev.tterm.net")
            assert r.status == 404, f"{path}: {r.status}"
        r = await request(core.connect_port, "GET", "/health",
                          host="connect-dev.tterm.net")
        assert r.headers["content-security-policy"].startswith("default-src 'none'")


async def test_page_not_built_says_so(h):
    empty = Path(tempfile.mkdtemp())
    async with h.core(dist=empty) as core:
        r = await request(core.page_port, "GET", "/")
        assert r.status == 503 and "not built" in r.text, r.status


async def test_busy_port_is_a_clear_message(h):
    taken = free_socket()
    try:
        port = taken.getsockname()[1]
        try:
            listen("127.0.0.1", port)
        except PortBusy as exc:
            assert str(port) in str(exc) and "already running" in str(exc)
        else:
            raise AssertionError("bound a busy port")
    finally:
        taken.close()


async def test_core_stops_cleanly_and_frees_its_ports(h):
    async with h.core() as core:
        page_port, connect_port = core.page_port, core.connect_port
    for port in (page_port, connect_port):
        listen("127.0.0.1", port).close()   # free again


async def test_core_without_database_does_not_leave_ports_taken(h):
    from ..core.config import Settings
    from ..core.db import DatabaseUnavailable
    settings = Settings.load(environ={
        "TTERM_DATABASE_URL": "postgresql://localhost:1/tterm_web",
        "TTERM_DATA_DIR": tempfile.mkdtemp(prefix="tt")},
        env_file=Path("/nonexistent/.env"))
    page, connect = free_socket(), free_socket()
    ports = (page.getsockname()[1], connect.getsockname()[1])
    try:
        await Core(settings).start(page_socket=page, connect_socket=connect)
    except DatabaseUnavailable:
        pass
    else:
        raise AssertionError("started without a database")
    for port in ports:
        listen("127.0.0.1", port).close()


async def test_a_laptop_from_before_sign_in_asks_for_the_owners_address(h):
    """0.0.8 and before had a local owner without an address. Signing in
    first would make a second, empty account: the core says what to set."""
    from ..core.config import Settings
    url = await h.database()
    import asyncpg
    conn = await asyncpg.connect(url)
    try:
        await conn.execute("INSERT INTO users (name, is_local_owner) "
                           "VALUES ('Denis Gerasimenko', true)")
    finally:
        await conn.close()
    settings = Settings.load(environ={
        "TTERM_DATABASE_URL": url, "TTERM_DATA_DIR": tempfile.mkdtemp(prefix="tt"),
        "TTERM_SIGNER_SOCKET": "/nonexistent/s.sock"},
        env_file=Path("/nonexistent/.env"))
    page, connect = free_socket(), free_socket()
    ports = (page.getsockname()[1], connect.getsockname()[1])
    try:
        await Core(settings).start(page_socket=page, connect_socket=connect)
    except RuntimeError as exc:
        assert "TTERM_OWNER_EMAIL" in str(exc) and "Denis" in str(exc), exc
    else:
        raise AssertionError("started with an owner nobody can sign in as")
    for port in ports:
        listen("127.0.0.1", port).close()

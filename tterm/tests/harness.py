"""What the checks stand on: throwaway databases, a running core, HTTP.

Each run creates its own databases next to the real one and drops them at
the end. The real database, tterm_web, is never opened.

A core from Harness.core has its local owner signed in: request() and
page_socket() carry the owner's session cookie to that core's page unless
told otherwise (a "cookie" header of their own, even an empty one).
"""
from __future__ import annotations

import asyncio
import contextlib
import fcntl
import http.client
import json
import os
import pty
import shutil
import signal
import socket
import struct
import tempfile
import termios
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import asyncssh
import websockets

from ..core import auth, db, passport
from ..core.config import Settings
from ..core.signer_client import SignerClient
from ..server import Core
from ..signer.service import Signer, serve

#: How long a test SSH server waits for the core's connections to close
#: once a check is done (0.1.25).
CLOSE_WAIT = 10

#: What a small Ubuntu server answers to the passport script.
PASSPORT_OUTPUT = """os=Ubuntu 24.04.1 LTS
os_id=ubuntu
os_version=24.04
kernel=6.8.0-45-generic
arch=x86_64
hostname=tterm-lab-01
package_manager=apt-get
shell=/bin/bash
shells=bash
cpus=1
memory_kb=1003456
disk_total_kb=25215872
disk_free_kb=22000000
sudo=yes
systemd=yes
--commands--
apt
git
ls
systemctl
"""


class Sshd(asyncssh.SSHServer):
    """Reads the user's ~/.ssh/authorized_keys at every sign-in, as sshd
    does, so that what the core changes there counts at once.

    asyncssh goes by the first line whose CA fits, where sshd tries every
    line: lines with principals= go first here, so that a certificate gets
    in or not as it would with sshd."""

    def __init__(self, keys: Path) -> None:
        self.keys = keys
        self.conn: asyncssh.SSHServerConnection | None = None
        self.made = time.monotonic()
        self.closed = False

    def connection_made(self, conn: asyncssh.SSHServerConnection) -> None:
        self.conn = conn

    def connection_lost(self, exc: Exception | None) -> None:
        self.closed = True

    def describe(self) -> str:
        """For a check that failed on this connection: who, how old, how
        many channels it still has."""
        conn = self.conn
        peer = conn.get_extra_info("peername") if conn is not None else None
        channels = len(getattr(conn, "_channels", {}) or {})
        return (f"from {peer}, {time.monotonic() - self.made:.1f} s old, "
                f"{channels} channel(s) open")

    def begin_auth(self, username: str) -> bool:
        try:
            lines = [line for line in self.keys.read_text().splitlines()
                     if line.strip()]
        except OSError:
            lines = []
        lines.sort(key=lambda line: not line.startswith("cert-authority,"))
        assert self.conn is not None
        self.conn.set_authorized_keys(
            asyncssh.import_authorized_keys("\n".join(lines) + "\n"))
        return True


def old_line(home: Path, ca_public_key: str) -> None:
    """The line a server got from the installer before 0.0.12: any
    certificate of the CA for the user tterm."""
    keys = home / ".ssh" / "authorized_keys"
    keys.parent.mkdir(parents=True, exist_ok=True)
    with keys.open("a") as f:
        f.write(f"cert-authority {ca_public_key}\n")


@contextlib.asynccontextmanager
async def ssh_server(ca_public_key: str, *, host_key=None,
                     home: Path | None = None):
    """A small SSH server in this process, set up the way the installer sets
    a real one up: with `home`, it trusts what that home's authorized_keys
    says, and the installer's line is the check's to put in there; without,
    the line of before 0.0.12. It answers the passport script, and runs
    anything else with sh in that home.

    Yields (port, host_key, sign_ins): sign_ins collects the user name of
    every session that got in.
    """
    host_key = host_key or asyncssh.generate_private_key("ssh-ed25519")
    own_home = home is None
    home = home or Path(tempfile.mkdtemp(prefix="ttsrv"))
    (home / ".ssh").mkdir(parents=True, exist_ok=True)
    if own_home:
        old_line(home, ca_public_key)
    sign_ins: list[str] = []

    async def handle(process: asyncssh.SSHServerProcess) -> None:
        sign_ins.append(process.get_extra_info("username") or "")
        if passport.MARKER in (process.command or ""):
            process.stdout.write(PASSPORT_OUTPUT)
            process.exit(0)
            return
        data = await process.stdin.read()
        proc = await asyncio.create_subprocess_exec(
            "sh", "-c", process.command or "", stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            cwd=home,
            env={"HOME": str(home), "PATH": os.environ.get("PATH", "/usr/bin:/bin")})
        out, err = await proc.communicate(data.encode())
        process.stdout.write(out.decode())
        process.stderr.write(err.decode())
        process.exit(proc.returncode or 0)

    made: list[Sshd] = []

    def for_a_connection() -> Sshd:
        sshd = Sshd(home / ".ssh" / "authorized_keys")
        made.append(sshd)
        return sshd

    server = await asyncssh.create_server(
        for_a_connection, "127.0.0.1", 0,
        server_host_keys=[host_key], process_factory=handle, encoding="utf-8")
    port = server.sockets[0].getsockname()[1]
    inside_failed = False
    try:
        yield port, host_key, sign_ins
    except BaseException:
        inside_failed = True
        raise
    finally:
        try:
            await _close(server, made, inside_failed)
        finally:
            if own_home:
                shutil.rmtree(home, ignore_errors=True)


@contextlib.asynccontextmanager
async def shell_server(ca_public_key: str, home: Path, login_shell: str):
    """An SSH server in this process that runs real shells in real ptys on
    this computer, in a throwaway home: what a server does for a terminal.

    Commands run as sshd runs them, with the login shell: `shell -c
    command`. With a pty, the pty gets the size and the echo setting the
    client asked for, the shell becomes its session's leader, and resizes
    reach it. Yields (port, host_key).
    """
    host_key = asyncssh.generate_private_key("ssh-ed25519")
    # A server as it was connected before 0.0.12, unless the check set up
    # its authorized_keys already: the core rewrites the line at its first
    # sign-in (trust.py).
    if not (home / ".ssh" / "authorized_keys").exists():
        old_line(home, ca_public_key)
    env = {"HOME": str(home), "SHELL": login_shell, "USER": "tterm",
           "LOGNAME": "tterm",
           "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
    tasks: set[asyncio.Task] = set()
    made: list[Sshd] = []

    def for_a_connection() -> Sshd:
        sshd = Sshd(home / ".ssh" / "authorized_keys")
        made.append(sshd)
        return sshd

    async def handle(process: asyncssh.SSHServerProcess) -> None:
        task = asyncio.current_task()
        if task:
            tasks.add(task)
        try:
            if process.get_terminal_type() is None:
                await _plain(process, env, home)
            else:
                await _in_pty(process, env, home)
        finally:
            if task:
                tasks.discard(task)

    server = await asyncssh.create_server(
        for_a_connection, "127.0.0.1", 0,
        server_host_keys=[host_key], process_factory=handle, encoding=None)
    port = server.sockets[0].getsockname()[1]
    inside_failed = False
    try:
        yield port, host_key
    except BaseException:
        inside_failed = True
        raise
    finally:
        server.close()
        for task in list(tasks):
            task.cancel()
        await _close(server, made, inside_failed)


async def _close(server: asyncssh.SSHAcceptor, made: list[Sshd],
                 inside_failed: bool) -> None:
    """Closes a test SSH server, which waits for its connections to close.
    On 02.11 a check waited there for good, once on the owner's Mac and once
    here, out of many runs: a connection of the core's that never closed.
    Not for good any more (0.1.25): the connections still open are named,
    closed, and the check fails saying so, unless it failed already."""
    server.close()
    try:
        await asyncio.wait_for(asyncio.shield(server.wait_closed()), CLOSE_WAIT)
    except asyncio.TimeoutError:
        left = [s for s in made if not s.closed]
        said = "; ".join(s.describe() for s in left) or "none of its own"
        for s in left:
            if s.conn is not None:
                s.conn.close()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(server.wait_closed(), CLOSE_WAIT)
        if not inside_failed:
            raise AssertionError("the core left SSH connections open after the "
                                 f"check: {said}") from None


async def _plain(process: asyncssh.SSHServerProcess, env: dict,
                 home: Path) -> None:
    proc = await asyncio.create_subprocess_exec(
        env["SHELL"], "-c", process.command or "",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, env=env, cwd=home)
    data = await process.stdin.read()
    out, err = await proc.communicate(data)
    process.stdout.write(out)
    process.stderr.write(err)
    process.exit(proc.returncode or 0)


def _take_terminal() -> None:
    """In the child: the pty becomes the controlling terminal of the new
    session, so Ctrl+C and job control work as on a server."""
    os.setsid()
    request = getattr(termios, "TIOCSCTTY", None)
    if request is not None:
        fcntl.ioctl(0, request, 0)


async def _in_pty(process: asyncssh.SSHServerProcess, env: dict,
                  home: Path) -> None:
    master, slave = pty.openpty()
    cols, rows, _, _ = process.get_terminal_size()
    fcntl.ioctl(master, termios.TIOCSWINSZ,
                struct.pack("HHHH", rows, cols, 0, 0))
    attrs = termios.tcgetattr(slave)
    if process.get_terminal_mode(asyncssh.PTY_ECHO) == 0:
        attrs[3] &= ~termios.ECHO
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    child_env = dict(env, TERM=process.get_terminal_type() or "xterm")
    proc = await asyncio.create_subprocess_exec(
        env["SHELL"], "-c", process.command or env["SHELL"],
        stdin=slave, stdout=slave, stderr=slave, env=child_env, cwd=home,
        preexec_fn=_take_terminal)
    os.close(slave)
    loop = asyncio.get_running_loop()
    drained = asyncio.Event()

    def readable() -> None:
        try:
            data = os.read(master, 65536)
        except OSError:
            data = b""
        if data:
            process.stdout.write(data)
        else:
            loop.remove_reader(master)
            drained.set()

    loop.add_reader(master, readable)

    async def keys() -> None:
        while True:
            try:
                data = await process.stdin.read(65536)
            except asyncssh.TerminalSizeChanged as change:
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack(
                    "HHHH", change.height, change.width, 0, 0))
                continue
            except (asyncssh.BreakReceived, asyncssh.SignalReceived):
                continue
            if not data:
                break
            os.write(master, data)
        # The client is gone: as with sshd, the shell hears a hangup.
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(proc.pid, signal.SIGHUP)

    typing = asyncio.create_task(keys())
    try:
        code = await proc.wait()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(drained.wait(), 2)
    finally:
        typing.cancel()
        loop.remove_reader(master)
        os.close(master)
        if proc.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
    process.exit(code)


def admin_url(database_url: str) -> str:
    """The same server, the maintenance database `postgres`."""
    parts = urlsplit(database_url)
    return urlunsplit(parts._replace(path="/postgres"))


def with_database(database_url: str, name: str) -> str:
    parts = urlsplit(database_url)
    return urlunsplit(parts._replace(path=f"/{name}"))


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    body: bytes
    #: Every Set-Cookie header, in order (`headers` keeps only the last).
    set_cookies: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", "replace")

    def json(self):
        return json.loads(self.body)


def _request(port: int, method: str, path: str, headers: dict[str, str],
             body: bytes | None) -> Response:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        conn.putrequest(method, path, skip_host=True,
                        skip_accept_encoding=True)
        for key, value in headers.items():
            conn.putheader(key, value)
        if body is not None:
            conn.putheader("content-length", str(len(body)))
        conn.endheaders(body)
        resp = conn.getresponse()
        return Response(resp.status,
                        {k.lower(): v for k, v in resp.getheaders()},
                        resp.read(),
                        [v for k, v in resp.getheaders()
                         if k.lower() == "set-cookie"])
    finally:
        conn.close()


#: The owner's session cookie for each running core's page port.
SESSIONS: dict[int, str] = {}
OWNER_EMAIL = "denis@example.com"


async def request(port: int, method: str, path: str, *,
                  host: str | None = None, headers: dict[str, str] | None = None,
                  body: bytes | None = None) -> Response:
    """A plain HTTP request with full control over Host and the headers.
    To a core's page it goes as its owner, unless `headers` has a cookie."""
    all_headers = {"host": host or f"localhost:{port}"}
    if port in SESSIONS:
        all_headers["cookie"] = SESSIONS[port]
    for key, value in (headers or {}).items():
        all_headers[key.lower()] = value
    if not all_headers.get("cookie"):
        all_headers.pop("cookie", None)
    return await asyncio.to_thread(_request, port, method, path, all_headers,
                                   body)


def page_socket(port: int, *, cookie: str | None = None, **options):
    """The page's socket, as the core's owner unless `cookie` says else
    ("" for none)."""
    cookie = SESSIONS.get(port, "") if cookie is None else cookie
    options.setdefault("origin", f"http://localhost:{port}")
    return websockets.connect(
        f"ws://localhost:{port}/api/ws", proxy=None,
        additional_headers={"cookie": cookie} if cookie else None, **options)


async def session_id_of(core, cookie: str | None = None):
    """The session a cookie carries (the owner's, unless given), as its
    requests and sockets go: a terminal opened the way the page opens it
    names it, since only that session's sockets sign its login (0.1.28)."""
    cookie = SESSIONS[core.page_port] if cookie is None else cookie
    token = cookie.split("=", 1)[1]
    found = await auth.session(core.pool, token, touch=False)
    assert found is not None, "no such session"
    return found.id


async def sign_in_as(core, email: str, name: str | None = None) -> str:
    """A session for the account of `email`, made as signing up would make
    it: the cookie that carries it. The name, unless given, from the
    address: anna.nikolaeva@… is Anna Nikolaeva."""
    name = name or email.split("@")[0].replace(".", " ").title()
    async with core.pool.acquire() as conn, conn.transaction():
        person = (await auth._make_account(conn, email, name)
                  or await auth._account(conn, email))
    token = await auth.open_session(core.pool, person.id)
    return f"{auth.SESSION_COOKIE}={token}"


def free_socket() -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))
    sock.listen(16)
    return sock


@dataclass
class Harness:
    base_url: str
    _template: str | None = None
    _created: list[str] = field(default_factory=list)
    _admin: asyncpg.Connection | None = None
    _counter: int = 0

    async def start(self) -> None:
        try:
            self._admin = await asyncpg.connect(admin_url(self.base_url))
        except Exception as exc:
            raise db.DatabaseUnavailable(
                f"The checks need PostgreSQL at "
                f"{db.describe(admin_url(self.base_url))}: {exc}. Is "
                "Postgres.app running?") from None
        # One migrated template; every check gets a copy of it, which is
        # much faster than migrating each time.
        self._template = await self._create("tmpl")
        pool = await db.connect(with_database(self.base_url, self._template),
                                max_size=2)
        try:
            await db.migrate(pool)
        finally:
            await pool.close()

    async def _create(self, kind: str, template: str | None = None) -> str:
        assert self._admin is not None
        self._counter += 1
        name = f"tterm_test_{os.getpid()}_{kind}_{self._counter}"
        sql = f'CREATE DATABASE "{name}"'
        if template:
            sql += f' TEMPLATE "{template}"'
        await self._admin.execute(sql)
        self._created.append(name)
        return name

    async def empty_database(self) -> str:
        """The URL of a new, empty database, not migrated."""
        return with_database(self.base_url, await self._create("empty"))

    async def database(self) -> str:
        """The URL of a new database with the schema in place."""
        return with_database(self.base_url,
                             await self._create("db", self._template))

    @contextlib.asynccontextmanager
    async def pool(self):
        pool = await db.connect(await self.database(), max_size=4)
        try:
            yield pool
        finally:
            await pool.close()

    @contextlib.asynccontextmanager
    async def signer(self):
        """A signer in this process, on a socket in a short temporary path
        (Unix socket paths may be only about a hundred bytes long)."""
        tmp = Path(tempfile.mkdtemp(prefix="tt"))
        try:
            signer = Signer(tmp / "signer")
            signer.load_or_create()
            server = await serve(signer, tmp / "s.sock")
            try:
                yield signer, SignerClient(tmp / "s.sock")
            finally:
                server.close()
                await server.wait_closed()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    @contextlib.asynccontextmanager
    async def core(self, *, dist: Path | None = None,
                   owner: str = "Denis Gerasimenko", with_signer: bool = True,
                   owner_email: str = OWNER_EMAIL,
                   environ: dict[str, str] | None = None):
        """A running core on free ports, with a small fake page and a signer;
        its local owner signed in (see request), and emails kept by the log
        mailer, core.mailer.sent. Without `owner_email`, no local owner."""
        async with contextlib.AsyncExitStack() as stack:
            tmp = stack.enter_context(tempfile.TemporaryDirectory())
            if dist is None:
                dist = Path(tmp) / "dist"
                (dist / "assets").mkdir(parents=True)
                (dist / "index.html").write_text(
                    "<!doctype html><title>tTerm</title><div id=root></div>")
                (dist / "assets" / "index.js").write_text("console.log(1)")
            client = SignerClient(Path(tmp) / "nobody-here.sock", timeout=0.5)
            if with_signer:
                _, client = await stack.enter_async_context(self.signer())
            page = free_socket()
            settings = Settings.load(environ={
                "TTERM_DATABASE_URL": await self.database(),
                "TTERM_OWNER_NAME": owner,
                "TTERM_OWNER_EMAIL": owner_email,
                "TTERM_WEB_DIST": str(dist),
                "TTERM_CONNECT_URL": "https://connect.test",
                "TTERM_PAGE_URL": f"http://localhost:{page.getsockname()[1]}",
                "TTERM_DATA_DIR": str(Path(tmp) / "data"),
                **(environ or {}),
            }, env_file=Path(tmp) / "no.env")
            core = Core(settings, signer=client)
            await core.start(page_socket=page, connect_socket=free_socket())
            port = core.page_port
            try:
                if core.owner is not None:
                    token = await auth.open_session(core.pool, core.owner.id)
                    SESSIONS[port] = f"{auth.SESSION_COOKIE}={token}"
                yield core
            finally:
                SESSIONS.pop(port, None)
                await core.stop()

    async def close(self) -> None:
        if self._admin is None:
            return
        for name in reversed(self._created):
            with contextlib.suppress(Exception):
                await self._admin.execute(
                    f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await self._admin.close()
        self._admin = None

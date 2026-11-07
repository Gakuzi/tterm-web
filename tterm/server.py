"""The core as a running thing: the database, the page, the machines' side.

Two listeners, as on the server with its two addresses: the page and its API
for people, and the side machines talk to. They are separate apps on
separate ports, so the tunnel, which points at the machines' port, cannot
lead anyone to the page. The signer is a separate process; the core only
talks to it.

Everyone signs in (from 0.0.9). On the laptop the person it belongs to is
the local owner, as before, once TTERM_OWNER_EMAIL gives them an address.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import socket
import sys

import asyncpg
import uvicorn

from .api.connect import create_connect_app
from .api.page import create_page_app
from .core import accounts, auth, db, machines, stats
from .core.agents import FRAME_MAX, Agents
from .core.terminals import Terminals
from .core.vault import VaultRelay
from .core.accounts import Person
from .core.config import Settings
from .core.mail import BrevoMailer, LogMailer, Mailer, ResendMailer, SmartMailer, SmtpMailer
from .core.signer_client import SignerClient, SignerRefused, SignerUnavailable

log = logging.getLogger("tterm")

#: Seconds between sweeps of old codes and sessions, and between the usage
#: counts.
SWEEP_EVERY = 3600


class PortBusy(Exception):
    """A port we need is taken; the message says which and what to check."""


class _Server(uvicorn.Server):
    """uvicorn without its own signal handling.

    Each uvicorn server takes over Ctrl+C for itself; with two of them in one
    process only one would hear it. The core stops both together instead.
    """

    @contextlib.contextmanager
    def capture_signals(self):
        yield


def more_open_files() -> None:
    """Lets the core keep more sockets open than the system's default
    allows, which on macOS is 256: agents connect from the internet, and a
    connection the core closed keeps its socket a few seconds for the other
    side's goodbye. Only ever raised, as far as the system lets it."""
    try:
        import resource
    except ImportError:         # not a Unix
        return
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    top = 10240 if hard == resource.RLIM_INFINITY else hard
    if sys.platform == "darwin":
        top = min(top, 10240)   # macOS refuses more for one process
    for want in (top, 4096, 1024):
        if soft == resource.RLIM_INFINITY or want <= soft:
            return
        try:
            resource.setrlimit(resource.RLIMIT_NOFILE, (want, hard))
            return
        except (ValueError, OSError):
            continue


def listen(host: str, port: int) -> socket.socket:
    """Takes the port before anything else starts.

    A busy port is then a plain sentence, not a stack trace from deep inside
    the server.
    """
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, port))
    except OSError as exc:
        sock.close()
        raise PortBusy(
            f"Port {port} on {host} is taken ({exc.strerror}). Is tTerm Web "
            "already running in another window?") from None
    sock.listen(128)
    return sock


class Core:
    """Starts and stops everything the core runs, in the right order."""

    def __init__(self, settings: Settings,
                 signer: SignerClient | None = None) -> None:
        self.settings = settings
        self.signer = signer or SignerClient(settings.signer_socket)
        self.pool: asyncpg.Pool | None = None
        #: The person this laptop belongs to, if there is one (see
        #: accounts.ensure_local_owner); on the server no one.
        self.owner: Person | None = None
        self.active_ca: dict | None = None
        self.terminals: Terminals | None = None
        #: The computers whose agent is connected right now.
        self.agents = Agents()
        #: Relays a vault key's signing to the capable page sockets (0.1.17).
        self.vault: VaultRelay | None = None
        #: How emails go: SMTP, Resend, Brevo, or this window's log with Telegram mirror.
        if settings.smtp_host and settings.smtp_user:
            primary: Mailer = SmtpMailer(
                host=settings.smtp_host,
                port=settings.smtp_port,
                user=settings.smtp_user,
                password=settings.smtp_password,
                sender=settings.mail_from,
                use_ssl=settings.smtp_ssl,
            )
            self.mailer = SmartMailer(primary)
        elif getattr(settings, "resend_key", None):
            primary = ResendMailer(settings.resend_key, settings.mail_from)
            self.mailer = SmartMailer(primary)
        elif settings.brevo_key:
            primary = BrevoMailer(settings.brevo_key, settings.mail_from)
            self.mailer = SmartMailer(primary)
        else:
            self.mailer = LogMailer()
        self._servers: list[_Server] = []
        self._tasks: list[asyncio.Task] = []
        self._sockets: list[socket.socket] = []
        self._sweeper: asyncio.Task | None = None

    @property
    def page_port(self) -> int:
        return self._sockets[0].getsockname()[1]

    @property
    def connect_port(self) -> int:
        return self._sockets[1].getsockname()[1]

    async def start(self, page_socket: socket.socket | None = None,
                    connect_socket: socket.socket | None = None) -> None:
        s = self.settings
        more_open_files()
        page_socket = page_socket or listen(s.page_host, s.page_port)
        try:
            connect_socket = connect_socket or listen(s.connect_host,
                                                      s.connect_port)
        except BaseException:
            page_socket.close()
            raise
        self._sockets = [page_socket, connect_socket]
        try:
            secret = auth.load_secret(s.data_dir / "auth.key")
            self.pool = await db.connect(s.database_url)
            await db.migrate(self.pool)
            if s.owner_email:
                try:
                    self.owner = await accounts.ensure_local_owner(
                        self.pool, s.owner_name, s.owner_email)
                except ValueError as exc:
                    raise RuntimeError(f"TTERM_OWNER_EMAIL: {exc}.") from None
            else:
                self.owner = await accounts.local_owner(self.pool)
                if self.owner is not None and not self.owner.email:
                    # A laptop from before sign-in: its machines and history
                    # are this person's, and only their address leads there.
                    # Signing in first would make them a second, empty
                    # account under that address.
                    raise RuntimeError(
                        f"Put TTERM_OWNER_EMAIL=your email in .env and start "
                        f"again: the address {self.owner.name} signs in with "
                        "from now on, to find the machines and the history "
                        "on this computer.")
            await self._meet_signer()
            self.vault = VaultRelay(self.pool)
            self.terminals = Terminals(self.pool, self.signer, self.agents,
                                       self.vault)
            await self.terminals.start()
        except BaseException:
            await self.stop()
            raise
        self._sweeper = asyncio.create_task(self._sweep())

        page = create_page_app(self.pool, s.web_dist, s.page_url,
                               s.connect_url, self.terminals, self.agents,
                               self.vault, secret=secret, mailer=self.mailer,
                               legal={"terms": s.terms_url,
                                      "privacy": s.privacy_url,
                                      "support": s.support_email},
                               signer=self.signer)
        connect = create_connect_app(self.pool, self.signer, s.connect_url,
                                     self.agents)
        for app, sock, limits in ((page, self._sockets[0], {}),
                                  (connect, self._sockets[1],
                                   # Agents, from the internet: no message
                                   # larger than a script's answer.
                                   {"ws_max_size": FRAME_MAX})):
            config = uvicorn.Config(
                app, lifespan="off", log_level="warning", access_log=False,
                server_header=False,
                # The core reads the proxy's headers itself, and only when the
                # proxy is on this machine: see client_ip in api/connect.py.
                proxy_headers=False, **limits)
            server = _Server(config)
            self._servers.append(server)
            self._tasks.append(asyncio.create_task(server.serve(sockets=[sock])))
        # Wait until both answer, so that whoever started us can use them.
        while not all(server.started for server in self._servers):
            for task in self._tasks:
                if task.done():
                    await task          # raises what killed it
                    raise RuntimeError("a server stopped while starting")
            await asyncio.sleep(0.02)

    async def _meet_signer(self) -> None:
        """Learns the CA keys. Without the signer the page still works;
        connecting machines does not, and says so when tried."""
        try:
            cas = await self.signer.keys()
        except (SignerUnavailable, SignerRefused) as exc:
            log.warning("%s Connecting machines will not work until it does.",
                        exc)
            return
        await machines.remember_cas(self.pool, cas)
        self.active_ca = next((ca for ca in cas if ca["active"]), None)

    async def _sweep(self) -> None:
        """Now and every hour: old codes, long-ended sessions and devices no
        longer trusted go, and the usage counts are written down."""
        while True:
            try:
                await auth.sweep(self.pool)
            except (OSError, asyncpg.PostgresError) as exc:
                log.warning("could not sweep old sign-ins: %s", exc)
            try:
                peak, top = self.terminals.peaks() if self.terminals else (0, 0)
                await stats.take(self.pool,
                                 computers_online=self.agents.connected(),
                                 terminals_peak=peak, terminals_top=top)
                if self.terminals:
                    self.terminals.restart_peaks()
            except (OSError, asyncpg.PostgresError) as exc:
                log.warning("could not write the usage counts: %s", exc)
            except Exception:       # noqa: BLE001 - the next hour still comes
                log.exception("could not write the usage counts")
            await asyncio.sleep(SWEEP_EVERY)

    async def wait(self) -> None:
        """Returns when any server stops on its own, which it should not."""
        if self._tasks:
            await asyncio.wait(self._tasks, return_when=asyncio.FIRST_COMPLETED)

    async def stop(self, grace: float = 5.0) -> None:
        if self._sweeper is not None:
            self._sweeper.cancel()
            with contextlib.suppress(BaseException):
                await self._sweeper
            self._sweeper = None
        # Terminals first: their ends go to the database, which closes last.
        # Each waits up to 5 seconds for its last commands to be saved before
        # its line in the log (terminals.py, _end): twice the grace for them.
        if self.terminals is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self.terminals.stop(), grace * 2)
            self.terminals = None
        self.agents.close_all("tTerm Web stopped.")
        for server in self._servers:
            server.should_exit = True
        if self._tasks:
            _, pending = await asyncio.wait(self._tasks, timeout=grace)
            if pending:
                for server in self._servers:
                    server.force_exit = True
                await asyncio.wait(pending, timeout=grace)
        if self.pool is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self.pool.close(), grace)
            self.pool = None
        for sock in self._sockets:
            with contextlib.suppress(OSError):
                sock.close()
        self._servers, self._tasks, self._sockets = [], [], []

"""Terminals: real shells on machines, kept by the core, shown by pages.

A terminal lives in the core, not in the browser. Closing or reloading the
page leaves the shell, and whatever runs in it, alone; the page comes back
and takes up where it was. Only the shell's own end, or the core stopping,
ends a terminal.

Everything a terminal sends is numbered: each piece of output and each
marker gets the next number. The core keeps the last few megabytes, so a
page that lost its connection for a moment asks for everything after the
last number it has and the screen goes on as if nothing happened. A page
that comes back empty, after a reload, gets all that is kept, drawn again
from a clean screen; a full-screen program is then asked to redraw itself.

Each command becomes a block in the database: its text, the directory and
branch it ran in, how long it took, how it ended, and its output, compressed,
the beginning and the end of it if it was long.

From 0.0.5 the page can also type a whole command at the prompt (run), and
ask the machine, over a quiet side channel of the same SSH connection, what
a word under Tab can become and which directories and branches there are.

From 0.0.6 a terminal can be on a computer too, through its agent instead of
SSH; the terminal does it all the same way over either (see transport.py).

From 0.0.7 a computer's terminal waits for its agent when the agent goes
(the laptop sleeps, the network blinks): it stays open, away, takes no keys
meanwhile, and goes on where it was when the agent is back.

From 0.1.24 a terminal that a release of tTerm Web ended says so: "tTerm Web
was updated to 0.1.24." instead of "tTerm Web stopped.", on its tab and in
its machine's log; and Open a new terminal there starts in the folder it
was in.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import datetime as dt
import functools
import itertools
import json
import logging
import re
import time
import uuid
import zlib
from collections import deque
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Awaitable, Callable

import asyncpg
import asyncssh

from .. import __version__
from . import (accounts, complete, logs, search, shell, ssh, transport, trust,
               vault)
from .accounts import Person
from .signer_client import SignerClient
from .transport import LinkError

log = logging.getLogger("tterm.terminals")

#: Output kept for pages that come back after a moment away: they get all
#: they missed, if it is still kept.
KEEP_BYTES = 4 * 1024 * 1024
#: What a page that starts over draws: the last of the output, more than its
#: ten thousand lines of scrollback hold. After a flood (`yes`, a huge log)
#: the page catches up in a moment instead of drawing megabytes no one will
#: scroll back to.
REPLAY_BYTES = 1024 * 1024
#: Of a long command's output, the block keeps this much from the start and
#: this much from the end.
BLOCK_HEAD = 512 * 1024
BLOCK_TAIL = 512 * 1024
#: An ended terminal stays in memory this long, so a page can still show how
#: it ended; its blocks stay in the database.
KEEP_ENDED = 15 * 60
#: Typed before the shell is up, kept until it is.
PENDING_MAX = 64 * 1024
#: Roles that may open terminals; observers only watch. How many one person
#: may have open at once is their plan's ("terminals" in its limits).
CAN_OPEN = ("owner", "admin", "member")

#: Why the terminals open when the core stops end (Terminals.stop).
STOPPED = "tTerm Web stopped."
#: A release says so of the terminals the stop before it ended (0.1.24):
#: those that ended at most this long before it starts, the moments of a
#: restart. A longer wait, or a run that kept no version (one before
#: 0.1.24, gone back to), does not stretch it to earlier stops.
RESTART_WINDOW = "15 minutes"


def updated(version: str) -> str:
    """Why the terminals open when tTerm Web was updated ended (0.1.24)."""
    return f"tTerm Web was updated to {version}."


#: What deploying the shell scripts may take, at most.
DEPLOY_TIMEOUT = 20
#: A side script (Tab, the directory and branch lists) may take this long,
#: print this much, and this many may run at once on one terminal.
SIDE_TIMEOUT = 5
SIDE_MAX = 1024 * 1024
SIDE_AT_ONCE = 2
#: Of each block in the feed's first answer, the end of its output, this
#: much at most; the rest comes when the person asks for it.
FEED_TAIL = 64 * 1024
#: Blocks in one answer of the feed, at most.
FEED_MAX = 200
#: Commands in the history the input line gets.
HISTORY_MAX = 1000

MIN_COLS, MAX_COLS = 10, 1000
MIN_ROWS, MAX_ROWS = 3, 500

#: Control characters a command typed by the page may not carry. Escape
#: above all: it could end the bracketed paste the command is wrapped in
#: and type keys of its own.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
#: A command typed by run() that the shell has not answered after this long
#: never started: a quote or a heredoc left open, or a history expansion
#: that failed (bash then shows its prompt again without a marker).
TYPED_STALE = 3.0
#: What a terminal whose computer is away answers to a command.
AWAY = ("{name} is asleep or offline. This terminal waits for it and goes "
        "on where it was when it is back.")


def clean_command(command: str) -> str:
    """A command from the page as it will be typed: lines joined by \\n,
    control characters out. Checked for danger in this form, so that what
    is checked is what runs."""
    text = command.replace("\r\n", "\n").replace("\r", "\n").strip("\n")
    return _CONTROL.sub("", text)


class NotOpen(Exception):
    """The terminal is not running: nothing can be asked of its machine."""


@dataclass
class Event:
    seq: int
    #: "out" is bytes for the screen; "ev" is a marker, as a dict; "red", a
    #: command of it redacted in the machine's log (0.1.20), as a dict:
    #: pages hear it as an op of its own, which those from before ignore.
    kind: str
    data: bytes | dict


@dataclass
class Machine:
    id: uuid.UUID
    project_id: uuid.UUID
    code: str
    name: str
    host: str | None
    port: int | None
    login: str | None
    host_keys: list[str]
    ca_id: str | None
    #: A server is reached over SSH, a computer through its agent.
    kind: str = "server"
    #: A server's own principal, and whether its line is on the server yet
    #: (trust.py, from 0.0.12).
    principal: str | None = None
    own_line: bool = False
    #: How the core signs in (0.1.17): 'cert' (a certificate, as for Add
    #: machine), 'key' (the person's vault key, relayed over the page's
    #: socket), or 'mac' (a terminal on the person's Mac that runs ssh).
    login_method: str = "cert"
    #: For 'key': the vault key, with its public half for verifying the
    #: relayed signature.
    vault_key_id: uuid.UUID | None = None
    vault_public_key: str | None = None
    vault_fingerprint: str | None = None
    vault_key_name: str | None = None
    #: For a server behind a bastion: the jump host, reached the same way.
    jump_host: str | None = None
    jump_port: int | None = None
    jump_login: str | None = None
    jump_host_keys: list[str] = field(default_factory=list)
    #: For 'mac': the person's Mac (a computer) the ssh runs on, and what it
    #: runs ssh to.
    via_machine_id: uuid.UUID | None = None
    via_name: str | None = None
    ssh_target: str | None = None
    #: Added by the person (POST /api/machines/own), not with Add machine:
    #: always dialled the checked way (reach.py), also as a 'cert' server
    #: with no bastion.
    own_server: bool = False

    @property
    def label(self) -> str:
        return f"{self.code}/{self.name}"


@dataclass
class Block:
    """A command while it runs."""
    command: str
    cwd: str
    branch: str
    seq_start: int
    started_at: dt.datetime
    #: The width it ran at: the page draws its output again at this width.
    cols: int = 80
    author: dict | None = None
    started: float = field(default_factory=time.monotonic)
    head: bytearray = field(default_factory=bytearray)
    tail: deque = field(default_factory=deque)
    tail_bytes: int = 0
    total: int = 0
    #: The screen modes of everything before the kept tail.
    before_tail: shell.Modes = field(default_factory=shell.Modes)

    def add(self, data: bytes) -> None:
        self.total += len(data)
        room = BLOCK_HEAD - len(self.head)
        if room > 0:
            self.head += data[:room]
            self.before_tail.feed(data[:room])
            data = data[room:]
        if data:
            self.tail.append(data)
            self.tail_bytes += len(data)
            while self.tail_bytes - len(self.tail[0]) >= BLOCK_TAIL:
                dropped = self.tail.popleft()
                self.tail_bytes -= len(dropped)
                self.before_tail.feed(dropped)

    def output(self) -> tuple[bytes, bool]:
        """What is kept, and whether the middle was left out. Where it was,
        the screen is switched to the modes the tail began in: a full-screen
        program that started in the middle otherwise draws its end on the
        main screen, as a jumble."""
        tail = b"".join(self.tail)
        cut = len(self.head) + len(tail) < self.total
        before = self.before_tail
        if len(tail) > BLOCK_TAIL:
            before = before.copy()
            before.feed(tail[:-BLOCK_TAIL])
            tail, cut = tail[-BLOCK_TAIL:], True
        if not cut:
            return bytes(self.head) + tail, False
        at_head_end = shell.Modes()
        at_head_end.feed(bytes(self.head))
        return bytes(self.head) + at_head_end.switch_to(before) + tail, True


def clamp_size(cols: int, rows: int) -> tuple[int, int]:
    return (max(MIN_COLS, min(MAX_COLS, int(cols))),
            max(MIN_ROWS, min(MAX_ROWS, int(rows))))


#: A terminal's name, at most (0.1.1).
NAME_MAX = 40


def clean_name(name: object) -> str | None:
    """A terminal's name as its owner gives it: one line, 1 to 40
    characters, or None."""
    if not isinstance(name, str):
        return None
    try:
        name.encode("utf-8")
    except UnicodeEncodeError:
        return None
    name = accounts.one_line(name)
    return name if 1 <= len(name) <= NAME_MAX else None


def _code(text: str) -> int | None:
    return int(text) if text.isdigit() else None


class Terminal:
    """One shell on one machine."""

    def __init__(self, *, pool: asyncpg.Pool, signer: SignerClient,
                 owner: Person, machine: Machine, name: str,
                 cols: int, rows: int, agents=None, relay=None,
                 start_in: str = "",
                 session_id: uuid.UUID | None = None,
                 project_id: uuid.UUID | None = None) -> None:
        self.id = uuid.uuid4()
        self.pool = pool
        self.signer = signer
        #: The session that opened it (0.1.28, v3): a key server's login is
        #: signed only by that session's sockets.
        self.session_id = session_id
        #: Project this terminal is explicitly scoped to (or machine's default project)
        self.project_id = project_id or machine.project_id
        #: The connected agents, for a terminal on a computer.
        self.agents = agents
        #: The vault signing relay (vault.VaultRelay), for a 'key' server.
        self.relay = relay
        self.owner = owner
        self.machine = machine
        self.name = name
        self.cols, self.rows = clamp_size(cols, rows)
        #: connecting, open or ended.
        self.state = "connecting"
        self.reason: str | None = None
        self.exit_code: int | None = None
        self.opened_at = dt.datetime.now(dt.UTC)
        self.ended_at: float | None = None
        self.shell: str | None = None
        #: Whether this shell prints our markers; set by the first one seen.
        self.markers = False
        #: Whether it marks where each command starts too, so that the page
        #: can show blocks and type commands of its own (bash 4.4+, zsh).
        self.blocks = False
        self.cwd = ""
        self.home = ""
        self.branch = ""
        self.venv = ""
        #: The folder the shell starts in, when the login shell can be told
        #: (shell.start_in): the one the terminal it replaces was in.
        self._start_in = start_in
        #: The shell's PATH at its last prompt, for Tab on a command.
        self.path = ""

        self.events: deque[Event] = deque()
        self.first_seq = 1
        self.last_seq = 0
        self._kept = 0
        self.modes = shell.Modes()
        self._base_modes = shell.Modes()
        self.trimmed = False

        self._key = shell.new_key()
        self._parser = shell.MarkerParser(self._key)
        #: The way to the machine, and the shell running through it.
        self._link: transport.Link | None = None
        self._chan: transport.Channel | None = None
        self._pending = bytearray()
        self._block: Block | None = None
        self._next_author: dict | None = None
        self.ai_access: bool = True
        self.ai_mode: str = "execute"
        #: The last commands, to say which one a replay starts inside of.
        self._recent: deque[dict] = deque(maxlen=64)
        #: A command was typed by run() and the shell has not answered with a
        #: marker yet: no second one goes in on top of it.
        self._typed = False
        self._typed_at = 0.0
        self._side = asyncio.Semaphore(SIDE_AT_ONCE)
        self._saving: set[asyncio.Task] = set()
        self._tick = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._nudging = False
        #: Why it is being closed, once close() was asked; what it says then.
        self._closing: str | None = None
        #: While a 'key' server waits for a page socket to sign its login:
        #: the key it waits for, as the contract's "vault" field. None when
        #: nothing waits.
        self.vault_wait: dict | None = None
        #: The page typing into this terminal; see Watcher.
        self.active: "Watcher | None" = None

    # ------------------------------------------------------------- facts

    @property
    def label(self) -> str:
        return (self.machine.label if self.name == "1"
                else f"{self.machine.label} · {self.name}")

    @property
    def away(self) -> bool:
        """Open, and its machine out of reach for now: a computer whose
        agent went away. The shell waits there, and this for it."""
        return self.state == "open" and self._chan is not None and self._chan.away

    def set_next_author(self, author: dict | None) -> None:
        self._next_author = author

    def describe(self) -> dict:
        since = self._chan.since if self.away and self._chan is not None else None
        return {
            "id": str(self.id),
            "machineId": str(self.machine.id),
            "machine": self.machine.name,
            "projectId": str(self.project_id),
            "label": self.label,
            "name": self.name,
            "state": self.state,
            "reason": self.reason,
            "away": self.away,
            "awaySince": int(since * 1000) if since else None,
            "shell": self.shell,
            "markers": self.markers,
            "blocks": self.blocks,
            # Until its first prompt, the folder it is to start in (0.1.24).
            "cwd": self.cwd or self._start_in,
            "home": self.home,
            "branch": self.branch,
            "venv": self.venv,
            "running": self._running(),
            "vault": self.vault_wait,
            "openedAt": self.opened_at.isoformat(timespec="seconds"),
            "aiAccess": self.ai_access,
            "aiMode": self.ai_mode,
        }

    def _running(self) -> dict | None:
        """The command running now."""
        b = self._block
        if b is None:
            return None
        return {"command": b.command, "cwd": b.cwd, "branch": b.branch,
                "seqStart": b.seq_start, "cols": b.cols,
                "at": int(b.started_at.timestamp() * 1000),
                "author": b.author}

    def block_at(self, seq: int) -> dict | None:
        """The command whose output goes on past the number `seq`: a replay
        that starts there starts inside it, after its start marker, and the
        feed still has to know what it was."""
        for entry in reversed(self._recent):
            if entry["seqStart"] <= seq and (entry["seqEnd"] is None
                                             or entry["seqEnd"] > seq):
                return dict(entry)
        return None

    @property
    def tick(self) -> asyncio.Event:
        """Set once when anything changes; take it before looking, then wait."""
        return self._tick

    def _changed(self) -> None:
        self._tick.set()
        self._tick = asyncio.Event()

    # ------------------------------------------------------------ start

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name=f"terminal {self.id}")

    async def _run(self) -> None:
        m = self.machine
        # A terminal on the Mac that runs ssh (login_method 'mac') is
        # classic: it runs an argv, not the login shell, so it has no
        # markers and no blocks.
        classic_exec: list[str] | None = None
        markers = False
        # A server reached over SSH (not a computer's agent, not through the
        # Mac): its failures read as SSH ones.
        over_ssh = m.kind != "computer" and m.login_method != "mac"
        try:
            if m.kind == "computer":
                link = self.agents.get(m.id) if self.agents is not None else None
                if link is None:
                    await self._end(
                        f"{m.name} is not connected right now: its agent is not "
                        "running. Start the agent on that computer, then open "
                        "a terminal again.")
                    return
                self._link = link
            elif m.login_method == "mac":
                link = (self.agents.get(m.via_machine_id)
                        if self.agents is not None and m.via_machine_id else None)
                if link is None:
                    await self._end(
                        f"{m.via_name or 'The Mac'} is not connected right now. "
                        "Open it from the Mac, or start tTerm for Mac, then "
                        "open this terminal again.")
                    return
                self._link = link
                classic_exec = ["ssh", "--", m.ssh_target or ""]
            elif m.login_method == "key" or (m.login_method == "cert"
                                             and (m.jump_host or m.own_server)):
                # A server the person added, at a host they typed: the
                # address is checked at every opening (its name could point
                # elsewhere since), and the login is their vault key or a
                # certificate. connect_own does the bastion, if any.
                self._link = transport.SshLink(await self._connect_own(m))
            else:
                # As for Add machine: a 2-minute certificate for the server's
                # own principal (own cert machines without a bastion too).
                self._link = transport.SshLink(await trust.sign_in(
                    self.pool, self.signer,
                    trust.Server(m.id, m.label, m.host, m.port, m.host_keys,
                                 m.ca_id, m.principal, m.own_line,
                                 m.login or trust.LOGIN),
                    ssh.key_id(self.owner.name, str(self.owner.id), m.name)))
            if classic_exec is not None:
                self.shell = None
                self.blocks = False
                self._chan = await self._link.open(
                    None, self.cols, self.rows, echo=True,
                    exec_argv=classic_exec)
            else:
                how = await self._deploy()
                self.shell = how.shell
                self.blocks = how.blocks
                markers = how.markers
                # Echo starts off so the key never shows; the shell turns it
                # back on as soon as it has read the key.
                self._chan = await self._link.open(how.command, self.cols,
                                                   self.rows, echo=not markers)
            self._chan.on_change = self._changed
        except asyncio.CancelledError:
            raise
        except Exception as exc:        # noqa: BLE001 - every reason is shown
            log.info("terminal on %s did not open: %s", m.label, exc)
            await self._end(ssh.explain(exc, m.host or "", m.port or 0)
                            if over_ssh else
                            f"Could not open a terminal on {m.name}: {exc}")
            return
        finally:
            # However it ends, it is not waiting on the vault any more.
            self._set_vault_wait(False)
        if markers:
            self._chan.write(self._key.encode() + b"\n")
        if self._pending:
            self._chan.write(bytes(self._pending))
            self._pending.clear()
        self.state = "open"
        self._changed()
        await self._journal("terminal.opened", {"shell": self.shell})
        log.info("terminal opened on %s (%s)", m.label, self.shell)
        await self._read()

    def _set_vault_wait(self, waiting: bool) -> None:
        """Called by the relay while a 'key' server waits for a page socket
        to sign its login, and again when it goes on: the terminal shows it
        (the "vault" field) and pages hear it."""
        now = (self.vault_wait is not None)
        if waiting and not now:
            self.vault_wait = {
                "key": self.machine.vault_fingerprint,
                "keyName": self.machine.vault_key_name,
                "since": dt.datetime.now(dt.UTC).isoformat(timespec="seconds")}
            self._changed()
        elif not waiting and now:
            self.vault_wait = None
            self._changed()

    async def _connect_own(self, m: Machine) -> asyncssh.SSHClientConnection:
        """Signs in to a server the person added (ssh.connect_own): with
        their vault key (relayed) or a certificate, through a bastion when
        the machine has one. The jump uses the same way in."""
        who = ssh.key_id(self.owner.name, str(self.owner.id), m.name)

        def client_key() -> ssh.ClientKey:
            if m.login_method == "key":
                pub = asyncssh.import_public_key(m.vault_public_key)
                sign = functools.partial(
                    self.relay.sign_blob, public_key=m.vault_public_key,
                    user_id=self.owner.id, fingerprint=m.vault_fingerprint,
                    key_name=m.vault_key_name or "", machine=m.name,
                    machine_id=m.id, project_id=m.project_id,
                    waiting=self._set_vault_wait, session_id=self.session_id)

                async def key_factory():
                    return vault.RelayKeyPair(pub, sign)
                return key_factory

            async def cert_factory():
                return await self.signer.credentials(m.principal, who,
                                                     ca=m.ca_id)
            return cert_factory

        jump = None
        if m.jump_host:
            jump = {"host": m.jump_host, "port": m.jump_port or 22,
                    "login": m.jump_login or (m.login or trust.LOGIN),
                    "host_keys": m.jump_host_keys, "client_key": client_key()}
        limiter = self.relay.limiter if self.relay is not None else None
        if m.login_method == "key" and self.relay is not None:
            # A device that can sign first, however long the person takes to
            # open their vault; then the dial, with its own timeout (0.1.19).
            await self.relay.wait_capable(self.owner.id, m.vault_fingerprint,
                                          self._set_vault_wait,
                                          session_id=self.session_id)
        return await ssh.connect_own(
            host=m.host, port=m.port or 22, login=m.login or trust.LOGIN,
            host_keys=m.host_keys, client_key=client_key(), who=who,
            user_id=self.owner.id, limiter=limiter, jump=jump)

    async def _deploy(self) -> shell.Plan:
        """Puts the shell scripts on the machine and picks the shell.

        If that fails the login shell starts without them: the terminal
        works, only without blocks. Sending the key to a shell that does not
        expect it would type it in as a command.
        """
        assert self._link is not None

        # For Windows machines, skip Linux/bash deployment scripts and use PowerShell directly
        link_os = getattr(self._link, "os", "") or ""
        machine_os = getattr(self.machine, "os", "") or ""
        passport_os = ""
        if isinstance(getattr(self.machine, "passport", None), dict):
            passport_os = self.machine.passport.get("os", "")
        elif isinstance(getattr(self.machine, "passport", None), str):
            passport_os = self.machine.passport

        def _is_win(val: Any) -> bool:
            s = str(val or "").strip().lower()
            if "darwin" in s or "mac" in s or "apple" in s:
                return False
            return "windows" in s or s.startswith("win")

        if _is_win(link_os) or _is_win(machine_os) or _is_win(passport_os):
            return shell.Plan(shell="powershell", command="powershell.exe", markers=False, blocks=False)

        try:
            code, out, err = await self._link.script(shell.deploy_script(),
                                                     DEPLOY_TIMEOUT)
        except LinkError as exc:
            log.warning("could not put the shell scripts on %s: %s",
                        self.machine.label, exc)
            return shell.plan("")
        output = out.decode("utf-8", "replace")
        if code != 0 or "shell=" not in output:
            log.warning("could not put the shell scripts on %s: %s",
                        self.machine.label,
                        err.decode("utf-8", "replace").strip()[-300:])
            return shell.plan("")
        return shell.plan(output, self._start_in)

    # ------------------------------------------------------------ stream

    async def _read(self) -> None:
        chan = self._chan
        assert chan is not None
        reason = None
        try:
            while True:
                data = await chan.read()
                if not data:
                    break
                self._take(data)
        except asyncio.CancelledError:
            raise
        except transport.Gone as exc:
            reason = str(exc)
        except OSError as exc:
            reason = f"The connection to {self.machine.name} was lost: {exc}"
        held = self._parser.flush()
        if held:
            self._output(held)
        code = await chan.exit_code()
        if self._closing:
            reason = self._closing
        elif reason is None:
            if code is None:
                reason = f"The connection to {self.machine.name} was closed."
            else:
                reason = f"The shell ended with code {code}."
        await self._end(reason, code)

    def _take(self, data: bytes) -> None:
        for piece in self._parser.feed(data):
            if isinstance(piece, bytes):
                self._output(piece)
            else:
                self._marker(piece)
        self._changed()

    def _output(self, data: bytes) -> None:
        self.last_seq += 1
        self.events.append(Event(self.last_seq, "out", data))
        self._kept += len(data)
        self.modes.feed(data)
        if self._block is not None:
            self._block.add(data)
        while self._kept > KEEP_BYTES and len(self.events) > 1:
            old = self.events.popleft()
            self.first_seq = old.seq + 1
            self.trimmed = True
            if old.kind == "out":
                self._kept -= len(old.data)
                self._base_modes.feed(old.data)

    def _event(self, data: dict) -> None:
        self.last_seq += 1
        self.events.append(Event(self.last_seq, "ev", data))

    def _marker(self, m: shell.Marker) -> None:
        # Markers carry the core's clock, so that a page drawing them again
        # later still knows when each command started and ended.
        at = int(time.time() * 1000)
        if m.kind == "P":
            exit_code = _code(m.field(0))
            trim = 0
            if self._block is not None:
                trim = self._finish_block(exit_code)
            self._typed = False
            self.markers = True
            self.cwd, self.home, self.branch = m.field(1), m.field(2), m.field(3)
            self.venv, self.path = m.field(4), m.field(5)
            # trim: how much of the end of the block's output was zsh's
            # partial-line mark, which the block does not keep.
            self._event({"t": "P", "code": exit_code, "cwd": self.cwd,
                         "home": self.home, "branch": self.branch,
                         "venv": self.venv, "trim": trim, "at": at})
        elif m.kind == "C":
            prev = _code(m.field(1))
            if self._block is not None:
                # One line of several commands: the one before ended here.
                self._finish_block(prev)
            self._typed = False
            author = self._next_author
            self._next_author = None
            self._event({"t": "C", "command": m.field(0), "prev": prev,
                         "at": at, "author": author})
            self._block = Block(command=m.field(0), cwd=self.cwd,
                                branch=self.branch, seq_start=self.last_seq,
                                started_at=dt.datetime.now(dt.UTC),
                                cols=self.cols, author=author)
            self._recent.append({
                "command": m.field(0), "cwd": self.cwd, "branch": self.branch,
                "seqStart": self.last_seq, "seqEnd": None, "cols": self.cols,
                "at": at, "author": author})

    def _finish_block(self, exit_code: int | None) -> int:
        """Saves the running command's block; returns how many bytes of
        zsh's partial-line mark came off the end of its output."""
        block, self._block = self._block, None
        if block is None:
            return 0
        for entry in reversed(self._recent):
            if entry["seqStart"] == block.seq_start:
                entry["seqEnd"] = self.last_seq
                break
        output, cut = block.output()
        trim = 0
        if self.shell == "zsh":
            stripped = shell.strip_eol_mark(output, self.cols)
            trim = len(output) - len(stripped)
            output = stripped
        task = asyncio.create_task(self._save_block(
            block, exit_code, output, cut, self.last_seq,
            dt.datetime.now(dt.UTC)))
        self._saving.add(task)
        task.add_done_callback(self._saving.discard)
        return trim

    async def _save_block(self, block: Block, exit_code: int | None,
                          output: bytes, cut: bool, seq_end: int,
                          finished_at: dt.datetime) -> None:
        try:
            # What it printed as text, for search (0.1.7): a megabyte of
            # output is work, not for the event loop.
            text = await asyncio.to_thread(search.plain, output)
            # The block and its line in the machine's log (0.1.20) go in
            # together: a line is never without its block while the block
            # is kept, nor a block without its line.
            author_data = getattr(block, "author", None)
            author_val = json.dumps(author_data) if author_data else None
            async with self.pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO blocks (terminal_id, kind, seq_start, seq_end,
                                        command, started_by, started_at,
                                        finished_at, exit_code, cwd, branch,
                                        output, output_cut, cols, expires_at,
                                        output_text, author)
                    VALUES ($1, 'command', $2, $3, $4, $5, $6, $7, $8, $9, $10,
                            $11, $12, $14,
                            now() + make_interval(days => (
                                SELECT output_days FROM projects WHERE id = $13)),
                            $15, $16::jsonb)
                    """,
                    self.id, block.seq_start, seq_end, block.command,
                    self.owner.id, block.started_at, finished_at, exit_code,
                    block.cwd or None, block.branch or None,
                    zlib.compress(output, 6), cut, self.machine.project_id,
                    block.cols, text, author_val)
                await logs.command_ran(
                    conn, project_id=self.machine.project_id,
                    user_id=self.owner.id, machine_id=self.machine.id,
                    terminal_id=self.id, command=block.command,
                    seq=block.seq_start, started_at=block.started_at,
                    finished_at=finished_at, exit_code=exit_code,
                    cwd=block.cwd, branch=block.branch, home=self.home)
        except Exception:               # noqa: BLE001 - the screen goes on
            log.exception("could not save a block of terminal %s", self.id)

    # ------------------------------------------------------------ input

    def write(self, data: bytes) -> None:
        if self.state == "open" and self._chan is not None:
            self._chan.write(data)
        elif self.state == "connecting":
            room = PENDING_MAX - len(self._pending)
            if room > 0:
                self._pending += data[:room]

    def run(self, command: str) -> str | None:
        """Types a whole command at the shell's prompt and presses Enter, the
        way tTerm's own input line hands it over. Returns why not, or None.

        The command goes in as a bracketed paste when the shell has that on
        (bash 5.1+ and zsh do): the line editor then takes it as text, every
        line of it, with no key in it read as a binding, and Enter runs it
        all. Without it the text is typed as is.

        Ctrl+U goes first and empties the line. Keys typed into the previous
        command that it never read wait in the terminal, and the line editor
        takes them in at the prompt; they would end up in front of this
        command.
        """
        if self.state != "open" or self._chan is None:
            return "The terminal is not open."
        if self.away:
            return AWAY.format(name=self.machine.name)
        if not self.blocks:
            return ("This shell does not mark where commands start, so it "
                    "runs in the classic mode only.")
        if self._block is not None:
            return "A command is still running."
        if self._typed:
            if time.monotonic() - self._typed_at < TYPED_STALE:
                return "A command is still running."
            # The last one never started. Ctrl+C sets the shell back to an
            # empty prompt; whatever follows it in the same moment would be
            # thrown away by the terminal, so this command waits for Enter
            # again.
            self._chan.write(b"\x03")
            self._typed_at = time.monotonic()
            return ("The shell had not taken the last command (an open quote, "
                    "or a history expansion with ! that failed). It is "
                    "cancelled now: press Enter again.")
        text = clean_command(command)
        if not text.strip():
            return "There is no command to run."
        if self.modes.state.get(2004):
            data = b"\x15\x1b[200~" + text.encode() + b"\x1b[201~\r"
        else:
            data = b"\x15" + text.replace("\t", " ").encode() + b"\r"
        self._typed = True
        self._typed_at = time.monotonic()
        self._chan.write(data)
        return None

    def resize(self, cols: int, rows: int) -> None:
        cols, rows = clamp_size(cols, rows)
        if (cols, rows) == (self.cols, self.rows):
            return
        self.cols, self.rows = cols, rows
        if self.state == "open" and self._chan is not None:
            self._chan.resize(cols, rows)

    # -------------------------------------------------------- side channel

    async def side(self, script: str) -> list[str]:
        """Runs a small sh script on the machine on a channel of its own in
        the same SSH connection, or through the agent, and returns the lines
        it listed. The terminal itself never sees it. An empty list when it
        fails: Tab then simply finds nothing."""
        # A computer's terminal follows its agent from one connection to
        # the next: the way is the channel's, as it is now.
        chan = self._chan
        link = chan.link if chan is not None and chan.link is not None \
            else self._link
        if self.state != "open" or link is None:
            raise NotOpen("The terminal is not open.")
        if self.away:
            raise NotOpen(AWAY.format(name=self.machine.name))
        async with self._side:
            try:
                _, out, _ = await link.script(script, SIDE_TIMEOUT)
            except LinkError as exc:
                log.info("side script on %s failed: %s", self.machine.label, exc)
                return []
        return complete.listed(out[:SIDE_MAX])

    async def complete(self, line: str, cursor: int) -> dict:
        """What the word under the cursor can become."""
        cursor = max(0, min(len(line), int(cursor)))
        words, word = complete.split(line[:cursor])
        ctx = complete.context(words, word)
        items: list[dict] = []
        if ctx.kind == "command":
            names = await self.side(complete.commands_script(self.path,
                                                             word.value))
            items = complete.command_items(word, names)
        elif ctx.kind == "git":
            items = complete.git_items(word)
        if ctx.kind in ("branch", "branch+file"):
            refs = await self.side(complete.branches_script(self.cwd))
            items = complete.branch_items(word, refs, ctx.switch)
        if ctx.kind in ("file", "dir", "branch+file"):
            where, _, _ = complete.dir_part(word.value, self.home)
            entries = await self.side(complete.list_script(self.cwd, where))
            items += complete.file_items(word, entries, self.home,
                                         dirs_only=ctx.kind == "dir")
        return {"start": word.start, "end": cursor, "quote": word.quote,
                "kind": ctx.kind, "items": items[:complete.MAX_ITEMS],
                "more": len(items) > complete.MAX_ITEMS}

    async def dirs(self) -> dict:
        """The directories in the terminal's current one."""
        entries = await self.side(complete.list_script(self.cwd, "."))
        return {"cwd": self.cwd, "home": self.home,
                "dirs": complete.dirs_of(entries)}

    async def branches(self) -> dict:
        """The branches of the repository the terminal is in."""
        if not self.branch:
            return {"current": "", "local": [], "remote": []}
        refs = await self.side(complete.branches_script(self.cwd))
        return {"current": self.branch, **complete.branches_of(refs)}

    def nudge(self) -> None:
        """Asks a full-screen program to draw itself again: the window
        narrows by a column and back, which it hears as two resizes."""
        if self._nudging or self.state != "open" or self._chan is None:
            return
        self._nudging = True

        async def go() -> None:
            try:
                chan = self._chan
                if chan is None:
                    return
                chan.resize(max(MIN_COLS, self.cols - 1), self.rows)
                await asyncio.sleep(0.08)
                if self._chan is chan and self.state == "open":
                    chan.resize(self.cols, self.rows)
            except Exception:            # noqa: BLE001 - only a redraw
                pass
            finally:
                self._nudging = False

        asyncio.create_task(go())

    # ------------------------------------------------------------ replay

    def snapshot(self) -> tuple[int, bytes, list[Event]]:
        """What a page that starts over draws: the number the replay
        follows, the sequences that bring a clean screen to the modes the
        stream was in at that point, and the last REPLAY_BYTES of it."""
        events = list(self.events)
        start, size = 0, 0
        for i in range(len(events) - 1, -1, -1):
            if events[i].kind == "out":
                size += len(events[i].data)
                if size > REPLAY_BYTES:
                    start = i + 1
                    break
        modes = self._base_modes.copy()
        for e in events[:start]:
            if e.kind == "out":
                modes.feed(e.data)                # type: ignore[arg-type]
        cut = self.trimmed or start > 0
        events = events[start:]
        base = events[0].seq - 1 if events else self.last_seq
        if cut and events and events[0].kind == "out":
            # The replay may start inside a line or an escape sequence: it
            # starts at the next line instead.
            first = events[0].data
            assert isinstance(first, bytes)
            nl = first.find(b"\n", 0, 4096)
            if nl >= 0:
                modes.feed(first[:nl + 1])
                events[0] = Event(events[0].seq, "out", first[nl + 1:])
        return base, modes.restore(), events

    def events_after(self, seq: int) -> list[Event]:
        start = seq - self.first_seq + 1
        if start < 0:
            raise LookupError("no longer kept")
        return list(itertools.islice(self.events, start, None))

    def forget(self, seq_start: int, seq_end: int | None,
               redacted: dict) -> None:
        """A command of this terminal was redacted (0.1.20, logs.redact):
        what was typed and what it printed leave its memory too. All that is
        kept up to the command's end goes, as when a flood pushes it out, so
        a page that comes back starts over from what is left; the pages
        watching now hear it (op "redacted") and draw the block so."""
        end = seq_end
        for entry in self._recent:
            if entry["seqStart"] == seq_start:
                entry["command"] = ""
                # Its block expired meanwhile: where it ended, as kept here.
                if end is None:
                    end = entry["seqEnd"]
        if end is None:
            end = seq_start
        while self.events and self.events[0].seq <= end:
            old = self.events.popleft()
            self.first_seq = old.seq + 1
            self.trimmed = True
            if old.kind == "out":
                assert isinstance(old.data, bytes)
                self._kept -= len(old.data)
                self._base_modes.feed(old.data)
        self.last_seq += 1
        self.events.append(Event(self.last_seq, "red",
                                 {"block": seq_start, **redacted}))
        self._changed()

    # ------------------------------------------------------------ end

    async def close(self, reason: str = "Closed.") -> None:
        """Ends the terminal: the shell gets a hangup, as when a window
        closes. `reason` is what the terminal then says."""
        if self.state == "ended":
            return
        self._closing = reason
        if self._chan is not None:
            self._chan.close()
        if self._task is not None and self.state == "connecting":
            self._task.cancel()
            with contextlib.suppress(BaseException):
                await self._task
            await self._end("Closed before it opened." if reason == "Closed."
                            else reason)
            return
        if self._task is not None:
            with contextlib.suppress(BaseException):
                await asyncio.wait_for(asyncio.shield(self._task), 3)
        if self.state != "ended":
            await self._end(reason)

    async def stop(self, reason: str) -> None:
        """The core is stopping: the shell ends with it."""
        if self.state == "ended":
            return
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(BaseException):
                await self._task
        await self._end(reason)

    async def _end(self, reason: str, code: int | None = None) -> None:
        if self.state == "ended":
            return
        if self._block is not None:
            self._finish_block(code)
        self.state = "ended"
        self.reason = reason
        self.exit_code = code
        self.ended_at = time.monotonic()
        if self._chan is not None:
            self._chan.close()
        if self._link is not None:
            self._link.release()
        self._chan = None
        self._changed()
        # Its end goes in first, the moment it is known: a core stopping has
        # only seconds (Core.stop), and the next start closes what is left
        # open without it. And the folder it was in, or was to start in:
        # Open a new terminal starts there (0.1.24).
        try:
            await self.pool.execute(
                "UPDATE terminals SET closed_at = now(), last_seq = $2, "
                "end_reason = $3, shell = $4, home = $5, last_cwd = $6 "
                "WHERE id = $1",
                self.id, self.last_seq, reason[:500], self.shell,
                self.home or None, (self.cwd or self._start_in) or None)
        except Exception:               # noqa: BLE001
            log.exception("could not record the end of terminal %s", self.id)
        # Its line in the log after the lines of its last commands.
        if self._saving:
            await asyncio.wait(set(self._saving), timeout=5)
        await self._journal("terminal.closed", {"reason": reason[:500]})
        log.info("terminal on %s ended: %s", self.machine.label, reason)

    async def _journal(self, kind: str, details: dict) -> None:
        try:
            async with self.pool.acquire() as conn:
                await accounts.journal(
                    conn, kind, project_id=self.machine.project_id,
                    user_id=self.owner.id, machine_id=self.machine.id,
                    terminal_id=self.id, details=details)
        except Exception:               # noqa: BLE001
            log.exception("could not write %s to the journal", kind)


class NotAllowed(Exception):
    """No such machine, or not one this person may open terminals on."""


class KeysClosed(Exception):
    """The machine is reached only with the keys open on the device asking,
    and they are not (0.1.28, vault-design.md v3): its name, for the page."""

    def __init__(self, machine: str) -> None:
        super().__init__(f"The keys are not open on this device: open them "
                         f"to reach {machine}.")
        self.machine = machine


def _ms(when: dt.datetime | None) -> int | None:
    return int(when.timestamp() * 1000) if when else None


def _block_json(row: asyncpg.Record) -> dict:
    """A finished block for the page: the end of its output only, starting
    at a line, if it is long.

    That end begins in the screen modes the output was in at that point. A
    full-screen program (htop, top, vim) switches to its second screen at
    the start, which the end leaves out: without the switch the page drew
    its last screens on the main one, a jumble of numbers where the live
    block had been empty."""
    output = zlib.decompress(row["output"]) if row["output"] else b""
    size = len(output)
    tail, partial = output, False
    if size > FEED_TAIL:
        start = size - FEED_TAIL
        nl = output.find(b"\n", start)
        at = nl + 1 if 0 <= nl < size - 1 else start
        modes = shell.Modes()
        modes.feed(output[:at])
        tail = modes.restore() + output[at:]
        partial = True
    raw_author = dict(row).get("author") if "author" in row else None
    if isinstance(raw_author, str):
        try:
            author = json.loads(raw_author)
        except Exception:
            author = {"name": raw_author, "kind": "user"}
    else:
        author = raw_author
    return {
        "id": row["id"],
        "seqStart": row["seq_start"],
        "seqEnd": row["seq_end"],
        "command": row["command"] or "",
        "cwd": row["cwd"] or "",
        "branch": row["branch"] or "",
        "startedAt": _ms(row["started_at"]),
        "finishedAt": _ms(row["finished_at"]),
        "exitCode": row["exit_code"],
        "cols": row["cols"],
        "cut": row["output_cut"],
        "partial": partial,
        "size": size,
        "author": author,
        "output": base64.b64encode(tail).decode("ascii"),
    }


class Terminals:
    """The live terminals of this core, everyone's. Each belongs to whoever
    opened it, and only they see it: every way in takes the person asking."""

    def __init__(self, pool: asyncpg.Pool, signer: SignerClient,
                 agents=None, relay=None) -> None:
        self.pool = pool
        self.signer = signer
        #: The connected agents (agents.Agents), for terminals on computers.
        self.agents = agents
        #: The vault signing relay (vault.VaultRelay), for 'key' servers.
        self.relay = relay
        self._live: dict[uuid.UUID, Terminal] = {}
        #: One opening at a time per person, so that their count holds.
        self._opening: dict[uuid.UUID, asyncio.Lock] = {}
        self._sweeper: asyncio.Task | None = None
        #: Makes the text to search of blocks from before 0.1.7, once.
        self._filler: asyncio.Task | None = None
        #: The most terminals open at once since the last look (peaks), in
        #: all and for one person: the usage counts take them hourly.
        self._peak = 0
        self._peak_one = 0

    async def start(self, version: str = __version__) -> None:
        """Terminals do not outlive the core: any left open by the last run
        ended with it (see close_left)."""
        await self.close_left(version)
        self._sweeper = asyncio.create_task(self._sweep())
        self._filler = asyncio.create_task(self._fill())

    async def close_left(self, version: str) -> None:
        """Closes the terminals the last run left open, each with its line
        in its machine's log, and keeps this start and its version (0.1.24).

        A start of another version than the run before it is a release: the
        terminals the stop of that run ended (RESTART_WINDOW), and any it
        left open, say "tTerm Web was updated to 0.1.24." instead of "tTerm
        Web stopped.", on their tabs (ended() gives the page what the
        database has) and in the machine's log. The same version again is a
        restart, and says what it always did."""
        async with self.pool.acquire() as conn, conn.transaction():
            last = await conn.fetchrow(
                "SELECT version, started_at FROM core_runs "
                "ORDER BY id DESC LIMIT 1")
            await conn.execute("INSERT INTO core_runs (version) VALUES ($1)",
                               version)
            release = last is None or last["version"] != version
            reason = updated(version) if release else STOPPED
            # Left open: a stop that ran out of time, or a crash. Their line
            # in the log is at this start.
            await conn.execute(
                """
                WITH closed AS (
                    UPDATE terminals SET closed_at = now(), end_reason = $1
                    WHERE closed_at IS NULL
                    RETURNING id, machine_id, owner_id)
                INSERT INTO journal (project_id, user_id, kind, machine_id,
                                     terminal_id, details, expires_at)
                SELECT m.project_id, c.owner_id, 'terminal.closed', c.machine_id,
                       c.id, jsonb_build_object('reason', $1::text),
                       now() + make_interval(days => COALESCE(
                           p.journal_days, $2))
                FROM closed c
                JOIN machines m ON m.id = c.machine_id
                JOIN projects p ON p.id = m.project_id
                """, reason, accounts.PERSONAL_JOURNAL_DAYS)
            if release:
                # Those the last run's stop ended: after it started (those
                # its own start closed have its very moment), and moments
                # before this one.
                await conn.execute(
                    "UPDATE terminals SET end_reason = $1 "
                    "WHERE end_reason = $2 "
                    "AND closed_at > coalesce($3::timestamptz, '-infinity') "
                    f"AND closed_at > now() - interval '{RESTART_WINDOW}'",
                    reason, STOPPED, last["started_at"] if last else None)

    async def _fill(self) -> None:
        try:
            await search.fill_texts(self.pool)
        except asyncio.CancelledError:
            raise
        except Exception:               # noqa: BLE001 - search waits, nothing else
            log.exception("could not make the text of earlier blocks for search")

    async def open(self, person: Person, machine_id: uuid.UUID, cols: int,
                   rows: int, cwd: str = "", *,
                   session_id: uuid.UUID | None = None,
                   closed=None,
                   project_id: uuid.UUID | None = None) -> Terminal:
        """A new terminal on the machine. `cwd` (0.1.24): the folder to start
        in, the one the terminal it replaces was in; where the login shell
        cannot be told, or the folder is gone, it starts at home.
        `session_id` (0.1.28): the session asking, whose sockets alone sign
        a key server's login; `closed(machine)`, whether the keys are closed
        on that device for this machine: KeysClosed then, and nothing is
        opened. `project_id`: explicitly scopes terminal to a project."""
        lock = self._opening.setdefault(person.id, asyncio.Lock())
        async with lock:
            machine = await self._machine(machine_id, person.id)
            if closed is not None and closed(machine):
                raise KeysClosed(machine.name)
            plan, most = await accounts.limit(self.pool, person.id, "terminals")
            count = len(self.live(person.id))
            if most is not None and count >= most:
                raise NotAllowed(f"You have {count} terminals open, and the "
                                 f"{plan} plan allows {most}. End one to open "
                                 "another.")
            used = {t.name for t in self._live.values()
                    if t.machine.id == machine.id and t.state != "ended"}
            name = str(next(n for n in itertools.count(1)
                            if str(n) not in used))
            terminal = Terminal(pool=self.pool, signer=self.signer,
                                owner=person, machine=machine, name=name,
                                cols=cols, rows=rows, agents=self.agents,
                                relay=self.relay, start_in=cwd,
                                session_id=session_id,
                                project_id=project_id)
            await self.pool.execute(
                "INSERT INTO terminals (id, machine_id, owner_id, name, kind) "
                "VALUES ($1, $2, $3, $4, 'term')",
                terminal.id, machine.id, person.id, name)
            self._live[terminal.id] = terminal
            self._peak = max(self._peak, self.open_count())
            self._peak_one = max(self._peak_one, len(self.live(person.id)))
            try:
                from ..orchestration.machines_projects import machine_project_manager
                machine_project_manager.set_terminal_project(
                    terminal_id=str(terminal.id),
                    project_id=str(terminal.project_id),
                    machine_id=str(machine.id),
                )
            except Exception as exc:
                log.debug("machine_project_manager.set_terminal_project failed: %s", exc)
        terminal.start()
        return terminal

    def open_count(self) -> int:
        """Terminals that have not ended, everyone's."""
        return sum(1 for t in self._live.values() if t.state != "ended")

    def _now(self) -> tuple[int, int]:
        """Terminals open now, in all and the most for one person."""
        one = max((len(self.live(owner)) for owner in
                   {t.owner.id for t in self._live.values()}), default=0)
        return self.open_count(), one

    def peaks(self) -> tuple[int, int]:
        """The most terminals open at once since the peaks started again,
        in all and for one person."""
        now, one = self._now()
        return max(self._peak, now), max(self._peak_one, one)

    def restart_peaks(self) -> None:
        """The peaks count again from what is open now: once they are
        written down."""
        self._peak, self._peak_one = self._now()

    async def _machine(self, machine_id: uuid.UUID,
                       user_id: uuid.UUID) -> Machine:
        row = await self.pool.fetchrow(
            """
            SELECT m.id, m.project_id, p.code, m.name, m.host, m.port, m.login,
                   m.host_keys, m.ca_id, m.kind, m.principal, m.own_line,
                   m.login_method, m.vault_key_id, m.jump_host, m.jump_port,
                   m.jump_login, m.jump_host_keys, m.via_machine_id,
                   m.ssh_target, m.own_server,
                   vk.public_key AS vault_public_key,
                   vk.fingerprint AS vault_fingerprint, vk.name AS vault_key_name,
                   vk.removed_at AS vault_key_removed, via.name AS via_name,
                   via.removed_at AS via_removed
            FROM machines m
            JOIN projects p ON p.id = m.project_id
            JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
            LEFT JOIN vault_keys vk ON vk.id = m.vault_key_id
            LEFT JOIN machines via ON via.id = m.via_machine_id
            WHERE m.id = $1 AND m.removed_at IS NULL
              AND pm.role = ANY($3::text[])
              AND (pm.until IS NULL OR pm.until > now())
            """, machine_id, user_id, list(CAN_OPEN))
        if row is None:
            raise NotAllowed("No such machine.")
        if row["login_method"] == "key" and (row["vault_key_id"] is None
                                              or row["vault_key_removed"]
                                              is not None):
            raise NotAllowed(
                "This server opens with a key from your vault, and that key "
                "was removed. Choose another way to open it.")
        return Machine(
            row["id"], row["project_id"], row["code"], row["name"],
            row["host"], row["port"], row["login"], list(row["host_keys"]),
            row["ca_id"], row["kind"], row["principal"], row["own_line"],
            login_method=row["login_method"], vault_key_id=row["vault_key_id"],
            vault_public_key=row["vault_public_key"],
            vault_fingerprint=row["vault_fingerprint"],
            vault_key_name=row["vault_key_name"],
            jump_host=row["jump_host"], jump_port=row["jump_port"],
            jump_login=row["jump_login"],
            jump_host_keys=list(row["jump_host_keys"] or []),
            via_machine_id=row["via_machine_id"], via_name=row["via_name"],
            ssh_target=row["ssh_target"], own_server=row["own_server"])

    async def machine_of(self, terminal_id: uuid.UUID,
                         user_id: uuid.UUID) -> SimpleNamespace | None:
        """The machine of the person's terminal, running or ended: what the
        check of open keys needs (0.1.28), or None for no such terminal."""
        row = await self.pool.fetchrow(
            "SELECT m.id, m.name, m.kind, m.login_method, m.via_machine_id "
            "FROM terminals t JOIN machines m ON m.id = t.machine_id "
            "WHERE t.id = $1 AND t.owner_id = $2", terminal_id, user_id)
        return SimpleNamespace(**dict(row)) if row is not None else None

    def get(self, terminal_id: uuid.UUID, user_id: uuid.UUID) -> Terminal | None:
        """The person's terminal: someone else's is as if it were not."""
        t = self._live.get(terminal_id)
        if t is None or t.owner.id != user_id:
            return None
        return t

    def live(self, user_id: uuid.UUID) -> list[Terminal]:
        return sorted((t for t in self._live.values()
                       if t.state != "ended" and t.owner.id == user_id),
                      key=lambda t: t.opened_at)

    async def ended(self, terminal_id: uuid.UUID,
                    user_id: uuid.UUID) -> dict | None:
        """A terminal no longer in memory, as the database remembers it."""
        row = await self.pool.fetchrow(
            """
            SELECT t.id, t.name, t.closed_at, t.end_reason, t.home,
                   t.last_cwd, m.id AS machine_id, m.name AS machine, p.code
            FROM terminals t
            JOIN machines m ON m.id = t.machine_id
            JOIN projects p ON p.id = m.project_id
            WHERE t.id = $1 AND t.owner_id = $2
            """, terminal_id, user_id)
        if row is None:
            return None
        label = f"{row['code']}/{row['machine']}"
        if row["name"] and row["name"] != "1":
            label += f" · {row['name']}"
        return {"id": str(row["id"]), "machineId": str(row["machine_id"]),
                "machine": row["machine"], "label": label,
                "name": row["name"], "state": "gone", "home": row["home"] or "",
                # The folder it ended in (0.1.24), for Open a new terminal.
                "cwd": row["last_cwd"] or "",
                "reason": row["end_reason"] or "This terminal is no longer running."}

    # ------------------------------------------------- blocks and history

    async def _owned(self, terminal_id: uuid.UUID,
                     user_id: uuid.UUID) -> asyncpg.Record | None:
        return await self.pool.fetchrow(
            """
            SELECT t.id, t.machine_id, m.project_id
            FROM terminals t JOIN machines m ON m.id = t.machine_id
            WHERE t.id = $1 AND t.owner_id = $2
            """, terminal_id, user_id)

    async def feed(self, terminal_id: uuid.UUID, user_id: uuid.UUID,
                   before: int | None, limit: int) -> dict | None:
        """The terminal's finished blocks, the latest `limit` of those that
        started before the number `before`, oldest first. Each with the end
        of its output; None if the terminal is not this person's."""
        if await self._owned(terminal_id, user_id) is None:
            return None
        limit = max(1, min(FEED_MAX, int(limit)))
        rows = await self.pool.fetch(
            """
            SELECT id, seq_start, seq_end, command, cwd, branch, started_at,
                   finished_at, exit_code, output, output_cut, cols, author
            FROM blocks
            WHERE terminal_id = $1 AND kind = 'command' AND expires_at > now()
              AND ($2::bigint IS NULL OR seq_start < $2)
            ORDER BY seq_start DESC
            LIMIT $3
            """, terminal_id, before, limit + 1)
        more = len(rows) > limit
        rows = list(reversed(rows[:limit]))
        # Unpacking a few megabytes is work: not in the event loop.
        blocks = await asyncio.to_thread(lambda: [_block_json(r) for r in rows])
        # Each block's line in the machine's log (0.1.20): the notes under
        # it, and who redacted it if someone did.
        lines = await logs.of_blocks(self.pool, terminal_id, user_id,
                                     [r["seq_start"] for r in rows])
        for b in blocks:
            line = lines.get(b["seqStart"])
            b.update(line if line is not None else
                     {"entry": None, "notes": [], "redacted": None,
                      "canNote": False})
        return {"blocks": blocks, "more": more}

    async def block_output(self, terminal_id: uuid.UUID, user_id: uuid.UUID,
                           seq_start: int) -> tuple[bytes, bool] | None:
        """All a block kept of its output, and whether its middle was cut."""
        row = await self.pool.fetchrow(
            """
            SELECT b.output, b.output_cut
            FROM blocks b JOIN terminals t ON t.id = b.terminal_id
            WHERE b.terminal_id = $1 AND t.owner_id = $2 AND b.seq_start = $3
              AND b.expires_at > now()
            """, terminal_id, user_id, seq_start)
        if row is None:
            return None
        data = row["output"] or b""
        output = await asyncio.to_thread(zlib.decompress, data) if data else b""
        return output, row["output_cut"]

    async def history(self, terminal_id: uuid.UUID, user_id: uuid.UUID,
                      hidden: list[uuid.UUID] | None = None) -> list[dict] | None:
        """The commands for the input line's history, newest first: those
        run on this terminal's machine, then the rest of its project's;
        only the person's own. None of the `hidden` machines' (0.1.28: the
        ones closed to the device asking)."""
        owned = await self._owned(terminal_id, user_id)
        if owned is None:
            return None
        rows = await self.pool.fetch(
            """
            SELECT b.command, bool_or(t.machine_id = $2) AS here
            FROM blocks b
            JOIN terminals t ON t.id = b.terminal_id
            JOIN machines m ON m.id = t.machine_id
            WHERE t.owner_id = $1 AND m.project_id = $3
              AND b.command IS NOT NULL AND b.command <> ''
              AND b.expires_at > now()
              AND NOT (m.id = ANY($5::uuid[]))
            GROUP BY b.command
            ORDER BY bool_or(t.machine_id = $2) DESC, max(b.started_at) DESC
            LIMIT $4
            """, user_id, owned["machine_id"], owned["project_id"],
            HISTORY_MAX, list(hidden or []))
        return [{"command": r["command"], "here": r["here"]} for r in rows]

    async def rename(self, terminal_id: uuid.UUID, user_id: uuid.UUID,
                     name: object) -> Terminal:
        """The person's terminal named as they like (0.1.1): the sidebar,
        the tab and the project's page show it. NotOpen if it is not
        running; NotAllowed with a name that will not do."""
        terminal = self.get(terminal_id, user_id)
        if terminal is None:
            raise LookupError("No such terminal.")
        if terminal.state == "ended":
            raise NotOpen("The terminal is not running any more.")
        cleaned = clean_name(name)
        if cleaned is None:
            raise NotAllowed(f"Name the terminal: up to {NAME_MAX} characters.")
        if cleaned.isdigit():
            # Numbers are how terminals go before they are named: 1 shows
            # as the machine alone, and a 2 would look like another one.
            raise NotAllowed("A name needs a letter in it: numbers alone are "
                             "how tTerm counts terminals.")
        if cleaned != terminal.name:
            await self.pool.execute(
                "UPDATE terminals SET name = $2 WHERE id = $1",
                terminal.id, cleaned)
            terminal.name = cleaned
            terminal._changed()
        return terminal

    def retag(self, machine_id: uuid.UUID, project_id: uuid.UUID, code: str,
              name: str) -> None:
        """A machine moved to another project (projects.move_machine): its
        running terminals go by the new project, its code and the machine's
        name there."""
        for t in self._live.values():
            if t.machine.id == machine_id:
                t.machine.project_id = project_id
                t.machine.code = code
                t.machine.name = name
                t._changed()

    def forget(self, terminal_id: uuid.UUID, seq_start: int,
               seq_end: int | None, redacted: dict) -> None:
        """A command was redacted in the log: if its terminal is in memory,
        it forgets the command too (Terminal.forget)."""
        t = self._live.get(terminal_id)
        if t is not None:
            t.forget(seq_start, seq_end, redacted)

    def recode(self, project_id: uuid.UUID, code: str) -> None:
        """The project's code changed: its terminals' labels follow."""
        for t in self._live.values():
            if t.machine.project_id == project_id and t.machine.code != code:
                t.machine.code = code
                t._changed()

    async def end_machine(self, machine_id: uuid.UUID, reason: str) -> None:
        """Ends every terminal of a machine that was removed, saying why."""
        await asyncio.gather(*(t.close(reason) for t in list(self._live.values())
                               if t.machine.id == machine_id
                               and t.state != "ended"),
                             return_exceptions=True)

    async def stop(self) -> None:
        for task in (self._sweeper, self._filler):
            if task is not None:
                task.cancel()
                with contextlib.suppress(BaseException):
                    await task
        await asyncio.gather(*(t.stop(STOPPED)
                               for t in list(self._live.values())),
                             return_exceptions=True)

    async def _sweep(self) -> None:
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            for tid, t in list(self._live.items()):
                if t.ended_at is not None and now - t.ended_at > KEEP_ENDED:
                    del self._live[tid]


# ------------------------------------------------------------- watching

Send = Callable[[bytes | str], Awaitable[None]]

#: Binary frames: one byte of kind, four of channel, eight of number.
OUTPUT, INPUT = 1, 2
#: Output sent in one frame, at most.
FRAME_MAX = 256 * 1024


def output_frame(channel: int, seq: int, data: bytes) -> bytes:
    return (bytes([OUTPUT]) + channel.to_bytes(4, "big") + seq.to_bytes(8, "big")
            + data)


class Watcher:
    """One page's view of one terminal, over that page's socket.

    It sends what the page has not seen yet, in order, at the page's pace:
    nothing piles up in memory for a slow page. If it falls so far behind
    that the oldest of what it needs is no longer kept, it starts over from
    what is kept, the way a terminal catches up after a flood.

    Of several pages on one terminal, only the active one types: the one
    the person last clicked into. The page's terminal answers questions
    programs ask it (where is the cursor, what colours), and two pages would
    answer twice; in vim, a second answer reads as keys.
    """

    def __init__(self, terminal: Terminal, channel: int, send: Send,
                 after: int | None) -> None:
        self.terminal = terminal
        self.channel = channel
        self._send = send
        self._after = after
        self.sent = -1
        self._state_sent: tuple | None = None
        self._resume = asyncio.Event()
        self._resume.set()
        if terminal.active is None:
            terminal.active = self
        self.task = asyncio.create_task(self._run())

    def focus(self) -> None:
        self.terminal.active = self

    def write(self, data: bytes) -> None:
        t = self.terminal
        if t.active is None:
            t.active = self
        if t.active is self:
            t.write(data)

    def pause(self) -> None:
        self._resume.clear()

    def resume(self) -> None:
        self._resume.set()

    async def stop(self) -> None:
        if self.terminal.active is self:
            self.terminal.active = None
        self.task.cancel()
        with contextlib.suppress(BaseException):
            await self.task

    async def _run(self) -> None:
        try:
            await self._watch()
        except asyncio.CancelledError:
            raise
        except Exception as exc:        # noqa: BLE001 - the page went away
            log.debug("watcher of %s stopped: %r", self.terminal.id, exc)

    async def _watch(self) -> None:
        t = self.terminal
        after = self._after
        if after is not None and t.first_seq - 1 <= after <= t.last_seq:
            self.sent = after
            await self._json({"op": "attached", "ch": self.channel,
                              "terminal": t.describe(), "resumed": True})
            # What came since, then the mark that it is all old news: the
            # page's terminal must not answer questions programs asked in
            # it, as on a replay. A flood during the await above may have
            # pushed that out of what is kept: then a replay instead.
            try:
                new = t.events_after(self.sent)
            except LookupError:
                await self._replay()
            else:
                if new:
                    await self._events(new)
                await self._json({"op": "replayed", "ch": self.channel,
                                  "seq": self.sent})
        else:
            await self._json({"op": "attached", "ch": self.channel,
                              "terminal": t.describe(), "resumed": False})
            await self._replay()
        while True:
            tick = t.tick
            await self._resume.wait()
            if self.sent < t.first_seq - 1:
                await self._replay()
                continue
            new = t.events_after(self.sent)
            if new:
                await self._events(new)
                continue
            await self._state()
            await tick.wait()

    async def _replay(self) -> None:
        t = self.terminal
        base, prefix, events = t.snapshot()
        # The replay may begin inside a command, after its start marker: the
        # feed needs to know which, to put its output under it.
        await self._json({"op": "reset", "ch": self.channel, "seq": base,
                          "running": t.block_at(base)})
        if prefix:
            await self._send(output_frame(self.channel, base, prefix))
        self.sent = base
        await self._events(events)
        # The page draws history now, not live output: whatever its terminal
        # answers to old questions in it must not reach the shell.
        await self._json({"op": "replayed", "ch": self.channel,
                          "seq": self.sent})
        if t.modes.alt_screen:
            t.nudge()

    async def _events(self, events: list[Event]) -> None:
        run: list[bytes] = []
        size = 0
        seq = self.sent
        for e in events:
            if e.kind == "out":
                assert isinstance(e.data, bytes)
                if run and size + len(e.data) > FRAME_MAX:
                    await self._send(output_frame(self.channel, seq,
                                                  b"".join(run)))
                    self.sent = seq
                    run, size = [], 0
                run.append(e.data)
                size += len(e.data)
                seq = e.seq
            else:
                if run:
                    await self._send(output_frame(self.channel, seq,
                                                  b"".join(run)))
                    self.sent = seq
                    run, size = [], 0
                op = "redacted" if e.kind == "red" else "ev"
                await self._json({"op": op, "ch": self.channel, "seq": e.seq,
                                  **e.data})
                seq = self.sent = e.seq
        if run:
            await self._send(output_frame(self.channel, seq, b"".join(run)))
            self.sent = seq

    async def _state(self) -> None:
        t = self.terminal
        waiting = t.vault_wait.get("since") if t.vault_wait else None
        now = (t.state, t.reason, t.markers, t.shell, t.away, t.label, waiting)
        if now != self._state_sent:
            self._state_sent = now
            await self._json({"op": "state", "ch": self.channel,
                              "terminal": t.describe()})

    async def _json(self, message: dict) -> None:
        await self._send(json.dumps(message, ensure_ascii=False,
                                    separators=(",", ":")))

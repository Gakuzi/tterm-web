"""How a terminal reaches its machine: over SSH to a server, or through the
agent on a computer (from 0.0.6).

A terminal does not care which. Over both it starts its shell in a terminal
of the page's size, types into it, reads what it prints, resizes it, and
asks the machine small sh scripts on the side: the shell scripts going into
~/.tterm before the shell starts, Tab, the lists of directories and branches.

A server gets an SSH connection of its own for each terminal. A computer
has one agent connection for all of them (see agents.py); ending a terminal
there ends its shell, never the connection. From 0.0.7 a computer's
terminals outlive that connection too: they wait, away, for the agent to
come back, and go on over its next one.
"""
from __future__ import annotations

import asyncio
import contextlib
from typing import Callable

import asyncssh

#: Read from a shell at a time, at most.
READ_CHUNK = 65536


class LinkError(Exception):
    """A script could not run on the machine, or its connection is gone."""


class Gone(ConnectionError):
    """The shell is gone, and the message says why as a whole sentence."""


class Channel:
    """A running shell in a terminal, as the terminal uses it."""

    #: The way to the machine, when the channel can move from one to the
    #: next: a computer's terminal follows its agent's connections. None
    #: when it has one for good.
    link: "Link | None" = None
    #: Out of reach for now, since when (time.time()): the machine went away
    #: and the shell waits for it there, as this does here.
    away: bool = False
    since: float | None = None
    #: Called when it goes away or comes back.
    on_change: "Callable[[], None] | None" = None

    def write(self, data: bytes) -> None:
        raise NotImplementedError

    async def read(self) -> bytes:
        """The next output; b"" once the shell has ended. Raises
        ConnectionError, with the reason, when the connection is lost."""
        raise NotImplementedError

    def resize(self, cols: int, rows: int) -> None:
        raise NotImplementedError

    def close(self) -> None:
        """Ends the shell: it gets a hangup, as when a window closes."""
        raise NotImplementedError

    async def exit_code(self) -> int | None:
        """How the shell ended, once it has; None if that is not known."""
        raise NotImplementedError


class Link:
    """A way to one machine."""

    async def script(self, text: str, timeout: float) -> tuple[int | None, bytes, bytes]:
        """Runs `sh -s` with this script, outside any terminal: the exit
        code, what it printed and what it complained about. Raises LinkError
        when it could not run at all."""
        raise NotImplementedError

    async def open(self, command: str, cols: int, rows: int, echo: bool,
                   exec_argv: list[str] | None = None) -> Channel:
        """Starts the shell command in a new terminal of this size. Echo
        off at the start keeps the one-time key from showing; the shell's
        scripts turn it back on once they have read it.

        `exec_argv` (from 0.1.17, agent only) runs that argument list
        directly instead of the login shell with `command`: a terminal on
        the person's Mac that runs `ssh -- <target>` for a server opened
        "from anywhere" through the Mac."""
        raise NotImplementedError

    def release(self) -> None:
        """The terminal is done with this way to the machine."""
        raise NotImplementedError


# ------------------------------------------------------------------- SSH

class SshChannel(Channel):
    def __init__(self, proc: asyncssh.SSHClientProcess) -> None:
        self.proc = proc

    def write(self, data: bytes) -> None:
        self.proc.stdin.write(data)

    async def read(self) -> bytes:
        try:
            return await self.proc.stdout.read(READ_CHUNK)
        except asyncssh.Error as exc:
            raise ConnectionError(str(exc)) from exc

    def resize(self, cols: int, rows: int) -> None:
        with contextlib.suppress(Exception):
            self.proc.change_terminal_size(cols, rows)

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.proc.close()

    async def exit_code(self) -> int | None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(self.proc.wait_closed(), 2)
        return self.proc.exit_status


class SshLink(Link):
    """One SSH connection, for one terminal."""

    def __init__(self, conn: asyncssh.SSHClientConnection) -> None:
        self.conn = conn

    async def script(self, text: str, timeout: float) -> tuple[int | None, bytes, bytes]:
        try:
            result = await self.conn.run("sh -s", input=text.encode(),
                                         encoding=None, check=False,
                                         timeout=timeout)
        except (asyncssh.Error, OSError, asyncio.TimeoutError) as exc:
            raise LinkError(str(exc) or type(exc).__name__) from exc
        out = result.stdout if isinstance(result.stdout, bytes) else b""
        err = result.stderr if isinstance(result.stderr, bytes) else b""
        return result.exit_status, out, err

    async def open(self, command: str, cols: int, rows: int, echo: bool,
                   exec_argv: list[str] | None = None) -> Channel:
        # Only a computer's terminal (the agent) runs exec_argv; a server
        # reached over SSH always starts the login shell with `command`.
        proc = await self.conn.create_process(
            command, term_type="xterm-256color", term_size=(cols, rows),
            term_modes={} if echo else {asyncssh.PTY_ECHO: 0},
            encoding=None, stderr=asyncssh.STDOUT)
        return SshChannel(proc)

    def release(self) -> None:
        with contextlib.suppress(Exception):
            self.conn.close()
        # A server reached through a bastion carries its jump connection
        # (ssh.connect_own); it goes with the connection that rode it.
        jump = getattr(self.conn, "_tterm_jump", None)
        if jump is not None:
            with contextlib.suppress(Exception):
                jump.close()

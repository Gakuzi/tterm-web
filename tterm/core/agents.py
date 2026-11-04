"""Computers: the agent that dials in (from 0.0.6, with agent 0.11.0).

A laptop cannot be reached from outside: it has no stable address, it sits
behind NAT and it sleeps. So the direction is reversed: the agent opens a
WebSocket to the machines' side, /agent, and keeps it open. Every terminal
on that computer goes through that one connection.

The agent stays a pipe: it starts what it is asked to in a pseudo-terminal
and passes the bytes both ways, and it runs the small sh scripts it is
sent. The markers, the blocks and everything else live here, as for a
server, so the agent rarely needs a new version.

How a computer joins. Add a machine, then Computer, gives a command with a
token that works for ten minutes. The agent, started with it, says hello;
the core takes the token, reads the computer's passport through the agent,
and from then on the same token is that computer's key: only its hash is
kept, with the machine, and the agent signs in with it every time.

The protocol, all of it on the one WebSocket (web 1):

    agent → core  text   hello {token, name, user, os, agent, shell, web}
    core → agent  text   welcome {name}, or error {error, revoked}
    core → agent  text   open {ch, cmd, cols, rows, echo}, size {ch, cols,
                         rows}, close {ch}, run {id, script, timeout}, hb,
                         ping

From 0.1.17 the open message may carry `exec` instead of `cmd`: a list of
argv the agent runs directly (execvp), not through the login shell. It is
for a terminal on the person's Mac that opens a server "from anywhere":
`open {ch, exec: ["ssh", "--", "<target>"], cols, rows, echo}`. An agent too
old to know `exec` ignores it and, finding no `cmd`, starts a plain login
shell; the core only sends `exec` to the Mac's own engine, which knows it.
    core → agent  bytes  2, the channel in 4 bytes, keys
    agent → core  bytes  1, the channel in 4 bytes, output
    agent → core  text   exit {ch, code, error}, ran {id, code, out, err},
                         hb, pong

From agent 0.12.0 (web 2) a computer's terminals outlive the connection:
the laptop sleeps, the network blinks, the agent keeps its shells and the
core keeps the terminals, away, until it is back. The hello then says which
shells it kept, and the core takes each back from the byte it has:

    agent → core  text   hello {…, kept: [ch, …]}
    core → agent  text   resume {ch, from}; the shells it no longer has a
                         terminal for get a close
    agent → core  text   gap {ch, lost}: output no longer kept, skipped;
                         exit {ch, gone: true}: no such shell any more;
                         bye: stopped on purpose, its shells end with it

From 0.0.8 a computer is added with an installer (agent 0.13.0 or newer),
which makes the computer a key of its own and keeps it in ~/.tterm-web:

    agent → core  text   hello {…, token, key}: the token from Add a
                         machine lets it join, once; the key is what the
                         computer is known by from then on. Run again, the
                         installer keeps the key: the computer is the same
                         one, and the new token only tells the dialog so.

A computer removed in tTerm Web hears it on the spot:

    core → agent  text   error {error, revoked: true}, then the connection
                         closes; the agent stops and does not come back.

The Telegram bot speaks an older form of it to the same agent; the agent
tells the two apart by what it is sent.

/agent is open to the internet, so what a stranger can make it do is
bounded: a hello is small and comes at once, only so many connections from
one address may wait to say it, and when too many wait in all the oldest
goes; an address whose hellos keep failing waits, except for computers it
already has; a message is never larger than a script's answer.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib
import datetime as dt
import ipaddress
import itertools
import json
import logging
import random
import time
import uuid
from typing import Awaitable, Callable

import asyncpg
from starlette.websockets import WebSocket, WebSocketDisconnect

from . import machines, passport
from .transport import Channel, Gone, Link, LinkError

log = logging.getLogger("tterm.agents")

#: Binary frames: a byte of kind, four of channel, then the data.
OUTPUT, INPUT = 1, 2
#: The agent says hello as soon as it is connected; a connection that does
#: not is dropped.
HELLO_TIMEOUT = 5
#: A hello is a few hundred bytes; anything much longer is not one and is
#: not even parsed.
HELLO_MAX = 8192
#: The largest message an agent may send at all, set on the listener: a
#: script's answer, up to 2 MiB in base64, with room to spare.
FRAME_MAX = 4 * 1024 * 1024
#: Connections that have not said who they are yet: at most this many from
#: one address (an IPv6 one by its /64), the next is not accepted; and this
#: many in all, past which the one that has waited longest is let go. A real
#: agent says hello at once, so it is never the one that has waited longest,
#: and a stranger holding connections open cannot keep agents out.
PENDING_PER_ADDRESS = 4
PENDING_MAX = 64
#: How many waiting connections may be let go that way in EVICT_WINDOW
#: seconds. A closed connection's socket stays open a while for the other
#: side's goodbye; past this, new ones are refused at the door again, which
#: frees theirs at once.
EVICTIONS = 32
EVICT_WINDOW = 10.0
#: Failed hellos one address may make in STRIKE_WINDOW seconds before it
#: is turned away without a look.
STRIKES = 20
STRIKE_WINDOW = 600.0
#: How long a connected agent has to answer when another one comes with
#: its key.
PROBE_TIMEOUT = 3.0
#: What may wait to be sent to one agent. One that stops reading is
#: dropped rather than let fill the core's memory. Twice the largest paste
#: the page's socket takes in one message (uvicorn's 16 MiB), so a paste
#: alone never counts as an agent that stopped reading.
OUTBOX_MAX = 32 * 1024 * 1024
#: Keys go to the agent in pieces of at most this, each its own frame.
INPUT_PIECE = 64 * 1024
#: The oldest agent protocol tTerm Web works with.
WEB_PROTOCOL = 1
#: The one whose shells outlive the connection (agent 0.12.0).
KEEPS_SHELLS = 2
#: How long a computer's terminals wait for its agent to come back. A laptop
#: asleep all night comes back in the morning; one that does not by then
#: is not coming back for them. Its agent keeps the shells while asleep, and
#: an hour while awake without the link.
AWAY_MAX = 12 * 3600
#: Shells a hello may say it kept, at most: the agent has 16 at most.
KEPT_MAX = 64
#: Output an agent may say it skipped at once, at most: its ring is 1 MiB.
GAP_MAX = 1 << 40
#: Reading the passport of a computer that just joined, at most.
PASSPORT_TIMEOUT = 20
#: Fields of the hello kept, and how long each may be.
HELLO_TEXT = {"name": 64, "user": 64, "os": 200, "agent": 32, "shell": 64}
#: The answer to the agent's sign of life.
HB = json.dumps({"t": "hb"}, separators=(",", ":"))

TOO_OLD = ("This agent is too old for tTerm Web: it needs version 0.11.0 or "
           "newer, from github.com/tterm-net/tterm-agent.")
NOT_KNOWN = ("This computer is not in tTerm Web, or it was removed. Add it "
             "again: Add a machine, then Computer.")
KEY_RETIRED = ("This computer's key stopped working when the computer was "
               "removed from tTerm Web. Run the command again: the agent has "
               "forgotten that key, and the installer makes a new one.")
FOR_A_SERVER = ("This token is for a server: its command runs on the server. "
                "For this computer, choose Computer under Add a machine.")
TWICE = ("This computer is already connected to tTerm Web: its key is in use "
         "by another agent. Stop that one first.")
TOO_MANY = ("Too many failed attempts from this address. Try again in a few "
            "minutes.")
LEFT_WHILE_JOINING = ("The agent disconnected while the computer was being "
                      "added. Run the command again.")
#: Why a terminal that waited for its agent ends; {name} is the computer.
AWAY_TOO_LONG = "{name} did not come back within 12 hours: this terminal has ended."
CAME_BACK_WITHOUT = ("{name} came back without this terminal: its agent was "
                     "restarted, or the computer was awake and offline for "
                     "over an hour.")
STOPPED = "The agent on {name} was stopped: this terminal has ended."
#: What the agent of a computer that was removed hears, and then stops.
REMOVED = ("This computer was removed from tTerm Web. To connect it again: Add "
           "a machine, then Computer.")
#: A computer's passport is read again when its agent changed, at most this
#: long after it connected: reading it is a script on the computer.
PASSPORT_AGAIN = 24 * 3600


class AgentChannel(Channel):
    """A terminal's shell on the computer, as the terminal sees it.

    With agent 0.12.0 it outlives the connection: when the agent goes, the
    channel waits, away, and when it is back goes on over the new connection
    from the byte it had, nothing lost and nothing twice. An older agent's
    shells end with the connection."""

    def __init__(self, link: "AgentLink", ch: int, cols: int, rows: int) -> None:
        self.link = link
        self.ch = ch
        #: The size the shell is to have, sent again when it is taken back.
        self.size = (cols, rows)
        #: Output bytes taken in, counted from the shell's first: the agent
        #: goes on from here after a reconnect.
        self.received = 0
        self.on_change: Callable[[], None] | None = None
        self._out: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._exit: asyncio.Future = asyncio.get_running_loop().create_future()
        self._lost: str | None = None
        self._whole = False
        self._agents: "Agents | None" = None
        self._expiry: asyncio.TimerHandle | None = None
        self.closed = False

    @property
    def over(self) -> bool:
        return self.closed or self._exit.done()

    def write(self, data: bytes) -> None:
        # Keys typed while away would go nowhere: the agent does not take
        # them for a shell it keeps.
        if not self.over and not self.away:
            self.link.send_frame(INPUT, self.ch, data)

    async def read(self) -> bytes:
        item = await self._out.get()
        if item is None:
            self._out.put_nowait(None)          # every later read ends too
            if self._lost:
                raise (Gone if self._whole else ConnectionError)(self._lost)
            return b""
        return item

    def resize(self, cols: int, rows: int) -> None:
        self.size = (cols, rows)
        if not self.over and not self.away:
            self.link.send_json({"t": "size", "ch": self.ch, "cols": cols,
                                 "rows": rows})

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        # Closed while away: no longer waited for. The agent hears it when
        # it is back, as a shell nobody takes.
        self._stop_waiting()
        if not self._exit.done():
            self.link.send_json({"t": "close", "ch": self.ch})
            self._exit.set_result(None)
        self.link.forget(self.ch)
        self._out.put_nowait(None)

    async def exit_code(self) -> int | None:
        try:
            return await asyncio.wait_for(asyncio.shield(self._exit), 2)
        except asyncio.TimeoutError:
            return None

    # -------------------------------------------------- from the link

    def output(self, data: bytes) -> None:
        # Nothing at all is not the end: that is said with exit.
        if data and not self.closed:
            self.received += len(data)
            self._out.put_nowait(data)

    def ended(self, code: int | None) -> None:
        if not self._exit.done():
            self._exit.set_result(code)
        self._out.put_nowait(None)

    def lost(self, reason: str) -> None:
        self._stop_waiting()
        self._lost = reason
        if not self._exit.done():
            self._exit.set_result(None)
        self._out.put_nowait(None)

    def give_up(self, why: str) -> None:
        """It ends, and `why` is the whole sentence the terminal says."""
        self._whole = True
        self.lost(why)

    # ------------------------------------------------- away and back

    def went_away(self, agents: "Agents") -> None:
        """Its agent is gone: it waits for it, AWAY_MAX at most."""
        self._agents = agents
        self.away = True
        self.since = time.time()
        self._expiry = asyncio.get_running_loop().call_later(
            AWAY_MAX, lambda: self.give_up(
                AWAY_TOO_LONG.format(name=self.link.machine_name)))
        self._changed()

    def back(self, link: "AgentLink") -> None:
        """Its agent is back: it goes on over `link`, from the byte it has,
        at the size it is to have now."""
        self.link = link
        link.send_json({"t": "resume", "ch": self.ch, "from": self.received})
        cols, rows = self.size
        link.send_json({"t": "size", "ch": self.ch, "cols": cols, "rows": rows})
        self._stop_waiting()

    def _stop_waiting(self) -> None:
        if self._expiry is not None:
            self._expiry.cancel()
            self._expiry = None
        if self._agents is not None:
            self._agents.unpark(self)
            self._agents = None
        if self.away:
            self.away = False
            self.since = None
            self._changed()

    def _changed(self) -> None:
        if self.on_change is not None:
            self.on_change()


Sender = Callable[[str | bytes], Awaitable[None]]
Closer = Callable[[], Awaitable[None]]


class AgentLink(Link):
    """One connected agent: one computer, all its terminals.

    What goes to the agent goes through one queue and one task, so that it
    leaves in the order it was given: keys are typed in order, a resize does
    not overtake the keys before it.
    """

    def __init__(self, send: Sender, close: Closer, hello: dict) -> None:
        self.machine_id: uuid.UUID | None = None
        self.name = hello.get("name") or "computer"
        #: The computer's name in tTerm Web, once it is known.
        self.machine_name = self.name
        self.user = hello.get("user") or ""
        self.os = hello.get("os") or ""
        self.version = hello.get("agent") or ""
        self.shell = hello.get("shell") or ""
        #: The key the computer made for itself, if it came with one.
        self.key: str | None = hello.get("key")
        #: What the agent can do for tTerm Web; from KEEPS_SHELLS its
        #: shells outlive the connection, and these are the ones it kept.
        self.web = hello.get("web") or 0
        self.kept: list[int] = list(hello.get("kept") or [])
        self.connected_at = time.time()
        #: Why the connection is gone, once it is.
        self.gone: str | None = None
        #: Where its terminals wait when it goes; set when it is attached.
        self.agents: "Agents | None" = None
        self._send = send
        self._close = close
        self._closing: asyncio.Task | None = None
        self._outbox: asyncio.Queue[str | bytes | None] = asyncio.Queue()
        self._queued = 0
        self._hb_waiting = False
        self._heard = asyncio.Event()
        self._channels: dict[int, AgentChannel] = {}
        self._scripts: dict[int, asyncio.Future] = {}
        self._numbers = itertools.count(1)
        self._sender = asyncio.create_task(self._send_all())

    # ----------------------------------------------------------- out

    def _put(self, item: str | bytes) -> None:
        if self.gone:
            return
        self._queued += len(item)
        if self._queued > OUTBOX_MAX:
            self.lost("the agent stopped taking what tTerm Web sends it")
            self.hang_up()
            return
        self._outbox.put_nowait(item)

    def send_json(self, message: dict) -> None:
        self._put(json.dumps(message, separators=(",", ":")))

    def send_frame(self, kind: int, ch: int, data: bytes) -> None:
        head = bytes([kind]) + ch.to_bytes(4, "big")
        for start in range(0, len(data), INPUT_PIECE):
            self._put(head + data[start:start + INPUT_PIECE])

    async def _send_all(self) -> None:
        while True:
            item = await self._outbox.get()
            if item is None or self.gone:
                return
            self._queued -= len(item)
            if item == HB:
                self._hb_waiting = False
            try:
                await self._send(item)
            except Exception as exc:        # noqa: BLE001 - the link is gone
                self.lost(f"the connection to the agent broke ({type(exc).__name__})")
                # Its socket may not know yet: the agent is to hear it now,
                # and come back at once, not when it misses our answers.
                self.hang_up()
                return

    def hang_up(self) -> None:
        """Closes the connection from this side: for a link that is over
        while its socket may not know it yet."""
        if self._closing is None:
            self._closing = asyncio.create_task(self._hang_up())

    async def _hang_up(self) -> None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(self._close(), 5)

    async def answers(self, timeout: float) -> bool:
        """Whether the agent at the other end still answers: asked with a
        ping, anything from it within `timeout` will do."""
        if self.gone:
            return False
        self._heard.clear()
        self.send_json({"t": "ping"})
        try:
            await asyncio.wait_for(self._heard.wait(), timeout)
        except asyncio.TimeoutError:
            return False
        return not self.gone

    # ------------------------------------------------------ Link

    async def script(self, text: str, timeout: float) -> tuple[int | None, bytes, bytes]:
        if self.gone:
            raise LinkError(self.gone)
        number = next(self._numbers)
        answer = asyncio.get_running_loop().create_future()
        self._scripts[number] = answer
        self.send_json({"t": "run", "id": number, "script": text,
                        "timeout": timeout})
        try:
            return await asyncio.wait_for(answer, timeout + 5)
        except asyncio.TimeoutError:
            raise LinkError("the computer did not answer in time") from None
        finally:
            self._scripts.pop(number, None)

    async def open(self, command: str, cols: int, rows: int, echo: bool,
                   exec_argv: list[str] | None = None) -> Channel:
        if self.gone:
            raise ConnectionError(self.gone)
        ch = self._new_channel()
        channel = AgentChannel(self, ch, cols, rows)
        self._channels[ch] = channel
        message = {"t": "open", "ch": ch, "cols": cols, "rows": rows,
                   "echo": echo}
        if exec_argv is not None:
            # A terminal on the Mac that runs ssh to a target (a server
            # opened "from anywhere" through the Mac): the argv runs
            # directly, not through the login shell.
            message["exec"] = list(exec_argv)
        else:
            message["cmd"] = command
        self.send_json(message)
        return channel

    def _new_channel(self) -> int:
        """A channel number the agent does not have, nor will be asked to
        take back: numbers outlive a connection now, so a counter starting
        over with each one would not do."""
        taken = set(self._channels) | set(self.kept)
        if self.agents is not None and self.machine_id is not None:
            taken |= self.agents.parked(self.machine_id)
        while True:
            ch = random.randrange(1, 2 ** 31)
            if ch not in taken:
                return ch

    def release(self) -> None:
        """Nothing to do: the connection is the computer's, not the
        terminal's. Its channel was closed on its own."""

    def forget(self, ch: int) -> None:
        self._channels.pop(ch, None)

    def adopt(self, channel: AgentChannel) -> None:
        """A terminal that waited for this agent goes on over this link."""
        self._channels[channel.ch] = channel
        channel.back(self)

    # ------------------------------------------------------------ in

    def heard(self) -> None:
        """Anything at all came from the agent."""
        self._heard.set()

    def take_bytes(self, frame: bytes) -> None:
        if len(frame) <= 5 or frame[0] != OUTPUT:
            return
        channel = self._channels.get(int.from_bytes(frame[1:5], "big"))
        if channel is not None:
            channel.output(frame[5:])

    def take_json(self, message: dict) -> None:
        kind = message.get("t")
        if kind == "exit":
            ch = message.get("ch")
            channel = self._channels.pop(ch, None) if _whole(ch) else None
            if channel is not None:
                code = message.get("code")
                error = message.get("error")
                if message.get("gone") is True:
                    # Taken back, and the agent no longer had it.
                    channel.give_up(CAME_BACK_WITHOUT.format(
                        name=self.machine_name))
                elif isinstance(error, str) and error:
                    # The shell never started: the terminal says why.
                    channel.lost(f"the agent could not start the shell "
                                 f"({error[:200]})")
                else:
                    channel.ended(code if _whole(code) else None)
        elif kind == "gap":
            # Taken back, but the start of what it missed was no longer
            # kept: the agent goes on after it, and so does the count.
            ch, lost = message.get("ch"), message.get("lost")
            channel = self._channels.get(ch) if _whole(ch) else None
            if channel is not None and _whole(lost) and 0 < lost <= GAP_MAX:
                channel.received += lost
                log.info("terminal %s on %s: %d bytes of output were no "
                         "longer kept", ch, self.machine_name, lost)
        elif kind == "bye":
            # Stopped on purpose: its shells end with it, nothing waits.
            self.lost("the agent was stopped",
                      ending=STOPPED.format(name=self.machine_name))
        elif kind == "ran":
            number = message.get("id")
            answer = self._scripts.get(number) if _whole(number) else None
            if answer is not None and not answer.done():
                code = message.get("code")
                answer.set_result((code if _whole(code) else None,
                                   _b64(message.get("out")),
                                   _b64(message.get("err"))))
        elif kind in ("hb", "pong"):
            # Answering is a must: the agent takes a long silence for a dead
            # link. One answer waiting to go is enough, however many come.
            if not self._hb_waiting:
                self._hb_waiting = True
                self._put(HB)

    def finish(self, message: dict, ending: str) -> None:
        """Ends the connection from this side, with a last word to the agent:
        the computer was removed. Its terminals end now, saying `ending`;
        the message goes out after everything before it, then the
        connection closes."""
        if self.gone:
            return
        self.lost("the computer was removed", ending=ending)
        text = json.dumps(message, separators=(",", ":"))

        async def last() -> None:
            # The sender stops at the end lost() put in its queue: then the
            # socket is free for this one.
            with contextlib.suppress(Exception):
                await asyncio.wait_for(asyncio.shield(self._sender), 5)
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self._send(text), 5)
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self._close(), 5)
        self._closing = asyncio.create_task(last())

    def lost(self, reason: str, *, ending: str | None = None,
             wait: bool = True) -> None:
        """The connection is gone: every script asked fails, nothing more
        is sent. Its terminals wait for the agent to come back, if it keeps
        their shells and `wait` allows; otherwise they end, saying `ending`
        if given, or that the connection was lost and why."""
        if self.gone:
            return
        self.gone = reason
        channels = [c for c in self._channels.values() if not c.over]
        self._channels.clear()
        if (wait and ending is None and self.web >= KEEPS_SHELLS
                and self.agents is not None and self.machine_id is not None):
            self.agents.park(self.machine_id, channels)
        else:
            for channel in channels:
                if ending is not None:
                    channel.give_up(ending)
                else:
                    channel.lost(reason)
        for answer in self._scripts.values():
            if not answer.done():
                answer.set_exception(LinkError(reason))
        while not self._outbox.empty():
            self._outbox.get_nowait()
        self._queued = 0
        self._outbox.put_nowait(None)
        self._heard.set()


def _whole(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _b64(value) -> bytes:
    if not isinstance(value, str):
        return b""
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return b""


class Agents:
    """The computers whose agent is connected right now, and the terminals
    waiting for the agent of one that went away."""

    def __init__(self) -> None:
        self._links: dict[uuid.UUID, AgentLink] = {}
        #: Terminals whose agent went away, by computer and channel.
        self._parked: dict[uuid.UUID, dict[int, AgentChannel]] = {}
        #: Connections that have not said who they are yet, oldest first,
        #: each with its address.
        self._waiting: dict[object, tuple[str, WebSocket]] = {}
        self._letting_go: set[asyncio.Task] = set()
        self._let_go_at: list[float] = []
        #: When each address last failed its hellos, the latest few.
        self._strikes: dict[str, list[float]] = {}

    def connected(self) -> int:
        """How many computers have their agent connected now."""
        return len(self._links)

    def attach(self, link: AgentLink) -> None:
        assert link.machine_id is not None
        link.agents = self
        old = self._links.get(link.machine_id)
        self._links[link.machine_id] = link
        if old is not None and old is not link:
            # Two agents with one key came at the same moment: the later
            # one stays, the other hears it is over.
            old.lost("the agent connected again")
            old.hang_up()
        self._take_back(link)

    def _take_back(self, link: AgentLink) -> None:
        """The agent is back: each terminal that waited for it goes on, if
        it still has the shell; a shell no terminal waits for any more is
        closed."""
        assert link.machine_id is not None
        parked = self._parked.pop(link.machine_id, {})
        kept = set(link.kept) if link.web >= KEEPS_SHELLS else set()
        back = 0
        for ch, channel in parked.items():
            if ch in kept:
                try:
                    link.adopt(channel)
                except Exception:           # noqa: BLE001 - never left between
                    log.exception("terminal %s on %s could not be taken back",
                                  ch, link.machine_name)
                    link.forget(ch)
                    channel.lost("it could not be taken back")
                    continue
                back += 1
            else:
                channel.give_up(CAME_BACK_WITHOUT.format(name=link.machine_name))
        for ch in sorted(kept - parked.keys()):
            link.send_json({"t": "close", "ch": ch})
        if parked or kept:
            log.info("agent back: %s, %d of %d terminal(s) taken back, %d "
                     "shell(s) nobody waited for closed", link.machine_name,
                     back, len(parked), len(kept - parked.keys()))

    def park(self, machine_id: uuid.UUID, channels: list[AgentChannel]) -> None:
        """The agent went away: these terminals wait for it."""
        if not channels:
            return
        spot = self._parked.setdefault(machine_id, {})
        for channel in channels:
            spot[channel.ch] = channel
            channel.went_away(self)
        log.info("agent gone: %d terminal(s) of %s wait for it", len(channels),
                 channels[0].link.machine_name)

    def unpark(self, channel: AgentChannel) -> None:
        machine_id = channel.link.machine_id
        spot = self._parked.get(machine_id) if machine_id is not None else None
        if spot is not None and spot.get(channel.ch) is channel:
            del spot[channel.ch]
            if not spot:
                del self._parked[machine_id]

    def parked(self, machine_id: uuid.UUID) -> set[int]:
        return set(self._parked.get(machine_id, ()))

    def revoke(self, machine_id: uuid.UUID, ending: str) -> None:
        """The computer was removed: its agent hears so and stops, and its
        terminals end saying `ending`, those that waited for it too."""
        link = self._links.pop(machine_id, None)
        if link is not None:
            link.finish({"t": "error", "error": REMOVED, "revoked": True,
                         "forget": True}, ending)
        for channel in list(self._parked.pop(machine_id, {}).values()):
            channel.give_up(ending)

    def detach(self, link: AgentLink) -> bool:
        """Forgets a link that went away, but only if it is still current:
        an agent that came back at once has a newer one by now."""
        if link.machine_id is not None and self._links.get(link.machine_id) is link:
            del self._links[link.machine_id]
            return True
        return False

    def get(self, machine_id: uuid.UUID) -> AgentLink | None:
        link = self._links.get(machine_id)
        return link if link is not None and not link.gone else None

    def online(self, machine_id: uuid.UUID | str) -> bool:
        try:
            key = machine_id if isinstance(machine_id, uuid.UUID) \
                else uuid.UUID(machine_id)
        except ValueError:
            return False
        return self.get(key) is not None

    def describe(self, machine_id: uuid.UUID | str) -> dict | None:
        """What the page shows of a connected agent."""
        try:
            key = machine_id if isinstance(machine_id, uuid.UUID) \
                else uuid.UUID(machine_id)
        except ValueError:
            return None
        link = self.get(key)
        if link is None:
            return None
        return {"version": link.version, "since": int(link.connected_at * 1000)}

    def close_all(self, reason: str) -> None:
        for link in list(self._links.values()):
            link.lost(reason, wait=False)
            link.hang_up()
        self._links.clear()
        for spot in list(self._parked.values()):
            for channel in list(spot.values()):
                channel.lost(reason)
        self._parked.clear()

    @property
    def pending(self) -> int:
        return len(self._waiting)

    def may_wait(self, address: str) -> bool:
        if sum(1 for a, _ in self._waiting.values()
               if a == address) >= PENDING_PER_ADDRESS:
            return False
        if len(self._waiting) < PENDING_MAX:
            return True
        cutoff = time.monotonic() - EVICT_WINDOW
        self._let_go_at = [t for t in self._let_go_at if t >= cutoff]
        return len(self._let_go_at) < EVICTIONS

    def waits(self, address: str, ws: WebSocket) -> object:
        """A connection that has yet to say hello; when too many wait, the
        one that has waited longest is let go."""
        while len(self._waiting) >= PENDING_MAX:
            oldest = next(iter(self._waiting))
            _, stale = self._waiting.pop(oldest)
            self._let_go_at.append(time.monotonic())
            task = asyncio.create_task(_let_go(stale))
            self._letting_go.add(task)
            task.add_done_callback(self._letting_go.discard)
        key = object()
        self._waiting[key] = (address, ws)
        return key

    def waited(self, key: object) -> None:
        self._waiting.pop(key, None)

    def struck_out(self, address: str) -> bool:
        """Whether this address failed too often lately to be looked at."""
        times = self._strikes.get(address)
        if not times:
            return False
        if times[-1] < time.monotonic() - STRIKE_WINDOW:
            del self._strikes[address]
            return False
        recent = [t for t in times if t >= time.monotonic() - STRIKE_WINDOW]
        return len(recent) >= STRIKES

    def strike(self, address: str) -> None:
        now = time.monotonic()
        if address not in self._strikes and len(self._strikes) >= 4096:
            # Forget the quiet ones first, everyone if that is not enough.
            for key in [k for k, v in self._strikes.items()
                        if v[-1] < now - STRIKE_WINDOW]:
                del self._strikes[key]
            if len(self._strikes) >= 4096:
                self._strikes.clear()
        times = self._strikes.setdefault(address, [])
        times.append(now)
        del times[:-STRIKES]


# -------------------------------------------------------- the connection

def address_key(address: str) -> str:
    """Who to count a connection against: its address, or for IPv6 its /64,
    which one person can have whole."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return address
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return address


async def _let_go(ws: WebSocket) -> None:
    with contextlib.suppress(Exception):
        await asyncio.wait_for(ws.close(code=1013), 5)


def parse_hello(raw: str) -> dict | None:
    """The agent's first message, cleaned; None if it is not one."""
    if len(raw) > HELLO_MAX:
        return None
    try:
        message = json.loads(raw)
    except (TypeError, ValueError, RecursionError):
        return None
    if not isinstance(message, dict) or message.get("t") != "hello":
        return None
    token = message.get("token")
    if not isinstance(token, str) or not token:
        return None
    hello: dict = {"token": token, "key": None}
    # The computer's own key, from tTerm Web's installer: one that is not
    # one makes the hello not one either.
    key = message.get("key")
    if key is not None:
        if not isinstance(key, str) or not machines.KEY_RE.match(key):
            return None
        hello["key"] = key
    for key, limit in HELLO_TEXT.items():
        value = message.get(key)
        hello[key] = "".join(ch for ch in value[:limit * 2]
                             if ch.isprintable())[:limit] \
            if isinstance(value, str) else ""
    web = message.get("web")
    hello["web"] = web if _whole(web) else 0
    # The shells it kept from a connection before: channel numbers, and
    # only so many.
    kept = message.get("kept")
    hello["kept"] = sorted({ch for ch in kept[:KEPT_MAX]
                            if _whole(ch) and 0 < ch < 2 ** 32}) \
        if isinstance(kept, list) else []
    return hello


async def session(ws: WebSocket, pool: asyncpg.Pool, agents: Agents,
                  address: str = "") -> None:
    """One agent's connection, from its hello until it goes."""
    address = address_key(address)
    if not agents.may_wait(address):
        # Not even accepted. A real agent tries again in a moment.
        with contextlib.suppress(Exception):
            await ws.close(code=1013)
        return
    await ws.accept()
    waiting = agents.waits(address, ws)
    try:
        met = await _meet(ws, pool, agents, address, waiting)
    finally:
        agents.waited(waiting)
    if met is None:
        return
    hello, known, claimed = met

    async def send(item: str | bytes) -> None:
        if isinstance(item, bytes):
            await ws.send_bytes(item)
        else:
            await ws.send_text(item)

    async def close() -> None:
        await ws.close()

    link = AgentLink(send, close, hello)
    link.send_json({"t": "welcome",
                    "name": known["name"] if known else link.name})
    reader = asyncio.create_task(_read(ws, link))
    try:
        if known is not None:
            link.machine_id = known["id"]
            link.machine_name = known["name"]
            agents.attach(link)
            if not await _seen(pool, known["id"], link):
                # Removed between its hello and now: Remove machine did not
                # find it connected yet, so it hears it here.
                agents.revoke(known["id"],
                              f"{known['name']} was removed from tTerm Web.")
                await reader
                return
            log.info("agent online: %s/%s (agent %s)", known["code"],
                     known["name"], link.version or "?")
            # The installer run again on a computer already here: the
            # dialog it came from hears that this one is connected.
            confirmed = bool(hello["key"]) and await machines.confirm_install(
                pool, hello["token"], known["id"])
            if confirmed or _passport_stale(known, link):
                _later(_read_passport_again(pool, known["id"], link))
        else:
            assert claimed is not None
            try:
                machine_id, name = await _join(pool, claimed, link)
            except Exception as exc:        # noqa: BLE001 - said to both sides
                if link.gone:
                    log.info("%s left while joining: %s", link.name, link.gone)
                    await machines.fail_install(pool, claimed["id"],
                                                LEFT_WHILE_JOINING)
                    return
                if isinstance(exc, machines.LimitReached):
                    # Another machine came in meanwhile and took the room.
                    await machines.fail_install(pool, claimed["id"], str(exc))
                    await _refuse(ws, str(exc), revoked=True)
                    return
                log.exception("a computer could not join")
                await machines.fail_install(
                    pool, claimed["id"], f"The computer could not be added: {exc}")
                link.send_json({"t": "error", "error":
                                "tTerm Web could not add this computer."})
                await asyncio.sleep(0.2)
                with contextlib.suppress(Exception):
                    await ws.close()
                return
            link.machine_id = machine_id
            link.machine_name = name
            agents.attach(link)
        await reader
    finally:
        reader.cancel()
        link.lost("the agent disconnected")
        if agents.detach(link):
            # The machine's name in tTerm Web, as in the other lines about it,
            # not the one the agent gave in its hello.
            log.info("agent offline: %s", link.machine_name)
        # From now on the page says when it was last here, unless it is back
        # already on a newer connection. tTerm Web stopping counts too.
        if link.machine_id is not None and agents.get(link.machine_id) is None:
            with contextlib.suppress(Exception):
                await pool.execute(
                    "UPDATE machines SET last_seen_at = now() WHERE id = $1",
                    link.machine_id)


async def _meet(ws: WebSocket, pool: asyncpg.Pool, agents: Agents,
                address: str, waiting: object) -> tuple[
                    dict, asyncpg.Record | None, asyncpg.Record | None] | None:
    """Reads the hello and decides: a computer we know, one that joins now
    with its token, or neither, and then the agent hears why."""
    try:
        first = await asyncio.wait_for(ws.receive(), HELLO_TIMEOUT)
    except (asyncio.TimeoutError, WebSocketDisconnect, RuntimeError):
        with contextlib.suppress(Exception):
            await ws.close()
        return None
    # It said something: from here it is not waiting, and is not the one
    # let go when too many wait, even while its key is looked up.
    agents.waited(waiting)
    if first.get("type") == "websocket.disconnect":
        return None
    text = first.get("text")
    hello = parse_hello(text) if isinstance(text, str) else None
    if hello is None:
        agents.strike(address)
        await _refuse(ws, "The agent's hello was not understood.")
        return None
    if hello["web"] < WEB_PROTOCOL:
        # Knocking again will not make it newer.
        await _refuse(ws, TOO_OLD, revoked=True)
        return None

    # By its own key, if it brought one (tTerm Web's installer); an agent
    # started by hand has its token for a key.
    known = await _known(pool, hello["key"] or hello["token"])
    if known is not None:
        current = agents.get(known["id"])
        if current is not None:
            # The same key again. Either this agent came back before we
            # noticed its old connection die, or the key is in two places
            # at once; the old connection answering tells which. Without
            # the question the two would take the computer from each
            # other every time one of them reconnected.
            if await current.answers(PROBE_TIMEOUT):
                await _refuse(ws, TWICE)
                return None
            current.lost("the agent connected again")
            current.hang_up()
        return hello, known, None

    # A token no computer has as its key. An address that keeps sending
    # those is not looked up any more for a while; the computers it already
    # has, behind the same office or carrier address, still come in above.
    if agents.struck_out(address):
        await _refuse(ws, TOO_MANY)
        return None
    problem = await _install_problem(pool, hello["token"], hello["key"])
    if problem is not None:
        agents.strike(address)
        await _refuse(ws, *problem)
        return None
    try:
        claimed = await machines.claim(pool, hello["token"])
    except machines.EnrollRefused as refused:
        # A token that never was, or has expired, will not start working:
        # the agent is told to stop rather than to knock forever. One in
        # use right now may work in a minute.
        if refused.status != 409:
            agents.strike(address)
        await _refuse(ws, str(refused) if refused.status != 404 else NOT_KNOWN,
                      revoked=refused.status in (404, 410))
        return None
    return hello, None, claimed


async def _read(ws: WebSocket, link: AgentLink) -> None:
    """Everything the agent sends, until it goes; then the link is over at
    once, and with it whatever waits on it."""
    try:
        while True:
            try:
                message = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                return
            if message.get("type") == "websocket.disconnect":
                return
            link.heard()
            data = message.get("bytes")
            if data is not None:
                link.take_bytes(data)
                continue
            text = message.get("text")
            if text is None:
                continue
            try:
                parsed = json.loads(text)
            except (ValueError, RecursionError):
                continue
            if isinstance(parsed, dict):
                link.take_json(parsed)
    finally:
        link.lost("the agent disconnected")


async def _refuse(ws: WebSocket, error: str, revoked: bool = False,
                  forget: bool = False) -> None:
    """The agent hears why not. `forget` (agent 0.13.0 and newer): its key
    is dead for good, and it drops it from its settings; only for a key that
    stopped working when its computer was removed."""
    message: dict = {"t": "error", "error": error, "revoked": revoked}
    if forget:
        message["forget"] = True
    with contextlib.suppress(Exception):
        await ws.send_text(json.dumps(message))
        await ws.close()


async def _known(pool: asyncpg.Pool, token: str) -> asyncpg.Record | None:
    if not machines.TOKEN_RE.match(token):
        return None
    return await pool.fetchrow(
        """
        SELECT m.id, m.name, p.code, m.passport->>'agent' AS agent,
               m.passport->>'checked_at' AS checked_at
        FROM machines m JOIN projects p ON p.id = m.project_id
        WHERE m.agent_token_hash = $1 AND m.kind = 'computer'
          AND m.removed_at IS NULL
        """, machines.token_hash(token))


async def _install_problem(pool: asyncpg.Pool, token: str,
                           key: str | None = None
                           ) -> tuple[str, bool, bool] | None:
    """For a token that is no computer's key: why it cannot join, whether
    the agent is to stop for good, and whether it is to forget its key (a
    key that stopped working when its computer was removed); None if it may
    try."""
    if not machines.TOKEN_RE.match(token):
        return NOT_KNOWN, True, False
    if key and await machines.key_retired(pool, key):
        # A removed computer's installer, run again before its agent heard
        # of the removal: its key stays dead, and the dialog says what to do.
        await machines.fail_token(pool, token, KEY_RETIRED)
        return KEY_RETIRED, True, True
    row = await pool.fetchrow(
        "SELECT kind, state, project_id FROM install_tokens "
        "WHERE token_hash = $1", machines.token_hash(token))
    if row is None:
        return NOT_KNOWN, True, False
    if row["kind"] != "computer":
        # A server's command, given to an agent: it stays as it was, for
        # the server it was made for.
        return FOR_A_SERVER, True, False
    if row["state"] == "connected":
        # It became a computer's key, and that computer was removed.
        return NOT_KNOWN, True, False
    full = await machines.room_problem(pool, row["project_id"])
    if full is not None:
        # The dialog shows it too; the agent stops, as for a dead command.
        await machines.fail_token(pool, token, full)
        return full, True, False
    return None


async def _seen(pool: asyncpg.Pool, machine_id: uuid.UUID,
                link: AgentLink) -> bool:
    """Notes the computer as seen now, with its agent's version. False if
    it was removed meanwhile; a database that does not answer is not that."""
    try:
        found = await pool.fetchval(
            "UPDATE machines SET last_seen_at = now(), passport = passport || "
            "jsonb_build_object('agent', $2::text) "
            "WHERE id = $1 AND removed_at IS NULL RETURNING id",
            machine_id, link.version)
    except Exception:               # noqa: BLE001 - only a note
        return True
    return found is not None


def _passport_stale(known: asyncpg.Record, link: AgentLink) -> bool:
    """Whether a computer's passport is to be read again: its agent is
    another version than when it was read, or it was read long ago."""
    if link.version and link.version != (known["agent"] or ""):
        return True
    try:
        checked = dt.datetime.fromisoformat(known["checked_at"] or "")
    except ValueError:
        return True
    if checked.tzinfo is None:
        checked = checked.replace(tzinfo=dt.UTC)
    return (dt.datetime.now(dt.UTC) - checked).total_seconds() > PASSPORT_AGAIN


#: Work started for a link that nobody waits for; kept so it is not lost.
_BACKGROUND: set[asyncio.Task] = set()


def _later(work: Awaitable[None]) -> None:
    task = asyncio.ensure_future(work)
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)


async def _read_passport_again(pool: asyncpg.Pool, machine_id: uuid.UUID,
                               link: AgentLink) -> None:
    """Reads a known computer's passport anew: tools come and go, sudo
    changes, and an older tTerm Web read less of it."""
    ps = passport.POWERSHELL_SCRIPT if (link.os and link.os.lower().startswith("win")) else passport.SCRIPT
    try:
        code, out, _ = await link.script(ps, PASSPORT_TIMEOUT)
    except LinkError as exc:
        log.info("could not read the passport of %s again: %s",
                 link.machine_name, exc)
        return
    details = passport.parse(out.decode("utf-8", "replace"))
    if code != 0 or not details.get("os"):
        log.info("the passport of %s did not come whole (code %s): kept as it "
                 "was", link.machine_name, code)
        return
    details["checked_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    details["agent"] = link.version
    if link.user:
        details["user"] = link.user
    with contextlib.suppress(Exception):
        await pool.execute(
            "UPDATE machines SET passport = $2::jsonb "
            "WHERE id = $1 AND removed_at IS NULL",
            machine_id, json.dumps(details))
        log.info("passport of %s read again (agent %s)", link.machine_name,
                 link.version or "?")


async def _join(pool: asyncpg.Pool, claimed: asyncpg.Record,
                link: AgentLink) -> tuple[uuid.UUID, str]:
    """Reads the passport through the agent and registers the computer.

    An agent that goes meanwhile is not added: its command works again
    when it comes back. One that is there but could not answer is added
    with what its hello said."""
    ps = passport.POWERSHELL_SCRIPT if (link.os and link.os.lower().startswith("win")) else passport.SCRIPT
    try:
        code, out, _ = await link.script(ps, PASSPORT_TIMEOUT)
        details = passport.parse(out.decode("utf-8", "replace"))
    except LinkError as exc:
        if link.gone:
            raise
        log.info("could not read the passport of %s: %s", link.name, exc)
        details = {"shells": [], "commands": []}
    if link.gone:
        raise LinkError(link.gone)
    details["checked_at"] = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    details["agent"] = link.version
    if link.os and "os" not in details:
        details["os"] = link.os
    if link.user:
        details["user"] = link.user
    return await machines.add_computer(pool, claimed, link.name, details,
                                       key=link.key)

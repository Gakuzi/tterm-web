"""The page's one socket: every terminal the page shows goes through it.

The page opens a single WebSocket and attaches terminals to it, each on a
channel number the page picks. Output comes as binary frames, everything
else as JSON text:

    page → core   {"op": "attach", "ch": 1, "id": "<terminal>", "after": 41,
                   "cols": 120, "rows": 40, "focus": true}
                  {"op": "resize", "ch": 1, "cols": 100, "rows": 30}
                  {"op": "focus" | "pause" | "resume" | "detach" | "close",
                   "ch": 1}
                  {"op": "run", "ch": 1, "command": "ls -la",
                   "confirmed": false}
                  binary: 0x02, channel (4 bytes), keystrokes
    core → page   {"op": "attached", "ch": 1, "terminal": {...}, "resumed": true}
                  {"op": "reset", "ch": 1, "seq": 40}   then a full replay,
                  {"op": "replayed", "ch": 1, "seq": 97}  and its end
                  {"op": "ev", "ch": 1, "seq": 52, "t": "P" | "C", ...}
                  {"op": "state", "ch": 1, "terminal": {...}}
                  {"op": "gone", "ch": 1, "terminal": {...} | null}
                  {"op": "confirm", "ch": 1, "command": "...", "what": "...",
                   "lost": "...", "everything": false}
                  {"op": "refused", "ch": 1, "command": "...", "reason": "..."}
                  {"op": "error", "message": "..."}
                  binary: 0x01, channel (4 bytes), number (8 bytes), output

"after" is the number of the last output the page has; the core sends what
follows, or, if that is no longer kept or the page has nothing, a reset and
everything kept. The page pauses a channel when it has more on its hands
than it can draw, and resumes it when it catches up. "focus" makes this
page the one that types into the terminal (see Watcher).

"run" is a whole command from tTerm's own input line. A command that would
do damage nothing brings back is first answered with "confirm"; the page
asks, and sends it again with "confirmed". A command the shell cannot take
now (another one is running) is answered with "refused".

From 0.1.17 the socket also carries the vault signing relay (core/vault.py).
The page says which of the person's vault keys it can sign for now, and the
core asks it to sign a login when a server opens with one of them:

    page → core   {"op": "vault.can", "keys": ["SHA256:…", …]}
    core → page   {"op": "vault.sign", "id": "…", "key": "SHA256:…",
                   "alg": "ssh-ed25519"|"rsa-sha2-256"|…, "data": "<b64u>",
                   "machine": "web-01", "keyName": "id_ed25519"}
    page → core   {"op": "vault.signed", "id": "…", "sig": "<b64u raw>"}
                  {"op": "vault.unable", "id": "…"}

The core verifies the raw signature with the stored public key before a
login uses it. The engine of tTerm for Mac sits on this socket and answers
for its own keys itself, passing the rest through.

From 0.1.28 (vault-design.md v3) a socket proves that the keys are open on
its device before anything of a guarded machine (a server with the person's
key, one through their Mac, a computer) reaches it, and only the sockets of
the session that opened a key server's terminal are asked to sign its login:

    core → page   {"op": "vault.challenge", "nonce": "<b64u of 32 bytes>"}
    page → core   {"op": "vault.prove", "key": "SHA256:…", "alg": "…",
                   "sig": "<b64u raw>"}   over vault.proof_blob(nonce)
                  {"op": "vault.prove", "auth": "<b64u 32>"}   the password
                  {"op": "vault.closed"}   the keys closed on the device
    core → page   {"op": "vault.proven"}
                  {"op": "vault.unproven", "error": "…", …}
                  {"op": "locked", "ch": 1, "terminal": {"id", "name",
                   "machine", "machineId"}}   instead of attaching one

The socket belongs to a session (see core/auth.py) and shows only that
person's terminals. When the session ends, the socket closes with the code
SIGNED_OUT_CLOSE and the page asks to sign in: at once on Sign out, Forget
all devices or a forgotten device, otherwise within a minute. Keys typed and
commands run count as something done, and keep the session from ending.
"""
from __future__ import annotations

import array
import asyncio
import contextlib
import itertools
import json
import logging
import uuid
from types import SimpleNamespace

import asyncpg
from starlette.websockets import WebSocket, WebSocketDisconnect

from ..core import auth, danger, vault
from ..core.terminals import INPUT, Terminals, Watcher, clean_command

log = logging.getLogger("tterm.ws")

#: Channels one page may hold at once.
MAX_CHANNELS = 64
#: Vault key fingerprints one socket may say it can sign for: far more than
#: anyone has, few enough that a bad message cannot grow the set unbounded.
MAX_VAULT_KEYS = 256
#: The close code that means "sign in again".
SIGNED_OUT_CLOSE = 4401
#: Seconds between the socket's checks that its session is still on.
RECHECK = 60.0
#: Seconds between two notes that something was done, at most.
TOUCH_EVERY = auth.TOUCH_EVERY.total_seconds()
#: How deep the page's JSON may nest arrays and objects (0.1.26). No request
#: of the page's and no message on its socket goes past a few levels. How
#: deep Python's own parser goes differs between versions: 3.12 and 3.13
#: count the calls and stop near 10000 levels, 3.14 measures the stack and
#: goes past 40000 with 8 MB of it; the core keeps a limit of its own, the
#: same on every Python.
PAGE_JSON_DEPTH = 64
#: Every byte but the brackets of arrays and objects.
_NOT_BRACKETS = bytes(b for b in range(256) if b not in b"[]{}")
#: An opening bracket as 1, a closing one as -1 (0xff, as a signed byte).
_STEPS = bytes.maketrans(b"[{]}", b"\x01\x01\xff\xff")


def page_json(text: str | bytes):
    """JSON from the page, in a request's body or on its socket. ValueError
    for what is not JSON, and arrays and objects nested deeper than
    PAGE_JSON_DEPTH are not, however deep Python's parser goes."""
    if isinstance(text, (bytes, bytearray)):
        # As json.loads decodes it.
        text = text.decode(json.detect_encoding(text), "surrogatepass")
    try:
        value = json.loads(text)
    except RecursionError:
        raise ValueError("nested deeper than the parser goes") from None
    if text.count("[") + text.count("{") > PAGE_JSON_DEPTH:
        # How deep, from the text, now that it is known to be JSON: escaped
        # backslashes and quotes are only inside strings, and without them
        # every other quote begins one; outside strings all is ASCII, and
        # the steps into and out of arrays and objects add up to how deep.
        # All of it runs in C: a walk down the value in Python takes ten
        # times as long as the parsing, for a body of empty arrays.
        outside = "".join(text.replace("\\\\", "").replace('\\"', "")
                          .split('"')[0::2])
        steps = outside.encode("ascii", "ignore").translate(_STEPS,
                                                            _NOT_BRACKETS)
        if max(itertools.accumulate(array.array("b", steps)),
               default=0) > PAGE_JSON_DEPTH:
            raise ValueError(f"nested deeper than {PAGE_JSON_DEPTH} levels")
    return value


class PageSocket:
    def __init__(self, websocket: WebSocket, terminals: Terminals,
                 session: auth.Session, pool: asyncpg.Pool, relay=None,
                 label: str = "", ip: str = "") -> None:
        self.ws = websocket
        self.terminals = terminals
        self.session = session
        self.user_id = session.person.id
        self.pool = pool
        #: The vault signing relay (core/vault.py); this socket is one of its
        #: sources while it is open.
        self.relay = relay
        #: Which of the person's vault keys this socket can sign for now, by
        #: fingerprint; empty means the vault is locked here.
        self._vault_can: set[str] = set()
        #: What the journal names as the signer of a login: this device.
        self.label_text = label or ("tTerm for Mac" if session.method == "app"
                                     else "a browser")
        self.watchers: dict[int, Watcher] = {}
        self._lock = asyncio.Lock()
        self._closing: set[asyncio.Task] = set()
        self._closed = False
        self._touched = 0.0
        #: Keys open on this device (0.1.28, vault-design.md v3): the nonce
        #: this socket's proof signs, and whether it proved. A guarded
        #: machine's terminals reach only a socket that did; the proof lives
        #: as long as the socket, or until the page says the keys closed.
        self.nonce = vault.new_nonce()
        self.keys_open = False
        #: The address it came from, for the journal of a wrong password.
        self.ip = ip
        #: The app's computer (Session.computer_id), kept up to date by
        #: POST /api/computers/this while the socket is open.
        self.computer_id = session.computer_id

    @property
    def session_id(self) -> uuid.UUID:
        """The session of this socket: the relay asks only the sockets of
        the session that opened a terminal to sign its login."""
        return self.session.id

    async def closed_to(self, machine) -> bool:
        """Whether this socket sees nothing of the machine: a guarded one
        (a server with the person's key, one through their Mac, a computer),
        the keys not proved open here, not the app's own computer, and the
        person's keys guard something (vault.guarding)."""
        if (self.keys_open or not vault.guarded(machine)
                or vault.exempt(self.computer_id, machine)):
            return False
        return await vault.guarding(self.pool, self.user_id)

    # The vault relay treats this socket as a signing source (core/vault.py).

    def vault_can(self) -> set[str]:
        return self._vault_can

    def label(self) -> str:
        return self.label_text

    async def vault_sign(self, request: dict) -> None:
        await self.json(request)

    async def send(self, message: bytes | str) -> None:
        async with self._lock:
            if self._closed:
                raise ConnectionError("the socket is closed")
            if isinstance(message, bytes):
                await self.ws.send_bytes(message)
            else:
                await self.ws.send_text(message)

    async def sign_out(self) -> None:
        """The session ended: the page hears it and asks to sign in."""
        async with self._lock:
            if self._closed:
                return
            self._closed = True
            with contextlib.suppress(Exception):
                await self.ws.close(code=SIGNED_OUT_CLOSE)

    def _did_something(self) -> None:
        """Keys or a command: the session is in use. Noted at most once a
        minute, and without holding up the keys."""
        now = asyncio.get_running_loop().time()
        if now - self._touched < TOUCH_EVERY:
            return
        self._touched = now
        self._background(auth.touch(self.pool, self.session.id))

    def _background(self, work) -> None:
        task = asyncio.create_task(work)
        self._closing.add(task)
        task.add_done_callback(self._closing.discard)

    async def _keep_checking(self) -> None:
        """Ends the socket when its session ends: signed out elsewhere,
        eight hours without anything done, its device forgotten."""
        while True:
            await asyncio.sleep(RECHECK)
            try:
                on = await auth.still_on(self.pool, self.session.id)
            except (OSError, asyncpg.PostgresError) as exc:
                log.warning("could not check a session: %s", exc)
                continue
            if not on:
                await self.sign_out()
                return

    async def json(self, message: dict) -> None:
        await self.send(json.dumps(message, ensure_ascii=False,
                                   separators=(",", ":")))

    async def run(self) -> None:
        await self.ws.accept()
        # The nonce first, so that a device with its keys open proves it at
        # once (0.1.28).
        await self.json({"op": "vault.challenge", "nonce": self.nonce})
        if self.relay is not None:
            self.relay.join(self)
        checking = asyncio.create_task(self._keep_checking())
        try:
            while True:
                message = await self.ws.receive()
                if message["type"] == "websocket.disconnect":
                    break
                if self._closed:
                    continue
                if message.get("bytes") is not None:
                    self._input(message["bytes"])
                elif message.get("text") is not None:
                    await self._command(message["text"])
        except (WebSocketDisconnect, ConnectionError):
            pass
        finally:
            checking.cancel()
            if self.relay is not None:
                self.relay.leave(self)
            await asyncio.gather(*(w.stop() for w in self.watchers.values()),
                                 return_exceptions=True)
            self.watchers.clear()

    def _input(self, frame: bytes) -> None:
        if len(frame) < 5 or frame[0] != INPUT:
            return
        watcher = self.watchers.get(int.from_bytes(frame[1:5], "big"))
        if watcher is not None:
            self._did_something()
            watcher.write(frame[5:])

    async def _command(self, text: str) -> None:
        try:
            # Nested too deep is not JSON either (page_json): not
            # understood, rather than the end of the socket.
            msg = page_json(text)
            op = msg["op"]
            ch = int(msg.get("ch", 0))
        except (ValueError, KeyError, TypeError):
            await self.json({"op": "error", "message": "Not understood."})
            return
        if op in ("vault.can", "vault.signed", "vault.unable"):
            self._vault(op, msg)
            return
        if op == "vault.prove":
            await self._prove(msg)
            return
        if op == "vault.closed":
            await self._keys_closed()
            return
        watcher = self.watchers.get(ch)
        if op == "attach":
            await self._attach(ch, msg)
        elif watcher is None:
            return
        elif op == "resize":
            _resize(watcher.terminal, msg)
        elif op == "focus":
            watcher.focus()
        elif op == "pause":
            watcher.pause()
        elif op == "resume":
            watcher.resume()
        elif op == "detach":
            await self._detach(ch)
        elif op == "run":
            await self._run(ch, watcher, msg)
        elif op == "close":
            self._did_something()
            # Ending a shell can take a moment; the socket goes on meanwhile.
            self._background(watcher.terminal.close())

    async def _attach(self, ch: int, msg: dict) -> None:
        await self._detach(ch)
        try:
            terminal_id = uuid.UUID(str(msg.get("id")))
        except ValueError:
            await self.json({"op": "gone", "ch": ch, "terminal": None})
            return
        terminal = self.terminals.get(terminal_id, self.user_id)
        if terminal is None:
            ended = await self.terminals.ended(terminal_id, self.user_id)
            machine = (await self.terminals.machine_of(terminal_id, self.user_id)
                       if ended is not None else None)
            if machine is not None and await self.closed_to(machine):
                # Ended, but not even where it ended up, here (0.1.28).
                await self.json(_locked(ch, SimpleNamespace(
                    id=terminal_id, name=ended["name"], machine=machine)))
                return
            await self.json({"op": "gone", "ch": ch, "terminal": ended})
            return
        if await self.closed_to(terminal.machine):
            # Nothing of it: no watcher, no screen, not even its size.
            await self.json(_locked(ch, terminal))
            return
        if len(self.watchers) >= MAX_CHANNELS:
            await self.json({"op": "error", "message": "Too many terminals."})
            return
        _resize(terminal, msg)
        after = msg.get("after")
        after = int(after) if isinstance(after, int) and after >= 0 else None
        watcher = Watcher(terminal, ch, self.send, after)
        if msg.get("focus") is True:
            watcher.focus()
        self.watchers[ch] = watcher

    async def _run(self, ch: int, watcher: Watcher, msg: dict) -> None:
        command = msg.get("command")
        if not isinstance(command, str):
            return
        self._did_something()
        author = msg.get("author")
        if author and isinstance(author, dict) and author.get("kind") == "agent":
            if not getattr(watcher.terminal, "ai_access", True):
                await self.json({"op": "refused", "ch": ch, "command": command,
                                 "reason": "Доступ для ИИ-агентов к этому терминалу отозван пользователем."})
                return
            ai_mode = getattr(watcher.terminal, "ai_mode", "execute")
            if ai_mode == "readonly":
                await self.json({"op": "refused", "ch": ch, "command": command,
                                 "reason": "Терминал находится в режиме «Только чтение» для ИИ. Выполнение команд заблокировано."})
                return
            if ai_mode == "guard" and msg.get("confirmed") is not True:
                req_id = str(uuid.uuid4())
                await self.json({
                    "op": "guard_ask",
                    "ch": ch,
                    "command": command,
                    "requestId": req_id,
                    "author": author,
                })
                return

        # Checked as it will be typed: a control character in the middle of
        # a word must not hide it from the check and then vanish.
        command = clean_command(command)
        if msg.get("confirmed") is not True:
            held = danger.looks_destructive(command)
            if held is not None:
                await self.json({"op": "confirm", "ch": ch, "command": command,
                                 "what": held.what, "lost": held.lost,
                                 "everything": danger.hits_everything(command)})
                return
        # Running a command is typing: this page becomes the one that types.
        watcher.focus()
        watcher.terminal.set_next_author(author)
        why = watcher.terminal.run(command)
        if why is not None:
            await self.json({"op": "refused", "ch": ch, "command": command,
                             "reason": why})

    async def _detach(self, ch: int) -> None:
        watcher = self.watchers.pop(ch, None)
        if watcher is not None:
            await watcher.stop()

    async def _prove(self, msg: dict) -> None:
        """A proof that the keys are open on this device (0.1.28, v3): by a
        key of the person's vault, signing the blob of this socket's nonce;
        or, with no key to sign with, by the vault password's proof (`auth`),
        which counts and pauses as password/open does, but forgives no wrong
        try. A refused one leaves the socket as it was; so does one checked
        while the socket was asked to prove again (prove_again)."""
        nonce = self.nonce
        try:
            if "auth" in msg:
                await vault.open_with_password(self.pool, self.user_id,
                                               auth=msg.get("auth"),
                                               device=self.label_text,
                                               ip=self.ip, forgive=False)
            else:
                await vault.prove_by_key(self.pool, self.user_id,
                                         nonce=nonce,
                                         fingerprint=msg.get("key"),
                                         alg=msg.get("alg"), sig=msg.get("sig"))
        except vault.Refused as exc:
            await self.json({"op": "vault.unproven", "error": str(exc),
                             **exc.details})
            return
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("could not check a proof of open keys: %s", exc)
            await self.json({"op": "vault.unproven",
                             "error": "Something went wrong. Try again."})
            return
        if self.nonce != nonce:
            await self.json({"op": "vault.unproven",
                             "error": "The vault changed meanwhile: prove "
                                      "it again."})
            return
        self.keys_open = True
        await self.json({"op": "vault.proven"})

    async def prove_again(self) -> None:
        """What proved the keys open here may be gone (0.1.28): a key taken
        out of the vault, a new password. The proof goes, the guarded
        terminals it watched turn locked, and a new nonce asks for it again:
        a device with its keys open proves at once; whoever proved with what
        is gone cannot."""
        await self._keys_closed()
        self.nonce = vault.new_nonce()
        await self.json({"op": "vault.challenge", "nonce": self.nonce})

    async def _keys_closed(self) -> None:
        """The keys closed on this device (Lock, idle, signing out): the
        proof goes, and every guarded terminal it watched turns locked."""
        self.keys_open = False
        for ch, watcher in list(self.watchers.items()):
            if await self.closed_to(watcher.terminal.machine):
                await self._detach(ch)
                await self.json(_locked(ch, watcher.terminal))

    def _vault(self, op: str, msg: dict) -> None:
        """The vault signing ops (core/vault.py). vault.can announces which
        keys this socket can sign for; vault.signed/unable answer a request
        the core made. A malformed signature counts as unable."""
        if self.relay is None:
            return
        if op == "vault.can":
            keys = msg.get("keys")
            if not isinstance(keys, list):
                return
            self._vault_can = {k for k in keys[:MAX_VAULT_KEYS]
                               if isinstance(k, str) and k.startswith("SHA256:")}
            self.relay.announced()
            return
        request_id = msg.get("id")
        if not isinstance(request_id, str):
            return
        if op == "vault.unable":
            self.relay.answer(request_id, None)
            return
        try:
            raw = vault.decode_b64u(msg.get("sig"), most=vault.RAW_SIG_MAX,
                                    least=1, what="signature")
        except vault.Refused:
            # A signature that is not even base64url: as if it could not sign.
            self.relay.answer(request_id, None)
            return
        self.relay.answer(request_id, raw)


def _locked(ch: int, terminal) -> dict:
    """What a socket without open keys hears of a guarded terminal: that it
    is there and closed, with what the page needs for the card."""
    return {"op": "locked", "ch": ch,
            "terminal": {"id": str(terminal.id), "name": terminal.name,
                         "machine": terminal.machine.name,
                         "machineId": str(terminal.machine.id)}}


def _resize(terminal, msg: dict) -> None:
    """A size the page measured. A page that only watches sends none, and
    leaves the size as it is."""
    try:
        cols, rows = int(msg["cols"]), int(msg["rows"])
    except (KeyError, TypeError, ValueError):
        return
    if cols > 0 and rows > 0:
        terminal.resize(cols, rows)

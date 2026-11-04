"""Terminals: the shell scripts, the markers, sessions over SSH, the socket.

The shells here are real: bash and zsh on this computer, in real ptys, in a
throwaway home. macOS ships bash 3.2, which cannot say when a command
starts; there the bash checks look at prompts only, and zsh does the rest.
"""
import asyncio
import base64
import contextlib
import json
import os
import pty
import random
import select
import shutil
import socket
import subprocess
import tempfile
import termios
import datetime as dt
import time
import uuid
import zlib
from pathlib import Path

import asyncssh
import websockets

from ..core import accounts, logs, machines, shell, ssh, terminals, trust
from ..core.machines import remember_cas
from .harness import old_line, page_socket, request, shell_server

KEY = "0123456789abcdef" * 2
CHANGE = {"x-tterm": "1", "content-type": "application/json"}


def _marker(*fields: str, key: str = KEY) -> bytes:
    body = ";".join(f.replace("%", "%25").replace(";", "%3B") for f in fields)
    return f"\x1b]6973;{key};{body}\x07".encode()


def _bash_full() -> bool:
    """bash 4.4 or newer: it has PS0, so commands get a start marker."""
    if not shutil.which("bash"):
        return False
    out = subprocess.run(
        ["bash", "-c", "echo ${BASH_VERSINFO[0]} ${BASH_VERSINFO[1]}"],
        capture_output=True, text=True).stdout.split()
    return len(out) == 2 and (int(out[0]), int(out[1])) >= (4, 4)


# ---------------------------------------------------------------- parsing

def test_markers_survive_any_split():
    stream = (b"hi\x1b]0;title\x07" + _marker("C", "echo a;b%c") + b"out\r\n"
              + b"\x1b]6973;not-our-key;P;0\x07" + b"\x1b]6973x"
              + _marker("P", "0", "/home/u", "/home/u", "main", "")
              + b"tail\x1b]69")
    screen = (b"hi\x1b]0;title\x07out\r\n\x1b]6973;not-our-key;P;0\x07"
              b"\x1b]6973xtail\x1b]69")
    rnd = random.Random(7)
    for _ in range(500):
        parser = shell.MarkerParser(KEY)
        out, marks, i = b"", [], 0
        while i < len(stream):
            n = rnd.randint(1, 9)
            for piece in parser.feed(stream[i:i + n]):
                if isinstance(piece, bytes):
                    out += piece
                else:
                    marks.append(piece)
            i += n
        out += parser.flush()
        assert out == screen, out
        assert [m.kind for m in marks] == ["C", "P"]
        assert marks[0].field(0) == "echo a;b%c"
        assert marks[1].field(3) == "main" and marks[1].field(9) == ""


def test_a_marker_without_its_end_is_not_one():
    parser = shell.MarkerParser(KEY)
    start = b"\x1b]6973;" + KEY.encode() + b";C;"
    pieces = parser.feed(start + b"x" * (shell.MARKER_MAX + 10))
    assert all(isinstance(p, bytes) for p in pieces)
    assert b"".join(pieces).startswith(b"\x1b]6973;"), "handed to the screen"


def test_zsh_mark_comes_off_the_end_of_output():
    mark = b"\x1b[1m\x1b[7m%\x1b[27m\x1b[1m\x1b[0m"
    assert shell.strip_eol_mark(b"hi\r\n" + mark + b" " * 79 + b"\r \r", 80) \
        == b"hi\r\n"
    assert shell.strip_eol_mark(b"foo<no-nl>" + b" " * 73 + b"\r" + b" " * 7
                                + b"\r", 80) == b"foo"
    assert shell.strip_eol_mark(b"plain\r\n", 80) == b"plain\r\n"
    assert shell.strip_eol_mark(b"x" + b" " * 10 + b"\r \r", 80) == \
        b"x" + b" " * 10 + b"\r \r", "only a mark as wide as the screen"


def test_screen_modes_are_followed():
    modes = shell.Modes()
    modes.feed(b"\x1b[?1049h\x1b[?1h\x1b=")
    modes.feed(b"\x1b[?25")
    modes.feed(b"l\x1b[?2004h")
    assert modes.alt_screen
    restore = modes.restore()
    for seq in (b"\x1b[?1049h", b"\x1b[?1h", b"\x1b[?25l", b"\x1b[?2004h",
                b"\x1b="):
        assert seq in restore, seq
    modes.feed(b"\x1bc")
    assert not modes.alt_screen and modes.restore() == b""


def test_shell_follows_the_login_shell():
    assert shell.plan("shell=/bin/bash\nbash=/bin/bash\nzsh=\n").shell == "bash"
    zsh = shell.plan("shell=/usr/bin/zsh\nbash=/bin/bash\nzsh=/usr/bin/zsh\n")
    assert zsh.shell == "zsh" and "ZDOTDIR" in zsh.command and zsh.markers
    fish = shell.plan("shell=/usr/bin/fish\nbash=/bin/bash\nzsh=\n")
    assert fish.shell == "bash", "neither bash nor zsh: bash, like the bot"
    bare = shell.plan("shell=/bin/ash\nbash=\nzsh=\n")
    assert bare.shell == "ash" and not bare.markers
    assert not shell.plan("").markers, "nothing known: no key typed in"


def test_a_shell_starts_where_the_terminal_before_it_was():
    """Open a new terminal on one that ended starts in its folder (0.1.24):
    `cd '<folder>' 2>/dev/null; ` before the shell's command, which the
    login shell reads."""
    bash = shell.plan("shell=/bin/bash\nbash=/bin/bash\nbash_version=5.2\n",
                      "/srv/my shop")
    assert bash.command.startswith("cd '/srv/my shop' 2>/dev/null; exec bash"), \
        bash.command
    zsh = shell.plan("shell=/usr/bin/zsh\nzsh=/usr/bin/zsh\n", "/srv/x")
    assert zsh.command.startswith("cd '/srv/x' 2>/dev/null; ZDOTDIR="), zsh.command
    bare = shell.plan("shell=/bin/ash\nbash=\nzsh=\n", "/srv/x")
    assert bare.command.startswith("cd '/srv/x' 2>/dev/null; exec"), bare.command
    assert shell.plan("shell=/bin/bash\nbash=/bin/bash\n").command.startswith(
        "exec bash"), "no folder: as before"
    # A quote stays inside the quotes; fish reads them alike.
    assert shell.start_in("/srv/it's", "/usr/bin/fish") == \
        "cd '/srv/it'\\''s' 2>/dev/null; "
    # Not started in: a login shell that reads other words, no whole path,
    # a backslash (fish would end the quotes at \'), control characters,
    # anything too long.
    for folder, login in [("/srv/x", "/bin/csh"), ("/srv/x", "/usr/bin/nu"),
                          ("/srv/x", ""), ("srv/x", "/bin/bash"),
                          ("~/x", "/bin/bash"), ("/srv/a\\'b", "/usr/bin/fish"),
                          ("/srv/a\nb", "/bin/bash"), ("/srv/a\x1bb", "/bin/bash"),
                          ("/" + "x" * shell.FOLDER_MAX, "/bin/bash")]:
        assert shell.start_in(folder, login) == "", (folder, login)
    assert shell.plan("", "/srv/x").command == 'exec "${SHELL:-/bin/sh}" -l', \
        "nothing known of the login shell: home"


def test_block_keeps_the_start_and_the_end():
    block = terminals.Block(command="yes", cwd="/", branch="", seq_start=1,
                            started_at=None)  # type: ignore[arg-type]
    for i in range(3000):
        block.add(f"{i:06d}".encode() * 100)
    out, cut = block.output()
    assert cut and len(out) == terminals.BLOCK_HEAD + terminals.BLOCK_TAIL
    assert out.startswith(b"000000") and out.endswith(b"002999")
    small = terminals.Block(command="ls", cwd="/", branch="", seq_start=1,
                            started_at=None)  # type: ignore[arg-type]
    small.add(b"a\r\n")
    assert small.output() == (b"a\r\n", False)


def test_cut_output_stays_on_its_screen():
    """A full-screen program's last screens, without its start, are drawn
    on its second screen, not as a jumble on the main one (found by the
    owner with top on his Mac, 14.10)."""
    frames = b"".join(b"\x1b[H" + b"%06d " % i * 10 + b"\r\n"
                      for i in range(3000))
    output = b"before\r\n\x1b[?1049h" + frames + b"\x1b[?1049l"
    row = {"output": zlib.compress(output), "id": 1, "seq_start": 1,
           "seq_end": 2, "command": "top", "cwd": "", "branch": "",
           "started_at": None, "finished_at": None, "exit_code": 0,
           "cols": 80, "output_cut": False}
    sent = terminals._block_json(row)  # type: ignore[arg-type]
    tail = base64.b64decode(sent["output"])
    assert sent["partial"] and tail.startswith(b"\x1b[?1049h\x1b[H"), tail[:20]
    assert tail.endswith(b"\x1b[?1049l")
    plain = dict(row, output=zlib.compress(b"x\r\n" * 40000))
    assert not base64.b64decode(terminals._block_json(plain)["output"]) \
        .startswith(b"\x1b"), "plain output starts as it was"
    # The middle left out: the program started in it.
    block = terminals.Block(command="make; top", cwd="/", branch="",
                            seq_start=1, started_at=None)  # type: ignore[arg-type]
    for i in range(30000):          # 720 KB: past what the start keeps
        block.add(b"line %06d of the build\r\n" % i)
    block.add(b"\x1b[?1049h")
    for i in range(40000):
        block.add(b"\x1b[H" + b"%06d " % i * 5 + b"\r\n")
    block.add(b"\x1b[?1049l")
    out, cut = block.output()
    head = terminals.BLOCK_HEAD
    assert cut and out[head:head + 8] == b"\x1b[?1049h", out[head:head + 20]
    assert out.endswith(b"\x1b[?1049l")


# ------------------------------------------------------- the real shells

def _deploy(home: Path, login_shell: str) -> str:
    result = subprocess.run(
        ["sh", "-s"], input=shell.deploy_script(), capture_output=True,
        text=True, env={"HOME": str(home), "SHELL": login_shell,
                        "PATH": os.environ.get("PATH", "/usr/bin:/bin")})
    assert result.returncode == 0, result.stderr
    return result.stdout


class Pty:
    """A shell in a pty, started the way the core starts it."""

    def __init__(self, home: Path, login_shell: str, command: str) -> None:
        self.master, slave = pty.openpty()
        attrs = termios.tcgetattr(slave)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(slave, termios.TCSANOW, attrs)
        env = {"HOME": str(home), "SHELL": login_shell, "TERM": "xterm-256color",
               "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "USER": "tterm"}
        self.proc = subprocess.Popen(
            [login_shell, "-c", command], stdin=slave, stdout=slave,
            stderr=slave, env=env, cwd=home, start_new_session=True)
        os.close(slave)
        self.parser = shell.MarkerParser(KEY)
        self.screen = b""
        self.marks: list[shell.Marker] = []
        os.write(self.master, KEY.encode() + b"\n")

    def read_until(self, count: int, kind: str = "P", timeout: float = 15) -> None:
        """Reads until `count` markers of `kind` have come in all."""
        end = time.monotonic() + timeout
        while sum(m.kind == kind for m in self.marks) < count:
            left = end - time.monotonic()
            assert left > 0, f"no {kind} marker; screen: {self.screen[-400:]!r}"
            ready, _, _ = select.select([self.master], [], [], min(left, 0.2))
            if not ready:
                continue
            try:
                data = os.read(self.master, 65536)
            except OSError:
                data = b""
            assert data, f"the shell ended; screen: {self.screen[-400:]!r}"
            for piece in self.parser.feed(data):
                if isinstance(piece, bytes):
                    self.screen += piece
                else:
                    self.marks.append(piece)

    def type(self, line: str) -> None:
        os.write(self.master, line.encode() + b"\n")

    def close(self) -> None:
        # The pty goes first: on macOS a dying process waits until what it
        # wrote last is read, and nobody would read it any more.
        os.close(self.master)
        with contextlib.suppress(ProcessLookupError):
            self.proc.kill()
        self.proc.wait(10)


def _home() -> Path:
    home = Path(tempfile.mkdtemp(prefix="tthome"))
    (home / ".bashrc").write_text("HISTCONTROL=ignoreboth\nPS1='$ '\n")
    (home / ".profile").write_text('[ -n "$BASH" ] && . ~/.bashrc\n')
    (home / ".zshrc").write_text(
        "HISTFILE=~/.zsh_history\nHISTSIZE=100\nSAVEHIST=100\n"
        "setopt hist_ignore_space\nPROMPT='%% '\n")
    (home / "repo" / ".git").mkdir(parents=True)
    (home / "repo" / ".git" / "HEAD").write_text("ref: refs/heads/feature/x\n")
    # A folder with a space in its name, as a Mac has many.
    (home / "my repo" / ".git").mkdir(parents=True)
    (home / "my repo" / ".git" / "HEAD").write_text("ref: refs/heads/spaced\n")
    return home


def test_deploy_puts_the_scripts_in_place():
    home = _home()
    try:
        out = _deploy(home, "/bin/bash")
        assert "shell=/bin/bash" in out and "bash=" in out
        for target, source in shell.FILES.items():
            written = home / ".tterm" / target
            assert written.read_text() == shell.template(source), target
            assert written.stat().st_mode & 0o077 == 0, f"{target} is private"
        assert not list((home / ".tterm").rglob("*.[0-9]*")), "no leftovers"
        _deploy(home, "/bin/bash")          # again, over the old ones
    finally:
        shutil.rmtree(home, ignore_errors=True)


def _run_shell(login_shell: str, full: bool) -> None:
    home = _home()
    p = None
    failed = True
    try:
        plan = shell.plan(_deploy(home, login_shell))
        assert plan.markers
        p = Pty(home, login_shell, plan.command)
        p.read_until(1)
        assert KEY.encode() not in p.screen, "the key never shows"
        first = p.marks[-1]
        # On macOS /var is /private/var: the shell reports the real path.
        assert os.path.realpath(first.field(1)) == os.path.realpath(home)
        assert first.field(2) == str(home)
        p.type("echo hello")
        p.read_until(2)
        assert b"hello" in p.screen
        p.type("false")
        p.read_until(3)
        assert p.marks[-1].field(0) == "1", "the exit code comes along"
        p.type("cd repo")
        p.read_until(4)
        assert p.marks[-1].field(3) == "feature/x", "the branch, with its /"
        p.type(" echo secret")
        p.read_until(5)
        p.type('echo "a;b%c"')
        p.read_until(6)
        commands = [m.field(0) for m in p.marks if m.kind == "C"]
        if full:
            assert commands[:2] == ["echo hello", "false"], commands
            assert commands[3].strip() == "echo secret", \
                "a command history skips is still recorded"
            assert commands[4] == 'echo "a;b%c"', commands
        p.type("fc -ln -10")
        p.read_until(7)
        listed = p.screen.rsplit(b"fc -ln -10", 1)[-1]
        assert b"secret" not in listed, "but it stays out of history, as asked"
        # In a folder with a space in its name the branch is still found,
        # and the prompt says nothing more (0.1.3: bash split the path).
        p.type('cd "$HOME/my repo"')
        p.read_until(8)
        assert p.marks[-1].field(3) == "spaced", p.marks[-1]
        assert p.marks[-1].field(1).endswith("/my repo"), p.marks[-1]
        assert b"not a valid identifier" not in p.screen, p.screen[-400:]
        failed = False
    finally:
        try:
            if p:
                p.close()
        except Exception:
            # A failure above says more than one in cleaning up after it.
            if not failed:
                raise
        shutil.rmtree(home, ignore_errors=True)


def _first_folder(login_shell: str, folder: str, make: bool = False) -> str:
    """Where a shell started with `folder` (0.1.24) says it is, at its first
    prompt; with "!" after it if it said anything of cd before, and
    "!pwned" if a command hidden in the folder's name ran."""
    home = _home()
    p = None
    try:
        where = folder.replace("{home}", str(home))
        if make:
            os.makedirs(where)
        p = Pty(home, login_shell,
                shell.plan(_deploy(home, login_shell), where).command)
        p.read_until(1)
        said = p.screen.decode("utf-8", "replace")
        pwned = any("pwned" in files for _, _, files in os.walk(home))
        return (os.path.realpath(p.marks[-1].field(1))
                .replace(os.path.realpath(home), "{home}")
                + ("!" if "cd" in said or "No such" in said else "")
                + ("!pwned" if pwned else ""))
    finally:
        if p:
            p.close()
        shutil.rmtree(home, ignore_errors=True)


def test_real_shells_start_in_the_folder():
    # Each login shell there is that reads the words (sh, dash, fish...: the
    # login shell reads them, bash or zsh runs in the folder).
    tried = 0
    for login in sorted(shell._READS_CD):
        found = shutil.which(login)
        if not found:
            continue
        tried += 1
        got = _first_folder(found, "{home}/my repo")
        assert got == "{home}/my repo", (login, got)
        # Gone by now: at home, without a word.
        got = _first_folder(found, "{home}/gone")
        assert got == "{home}", (login, got)
        # Names that try to end the quotes: they stay letters.
        for odd in ("{home}/it's $HOME; ok", "{home}/x'$(touch pwned)'",
                    "{home}/a''b", "{home}/end'", "{home}/`touch pwned`"):
            got = _first_folder(found, odd, make=True)
            assert got == odd, (login, odd, got)
    assert tried >= 2, "bash and sh at least"


def test_bash_prints_markers():
    if not shutil.which("bash"):
        return
    _run_shell(shutil.which("bash") or "bash", _bash_full())


def test_zsh_prints_markers():
    if not shutil.which("zsh"):
        return
    _run_shell(shutil.which("zsh") or "zsh", True)


# ------------------------------------------------- terminals through SSH

def _login_shell() -> tuple[str, bool]:
    """The shell for the SSH checks: bash where it can mark commands,
    zsh otherwise (macOS)."""
    if _bash_full():
        return shutil.which("bash") or "bash", True
    if shutil.which("zsh"):
        return shutil.which("zsh") or "zsh", True
    return shutil.which("bash") or "bash", False


async def _machine(core, port: int, host_key) -> uuid.UUID:
    cas = await core.signer.keys()
    await remember_cas(core.pool, cas)
    ca = next(c for c in cas if c["active"])
    project = await core.pool.fetchval(
        "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
    return await core.pool.fetchval(
        """
        INSERT INTO machines (project_id, kind, name, host, port, login,
                              host_keys, ca_id, created_by)
        VALUES ($1, 'server', 'lab', '127.0.0.1', $2, 'tterm', $3, $4, $5)
        RETURNING id
        """, project, port,
        [host_key.export_public_key().decode().strip()], ca["id"],
        core.owner.id)


async def _until(check, timeout: float = 15, what: str = "") -> None:
    end = time.monotonic() + timeout
    while not check():
        assert time.monotonic() < end, f"timed out waiting for {what}"
        await asyncio.sleep(0.05)


def _prompts(t: terminals.Terminal) -> int:
    return sum(1 for e in t.events if e.kind == "ev" and e.data["t"] == "P")


def _screen(t: terminals.Terminal) -> bytes:
    return b"".join(e.data for e in t.events if e.kind == "out")


async def test_a_terminal_runs_over_ssh_and_keeps_blocks(h):
    login, full = _login_shell()
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 100, 30)
            assert t.label == "P/lab" and t.state == "connecting"
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            assert t.state == "open" and t.markers and t.shell
            assert KEY.encode() not in _screen(t)
            assert t._key.encode() not in _screen(t), "the key never shows"
            t.write(b"echo hello\n")
            await _until(lambda: _prompts(t) >= 2, what="echo")
            t.write(b"(exit 3)\n")
            await _until(lambda: _prompts(t) >= 3, what="exit 3")
            t.resize(120, 40)
            t.write(b"stty size\n")
            await _until(lambda: _prompts(t) >= 4, what="stty")
            assert b"40 120" in _screen(t), "the size reached the shell"
            if full:
                rows = []

                async def saved() -> bool:
                    nonlocal rows
                    rows = await core.pool.fetch(
                        "SELECT command, exit_code, cwd, output, output_cut, "
                        "output_text FROM blocks WHERE terminal_id = $1 "
                        "ORDER BY id", t.id)
                    return len(rows) >= 3

                end = time.monotonic() + 10
                while not await saved():
                    assert time.monotonic() < end, "blocks were not saved"
                    await asyncio.sleep(0.05)
                assert [r["command"] for r in rows[:3]] == \
                    ["echo hello", "(exit 3)", "stty size"], rows
                assert [r["exit_code"] for r in rows[:3]] == [0, 3, 0]
                assert os.path.realpath(rows[0]["cwd"]) == \
                    os.path.realpath(home)
                output = zlib.decompress(rows[0]["output"])
                assert b"hello" in output and b"\x1b]6973" not in output
                # Its text, for search (0.1.7).
                assert rows[0]["output_text"] == "hello", rows[0]["output_text"]
            second = await core.terminals.open(core.owner, machine_id, 80, 24)
            assert second.name == "2" and second.label == "P/lab · 2"
            await _until(lambda: second.state == "open", what="the second")
            await second.close()
            # The folder it ends in is kept, and Open a new terminal starts
            # there (0.1.24).
            t.write(b'cd "$HOME/my repo"\n')
            await _until(lambda: _prompts(t) >= 5, what="cd")
            t.write(b"exit\n")
            await _until(lambda: t.state == "ended", what="the end")
            assert "ended" in (t.reason or "") or "code" in (t.reason or "")
            row = await core.pool.fetchrow(
                "SELECT closed_at, end_reason, shell, last_seq, last_cwd "
                "FROM terminals WHERE id = $1", t.id)
            assert row["closed_at"] and row["end_reason"] and row["shell"]
            assert row["last_seq"] == t.last_seq
            folder = os.path.join(os.path.realpath(home), "my repo")
            assert os.path.realpath(row["last_cwd"]) == folder, row["last_cwd"]
            info = await core.terminals.ended(t.id, core.owner.id)
            assert os.path.realpath(info["cwd"]) == folder, info
            third = await core.terminals.open(core.owner, machine_id, 80, 24,
                                              cwd=info["cwd"])
            await _until(lambda: _prompts(third) >= 1, what="the third")
            first = next(e.data for e in third.events
                         if e.kind == "ev" and e.data["t"] == "P")
            assert os.path.realpath(first["cwd"]) == folder, first
            await third.close()
            kinds = [r["kind"] for r in await core.pool.fetch(
                "SELECT kind FROM journal WHERE terminal_id = $1 ORDER BY id",
                t.id)]
            # Each command that ended is a line of the machine's log
            # (0.1.20), between the terminal's opening and its end.
            assert kinds[0] == "terminal.opened", kinds
            assert kinds[-1] == "terminal.closed", kinds
            assert set(kinds[1:-1]) <= {"command.ran"}, kinds
            if full:
                assert kinds.count("command.ran") >= 3, kinds
            assert second.reason == "Closed."
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def test_a_server_is_removed(h):
    """Remove machine (0.0.8), a server: its terminals end and say why, it is
    no longer listed nor signed in to, its commands stay in the history,
    and tTerm Web takes its line out of the server (0.0.12); if the server
    does not answer, the answer has the command that does it there. Only
    the owner and admins may remove it."""
    login, full = _login_shell()
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 80, 24)
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            if full:
                t.write(b"echo before-the-removal\n")
                await _until(lambda: _prompts(t) >= 2, what="echo")
            project = await core.pool.fetchval(
                "SELECT project_id FROM machines WHERE id = $1", machine_id)
            member, stranger = [await core.pool.fetchval(
                "INSERT INTO users (name) VALUES ($1) RETURNING id", name)
                for name in ("Member", "Stranger")]
            await core.pool.execute(
                "INSERT INTO project_members (project_id, user_id, role) "
                "VALUES ($1, $2, 'member')", project, member)
            try:
                await machines.remove(core.pool, member, machine_id)
            except PermissionError:
                pass
            else:
                raise AssertionError("a member removed a machine")
            assert await machines.remove(core.pool, stranger, machine_id) is None, \
                "not even seen by someone outside the project"

            # The first terminal gave the server a line of its own.
            keys_file = home / ".ssh" / "authorized_keys"
            row = await core.pool.fetchrow(
                "SELECT principal, own_line, ca_id FROM machines WHERE id = $1",
                machine_id)
            assert row["own_line"] and f'principals="{row["principal"]}"' \
                in keys_file.read_text()
            ca_id = row["ca_id"]
            r = await request(core.page_port, "DELETE",
                              f"/api/machines/{machine_id}", headers=CHANGE)
            assert r.status == 200, r.text
            assert r.json() == {"id": str(machine_id), "name": "lab",
                                "kind": "server", "accessRemoved": True}, r.json()
            assert "cert-authority" not in keys_file.read_text(), \
                "the server answered: its line is out"
            # The same server in two projects, still with the line from
            # before 0.0.12: removed from one, it gets a line of its own for
            # the other, and the old line goes.
            old_line(home, await _ca_public(core))
            async with core.pool.acquire() as conn:
                other = await conn.fetchval(
                    "INSERT INTO projects (owner_id, name, code) VALUES ($1, "
                    "'Work', 'W') RETURNING id", core.owner.id)
                await conn.execute(
                    "INSERT INTO project_members (project_id, user_id, role) "
                    "VALUES ($1, $2, 'owner')", other, core.owner.id)
            keys = [host_key.export_public_key().decode().strip()]
            pair = [await core.pool.fetchval(
                "INSERT INTO machines (project_id, kind, name, host, port, login, "
                "host_keys, ca_id) VALUES ($1, 'server', 'lab', '127.0.0.1', $2, "
                "'tterm', $3, $4) RETURNING id", where, port, keys, ca_id)
                for where in (project, other)]
            r = await request(core.page_port, "DELETE",
                              f"/api/machines/{pair[0]}", headers=CHANGE)
            assert r.status == 200 and r.json()["accessRemoved"] is True, r.json()
            left = await core.pool.fetchrow(
                "SELECT principal, own_line FROM machines WHERE id = $1", pair[1])
            assert left["own_line"], "the other one has a line of its own now"
            assert [line.split()[0] for line in keys_file.read_text().splitlines()
                    if "cert-authority" in line] == [
                f'cert-authority,principals="{left["principal"]}"'], \
                keys_file.read_text()
            # A server that does not answer: the command for the server itself.
            dead = socket.socket()
            dead.bind(("127.0.0.1", 0))
            await core.pool.execute("UPDATE machines SET port = $2 WHERE id = $1",
                                    pair[1], dead.getsockname()[1])
            dead.close()
            r = await request(core.page_port, "DELETE",
                              f"/api/machines/{pair[1]}", headers=CHANGE)
            assert r.status == 200 and r.json()["cleanup"] == \
                machines.server_cleanup(left["principal"]), r.json()
            await _until(lambda: t.state == "ended", what="its end")
            assert t.reason == "lab was removed from tTerm Web.", t.reason
            state = (await request(core.page_port, "GET", "/api/state")).json()
            assert [m for p in state["projects"] for m in p["machines"]] == [] \
                and state["terminals"] == [], state
            try:
                await core.terminals.open(core.owner, machine_id, 80, 24)
            except terminals.NotAllowed:
                pass
            else:
                raise AssertionError("a terminal on a removed server")
            # Its tab still says why it ended.
            r = await request(core.page_port, "GET", f"/api/terminals/{t.id}")
            assert r.json()["reason"] == t.reason, r.json()
            if full:
                history = await core.terminals.history(t.id, core.owner.id)
                assert {"command": "echo before-the-removal", "here": True} \
                    in (history or []), history
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def test_an_old_line_is_rewritten_at_the_first_sign_in(h):
    """0.0.12: a server connected before has the line that takes any
    certificate of the CA for the user tterm. The first terminal there puts
    in a line of its own for each machine that is this server, in every
    project, and takes the old line out; from then on a certificate for the
    user tterm gets nowhere there, nor does one for another principal."""
    login, _ = _login_shell()
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            mine = await _machine(core, port, host_key)
            other = await core.pool.fetchval(
                "INSERT INTO projects (owner_id, name, code) VALUES ($1, "
                "'Work', 'W') RETURNING id", core.owner.id)
            await core.pool.execute(
                "INSERT INTO project_members (project_id, user_id, role) "
                "VALUES ($1, $2, 'owner')", other, core.owner.id)
            ca_id = await core.pool.fetchval(
                "SELECT ca_id FROM machines WHERE id = $1", mine)
            theirs = await core.pool.fetchval(
                "INSERT INTO machines (project_id, kind, name, host, port, login, "
                "host_keys, ca_id, principal) VALUES ($1, 'server', 'lab', "
                "'127.0.0.1', $2, 'tterm', $3, $4, $5) RETURNING id", other,
                port, [host_key.export_public_key().decode().strip()], ca_id,
                trust.new_principal())
            keys_file = home / ".ssh" / "authorized_keys"
            assert keys_file.read_text().startswith("cert-authority ssh-ed25519 ")
            opened: list[terminals.Terminal] = []
            try:
                await _old_line_rewritten(core, mine, theirs, ca_id, port,
                                          host_key, keys_file, opened)
            finally:
                for terminal in opened:
                    await terminal.close()
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def _old_line_rewritten(core, mine, theirs, ca_id, port, host_key,
                              keys_file, opened) -> None:
    t = await core.terminals.open(core.owner, mine, 80, 24)
    opened.append(t)
    await _until(lambda: _prompts(t) >= 1, what="the first prompt")
    rows = await core.pool.fetch(
        "SELECT id, principal, own_line FROM machines ORDER BY created_at")
    assert all(r["own_line"] and r["principal"] for r in rows), rows
    lines = keys_file.read_text().splitlines()
    ca_key = await _ca_public(core)
    assert sorted(lines) == sorted(
        trust.line(r["principal"], ca_key, ca_id) for r in rows), lines
    assert stat_mode(keys_file) == 0o600
    # The other project's machine is the same server: its terminal
    # comes in with a certificate for it alone.
    u = await core.terminals.open(core.owner, theirs, 80, 24)
    opened.append(u)
    await _until(lambda: _prompts(u) >= 1, what="the other project")
    # A certificate for the user tterm gets nowhere now, nor does
    # one for some other server.
    for principal in ("tterm", trust.new_principal()):
        try:
            conn = await ssh.connect(
                core.signer, host="127.0.0.1", port=port, login="tterm",
                host_keys=[host_key.export_public_key().decode().strip()],
                who="x", principal=principal, ca=ca_id)
        except asyncssh.PermissionDenied:
            pass
        else:
            conn.close()
            raise AssertionError(f"{principal} got in")
    # The database missed it (the line was put in, the core stopped
    # before writing so): the machine's own certificate gets in.
    await core.pool.execute(
        "UPDATE machines SET own_line = false WHERE id = $1", theirs)
    w = await core.terminals.open(core.owner, theirs, 80, 24)
    opened.append(w)
    await _until(lambda: _prompts(w) >= 1, what="the own line")
    assert await core.pool.fetchval(
        "SELECT own_line FROM machines WHERE id = $1", theirs) is True
    assert sorted(keys_file.read_text().splitlines()) == sorted(lines)


def stat_mode(path: Path) -> int:
    return path.stat().st_mode & 0o777


async def _ca_public(core) -> str:
    cas = await core.signer.keys()
    return next(c for c in cas if c["active"])["public_key"]


async def test_a_terminal_that_cannot_connect_says_why(h):
    async with h.core() as core:
        cas = await core.signer.keys()
        await remember_cas(core.pool, cas)
        project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
        key = asyncssh.generate_private_key("ssh-ed25519")
        closed = _free_port()
        machine_id = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, host, port, login, "
            "host_keys, ca_id) VALUES ($1, 'server', 'gone', '127.0.0.1', $2, "
            "'tterm', $3, $4) RETURNING id", project, closed,
            [key.export_public_key().decode().strip()], cas[0]["id"])
        t = await core.terminals.open(core.owner, machine_id, 80, 24)
        await _until(lambda: t.state == "ended", what="the refusal")
        assert "connection refused" in (t.reason or ""), t.reason
        try:
            await core.terminals.open(core.owner, uuid.uuid4(), 80, 24)
        except terminals.NotAllowed:
            pass
        else:
            raise AssertionError("opened a terminal on no machine")


def _free_port() -> int:
    """A port nothing listens on."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


async def test_terminals_left_by_the_last_run_are_closed(h):
    async with h.core() as core:
        project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
        machine = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name) VALUES ($1, 'server', "
            "'old') RETURNING id", project)
        tid = await core.pool.fetchval(
            "INSERT INTO terminals (machine_id, owner_id, name) VALUES ($1, $2, "
            "'1') RETURNING id", machine, core.owner.id)
        await core.terminals.close_left(terminals.__version__)
        row = await core.pool.fetchrow(
            "SELECT closed_at, end_reason FROM terminals WHERE id = $1", tid)
        assert row["closed_at"] and "stopped" in row["end_reason"]
        info = await core.terminals.ended(tid, core.owner.id)
        assert info and info["state"] == "gone" and info["label"] == "P/old"
        # With its line in the log (0.1.24): the last run did not write it.
        said = await core.pool.fetchval(
            "SELECT details->>'reason' FROM journal WHERE terminal_id = $1 "
            "AND kind = 'terminal.closed'", tid)
        assert said == terminals.STOPPED, said


async def test_a_release_says_so_of_the_terminals_it_ended(h):
    """A start of another version is a release (0.1.24): the terminals the
    stop before it ended, and those left open, say "tTerm Web was updated
    to …" on their tabs and in the log; nothing else changes. The first
    start that keeps its version goes by the minutes before it."""
    async with h.core() as core:
        pool, me = core.pool, core.owner.id
        project = await pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", me)
        machine = await pool.fetchval(
            "INSERT INTO machines (project_id, kind, name) VALUES ($1, 'server', "
            "'web') RETURNING id", project)
        run = await pool.fetchval("SELECT max(started_at) FROM core_runs")
        assert run, "the core's own start is kept"

        async def terminal(closed: dt.datetime | None, reason: str | None,
                           cwd: str | None = None) -> uuid.UUID:
            tid = await pool.fetchval(
                "INSERT INTO terminals (machine_id, owner_id, name, closed_at, "
                "end_reason, last_cwd) VALUES ($1, $2, '1', $3, $4, $5) "
                "RETURNING id", machine, me, closed, reason, cwd)
            if reason:
                async with pool.acquire() as conn:
                    await accounts.journal(
                        conn, "terminal.closed", project_id=project, user_id=me,
                        machine_id=machine, terminal_id=tid,
                        details={"reason": reason})
            return tid

        async def reason(tid: uuid.UUID) -> str:
            return (await core.terminals.ended(tid, me))["reason"]

        now = await pool.fetchval("SELECT now()")
        by_stop = await terminal(now, terminals.STOPPED, "/srv/shop")
        left_open = await terminal(None, None)
        before = await terminal(run - dt.timedelta(hours=1), terminals.STOPPED)
        closed = await terminal(now, "Closed.")
        await core.terminals.close_left("9.9.9")
        update = "tTerm Web was updated to 9.9.9."
        assert await reason(by_stop) == update
        assert await reason(left_open) == update
        assert await reason(before) == terminals.STOPPED, \
            "an older stop is not this release's"
        assert await reason(closed) == "Closed."
        info = await core.terminals.ended(by_stop, me)
        assert info["cwd"] == "/srv/shop", info
        assert (await core.terminals.ended(closed, me))["cwd"] == ""
        # The log says what the tab says.
        start = now - dt.timedelta(hours=12)
        lines = (await logs.day(pool, me, machine, start,
                                start + dt.timedelta(hours=24)))["entries"]
        why = {e["terminal"]["id"]: e["reason"] for e in lines
               if e["kind"] == "terminal.closed"}
        assert why[str(by_stop)] == update and why[str(closed)] == "Closed.", why
        assert why[str(before)] == terminals.STOPPED, why
        assert why[str(left_open)] == update, "left open: its line, at the start"

        # The same version again: a restart, not a release.
        again = await terminal(None, None)
        await core.terminals.close_left("9.9.9")
        assert await reason(again) == terminals.STOPPED
        assert await reason(by_stop) == update, "and what was said stays"
        # Another version next: the start before closed `again` at its very
        # moment, not its stop; that stays as it was.
        await core.terminals.close_left("9.9.11")
        assert await reason(again) == terminals.STOPPED

        # A run that kept no version (gone back to one before 0.1.24) for
        # days: a stop of a day ago is not the next release's.
        await pool.execute("UPDATE core_runs SET started_at = now() - "
                           "interval '3 days'")
        day_ago = await terminal(now - dt.timedelta(days=1), terminals.STOPPED)
        await core.terminals.close_left("9.9.12")
        assert await reason(day_ago) == terminals.STOPPED

        # The first start that keeps its version: the minutes before it.
        await pool.execute("DELETE FROM core_runs")
        recent = await terminal(now - dt.timedelta(minutes=3), terminals.STOPPED)
        older = await terminal(now - dt.timedelta(hours=2), terminals.STOPPED)
        await core.terminals.close_left("9.9.10")
        assert await reason(recent) == "tTerm Web was updated to 9.9.10."
        assert await reason(older) == terminals.STOPPED


# ------------------------------------------------------------ the socket

async def _frames(ws, until, timeout: float = 15) -> list:
    """What the socket sends until `until` says so, but its first word, the
    vault's challenge (0.1.28): no terminal's."""
    got = []
    end = time.monotonic() + timeout
    while not until(got):
        left = end - time.monotonic()
        assert left > 0, f"timed out; got {got[-5:]!r}"
        msg = await asyncio.wait_for(ws.recv(), left)
        frame = json.loads(msg) if isinstance(msg, str) else msg
        if isinstance(frame, dict) and frame.get("op") == "vault.challenge":
            continue
        got.append(frame)
    return got


def _output(frames) -> bytes:
    return b"".join(f[13:] for f in frames if isinstance(f, bytes))


def _last_seq(frames) -> int:
    seq = 0
    for f in frames:
        if isinstance(f, bytes):
            seq = int.from_bytes(f[5:13], "big")
        elif "seq" in f:
            seq = f["seq"]
    return seq


async def test_the_socket_streams_replays_and_resumes(h):
    login, _ = _login_shell()
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            r = await request(core.page_port, "POST", "/api/terminals",
                              headers=CHANGE,
                              body=json.dumps({"machineId": str(machine_id),
                                               "cols": 90, "rows": 25}).encode())
            assert r.status == 201, r.text
            tid = r.json()["id"]
            state = (await request(core.page_port, "GET", "/api/state")).json()
            assert [t["id"] for t in state["terminals"]] == [tid]

            def prompted(n):
                return lambda got: sum(1 for f in got if isinstance(f, dict)
                                       and f.get("t") == "P") >= n

            async with page_socket(core.page_port) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 3, "id": tid,
                                          "after": None, "cols": 90, "rows": 25}))
                got = await _frames(ws, prompted(1))
                assert got[0]["op"] == "attached" and not got[0]["resumed"]
                assert got[1]["op"] == "reset"
                await ws.send(bytes([2]) + (3).to_bytes(4, "big") + b"echo one\n")
                got += await _frames(ws, prompted(1))
                assert b"one" in _output(got)
                assert all(f[1:5] == (3).to_bytes(4, "big")
                           for f in got if isinstance(f, bytes))
                seen = _last_seq(got)
            # Back after a moment away: only what came since.
            core.terminals.get(uuid.UUID(tid), core.owner.id).write(b"echo two\n")
            await asyncio.sleep(0.6)
            async with page_socket(core.page_port) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 1, "id": tid,
                                          "after": seen, "cols": 90, "rows": 25}))
                got = await _frames(ws, lambda g: any(
                    isinstance(f, dict) and f["op"] == "replayed" for f in g))
                assert got[0]["op"] == "attached" and got[0]["resumed"]
                assert not any(isinstance(f, dict) and f["op"] == "reset"
                               for f in got)
                assert b"two" in _output(got) and b"one" not in _output(got)
                # What was missed comes before the mark that it is all old
                # news, so the page's terminal answers nothing in it.
                assert got[-1]["op"] == "replayed"
            # A page that comes back empty gets everything kept.
            async with page_socket(core.page_port) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 1, "id": tid,
                                          "after": None, "cols": 90, "rows": 25}))
                got = await _frames(ws, lambda g: b"two" in _output(g))
                assert b"one" in _output(got)
                await ws.send(json.dumps({"op": "attach", "ch": 2,
                                          "id": str(uuid.uuid4())}))
                got = await _frames(ws, lambda g: any(
                    isinstance(f, dict) and f["op"] == "gone" for f in g))
                await ws.send(json.dumps({"op": "close", "ch": 1}))
                got = await _frames(ws, lambda g: any(
                    isinstance(f, dict) and f["op"] == "state"
                    and f["terminal"]["state"] == "ended" for f in g))
            r = await request(core.page_port, "GET", f"/api/terminals/{tid}")
            assert r.json()["state"] in ("ended", "gone")
    finally:
        shutil.rmtree(home, ignore_errors=True)


async def test_the_socket_is_only_for_this_page(h):
    async with h.core() as core:
        for origin in ("http://evil.example", None):
            try:
                async with page_socket(core.page_port, origin=origin) as ws:
                    await asyncio.wait_for(ws.recv(), 2)
            except (websockets.exceptions.InvalidStatus,
                    websockets.exceptions.ConnectionClosed) as exc:
                assert "403" in str(exc) or "1008" in str(exc) or \
                    isinstance(exc, websockets.exceptions.ConnectionClosed), exc
            else:
                raise AssertionError(f"a socket from {origin} was let in")
        r = await request(core.page_port, "POST", "/api/terminals",
                          headers={"content-type": "application/json"},
                          body=json.dumps({"machineId": str(uuid.uuid4())}).encode())
        assert r.status == 403, "no x-tterm, no terminal"
        r = await request(core.page_port, "POST", "/api/terminals",
                          headers=CHANGE,
                          body=json.dumps({"machineId": str(uuid.uuid4())}).encode())
        assert r.status == 404
        r = await request(core.page_port, "POST", "/api/terminals",
                          headers=CHANGE,
                          body=json.dumps({"machineId": str(uuid.uuid4()),
                                           "cwd": "/" + "x" * 70000}).encode())
        assert r.status == 422, "no folder is that long (0.1.24)"
        r = await request(core.page_port, "GET",
                          f"/api/terminals/{uuid.uuid4()}")
        assert r.status == 404


async def test_the_page_gets_a_fresh_style_number(h):
    async with h.core() as core:
        first = await request(core.page_port, "GET", "/")
        second = await request(core.page_port, "GET", "/t/" + str(uuid.uuid4()))
        nonces = []
        for r in (first, second):
            csp = r.headers["content-security-policy"]
            assert "unsafe-inline" not in csp and "'nonce-" in csp
            nonce = csp.split("'nonce-", 1)[1].split("'", 1)[0]
            assert f'<meta name="tt-style-nonce" content="{nonce}">' in r.text
            assert r.text.lower().startswith("<!doctype html>")
            nonces.append(nonce)
        assert nonces[0] != nonces[1], "a new number every time"
        js = await request(core.page_port, "GET", "/assets/index.js")
        assert "'nonce-" not in js.headers["content-security-policy"]

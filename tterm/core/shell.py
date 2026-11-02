"""The shell on the other end of a terminal, and what we read from it.

A terminal is a real login shell in a real pty, as plain `ssh` gives. The
shell also prints invisible markers, the way iTerm2, VS Code and Warp do:
before each prompt (the exit code, the directory, the git branch) and when
a command starts (its text). From them the core cuts the stream into
blocks. The scripts that make the shell do this live in templates/shell/;
this module puts them on the machine, starts the shell with them, and takes
the markers back out of the stream so the screen never shows them.

A marker is an OSC sequence that carries a one-time key:

    ESC ] 6973 ; <key> ; <type> ; <field> ; ... BEL

Programs can print anything, so a marker without the key is not ours and
passes through untouched. The key reaches the shell as the first line typed
into it, with echo off, and lives only in the shell's memory: not in a file,
not in the environment, not in the command line.
"""
from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from importlib import resources
from urllib.parse import unquote_to_bytes

#: The OSC number of our markers. Nothing else uses it.
OSC = b"6973"

#: Where the scripts go on the machine, under the login user's home.
FOLDER = ".tterm"

#: A marker with a longer body is not one: a command's text can be long, a
#: pasted script, but not this long.
MARKER_MAX = 256 * 1024

#: What goes where: the file on the machine, the script it is made from.
FILES = {
    "bash.sh": "bash.sh",
    "zsh/.zshenv": "zshenv.zsh",
    "zsh/.zprofile": "zprofile.zsh",
    "zsh/.zshrc": "zshrc.zsh",
    "zsh/.zlogin": "zlogin.zsh",
}

_EOF = "__TTERM_END_OF_FILE__"


def new_key() -> str:
    return secrets.token_hex(16)


def template(name: str) -> str:
    return (resources.files("tterm.templates") / "shell" / name).read_text()


def deploy_script() -> str:
    """A POSIX sh script, fed to `sh -s`: writes the scripts into ~/.tterm
    and says which shells there are.

    Written on every terminal, so a machine always has the scripts of the
    tTerm Web that opens it. Each file goes in under a temporary name and is
    renamed into place, so a terminal opening at the same moment never reads
    half a file.
    """
    parts = [
        "umask 077",
        "set -e",
        f'd="$HOME/{FOLDER}"',
        'mkdir -p "$d/zsh"',
    ]
    for target, source in FILES.items():
        text = template(source)
        if _EOF in text:
            raise ValueError(f"{source} contains the end-of-file marker")
        parts.append(f'cat > "$d/{target}.$$" <<\'{_EOF}\'\n{text}{_EOF}')
        parts.append(f'mv -f "$d/{target}.$$" "$d/{target}"')
    parts += [
        "set +e",
        "printf 'shell=%s\\n' \"${SHELL:-}\"",
        "printf 'bash=%s\\n' \"$(command -v bash 2>/dev/null)\"",
        "printf 'zsh=%s\\n' \"$(command -v zsh 2>/dev/null)\"",
        # Commands get a start marker from bash 4.4 on (PS0).
        "if command -v bash >/dev/null 2>&1; then printf 'bash_version=%s\\n' "
        "\"$(bash -c 'echo \"${BASH_VERSINFO[0]}.${BASH_VERSINFO[1]}\"' "
        "2>/dev/null)\"; fi",
    ]
    return "\n".join(parts) + "\n"


@dataclass(frozen=True)
class Plan:
    """How to start the shell: which one, the command, whether it has our
    markers, and whether it marks the start of each command too, which is
    what cuts the stream into blocks."""
    shell: str          # "bash", "zsh", or the login shell's own name
    command: str
    markers: bool
    blocks: bool = False


def plan(deploy_output: str, folder: str = "") -> Plan:
    """The login shell decides, as with plain ssh: zsh if it is zsh,
    otherwise bash. Without bash (a bare busybox) the login shell starts as
    it is, and the terminal works without blocks. bash older than 4.4 has
    no PS0: it marks its prompts, but not where commands start.

    `folder`, from 0.1.24: where the shell starts, the folder the terminal
    it replaces was in (see start_in)."""
    found: dict[str, str] = {}
    for line in deploy_output.splitlines():
        name, sep, value = line.partition("=")
        if sep:
            found[name.strip()] = value.strip()
    login = found.get("shell", "")
    first = start_in(folder, login)
    if login.rsplit("/", 1)[-1] == "zsh" and found.get("zsh"):
        return Plan("zsh",
                    first + f'ZDOTDIR="$HOME/{FOLDER}/zsh" exec zsh -il',
                    True, True)
    if found.get("bash"):
        return Plan("bash",
                    first + f'exec bash --init-file "$HOME/{FOLDER}/bash.sh" -i',
                    True, _version(found.get("bash_version", "")) >= (4, 4))
    name = login.rsplit("/", 1)[-1] or "sh"
    return Plan(name, first + 'exec "${SHELL:-/bin/sh}" -l', False)


#: The login shells that read the words of start_in alike: sshd and the
#: agent run the shell's command with the login shell, `$SHELL -c`. Any
#: other (csh, nu...) starts the shell in the home folder, as before.
_READS_CD = frozenset({"sh", "bash", "zsh", "dash", "ash", "ksh", "mksh",
                       "yash", "fish"})
#: A longer folder is not started in.
FOLDER_MAX = 1024


def start_in(folder: str, login: str) -> str:
    """The words before the shell's command that start it in `folder`:
    "Open a new terminal" on a terminal that ended starts where it was
    (0.1.24). Empty when there is no folder, when the login shell is not
    one of _READS_CD, and for a folder that is not a whole path or has a
    control character or a backslash in it: inside single quotes fish
    reads a backslash before a quote as the quote itself, and the folder
    must not end the quotes. A folder that is gone by then, or that cannot
    be entered, leaves the shell in the home folder, without a word."""
    if (not folder.startswith("/") or len(folder) > FOLDER_MAX
            or "\\" in folder or any(ord(c) < 32 or ord(c) == 127 for c in folder)
            or login.rsplit("/", 1)[-1] not in _READS_CD):
        return ""
    quoted = "'" + folder.replace("'", "'\\''") + "'"
    return f"cd {quoted} 2>/dev/null; "


def _version(text: str) -> tuple[int, int]:
    major, _, minor = text.partition(".")
    try:
        return int(major), int(minor or 0)
    except ValueError:
        return 0, 0


# --------------------------------------------------------------- markers


@dataclass(frozen=True)
class Marker:
    """One marker from the shell.

    P, before a prompt: code, cwd, home, branch, venv, PATH.
    C, a command starts: its text, and how the command before it ended (a
    line of several commands has a start marker for each and a prompt only
    after the last).
    """
    kind: str
    fields: tuple[str, ...]

    def field(self, i: int) -> str:
        return self.fields[i] if i < len(self.fields) else ""


class MarkerParser:
    """Takes our markers out of a terminal's byte stream, as it arrives.

    feed() returns what came, in order: bytes for the screen and Marker
    objects. A marker split between two reads is held back until it is
    whole, and so is anything at the end that may be the start of one, so
    the screen never gets half a marker.
    """

    def __init__(self, key: str) -> None:
        self.start = b"\x1b]" + OSC + b";"
        self.ours = self.start + key.encode() + b";"
        self._held = b""

    def feed(self, data: bytes) -> list[bytes | Marker]:
        buf = self._held + data
        self._held = b""
        out: list[bytes | Marker] = []
        pos = 0
        while True:
            i = buf.find(self.start, pos)
            if i < 0:
                keep = _partial_prefix(buf, pos, self.start)
                out.append(buf[pos:keep])
                self._held = buf[keep:]
                break
            if i > pos:
                out.append(buf[pos:i])
            rest = buf[i:i + len(self.ours)]
            if len(rest) < len(self.ours):
                if self.ours.startswith(rest):
                    self._held = buf[i:]        # may be ours: wait for more
                    break
                out.append(buf[i:i + len(self.start)])
                pos = i + len(self.start)
                continue
            if rest != self.ours:
                # An OSC 6973 without our key: not ours, the screen gets it.
                out.append(buf[i:i + len(self.start)])
                pos = i + len(self.start)
                continue
            body_at = i + len(self.ours)
            end = buf.find(b"\x07", body_at)
            if end < 0:
                if len(buf) - body_at > MARKER_MAX:
                    out.append(buf[i:i + len(self.start)])
                    pos = i + len(self.start)
                    continue
                self._held = buf[i:]
                break
            out.append(_marker(buf[body_at:end]))
            pos = end + 1
        return [piece for piece in out if not isinstance(piece, bytes) or piece]

    def flush(self) -> bytes:
        """Whatever was held back, when the stream ends."""
        held, self._held = self._held, b""
        return held


def _partial_prefix(buf: bytes, pos: int, start: bytes) -> int:
    """Where a possible beginning of `start` sits at the very end of buf."""
    for n in range(min(len(start) - 1, len(buf) - pos), 0, -1):
        if start.startswith(buf[-n:]):
            return len(buf) - n
    return len(buf)


def _marker(body: bytes) -> Marker:
    parts = body.split(b";")
    kind = parts[0].decode("ascii", "replace")
    fields = tuple(unquote_to_bytes(p).decode("utf-8", "replace")
                   for p in parts[1:])
    return Marker(kind, fields)


# ------------------------------------------------------------ zsh's mark

_SP = re.compile(rb"( *)\r( *)\r\Z")
_SGR = rb"(?:\x1b\[[0-9;]*m)*"


def strip_eol_mark(output: bytes, cols: int) -> bytes:
    """Takes zsh's partial-line mark off the end of a command's output.

    zsh prints it before the prompt hook runs, so it lands at the end of
    every block: the mark (an inverse %), spaces up to the edge, \\r, as many
    spaces as the mark is wide, \\r. On a screen the prompt then draws over
    it; in a block it would stay as a stray line.
    """
    tail = output[-(cols + 512):]
    m = _SP.search(tail)
    if not m or len(m.group(1)) + len(m.group(2)) != cols:
        return output
    head = output[: len(output) - len(m.group(0))]
    width = len(m.group(2))
    if width:
        mark = re.search(_SGR + rb"(?:[^\x1b\r\n]" + _SGR + rb"){%d}\Z" % width,
                         head[-512:])
        if mark:
            head = head[: len(head) - len(mark.group(0))]
    return head


# ---------------------------------------------------------- screen modes

_MODES = re.compile(rb"\x1b\[\?([0-9;]+)([hl])|\x1b([=>c])")

#: DEC private modes that change how the screen behaves or what the keys
#: send. When the start of the stream is gone, these are set again before a
#: replay, so the screen behaves as it did.
TRACKED = {
    1: "app_cursor", 6: "origin", 7: "wrap", 25: "cursor",
    47: "alt", 1047: "alt", 1049: "alt",
    1000: "mouse_x11", 1002: "mouse_button", 1003: "mouse_any",
    1004: "focus", 1005: "mouse_utf8", 1006: "mouse_sgr", 1015: "mouse_urxvt",
    2004: "paste",
}
DEFAULTS = {"wrap": True, "cursor": True}


class Modes:
    """Follows the screen modes a byte stream sets, without drawing it."""

    def __init__(self) -> None:
        self.state: dict[int, bool] = {}
        self.keypad = False
        self._tail = b""

    def feed(self, data: bytes) -> None:
        buf = self._tail + data
        for m in _MODES.finditer(buf):
            if m.group(3) is not None:
                c = m.group(3)
                if c == b"=":
                    self.keypad = True
                elif c == b">":
                    self.keypad = False
                else:                       # ESC c: full reset
                    self.state.clear()
                    self.keypad = False
                continue
            on = m.group(2) == b"h"
            for p in m.group(1).split(b";"):
                if p.isdigit() and int(p) in TRACKED:
                    self.state[int(p)] = on
        # A sequence cut at the end of this read is finished by the next.
        cut = buf.rfind(b"\x1b")
        self._tail = buf[cut:][:32] if cut >= 0 and len(buf) - cut < 32 else b""

    @property
    def alt_screen(self) -> bool:
        return any(self.state.get(m) for m in (47, 1047, 1049))

    def restore(self) -> bytes:
        """The sequences that bring a fresh screen to these modes."""
        seq = []
        for mode, on in sorted(self.state.items()):
            default = DEFAULTS.get(TRACKED[mode], False)
            if on != default:
                seq.append(b"\x1b[?%d%s" % (mode, b"h" if on else b"l"))
        if self.keypad:
            seq.append(b"\x1b=")
        return b"".join(seq)

    def copy(self) -> "Modes":
        other = Modes()
        other.state = dict(self.state)
        other.keypad = self.keypad
        other._tail = self._tail
        return other

    def switch_to(self, other: "Modes") -> bytes:
        """The sequences that take a screen in these modes to `other`'s:
        where the middle of a stream is left out, what follows it is drawn
        on the screen it was meant for."""
        seq = []
        for mode in sorted(set(self.state) | set(other.state)):
            default = DEFAULTS.get(TRACKED[mode], False)
            now = other.state.get(mode, default)
            if self.state.get(mode, default) != now:
                seq.append(b"\x1b[?%d%s" % (mode, b"h" if now else b"l"))
        if self.keypad != other.keypad:
            seq.append(b"\x1b=" if other.keypad else b"\x1b>")
        return b"".join(seq)

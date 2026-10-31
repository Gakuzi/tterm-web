"""Commands worth asking about twice.

The same small set the Telegram bot holds back, for the same reasons. A
command typed into tTerm's own input line can come from history, from a
suggestion accepted with one key, or from "Run again" on an old block, and
the terminal it lands in is not always the one you think you are looking at.

The set is deliberately small: a terminal that asks about everything trains
people to confirm without reading, which is worse than not asking at all.

What qualifies: the damage is immediate, and nothing brings it back. Deleting
a file tree, wiping a disk, dropping a database, cutting the machine off the
network. Not `git reset --hard`: unpleasant, but the work is usually still
somewhere. Not `rm file.txt`: one file, named deliberately.

In the classic mode keys go straight to the shell and nothing is checked;
the page says so.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Danger:
    """Why a command was held back."""

    pattern: re.Pattern[str]
    what: str          # what it does, in plain words
    lost: str          # what does not come back


#: Ordered by how bad it is, because the first match wins and the worst
#: description should be the one shown.
#:
#: The page says `what` and `lost` in the language shown (0.1.16): it knows
#: each by these exact English words (web/src/danger.ts) and has them as
#: strings of its own, danger.* of web/src/i18n. A new rule or other words
#: here need both (tests: the page says every held-back command). tTerm for
#: Mac's engine has the same rules (engine/src/danger.rs).
RULES: list[Danger] = [
    Danger(
        re.compile(r"\brm\b(?=[^|;&]*\s(?:-\w*[rR]\w*|--recursive)\b)"
                   r"(?=[^|;&]*\s(?:-\w*[fF]\w*|--force)\b)", re.I),
        "delete a directory and everything inside it",
        "There is no undo and no bin to look in.",
    ),
    Danger(
        re.compile(r"\bmkfs(\.\w+)?\b|\bfdisk\b|\bparted\b|\bwipefs\b", re.I),
        "rewrite a disk's filesystem",
        "Everything on that disk goes, not just files.",
    ),
    Danger(
        re.compile(r"\bdd\b[^|;&]*\bof=\s*/dev/", re.I),
        "write directly onto a device",
        "Whatever was on it is gone the moment this starts.",
    ),
    Danger(
        re.compile(r"\b(DROP\s+(DATABASE|TABLE)|TRUNCATE\s+TABLE)\b", re.I),
        "drop a database or a table",
        "Only a backup brings it back.",
    ),
    Danger(
        re.compile(r"\b(shutdown|poweroff|halt)\b|\binit\s+0\b", re.I),
        "turn the machine off",
        "Nothing here can turn it back on: that needs the provider's panel.",
    ),
    Danger(
        re.compile(r"\breboot\b|\binit\s+6\b", re.I),
        "reboot the machine",
        "The session drops, and whatever was running stops with it.",
    ),
    Danger(
        re.compile(r"\bsystemctl\s+(stop|disable|mask)\s+(ssh|sshd)\b", re.I),
        "stop the SSH service",
        "That is the way in. Stopping it locks the door from the inside.",
    ),
    Danger(
        re.compile(r"\bufw\s+(deny|reject)\b|\biptables\b[^|;&]*\bDROP\b", re.I),
        "change the firewall",
        "A wrong rule can cut the machine off with no way back in.",
    ),
    Danger(
        re.compile(r"\buserdel\b|\bdeluser\b", re.I),
        "delete a user account",
        "Their files and access go with them.",
    ),
]

#: A recursive delete aimed here is not a slip worth one question but one to
#: be called out: nothing on the machine survives it.
ROOT_TARGETS = re.compile(
    r"\brm\b[^|;&]*\s(?:/|/\*|~|~/|~/\*|/\w+/\.\.|\$HOME|\${HOME})\s*(?:$|[|;&])"
)


def looks_destructive(command: str) -> Danger | None:
    """The rule this command trips, or None. A command of several lines is
    looked at line by line, so that `rm` on one line and `-rf` on another
    do not add up to a delete."""
    lines = [line.strip() for line in command.splitlines() if line.strip()]
    for rule in RULES:
        if any(rule.pattern.search(line) for line in lines):
            return rule
    return None


def hits_everything(command: str) -> bool:
    """Whether a recursive delete points at the root or a home directory."""
    return any(ROOT_TARGETS.search(line.strip())
               for line in command.splitlines())

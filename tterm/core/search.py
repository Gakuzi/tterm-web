"""Search over everything (0.1.7): the core's part of it.

The palette (Cmd+K) finds terminals, machines, projects and things to do on
the page itself, which has them all. What only the core has is here: every
command of every terminal of the person's, ended ones too, as long as its
project keeps output (output_days); what those commands printed; notes,
whole, in the projects the person is in; and, from 0.1.21, the logs of the
machines: the commands run there and the notes under them, as long as the
project keeps its journal (a year), in the projects the person is in.

A query is words: each must be there, in any order and any case, and a word
may sit inside another (`cert` finds `certbot`). The page ranks what comes
back and draws it.

What a command printed is kept compressed, escape sequences and all. Search
reads a copy of it as plain text, the start and the end of a long one
(`plain`), made when the block is saved. Blocks saved before 0.1.7 get
theirs in the background, a few hundred at a time (`fill_texts`).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import re
import uuid
import zlib

import asyncpg

from . import logs

log = logging.getLogger("tterm.search")

#: Of a long output, the text search reads: this much from the start and
#: this much from the end.
TEXT_HEAD = 8 * 1024
TEXT_TAIL = 8 * 1024
#: A query: this long at most, this many words.
QUERY_MAX = 200
WORDS_MAX = 8
#: Rows looked at for each kind, and found of each kind sent back.
SCAN_MAX = 400
OUTPUT_SCAN_MAX = 200
FOUND_MAX = 40
#: Lines of output that come with a block found: the start of its output,
#: or the place in it where the words are. Each line at most so long.
EXCERPT_LINES = 8
LINE_MAX = 300
#: Of a note found, the blocks around the place.
NOTE_LINES = 6
#: Commands for the palette before anything is typed.
RECENT_MAX = 5
#: Blocks made text of at a time, in the background.
FILL_BATCH = 200

# Escape sequences: CSI (colours, the cursor, erasing), OSC (titles, links),
# the string ones (DCS, SOS, PM, APC), character sets, and the rest of two
# characters.
_ESCAPES = re.compile(
    r"\x1b\[[0-?]*[ -/]*[@-~]"
    r"|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?"
    r"|\x1b[PX^_][^\x1b]*(?:\x1b\\)?"
    r"|\x1b[()*+][0-~]"
    r"|\x1b[ -/]*[0-~]")
#: Control characters but the tab; line breaks are dealt with before.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


# ------------------------------------------------------------------ text

def _line(raw: str) -> str:
    """One line as the screen leaves it: a carriage return goes back to
    the start of the line, so a progress bar ends as its last state, and a
    backspace one character back."""
    if "\r" not in raw and "\b" not in raw:
        return raw
    cells: list[str] = []
    at = 0
    for ch in raw:
        if ch == "\r":
            at = 0
        elif ch == "\b":
            at = max(0, at - 1)
        else:
            if at < len(cells):
                cells[at] = ch
            else:
                cells.append(ch)
            at += 1
    return "".join(cells)


def plain(output: bytes) -> str:
    """What a terminal printed, as text to search: the escape sequences
    out, each line as the screen leaves it, no control characters; of a
    long output its start and its end, whole lines."""
    text = _ESCAPES.sub("", output.decode("utf-8", "replace")).replace("\r\n", "\n")
    lines = [_CONTROL.sub("", _line(line)).rstrip() for line in text.split("\n")]
    text = "\n".join(lines).strip("\n")
    if len(text) > TEXT_HEAD + TEXT_TAIL:
        head, tail = text[:TEXT_HEAD], text[-TEXT_TAIL:]
        if "\n" in head:
            head = head[:head.rfind("\n")]
        if "\n" in tail:
            tail = tail[tail.find("\n") + 1:]
        text = f"{head}\n…\n{tail}"
    return text


def words(query: str) -> list[str]:
    """The words of a query, in lower case, each once; control characters
    are spaces."""
    found: list[str] = []
    for word in _CONTROL.sub(" ", query[:QUERY_MAX]).lower().split():
        if word not in found:
            found.append(word)
    return found[:WORDS_MAX]


def _like(word: str) -> str:
    """The pattern that finds the word anywhere, its own % and _ as
    themselves."""
    word = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{word}%"


def _has(text: str, ws: list[str]) -> bool:
    low = text.lower()
    return all(w in low for w in ws)


def _cut(line: str) -> str:
    return line if len(line) <= LINE_MAX else line[:LINE_MAX] + "…"


def _ms(moment: dt.datetime | None) -> int | None:
    return int(moment.timestamp() * 1000) if moment is not None else None


# ------------------------------------------------------------- commands

#: A block with where it ran: what the page needs to show it and open it.
_BLOCKS = """
    SELECT b.id, b.terminal_id, b.seq_start, b.command, b.cwd, b.branch,
           b.exit_code, b.started_at, b.finished_at, {text} AS text,
           t.machine_id, t.name AS terminal, t.closed_at, t.home,
           m.name AS machine, m.kind AS machine_kind, m.removed_at,
           p.id AS project_id, p.code, p.name AS project
    FROM blocks b
    JOIN terminals t ON t.id = b.terminal_id
    JOIN machines m ON m.id = t.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE t.owner_id = $1 AND b.kind = 'command' AND b.expires_at > now()
"""


def _block(row: asyncpg.Record) -> dict:
    """A block found, as the page shows it: the command, how it ended,
    where and when, and its terminal as its tab names it."""
    label = f"{row['code']}/{row['machine']}"
    if row["terminal"] and row["terminal"] != "1":
        label += f" · {row['terminal']}"
    return {
        "terminalId": str(row["terminal_id"]),
        "seq": row["seq_start"],
        "command": row["command"] or "",
        "cwd": row["cwd"] or "",
        "home": row["home"] or "",
        "branch": row["branch"] or "",
        "exitCode": row["exit_code"],
        "startedAt": _ms(row["started_at"]),
        "finishedAt": _ms(row["finished_at"]),
        "machineId": str(row["machine_id"]),
        "machine": row["machine"],
        "machineKind": row["machine_kind"],
        "removed": row["removed_at"] is not None,
        "projectId": str(row["project_id"]),
        "code": row["code"],
        "project": row["project"],
        "terminal": label,
        "ended": row["closed_at"] is not None,
        "endedAt": _ms(row["closed_at"]),
    }


def _lines(text: str | None) -> list[str]:
    return text.split("\n") if text else []


async def _starts(db: asyncpg.Connection, ids: list[int]) -> dict[int, list[str]]:
    """The first lines of what these blocks printed: read only for the
    blocks sent, not for every one looked at."""
    rows = await db.fetch(
        "SELECT id, left(output_text, 4000) AS text FROM blocks "
        "WHERE id = ANY($1::bigint[])", ids)
    return {r["id"]: [_cut(x) for x in _lines(r["text"])[:EXCERPT_LINES]]
            for r in rows}


def _not_hidden(ws: list[str]) -> str:
    """None of the machines closed to the device asking (0.1.28): the
    parameter after the words."""
    return f" AND NOT (m.id = ANY(${len(ws) + 2}::uuid[]))"


async def _commands(db: asyncpg.Connection, user_id: uuid.UUID,
                    ws: list[str],
                    hidden: list[uuid.UUID] | None = None) -> tuple[list[dict], bool]:
    """Commands with every word in them, the latest run of each on each
    machine, with how many runs there were and the start of its output."""
    where = " ".join(f"AND b.command ILIKE ${i + 2}" for i in range(len(ws)))
    rows = await db.fetch(
        _BLOCKS.format(text="NULL") + where + _not_hidden(ws) +
        f" ORDER BY b.started_at DESC LIMIT {SCAN_MAX}",
        user_id, *[_like(w) for w in ws], list(hidden or []))
    found: dict[tuple, dict] = {}
    ids: dict[tuple, int] = {}
    for row in rows:
        key = (row["command"], row["machine_id"])
        if key in found:
            found[key]["runs"] += 1
            continue
        found[key] = {**_block(row), "runs": 1, "lines": [], "hit": -1}
        ids[key] = row["id"]
    listed = list(found.values())[:FOUND_MAX]
    starts = await _starts(db, [ids[k] for k in list(found)[:FOUND_MAX]])
    for key, block in zip(list(found)[:FOUND_MAX], listed):
        block["lines"] = starts.get(ids[key], [])
    return listed, len(found) > FOUND_MAX or len(rows) >= SCAN_MAX


async def _output(db: asyncpg.Connection, user_id: uuid.UUID,
                  ws: list[str],
                  hidden: list[uuid.UUID] | None = None) -> tuple[list[dict], bool]:
    """Blocks whose output has every word, with the line where they are
    (or the first of them) and the lines around it."""
    where = " ".join(f"AND b.output_text ILIKE ${i + 2}" for i in range(len(ws)))
    rows = await db.fetch(
        _BLOCKS.format(text="b.output_text") + where + _not_hidden(ws) +
        f" ORDER BY b.started_at DESC LIMIT {OUTPUT_SCAN_MAX}",
        user_id, *[_like(w) for w in ws], list(hidden or []))
    found: dict[tuple, dict] = {}
    for row in rows:
        lines = _lines(row["text"])
        at = next((i for i, line in enumerate(lines) if _has(line, ws)), -1)
        if at < 0:
            at = next((i for i, line in enumerate(lines) if ws[0] in line.lower()), 0)
        line = lines[at] if lines else ""
        key = (row["command"], row["machine_id"], line)
        if key in found:
            continue
        start = max(0, at - 2)
        found[key] = {**_block(row), "line": _cut(line.strip()),
                      "lines": [_cut(x) for x in lines[start:start + EXCERPT_LINES]],
                      "hit": at - start, "lineNo": at}
    listed = list(found.values())
    return listed[:FOUND_MAX], len(listed) > FOUND_MAX or len(rows) >= OUTPUT_SCAN_MAX


# ----------------------------------------------------------------- notes

def _blocks_of(body) -> list[dict]:
    if isinstance(body, str):
        body = json.loads(body)
    return [b for b in (body or []) if isinstance(b, dict)]


async def _notes(db: asyncpg.Connection, user_id: uuid.UUID,
                 ws: list[str]) -> tuple[list[dict], bool]:
    """Notes of the person's projects with every word in their title or
    text, with the block where the words are and the blocks around it. The
    words are looked for in what is written, block by block, not in the
    JSON the note is kept as (its keys, its escapes)."""
    where = " ".join(
        f"AND (n.title ILIKE ${i + 2} OR w.text ILIKE ${i + 2})"
        for i in range(len(ws)))
    rows = await db.fetch(
        f"""
        SELECT n.id, n.title, n.body, n.edited_at, f.id AS folder_id,
               f.name AS folder, p.id AS project_id, p.code, p.name AS project
        FROM notes n
        JOIN note_folders f ON f.id = n.folder_id
        JOIN projects p ON p.id = f.project_id
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
        CROSS JOIN LATERAL (
            SELECT coalesce(string_agg(e ->> 'text', E'\n'), '') AS text
            FROM jsonb_array_elements(n.body) e) w
        WHERE (pm.until IS NULL OR pm.until > now()) {where}
        ORDER BY n.edited_at DESC
        LIMIT {SCAN_MAX}
        """, user_id, *[_like(w) for w in ws])
    found: list[dict] = []
    for row in rows:
        title = row["title"] or ""
        blocks = [b for b in _blocks_of(row["body"]) if b.get("type") != "hr"]
        texts = [str(b.get("text", "")) for b in blocks]
        # Rules (hr) and odd blocks aside, the words must be in what shows.
        if not _has(title + "\n" + "\n".join(texts), ws):
            continue
        at = next((i for i, t in enumerate(texts) if _has(t, ws)), -1)
        if at < 0:
            missing = [w for w in ws if w not in title.lower()]
            at = next((i for i, t in enumerate(texts)
                       if missing and any(w in t.lower() for w in missing)), -1)
        start = max(0, at - 1) if at >= 0 else 0
        near = blocks[start:start + NOTE_LINES]
        found.append({
            "noteId": str(row["id"]),
            "title": title,
            "folderId": str(row["folder_id"]),
            "folder": row["folder"],
            "projectId": str(row["project_id"]),
            "code": row["code"],
            "project": row["project"],
            "editedAt": _ms(row["edited_at"]),
            "inTitle": _has(title, ws),
            "blockId": blocks[at]["id"] if at >= 0 else None,
            "text": _cut(texts[at].split("\n", 1)[0]) if at >= 0 else "",
            "lines": [{"text": _cut(str(b.get("text", ""))), "type": b.get("type"),
                       "done": b.get("done") is True} for b in near],
            "hit": at - start if at >= 0 else -1,
        })
    return found[:FOUND_MAX], len(found) > FOUND_MAX or len(rows) >= SCAN_MAX


# --------------------------------------------------------------- search

async def recent(db: asyncpg.Connection, user_id: uuid.UUID,
                 machine_id: uuid.UUID | None) -> list[dict]:
    """What the palette offers before anything is typed: the commands the
    person runs most on this machine, the latest run of each."""
    if machine_id is None:
        return []
    rows = await db.fetch(
        "SELECT * FROM (SELECT DISTINCT ON (x.command) x.*, "
        "count(*) OVER (PARTITION BY x.command) AS runs FROM ("
        + _BLOCKS.format(text="NULL")
        + " AND t.machine_id = $2 AND b.command <> '') x "
        "ORDER BY x.command, x.started_at DESC) y "
        f"ORDER BY runs DESC, started_at DESC LIMIT {RECENT_MAX}",
        user_id, machine_id)
    starts = await _starts(db, [r["id"] for r in rows])
    return [{**_block(r), "runs": r["runs"], "lines": starts.get(r["id"], []),
             "hit": -1} for r in rows]


async def search(pool: asyncpg.Pool, user_id: uuid.UUID, query: str, *,
                 near: uuid.UUID | None = None,
                 hidden: list[uuid.UUID] | None = None,
                 hidden_logs: list[uuid.UUID] | None = None) -> dict:
    """Everything of the person's with all the words of `query` in it:
    commands, output, the machines' logs and notes, the latest first.
    Nothing typed: the commands they run most on the machine `near`.
    Nothing of the machines closed to the device asking (0.1.28): `hidden`
    for terminals, `hidden_logs` for the logs."""
    ws = words(query)
    async with pool.acquire() as db:
        if not ws:
            return {"words": [], "commands": [], "output": [], "notes": [],
                    "logs": [], "more": {},
                    "recent": ([] if near in (hidden or [])
                               else await recent(db, user_id, near))}
        # One after another, on one connection: a person typing fast takes
        # one of the core's connections, not four.
        commands, more_c = await _commands(db, user_id, ws, hidden)
        output, more_o = await _output(db, user_id, ws, hidden)
        notes, more_n = await _notes(db, user_id, ws)
        found, more_l = await logs.found_in_logs(db, user_id, ws, hidden_logs)
    return {"words": ws, "commands": commands, "output": output,
            "notes": notes, "logs": found, "recent": [],
            "more": {"commands": more_c, "output": more_o, "notes": more_n,
                     "logs": more_l}}


# ------------------------------------------------------ the text of blocks

def text_of(compressed: bytes | None) -> str:
    """The text search reads, from a block's output as the database keeps
    it; an output that cannot be read gives none."""
    if not compressed:
        return ""
    try:
        return plain(zlib.decompress(compressed))
    except zlib.error:
        return ""


async def fill_texts(pool: asyncpg.Pool, pause: float = 0.2) -> int:
    """The text to search for blocks saved before 0.1.7, the newest first,
    a batch at a time with a pause between: the core goes on serving
    meanwhile. Returns how many blocks got it."""
    done = 0
    while True:
        rows = await pool.fetch(
            "SELECT id, output FROM blocks WHERE output_text IS NULL "
            "AND output IS NOT NULL AND expires_at > now() "
            "ORDER BY id DESC LIMIT $1", FILL_BATCH)
        if not rows:
            if done:
                log.info("search: made the text of %d earlier blocks", done)
            return done
        texts = await asyncio.to_thread(
            lambda: [(r["id"], text_of(r["output"])) for r in rows])
        # A block redacted meanwhile (0.1.20) keeps nothing to search.
        await pool.executemany(
            "UPDATE blocks SET output_text = $2 WHERE id = $1 "
            "AND output IS NOT NULL", texts)
        done += len(rows)
        await asyncio.sleep(pause)

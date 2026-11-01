"""The log of a machine (0.1.20): what was run on it through tTerm, a day
at a time, with notes under the lines.

Every command a terminal runs is a line of the journal, `command.ran`,
written with its block and in the same transaction (terminals.py,
_save_block): when it started, who ran it, how it ended, how long it took
and where. Its words are kept beside the journal, in log_texts; the journal
row keeps their fingerprint, salted. Terminals opened and ended are lines
of the log too (`terminal.opened`, `terminal.closed`).

Under a line, notes (`log.note`), by a person or by an AI on a person's
behalf: the AI then may do no more than that person may. What is written
is never changed or taken back; a note is answered with another. Everyone
in the project reads the log, the owner, admins and members write notes,
an observer only reads. One sees the lines written in projects one is in:
a machine moved into a project brings no one there the lines from before.

A password or a token that got into a command or a note is redacted by the
project's owner or an admin (`log.redacted`): its words go for good, from
the log, the terminal's feed and search, with what the command printed,
and the log keeps who redacted it, when and why.

Lines are kept as long as the project keeps its journal (a year), what the
commands printed as long as it keeps output (30 days). A note and a
redaction leave with their line.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import json
import re
import secrets
import uuid

import asyncpg

from . import accounts, photos

#: The lines of a machine's log.
KINDS = ("terminal.opened", "command.ran", "terminal.closed")
#: Who may write notes; who may redact (as notes.WRITERS and MANAGERS).
WRITERS = ("owner", "admin", "member")
MANAGERS = ("owner", "admin")
NOTE_MAX = 4000
REASON_MAX = 200
AI_MAX = 100
#: Lines of one day at most; a day with more says so.
DAY_MAX = 1000
#: A day as the page asks for it: its own midnight to the next, 23 to 25
#: hours where the clocks change; never more than this.
SPAN_MAX = dt.timedelta(hours=26)
#: A note from the feed may name a block whose line is still being written
#: (the block of a command that just ended): looked for again this often.
LATE_TRIES = 4
SALT_BYTES = 16

#: Control characters but the tab and the line break: nothing a note needs.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
#: Marks that turn text around or wall part of it off (U+202E): a line of
#: the log must read as it was written.
_STEER = re.compile(r"[‪-‮⁦-⁩]")


class Refused(Exception):
    """Not done; the message says why, `status` is the HTTP answer."""
    status = 422


class NotFound(Refused):
    status = 404


class NotAllowed(Refused):
    status = 403


class Invalid(Refused):
    status = 422


class Taken(Refused):
    status = 409


def fingerprint(salt: bytes, text: str) -> str:
    """What the journal keeps of a text: its words cannot be changed
    without it showing, nor guessed from it once the salt is gone."""
    return hashlib.sha256(salt + text.encode("utf-8")).hexdigest()


def _storable(text: str) -> str:
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise Invalid("The text has a broken character in it.") from None
    return text


def clean_note(text: object) -> str:
    """A note as written: line breaks kept, controls and marks that steer
    the text out, spaces at its ends trimmed. Invalid if empty or long."""
    if not isinstance(text, str):
        raise Invalid("A note is text.")
    text = _storable(text).replace("\r\n", "\n").replace("\r", "\n")
    text = _STEER.sub("", _CONTROL.sub("", text)).strip()
    if not text:
        raise Invalid("Write the note first.")
    if len(text) > NOTE_MAX:
        raise Invalid(f"A note is at most {NOTE_MAX:,} characters. Split it "
                      "into two.")
    return text


def clean_reason(reason: object) -> str:
    """Why something is redacted: one line, 1 to 200 characters."""
    if not isinstance(reason, str):
        raise Invalid("Say why it is redacted: a password, a token.")
    reason = accounts.one_line(_storable(reason))
    if not reason:
        raise Invalid("Say why it is redacted: a password, a token.")
    if len(reason) > REASON_MAX:
        raise Invalid(f"Say why in at most {REASON_MAX} characters.")
    return reason


def _number(value: int | None) -> bool:
    """A row's id or a block's number as the database keeps them."""
    return value is not None and 0 < value < 2 ** 63


def _ms(when: dt.datetime | None) -> int | None:
    return int(when.timestamp() * 1000) if when is not None else None


def _json(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


async def _text(conn: asyncpg.Connection, text: str,
                expires_at: dt.datetime) -> tuple[int, str]:
    """Keeps the words of a line or a note; their id and fingerprint."""
    salt = secrets.token_bytes(SALT_BYTES)
    text_id = await conn.fetchval(
        "INSERT INTO log_texts (text, salt, expires_at) VALUES ($1, $2, $3) "
        "RETURNING id", text, salt, expires_at)
    return text_id, fingerprint(salt, text)


# -------------------------------------------------------------- writing

async def command_ran(conn: asyncpg.Connection, *, project_id: uuid.UUID,
                      user_id: uuid.UUID, machine_id: uuid.UUID,
                      terminal_id: uuid.UUID, command: str, seq: int,
                      started_at: dt.datetime, finished_at: dt.datetime,
                      exit_code: int | None, cwd: str, branch: str,
                      home: str) -> int | None:
    """The line of a command that ended, in the transaction that saves its
    block; its id. None for a line with nothing typed on it."""
    if not command.strip():
        return None
    expires_at = await conn.fetchval(
        "SELECT now() + make_interval(days => COALESCE("
        "(SELECT journal_days FROM projects WHERE id = $1), $2))",
        project_id, accounts.PERSONAL_JOURNAL_DAYS)
    text_id, fp = await _text(conn, command, expires_at)
    ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
    details = {"seq": seq, "exit": exit_code, "ms": ms, "cwd": cwd or None,
               "branch": branch or None, "home": home or None, "fp": fp}
    return await conn.fetchval(
        """
        INSERT INTO journal (at, project_id, user_id, kind, machine_id,
                             terminal_id, details, expires_at, author, text_id)
        VALUES ($1, $2, $3, 'command.ran', $4, $5, $6::jsonb, $7, 'person', $8)
        RETURNING id
        """, started_at, project_id, user_id, machine_id, terminal_id,
        _json(details), expires_at, text_id)


async def _role(conn: asyncpg.Connection, project_id: uuid.UUID | None,
                user_id: uuid.UUID) -> str | None:
    if project_id is None:
        return None
    return await conn.fetchval(
        "SELECT role FROM project_members WHERE project_id = $1 "
        "AND user_id = $2 AND (until IS NULL OR until > now())",
        project_id, user_id)


_ENTRY = """
    SELECT id, project_id, machine_id, terminal_id, expires_at,
           (details->>'seq')::bigint AS seq
    FROM journal
    WHERE kind = 'command.ran' AND expires_at > now() AND {where}
"""


async def add_note(pool: asyncpg.Pool, user_id: uuid.UUID, text: object, *,
                   entry_id: int | None = None,
                   terminal_id: uuid.UUID | None = None,
                   seq: int | None = None, ai: str | None = None) -> dict:
    """A note under the line `entry_id`, or under the line of the block
    `seq` of a terminal (the feed knows its blocks by their numbers), as
    `user_id` wrote it; with `ai`, the model that wrote it on their behalf,
    with their rights and no more. The note as the log shows it, with the
    line's id as `entry`."""
    text = clean_note(text)
    if ai is not None:
        ai = accounts.one_line(_storable(ai))[:AI_MAX]
        if not ai:
            raise Invalid("Name the model that wrote the note.")
    if entry_id is not None:
        if not _number(entry_id):
            raise NotFound("No such line in the log.")
        where, args = "id = $1", (entry_id,)
    elif terminal_id is not None and seq is not None:
        if not _number(seq):
            raise NotFound("No such line in the log.")
        where = "terminal_id = $1 AND (details->>'seq')::bigint = $2"
        args = (terminal_id, seq)
    else:
        raise Invalid("Say which line the note is under.")
    for attempt in range(LATE_TRIES):
        async with pool.acquire() as conn, conn.transaction():
            entry = await conn.fetchrow(_ENTRY.format(where=where), *args)
            if entry is not None:
                role = await _role(conn, entry["project_id"], user_id)
                if role is None:
                    raise NotFound("No such line in the log.")
                if role not in WRITERS:
                    raise NotAllowed("An observer reads the log and does not "
                                     "write in it.")
                text_id, fp = await _text(conn, text, entry["expires_at"])
                row = await conn.fetchrow(
                    """
                    INSERT INTO journal (project_id, user_id, kind, machine_id,
                                         terminal_id, details, expires_at,
                                         author, ai, text_id, about)
                    VALUES ($1, $2, 'log.note', $3, $4, $5::jsonb, $6, $7, $8,
                            $9, $10)
                    RETURNING id, at
                    """, entry["project_id"], user_id, entry["machine_id"],
                    entry["terminal_id"], _json({"fp": fp}),
                    entry["expires_at"], "ai" if ai else "person", ai,
                    text_id, entry["id"])
                people = await _people(conn, {user_id}, user_id)
                return {"entry": entry["id"], "terminalId": str(entry["terminal_id"]),
                        "seq": entry["seq"],
                        "note": {"id": row["id"], "at": _ms(row["at"]),
                                 "by": people.get(user_id),
                                 "author": "ai" if ai else "person", "ai": ai,
                                 "text": text, "redacted": None}}
        if entry_id is not None or attempt == LATE_TRIES - 1:
            break
        # The block of a command that just ended is saved a moment later.
        await asyncio.sleep(0.4)
    raise NotFound("No such line in the log.")


async def redact(pool: asyncpg.Pool, user_id: uuid.UUID, entry_id: int,
                 reason: object) -> dict:
    """Redacts the words of a line or a note: they go for good, and with a
    command's, its block's command and output (the feed and search). The
    log keeps who did it, when and why. By the project's owner and admins.

    A command's words go from every line of the project that has them too:
    a password typed twice, or run again, is the same password, and the
    input line's history and search would still offer it.

    What came of it, for the page and for the terminals, if they are
    running, to forget the commands too: the kind, the terminal and the
    block's numbers, and the same for the other lines (`also`)."""
    reason = clean_reason(reason)
    if not _number(entry_id):
        raise NotFound("No such line in the log.")
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT id, kind, project_id, machine_id, terminal_id, expires_at,
                   text_id, about, (details->>'seq')::bigint AS seq
            FROM journal
            WHERE id = $1 AND kind IN ('command.ran', 'log.note')
              AND expires_at > now() AND text_id IS NOT NULL
            """, entry_id)
        if row is None:
            raise NotFound("No such line in the log.")
        role = await _role(conn, row["project_id"], user_id)
        if role is None:
            raise NotFound("No such line in the log.")
        if role not in MANAGERS:
            raise NotAllowed("Only the project's owner and admins redact.")
        what = "command" if row["kind"] == "command.ran" else "note"
        words = await conn.fetchval(
            "SELECT text FROM log_texts WHERE id = $1", row["text_id"])
        # The lines to redact, this one first among them, locked in one
        # order: two redactions at once never wait for each other in turn,
        # and the second finds it done.
        lines = await conn.fetch(
            """
            SELECT j.id, j.machine_id, j.terminal_id, j.expires_at, j.text_id,
                   (j.details->>'seq')::bigint AS seq, x.redacted_at
            FROM journal j JOIN log_texts x ON x.id = j.text_id
            WHERE j.id = $1
               OR ($2 AND j.project_id = $3 AND j.kind = 'command.ran'
                   AND j.expires_at > now() AND x.text = $4)
            ORDER BY x.id
            FOR UPDATE OF x
            """, row["id"], what == "command", row["project_id"], words)
        asked = next((x for x in lines if x["id"] == row["id"]), None)
        if asked is None or asked["redacted_at"] is not None:
            raise Taken("This is redacted already.")
        at, ends = None, {}
        for line in (x for x in lines if x["redacted_at"] is None):
            at = await conn.fetchval(
                "UPDATE log_texts SET text = NULL, salt = NULL, "
                "redacted_at = now(), redacted_by = $2, reason = $3 "
                "WHERE id = $1 RETURNING redacted_at",
                line["text_id"], user_id, reason)
            details = {"what": what, "reason": reason}
            if line["id"] != row["id"]:
                details["with"] = row["id"]
            await conn.execute(
                """
                INSERT INTO journal (project_id, user_id, kind, machine_id,
                                     terminal_id, details, expires_at, author,
                                     about)
                VALUES ($1, $2, 'log.redacted', $3, $4, $5::jsonb, $6,
                        'person', $7)
                """, row["project_id"], user_id, line["machine_id"],
                line["terminal_id"], _json(details), line["expires_at"],
                line["id"])
            if what == "command" and line["terminal_id"] is not None:
                ends[line["id"]] = await conn.fetchval(
                    "UPDATE blocks SET command = NULL, output = NULL, "
                    "output_text = NULL, output_cut = false "
                    "WHERE terminal_id = $1 AND seq_start = $2 "
                    "RETURNING seq_end", line["terminal_id"], line["seq"])
        seq = row["seq"]
        if what == "note":
            # The block the note is under, for the feed that shows it.
            seq = await conn.fetchval(
                "SELECT (details->>'seq')::bigint FROM journal WHERE id = $1",
                row["about"])
        people = await _people(conn, {user_id}, user_id)
    also = [{"id": x["id"],
             "terminalId": str(x["terminal_id"]) if x["terminal_id"] else None,
             "seq": x["seq"], "seqEnd": ends.get(x["id"])}
            for x in lines if x["id"] != row["id"] and x["redacted_at"] is None]
    return {"id": row["id"], "what": what,
            "entry": row["about"] if what == "note" else row["id"],
            "terminalId": str(row["terminal_id"]) if row["terminal_id"] else None,
            "seq": seq, "seqEnd": ends.get(row["id"]),
            "redacted": {"by": people.get(user_id), "at": _ms(at),
                         "reason": reason},
            "also": also}


# -------------------------------------------------------------- reading

async def _people(conn: asyncpg.Connection, ids: set[uuid.UUID],
                  viewer: uuid.UUID) -> dict[uuid.UUID, dict]:
    """Who wrote what, as the log shows them."""
    rows = await conn.fetch(
        "SELECT u.id, u.name, ph.updated_at FROM users u "
        "LEFT JOIN photos ph ON ph.user_id = u.id WHERE u.id = ANY($1::uuid[])",
        [i for i in ids if i is not None])
    return {r["id"]: {
        "id": str(r["id"]), "name": r["name"],
        "firstName": accounts.first_name(r["name"]),
        "initials": accounts.initials(r["name"]),
        "photo": (photos.url_for(r["id"], r["updated_at"])
                  if r["updated_at"] is not None else None),
        "me": r["id"] == viewer} for r in rows}


async def _roles(conn: asyncpg.Connection,
                 user_id: uuid.UUID) -> dict[uuid.UUID, str]:
    """The person's projects and their role in each: they see the lines
    written in these."""
    return {r["project_id"]: r["role"] for r in await conn.fetch(
        "SELECT project_id, role FROM project_members WHERE user_id = $1 "
        "AND (until IS NULL OR until > now())", user_id)}


def _redacted(row: asyncpg.Record, people: dict) -> dict | None:
    if row["redacted_at"] is None:
        return None
    return {"by": people.get(row["redacted_by"]), "at": _ms(row["redacted_at"]),
            "reason": row["reason"]}


async def _notes(conn: asyncpg.Connection,
                 entries: list[int]) -> list[asyncpg.Record]:
    if not entries:
        return []
    return await conn.fetch(
        """
        SELECT j.id, j.about, j.at, j.user_id, j.author, j.ai, x.text,
               x.redacted_at, x.redacted_by, x.reason
        FROM journal j JOIN log_texts x ON x.id = j.text_id
        WHERE j.about = ANY($1::bigint[]) AND j.kind = 'log.note'
          AND j.expires_at > now()
        ORDER BY j.id
        """, entries)


def _note(row: asyncpg.Record, people: dict) -> dict:
    return {"id": row["id"], "at": _ms(row["at"]),
            "by": people.get(row["user_id"]), "author": row["author"],
            "ai": row["ai"], "text": row["text"],
            "redacted": _redacted(row, people)}


async def machine_of(conn: asyncpg.Connection, machine_id: uuid.UUID,
                     user_id: uuid.UUID) -> asyncpg.Record:
    """The machine, if the person is in its project; NotFound otherwise,
    as for one that is not there."""
    row = await conn.fetchrow(
        """
        SELECT m.id, m.name, m.kind, m.project_id, p.code, p.name AS project,
               p.journal_days, p.output_days, pm.role
        FROM machines m
        JOIN projects p ON p.id = m.project_id
        JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
        WHERE m.id = $1 AND m.removed_at IS NULL AND p.deleted_at IS NULL
          AND (pm.until IS NULL OR pm.until > now())
        """, machine_id, user_id)
    if row is None:
        raise NotFound("No such machine.")
    return row


async def day(pool: asyncpg.Pool, user_id: uuid.UUID, machine_id: uuid.UUID,
              start: dt.datetime, end: dt.datetime) -> dict:
    """The machine's log from `start` to `end` (the page's day): its lines,
    oldest first, each command with its notes; and when the nearest lines
    before and after are, for the page to go there."""
    if not start < end <= start + SPAN_MAX:
        raise Invalid("A day of the log is from one midnight to the next.")
    async with pool.acquire() as conn:
        machine = await machine_of(conn, machine_id, user_id)
        roles = await _roles(conn, user_id)
        mine = list(roles)
        rows = await conn.fetch(
            """
            SELECT j.id, j.at, j.kind, j.user_id, j.author, j.ai, j.project_id,
                   j.terminal_id, j.details, t.name AS terminal, x.text,
                   x.redacted_at, x.redacted_by, x.reason,
                   CASE WHEN j.kind = 'command.ran' AND j.user_id = $5 THEN
                       EXISTS (SELECT 1 FROM blocks b
                               WHERE b.terminal_id = j.terminal_id
                                 AND b.seq_start = (j.details->>'seq')::bigint
                                 AND b.output IS NOT NULL
                                 AND b.expires_at > now())
                   ELSE false END AS output
            FROM journal j
            LEFT JOIN terminals t ON t.id = j.terminal_id
            LEFT JOIN log_texts x ON x.id = j.text_id
            WHERE j.machine_id = $1 AND j.at >= $2 AND j.at < $3
              AND j.kind = ANY($4::text[]) AND j.expires_at > now()
              AND j.project_id = ANY($6::uuid[])
            ORDER BY j.at, j.id
            LIMIT $7
            """, machine_id, start, end, list(KINDS), user_id, mine,
            DAY_MAX + 1)
        cut = len(rows) > DAY_MAX
        rows = rows[:DAY_MAX]
        notes = await _notes(conn, [r["id"] for r in rows
                                    if r["kind"] == "command.ran"])
        near = """
            SELECT {pick}(at) FROM journal
            WHERE machine_id = $1 AND at {cmp} $2 AND kind = ANY($3::text[])
              AND expires_at > now() AND project_id = ANY($4::uuid[])
        """
        before = await conn.fetchval(near.format(pick="max", cmp="<"),
                                     machine_id, start, list(KINDS), mine)
        after = await conn.fetchval(near.format(pick="min", cmp=">="),
                                    machine_id, end, list(KINDS), mine)
        who = ({r["user_id"] for r in rows} | {r["redacted_by"] for r in rows}
               | {n["user_id"] for n in notes} | {n["redacted_by"] for n in notes})
        people = await _people(conn, who, user_id)
    by_entry: dict[int, list[dict]] = {}
    for n in notes:
        by_entry.setdefault(n["about"], []).append(_note(n, people))
    entries = []
    for r in rows:
        d = json.loads(r["details"]) if isinstance(r["details"], str) else r["details"]
        role = roles.get(r["project_id"])
        entry = {"id": r["id"], "kind": r["kind"], "at": _ms(r["at"]),
                 "by": people.get(r["user_id"]), "author": r["author"],
                 "ai": r["ai"],
                 "terminal": ({"id": str(r["terminal_id"]),
                               "name": r["terminal"] or "1"}
                              if r["terminal_id"] else None)}
        if r["kind"] == "command.ran":
            entry.update({
                "command": r["text"], "redacted": _redacted(r, people),
                "exit": d.get("exit"), "ms": d.get("ms"),
                "cwd": d.get("cwd") or "", "home": d.get("home") or "",
                "branch": d.get("branch") or "", "seq": d.get("seq"),
                "output": bool(r["output"]) and r["redacted_at"] is None,
                "notes": by_entry.get(r["id"], []),
                "canNote": role in WRITERS, "canRedact": role in MANAGERS})
        elif r["kind"] == "terminal.closed":
            entry["reason"] = d.get("reason") or ""
        entries.append(entry)
    return {
        "machine": {"id": str(machine["id"]), "name": machine["name"],
                    "kind": machine["kind"],
                    "projectId": str(machine["project_id"]),
                    "code": machine["code"], "project": machine["project"]},
        "role": machine["role"],
        "keep": {"lines": machine["journal_days"],
                 "output": machine["output_days"]},
        "from": _ms(start), "to": _ms(end),
        "before": _ms(before), "after": _ms(after),
        "entries": entries, "cut": cut,
    }


async def of_blocks(pool: asyncpg.Pool, terminal_id: uuid.UUID,
                    user_id: uuid.UUID, seqs: list[int]) -> dict[int, dict]:
    """For the blocks of a terminal's feed, by their numbers: the line of
    each in the log, its notes, and whether it was redacted."""
    if not seqs:
        return {}
    async with pool.acquire() as conn:
        roles = await _roles(conn, user_id)
        rows = await conn.fetch(
            """
            SELECT j.id, (j.details->>'seq')::bigint AS seq, j.project_id,
                   x.redacted_at, x.redacted_by, x.reason
            FROM journal j JOIN log_texts x ON x.id = j.text_id
            WHERE j.terminal_id = $1 AND j.kind = 'command.ran'
              AND (j.details->>'seq')::bigint = ANY($2::bigint[])
              AND j.expires_at > now() AND j.project_id = ANY($3::uuid[])
            """, terminal_id, seqs, list(roles))
        notes = await _notes(conn, [r["id"] for r in rows])
        who = ({r["redacted_by"] for r in rows} | {n["user_id"] for n in notes}
               | {n["redacted_by"] for n in notes})
        people = await _people(conn, who, user_id)
    by_entry: dict[int, list[dict]] = {}
    for n in notes:
        by_entry.setdefault(n["about"], []).append(_note(n, people))
    return {r["seq"]: {"entry": r["id"], "notes": by_entry.get(r["id"], []),
                       "redacted": _redacted(r, people),
                       "canNote": roles.get(r["project_id"]) in WRITERS}
            for r in rows}


async def counts(pool: asyncpg.Pool, user_id: uuid.UUID,
                 since: dt.datetime) -> dict[str, int]:
    """Commands run on each machine since `since` (the page's midnight),
    for the Logs folder of the sidebar: of the lines the person sees."""
    rows = await pool.fetch(
        """
        SELECT machine_id, count(*) AS n FROM journal
        WHERE kind = 'command.ran' AND at >= $1 AND expires_at > now()
          AND machine_id IS NOT NULL
          AND project_id IN (SELECT project_id FROM project_members
                             WHERE user_id = $2
                               AND (until IS NULL OR until > now()))
        GROUP BY machine_id
        """, since, user_id)
    return {str(r["machine_id"]): r["n"] for r in rows}

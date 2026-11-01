"""The log of a machine (0.1.20): commands as lines, notes under them by
people and by an AI on a person's behalf, redaction, who may do what, how
long it all stays, and the lines brought in from the blocks of before."""
import datetime as dt
import hashlib
import json
import shutil
import tempfile
import uuid
import zlib
from pathlib import Path

import asyncpg

from ..core import accounts, auth, db, logs, search
from .harness import request, shell_server
from .test_feed import _saved
from .test_terminals import (CHANGE, _ca_public, _home, _login_shell,
                             _machine, _prompts, _screen, _until)

ME = "denis@example.com"


def _ms(when: dt.datetime) -> int:
    return int(when.timestamp() * 1000)


def _today() -> tuple[int, int]:
    """Today as the page asks for it: a day around now, in its own zone."""
    start = dt.datetime.now(dt.UTC).replace(hour=0, minute=0, second=0,
                                            microsecond=0)
    return _ms(start), _ms(start + dt.timedelta(days=1))


async def _owner(pool):
    me = await accounts.ensure_local_owner(pool, "Denis Gerasimenko", ME)
    project = (await accounts.projects_of(pool, me.id))[0]
    return me, uuid.UUID(project["id"])


async def _person(pool, email, name):
    async with pool.acquire() as conn, conn.transaction():
        return await auth._make_account(conn, email, name)


async def _join(pool, project_id, person, role):
    await pool.execute(
        "INSERT INTO project_members (project_id, user_id, role) "
        "VALUES ($1, $2, $3)", project_id, person.id, role)


async def _computer(pool, project_id, owner_id, name="web-01"):
    """A machine and a terminal on it, as the rows the log points to."""
    machine = await pool.fetchval(
        "INSERT INTO machines (project_id, kind, name, created_by) "
        "VALUES ($1, 'computer', $2, $3) RETURNING id",
        project_id, name, owner_id)
    terminal = await pool.fetchval(
        "INSERT INTO terminals (machine_id, owner_id, name) "
        "VALUES ($1, $2, '1') RETURNING id", machine, owner_id)
    return machine, terminal


async def _ran(pool, project_id, user_id, machine, terminal, seq, command,
               *, at=None, exit_code=0, block=True):
    """A command that ended: its block and its line, as a terminal saves
    them."""
    at = at or dt.datetime.now(dt.UTC)
    async with pool.acquire() as conn, conn.transaction():
        if block:
            await conn.execute(
                "INSERT INTO blocks (terminal_id, seq_start, seq_end, command, "
                "started_by, started_at, finished_at, exit_code, cwd, output, "
                "output_text, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, "
                "$8, '/srv/app', $9, $10, now() + interval '30 days')",
                terminal, seq, seq + 3, command, user_id, at,
                at + dt.timedelta(milliseconds=412), exit_code,
                zlib.compress(b"some output"), "some output")
        return await logs.command_ran(
            conn, project_id=project_id, user_id=user_id, machine_id=machine,
            terminal_id=terminal, command=command, seq=seq, started_at=at,
            finished_at=at + dt.timedelta(milliseconds=412),
            exit_code=exit_code, cwd="/srv/app", branch="main", home="/root")


async def _refused(kind, call):
    try:
        await call
    except kind as exc:
        return str(exc)
    raise AssertionError(f"not refused: expected {kind.__name__}")


# ---------------------------------------------------------------- schema

async def test_the_words_of_the_log_only_go_by_redaction(h):
    async with h.pool() as pool:
        me, project = await _owner(pool)
        machine, terminal = await _computer(pool, project, me.id)
        entry = await _ran(pool, project, me.id, machine, terminal, 7,
                           "mysql -p'S3cret'")
        row = await pool.fetchrow(
            "SELECT j.details, j.author, x.id, x.text, x.salt FROM journal j "
            "JOIN log_texts x ON x.id = j.text_id WHERE j.id = $1", entry)
        details = json.loads(row["details"])
        assert row["text"] == "mysql -p'S3cret'" and row["author"] == "person"
        assert details["fp"] == hashlib.sha256(
            row["salt"] + "mysql -p'S3cret'".encode()).hexdigest()
        assert details["seq"] == 7 and details["exit"] == 0
        assert details["ms"] == 412 and details["cwd"] == "/srv/app"
        # The words never change, the salt neither, nor what keeps them.
        for sql in ("UPDATE log_texts SET text = 'ls' WHERE id = $1",
                    "UPDATE log_texts SET salt = '\\x00'::bytea WHERE id = $1",
                    "UPDATE log_texts SET expires_at = now() WHERE id = $1"):
            await _refused(asyncpg.RaiseError, pool.execute(sql, row["id"]))
        # Half a redaction is no redaction.
        for sql in ("UPDATE log_texts SET text = NULL, salt = NULL, "
                    "redacted_at = now() WHERE id = $1",
                    "UPDATE log_texts SET text = NULL, redacted_at = now(), "
                    "redacted_by = $2, reason = 'x' WHERE id = $1"):
            args = (row["id"], me.id) if "$2" in sql else (row["id"],)
            try:
                await pool.execute(sql, *args)
            except (asyncpg.CheckViolationError, asyncpg.RaiseError):
                continue
            raise AssertionError(f"accepted: {sql}")
        # The journal row stays as it was.
        await _refused(asyncpg.RaiseError, pool.execute(
            "UPDATE journal SET text_id = NULL WHERE id = $1", entry))
        # Redacted once, for good: not again, and not back.
        await pool.execute(
            "UPDATE log_texts SET text = NULL, salt = NULL, redacted_at = now(), "
            "redacted_by = $2, reason = 'a password' WHERE id = $1",
            row["id"], me.id)
        for sql in ("UPDATE log_texts SET reason = 'other' WHERE id = $1",
                    "UPDATE log_texts SET text = 'back', salt = '\\x00'::bytea, "
                    "redacted_at = NULL, redacted_by = NULL, reason = NULL "
                    "WHERE id = $1"):
            await _refused(asyncpg.RaiseError, pool.execute(sql, row["id"]))
        # An AI writes only for someone, and says which model it is.
        for sql in ("INSERT INTO journal (kind, expires_at, author) "
                    "VALUES ('log.note', now(), 'ai')",
                    "INSERT INTO journal (kind, expires_at, author, user_id) "
                    "VALUES ('log.note', now(), 'ai', $1)"):
            args = (me.id,) if "$1" in sql else ()
            await _refused(asyncpg.CheckViolationError, pool.execute(sql, *args))


def test_notes_and_reasons_are_cleaned():
    assert logs.clean_note("  Back up.\r\nNext: restart\x07 always  ") == \
        "Back up.\nNext: restart always"
    assert logs.clean_note("abc‮def⁦x") == "abcdefx", \
        "nothing turns the text around"
    assert logs.clean_reason("  a\npassword\t ") == "a password"
    for bad in ("", "   ", "\x00\x01", None, 5):
        try:
            logs.clean_note(bad)
        except logs.Invalid:
            pass
        else:
            raise AssertionError(f"note accepted: {bad!r}")
    for bad in ("", " \n ", "x" * 201, None):
        try:
            logs.clean_reason(bad)
        except logs.Invalid:
            pass
        else:
            raise AssertionError(f"reason accepted: {bad!r}")
    try:
        logs.clean_note("x" * (logs.NOTE_MAX + 1))
    except logs.Invalid as exc:
        assert "4,000" in str(exc)
    else:
        raise AssertionError("a long note was accepted")


# ------------------------------------------------------------ reading

async def test_a_day_of_the_log_with_its_notes(h):
    async with h.pool() as pool:
        me, project = await _owner(pool)
        machine, terminal = await _computer(pool, project, me.id)
        other, _ = await _computer(pool, project, me.id, "web-02")
        start, end = _today()
        day0 = dt.datetime.fromtimestamp(start / 1000, dt.UTC)
        at = day0 + dt.timedelta(hours=9, minutes=12)
        async with pool.acquire() as conn:
            await accounts.journal(conn, "terminal.opened", project_id=project,
                                   user_id=me.id, machine_id=machine,
                                   terminal_id=terminal, details={"shell": "bash"})
        first = await _ran(pool, project, me.id, machine, terminal, 3,
                           "git pull", at=at)
        failed = await _ran(pool, project, me.id, machine, terminal, 9,
                            "curl -sf localhost:8080/health",
                            at=at + dt.timedelta(minutes=1), exit_code=7)
        # Yesterday's line, and an old one whose output is gone.
        await _ran(pool, project, me.id, machine, terminal, 1, "uptime",
                   at=day0 - dt.timedelta(hours=3))
        await _ran(pool, project, me.id, machine, terminal, 0, "ls",
                   at=day0 - dt.timedelta(days=40), block=False)
        await _ran(pool, project, me.id, other, terminal, 20, "df -h")
        ai = await logs.add_note(pool, me.id, "Exit 7: nothing listens on 8080.",
                                 entry_id=failed, ai="claude-opus-5-5")
        reply = await logs.add_note(pool, me.id, "Starting it by hand.",
                                    entry_id=failed)
        assert ai["entry"] == failed and ai["note"]["author"] == "ai"
        assert ai["note"]["ai"] == "claude-opus-5-5"
        assert ai["note"]["by"]["me"] and ai["note"]["by"]["initials"] == "DG"
        assert reply["note"]["author"] == "person"

        log = await logs.day(pool, me.id, machine, day0,
                             day0 + dt.timedelta(days=1))
        kinds = [e["kind"] for e in log["entries"]]
        assert sorted(kinds) == ["command.ran", "command.ran",
                                 "terminal.opened"], kinds
        commands = [e for e in log["entries"] if e["kind"] == "command.ran"]
        assert [c["command"] for c in commands] == \
            ["git pull", "curl -sf localhost:8080/health"]
        c = commands[1]
        assert c["exit"] == 7 and c["ms"] == 412 and c["cwd"] == "/srv/app"
        assert c["branch"] == "main" and c["home"] == "/root" and c["seq"] == 9
        assert c["output"] and c["canNote"] and c["canRedact"]
        assert c["terminal"] == {"id": str(terminal), "name": "1"}
        assert [n["text"] for n in c["notes"]] == \
            ["Exit 7: nothing listens on 8080.", "Starting it by hand."]
        assert [n["author"] for n in c["notes"]] == ["ai", "person"]
        assert commands[0]["notes"] == [] and commands[0]["id"] == first
        assert log["before"] == _ms(day0 - dt.timedelta(hours=3))
        assert log["after"] is None
        assert log["keep"] == {"lines": 365, "output": 30}
        assert log["machine"]["name"] == "web-01" and log["role"] == "owner"
        old = await logs.day(pool, me.id, machine,
                             day0 - dt.timedelta(days=40),
                             day0 - dt.timedelta(days=39))
        assert [e["command"] for e in old["entries"]] == ["ls"]
        assert old["entries"][0]["output"] is False, "the output is gone"
        # Not a day: backwards, or a week.
        for a, b in ((day0, day0), (day0, day0 + dt.timedelta(days=7))):
            await _refused(logs.Invalid, logs.day(pool, me.id, machine, a, b))
        # What the sidebar counts: commands since the page's midnight.
        counts = await logs.counts(pool, me.id, day0)
        assert counts == {str(machine): 2, str(other): 1}, counts
        r = await logs.of_blocks(pool, terminal, me.id, [3, 9, 99])
        assert set(r) == {3, 9} and r[9]["entry"] == failed
        assert [n["text"] for n in r[9]["notes"]] == \
            ["Exit 7: nothing listens on 8080.", "Starting it by hand."]
        assert r[3]["redacted"] is None and r[3]["canNote"]


async def test_who_reads_writes_and_redacts(h):
    async with h.pool() as pool:
        me, project = await _owner(pool)
        anna = await _person(pool, "anna@example.com", "Anna Admin")
        mark = await _person(pool, "mark@example.com", "Mark Member")
        olga = await _person(pool, "olga@example.com", "Olga Observer")
        stranger = await _person(pool, "sam@example.com", "Sam Stranger")
        for person, role in ((anna, "admin"), (mark, "member"),
                             (olga, "observer")):
            await _join(pool, project, person, role)
        machine, terminal = await _computer(pool, project, me.id)
        entry = await _ran(pool, project, me.id, machine, terminal, 5,
                           "docker login -p tok3n registry")
        # The same words run again, on another machine of the project, and
        # on a machine of another project.
        other, there = await _computer(pool, project, me.id, "web-02")
        again = await _ran(pool, project, me.id, other, there, 40,
                           "docker login -p tok3n registry")
        async with pool.acquire() as conn:
            elsewhere = await accounts.create_project(conn, me.id, "Else", "E")
        far, far_terminal = await _computer(pool, elsewhere, me.id, "far")
        kept = await _ran(pool, elsewhere, me.id, far, far_terminal, 2,
                          "docker login -p tok3n registry")
        start, end = _today()
        a = dt.datetime.fromtimestamp(start / 1000, dt.UTC)
        b = dt.datetime.fromtimestamp(end / 1000, dt.UTC)
        # Everyone in the project reads it; nobody else.
        for person in (anna, mark, olga):
            log = await logs.day(pool, person.id, machine, a, b)
            line = log["entries"][0]
            assert line["command"].startswith("docker login")
            assert line["by"]["name"] == "Denis Gerasimenko"
            assert not line["by"]["me"] and not line["output"], \
                "someone else's output is in their own terminal's feed"
        await _refused(logs.NotFound, logs.day(pool, stranger.id, machine, a, b))
        # Writing: members and up; an observer only reads, and so does an
        # AI on an observer's behalf.
        await _refused(logs.NotAllowed, logs.add_note(
            pool, olga.id, "I saw it", entry_id=entry))
        await _refused(logs.NotAllowed, logs.add_note(
            pool, olga.id, "Explained", entry_id=entry, ai="claude-opus-5-5"))
        await _refused(logs.NotFound, logs.add_note(
            pool, stranger.id, "Hi", entry_id=entry))
        await _refused(logs.NotFound, logs.add_note(
            pool, me.id, "Nowhere", entry_id=2 ** 70))
        await _refused(logs.Invalid, logs.add_note(pool, me.id, "Nowhere"))
        noted = await logs.add_note(pool, mark.id, "Rotated the token.",
                                    entry_id=entry)
        ai = await logs.add_note(pool, mark.id, "The token is in the line.",
                                 entry_id=entry, ai="claude-opus-5-5")
        row = await pool.fetchrow(
            "SELECT user_id, author, ai, about, project_id, expires_at "
            "FROM journal WHERE id = $1", ai["note"]["id"])
        assert row["user_id"] == mark.id and row["author"] == "ai"
        assert row["about"] == entry and row["project_id"] == project
        line_expiry = await pool.fetchval(
            "SELECT expires_at FROM journal WHERE id = $1", entry)
        assert row["expires_at"] == line_expiry, "a note goes with its line"
        # Redacting: the owner and admins only.
        for person in (mark, olga):
            await _refused(logs.NotAllowed, logs.redact(
                pool, person.id, entry, "a token"))
        await _refused(logs.NotFound, logs.redact(
            pool, stranger.id, entry, "a token"))
        await _refused(logs.Invalid, logs.redact(pool, anna.id, entry, "  "))
        done = await logs.redact(pool, anna.id, entry, "a token for the registry")
        assert done["what"] == "command" and done["seq"] == 5
        assert done["seqEnd"] == 8 and done["terminalId"] == str(terminal)
        assert done["redacted"]["by"]["name"] == "Anna Admin"
        assert done["redacted"]["reason"] == "a token for the registry"
        # Every line of the project with the same words, not another's.
        assert done["also"] == [{"id": again, "terminalId": str(there),
                                 "seq": 40, "seqEnd": 43}], done["also"]
        await _refused(logs.Taken, logs.redact(pool, me.id, entry, "again"))
        await _refused(logs.Taken, logs.redact(pool, me.id, again, "again"))
        left = await pool.fetch(
            "SELECT j.id, x.text FROM journal j JOIN log_texts x "
            "ON x.id = j.text_id WHERE j.id = ANY($1::bigint[]) ORDER BY j.id",
            [entry, again, kept])
        assert [r["text"] for r in left] == [None, None,
                                             "docker login -p tok3n registry"]
        trace = await pool.fetchval(
            "SELECT details FROM journal WHERE kind = 'log.redacted' "
            "AND about = $1", again)
        assert json.loads(trace) == {"what": "command",
                                     "reason": "a token for the registry",
                                     "with": entry}
        # A note redacted the same way; then everyone sees the trace only.
        n = await logs.redact(pool, me.id, noted["note"]["id"], "a password")
        assert n["what"] == "note" and n["entry"] == entry
        assert n["seq"] == 5 and n["seqEnd"] is None, "the block it is under"
        log = await logs.day(pool, olga.id, machine, a, b)
        line = log["entries"][0]
        assert line["command"] is None and not line["canRedact"]
        assert line["redacted"]["by"]["name"] == "Anna Admin"
        assert [x["text"] for x in line["notes"]] == \
            [None, "The token is in the line."]
        assert line["notes"][0]["redacted"]["reason"] == "a password"
        texts = await pool.fetch(
            "SELECT x.text, x.salt FROM journal j JOIN log_texts x "
            "ON x.id = j.text_id WHERE j.id = ANY($1::bigint[])",
            [entry, noted["note"]["id"]])
        assert all(t["text"] is None and t["salt"] is None for t in texts)
        for t, seq in ((terminal, 5), (there, 40)):
            block = await pool.fetchrow(
                "SELECT command, output, output_text FROM blocks "
                "WHERE terminal_id = $1 AND seq_start = $2", t, seq)
            assert tuple(block) == (None, None, None), "the feed and search too"
        found = await search.search(pool, me.id, "tok3n")
        assert [c["terminalId"] for c in found["commands"]] == [str(far_terminal)], \
            "only the other project's, which its own managers redact"
        kinds = [r["kind"] for r in await pool.fetch(
            "SELECT kind FROM journal WHERE about = $1 ORDER BY id", entry)]
        assert kinds == ["log.note", "log.note", "log.redacted"], kinds


async def test_a_moved_machine_brings_no_one_its_old_lines(h):
    async with h.pool() as pool:
        me, personal = await _owner(pool)
        async with pool.acquire() as conn:
            team = await accounts.create_project(conn, me.id, "Team", "T")
        anna = await _person(pool, "anna@example.com", "Anna Admin")
        await _join(pool, team, anna, "admin")
        machine, terminal = await _computer(pool, personal, me.id)
        await _ran(pool, personal, me.id, machine, terminal, 1, "cat ~/.secret")
        await pool.execute("UPDATE machines SET project_id = $2 WHERE id = $1",
                           machine, team)
        await _ran(pool, team, me.id, machine, terminal, 9, "uptime")
        start, end = _today()
        a = dt.datetime.fromtimestamp(start / 1000, dt.UTC)
        b = dt.datetime.fromtimestamp(end / 1000, dt.UTC)
        mine = await logs.day(pool, me.id, machine, a, b)
        theirs = await logs.day(pool, anna.id, machine, a, b)
        assert [e["command"] for e in mine["entries"]] == \
            ["cat ~/.secret", "uptime"]
        assert [e["command"] for e in theirs["entries"]] == ["uptime"]
        assert await logs.counts(pool, anna.id, a) == {str(machine): 1}


# ------------------------------------------------------------ keeping

async def test_the_sweep_takes_lines_with_their_notes_and_words(h):
    async with h.pool() as pool:
        me, project = await _owner(pool)
        machine, terminal = await _computer(pool, project, me.id)
        past = dt.datetime.now(dt.UTC) - dt.timedelta(days=1)

        async def line(expires):
            text = await pool.fetchval(
                "INSERT INTO log_texts (text, salt, expires_at) "
                "VALUES ('ls', '\\x00112233445566778899aabbccddeeff'::bytea, $1) "
                "RETURNING id", expires)
            entry = await pool.fetchval(
                "INSERT INTO journal (project_id, user_id, kind, machine_id, "
                "terminal_id, expires_at, text_id) VALUES ($1, $2, "
                "'command.ran', $3, $4, $5, $6) RETURNING id",
                project, me.id, machine, terminal, expires, text)
            note = await pool.fetchval(
                "INSERT INTO log_texts (text, salt, expires_at) "
                "VALUES ('why', '\\x00112233445566778899aabbccddeeff'::bytea, $1) "
                "RETURNING id", expires)
            await pool.execute(
                "INSERT INTO journal (project_id, user_id, kind, machine_id, "
                "expires_at, text_id, about) VALUES ($1, $2, 'log.note', $3, "
                "$4, $5, $6)", project, me.id, machine, expires, note, entry)
            return entry

        gone = await line(past)
        kept = await line(dt.datetime.now(dt.UTC) + dt.timedelta(days=300))
        await auth.sweep(pool)
        left = {r["id"] for r in await pool.fetch(
            "SELECT id FROM journal WHERE id = $1 OR about = $1 "
            "OR id = $2 OR about = $2", gone, kept)}
        assert gone not in left and len(left) == 2, left
        texts = await pool.fetchval("SELECT count(*) FROM log_texts")
        assert texts == 2, "the words of the kept line and its note only"


async def test_the_commands_of_before_come_into_the_log(h):
    """Migration 016 makes lines of the blocks kept from before."""
    pool = await db.connect(await h.empty_database())
    real = db.MIGRATIONS
    tmp = Path(tempfile.mkdtemp(prefix="tt"))
    try:
        for path in real.glob("*.sql"):
            if path.stem < "016":
                shutil.copy(path, tmp / path.name)
        db.MIGRATIONS = tmp
        await db.migrate(pool)
        me, project = await _owner(pool)
        machine, terminal = await _computer(pool, project, me.id)
        await pool.execute("UPDATE terminals SET home = '/root' WHERE id = $1",
                           terminal)
        ran = dt.datetime.now(dt.UTC) - dt.timedelta(days=3)
        for seq, command, started_by in ((1, "git pull", me.id),
                                         (5, "  ", me.id),
                                         (9, "make deploy", me.id),
                                         (12, "whoami", None)):
            await pool.execute(
                "INSERT INTO blocks (terminal_id, seq_start, seq_end, command, "
                "started_by, started_at, finished_at, exit_code, cwd, branch, "
                "expires_at) VALUES ($1, $2::bigint, $2::bigint + 2, $3, $4, $5, "
                "$5::timestamptz + interval '1.5 seconds', 2, '/srv/app', '', now() + "
                "interval '27 days')", terminal, seq, command, started_by, ran)
        # A machine moved since: each of its commands goes in the project it
        # was in when it ran, as the line would have then.
        async with pool.acquire() as conn:
            team = await accounts.create_project(conn, me.id, "Team", "T")
        moved, there = await _computer(pool, project, me.id, "db-01")
        moved_at = dt.datetime.now(dt.UTC) - dt.timedelta(days=2)
        for seq, when in ((1, ran), (3, moved_at + dt.timedelta(hours=1))):
            await pool.execute(
                "INSERT INTO blocks (terminal_id, seq_start, seq_end, command, "
                "started_by, started_at, expires_at) VALUES ($1, $2::bigint, "
                "$2::bigint + 1, $3, $4, $5, now() + interval '27 days')",
                there, seq, f"mysql -pHunter{seq}", me.id, when)
        await pool.execute("UPDATE machines SET project_id = $2 WHERE id = $1",
                           moved, team)
        for pid in (project, team):
            await pool.execute(
                "INSERT INTO journal (at, project_id, user_id, kind, machine_id, "
                "details, expires_at) VALUES ($1, $2, $3, 'machine.moved', $4, "
                "$5::jsonb, now() + interval '300 days')", moved_at, pid, me.id,
                moved, json.dumps({"from": str(project), "to": str(team)}))
        db.MIGRATIONS = real
        assert await db.migrate(pool) == ["016_machine_log"]
        where = {r["text"]: r["project_id"] for r in await pool.fetch(
            "SELECT x.text, j.project_id FROM journal j JOIN log_texts x "
            "ON x.id = j.text_id WHERE j.machine_id = $1", moved)}
        assert where == {"mysql -pHunter1": project, "mysql -pHunter3": team}, where
        rows = await pool.fetch(
            "SELECT j.at, j.user_id, j.details, j.expires_at, x.text, x.salt "
            "FROM journal j JOIN log_texts x ON x.id = j.text_id "
            "WHERE j.kind = 'command.ran' AND j.machine_id = $1 "
            "ORDER BY (j.details->>'seq')::int", machine)
        assert [r["text"] for r in rows] == ["git pull", "make deploy"]
        # The words keep their ids, and new ones come after them.
        later = await pool.fetchval(
            "INSERT INTO log_texts (text, salt, expires_at) VALUES ('x', "
            "'\\x00112233445566778899aabbccddeeff'::bytea, now()) RETURNING id")
        assert later > max(await pool.fetchval("SELECT max(text_id) FROM journal"), 0)
        for r in rows:
            d = json.loads(r["details"])
            assert d["fp"] == hashlib.sha256(
                r["salt"] + r["text"].encode()).hexdigest()
            assert d["exit"] == 2 and d["ms"] == 1500 and d["cwd"] == "/srv/app"
            assert d["branch"] is None and d["home"] == "/root"
            assert r["at"] == ran and r["user_id"] == me.id
            # A year of days, as the database counts them where it is: an
            # hour more or less where the clocks change.
            assert abs((r["expires_at"] - (ran + dt.timedelta(days=365)))
                       .total_seconds()) <= 3600
        assert [json.loads(r["details"])["seq"] for r in rows] == [1, 9]
    finally:
        db.MIGRATIONS = real
        shutil.rmtree(tmp, ignore_errors=True)
        await pool.close()


# ------------------------------------------------------- a real shell

async def test_a_terminal_writes_the_log_and_forgets_what_is_redacted(h):
    login, full = _login_shell()
    if not full:
        return
    home = _home()
    try:
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            machine_id = await _machine(core, port, host_key)
            t = await core.terminals.open(core.owner, machine_id, 100, 30)
            await _until(lambda: _prompts(t) >= 1, what="the first prompt")
            commands = ["echo first", "echo s3cret-t0ken", "(exit 3)"]
            for i, cmd in enumerate(commands):
                assert t.run(cmd) is None
                await _until(lambda n=i: _prompts(t) >= n + 2, what=cmd)
            rows = await _saved(core, t.id, 3)
            page = core.page_port
            start, end = _today()
            r = await request(page, "GET", f"/api/machines/{machine_id}/log"
                              f"?start={start}&end={end}")
            assert r.status == 200, r.body
            log = r.json()
            lines = [e for e in log["entries"] if e["kind"] == "command.ran"]
            assert [e["command"] for e in lines] == commands
            assert [e["exit"] for e in lines] == [0, 0, 3]
            assert log["entries"][0]["kind"] == "terminal.opened"
            assert all(e["output"] and e["by"]["me"] for e in lines)
            assert lines[0]["cwd"] and lines[0]["home"] == t.home
            secret = lines[1]
            # The feed knows each block's line.
            r = await request(page, "GET", f"/api/terminals/{t.id}/blocks")
            feed = r.json()["blocks"]
            assert [b["entry"] for b in feed] == [e["id"] for e in lines]
            assert all(b["notes"] == [] and b["canNote"] for b in feed)
            # A note from the log, and one from the feed by the block's
            # number; a note needs the page's header, like every change.
            body = json.dumps({"entry": lines[2]["id"],
                               "text": "Exit 3 on purpose."}).encode()
            r = await request(page, "POST", "/api/log/notes",
                              headers={"content-type": "application/json"},
                              body=body)
            assert r.status == 403
            r = await request(page, "POST", "/api/log/notes", headers=CHANGE,
                              body=body)
            assert r.status == 201 and r.json()["note"]["text"] == \
                "Exit 3 on purpose."
            r = await request(page, "POST", "/api/log/notes", headers=CHANGE,
                              body=json.dumps({
                                  "terminalId": str(t.id),
                                  "seq": rows[0]["seq_start"],
                                  "text": "The first."}).encode())
            assert r.status == 201 and r.json()["entry"] == lines[0]["id"]
            for bad in ({"entry": lines[0]["id"], "text": "  "},
                        {"entry": lines[0]["id"], "text": "x" * 4001},
                        {"text": "where?"}):
                r = await request(page, "POST", "/api/log/notes",
                                  headers=CHANGE, body=json.dumps(bad).encode())
                assert r.status == 422, (bad, r.status)
            r = await request(page, "POST", "/api/log/notes", headers=CHANGE,
                              body=json.dumps({"entry": 2 ** 62,
                                               "text": "x"}).encode())
            assert r.status == 404
            r = await request(page, "GET", f"/api/terminals/{t.id}/blocks")
            feed = r.json()["blocks"]
            assert [n["text"] for n in feed[0]["notes"]] == ["The first."]
            assert [n["text"] for n in feed[2]["notes"]] == ["Exit 3 on purpose."]
            # Redacted: gone from the log, the feed, search, the history
            # and the terminal's memory; the pages watching hear it.
            assert b"s3cret-t0ken" in _screen(t)
            r = await request(page, "POST", f"/api/log/{secret['id']}/redact",
                              headers=CHANGE,
                              body=json.dumps({"reason": "a token"}).encode())
            assert r.status == 200, r.body
            assert r.json()["redacted"]["reason"] == "a token"
            r = await request(page, "POST", f"/api/log/{secret['id']}/redact",
                              headers=CHANGE,
                              body=json.dumps({"reason": "a token"}).encode())
            assert r.status == 409
            r = await request(page, "GET", f"/api/machines/{machine_id}/log"
                              f"?start={start}&end={end}")
            again = [e for e in r.json()["entries"] if e["id"] == secret["id"]][0]
            assert again["command"] is None and not again["output"]
            assert again["redacted"]["by"]["me"]
            assert again["redacted"]["reason"] == "a token"
            r = await request(page, "GET", f"/api/terminals/{t.id}/blocks")
            block = r.json()["blocks"][1]
            assert block["command"] == "" and block["redacted"]["reason"] == \
                "a token"
            assert block["size"] == 0
            r = await request(page, "GET", "/api/search?q=s3cret")
            assert not r.json()["commands"] and not r.json()["output"]
            r = await request(page, "GET", f"/api/terminals/{t.id}/history")
            assert all("s3cret" not in c["command"]
                       for c in r.json()["commands"])
            assert b"s3cret-t0ken" not in _screen(t), "nor in its memory"
            assert all(e["command"] != "echo s3cret-t0ken" for e in t._recent)
            assert all("s3cret" not in json.dumps(e.data) for e in t.events
                       if e.kind == "ev")
            heard = [e.data for e in t.events if e.kind == "red"]
            assert heard and heard[0]["block"] == rows[1]["seq_start"]
            assert heard[0]["reason"] == "a token"
            # The sidebar's count of today: apart from the state, which the
            # app answers itself before signing in.
            r = await request(page, "GET", f"/api/logs/today?since={start}")
            assert r.json() == {"counts": {str(machine_id): 3}}, r.json()
            r = await request(page, "GET", f"/api/logs/today?since={end}")
            assert r.json() == {"counts": {}}
            r = await request(page, "GET", "/api/logs/today?since=-5")
            assert r.status == 422
            r = await request(page, "GET", "/api/state")
            assert all("logToday" not in m for p in r.json()["projects"]
                       for m in p["machines"])
            # The terminal goes on as before.
            prompts = _prompts(t)
            assert t.run("echo after") is None
            await _until(lambda: _prompts(t) > prompts, what="after")
            assert b"after" in _screen(t)
            # Not a day.
            r = await request(page, "GET", f"/api/machines/{machine_id}/log"
                              f"?start={end}&end={start}")
            assert r.status == 422
            r = await request(page, "GET", f"/api/machines/{uuid.uuid4()}/log"
                              f"?start={start}&end={end}")
            assert r.status == 404
            await t.close()
    finally:
        shutil.rmtree(home, ignore_errors=True)

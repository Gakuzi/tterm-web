"""The log of a machine (0.1.20): commands as lines, notes under them by
people and by an AI on a person's behalf, redaction, who may do what, how
long it all stays, and the lines brought in from the blocks of before. From
0.1.21: Find in this log, the logs in search, and what a line needs for its
output to open under it. From 0.1.23: the log is the machine's, and goes
with it to another project."""
import datetime as dt
import hashlib
import json
import shutil
import tempfile
import uuid
import zlib
from pathlib import Path

import asyncpg

from ..core import accounts, auth, db, logs, projects, search
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


async def test_find_in_a_log_and_the_logs_in_search(h):
    async with h.pool() as pool:
        me, project = await _owner(pool)
        anna = await _person(pool, "anna@example.com", "Anna Admin")
        stranger = await _person(pool, "sam@example.com", "Sam Stranger")
        await _join(pool, project, anna, "member")
        machine, terminal = await _computer(pool, project, me.id)
        other, other_terminal = await _computer(pool, project, me.id, "web-02")
        now = dt.datetime.now(dt.UTC).replace(microsecond=0)
        old = now - dt.timedelta(days=48)
        cp = "cp config/production.example.json config/production.json"
        first_cp = await _ran(pool, project, me.id, machine, terminal, 1, cp,
                              at=old, block=False)
        await logs.add_note(pool, me.id, "First deploy: production.json from "
                            "the example.", entry_id=first_cp)
        await _ran(pool, project, me.id, machine, terminal, 2,
                   "vim config/production.json", at=old + dt.timedelta(minutes=2),
                   block=False)
        failed = await _ran(pool, project, me.id, machine, terminal, 10,
                            "npm run build", at=now - dt.timedelta(minutes=9),
                            exit_code=1)
        await logs.add_note(pool, me.id, "The build needs config/production.json"
                            ", and it is not in git (.gitignore).",
                            entry_id=failed, ai="claude-opus-5-5")
        await _ran(pool, project, me.id, machine, terminal, 20, cp,
                   at=now - dt.timedelta(minutes=5))
        built = await _ran(pool, project, me.id, machine, terminal, 30,
                           "npm run build", at=now - dt.timedelta(minutes=4))
        await logs.add_note(pool, me.id, "Config copied from the example.",
                            entry_id=built)
        secret = await _ran(pool, project, me.id, machine, terminal, 40,
                            "mysql -p'S3cr3t-pa55' app", at=now - dt.timedelta(minutes=2))
        await _ran(pool, project, me.id, other, other_terminal, 5,
                   "cat config/production.json", at=now - dt.timedelta(minutes=1))

        found = await logs.find(pool, me.id, machine, ["production.json"])
        assert [e["command"] for e in found["entries"]] == \
            [cp, "vim config/production.json", "npm run build", cp], \
            "the oldest first; the failed build by its note; not web-02's"
        assert found["words"] == ["production.json"] and not found["cut"]
        assert found["machine"]["name"] == "web-01" and found["role"] == "owner"
        assert found["keep"] == {"lines": 365, "output": 30}
        by_id = {e["id"]: e for e in found["entries"]}
        assert [n["text"] for n in by_id[first_cp]["notes"]] == \
            ["First deploy: production.json from the example."]
        assert by_id[failed]["notes"][0]["author"] == "ai"
        assert by_id[failed]["exit"] == 1 and by_id[failed]["output"]
        assert not by_id[first_cp]["output"], "48 days: no output kept"
        newest = await logs.find(pool, me.id, machine, ["production.json"],
                                 newest=True)
        assert [e["id"] for e in newest["entries"]] == \
            [e["id"] for e in reversed(found["entries"])]
        # Every word in the command, or every word in one note under it;
        # not some here and some there.
        both = await logs.find(pool, me.id, machine, ["build", "gitignore"])
        assert [e["id"] for e in both["entries"]] == [failed]
        assert (await logs.find(pool, me.id, machine, ["npm", "gitignore"]))["entries"] == []
        # Any case, inside other words; % and _ as themselves.
        assert [e["id"] for e in (await logs.find(
            pool, me.id, machine, ["config/prod"]))["entries"]][0] == first_cp
        assert (await logs.find(pool, me.id, machine, ["%"]))["entries"] == []
        assert (await logs.find(pool, me.id, machine, ["npm_run"]))["entries"] == []
        # Redacted words are found nowhere: a command's, a note's.
        await logs.redact(pool, me.id, secret, "a password")
        assert (await logs.find(pool, me.id, machine, ["s3cr3t"]))["entries"] == []
        token = await logs.add_note(pool, me.id, "token xoxb-8f2k", entry_id=built)
        assert len((await logs.find(pool, me.id, machine, ["xoxb"]))["entries"]) == 1
        await logs.redact(pool, me.id, token["note"]["id"], "a token")
        assert (await logs.find(pool, me.id, machine, ["xoxb"]))["entries"] == []
        # A line written in another project, while the machine was there,
        # is the machine's too (0.1.23): whoever reads its log finds it.
        theirs_project = (await accounts.projects_of(pool, stranger.id))[0]["id"]
        await _ran(pool, uuid.UUID(theirs_project), stranger.id, machine, terminal, 50,
                   "cat config/production.json", at=old - dt.timedelta(days=1), block=False)
        assert [e["command"] for e in (await logs.find(
            pool, me.id, machine, ["production.json"]))["entries"]][0] == \
            "cat config/production.json"
        await _refused(logs.Invalid, logs.find(pool, me.id, machine, []))
        await _refused(logs.NotFound, logs.find(pool, stranger.id, machine,
                                                ["build"]))
        # Someone else in the project finds the lines; what they printed
        # stays with the one whose terminal it is.
        theirs = await logs.find(pool, anna.id, machine, ["npm"])
        assert len(theirs["entries"]) == 2
        assert not any(e["output"] for e in theirs["entries"])
        assert all(e["cols"] is None for e in theirs["entries"])
        # The width a command ran at, for its output under the line.
        await pool.execute("UPDATE blocks SET cols = 132 WHERE terminal_id = $1 "
                            "AND seq_start = 10", terminal)
        start, end = now - dt.timedelta(hours=1), now + dt.timedelta(hours=1)
        log = await logs.day(pool, me.id, machine, start, end)
        line = [e for e in log["entries"] if e["id"] == failed][0]
        assert line["output"] and line["cols"] == 132
        gone = [e for e in log["entries"] if e["id"] == secret][0]
        assert not gone["output"] and gone["cols"] is None

        # Search: the logs of the machines one reads.
        async with pool.acquire() as conn:
            got, more = await logs.found_in_logs(conn, me.id, ["production.json"])
        assert not more
        lines = [x for x in got if x["kind"] == "line"]
        notes = [x for x in got if x["kind"] == "note"]
        assert [(x["command"], x["machine"], x["runs"]) for x in lines] == [
            ("cat config/production.json", "web-02", 1),
            (cp, "web-01", 2),
            ("vim config/production.json", "web-01", 1),
            ("cat config/production.json", "web-01", 1)], lines
        latest = lines[1]
        assert latest["entry"] != first_cp and latest["by"]["me"]
        assert latest["cwd"] == "/srv/app" and latest["branch"] == "main"
        assert latest["exit"] == 0 and latest["code"] == "P"
        assert latest["notes"] == 0 and latest["note"] is None
        assert sorted(x["text"][:20] for x in notes) == \
            ["First deploy: produc", "The build needs conf"]
        ai = [x for x in notes if x["author"] == "ai"][0]
        assert ai["entry"] == failed and ai["command"] == "npm run build"
        assert ai["ai"] == "claude-opus-5-5" and ai["by"]["me"]
        assert ai["machineId"] == str(machine) and ai["lineAt"] is not None
        async with pool.acquire() as conn:
            got, _ = await logs.found_in_logs(conn, me.id, ["vim"])
            assert got[0]["notes"] == 0
            got, _ = await logs.found_in_logs(conn, me.id, ["cp", "example"])
            assert got[0]["note"] is None
            got, _ = await logs.found_in_logs(conn, me.id, ["s3cr3t"])
            assert got == [], "a redacted command is not found"
            got, _ = await logs.found_in_logs(conn, stranger.id, ["production"])
            assert got == []
            got, _ = await logs.found_in_logs(conn, anna.id, ["production"])
            assert len(got) == 6
        # A line with notes says how many and the first of them.
        async with pool.acquire() as conn:
            got, _ = await logs.found_in_logs(conn, me.id, ["npm", "build"])
        assert got[0]["runs"] == 2 and got[0]["entry"] == built
        assert got[0]["notes"] == 2, "the redacted one counts, not shown"
        assert got[0]["note"]["text"] == "Config copied from the example."
        # A machine taken out of tTerm: its log is not there to open.
        await pool.execute("UPDATE machines SET removed_at = now() WHERE id = $1",
                           other)
        async with pool.acquire() as conn:
            got, _ = await logs.found_in_logs(conn, me.id, ["production.json"])
        assert "web-02" not in {x["machine"] for x in got}
        everything = await search.search(pool, me.id, "production.json")
        assert len(everything["logs"]) == 5 and everything["more"]["logs"] is False
        assert (await search.search(pool, me.id, ""))["logs"] == []


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


async def test_a_moved_machine_takes_its_log_along(h):
    """0.1.23: the log is the machine's. Whoever is in the project it is in
    now reads all of it and writes and redacts in it as their role there
    says; the old project keeps none of it, and its deletion takes none of
    it away. The move is a line of the log, once."""
    async with h.pool() as pool:
        me, personal = await _owner(pool)
        async with pool.acquire() as conn:
            lab = await accounts.create_project(conn, me.id, "Lab", "L")
            team = await accounts.create_project(conn, me.id, "Team", "T")
        anna = await _person(pool, "anna@example.com", "Anna Admin")
        bob = await _person(pool, "bob@example.com", "Bob Lab")
        # Carl: an admin of Lab, only an observer in Team.
        carl = await _person(pool, "carl@example.com", "Carl Both")
        await _join(pool, team, anna, "admin")
        await _join(pool, lab, bob, "member")
        await _join(pool, lab, carl, "admin")
        await _join(pool, team, carl, "observer")
        machine, terminal = await _computer(pool, lab, me.id)
        before = await _ran(pool, lab, me.id, machine, terminal, 1,
                            "mysql -pHunter2 app")
        await logs.add_note(pool, bob.id, "I ran the migration after it.",
                            entry_id=before)
        # The same words on another machine of Team, and on one of Personal.
        mate, mate_terminal = await _computer(pool, team, me.id, "db-01")
        same = await _ran(pool, team, me.id, mate, mate_terminal, 3,
                          "mysql -pHunter2 app")
        home, home_terminal = await _computer(pool, personal, me.id, "mini")
        kept = await _ran(pool, personal, me.id, home, home_terminal, 4,
                          "mysql -pHunter2 app")
        # And on a machine that stays in Lab, and on one of Team that then
        # leaves it: neither is Team's when Anna redacts.
        stay, stay_terminal = await _computer(pool, lab, me.id, "lab-02")
        stays = await _ran(pool, lab, me.id, stay, stay_terminal, 5,
                           "mysql -pHunter2 app")
        left_team, left_terminal = await _computer(pool, team, me.id, "db-02")
        went = await _ran(pool, team, me.id, left_team, left_terminal, 6,
                          "mysql -pHunter2 app")
        await projects.move_machine(pool, me.id, left_team, personal)
        await projects.move_machine(pool, me.id, machine, team)
        after = await _ran(pool, team, me.id, machine, terminal, 9, "uptime")
        start, end = _today()
        a = dt.datetime.fromtimestamp(start / 1000, dt.UTC)
        b = dt.datetime.fromtimestamp(end / 1000, dt.UTC)

        for person in (me, anna):
            log = await logs.day(pool, person.id, machine, a, b)
            kinds = [(e["kind"], e.get("command")) for e in log["entries"]]
            assert kinds == [("command.ran", "mysql -pHunter2 app"),
                             ("machine.moved", None), ("command.ran", "uptime")], kinds
            moved = log["entries"][1]
            assert (moved["from"], moved["to"]) == ("Lab", "Team")
            assert moved["by"]["name"] == "Denis Gerasimenko"
            old = log["entries"][0]
            assert old["canNote"] and old["canRedact"], \
                "rights as the role where the machine is now"
            assert [n["text"] for n in old["notes"]] == ["I ran the migration after it."]
        # Carl's role is the one in Team, where the machine is now: he reads,
        # and does not write or redact, though he is an admin of Lab.
        log = await logs.day(pool, carl.id, machine, a, b)
        old = log["entries"][0]
        assert old["command"] == "mysql -pHunter2 app"
        assert not old["canNote"] and not old["canRedact"]
        await _refused(logs.NotAllowed, logs.add_note(
            pool, carl.id, "From Lab", entry_id=before))
        await _refused(logs.NotAllowed, logs.redact(pool, carl.id, before, "x"))
        assert not (await logs.of_blocks(pool, terminal, carl.id, [1]))[1]["canNote"]
        # Bob was in Lab, not in Team: the machine and its log left with it.
        await _refused(logs.NotFound, logs.day(pool, bob.id, machine, a, b))
        await _refused(logs.NotFound, logs.add_note(
            pool, bob.id, "Still here?", entry_id=before))
        await _refused(logs.NotFound, logs.find(pool, bob.id, machine, ["mysql"]))
        async with pool.acquire() as conn:
            got, _ = await logs.found_in_logs(conn, bob.id, ["migration"])
            assert got == [], "Bob's own note, on a machine he is no longer with"
            got, _ = await logs.found_in_logs(conn, bob.id, ["mysql"])
            assert {x["machine"] for x in got} == {"lab-02"}
            got, _ = await logs.found_in_logs(conn, anna.id, ["hunter2"])
            assert {(x["kind"], x["machine"]) for x in got} == \
                {("line", "web-01"), ("line", "db-01")}
            got, _ = await logs.found_in_logs(conn, anna.id, ["migration"])
            assert [(x["kind"], x["machine"], x["text"]) for x in got] == \
                [("note", "web-01", "I ran the migration after it.")]
        assert await logs.counts(pool, anna.id, a) == {str(machine): 2, str(mate): 1}
        assert await logs.counts(pool, bob.id, a) == {str(stay): 1}
        found = await logs.find(pool, anna.id, machine, ["hunter2"])
        assert [e["id"] for e in found["entries"]] == [before]
        # Anna, an admin of Team, writes under the line from Lab, and
        # redacts it: with it the same words on Team's machines, not on
        # Personal's.
        await logs.add_note(pool, anna.id, "Moved to Team on purpose.", entry_id=before)
        done = await logs.redact(pool, anna.id, before, "a password")
        assert [x["id"] for x in done["also"]] == [same], done["also"]
        left = await pool.fetch(
            "SELECT j.id, x.text FROM journal j JOIN log_texts x ON x.id = j.text_id "
            "WHERE j.id = ANY($1::bigint[]) ORDER BY j.id",
            [before, same, kept, stays, went])
        assert [r["text"] for r in left] == [None, None] + ["mysql -pHunter2 app"] * 3, \
            "not Lab's, nor the line of a machine that left Team"
        trace = await pool.fetch(
            "SELECT about, project_id FROM journal WHERE kind = 'log.redacted' "
            "ORDER BY about")
        assert {(r["about"], r["project_id"]) for r in trace} == \
            {(before, lab), (same, team)}, "each trace in its line's journal"
        # The feed of its terminal: the notes, as Team's people may write.
        feed = await logs.of_blocks(pool, terminal, anna.id, [1, 9])
        assert set(feed) == {1, 9} and feed[1]["canNote"]
        assert len(feed[1]["notes"]) == 2
        assert await logs.of_blocks(pool, terminal, bob.id, [1, 9]) == {}
        # A machine taken out of tTerm is not counted.
        await pool.execute("UPDATE machines SET removed_at = now() WHERE id = $1", stay)
        assert await logs.counts(pool, bob.id, a) == {}
        # Lab deleted, empty now: nothing of the log goes with it.
        await projects.delete(pool, me.id, lab)
        log = await logs.day(pool, me.id, machine, a, b)
        assert [e["id"] for e in log["entries"] if e["kind"] == "command.ran"] == \
            [before, after]
        assert await logs.counts(pool, me.id, a) == {
            str(machine): 2, str(mate): 1, str(home): 1, str(left_team): 1}
        # Moved once more, back home: one line for each move.
        await projects.move_machine(pool, me.id, machine, personal)
        log = await logs.day(pool, me.id, machine, a, b)
        moves = [(e["from"], e["to"]) for e in log["entries"]
                 if e["kind"] == "machine.moved"]
        assert moves == [("Lab", "Team"), ("Team", "Personal")], moves
        await _refused(logs.NotFound, logs.day(pool, anna.id, machine, a, b))


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
        assert await db.migrate(pool) == ["016_machine_log", "017_log_words",
                                          "018_core_runs", "019_support"]
        # The words looked for by a trigram index, where pg_trgm is (0.1.21).
        trgm = await pool.fetchval("SELECT count(*) FROM pg_extension "
                                   "WHERE extname = 'pg_trgm'")
        index = await pool.fetchval("SELECT count(*) FROM pg_indexes "
                                    "WHERE indexname = 'log_texts_words'")
        assert index == trgm, (index, trgm)
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
            # The width each command ran at, for its output under the line.
            assert all(e["cols"] == 100 for e in lines)
            # Find in this log, and the logs in search (0.1.21).
            find = f"/api/machines/{machine_id}/log/find"
            r = await request(page, "GET", f"{find}?q=echo")
            assert r.status == 200, r.body
            assert [e["command"] for e in r.json()["entries"]] == \
                ["echo first", "echo s3cret-t0ken"]
            r = await request(page, "GET", f"{find}?q=echo&newest=1")
            assert [e["command"] for e in r.json()["entries"]] == \
                ["echo s3cret-t0ken", "echo first"]
            r = await request(page, "GET", f"{find}?q=PURPOSE")
            assert [e["command"] for e in r.json()["entries"]] == ["(exit 3)"]
            assert r.json()["entries"][0]["notes"][0]["text"] == \
                "Exit 3 on purpose."
            r = await request(page, "GET", f"{find}?q=%20")
            assert r.status == 422
            r = await request(page, "GET",
                              f"/api/machines/{uuid.uuid4()}/log/find?q=echo")
            assert r.status == 404
            r = await request(page, "GET", "/api/search?q=purpose")
            said = [x for x in r.json()["logs"] if x["kind"] == "note"]
            assert [x["text"] for x in said] == ["Exit 3 on purpose."]
            assert said[0]["command"] == "(exit 3)"
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
            assert not r.json()["logs"]
            r = await request(page, "GET", f"{find}?q=s3cret")
            assert r.json()["entries"] == []
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

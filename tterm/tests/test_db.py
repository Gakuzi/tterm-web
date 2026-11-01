"""The schema and its migrations."""
import asyncio

import asyncpg

from ..core import db

TABLES = {"plans", "users", "sign_in_methods", "projects", "project_members",
          "cas", "machines", "install_tokens", "terminals", "blocks",
          "journal", "schema_migrations", "note_folders", "notes",
          "note_versions", "vaults", "vault_locks", "vault_keys",
          "vault_pairings", "log_texts"}


async def test_migrations_apply_once(h):
    pool = await db.connect(await h.empty_database())
    try:
        first = await db.migrate(pool)
        assert first == sorted(p.stem for p in db.MIGRATIONS.glob("*.sql")), first
        assert first[0] == "001_initial", first
        assert await db.migrate(pool) == [], "nothing left the second time"
        tables = {r["tablename"] for r in await pool.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        assert TABLES <= tables, TABLES - tables
    finally:
        await pool.close()


async def test_two_processes_migrating_at_once(h):
    url = await h.empty_database()
    pool_a = await db.connect(url)
    pool_b = await db.connect(url)
    try:
        a, b = await asyncio.gather(db.migrate(pool_a), db.migrate(pool_b))
        every = sorted(path.stem for path in db.MIGRATIONS.glob("*.sql"))
        assert sorted([a, b], key=len) == [[], every], (a, b)
    finally:
        await pool_a.close()
        await pool_b.close()


async def test_journal_is_append_only(h):
    async with h.pool() as pool:
        await pool.execute(
            "INSERT INTO journal (kind, expires_at) VALUES ('x', now())")
        try:
            await pool.execute("UPDATE journal SET kind = 'y'")
        except asyncpg.RaiseError as exc:
            assert "append-only" in str(exc)
        else:
            raise AssertionError("the journal was changed")
        # Expired rows may leave: that is how retention works.
        await pool.execute("DELETE FROM journal WHERE expires_at <= now()")


async def test_schema_refuses_nonsense(h):
    async with h.pool() as pool:
        uid = await pool.fetchval(
            "INSERT INTO users (name) VALUES ('A') RETURNING id")
        for sql, args in (
            ("INSERT INTO users (name, theme) VALUES ('B', 'blue')", ()),
            ("INSERT INTO projects (owner_id, name, code) VALUES ($1, 'x', 'cx')",
             (uid,)),
            ("INSERT INTO projects (owner_id, name, code) VALUES ($1, 'x', 'ABCDE')",
             (uid,)),
            ("INSERT INTO projects (owner_id, name, code, output_days) "
             "VALUES ($1, 'x', 'X', 31)", (uid,)),
        ):
            try:
                await pool.execute(sql, *args)
            except asyncpg.CheckViolationError:
                continue
            raise AssertionError(f"accepted: {sql}")


async def test_one_local_owner_only(h):
    async with h.pool() as pool:
        await pool.execute(
            "INSERT INTO users (name, is_local_owner) VALUES ('A', true)")
        try:
            await pool.execute(
                "INSERT INTO users (name, is_local_owner) VALUES ('B', true)")
        except asyncpg.UniqueViolationError:
            pass
        else:
            raise AssertionError("two local owners")


async def test_missing_database_says_what_to_do(h):
    url = h.base_url.rsplit("/", 1)[0] + "/tterm_no_such_database"
    try:
        await db.connect(url)
    except db.DatabaseUnavailable as exc:
        assert "does not exist" in str(exc) and "createdb" in str(exc), exc
    else:
        raise AssertionError("connected to a database that does not exist")


async def test_unreachable_server_says_what_to_do():
    try:
        await db.connect("postgresql://localhost:1/tterm_web")
    except db.DatabaseUnavailable as exc:
        assert "Postgres.app" in str(exc), exc
    else:
        raise AssertionError("connected to port 1")


def test_describe_hides_secrets():
    assert db.describe("postgresql://u:secret@db.example:5433/x") == \
        "db.example:5433/x"
    assert db.describe("postgresql:///tterm_web") == "localhost:5432/tterm_web"

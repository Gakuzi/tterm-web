"""PostgreSQL: the connection pool and the schema migrations.

Migrations are plain SQL files in `migrations/`, applied in name order, each
in its own transaction, and recorded in `schema_migrations`. No ORM: the
schema is small, and SQL you can read is worth more than a layer you cannot.
"""
from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg

log = logging.getLogger("tterm.db")

MIGRATIONS = Path(__file__).with_name("migrations")

#: Advisory lock held while migrating, so that two processes starting at once
#: (the core and, from 0.0.3, the signer) never apply the same file twice.
MIGRATION_LOCK = 0x7474_0001

#: What a migration may take, and the wait for another process's: longer
#: than the pool's 30 seconds a query, for a migration that rewrites much
#: (0.1.20 makes lines of the log from a month of blocks).
MIGRATE_TIMEOUT = 15 * 60


class DatabaseUnavailable(Exception):
    """PostgreSQL cannot be used; the message says what to do about it."""


def describe(url: str) -> str:
    """host:port/database, without anything secret that may be in the URL."""
    parts = urlsplit(url)
    host = parts.hostname or "localhost"
    port = parts.port or 5432
    name = parts.path.lstrip("/") or "(default)"
    return f"{host}:{port}/{name}"


async def connect(url: str, *, max_size: int = 10) -> asyncpg.Pool:
    where = describe(url)
    try:
        return await asyncpg.create_pool(
            url, min_size=1, max_size=max_size, command_timeout=30)
    except asyncpg.InvalidCatalogNameError:
        name = where.rsplit("/", 1)[-1]
        raise DatabaseUnavailable(
            f"The database {name} does not exist on {where.rsplit('/', 1)[0]}. "
            f"Create it with createdb, see README.") from None
    except (asyncpg.InvalidAuthorizationSpecificationError,
            asyncpg.InvalidPasswordError) as exc:
        raise DatabaseUnavailable(
            f"PostgreSQL at {where} refused the connection: {exc}. "
            "Postgres.app asks once whether a program may connect without a "
            "password; if it asked, answer OK and start again.") from None
    except (OSError, asyncpg.CannotConnectNowError) as exc:
        raise DatabaseUnavailable(
            f"Cannot reach PostgreSQL at {where} ({exc}). "
            "Is Postgres.app running, with its server started?") from None


async def migrate(pool: asyncpg.Pool) -> list[str]:
    """Applies the migrations not applied yet; returns their names."""
    applied: list[str] = []
    async with pool.acquire() as conn:
        await conn.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK,
                           timeout=MIGRATE_TIMEOUT)
        try:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " version text PRIMARY KEY,"
                " applied_at timestamptz NOT NULL DEFAULT now())")
            done = {r["version"] for r in
                    await conn.fetch("SELECT version FROM schema_migrations")}
            for path in sorted(MIGRATIONS.glob("*.sql")):
                if path.stem in done:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"),
                                       timeout=MIGRATE_TIMEOUT)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES ($1)",
                        path.stem)
                applied.append(path.stem)
                log.info("applied migration %s", path.stem)
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK)
    return applied

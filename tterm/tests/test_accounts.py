"""People and projects: initials, project codes, the local owner."""
import asyncio
import re
from pathlib import Path

import asyncpg

from ..core import accounts

ME = "denis@example.com"

def test_initials_as_on_the_avatar():
    assert accounts.initials("Denis Gerasimenko") == "DG"
    assert accounts.initials("anna nikolaeva") == "AN"
    # First and last word: a middle name does not push the surname out.
    assert accounts.initials("Anna Maria Nikolaeva") == "AN"
    assert accounts.initials("Denis") == "D"
    assert accounts.initials("Денис Герасименко") == "ДГ"
    assert accounts.initials("  ") == "?"


def test_the_languages_are_the_pages():
    """The twelve an account keeps (0.1.16) are the page's, in its order,
    and the database takes these and no other."""
    root = Path(__file__).resolve().parents[2]
    page = (root / "web" / "src" / "i18n.ts").read_text(encoding="utf-8")
    block = page[page.index("export const LANGUAGES"):page.index("] as const")]
    assert tuple(re.findall(r'code: "([^"]+)"', block)) == accounts.LANGUAGES
    sql = (root / "tterm" / "core" / "migrations" / "012_language.sql").read_text(
        encoding="utf-8")
    assert tuple(re.findall(r"'([^']+)'", sql)) == accounts.LANGUAGES


def test_first_name():
    assert accounts.first_name("Denis Gerasimenko") == "Denis"
    assert accounts.first_name("Denis") == "Denis"


def test_project_code_suggestions():
    assert accounts.suggest_code("Client X") == "CX"
    assert accounts.suggest_code("Personal") == "P"
    assert accounts.suggest_code("Lisbon Bikes") == "LB"
    assert accounts.suggest_code("Shop staging") == "SS"
    assert accounts.suggest_code("Клиент Х") == "КХ"
    assert accounts.suggest_code("a b c d e f") == "ABCD", "four at most"
    assert accounts.suggest_code("Client X", {"CX"}) == "CX2"
    assert accounts.suggest_code("Client X", {"CX", "CX2"}) == "CX3"
    assert accounts.suggest_code("!!!") == "P", "a name without letters"


def test_project_code_rules():
    for good in ("P", "CX", "SS1", "ABCD", "КХ"):
        assert accounts.valid_code(good), good
    for bad in ("", "ABCDE", "C_X", "C X", "C-X"):
        assert not accounts.valid_code(bad), bad


async def test_first_start_creates_owner_and_personal(h):
    async with h.pool() as pool:
        me = await accounts.ensure_local_owner(pool, "Denis Gerasimenko", ME)
        assert me.initials == "DG" and me.theme == "system" and me.plan == "free"
        projects = await accounts.projects_of(pool, me.id)
        assert [(p["name"], p["code"], p["role"]) for p in projects] == [
            ("Personal", "P", "owner")], projects
        assert projects[0]["machines"] == []
        kinds = [r["kind"] for r in await pool.fetch(
            "SELECT kind FROM journal ORDER BY id")]
        assert kinds == ["user.created", "project.created"], kinds
        # The address they sign in with.
        assert me.email == ME
        assert await pool.fetchval(
            "SELECT subject FROM sign_in_methods WHERE user_id = $1 "
            "AND kind = 'email'", me.id) == ME


async def test_later_starts_find_the_same_owner(h):
    async with h.pool() as pool:
        first = await accounts.ensure_local_owner(pool, "Denis", ME)
        again = await accounts.ensure_local_owner(pool, "Denis Gerasimenko", ME)
        assert again.id == first.id
        # From 0.0.10 the name is the person's, changed on the account page:
        # a start leaves it as it is.
        assert again.name == "Denis", "the settings name the owner once"
        await accounts.set_name(pool, first.id, "Denis G.")
        await accounts.set_name(pool, first.id, "Denis G.")
        again = await accounts.ensure_local_owner(pool, "Denis Gerasimenko", ME)
        assert again.name == "Denis G." and again.initials == "DG", again
        assert (await accounts.local_owner(pool)).name == "Denis G."
        assert await pool.fetchval(
            "SELECT count(*) FROM journal WHERE kind = 'user.renamed'") == 1
        assert await pool.fetchval("SELECT count(*) FROM users") == 1
        assert await pool.fetchval("SELECT count(*) FROM projects") == 1
        # A new address in the settings replaces the old one.
        moved = await accounts.ensure_local_owner(pool, "Denis", "d@example.org")
        assert moved.id == first.id and moved.email == "d@example.org"
        assert [r["subject"] for r in await pool.fetch(
            "SELECT subject FROM sign_in_methods WHERE user_id = $1",
            first.id)] == ["d@example.org"]
        assert (await accounts.local_owner(pool)).email == "d@example.org"


async def test_an_address_someone_signed_up_with_stays_theirs(h):
    async with h.pool() as pool:
        async with pool.acquire() as conn:
            await conn.execute("INSERT INTO users (name, email) "
                               "VALUES ('Anna', 'anna@example.com')")
        try:
            await accounts.ensure_local_owner(pool, "Denis", "anna@example.com")
        except ValueError as exc:
            assert "another account" in str(exc), exc
        else:
            raise AssertionError("the owner took someone else's address")
        assert await accounts.local_owner(pool) is None


async def test_two_processes_starting_at_once_make_one_owner(h):
    async with h.pool() as pool:
        people = await asyncio.gather(
            *[accounts.ensure_local_owner(pool, "Denis", ME) for _ in range(4)])
        assert len({p.id for p in people}) == 1
        assert await pool.fetchval("SELECT count(*) FROM users") == 1


async def test_theme_is_kept_in_the_account(h):
    async with h.pool() as pool:
        me = await accounts.ensure_local_owner(pool, "Denis", ME)
        await accounts.set_theme(pool, me.id, "light")
        assert (await accounts.person(pool, me.id)).theme == "light"
        try:
            await accounts.set_theme(pool, me.id, "blue")
        except ValueError:
            pass
        else:
            raise AssertionError("theme 'blue' accepted")


async def test_codes_are_unique_per_owner(h):
    async with h.pool() as pool:
        me = await accounts.ensure_local_owner(pool, "Denis", ME)
        async with pool.acquire() as conn:
            await accounts.create_project(conn, me.id, "Client X", "cx")
            try:
                await accounts.create_project(conn, me.id, "Copy", "CX")
            except asyncpg.UniqueViolationError:
                pass
            else:
                raise AssertionError("the same code twice for one owner")
            try:
                await accounts.create_project(conn, me.id, "Long", "ABCDE")
            except ValueError:
                pass
            else:
                raise AssertionError("a five-letter code accepted")
        codes = [p["code"] for p in await accounts.projects_of(pool, me.id)]
        assert codes == ["P", "CX"], codes

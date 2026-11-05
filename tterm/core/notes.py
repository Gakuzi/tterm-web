"""Notes: what a project writes down, in folders (from 0.1.0).

A note is a title and a list of blocks: a paragraph, a heading, a list item,
a checklist item, code, and a divider. The page turns Markdown into blocks
as it is typed; the core keeps them as JSON, and the page always shows them
as text, never as HTML, so nothing written in a note can run on the page.

Notes live in folders the way terminals live on machines, and a folder
belongs to one project: everyone in the project reads and writes its notes,
an observer only reads them. A note is deleted by its author, the owner and
admins, who also move it to another project (from 0.1.2); a folder, with
the notes in it, by the owner and admins, and by whoever made it while it is
empty.

The same note written on two devices: every save names the version it was
made from, and one made from an older version is merged with what was saved
since, block by block. Changes to different blocks both stay; the same block
changed both ways is a conflict, and the page asks whose to keep. A tick in
a checklist is a change of its own, made at once: who ticked and when come
from the core, never from the page.
"""
from __future__ import annotations

import json
import re
import time
import uuid

import asyncpg

from . import accounts

#: The kinds of block: a paragraph, a heading, a list item, a checklist
#: item, code, a divider.
TYPES = ("p", "h", "li", "todo", "code", "hr")
#: Blocks that keep the line breaks typed in them; in the others a break
#: becomes a space.
MULTILINE = ("p", "code")

NAME_MAX = 80
TITLE_MAX = 200
TEXT_MAX = 20_000
BLOCKS_MAX = 2_000
#: The whole of a note's blocks as JSON, in bytes.
BODY_MAX = 512 * 1024
EXCERPT_MAX = 140
#: Versions kept to merge with: a device that comes back with a save made
#: further back than that is asked whose version to keep.
KEEP_VERSIONS = 50
FOLDERS_MAX = 200
NOTES_MAX = 5_000

WRITERS = ("owner", "admin", "member")
MANAGERS = ("owner", "admin")

_BLOCK_ID = re.compile(r"[A-Za-z0-9_-]{1,32}")


def new_block_id() -> str:
    """Generate a valid unique ID for a note block."""
    return uuid.uuid4().hex[:12]

#: Control characters but the tab and the line break: nothing a note needs.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
#: In a title every control character, the tab and line breaks too, becomes
#: a space: a title is one line.
_TITLE_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


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


class Conflict(Exception):
    """The note changed elsewhere in the same places since the version the
    save was made from: `note` is how it is saved now."""

    def __init__(self, note: dict) -> None:
        super().__init__("The note changed elsewhere meanwhile.")
        self.note = note


class _Clash(Exception):
    """The merge found the same thing changed two ways."""


# --------------------------------------------------------------- cleaning


def _storable(text: str) -> str:
    """The text, if it can be stored: a lone surrogate (JSON's "\\ud800")
    can be neither UTF-8 nor PostgreSQL text."""
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise Invalid("The text has a broken character in it.") from None
    return text


def clean_name(name: object) -> str | None:
    """A folder's name, or a project's: one line, 1 to 80 characters, or
    None."""
    if not isinstance(name, str):
        return None
    name = accounts.one_line(_storable(name))
    return name if 1 <= len(name) <= NAME_MAX else None


def clean_title(title: object) -> str:
    """A note's title as typed. Only control characters become spaces: a
    space at the end stays while the person types on, since tidying it away
    in the saved copy would move their caret. The page cleans it the same
    way before it sends it (noteText.ts)."""
    if title is None:
        return ""
    if not isinstance(title, str):
        raise Invalid("A note's title is text.")
    title = _TITLE_CONTROL.sub(" ", _storable(title))
    if len(title) > TITLE_MAX:
        raise Invalid(f"A title is at most {TITLE_MAX} characters.")
    return title


def clean_blocks(raw: object) -> list[dict]:
    """The blocks as the page sent them, checked and tidied: only the kinds
    there are, an id of its own for each, text only. Whether a checklist item
    is done is the page's to say only for an item that is new (_with_ticks).
    The page tidies text the same way as it is typed (noteText.ts), so what
    comes back is what it sent."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise Invalid("A note's blocks are a list.")
    if len(raw) > BLOCKS_MAX:
        raise Invalid(f"A note holds at most {BLOCKS_MAX} blocks.")
    seen: set[str] = set()
    blocks: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            raise Invalid("A block is an object.")
        block_id, kind, text = item.get("id"), item.get("type"), item.get("text", "")
        if (not isinstance(block_id, str) or not _BLOCK_ID.fullmatch(block_id)
                or block_id in seen):
            raise Invalid("Each block needs an id of its own.")
        if kind not in TYPES:
            raise Invalid(f"There is no block of the kind {kind!r}.")
        if not isinstance(text, str):
            raise Invalid("A block's text is text.")
        text = _CONTROL.sub("", _storable(text).replace("\r\n", "\n")
                            .replace("\r", "\n"))
        if kind == "hr":
            text = ""
        elif kind not in MULTILINE:
            text = text.replace("\n", " ")
        if len(text) > TEXT_MAX:
            raise Invalid(f"A block holds at most {TEXT_MAX} characters.")
        block = {"id": block_id, "type": kind, "text": text}
        if kind == "todo":
            block["done"] = item.get("done") is True
        seen.add(block_id)
        blocks.append(block)
    if len(_dump(blocks).encode()) > BODY_MAX:
        raise Invalid("The note is too long. Split it into two.")
    return blocks


def _with_ticks(current: list[dict], blocks: list[dict], user_id: uuid.UUID,
                now: int) -> list[dict]:
    """The blocks with each checklist item's tick as the core knows it: an
    item that was already there keeps its tick, who made it and when, whatever
    the page says; a new item is ticked or not as written, by the one who
    saves it."""
    known = {b["id"]: b for b in current if b.get("type") == "todo"}
    out: list[dict] = []
    for block in blocks:
        block = {"id": block["id"], "type": block["type"], "text": block["text"],
                 **({"done": block.get("done") is True}
                    if block["type"] == "todo" else {})}
        if block["type"] == "todo":
            was = known.get(block["id"])
            if was is not None:
                block.update(done=was.get("done") is True, by=was.get("by"),
                             at=was.get("at"))
            elif block["done"]:
                block.update(by=str(user_id), at=now)
            else:
                block.update(by=None, at=None)
        out.append(block)
    return out


def summary(blocks: list[dict]) -> tuple[int, int, str]:
    """Checklist items, how many are done, and the start of the text: what
    lists of notes show."""
    todos = [b for b in blocks if b.get("type") == "todo"]
    excerpt = ""
    for b in blocks:
        if b.get("type") in ("p", "li", "code") and b.get("text", "").strip():
            excerpt = b["text"].strip().split("\n", 1)[0].strip()[:EXCERPT_MAX]
            break
    return len(todos), sum(1 for b in todos if b.get("done")), excerpt


# ------------------------------------------------------------------ merge


def _content(block: dict | None) -> tuple[str, str] | None:
    """What a block says, without its tick: a tick is never a conflict."""
    return None if block is None else (block["type"], block["text"])


def merge(base_title: str, base: list[dict], mine_title: str, mine: list[dict],
          theirs_title: str, theirs: list[dict]) -> tuple[str, list[dict]]:
    """A save made from `base`, merged with `theirs`, what was saved since.

    Each side's changes stay where the other did not touch; a block, or the
    title, changed both ways (deleted on one side, changed on the other
    counts) raises _Clash. The order is theirs, with blocks new on this side
    put after the block they followed here."""
    if mine_title == base_title or mine_title == theirs_title:
        title = theirs_title
    elif theirs_title == base_title:
        title = mine_title
    else:
        raise _Clash("title")
    b = {x["id"]: x for x in base}
    m = {x["id"]: x for x in mine}
    t = {x["id"]: x for x in theirs}
    kept: dict[str, dict] = {}
    for block_id in {*b, *m, *t}:
        was, mine_now, theirs_now = (_content(b.get(block_id)),
                                     _content(m.get(block_id)),
                                     _content(t.get(block_id)))
        mine_changed, theirs_changed = mine_now != was, theirs_now != was
        if mine_changed and theirs_changed and mine_now != theirs_now:
            raise _Clash(block_id)
        if mine_changed:
            if mine_now is not None:
                kept[block_id] = m[block_id]
        elif theirs_now is not None:
            kept[block_id] = t[block_id]
    order = [x["id"] for x in theirs if x["id"] in kept]
    placed = set(order)
    for i, block in enumerate(mine):
        if block["id"] not in kept or block["id"] in placed:
            continue
        before = i - 1
        while before >= 0 and mine[before]["id"] not in placed:
            before -= 1
        at = order.index(mine[before]["id"]) + 1 if before >= 0 else 0
        order.insert(at, block["id"])
        placed.add(block["id"])
    return title, [kept[x] for x in order]


# ------------------------------------------------------------- database


def _dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _load(value) -> list[dict]:
    if isinstance(value, str):
        value = json.loads(value)
    return list(value or [])


def _ms(moment) -> int | None:
    return int(moment.timestamp() * 1000) if moment is not None else None


def _now() -> int:
    return int(time.time() * 1000)


def _person(person_id, name) -> dict | None:
    if person_id is None:
        return None
    name = name or "Someone"
    return {"id": str(person_id), "name": name,
            "firstName": accounts.first_name(name),
            "initials": accounts.initials(name)}


async def _role(conn, project_id: uuid.UUID, user_id: uuid.UUID) -> str | None:
    """The person's role in the project, while their membership lasts."""
    return await conn.fetchval(
        "SELECT role FROM project_members WHERE project_id = $1 "
        "AND user_id = $2 AND (until IS NULL OR until > now())",
        project_id, user_id)


FOLDER_PROJECT = "SELECT project_id FROM note_folders WHERE id = $1"
NOTE_PROJECT = ("SELECT f.project_id FROM notes n JOIN note_folders f "
                "ON f.id = n.folder_id WHERE n.id = $1")


async def _hold(conn, project_id: uuid.UUID | None, missing: str, *,
                mode: str = "KEY SHARE",
                user_id: uuid.UUID | None = None) -> None:
    """Takes the project's row before any folder or note in it, as deleting
    the project takes them (projects.delete), so that neither ever waits for
    the other in turn. FOR UPDATE for what must wait while the project is
    deleted or changed: a new folder or note, a name or a move checked
    against the rest; KEY SHARE for the rest, which then writes its line in
    the journal. A project deleted meanwhile is gone: NotFound.

    With `user_id`, a project the person is not in is not held at all (from
    0.1.2): naming something of another's holds up nothing of theirs. What
    is held is then looked at again, as before."""
    if user_id is not None and (project_id is None or
                                await _role(conn, project_id, user_id) is None):
        raise NotFound(missing)
    alive = project_id is not None and await conn.fetchval(
        f"SELECT deleted_at IS NULL FROM projects WHERE id = $1 FOR {mode}",
        project_id)
    if not alive:
        raise NotFound(missing)


async def _folder(conn, folder_id: uuid.UUID, user_id: uuid.UUID, *,
                  lock: bool = False):
    """The folder and the person's role in its project; NotFound for a
    folder they cannot see, as for one that is not there."""
    row = await conn.fetchrow(
        "SELECT id, project_id, name, created_by FROM note_folders "
        "WHERE id = $1" + (" FOR UPDATE" if lock else ""), folder_id)
    if row is None:
        raise NotFound("No such folder.")
    role = await _role(conn, row["project_id"], user_id)
    if role is None:
        raise NotFound("No such folder.")
    return row, role


NOTE_SQL = """
    SELECT n.id, n.folder_id, n.title, n.body, n.version, n.created_by,
           n.created_at, n.edited_by, n.edited_at, n.todo_total, n.todo_done,
           f.project_id, f.name AS folder_name,
           cu.name AS created_name, eu.name AS edited_name
    FROM notes n
    JOIN note_folders f ON f.id = n.folder_id
    LEFT JOIN users cu ON cu.id = n.created_by
    LEFT JOIN users eu ON eu.id = n.edited_by
    WHERE n.id = $1
"""


async def _note_row(conn, note_id: uuid.UUID, user_id: uuid.UUID, *,
                    lock: bool = False):
    """The note, with its folder and project, and the person's role there.
    Locked, the note's row is taken alone first, then read: locked in one
    statement with its folder, a note moved meanwhile (0.1.2) would be
    looked at again with the folder it had before, and seem gone."""
    if lock and await conn.fetchval(
            "SELECT 1 FROM notes WHERE id = $1 FOR UPDATE", note_id) is None:
        raise NotFound("No such note.")
    row = await conn.fetchrow(NOTE_SQL, note_id)
    if row is None:
        raise NotFound("No such note.")
    role = await _role(conn, row["project_id"], user_id)
    if role is None:
        raise NotFound("No such note.")
    return row, role


async def _describe(conn, row, role: str, user_id: uuid.UUID) -> dict:
    """A note as the page gets it: everything in it, who wrote it, and the
    names of those who ticked its checklist."""
    blocks = _load(row["body"])
    tickers = {b["by"] for b in blocks if b.get("type") == "todo" and b.get("by")}
    people = {}
    if tickers:
        ids = [uuid.UUID(x) for x in tickers if _is_uuid(x)]
        for person in await conn.fetch(
                "SELECT id, name FROM users WHERE id = ANY($1::uuid[])", ids):
            people[str(person["id"])] = _person(person["id"], person["name"])
    created_by = row["created_by"]
    return {
        "id": str(row["id"]),
        "folderId": str(row["folder_id"]),
        "folder": row["folder_name"],
        "projectId": str(row["project_id"]),
        "title": row["title"],
        "blocks": blocks,
        "version": row["version"],
        "createdBy": _person(created_by, row["created_name"]),
        "createdAt": _ms(row["created_at"]),
        "editedBy": _person(row["edited_by"], row["edited_name"]),
        "editedAt": _ms(row["edited_at"]),
        "people": people,
        "canDelete": role in MANAGERS or (role in WRITERS and created_by == user_id),
        "canWrite": role in WRITERS,
    }


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        return False
    return True


async def _store(conn, note_id: uuid.UUID, version: int, title: str,
                 blocks: list[dict], user_id: uuid.UUID) -> None:
    """Writes a new version of the note, and keeps it to merge with."""
    total, done, excerpt = summary(blocks)
    body = _dump(blocks)
    await conn.execute(
        "UPDATE notes SET title = $2, body = $3::jsonb, version = $4, "
        "todo_total = $5, todo_done = $6, excerpt = $7, edited_by = $8, "
        "edited_at = now() WHERE id = $1",
        note_id, title, body, version, total, done, excerpt, user_id)
    await conn.execute(
        "INSERT INTO note_versions (note_id, version, title, body) "
        "VALUES ($1, $2, $3, $4::jsonb)", note_id, version, title, body)
    await conn.execute(
        "DELETE FROM note_versions WHERE note_id = $1 AND version <= $2",
        note_id, version - KEEP_VERSIONS)


# ---------------------------------------------------------------- folders


async def create_folder(pool: asyncpg.Pool, user_id: uuid.UUID,
                        project_id: uuid.UUID, name: object) -> dict:
    clean = clean_name(name)
    if clean is None:
        raise Invalid(f"A folder's name is 1 to {NAME_MAX} characters.")
    async with pool.acquire() as conn, conn.transaction():
        role = await _role(conn, project_id, user_id)
        if role is None:
            raise NotFound("No such project.")
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        await _hold(conn, project_id, "No such project.", mode="UPDATE")
        if await conn.fetchval(
                "SELECT count(*) FROM note_folders WHERE project_id = $1",
                project_id) >= FOLDERS_MAX:
            raise Taken(f"A project holds at most {FOLDERS_MAX} folders.")
        if await conn.fetchval(
                "SELECT 1 FROM note_folders WHERE project_id = $1 "
                "AND lower(name) = lower($2)", project_id, clean):
            raise Taken(f"There is a folder {clean} here already.")
        folder_id = await conn.fetchval(
            "INSERT INTO note_folders (project_id, name, created_by) "
            "VALUES ($1, $2, $3) RETURNING id", project_id, clean, user_id)
        await accounts.journal(conn, "folder.created", project_id=project_id,
                               user_id=user_id,
                               details={"folder": str(folder_id), "name": clean})
        creator = await conn.fetchval("SELECT name FROM users WHERE id = $1",
                                      user_id)
    return {"id": str(folder_id), "projectId": str(project_id), "name": clean,
            "createdBy": _person(user_id, creator), "notes": []}


async def rename_folder(pool: asyncpg.Pool, user_id: uuid.UUID,
                        folder_id: uuid.UUID, name: object) -> dict:
    clean = clean_name(name)
    if clean is None:
        raise Invalid(f"A folder's name is 1 to {NAME_MAX} characters.")
    async with pool.acquire() as conn, conn.transaction():
        # As for a new folder: two names given at once wait for each other.
        await _hold(conn, await conn.fetchval(FOLDER_PROJECT, folder_id),
                    "No such folder.", mode="UPDATE", user_id=user_id)
        row, role = await _folder(conn, folder_id, user_id, lock=True)
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        if clean != row["name"] and await conn.fetchval(
                "SELECT 1 FROM note_folders WHERE project_id = $1 "
                "AND lower(name) = lower($2) AND id <> $3",
                row["project_id"], clean, folder_id):
            raise Taken(f"There is a folder {clean} here already.")
        await conn.execute("UPDATE note_folders SET name = $2 WHERE id = $1",
                           folder_id, clean)
    return {"id": str(folder_id), "projectId": str(row["project_id"]),
            "name": clean}


async def delete_folder(pool: asyncpg.Pool, user_id: uuid.UUID,
                        folder_id: uuid.UUID) -> dict:
    """Deletes the folder and the notes in it. The journal keeps a line."""
    async with pool.acquire() as conn, conn.transaction():
        await _hold(conn, await conn.fetchval(FOLDER_PROJECT, folder_id),
                    "No such folder.", user_id=user_id)
        row, role = await _folder(conn, folder_id, user_id, lock=True)
        count = await conn.fetchval(
            "SELECT count(*) FROM notes WHERE folder_id = $1", folder_id)
        if role not in MANAGERS and not (role in WRITERS and count == 0
                                         and row["created_by"] == user_id):
            raise NotAllowed("The owner and admins delete a folder with notes "
                             "in it.")
        await conn.execute("DELETE FROM note_folders WHERE id = $1", folder_id)
        await accounts.journal(conn, "folder.deleted",
                               project_id=row["project_id"], user_id=user_id,
                               details={"folder": str(folder_id),
                                        "name": row["name"], "notes": count})
    return {"id": str(folder_id), "projectId": str(row["project_id"]),
            "name": row["name"], "notes": count}


# ------------------------------------------------------------------ notes


async def create_note(pool: asyncpg.Pool, user_id: uuid.UUID,
                      folder_id: uuid.UUID, title: object = "",
                      blocks: object = None) -> dict:
    clean_t, clean_b = clean_title(title), clean_blocks(blocks)
    async with pool.acquire() as conn, conn.transaction():
        # The project held, for the count of its notes, then the folder: a
        # folder deleted meanwhile waits, then takes the note along.
        await _hold(conn, await conn.fetchval(FOLDER_PROJECT, folder_id),
                    "No such folder.", mode="UPDATE", user_id=user_id)
        folder, role = await _folder(conn, folder_id, user_id, lock=True)
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        project_id = folder["project_id"]
        if await conn.fetchval(
                "SELECT count(*) FROM notes n JOIN note_folders f "
                "ON f.id = n.folder_id WHERE f.project_id = $1",
                project_id) >= NOTES_MAX:
            raise Taken(f"A project holds at most {NOTES_MAX} notes.")
        ticked = _with_ticks([], clean_b, user_id, _now())
        total, done, excerpt = summary(ticked)
        body = _dump(ticked)
        note_id = await conn.fetchval(
            "INSERT INTO notes (folder_id, title, body, todo_total, todo_done, "
            "excerpt, created_by, edited_by) "
            "VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $7) RETURNING id",
            folder_id, clean_t, body, total, done, excerpt, user_id)
        await conn.execute(
            "INSERT INTO note_versions (note_id, version, title, body) "
            "VALUES ($1, 1, $2, $3::jsonb)", note_id, clean_t, body)
        await accounts.journal(conn, "note.created", project_id=project_id,
                               user_id=user_id,
                               details={"note": str(note_id),
                                        "folder": folder["name"]})
        row, role = await _note_row(conn, note_id, user_id)
        return await _describe(conn, row, role, user_id)


async def get_note(pool: asyncpg.Pool, user_id: uuid.UUID,
                   note_id: uuid.UUID) -> dict:
    async with pool.acquire() as conn:
        row, role = await _note_row(conn, note_id, user_id)
        return await _describe(conn, row, role, user_id)


async def save_note(pool: asyncpg.Pool, user_id: uuid.UUID, note_id: uuid.UUID,
                    base_version: int, title: object, blocks: object) -> dict:
    """Saves the title and the blocks the page has, made from `base_version`.
    From an older version they are merged with what was saved since; where
    both changed the same thing, Conflict with the note as it is now. The
    page then merges on its own, the person choosing whose change to keep
    where both changed, and saves that from the version it was given."""
    clean_t, clean_b = clean_title(title), clean_blocks(blocks)
    async with pool.acquire() as conn, conn.transaction():
        row, role = await _note_row(conn, note_id, user_id, lock=True)
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        current = _load(row["body"])
        version = row["version"]
        new_title, new_blocks = clean_t, clean_b
        if base_version != version:
            base = await conn.fetchrow(
                "SELECT title, body FROM note_versions "
                "WHERE note_id = $1 AND version = $2", note_id, base_version)
            if base is None or base_version > version:
                raise Conflict(await _describe(conn, row, role, user_id))
            try:
                new_title, new_blocks = merge(
                    base["title"], _load(base["body"]), clean_t, clean_b,
                    row["title"], current)
            except _Clash:
                raise Conflict(await _describe(conn, row, role, user_id)) from None
        new_blocks = _with_ticks(current, new_blocks, user_id, _now())
        if new_title == row["title"] and new_blocks == current:
            return await _describe(conn, row, role, user_id)
        await _store(conn, note_id, version + 1, new_title, new_blocks, user_id)
        row, role = await _note_row(conn, note_id, user_id)
        return await _describe(conn, row, role, user_id)


async def tick(pool: asyncpg.Pool, user_id: uuid.UUID, note_id: uuid.UUID,
               block_id: str, done: bool) -> dict:
    """Ticks a checklist item, or takes the tick off, at once and for
    everyone: the note's new version, and the item with who ticked it."""
    async with pool.acquire() as conn, conn.transaction():
        row, role = await _note_row(conn, note_id, user_id, lock=True)
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        blocks = _load(row["body"])
        item = next((b for b in blocks if b.get("id") == block_id), None)
        if item is None or item.get("type") != "todo":
            # Not 404, which says the note is gone: the item went, deleted
            # or turned into text on another device.
            raise Invalid("That item is not in the checklist any more.")
        if (item.get("done") is True) != done:
            item.update(done=done, by=str(user_id) if done else None,
                        at=_now() if done else None)
            await _store(conn, note_id, row["version"] + 1, row["title"],
                         blocks, user_id)
        row, role = await _note_row(conn, note_id, user_id)
        return await _describe(conn, row, role, user_id)


async def move_note(pool: asyncpg.Pool, user_id: uuid.UUID, note_id: uuid.UUID,
                    folder_id: uuid.UUID | None = None, *,
                    project_id: uuid.UUID | None = None) -> dict:
    """Puts the note in another folder: of its project, or from 0.1.2 of
    another project the person writes notes in. Out of its project a note
    goes as it would be deleted from there: by its author, the owner and
    admins. With `project_id` instead of a folder, it goes into that
    project's folder named as the one it is in now, made for it if there is
    none.

    Everything goes with it: its versions, the ticks with who made them,
    who wrote it. Between projects the journal of each keeps a line, which
    names neither the other project nor its folder: the people of one
    project learn nothing of another they are not in."""
    if (folder_id is None) == (project_id is None):
        raise Invalid("Say where the note goes: a folder, or a project.")
    missing = "No such folder." if folder_id is not None else "No such project."
    async with pool.acquire() as conn, conn.transaction():
        # Someone else's note, or project, is not there for this person,
        # and nothing of theirs is held: looked at before anything is
        # locked, and again once it is.
        source = await conn.fetchval(NOTE_PROJECT, note_id)
        if source is None or await _role(conn, source, user_id) is None:
            raise NotFound("No such note.")
        target = (project_id if folder_id is None
                  else await conn.fetchval(FOLDER_PROJECT, folder_id))
        if target is None or (target != source and
                              await _role(conn, target, user_id) is None):
            raise NotFound(missing)
        # Both projects held, always in the same order, as moving a machine
        # holds them (projects.move_machine).
        for pid in sorted({source, target}):
            await _hold(conn, pid, "No such note." if pid == source else missing,
                        mode="UPDATE")
        row, role = await _note_row(conn, note_id, user_id, lock=True)
        if row["project_id"] != source:
            raise Refused("The note was just moved from another tab or device. "
                          "Look again.")
        if role not in WRITERS:
            raise NotAllowed("An observer reads notes but does not write them.")
        across = target != source
        if across:
            if not (role in MANAGERS or row["created_by"] == user_id):
                author = (accounts.first_name(row["created_name"])
                          if row["created_name"] else "Its author")
                raise NotAllowed(f"{author}, the owner and admins can move it to "
                                 "another project.")
            there = await _role(conn, target, user_id)
            if there is None:
                raise NotFound(missing)
            if there not in WRITERS:
                name = await conn.fetchval(
                    "SELECT name FROM projects WHERE id = $1", target)
                raise NotAllowed(f"In {name} you read notes but do not write them.")
            if await conn.fetchval(
                    "SELECT count(*) FROM notes n JOIN note_folders f "
                    "ON f.id = n.folder_id WHERE f.project_id = $1",
                    target) >= NOTES_MAX:
                raise Taken(f"A project holds at most {NOTES_MAX} notes.")
        if folder_id is not None:
            folder = await conn.fetchrow(
                "SELECT id, name FROM note_folders WHERE id = $1 FOR UPDATE",
                folder_id)
            if folder is None:
                raise NotFound("No such folder.")
        else:
            folder = await conn.fetchrow(
                "SELECT id, name FROM note_folders WHERE project_id = $1 "
                "AND lower(name) = lower($2) FOR UPDATE", target,
                row["folder_name"])
            if folder is None:
                if await conn.fetchval(
                        "SELECT count(*) FROM note_folders WHERE project_id = $1",
                        target) >= FOLDERS_MAX:
                    raise Taken(f"A project holds at most {FOLDERS_MAX} folders.")
                folder = await conn.fetchrow(
                    "INSERT INTO note_folders (project_id, name, created_by) "
                    "VALUES ($1, $2, $3) RETURNING id, name", target,
                    row["folder_name"], user_id)
                await accounts.journal(
                    conn, "folder.created", project_id=target, user_id=user_id,
                    details={"folder": str(folder["id"]), "name": folder["name"]})
        if folder["id"] == row["folder_id"]:
            return await _describe(conn, row, role, user_id)
        await conn.execute("UPDATE notes SET folder_id = $2 WHERE id = $1",
                           note_id, folder["id"])
        if across:
            for kind, pid, folder_name in (
                    ("note.moved_out", source, row["folder_name"]),
                    ("note.moved_in", target, folder["name"])):
                await accounts.journal(conn, kind, project_id=pid,
                                       user_id=user_id,
                                       details={"note": str(note_id),
                                                "title": row["title"],
                                                "folder": folder_name})
        row, role = await _note_row(conn, note_id, user_id)
        return await _describe(conn, row, role, user_id)


async def delete_note(pool: asyncpg.Pool, user_id: uuid.UUID,
                      note_id: uuid.UUID) -> dict:
    """Deletes the note for everyone. The journal keeps a line."""
    async with pool.acquire() as conn, conn.transaction():
        held = await conn.fetchval(NOTE_PROJECT, note_id)
        await _hold(conn, held, "No such note.", user_id=user_id)
        row, role = await _note_row(conn, note_id, user_id, lock=True)
        if row["project_id"] != held:
            # Moved to another project meanwhile (0.1.2): its line in the
            # journal would be that project's, which is not held.
            raise Refused("The note was just moved from another tab or device. "
                          "Look again.")
        if not (role in MANAGERS or (role in WRITERS
                                     and row["created_by"] == user_id)):
            if role not in WRITERS:
                raise NotAllowed("An observer reads notes but does not delete "
                                 "them.")
            author = (accounts.first_name(row["created_name"])
                      if row["created_name"] else "Its author")
            raise NotAllowed(f"{author}, the owner and admins can delete it.")
        await conn.execute("DELETE FROM notes WHERE id = $1", note_id)
        await accounts.journal(conn, "note.deleted",
                               project_id=row["project_id"], user_id=user_id,
                               details={"note": str(note_id),
                                        "title": row["title"],
                                        "folder": row["folder_name"]})
    return {"id": str(note_id), "projectId": str(row["project_id"]),
            "title": row["title"], "folder": row["folder_name"]}


async def folders_of(pool: asyncpg.Pool,
                     project_ids: list[uuid.UUID]) -> dict[str, list[dict]]:
    """Each project's folders, by name, and the notes in each, the newest
    first: what the sidebar and the project's page list, without bodies."""
    folders = await pool.fetch(
        """
        SELECT f.id, f.project_id, f.name, f.created_by, u.name AS created_name
        FROM note_folders f LEFT JOIN users u ON u.id = f.created_by
        WHERE f.project_id = ANY($1::uuid[])
        ORDER BY lower(f.name), f.created_at
        """, project_ids)
    notes = await pool.fetch(
        """
        SELECT n.id, n.folder_id, n.title, n.todo_total, n.todo_done,
               n.excerpt, n.version, n.created_by, n.created_at, n.edited_by,
               n.edited_at, cu.name AS created_name, eu.name AS edited_name
        FROM notes n
        JOIN note_folders f ON f.id = n.folder_id
        LEFT JOIN users cu ON cu.id = n.created_by
        LEFT JOIN users eu ON eu.id = n.edited_by
        WHERE f.project_id = ANY($1::uuid[])
        ORDER BY n.created_at DESC, n.id
        """, project_ids)
    by_folder: dict[uuid.UUID, list[dict]] = {}
    for n in notes:
        by_folder.setdefault(n["folder_id"], []).append({
            "id": str(n["id"]), "title": n["title"],
            "total": n["todo_total"], "done": n["todo_done"],
            "excerpt": n["excerpt"], "version": n["version"],
            "createdBy": _person(n["created_by"], n["created_name"]),
            "createdAt": _ms(n["created_at"]),
            "editedBy": _person(n["edited_by"], n["edited_name"]),
            "editedAt": _ms(n["edited_at"]),
        })
    out: dict[str, list[dict]] = {str(p): [] for p in project_ids}
    for f in folders:
        out[str(f["project_id"])].append({
            "id": str(f["id"]), "name": f["name"],
            "createdBy": _person(f["created_by"], f["created_name"]),
            "notes": by_folder.get(f["id"], []),
        })
    return out

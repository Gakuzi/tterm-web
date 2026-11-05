"""
GitHub & Notes Unification Engine.

Unifies project notes with GitHub repositories:
1. Shared Notes: Stored as Markdown (.md) in the GitHub repository (supporting full markdown, checklists, code, etc.).
2. Personal Notes: Stored privately in the local PostgreSQL database, never synced to public GitHub.
3. Commit Logging: Recent commits are automatically tracked and formatted as structured Markdown notes with checklists.
4. Folder Synchronization: Git repository directories (docs/, notes/, etc.) map directly to note folders.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import asyncpg
from pydantic import BaseModel, Field

from ..core import notes
from .git_sync import git_sync_manager, ProjectGitConfigDTO

log = logging.getLogger("tterm.orchestration.github_notes")


def markdown_to_blocks(md_text: str) -> List[Dict[str, Any]]:
    """Converts a Markdown document into tTerm block format."""
    lines = md_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: List[Dict[str, Any]] = []

    in_code = False
    code_lang = ""
    code_lines: List[str] = []
    para_lines: List[str] = []

    def flush_para():
        nonlocal para_lines
        if para_lines:
            text = "\n".join(para_lines).strip()
            if text:
                blocks.append({
                    "id": notes.new_block_id(),
                    "type": "p",
                    "text": text
                })
            para_lines = []

    for line in lines:
        stripped = line.strip()

        # Code block boundary
        if stripped.startswith("```"):
            if in_code:
                # End code block
                blocks.append({
                    "id": notes.new_block_id(),
                    "type": "code",
                    "text": "\n".join(code_lines)
                })
                code_lines = []
                in_code = False
            else:
                flush_para()
                in_code = True
                code_lang = stripped[3:].strip()
                code_lines = []
            continue

        if in_code:
            code_lines.append(line)
            continue

        # Horizontal divider
        if stripped in ("---", "***", "___") and len(stripped) >= 3:
            flush_para()
            blocks.append({
                "id": notes.new_block_id(),
                "type": "hr",
                "text": ""
            })
            continue

        # Headings (#, ##, ###, etc.)
        h_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if h_match:
            flush_para()
            text = h_match.group(2).strip()
            blocks.append({
                "id": notes.new_block_id(),
                "type": "h",
                "text": text
            })
            continue

        # Checklists: - [ ] or - [x]
        todo_match = re.match(r"^[-*+]\s+\[([ xX])\]\s+(.*)$", stripped)
        if todo_match:
            flush_para()
            is_done = todo_match.group(1).lower() == "x"
            text = todo_match.group(2).strip()
            blocks.append({
                "id": notes.new_block_id(),
                "type": "todo",
                "text": text,
                "done": is_done
            })
            continue

        # Bullet list: - item or * item
        li_match = re.match(r"^[-*+]\s+(.*)$", stripped)
        if li_match:
            flush_para()
            text = li_match.group(1).strip()
            blocks.append({
                "id": notes.new_block_id(),
                "type": "li",
                "text": text
            })
            continue

        # Blank line flushes paragraph
        if not stripped:
            flush_para()
            continue

        # Regular text line accumulates in paragraph
        para_lines.append(line)

    flush_para()

    if in_code and code_lines:
        blocks.append({
            "id": notes.new_block_id(),
            "type": "code",
            "text": "\n".join(code_lines)
        })

    return blocks if blocks else [{"id": notes.new_block_id(), "type": "p", "text": ""}]


def blocks_to_markdown(title: str, blocks: List[Dict[str, Any]]) -> str:
    """Converts a note's title and blocks into standard GitHub Flavored Markdown."""
    parts: List[str] = []
    if title.strip():
        parts.append(f"# {title.strip()}")

    prev_type = None
    for b in blocks:
        b_type = b.get("type", "p")
        text = b.get("text", "")
        line = ""

        if b_type == "h":
            line = f"## {text}"
        elif b_type == "todo":
            mark = "x" if b.get("done") else " "
            line = f"- [{mark}] {text}"
        elif b_type == "li":
            line = f"- {text}"
        elif b_type == "code":
            line = f"```\n{text}\n```"
        elif b_type == "hr":
            line = "---"
        else:
            line = text

        # Group lists together without double newlines
        is_list = b_type in ("li", "todo")
        was_list = prev_type in ("li", "todo")

        if is_list and was_list and parts:
            parts[-1] += "\n" + line
        else:
            parts.append(line)

        prev_type = b_type

    return "\n\n".join(parts) + "\n"


class GitHubNoteItemDTO(BaseModel):
    id: str
    folder_id: str
    folder_name: str
    title: str
    is_personal: bool = False
    is_github_synced: bool = True
    github_path: str = ""
    updated_at: str = ""


class GitHubNotesSyncResponseDTO(BaseModel):
    ok: bool
    synced_notes_count: int = 0
    synced_folders_count: int = 0
    synced_commits_count: int = 0
    notes: List[GitHubNoteItemDTO] = []
    message: str = ""


class GitHubNotesManager:
    """Manages synchronization between GitHub repository Markdown files, commits, and tTerm notes."""

    async def ensure_schema(self, pool: asyncpg.Pool) -> None:
        """Adds necessary columns to note_folders and notes if not present."""
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS is_github boolean NOT NULL DEFAULT false;
                    ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS github_dir text DEFAULT '';
                    ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
                    ALTER TABLE notes ADD COLUMN IF NOT EXISTS github_path text DEFAULT '';
                """)
        except Exception as exc:
            log.warning("Could not alter note tables (schema might already exist): %s", exc)

    async def get_or_create_folder(
        self,
        conn: asyncpg.Connection,
        project_id: uuid.UUID,
        name: str,
        user_id: uuid.UUID,
        is_github: bool = False,
        github_dir: str = ""
    ) -> uuid.UUID:
        """Finds or creates a note folder in the project."""
        clean = name.strip()[:80] or "Docs"
        folder_id = await conn.fetchval(
            "SELECT id FROM note_folders WHERE project_id = $1 AND lower(name) = lower($2)",
            project_id, clean
        )
        if folder_id:
            if is_github:
                await conn.execute(
                    "UPDATE note_folders SET is_github = true, github_dir = $2 WHERE id = $1",
                    folder_id, github_dir
                )
            return folder_id

        folder_id = await conn.fetchval(
            "INSERT INTO note_folders (project_id, name, created_by, is_github, github_dir) "
            "VALUES ($1, $2, $3, $4, $5) RETURNING id",
            project_id, clean, user_id, is_github, github_dir
        )
        return folder_id

    def discover_local_markdown_files(self, search_paths: List[Path]) -> List[Tuple[str, str, str]]:
        """
        Scans given directories for Markdown files.
        Returns list of tuples: (relative_folder, file_title, file_content)
        """
        found = []
        for base in search_paths:
            if not base.exists() or not base.is_dir():
                continue
            for root, dirs, files in os.walk(base):
                # Skip hidden, git, and node_modules
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", ".venv", "venv", "__pycache__")]
                for f in files:
                    if f.endswith(".md"):
                        full_path = Path(root) / f
                        try:
                            rel = full_path.relative_to(base)
                            folder_name = "Документация репозитория" if len(rel.parts) == 1 else f"docs/{rel.parts[0]}"
                            title = rel.stem.replace("_", " ").replace("-", " ").title()
                            if f == "README.md":
                                title = "README"
                            content = full_path.read_text(encoding="utf-8", errors="replace")
                            found.append((folder_name, title, content))
                        except Exception:
                            continue
        return found

    def discover_recent_git_commits(self, repo_dir: Path, limit: int = 10) -> List[Dict[str, Any]]:
        """Retrieves recent git commits to transform into notes."""
        if not repo_dir.exists() or not (repo_dir / ".git").exists():
            return []
        try:
            # git log with format: hash|author|date|subject|body
            cmd = [
                "git", "log", f"-n{limit}",
                "--format=%h%x00%an%x00%ad%x00%s%x00%b%x1f",
                "--date=iso",
            ]
            res = subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, timeout=5)
            if res.returncode != 0:
                return []

            commits = []
            entries = res.stdout.strip().split("\x1f")
            for entry in entries:
                if not entry.strip():
                    continue
                parts = entry.strip().split("\x00")
                if len(parts) >= 4:
                    h, author, date_str, subject = parts[0], parts[1], parts[2], parts[3]
                    body = parts[4] if len(parts) > 4 else ""

                    # Get files changed in this commit
                    files_res = subprocess.run(
                        ["git", "show", "--stat", "--name-only", "--oneline", h],
                        cwd=repo_dir, capture_output=True, text=True, timeout=3
                    )
                    changed_files = [line.strip() for line in files_res.stdout.splitlines()[1:] if line.strip() and not line.strip().startswith("commit")]

                    commits.append({
                        "hash": h,
                        "author": author,
                        "date": date_str,
                        "subject": subject,
                        "body": body,
                        "files": changed_files[:20],
                    })
            return commits
        except Exception as exc:
            log.warning("Could not get git commits from %s: %s", repo_dir, exc)
            return []

    async def sync_project_notes(
        self,
        pool: asyncpg.Pool,
        project_id_str: str,
        user_id: uuid.UUID,
        repo_paths: Optional[List[Path]] = None,
    ) -> GitHubNotesSyncResponseDTO:
        """
        Synchronizes all GitHub repository Markdown files and commits as project notes.
        Keeps personal notes safe and intact.
        """
        await self.ensure_schema(pool)
        project_id = uuid.UUID(project_id_str)
        cfg = git_sync_manager.get_config(project_id_str)

        # Default paths to look for git repository
        if not repo_paths:
            repo_paths = [
                Path("/app"),
                Path.cwd(),
                Path.home() / "tterm-server",
                Path(__file__).resolve().parent.parent.parent,
            ]

        # 1. Discover local Markdown files
        md_files = self.discover_local_markdown_files(repo_paths)

        # 2. Discover recent git commits
        valid_repo_dir = None
        for p in repo_paths:
            if (p / ".git").exists():
                valid_repo_dir = p
                break
        commits = self.discover_recent_git_commits(valid_repo_dir, limit=12) if valid_repo_dir else []

        synced_notes = []
        synced_folders = set()

        async with pool.acquire() as conn, conn.transaction():
            # A. Sync Markdown files
            for folder_name, title, content in md_files:
                f_id = await self.get_or_create_folder(
                    conn, project_id, folder_name, user_id, is_github=True, github_dir=folder_name
                )
                synced_folders.add(folder_name)

                # Parse Markdown into blocks
                blocks = markdown_to_blocks(content)
                ticked = notes._with_ticks([], blocks, user_id, notes._now())
                total, done, excerpt = notes.summary(ticked)
                body = notes._dump(ticked)

                # Check if note already exists in this folder (and is not personal)
                existing_id = await conn.fetchval(
                    "SELECT id FROM notes WHERE folder_id = $1 AND lower(title) = lower($2) AND is_personal = false",
                    f_id, title
                )

                if existing_id:
                    await conn.execute("""
                        UPDATE notes SET body = $2::jsonb, todo_total = $3, todo_done = $4,
                                         excerpt = $5, edited_at = now()
                        WHERE id = $1
                    """, existing_id, body, total, done, excerpt)
                    note_id = existing_id
                else:
                    note_id = await conn.fetchval("""
                        INSERT INTO notes (folder_id, title, body, todo_total, todo_done, excerpt, created_by, edited_by, is_personal, github_path)
                        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $7, false, $8)
                        RETURNING id
                    """, f_id, title, body, total, done, excerpt, user_id, f"{folder_name}/{title}.md")
                    await conn.execute("""
                        INSERT INTO note_versions (note_id, version, title, body)
                        VALUES ($1, 1, $2, $3::jsonb) ON CONFLICT DO NOTHING
                    """, note_id, title, body)

                synced_notes.append(GitHubNoteItemDTO(
                    id=str(note_id),
                    folder_id=str(f_id),
                    folder_name=folder_name,
                    title=title,
                    is_personal=False,
                    is_github_synced=True,
                    github_path=f"{folder_name}/{title}.md",
                    updated_at=time.strftime("%Y-%m-%d %H:%M:%S")
                ))

            # B. Sync Commits as Notes
            if commits:
                commit_folder_name = "Коммиты / Changelog"
                commit_f_id = await self.get_or_create_folder(
                    conn, project_id, commit_folder_name, user_id, is_github=True, github_dir="commits"
                )
                synced_folders.add(commit_folder_name)

                for c in commits:
                    c_title = f"Коммит {c['hash']}: {c['subject'][:80]}"

                    # Build Markdown for commit note
                    md_parts = [
                        f"# {c_title}",
                        f"## 📋 Описание изменений",
                        c["subject"] + (f"\n\n{c['body']}" if c['body'] else ""),
                        f"## ℹ️ Метаданные фиксации",
                        f"- Автор: **{c['author']}**",
                        f"- Дата: {c['date']}",
                        f"- Хеш коммита: `{c['hash']}`",
                    ]
                    if c["files"]:
                        md_parts.append("## 📦 Измененные файлы (чеклист задач)")
                        for f in c["files"]:
                            md_parts.append(f"- [x] `{f}`")

                    commit_md = "\n\n".join(md_parts)
                    c_blocks = markdown_to_blocks(commit_md)
                    c_ticked = notes._with_ticks([], c_blocks, user_id, notes._now())
                    c_total, c_done, c_excerpt = notes.summary(c_ticked)
                    c_body = notes._dump(c_ticked)

                    existing_c_id = await conn.fetchval(
                        "SELECT id FROM notes WHERE folder_id = $1 AND lower(title) = lower($2)",
                        commit_f_id, c_title
                    )
                    if not existing_c_id:
                        c_note_id = await conn.fetchval("""
                            INSERT INTO notes (folder_id, title, body, todo_total, todo_done, excerpt, created_by, edited_by, is_personal, github_path)
                            VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $7, false, $8)
                            RETURNING id
                        """, commit_f_id, c_title, c_body, c_total, c_done, c_excerpt, user_id, f"commits/{c['hash']}.md")
                        await conn.execute("""
                            INSERT INTO note_versions (note_id, version, title, body)
                            VALUES ($1, 1, $2, $3::jsonb) ON CONFLICT DO NOTHING
                        """, c_note_id, c_title, c_body)

                        synced_notes.append(GitHubNoteItemDTO(
                            id=str(c_note_id),
                            folder_id=str(commit_f_id),
                            folder_name=commit_folder_name,
                            title=c_title,
                            is_personal=False,
                            is_github_synced=True,
                            github_path=f"commits/{c['hash']}.md",
                            updated_at=time.strftime("%Y-%m-%d %H:%M:%S")
                        ))

        return GitHubNotesSyncResponseDTO(
            ok=True,
            synced_notes_count=len(synced_notes),
            synced_folders_count=len(synced_folders),
            synced_commits_count=len(commits),
            notes=synced_notes,
            message=f"Успешно синхронизировано {len(synced_notes)} заметок из GitHub репозитория и {len(commits)} коммитов."
        )

    async def commit_note_to_github(
        self,
        pool: asyncpg.Pool,
        project_id_str: str,
        note_id_str: str,
        user_id: uuid.UUID,
        repo_dir: Optional[Path] = None,
        author_name: str = "user"
    ) -> Dict[str, Any]:
        """Saves a shared note as Markdown file and creates a git commit."""
        note_id = uuid.UUID(note_id_str)
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT n.id, n.title, n.body, n.is_personal, n.github_path, f.name as folder_name
                FROM notes n
                JOIN note_folders f ON f.id = n.folder_id
                WHERE n.id = $1
            """, note_id)
            if not row:
                return {"ok": False, "error": "Note not found"}
            if row["is_personal"]:
                return {"ok": False, "error": "Личные заметки хранятся только локально в вашей базе данных и не отправляются на GitHub"}

            title = row["title"]
            blocks = notes._load(row["body"])
            folder_name = row["folder_name"]
            github_path = row["github_path"] or f"docs/{re.sub(r'[^a-zA-Z0-9_-]', '_', title)}.md"

        # Convert to Markdown
        md_content = blocks_to_markdown(title, blocks)

        if not repo_dir:
            for p in (Path("/app"), Path.cwd(), Path.home() / "tterm-server"):
                if (p / ".git").exists():
                    repo_dir = p
                    break

        if not repo_dir or not (repo_dir / ".git").exists():
            return {"ok": True, "note_id": note_id_str, "status": "saved_locally_no_git_worktree"}

        # Write to repo
        target_file = repo_dir / github_path
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text(md_content, encoding="utf-8")

        # Git add & commit
        try:
            subprocess.run(["git", "add", str(target_file)], cwd=repo_dir, check=True, capture_output=True)
            msg = f"docs(notes): обновить заметку '{title}' [автор: {author_name}]"
            subprocess.run(["git", "commit", "-m", msg], cwd=repo_dir, capture_output=True)
            log.info("Committed shared note %s to %s", title, target_file)
            return {"ok": True, "file": str(github_path), "commit_message": msg}
        except Exception as exc:
            log.warning("Git commit note failed: %s", exc)
            return {"ok": True, "saved_file": str(github_path), "git_note": str(exc)}


github_notes_manager = GitHubNotesManager()

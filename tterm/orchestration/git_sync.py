"""
Git Repository & Terminal Branch Orchestration Engine.

Manages per-project repository bindings, isolated Git branches per terminal,
and automatic action commit tracking for terminal sessions.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional
from .models import BaseModel, Field

log = logging.getLogger("tterm.orchestration.git_sync")

DEFAULT_CONFIG_FILE = Path(os.getenv("GIT_CONFIGS_FILE", Path.home() / ".tterm-web" / "project_git_configs.json"))



class ProjectGitConfigDTO(BaseModel):
    project_id: str
    repo_url: str = Field(..., description="Git remote repository URL (GitHub, Gitea, GitLab)")
    provider: str = Field("github", description="github, gitea, gitlab")
    default_branch: str = Field("main", description="Base trunk branch")
    auto_branch_per_terminal: bool = Field(True, description="Whether each terminal creates its own isolated git branch")
    auto_commit_actions: bool = Field(True, description="Whether every command executed in terminal is recorded as a commit")
    use_github_notes: bool = Field(False, description="Whether project shared notes are stored and synced with GitHub")
    notes_folder_in_repo: str = Field("docs", description="Subfolder in repo for notes")
    auto_sync_commits_as_notes: bool = Field(True, description="Record commits as structured notes")


class TerminalGitBranchDTO(BaseModel):
    terminal_id: str
    project_id: str
    branch_name: str
    base_branch: str = "main"
    auto_commit: bool = True
    commits_count: int = 0
    last_action: Optional[str] = None


class GitSyncManager:
    """Manages project Git repositories and per-terminal branches with disk persistence."""

    def __init__(self, config_file: Optional[Path] = None):
        self._config_file = config_file or DEFAULT_CONFIG_FILE
        self._configs: Dict[str, ProjectGitConfigDTO] = {}
        self._terminal_branches: Dict[str, TerminalGitBranchDTO] = {}
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        try:
            if self._config_file.is_file():
                with open(self._config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for pid, item in data.items():
                        self._configs[pid] = ProjectGitConfigDTO(**item)
                log.info("Loaded %d project git configs from %s", len(self._configs), self._config_file)
        except Exception as e:
            log.warning("Could not load project git configs from disk: %s", e)

    def _save_to_disk(self) -> None:
        try:
            self._config_file.parent.mkdir(parents=True, exist_ok=True)
            serializable = {pid: cfg.model_dump() for pid, cfg in self._configs.items()}
            with open(self._config_file, "w", encoding="utf-8") as f:
                json.dump(serializable, f, indent=2, ensure_ascii=False)
        except Exception as e:
            log.warning("Could not persist project git configs to disk: %s", e)

    def get_config(self, project_id: str) -> ProjectGitConfigDTO:
        if project_id not in self._configs:
            fallback_repo = "https://github.com/DLGerasimenko/tterm-web.git" if project_id == "default" else ""
            self._configs[project_id] = ProjectGitConfigDTO(
                project_id=project_id,
                repo_url=fallback_repo,
                provider="github",
                default_branch="main",
                auto_branch_per_terminal=True,
                auto_commit_actions=True,
                use_github_notes=False,
                notes_folder_in_repo="docs",
                auto_sync_commits_as_notes=True,
            )
        return self._configs[project_id]

    def set_config(self, config: ProjectGitConfigDTO) -> ProjectGitConfigDTO:
        self._configs[config.project_id] = config
        self._save_to_disk()
        log.info("Project '%s' git repo bound to %s (auto_branch=%s, saved_to_disk=%s)",
                 config.project_id, config.repo_url, config.auto_branch_per_terminal, self._config_file)
        return config

    def get_all_configs(self) -> Dict[str, ProjectGitConfigDTO]:
        return dict(self._configs)


    def get_or_create_terminal_branch(
        self,
        project_id: str,
        terminal_id: str,
        terminal_label: str = "",
        user_name: str = "",
    ) -> TerminalGitBranchDTO:
        """Returns or creates the isolated git branch for a terminal."""
        if terminal_id in self._terminal_branches:
            return self._terminal_branches[terminal_id]

        cfg = self.get_config(project_id)

        # Build clean branch name: e.g. term/1-evgeniy or term/t-89a1
        if not user_name:
            try:
                from .github_app import github_manager
                st = github_manager.get_auth_status()
                if st.get("is_authenticated") and st.get("username"):
                    user_name = st["username"]
            except Exception:
                pass
        clean_user = re.sub(r"[^a-zA-Z0-9]", "", user_name).lower() if user_name else "user"
        clean_label = re.sub(r"[^a-zA-Z0-9]", "", terminal_label).lower() if terminal_label else ""

        if clean_label:
            branch_name = f"term/{clean_label}-{clean_user}"
        else:
            short_id = terminal_id.replace("-", "")[:6]
            branch_name = f"term/{short_id}-{clean_user}"

        dto = TerminalGitBranchDTO(
            terminal_id=terminal_id,
            project_id=project_id,
            branch_name=branch_name,
            base_branch=cfg.default_branch,
            auto_commit=cfg.auto_commit_actions,
            commits_count=0,
            last_action=None,
        )
        self._terminal_branches[terminal_id] = dto
        log.info("Terminal '%s' bound to git branch '%s'", terminal_id, branch_name)
        return dto

    def build_branch_setup_script(self, branch_name: str, base_branch: str = "main") -> str:
        """Generates shell commands to ensure worktree switches to this terminal's branch and sets author identity."""
        git_setup = ""
        try:
            from .github_app import github_manager
            git_setup = github_manager.get_terminal_git_setup()
        except Exception:
            pass

        setup_prefix = f"{git_setup} && " if git_setup else ""
        return (
            f'{setup_prefix}if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then '
            f'  git rev-parse --verify "{branch_name}" >/dev/null 2>&1 && git switch "{branch_name}" || '
            f'  git switch -c "{branch_name}" 2>/dev/null || git checkout -b "{branch_name}" 2>/dev/null; '
            f'fi'
        )

    def build_action_commit_command(self, command: str, author_name: str = "", exit_code: int = 0) -> str:
        """Generates a shell command to auto-commit a terminal action on behalf of user."""
        if not author_name:
            try:
                from .github_app import github_manager
                st = github_manager.get_auth_status()
                if st.get("is_authenticated"):
                    author_name = st.get("name") or st.get("username") or "user"
            except Exception:
                author_name = "user"

        # Sanitize command for commit message
        safe_cmd = re.sub(r"[\"'\n\r\\]", " ", command).strip()[:80]
        status = "ok" if exit_code == 0 else f"exit {exit_code}"
        msg = f"[term] {safe_cmd} ({status} by {author_name})"
        return (
            f'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then '
            f'  git add -A && git commit -m "{msg}" --allow-empty 2>/dev/null || true; '
            f'fi'
        )

    def record_commit(self, terminal_id: str, command: str) -> Optional[TerminalGitBranchDTO]:
        if terminal_id in self._terminal_branches:
            dto = self._terminal_branches[terminal_id]
            dto.commits_count += 1
            dto.last_action = command[:80]
            return dto
        return None

    def create_repository(
        self,
        project_id: str,
        repo_name: str,
        visibility: str = "public",
        scope: str = "project",
        terminal_id: Optional[str] = None,
        provider: str = "github",
    ) -> Dict[str, Any]:
        """Initializes a new repository target and binds it to project or terminal."""
        clean_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "-", repo_name.strip()).strip("-")
        if not clean_name:
            clean_name = f"tterm-repo-{project_id[:6]}"

        owner = "Gakuzi"
        try:
            from .github_app import github_manager
            st = github_manager.get_auth_status()
            if st.get("is_authenticated") and st.get("username"):
                owner = st["username"]
        except Exception:
            pass

        repo_url = f"https://github.com/{owner}/{clean_name}.git"

        cfg = self.get_config(project_id)
        cfg.repo_url = repo_url
        self.set_config(cfg)

        branch_info = None
        if terminal_id:
            branch_info = self.get_or_create_terminal_branch(
                project_id=project_id,
                terminal_id=terminal_id,
                terminal_label=clean_name,
            )

        return {
            "ok": True,
            "repo_url": repo_url,
            "repo_name": clean_name,
            "scope": scope,
            "branch": branch_info,
            "config": cfg,
        }


git_sync_manager = GitSyncManager()

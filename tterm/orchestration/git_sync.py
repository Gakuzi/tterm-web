"""
Git Repository & Terminal Branch Orchestration Engine.

Manages per-project repository bindings, isolated Git branches per terminal,
and automatic action commit tracking for terminal sessions.
"""
from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional
from .models import BaseModel, Field

log = logging.getLogger("tterm.orchestration.git_sync")


class ProjectGitConfigDTO(BaseModel):
    project_id: str
    repo_url: str = Field(..., description="Git remote repository URL (GitHub, Gitea, GitLab)")
    provider: str = Field("github", description="github, gitea, gitlab")
    default_branch: str = Field("main", description="Base trunk branch")
    auto_branch_per_terminal: bool = Field(True, description="Whether each terminal creates its own isolated git branch")
    auto_commit_actions: bool = Field(True, description="Whether every command executed in terminal is recorded as a commit")


class TerminalGitBranchDTO(BaseModel):
    terminal_id: str
    project_id: str
    branch_name: str
    base_branch: str = "main"
    auto_commit: bool = True
    commits_count: int = 0
    last_action: Optional[str] = None


class GitSyncManager:
    """Manages project Git repositories and per-terminal branches."""

    def __init__(self):
        # project_id -> ProjectGitConfigDTO
        self._configs: Dict[str, ProjectGitConfigDTO] = {
            "default": ProjectGitConfigDTO(
                project_id="default",
                repo_url="https://github.com/DLGerasimenko/tterm-web.git",
                provider="github",
                default_branch="main",
                auto_branch_per_terminal=True,
                auto_commit_actions=True,
            )
        }
        # terminal_id -> TerminalGitBranchDTO
        self._terminal_branches: Dict[str, TerminalGitBranchDTO] = {}

    def get_config(self, project_id: str) -> ProjectGitConfigDTO:
        if project_id not in self._configs:
            self._configs[project_id] = ProjectGitConfigDTO(
                project_id=project_id,
                repo_url="https://github.com/DLGerasimenko/tterm-web.git",
                provider="github",
                default_branch="main",
                auto_branch_per_terminal=True,
                auto_commit_actions=True,
            )
        return self._configs[project_id]

    def set_config(self, config: ProjectGitConfigDTO) -> ProjectGitConfigDTO:
        self._configs[config.project_id] = config
        log.info("Project '%s' git repo bound to %s (auto_branch=%s)",
                 config.project_id, config.repo_url, config.auto_branch_per_terminal)
        return config

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
        """Generates shell commands to ensure worktree switches to this terminal's branch."""
        return (
            f'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then '
            f'  git rev-parse --verify "{branch_name}" >/dev/null 2>&1 && git switch "{branch_name}" || '
            f'  git switch -c "{branch_name}" 2>/dev/null || git checkout -b "{branch_name}" 2>/dev/null; '
            f'fi'
        )

    def build_action_commit_command(self, command: str, author_name: str, exit_code: int = 0) -> str:
        """Generates a shell command to auto-commit a terminal action."""
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


git_sync_manager = GitSyncManager()

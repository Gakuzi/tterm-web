"""
Many-to-Many Machine-to-Projects Orchestration & Terminal Dev Environments.

Manages binding of compute nodes (machines) to multiple projects,
and assigns isolated development environments (Git branches, SFTP endpoints)
to each terminal session per project.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("tterm.orchestration.machines_projects")

def _get_bindings_path() -> Path:
    docker_vol = Path("/app/data/signer/machine_project_bindings.json")
    if docker_vol.parent.exists():
        return docker_vol
    return Path.home() / ".tterm-web" / "machine_project_bindings.json"

CONFIG_PATH = _get_bindings_path()


class MachineProjectManager:
    """
    Manages many-to-many associations between physical/virtual nodes (machines)
    and collaborative projects, as well as per-terminal workspace contexts.
    """

    def __init__(self):
        # machine_id -> { project_id -> { "machine_id": ..., "project_id": ..., "project_name": ... } }
        self._machine_projects: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # project_id -> set of machine_ids
        self._project_machines: Dict[str, Set[str]] = {}
        # project_id -> project_name
        self._project_names: Dict[str, str] = {}
        # terminal_id -> context dict
        self._terminals: Dict[str, Dict[str, Any]] = {}
        # project_id -> set of terminal_ids
        self._project_terminals: Dict[str, Set[str]] = {}

        self._preload_defaults()
        self._load_from_disk()

    def _preload_defaults(self):
        """Clean defaults: no fictitious or cross-tenant nodes preloaded."""
        pass

    def _save_to_disk(self):
        try:
            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "machine_projects": self._machine_projects,
                "project_machines": {pid: list(mids) for pid, mids in self._project_machines.items()},
                "project_names": self._project_names,
                "terminals": self._terminals,
            }
            CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            log.warning("Could not save machine_project_bindings to disk: %s", e)

    def _load_from_disk(self):
        try:
            if CONFIG_PATH.exists():
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    mp = data.get("machine_projects", {})
                    if isinstance(mp, dict):
                        for mid, proj_map in mp.items():
                            if isinstance(proj_map, dict):
                                self._machine_projects.setdefault(mid, {}).update(proj_map)
                    pm = data.get("project_machines", {})
                    if isinstance(pm, dict):
                        for pid, mids in pm.items():
                            if isinstance(mids, list):
                                self._project_machines.setdefault(pid, set()).update(mids)
                    pn = data.get("project_names", {})
                    if isinstance(pn, dict):
                        self._project_names.update(pn)
                    t = data.get("terminals", {})
                    if isinstance(t, dict):
                        self._terminals.update(t)
                        for tid, ctx in t.items():
                            if isinstance(ctx, dict) and "project_id" in ctx:
                                self._project_terminals.setdefault(ctx["project_id"], set()).add(tid)
                    log.info("Loaded machine-project bindings from %s", CONFIG_PATH)
        except Exception as e:
            log.warning("Could not load machine_project_bindings from disk: %s", e)

    def reset(self):
        """Resets in-memory storage to preloaded defaults."""
        self._machine_projects.clear()
        self._project_machines.clear()
        self._project_names.clear()
        self._terminals.clear()
        self._project_terminals.clear()
        self._preload_defaults()

    # ------------------------------------------------------------------
    # Many-to-Many Machine-to-Projects Storage
    # ------------------------------------------------------------------

    def bind_machine_to_project(
        self,
        machine_id: str,
        project_id: str,
        project_name: str = "",
        save: bool = True,
    ) -> Dict[str, Any]:
        """
        Binds a machine to a project. A single machine can belong to multiple projects,
        and a single project can span multiple machines.
        """
        machine_id = str(machine_id).strip()
        project_id = str(project_id).strip()

        if not project_name:
            project_name = self._project_names.get(project_id, project_id)
        else:
            self._project_names[project_id] = project_name

        binding = {
            "machine_id": machine_id,
            "project_id": project_id,
            "project_name": project_name,
            "bound_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }

        if machine_id not in self._machine_projects:
            self._machine_projects[machine_id] = {}
        self._machine_projects[machine_id][project_id] = binding

        if project_id not in self._project_machines:
            self._project_machines[project_id] = set()
        self._project_machines[project_id].add(machine_id)

        if save:
            self._save_to_disk()

        log.info("Machine '%s' bound to project '%s' (%s)", machine_id, project_id, project_name)
        return binding

    def unbind_machine_from_project(self, machine_id: str, project_id: str) -> bool:
        """Unbinds a machine from a specific project."""
        machine_id = str(machine_id).strip()
        project_id = str(project_id).strip()
        removed = False

        if machine_id in self._machine_projects and project_id in self._machine_projects[machine_id]:
            del self._machine_projects[machine_id][project_id]
            removed = True

        if project_id in self._project_machines and machine_id in self._project_machines[project_id]:
            self._project_machines[project_id].discard(machine_id)

        if removed:
            self._save_to_disk()

        log.info("Machine '%s' unbound from project '%s' (removed=%s)", machine_id, project_id, removed)
        return removed

    def get_projects_for_machine(self, machine_id: str) -> List[Dict[str, Any]]:
        """Returns list of projects bound to this machine."""
        machine_id = str(machine_id).strip()
        if machine_id not in self._machine_projects:
            return []
        return list(self._machine_projects[machine_id].values())

    def get_machines_for_project(self, project_id: str) -> List[str]:
        """Returns list of machine IDs associated with this project."""
        project_id = str(project_id).strip()
        return sorted(list(self._project_machines.get(project_id, set())))

    # ------------------------------------------------------------------
    # Per-Terminal Project Dev Environments & Git Branch Isolation
    # ------------------------------------------------------------------

    def set_terminal_project(
        self,
        terminal_id: str,
        project_id: str,
        branch_name: Optional[str] = None,
        machine_id: Optional[str] = None,
        project_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Binds a terminal to a specific project and assigns it an isolated Git branch
        and development environment context.
        """
        terminal_id = str(terminal_id).strip()
        project_id = str(project_id).strip()

        # Resolve project name
        if not project_name:
            project_name = self._project_names.get(project_id, project_id)

        # Resolve machine
        if not machine_id:
            machines = self.get_machines_for_project(project_id)
            machine_id = machines[0] if machines else "server-node"
        else:
            machine_id = str(machine_id).strip()
            # If not yet bound to this project, automatically establish binding
            if machine_id not in self.get_machines_for_project(project_id):
                self.bind_machine_to_project(machine_id, project_id, project_name)

        # Resolve isolated Git branch
        if not branch_name:
            clean_tid = terminal_id.replace("-", "")
            branch_name = f"terminal/{clean_tid[:8]}" if len(clean_tid) >= 8 else f"terminal/{terminal_id}"

        # Resolve Git remote repo URL
        git_repo_url = "https://github.com/DLGerasimenko/tterm-web.git"
        try:
            from .git_sync import git_sync_manager
            cfg = git_sync_manager.get_config(project_id)
            if cfg and cfg.repo_url:
                git_repo_url = cfg.repo_url
        except Exception as e:
            log.debug("Git config lookup failed for project %s: %s", project_id, e)

        # SFTP endpoint for file browsing / code syncing
        ftp_sftp_endpoint = f"sftp://{machine_id}:22/projects/{project_id}"

        # Maintain isolation between projects if terminal changes project
        old_ctx = self._terminals.get(terminal_id)
        if old_ctx and old_ctx.get("project_id") != project_id:
            old_pid = old_ctx.get("project_id")
            if old_pid in self._project_terminals:
                self._project_terminals[old_pid].discard(terminal_id)

        context: Dict[str, Any] = {
            "terminal_id": terminal_id,
            "project_id": project_id,
            "project_name": project_name,
            "machine_id": machine_id,
            "branch_name": branch_name,
            "git_repo_url": git_repo_url,
            "ftp_sftp_endpoint": ftp_sftp_endpoint,
            "auto_commit": True,
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }

        self._terminals[terminal_id] = context
        if project_id not in self._project_terminals:
            self._project_terminals[project_id] = set()
        self._project_terminals[project_id].add(terminal_id)

        # Synchronize with git_sync_manager
        try:
            from .git_sync import TerminalGitBranchDTO, git_sync_manager
            dto = TerminalGitBranchDTO(
                terminal_id=terminal_id,
                project_id=project_id,
                branch_name=branch_name,
                base_branch="main",
                auto_commit=True,
                commits_count=0,
                last_action=None,
            )
            git_sync_manager._terminal_branches[terminal_id] = dto
        except Exception as e:
            log.debug("git_sync_manager synchronization ignored: %s", e)

        self._save_to_disk()

        log.info(
            "Terminal '%s' configured for project '%s' on machine '%s' (branch: %s)",
            terminal_id, project_id, machine_id, branch_name
        )
        return context

    def get_terminal_project_context(self, terminal_id: str) -> Dict[str, Any]:
        """
        Returns development environment context for a terminal:
        { project_id, project_name, machine_id, branch_name, git_repo_url, ftp_sftp_endpoint, auto_commit: True }
        """
        terminal_id = str(terminal_id).strip()
        if terminal_id not in self._terminals:
            # Auto-provision default context bound to default-project
            return self.set_terminal_project(terminal_id, "default-project")

        ctx = self._terminals[terminal_id]
        return {
            "project_id": ctx["project_id"],
            "project_name": ctx["project_name"],
            "machine_id": ctx["machine_id"],
            "branch_name": ctx["branch_name"],
            "git_repo_url": ctx["git_repo_url"],
            "ftp_sftp_endpoint": ctx["ftp_sftp_endpoint"],
            "auto_commit": ctx.get("auto_commit", True),
            "terminal_id": terminal_id,
        }

    def list_terminals_by_project(self, project_id: str) -> List[Dict[str, Any]]:
        """Returns list of all terminal contexts associated with a given project."""
        project_id = str(project_id).strip()
        term_ids = self._project_terminals.get(project_id, set())
        results: List[Dict[str, Any]] = []
        for tid in sorted(list(term_ids)):
            if tid in self._terminals:
                results.append(self.get_terminal_project_context(tid))
        return results


machine_project_manager = MachineProjectManager()

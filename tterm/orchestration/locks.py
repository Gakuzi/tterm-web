"""
Hierarchical Drain and Maintenance Lock Manager.

Prevents disruption of running commands across nested hierarchies (Node -> Container -> Service):
1. Detects active long-running commands before disruptive high-level actions (reboot, restart, delete).
2. Presents Impact Assessment to administrators with choices: Graceful Drain, Force Kill, or Cancel.
3. Enforces command line input locking for subordinate developers during drain.
4. Manages developer appeals/requests for extension back to the initiating administrator.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .models import ActiveProcessDTO, AppealDTO, DrainLockDTO, DrainLockStateEnum

log = logging.getLogger("tterm.orchestration.locks")


class HierarchicalLockManager:
    """Coordinates locks, drain status, and appeals across the entity hierarchy."""

    def __init__(self):
        # terminal_id -> ActiveProcessDTO
        self._active_commands: Dict[str, ActiveProcessDTO] = {}
        # terminal_id -> (node_id, container_id) mapping
        self._terminal_hierarchy: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
        # lock_id -> DrainLockDTO
        self._active_locks: Dict[str, DrainLockDTO] = {}
        # appeal_id -> AppealDTO
        self._appeals: Dict[str, AppealDTO] = {}

    def register_terminal_hierarchy(
        self, terminal_id: str, node_id: Optional[str] = None, container_id: Optional[str] = None
    ):
        """Binds a terminal to its parent node and container in the hierarchy."""
        self._terminal_hierarchy[terminal_id] = (node_id, container_id)

    def register_command_start(
        self, terminal_id: str, terminal_name: str, user_id: str, user_name: str, command: str
    ):
        """Called when a command starts executing in a terminal."""
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self._active_commands[terminal_id] = ActiveProcessDTO(
            terminal_id=terminal_id,
            terminal_name=terminal_name,
            user_id=user_id,
            user_name=user_name,
            command=command,
            running_since=now_iso,
            duration_seconds=0,
        )
        log.info("Process started in terminal %s by %s: %s", terminal_id, user_name, command)

    def register_command_end(self, terminal_id: str, exit_code: Optional[int] = 0):
        """Called when a running command terminates."""
        proc = self._active_commands.pop(terminal_id, None)
        if proc:
            log.info("Process ended in terminal %s (exit code %s)", terminal_id, exit_code)

        # Check if any active drain lock is now clear of all running processes
        for lock in list(self._active_locks.values()):
            if lock.state == DrainLockStateEnum.DRAINING:
                remaining = self.get_active_processes_for_entity(lock.entity_type, lock.entity_id)
                lock.active_processes = remaining
                if not remaining:
                    lock.state = DrainLockStateEnum.COMPLETED
                    log.info("Drain lock %s completed: all child processes finished gracefully.", lock.id)

    def get_active_processes_for_entity(
        self, entity_type: str, entity_id: str
    ) -> List[ActiveProcessDTO]:
        """Finds all running processes under a node or container."""
        active: List[ActiveProcessDTO] = []
        for tid, proc in self._active_commands.items():
            node_id, container_id = self._terminal_hierarchy.get(tid, (None, None))
            if entity_type == "node" and node_id == entity_id:
                active.append(proc)
            elif entity_type == "container" and container_id == entity_id:
                active.append(proc)
            elif entity_type == "terminal" and tid == entity_id:
                active.append(proc)
        return active

    def check_disruptive_impact(
        self,
        entity_type: str,
        entity_id: str,
        entity_name: str,
        action: str,
    ) -> Dict[str, Any]:
        """
        Assesses impact before a disruptive action.
        Returns active processes and drain recommendations for the administrator.
        """
        active_processes = self.get_active_processes_for_entity(entity_type, entity_id)
        has_active = len(active_processes) > 0
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "action": action,
            "has_active_processes": has_active,
            "active_processes_count": len(active_processes),
            "active_processes": [p.model_dump() for p in active_processes],
            "suggested_drain_seconds": 180 if has_active else 0,
            "can_force": True,
        }

    def initiate_drain_lock(
        self,
        initiator_id: str,
        initiator_name: str,
        entity_type: str,
        entity_id: str,
        entity_name: str,
        action: str,
        timeout_seconds: int = 180,
    ) -> DrainLockDTO:
        """Starts a graceful drain lock, blocking new subordinate command execution."""
        lock_id = str(uuid.uuid4())
        active = self.get_active_processes_for_entity(entity_type, entity_id)
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

        lock = DrainLockDTO(
            id=lock_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            initiator_id=initiator_id,
            initiator_name=initiator_name,
            action=action,
            state=DrainLockStateEnum.DRAINING if active else DrainLockStateEnum.COMPLETED,
            created_at=now_iso,
            timeout_seconds=timeout_seconds,
            active_processes=active,
        )
        self._active_locks[lock_id] = lock
        log.warning(
            "Drain lock '%s' initiated on %s '%s' by %s for action '%s'",
            lock_id, entity_type, entity_name, initiator_name, action
        )
        return lock

    def is_locked(self, terminal_id: str) -> Tuple[bool, Optional[DrainLockDTO]]:
        """Checks if a terminal is under an active drain or maintenance lock."""
        node_id, container_id = self._terminal_hierarchy.get(terminal_id, (None, None))
        for lock in self._active_locks.values():
            if lock.state == DrainLockStateEnum.DRAINING:
                if lock.entity_type == "node" and lock.entity_id == node_id:
                    return True, lock
                if lock.entity_type == "container" and lock.entity_id == container_id:
                    return True, lock
                if lock.entity_type == "terminal" and lock.entity_id == terminal_id:
                    return True, lock
        return False, None

    def submit_appeal(
        self, lock_id: str, user_id: str, user_name: str, terminal_id: str, reason: str
    ) -> AppealDTO:
        """Submits a subordinate appeal to the administrator."""
        appeal_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        appeal = AppealDTO(
            id=appeal_id,
            lock_id=lock_id,
            user_id=user_id,
            user_name=user_name,
            terminal_id=terminal_id,
            reason=reason,
            created_at=now_iso,
            status="pending",
        )
        self._appeals[appeal_id] = appeal
        log.info("Appeal submitted by %s for lock %s: %s", user_name, lock_id, reason)
        return appeal

    def resolve_appeal(self, appeal_id: str, approved: bool, extend_seconds: int = 120) -> bool:
        """Administrator approves or denies an appeal, extending the drain window if approved."""
        appeal = self._appeals.get(appeal_id)
        if not appeal:
            return False
        appeal.status = "approved" if approved else "rejected"
        if approved:
            lock = self._active_locks.get(appeal.lock_id)
            if lock:
                lock.timeout_seconds += extend_seconds
                log.info("Drain lock %s extended by %d seconds via appeal approval", lock.id, extend_seconds)
        return True

    def cancel_lock(self, lock_id: str) -> bool:
        """Cancels a drain lock, unblocking all child terminals."""
        lock = self._active_locks.get(lock_id)
        if not lock:
            return False
        lock.state = DrainLockStateEnum.CANCELLED
        log.info("Drain lock %s was cancelled by user.", lock_id)
        return True


lock_manager = HierarchicalLockManager()

"""
Dangerous Command Interception and Hierarchical Approval Workflow Engine.

Intercepts destructive, system-altering, or critical commands executed by
lower-tier members (developers, service operators, guests) in terminals,
and requires explicit approval from the project manager/owner before execution.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("tterm.orchestration.approvals")

# Regex patterns identifying critical/dangerous operations
DANGEROUS_PATTERNS: List[Tuple[str, str, str]] = [
    # (regex_pattern, risk_level, reason)
    (
        r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+[\/\*~]",
        "CRITICAL",
        "Массовое удаление файлов корневой или рабочей директории (rm -rf)",
    ),
    (
        r"\brm\s+-[a-zA-Z]*f[a-zA-Z]*r?\s+[\/\*~]",
        "CRITICAL",
        "Массовое удаление файлов (rm -fr)",
    ),
    (
        r"\bdocker\s+(?:compose\s+)?down\b",
        "HIGH",
        "Остановка и удаление сервисов и контейнеров (docker compose down)",
    ),
    (
        r"\bdocker\s+(?:rm|kill|rmi|volume\s+rm|system\s+prune)\b",
        "HIGH",
        "Удаление контейнеров, образов или очистка хранилища Docker",
    ),
    (
        r"\b(?:reboot|shutdown|poweroff|init\s+[06]|systemctl\s+(?:reboot|poweroff|halt))\b",
        "CRITICAL",
        "Перезагрузка или отключение физической/виртуальной ноды",
    ),
    (
        r"\b(?:mkfs|fdisk|parted|dd\s+if=|mkswap|format)\b",
        "CRITICAL",
        "Низкоуровневая разметка или форматирование дисковых накопителей",
    ),
    (
        r"\bchmod\s+-[a-zA-Z]*R\s+777\b",
        "HIGH",
        "Опасное рекурсивное открытие полных прав доступа (chmod -R 777)",
    ),
    (
        r"\bchown\s+-[a-zA-Z]*R\s+root\b",
        "HIGH",
        "Рекурсивная смена владельца системных каталогов на root",
    ),
    (
        r"\bkill\s+-9\s+-1\b|\bkillall\b",
        "HIGH",
        "Массовое принудительное завершение всех процессов в системе",
    ),
    (
        r"\bgit\s+(?:push\s+-[a-zA-Z]*f|push\s+--force|reset\s+--hard)\b",
        "HIGH",
        "Принудительная перезапись истории репозитория или сброс изменений",
    ),
    (
        r"\b(?:DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b",
        "CRITICAL",
        "Безвозвратное удаление таблиц или базы данных",
    ),
]


def inspect_command_danger(command: str) -> Tuple[bool, str, str]:
    """
    Analyzes command string against dangerous patterns.
    Returns (is_dangerous, risk_level, reason).
    """
    clean = command.strip()
    for pattern, risk, reason in DANGEROUS_PATTERNS:
        if re.search(pattern, clean, re.IGNORECASE):
            return True, risk, reason
    return False, "LOW", "Безопасная команда"


@dataclass
class ApprovalRequestDTO:
    id: str
    project_id: str
    terminal_id: str
    terminal_label: str
    node_id: str
    requester_id: str
    requester_name: str
    requester_role: str
    command: str
    risk_level: str
    reason: str
    status: str                        # "pending", "approved", "rejected"
    created_at: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewer_comment: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class DangerousActionManager:
    """Manages command approvals and delegation between project managers and subordinates."""

    def __init__(self):
        # request_id -> ApprovalRequestDTO
        self._requests: Dict[str, ApprovalRequestDTO] = {}

    def evaluate_command(
        self,
        project_id: str,
        terminal_id: str,
        terminal_label: str,
        node_id: str,
        requester_id: str,
        requester_name: str,
        requester_role: str,
        command: str,
    ) -> Dict[str, Any]:
        """
        Evaluates command. If safe or executed by project manager/owner, it is approved immediately.
        If dangerous and executed by a subordinate, it creates a pending approval request.
        """
        is_dangerous, risk, reason = inspect_command_danger(command)
        if not is_dangerous:
            return {
                "allowed": True,
                "requires_approval": False,
                "command": command,
                "risk_level": "LOW",
                "reason": "Безопасная команда",
            }

        # If user is project manager / owner / admin, bypass approval
        is_manager = requester_role.lower() in [
            "admin",
            "project_admin",
            "owner",
            "руководитель",
            "руководитель проекта",
        ] or requester_id in ["me", "admin", "owner"]

        if is_manager:
            log.info("Dangerous command '%s' executed directly by manager '%s'", command, requester_name)
            return {
                "allowed": True,
                "requires_approval": False,
                "command": command,
                "risk_level": risk,
                "reason": f"{reason} (авторизовано руководителем: {requester_name})",
            }

        # Subordinate execution: require approval
        req_id = f"appr-{uuid.uuid4().hex[:8]}"
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        req = ApprovalRequestDTO(
            id=req_id,
            project_id=project_id,
            terminal_id=terminal_id,
            terminal_label=terminal_label or f"Терминал {terminal_id[:6]}",
            node_id=node_id or "klim",
            requester_id=requester_id,
            requester_name=requester_name or "Разработчик",
            requester_role=requester_role or "Разработчик",
            command=command,
            risk_level=risk,
            reason=reason,
            status="pending",
            created_at=now,
        )
        self._requests[req_id] = req
        log.warning(
            "Dangerous command '%s' by subordinate '%s' [%s] intercepted, pending approval %s",
            command,
            requester_name,
            requester_role,
            req_id,
        )

        return {
            "allowed": False,
            "requires_approval": True,
            "request_id": req_id,
            "risk_level": risk,
            "reason": reason,
            "request": req.to_dict(),
        }

    def list_requests(self, project_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        results = []
        for r in self._requests.values():
            if project_id and r.project_id != project_id:
                continue
            if status and r.status != status:
                continue
            results.append(r.to_dict())
        # Sort newest first
        results.sort(key=lambda x: x["created_at"], reverse=True)
        return results

    def resolve_request(
        self,
        request_id: str,
        reviewer_id: str,
        reviewer_name: str,
        approved: bool,
        comment: str = "",
    ) -> Optional[Dict[str, Any]]:
        req = self._requests.get(request_id)
        if not req:
            return None

        req.status = "approved" if approved else "rejected"
        req.reviewed_at = dt.datetime.now(dt.timezone.utc).isoformat()
        req.reviewed_by = reviewer_name or reviewer_id
        req.reviewer_comment = comment or ("Разрешено руководителем" if approved else "Отклонено руководителем")

        log.info(
            "Approval request %s resolved as %s by %s",
            request_id,
            req.status,
            req.reviewed_by,
        )
        return req.to_dict()

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        req = self._requests.get(request_id)
        return req.to_dict() if req else None


approval_manager = DangerousActionManager()

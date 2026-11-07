"""
AI Agent Dynamic Session & Key Management Engine.

Manages scoped AI agent tokens, real-time MCP session tracking, and granular
RBAC permissions:
  - Generates scoped MCP connection keys for specific terminals, nodes, and projects
  - Tracks 1 AI Agent instance per session with live ONLINE status and command logging
  - Allows project managers to dynamically restrict or revoke AI agent capabilities
  - Enforces guard/readonly/execute security policies on all MCP operations
"""
from __future__ import annotations

import datetime as dt
import logging
import secrets
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .approvals import inspect_command_danger

log = logging.getLogger("tterm.orchestration.ai_sessions")


@dataclass
class AIAgentKeyDTO:
    token: str
    agent_name: str
    project_id: str
    allowed_terminals: List[str]      # e.g. ["c56de979-35aa-4828-9056-3dbaab629e0d"]
    allowed_nodes: List[str]          # e.g. ["klim"]
    role: str                         # "container_developer", "service_operator", "observer"
    ai_mode: str                      # "guard", "execute", "readonly"
    created_at: str
    expires_at: Optional[str] = None
    revoked: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AIAgentSessionDTO:
    session_id: str
    token: str
    agent_name: str
    project_id: str
    allowed_terminals: List[str]
    allowed_nodes: List[str]
    role: str
    ai_mode: str
    status: str                       # "ONLINE", "IDLE", "BLOCKED"
    connected_at: str
    last_active_at: str
    current_command: Optional[str] = None
    total_commands: int = 0
    blocked: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AIAgentSessionManager:
    """Manages active AI agent sessions and their permissions."""

    def __init__(self):
        # token -> AIAgentKeyDTO
        self._keys: Dict[str, AIAgentKeyDTO] = {}
        # session_id -> AIAgentSessionDTO
        self._sessions: Dict[str, AIAgentSessionDTO] = {}

        # Preload default key for Antigravity assistant
        default_token = "tt_ai_default_antigravity_mcp_key_2026"
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        self._keys[default_token] = AIAgentKeyDTO(
            token=default_token,
            agent_name="Antigravity ИИ-Ассистент",
            project_id="default-project",
            allowed_terminals=["c56de979-35aa-4828-9056-3dbaab629e0d"],
            allowed_nodes=["klim"],
            role="container_developer",
            ai_mode="guard",
            created_at=now,
        )

    def generate_agent_key(
        self,
        project_id: str = "default-project",
        allowed_terminals: Optional[List[str]] = None,
        allowed_nodes: Optional[List[str]] = None,
        agent_name: str = "AI Assistant",
        role: str = "container_developer",
        ai_mode: str = "guard",
        ttl_hours: int = 72,
    ) -> Dict[str, Any]:
        """Generates a new scoped token and connection bundle for an AI Agent."""
        token = f"tt_ai_{secrets.token_hex(16)}"
        now = dt.datetime.now(dt.timezone.utc)
        expires_at = (now + dt.timedelta(hours=ttl_hours)).isoformat()

        term_list = allowed_terminals or ["*"]
        node_list = allowed_nodes or ["*"]

        key_dto = AIAgentKeyDTO(
            token=token,
            agent_name=agent_name,
            project_id=project_id,
            allowed_terminals=term_list,
            allowed_nodes=node_list,
            role=role,
            ai_mode=ai_mode,
            created_at=now.isoformat(),
            expires_at=expires_at,
            revoked=False,
        )
        self._keys[token] = key_dto

        # Create connection payload formatted as requested by user
        primary_term = term_list[0] if term_list and term_list[0] != "*" else "all"
        connection_json = {
            "url": "http://localhost:8290",
            "token": token,
            "allowed_terminal": primary_term,
            "project_id": project_id,
            "role": role,
            "ai_mode": ai_mode,
        }

        mcp_config = {
            "mcpServers": {
                "tterm": {
                    "command": "python3",
                    "args": ["-m", "mcp_server", "--token", token],
                    "env": {
                        "TTERM_URL": "http://localhost:8290",
                        "TTERM_AI_TOKEN": token,
                        "ALLOWED_TERMINAL": primary_term if primary_term != "all" else "",
                    },
                }
            }
        }

        log.info("Generated AI agent key %s for agent '%s' (terminals: %s)", token[:12], agent_name, term_list)
        return {
            "ok": True,
            "key": key_dto.to_dict(),
            "connection_json": connection_json,
            "mcp_config": mcp_config,
        }

    def register_or_ping(
        self,
        token: str,
        session_id: Optional[str] = None,
        agent_name: Optional[str] = None,
        terminal_id: Optional[str] = None,
        command: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Registers a live AI agent session or heartbeats an existing one."""
        key = self._keys.get(token)
        now_dt = dt.datetime.now(dt.timezone.utc)
        now = now_dt.isoformat()

        if not key or key.revoked:
            project_id = "default-project"
            allowed_terms = [terminal_id] if terminal_id else ["*"]
            role = "container_developer"
            ai_mode = "guard"
            name = agent_name or "Antigravity (ИИ)"
        else:
            project_id = key.project_id
            allowed_terms = key.allowed_terminals
            role = key.role
            ai_mode = key.ai_mode
            name = agent_name or key.agent_name

        # Find existing session for this assistant or use canonical ID to prevent duplication
        # Force canonical session ID for Antigravity MCP assistant
        norm_name = (agent_name or (key.agent_name if key else "Antigravity (ИИ)")).strip()
        if not session_id:
            target_sid = "sess-ai-antigravity" if ("antigravity" in norm_name.lower() or "антигравит" in norm_name.lower()) else f"sess-ai-{uuid.uuid4().hex[:8]}"
            name = "Антигравитационный ИИ (MCP)" if "antigravity" in norm_name.lower() else norm_name
        elif session_id.startswith("sess-ai-mcp"):
            target_sid = "sess-ai-antigravity"
            name = "Антигравитационный ИИ (MCP)"
        else:
            target_sid = session_id
            name = norm_name

        # Prune old duplicate sess-ai-mcp-* or legacy sessions
        for sid in list(self._sessions.keys()):
            s_item = self._sessions[sid]
            is_dup_ag = is_antigravity and ("antigravity" in s_item.agent_name.lower() or "антигравит" in s_item.agent_name.lower())
            if sid != target_sid and (sid.startswith("sess-ai-mcp") or sid == "sess-ai-antigravity-1" or is_dup_ag or s_item.agent_name == name):
                self._sessions.pop(sid, None)

        if target_sid in self._sessions:
            sess = self._sessions[target_sid]
            sess.last_active_at = now
            sess.status = "BLOCKED" if sess.blocked else "ONLINE"
            if terminal_id and terminal_id not in sess.allowed_terminals:
                if "*" not in sess.allowed_terminals:
                    sess.allowed_terminals.append(terminal_id)
            if command:
                sess.current_command = command[:80]
                sess.total_commands += 1
        else:
            sess = AIAgentSessionDTO(
                session_id=target_sid,
                token=token,
                agent_name=name,
                project_id=project_id,
                allowed_terminals=allowed_terms,
                allowed_nodes=key.allowed_nodes if key else ["*"],
                role=role,
                ai_mode=ai_mode,
                status="ONLINE",
                connected_at=now,
                last_active_at=now,
                current_command=command[:80] if command else None,
                total_commands=1 if command else 0,
                blocked=False,
            )
            self._sessions[target_sid] = sess
            log.info("Single AI Agent session connected: %s (@%s)", target_sid, name)

        return sess.to_dict()

    def list_sessions(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns connected AI agent sessions, strictly deduplicating by assistant name."""
        # Prune any stale mock or duplicate sessions
        for sid in list(self._sessions.keys()):
            if sid != "sess-ai-antigravity" and (sid.startswith("sess-ai-mcp") or sid == "sess-ai-antigravity-1"):
                self._sessions.pop(sid, None)

        results = []
        seen_names = set()
        # Sort by latest activity
        sorted_sessions = sorted(self._sessions.values(), key=lambda x: x.last_active_at, reverse=True)
        for s in sorted_sessions:
            norm = "antigravity" if ("antigravity" in s.agent_name.lower() or "антигравит" in s.agent_name.lower()) else s.agent_name.lower()
            if norm in seen_names:
                continue
            seen_names.add(norm)
            if project_id and s.project_id != project_id and s.project_id != "default-project":
                continue
            results.append(s.to_dict())
        return results

    def update_session_permissions(
        self,
        session_id: str,
        role: Optional[str] = None,
        ai_mode: Optional[str] = None,
        allowed_terminals: Optional[List[str]] = None,
        blocked: Optional[bool] = None,
    ) -> Optional[Dict[str, Any]]:
        """Dynamically updates permissions of an active AI Agent session."""
        sess = self._sessions.get(session_id)
        if not sess:
            return None

        if role:
            sess.role = role
        if ai_mode:
            sess.ai_mode = ai_mode
        if allowed_terminals is not None:
            sess.allowed_terminals = allowed_terminals
        if blocked is not None:
            sess.blocked = blocked
            sess.status = "BLOCKED" if blocked else "ONLINE"

        log.info("AI session %s permissions updated: mode=%s, blocked=%s", session_id, sess.ai_mode, sess.blocked)
        return sess.to_dict()

    def revoke_session(self, session_id: str) -> bool:
        """Kicks and disconnects an AI Agent session."""
        sess = self._sessions.pop(session_id, None)
        if sess:
            if sess.token in self._keys:
                self._keys[sess.token].revoked = True
            log.info("AI session %s revoked", session_id)
            return True
        return False

    def validate_action(
        self,
        token: str,
        session_id: Optional[str],
        terminal_id: str,
        command: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Validates if AI Agent is allowed to perform action on terminal.
        Returns (is_allowed, error_message).
        """
        # Look up session or key
        sess = self._sessions.get(session_id) if session_id else None
        key = self._keys.get(token)

        if sess and sess.blocked:
            return False, "Доступ ИИ-агента заблокирован администратором проекта"

        ai_mode = sess.ai_mode if sess else (key.ai_mode if key else "guard")
        allowed_terms = sess.allowed_terminals if sess else (key.allowed_terminals if key else ["*"])

        # Check terminal scoping
        if allowed_terms and "*" not in allowed_terms and terminal_id not in allowed_terms:
            return False, f"Доступ запрещен: ИИ-агент ограничен терминалом {allowed_terms[0]}"

        # Readonly mode check
        if command and ai_mode == "readonly":
            return False, "Режим 'Только чтение': ИИ-агенту запрещено выполнение команд"

        # Guard mode danger check
        if command and ai_mode == "guard":
            is_dangerous, risk, reason = inspect_command_danger(command)
            if is_dangerous:
                return False, f"Опасная команда [{risk}] требует подтверждения руководителя проекта: {reason}"

        return True, ""


ai_agent_manager = AIAgentSessionManager()

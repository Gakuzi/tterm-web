"""
FastAPI Router for Hierarchical Container Orchestration and RBAC Access Management.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from .models import (
    ActionEnum, ConnectionInfoDTO, ContainerCreateDTO,
    EntityTypeEnum, ProjectCreateDTO, ProjectDTO, RoleEnum
)
from .rbac import rbac, require_permission
from .worker import orchestrator

router = APIRouter(prefix="/api/orchestration", tags=["Orchestration & RBAC"])

# In-memory entity storage for API operations
_PROJECTS: Dict[uuid.UUID, Dict[str, Any]] = {}
_NODES: Dict[uuid.UUID, Dict[str, Any]] = {}
_CONTAINERS: Dict[uuid.UUID, Dict[str, Any]] = {}
_SERVICES: Dict[uuid.UUID, Dict[str, Any]] = {}


class GrantPermissionDTO(BaseModel):
    user_id: uuid.UUID
    role: RoleEnum
    entity_type: EntityTypeEnum
    entity_id: uuid.UUID
    action: ActionEnum = ActionEnum.ALL


class GitBindingDTO(BaseModel):
    git_repo_url: str = Field(..., pattern=r"^https?://.+")
    git_provider: str = Field("github", description="github, gitea, or gitlab")
    git_default_branch: str = "main"


class ServiceCreateDTO(BaseModel):
    container_id: uuid.UUID
    name: str = Field(..., min_length=2, max_length=128)
    internal_port: int = Field(..., ge=1, le=65535)
    host_port: int | None = Field(None, ge=1, le=65535)
    protocol: str = "http"
    config_json: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------- Projects
@router.post("/projects", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreateDTO, user_id: uuid.UUID = Query(default=uuid.UUID("00000000-0000-0000-0000-000000000001"))):
    """Creates a new Project workspace and grants the creator Project Admin rights."""
    proj_id = uuid.uuid4()
    record = {
        "id": proj_id,
        "name": data.name,
        "slug": data.slug,
        "owner_id": user_id,
        "git_repo_url": data.git_repo_url,
        "git_provider": data.git_provider,
        "documentation_markdown": data.documentation_markdown or "",
    }
    _PROJECTS[proj_id] = record
    
    # Automatically grant Project Admin to the creator
    rbac.grant(user_id, RoleEnum.PROJECT_ADMIN, EntityTypeEnum.PROJECT, proj_id, ActionEnum.ALL)
    
    return {"ok": True, "project": record}


@router.post("/projects/{project_id}/git")
async def bind_git_repository(
    project_id: uuid.UUID,
    data: GitBindingDTO,
    _auth=Depends(require_permission(EntityTypeEnum.PROJECT, ActionEnum.WRITE)),
):
    """Binds GitHub / Gitea repository to the project workspace."""
    if project_id not in _PROJECTS:
        raise HTTPException(status_code=404, detail="Project not found")
    
    proj = _PROJECTS[project_id]
    proj["git_repo_url"] = data.git_repo_url
    proj["git_provider"] = data.git_provider
    proj["git_default_branch"] = data.git_default_branch

    return {"ok": True, "project_id": str(project_id), "git": data.model_dump()}


# ---------------------------------------------------------------------- Git Sync & Terminal Branches
from .git_sync import git_sync_manager, ProjectGitConfigDTO


@router.get("/projects/{project_id}/git-config")
async def get_project_git_config(project_id: str):
    """Returns the Git repository binding and terminal branch settings for a project."""
    cfg = git_sync_manager.get_config(project_id)
    return {"ok": True, "config": cfg.model_dump()}


@router.post("/projects/{project_id}/git-config")
async def update_project_git_config(project_id: str, data: ProjectGitConfigDTO):
    """Binds a Git repository to the project and configures terminal branching."""
    saved = git_sync_manager.set_config(data)
    return {"ok": True, "config": saved.model_dump()}


@router.get("/terminals/{terminal_id}/git-branch")
async def get_terminal_git_branch(
    terminal_id: str,
    project_id: str = "default",
    label: str = "",
    user: str = "",
):
    """Gets or generates the unique Git branch for this terminal and its setup commands."""
    dto = git_sync_manager.get_or_create_terminal_branch(project_id, terminal_id, label, user)
    setup_script = git_sync_manager.build_branch_setup_script(dto.branch_name, dto.base_branch)
    return {
        "ok": True,
        "branch": dto.model_dump(),
        "setup_script": setup_script,
    }


class RecordCommitDTO(BaseModel):
    command: str
    author: str = "user"
    exit_code: int = 0


@router.post("/terminals/{terminal_id}/record-commit")
async def record_terminal_action_commit(terminal_id: str, data: RecordCommitDTO):
    """Records that a terminal action was committed to its dedicated git branch."""
    updated = git_sync_manager.record_commit(terminal_id, data.command)
    commit_cmd = git_sync_manager.build_action_commit_command(data.command, data.author, data.exit_code)
    return {
        "ok": True,
        "branch": updated.model_dump() if updated else None,
        "commit_cmd": commit_cmd,
    }


# ---------------------------------------------------------------------- Nodes
@router.post("/projects/{project_id}/nodes")
async def register_node(
    project_id: uuid.UUID,
    name: str = Query(...),
    ip_address: str = Query("192.168.0.6"),
    _auth=Depends(require_permission(EntityTypeEnum.PROJECT, ActionEnum.MANAGE)),
):
    """Registers a physical server or VPS node in the project."""
    if project_id not in _PROJECTS:
        raise HTTPException(status_code=404, detail="Project not found")

    node_id = uuid.uuid4()
    node_record = {
        "id": node_id,
        "project_id": project_id,
        "name": name,
        "ip_address": ip_address,
        "status": "online",
    }
    _NODES[node_id] = node_record
    rbac.register_relations(node_id=node_id, project_id=project_id)

    return {"ok": True, "node": node_record}


# ---------------------------------------------------------------------- Containers
@router.post("/containers", response_model=ConnectionInfoDTO, status_code=status.HTTP_201_CREATED)
async def create_isolated_container(
    spec: ContainerCreateDTO,
    user_id: uuid.UUID = Query(default=uuid.UUID("00000000-0000-0000-0000-000000000001")),
    _auth=Depends(require_permission(EntityTypeEnum.NODE, ActionEnum.WRITE, id_param_name="node_id")),
):
    """
    Provisions an isolated Docker container on the specified node.
    Enforces cgroups limits (CPU, RAM) and generates SSH keys for client connection.
    """
    node = _NODES.get(spec.node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Target node not found")

    project_id = node["project_id"]

    try:
        container_model, conn_info = orchestrator.provision_container(
            project_id=project_id,
            node_id=spec.node_id,
            spec=spec,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    _CONTAINERS[container_model.id] = {
        "model": container_model,
        "connection": conn_info,
        "node_id": spec.node_id,
        "project_id": project_id,
    }

    rbac.register_relations(
        node_id=spec.node_id,
        project_id=project_id,
        container_id=container_model.id,
    )

    # Assign Container Developer permission to the user for this container
    rbac.grant(user_id, RoleEnum.CONTAINER_DEVELOPER, EntityTypeEnum.CONTAINER, container_model.id, ActionEnum.ALL)

    return conn_info


@router.get("/containers/{container_id}/connection", response_model=ConnectionInfoDTO)
async def get_container_connection(
    container_id: uuid.UUID,
    _auth=Depends(require_permission(EntityTypeEnum.CONTAINER, ActionEnum.READ)),
):
    """
    Returns connection credentials, Termius one-click export,
    and OpenSSH ~/.ssh/config snippet for the container.
    """
    container_data = _CONTAINERS.get(container_id)
    if not container_data:
        raise HTTPException(status_code=404, detail="Container not found")

    return container_data["connection"]


# ---------------------------------------------------------------------- Services
@router.post("/services")
async def create_service(
    spec: ServiceCreateDTO,
    _auth=Depends(require_permission(EntityTypeEnum.CONTAINER, ActionEnum.WRITE, id_param_name="container_id")),
):
    """Creates a new service definition mapped to an internal container port."""
    if spec.container_id not in _CONTAINERS:
        raise HTTPException(status_code=404, detail="Target container not found")

    service_id = uuid.uuid4()
    srv = {
        "id": service_id,
        "container_id": spec.container_id,
        "name": spec.name,
        "internal_port": spec.internal_port,
        "host_port": spec.host_port or (spec.internal_port + 10000),
        "protocol": spec.protocol,
        "config_json": spec.config_json,
    }
    _SERVICES[service_id] = srv

    container_data = _CONTAINERS[spec.container_id]
    rbac.register_relations(
        node_id=container_data["node_id"],
        project_id=container_data["project_id"],
        container_id=spec.container_id,
        service_id=service_id,
    )

    return {"ok": True, "service": srv}


# ---------------------------------------------------------------------- Permissions Management
@router.post("/permissions/grant")
async def grant_permission(
    data: GrantPermissionDTO,
    _auth=Depends(require_permission(EntityTypeEnum.PROJECT, ActionEnum.MANAGE, id_param_name="entity_id")),
):
    """Grants a role and action permission to a user."""
    rbac.grant(
        user_id=data.user_id,
        role=data.role,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        action=data.action,
    )
    return {"ok": True, "granted": data.model_dump()}


# ---------------------------------------------------------------------- Auto-Discovery
class RenameEntityDTO(BaseModel):
    node_id: str
    entity_type: str                  # "container" or "service"
    entity_id: str
    custom_name: str


# ---------------------------------------------------------------------- Project Members & Scoped Permissions
class ProjectMemberDTO(BaseModel):
    id: str
    name: str
    email: str
    role: str = "container_developer"  # "project_admin", "node_admin", "container_developer", "service_operator"
    is_ai: bool = False
    terminals_allowed: List[str] = Field(default_factory=lambda: ["*"])
    containers_allowed: List[str] = Field(default_factory=lambda: ["*"])
    ai_mode: str = "guard"  # "execute", "guard", "readonly"

_DEFAULT_MEMBERS = [
    {
        "id": "owner-user",
        "name": "Евгений (Владелец)",
        "email": "eklimov84@gmail.com",
        "role": "project_admin",
        "is_ai": False,
        "terminals_allowed": ["*"],
        "containers_allowed": ["*"],
        "ai_mode": "execute",
    },
    {
        "id": "ai-antigravity",
        "name": "Antigravity (ИИ-Ассистент)",
        "email": "ai@antigravity.internal",
        "role": "container_developer",
        "is_ai": True,
        "terminals_allowed": ["*"],
        "containers_allowed": ["tterm-server-tterm-1"],
        "ai_mode": "guard",
    },
    {
        "id": "dlg-author",
        "name": "Денис Герасименко (Автор tTerm)",
        "email": "denis@tterm.net",
        "role": "node_admin",
        "is_ai": False,
        "terminals_allowed": ["*"],
        "containers_allowed": ["*"],
        "ai_mode": "execute",
    },
]
_PROJECT_MEMBERS_STORE: Dict[str, List[Dict[str, Any]]] = {}


@router.get("/projects/{project_id}/members")
async def list_project_members(project_id: str):
    """Returns members of the project workspace with their assigned roles and scopes."""
    members = _PROJECT_MEMBERS_STORE.get(project_id)
    if members is None:
        members = [dict(m) for m in _DEFAULT_MEMBERS]
        _PROJECT_MEMBERS_STORE[project_id] = members
    return {"ok": True, "members": members}


@router.post("/projects/{project_id}/members")
async def add_or_update_project_member(project_id: str, data: ProjectMemberDTO):
    """Adds a new member or updates an existing member in the project."""
    members = _PROJECT_MEMBERS_STORE.get(project_id)
    if members is None:
        members = [dict(m) for m in _DEFAULT_MEMBERS]
        _PROJECT_MEMBERS_STORE[project_id] = members

    found = False
    for i, m in enumerate(members):
        if m["id"] == data.id or m["email"] == data.email:
            members[i] = data.model_dump()
            found = True
            break
    if not found:
        members.append(data.model_dump())

    return {"ok": True, "member": data.model_dump()}


@router.delete("/projects/{project_id}/members/{user_id}")
async def remove_project_member(project_id: str, user_id: str):
    """Removes a member from the project workspace."""
    members = _PROJECT_MEMBERS_STORE.get(project_id)
    if members is None:
        members = [dict(m) for m in _DEFAULT_MEMBERS]
        _PROJECT_MEMBERS_STORE[project_id] = members
    _PROJECT_MEMBERS_STORE[project_id] = [m for m in members if m["id"] != user_id]
    return {"ok": True, "removed_id": user_id}


@router.patch("/projects/{project_id}/members/{user_id}")
async def update_member_permissions(project_id: str, user_id: str, payload: Dict[str, Any]):
    """Updates roles, terminals_allowed or containers_allowed for a member."""
    members = _PROJECT_MEMBERS_STORE.get(project_id)
    if members is None:
        members = [dict(m) for m in _DEFAULT_MEMBERS]
        _PROJECT_MEMBERS_STORE[project_id] = members

    updated = None
    for m in members:
        if m["id"] == user_id:
            if "role" in payload:
                m["role"] = payload["role"]
            if "terminals_allowed" in payload:
                m["terminals_allowed"] = payload["terminals_allowed"]
            if "containers_allowed" in payload:
                m["containers_allowed"] = payload["containers_allowed"]
            if "ai_mode" in payload:
                m["ai_mode"] = payload["ai_mode"]
            updated = m
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True, "member": updated}


# ---------------------------------------------------------------------- Node Auto-Discovery
class ScanRequestDTO(BaseModel):
    raw_output: str = ""


@router.post("/discovery/scan")
@router.post("/discovery/scan/{node_id}")
async def scan_node_discovery(node_id: str = "klim", data: ScanRequestDTO | None = None):
    """Scans or processes discovery probe output for a node."""
    from .discovery import discovery_scanner
    raw_output = data.raw_output if data else ""
    if raw_output:
        containers = discovery_scanner.parse_discovery_output(node_id, raw_output)
    else:
        containers = discovery_scanner.get_containers(node_id)
    return {"ok": True, "containers": [c.model_dump() for c in containers]}


@router.get("/discovery")
@router.get("/discovery/{node_id}")
async def get_node_discovery(node_id: str = "klim"):
    """Returns all discovered containers and services for a node."""
    from .discovery import discovery_scanner
    containers = discovery_scanner.get_containers(node_id)
    return {"ok": True, "containers": [c.model_dump() for c in containers]}


@router.patch("/discovery/rename")
async def rename_discovered_entity(data: RenameEntityDTO):
    """Sets a human-friendly alias for a discovered container or service."""
    from .discovery import discovery_scanner
    ok = discovery_scanner.rename_entity(data.node_id, data.entity_type, data.entity_id, data.custom_name)
    return {"ok": ok, "custom_name": data.custom_name}


# ---------------------------------------------------------------------- Drain Locks & Appeals
class CheckImpactDTO(BaseModel):
    entity_type: str                  # "node", "container", "service"
    entity_id: str
    entity_name: str
    action: str                       # "reboot", "restart", "delete", "upgrade"


class InitiateDrainDTO(BaseModel):
    initiator_id: str
    initiator_name: str
    entity_type: str
    entity_id: str
    entity_name: str
    action: str
    timeout_seconds: int = 180


class SubmitAppealDTO(BaseModel):
    lock_id: str
    user_id: str
    user_name: str
    terminal_id: str
    reason: str


class ResolveAppealDTO(BaseModel):
    appeal_id: str
    approved: bool
    extend_seconds: int = 120


@router.post("/locks/check")
async def check_disruptive_impact(data: CheckImpactDTO):
    """Checks if active processes are running under an entity before a disruptive action."""
    from .locks import lock_manager
    impact = lock_manager.check_disruptive_impact(
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        entity_name=data.entity_name,
        action=data.action,
    )
    return impact


@router.post("/locks/drain")
async def initiate_drain_lock(data: InitiateDrainDTO):
    """Initiates a graceful drain lock, blocking new subordinate command input."""
    from .locks import lock_manager
    lock = lock_manager.initiate_drain_lock(
        initiator_id=data.initiator_id,
        initiator_name=data.initiator_name,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        entity_name=data.entity_name,
        action=data.action,
        timeout_seconds=data.timeout_seconds,
    )
    return {"ok": True, "lock": lock.model_dump()}


@router.post("/locks/appeal")
async def submit_drain_appeal(data: SubmitAppealDTO):
    """Subordinates submit an appeal to extend or delay the disruptive action."""
    from .locks import lock_manager
    from .notifications import notification_hub

    appeal = lock_manager.submit_appeal(
        lock_id=data.lock_id,
        user_id=data.user_id,
        user_name=data.user_name,
        terminal_id=data.terminal_id,
        reason=data.reason,
    )
    # Notify admin
    lock = lock_manager._active_locks.get(data.lock_id)
    if lock:
        notification_hub.dispatch_notification(
            user_id=lock.initiator_id,
            notification_type="appeal",
            title=f"⚠️ Запрос отсрочки от {data.user_name}",
            body=f"Причина: {data.reason} (Терминал: {data.terminal_id})",
            entity_id=data.lock_id,
        )
    return {"ok": True, "appeal": appeal.model_dump()}


@router.post("/locks/resolve-appeal")
async def resolve_drain_appeal(data: ResolveAppealDTO):
    """Administrator approves or rejects a subordinate appeal."""
    from .locks import lock_manager
    ok = lock_manager.resolve_appeal(data.appeal_id, data.approved, data.extend_seconds)
    return {"ok": ok}


@router.post("/locks/cancel")
async def cancel_drain_lock(lock_id: str = Query(...)):
    """Cancels a drain lock."""
    from .locks import lock_manager
    ok = lock_manager.cancel_lock(lock_id)
    return {"ok": ok}


@router.get("/locks/status/{terminal_id}")
async def get_terminal_lock_status(terminal_id: str):
    """Returns active lock status for a terminal."""
    from .locks import lock_manager
    is_locked, lock = lock_manager.is_locked(terminal_id)
    return {
        "is_locked": is_locked,
        "lock": lock.model_dump() if lock else None,
    }


# ---------------------------------------------------------------------- Notifications & Bell
class ToggleBellDTO(BaseModel):
    terminal_id: str
    user_id: str


@router.post("/notifications/bell")
async def toggle_notification_bell(data: ToggleBellDTO):
    """Toggles notification bell on or off for a terminal's running command."""
    from .notifications import notification_hub
    active = notification_hub.toggle_command_bell(data.terminal_id, data.user_id)
    return {"ok": True, "bell_active": active}


@router.get("/notifications")
async def list_user_notifications(user_id: str = Query(...), unread_only: bool = False):
    """Lists notifications for a user."""
    from .notifications import notification_hub
    notifs = notification_hub.get_notifications(user_id, unread_only)
    return {"ok": True, "notifications": [n.model_dump() for n in notifs]}

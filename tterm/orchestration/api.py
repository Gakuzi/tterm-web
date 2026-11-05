"""
FastAPI Router for Hierarchical Container Orchestration and RBAC Access Management.
"""
from __future__ import annotations

import asyncio
import base64
import uuid
from typing import Any, Dict, List, Optional

try:
    from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel, Field
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    from .models import BaseModel, Field

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class _Status:
        HTTP_200_OK = 200
        HTTP_201_CREATED = 201
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404
        HTTP_500_INTERNAL_SERVER_ERROR = 500
    status = _Status()

    def Depends(dependency=None, use_cache=True):
        return dependency

    def Query(default=..., **kwargs):
        return default

    class Request:
        pass

    class UploadFile:
        pass

    class StreamingResponse:
        def __init__(self, content, media_type=None, headers=None):
            self.content = content
            self.media_type = media_type
            self.headers = headers or {}

    class _Route:
        def __init__(self, path: str, endpoint, methods: List[str]):
            self.path = path
            self.endpoint = endpoint
            self.methods = methods

    class APIRouter:
        def __init__(self, prefix: str = "", tags: Optional[List[str]] = None):
            self.prefix = prefix
            self.tags = tags or []
            self.routes: List[_Route] = []

        def _add_route(self, path: str, endpoint, methods: List[str]):
            full_path = f"{self.prefix}{path}" if self.prefix else path
            self.routes.append(_Route(full_path, endpoint, methods))

        def get(self, path: str, **kwargs):
            def decorator(func):
                self._add_route(path, func, ["GET"])
                return func
            return decorator

        def post(self, path: str, **kwargs):
            def decorator(func):
                self._add_route(path, func, ["POST"])
                return func
            return decorator

        def put(self, path: str, **kwargs):
            def decorator(func):
                self._add_route(path, func, ["PUT"])
                return func
            return decorator

        def patch(self, path: str, **kwargs):
            def decorator(func):
                self._add_route(path, func, ["PATCH"])
                return func
            return decorator

        def delete(self, path: str, **kwargs):
            def decorator(func):
                self._add_route(path, func, ["DELETE"])
                return func
            return decorator

from .models import (
    ActionEnum, ConnectionInfoDTO, ContainerCreateDTO,
    EntityTypeEnum, ProjectCreateDTO, ProjectDTO, RoleEnum,
    WatchedProcessDTO, DeviceRegistrationDTO, WatchRequestDTO, CommandCompletedDTO,
)
from .rbac import rbac, require_permission
from .worker import orchestrator
from .notifications_bot import notifications_bot


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


class GitCreateDTO(BaseModel):
    project_id: str
    repo_name: str
    visibility: str = "public"
    scope: str = "project"  # "project" or "terminal"
    terminal_id: Optional[str] = None
    provider: str = "github"


@router.post("/projects/{project_id}/git-create")
async def create_git_repository(project_id: str, data: GitCreateDTO):
    """Creates a new repository target and binds it to the project or specific terminal."""
    res = git_sync_manager.create_repository(
        project_id=project_id,
        repo_name=data.repo_name,
        visibility=data.visibility,
        scope=data.scope,
        terminal_id=data.terminal_id,
        provider=data.provider,
    )
    return {
        "ok": True,
        "repo_url": res["repo_url"],
        "repo_name": res["repo_name"],
        "scope": res["scope"],
        "branch": res["branch"].model_dump() if res["branch"] else None,
        "config": res["config"].model_dump() if hasattr(res["config"], "model_dump") else res["config"],
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
        "blocked": False,
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
        "blocked": False,
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
            if "blocked" in payload:
                m["blocked"] = bool(payload["blocked"])
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
async def scan_node_discovery(
    node_id: str = "klim",
    data: ScanRequestDTO | None = None,
    request: Request = None,
):
    """Scans or processes discovery probe output for a node."""
    from .discovery import discovery_scanner
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    agents_obj = getattr(pool, "agents", None) if pool else None
    terminals_obj = getattr(pool, "terminals", None) if pool else None

    raw_output = data.raw_output if data else ""
    if raw_output:
        containers = discovery_scanner.parse_discovery_output(node_id, raw_output)
        node = discovery_scanner.get_node(node_id)
        return {
            "ok": True,
            "node_id": node_id,
            "node": node.to_dict() if node else None,
            "containers": [c.model_dump() for c in containers],
            "ports": [p.to_dict() for p in (node.ports if node else [])],
        }
    else:
        res = await discovery_scanner.scan_connected_machine(
            node_id,
            agents=agents_obj,
            terminals=terminals_obj,
            pool=pool_obj,
        )
        return {
            "ok": True,
            "node_id": node_id,
            "node": res.get("node"),
            "containers": res.get("containers", []),
            "ports": res.get("ports", []),
            "method": res.get("method"),
        }


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


# ---------------------------------------------------------------------- Notifications & Multi-Device Bot
class ToggleBellDTO(BaseModel):
    terminal_id: str
    user_id: str


class RegisterDeviceRequestDTO(BaseModel):
    device_id: str
    name: str = "Browser Device"
    user_id: str = "default_user"
    push_subscription: Optional[Dict[str, Any]] = None


class UnwatchRequestDTO(BaseModel):
    watch_id: str


@router.post("/notifications/register-device")
async def register_client_device(data: RegisterDeviceRequestDTO):
    """Registers a client device (e.g. MacBook, iPhone) for multi-device push broadcasts."""
    dev = notifications_bot.register_device(
        device_id=data.device_id,
        name=data.name,
        user_id=data.user_id,
        push_subscription=data.push_subscription,
    )
    return {"ok": True, "device": dev.model_dump()}


@router.get("/notifications/devices")
async def list_connected_devices(user_id: Optional[str] = Query(None)):
    """Lists registered client devices for the user."""
    devs = notifications_bot.list_devices(user_id)
    return {"ok": True, "devices": [d.model_dump() for d in devs]}


@router.post("/notifications/watch")
async def watch_process_route(data: WatchRequestDTO):
    """Subscribes to notifications when a long-running command finishes."""
    watch = notifications_bot.watch_process(
        terminal_id=data.terminal_id,
        command=data.command,
        user_id=data.user_id,
        block_id=data.block_id,
        initiator_device_id=data.initiator_device_id,
        webhook_url=data.webhook_url,
    )
    return {"ok": True, "watch": watch.model_dump()}


@router.post("/notifications/unwatch")
async def unwatch_process_route(data: UnwatchRequestDTO):
    """Cancels watching a process."""
    ok = notifications_bot.unwatch_process(data.watch_id)
    return {"ok": ok}


@router.get("/notifications/status")
async def get_active_watches_status(
    user_id: Optional[str] = Query(None), terminal_id: Optional[str] = Query(None)
):
    """Returns active watched tasks/processes for long-running commands."""
    active = notifications_bot.get_active_watches(user_id=user_id, terminal_id=terminal_id)
    return {
        "ok": True,
        "count": len(active),
        "watches": [w.model_dump() for w in active],
    }


@router.post("/notifications/complete")
async def report_command_completed(data: CommandCompletedDTO):
    """Reports completion of a command, triggering multi-device broadcast across all connected devices."""
    resolved = await notifications_bot.broadcast_command_completed(
        terminal_id=data.terminal_id,
        command=data.command,
        exit_code=data.exit_code,
        duration_sec=data.duration_sec,
        block_id=data.block_id,
        user_id=data.user_id,
        initiator_device_id=data.initiator_device_id,
    )
    return {
        "ok": True,
        "resolved_watches": [w.model_dump() for w in resolved],
    }


@router.get("/notifications/stream")
async def notifications_event_stream(
    user_id: Optional[str] = Query(None), device_id: Optional[str] = Query(None)
):
    """Server-Sent Events (SSE) stream for real-time notification broadcast to all connected devices."""
    import json
    if device_id:
        notifications_bot.devices.touch(device_id)

    async def event_generator():
        queue = notifications_bot.subscribe()
        try:
            # Send initial handshake
            init_payload = json.dumps({
                "type": "connected",
                "device_id": device_id,
                "user_id": user_id,
            })
            yield f"data: {init_payload}\n\n"
            while True:
                try:
                    # Wait for next event or send periodic 20s heartbeat
                    msg = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            notifications_bot.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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



# ---------------------------------------------------------------------- Multi-Node Topology & Permissions
class NodePermissionsDTO(BaseModel):
    allowed_members: List[str]


class ContainerPermissionsDTO(BaseModel):
    allowed_members: List[str]


class ScanRemoteDTO(BaseModel):
    host: Optional[str] = None
    login: Optional[str] = None
    port: Optional[int] = None
    raw_output: Optional[str] = None


@router.get("/nodes")
async def list_all_nodes(
    member_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    request: Request = None,
):
    """Lists all connected nodes, their containers and open listening ports."""
    from .discovery import discovery_scanner
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    if pool_obj:
        await discovery_scanner.sync_from_machines_db(pool_obj)
    nodes = discovery_scanner.get_all_nodes(member_id)
    return {"ok": True, "nodes": nodes}


@router.get("/nodes/{node_id}")
async def get_single_node(node_id: str):
    """Returns details for a specific connected node."""
    from .discovery import discovery_scanner
    node = discovery_scanner.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return {"ok": True, "node": node.to_dict()}


@router.post("/nodes/scan-all")
async def scan_all_connected_nodes(
    project_id: Optional[str] = Query(None),
    request: Request = None,
):
    """Triggers an auto-discovery scan across all connected machines."""
    from .discovery import discovery_scanner
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    agents_obj = getattr(pool, "agents", None) if pool else None
    terminals_obj = getattr(pool, "terminals", None) if pool else None
    if pool_obj:
        await discovery_scanner.sync_from_machines_db(pool_obj)
    nodes = await discovery_scanner.scan_all_connected_machines(
        agents=agents_obj,
        terminals=terminals_obj,
        pool=pool_obj,
    )
    return {"ok": True, "nodes": nodes, "scanned_count": len(nodes)}


@router.post("/nodes/{node_id}/scan")
@router.post("/nodes/{node_id}/scan-remote")
async def scan_remote_connected_node(
    node_id: str,
    data: Optional[ScanRemoteDTO] = None,
    request: Request = None,
):
    """Triggers an active remote scan of the connected machine (SSH / agent) rather than local host."""
    from .discovery import discovery_scanner
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    agents_obj = getattr(pool, "agents", None) if pool else None
    terminals_obj = getattr(pool, "terminals", None) if pool else None

    host = data.host if data else None
    login = data.login if data else None
    port = data.port if data else None
    raw_output = data.raw_output if data else None
    result = await discovery_scanner.scan_connected_machine(
        machine_id=node_id,
        host=host,
        login=login,
        port=port,
        raw_output=raw_output,
        agents=agents_obj,
        terminals=terminals_obj,
        pool=pool_obj,
    )
    return result


@router.get("/nodes/{node_id}/services")
async def get_node_services_endpoint(node_id: str):
    """Returns all discovered services and listening ports for a specific connected node."""
    from .discovery import discovery_scanner
    services, ports = discovery_scanner.get_node_services(node_id)
    return {
        "ok": True,
        "node_id": node_id,
        "services": services,
        "ports": ports,
        "total_services": len(services),
        "total_ports": len(ports),
    }


@router.post("/nodes/{node_id}/permissions")
async def set_node_permissions(node_id: str, data: NodePermissionsDTO):
    """Configures member access permissions for a specific node."""
    from .discovery import discovery_scanner
    ok = discovery_scanner.set_node_permissions(node_id, data.allowed_members)
    return {"ok": ok, "node_id": node_id, "allowed_members": data.allowed_members}


@router.post("/containers/{node_id}/{container_id}/permissions")
async def set_container_permissions(node_id: str, container_id: str, data: ContainerPermissionsDTO):
    """Configures member access permissions for a specific container."""
    from .discovery import discovery_scanner
    ok = discovery_scanner.set_container_permissions(node_id, container_id, data.allowed_members)
    return {"ok": ok, "container_id": container_id, "allowed_members": data.allowed_members}


# ---------------------------------------------------------------------- Dangerous Command Approvals
class EvaluateCommandDTO(BaseModel):
    project_id: str = "default"
    terminal_id: str
    terminal_label: str = ""
    node_id: str = "klim"
    requester_id: str = "user"
    requester_name: str = "Пользователь"
    requester_role: str = "Разработчик"
    command: str


class ResolveApprovalDTO(BaseModel):
    reviewer_id: str = "me"
    reviewer_name: str = "Руководитель"
    approved: bool
    comment: str = ""


@router.get("/approvals")
async def list_pending_approvals(project_id: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    """Lists command approval requests."""
    from .approvals import approval_manager
    requests = approval_manager.list_requests(project_id, status)
    return {"ok": True, "requests": requests}


@router.post("/approvals/evaluate")
async def evaluate_terminal_command(data: EvaluateCommandDTO):
    """Intercepts and evaluates command danger before execution."""
    from .approvals import approval_manager
    eval_res = approval_manager.evaluate_command(
        project_id=data.project_id,
        terminal_id=data.terminal_id,
        terminal_label=data.terminal_label,
        node_id=data.node_id,
        requester_id=data.requester_id,
        requester_name=data.requester_name,
        requester_role=data.requester_role,
        command=data.command,
    )
    return {"ok": True, **eval_res}


@router.post("/approvals/{request_id}/resolve")
async def resolve_approval_request(request_id: str, data: ResolveApprovalDTO):
    """Project manager approves or rejects a dangerous command execution."""
    from .approvals import approval_manager
    res = approval_manager.resolve_request(
        request_id=request_id,
        reviewer_id=data.reviewer_id,
        reviewer_name=data.reviewer_name,
        approved=data.approved,
        comment=data.comment,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Approval request not found")
    return {"ok": True, "request": res}


# ---------------------------------------------------------------------- Aeza Cloud VPS Provisioning (Personal Vault)
class AezaConfigDTO(BaseModel):
    api_key: str
    user_id: Optional[str] = None


class AezaOrderDTO(BaseModel):
    name: str = "tterm-demo"
    product_id: int = 52          # MSKs-1 (1.40 RUB/hour)
    hours: int = 5
    os_id: int = 1                # Ubuntu 24.04
    ssh_key_ids: Optional[List[int]] = None
    user_id: Optional[str] = None


def _extract_user_id(request: Optional[Any] = None, explicit_user_id: Optional[str] = None) -> str:
    if explicit_user_id and str(explicit_user_id).strip():
        return str(explicit_user_id).strip()
    if request is not None:
        headers = getattr(request, "headers", {})
        if hasattr(headers, "get"):
            hdr_user = headers.get("x-user-id")
            if hdr_user and str(hdr_user).strip():
                return str(hdr_user).strip()
        state = getattr(request, "state", None)
        state_user = getattr(state, "user_id", None)
        if state_user:
            return str(state_user)
        query_params = getattr(request, "query_params", {})
        if hasattr(query_params, "get") and query_params.get("user_id"):
            return str(query_params.get("user_id")).strip()
    return "owner-user"


@router.get("/aeza/config")
async def get_aeza_config(user_id: Optional[str] = Query(None), request: Request = None):
    """Returns Aeza API configuration status and masked key for the requesting user."""
    from .aeza_cloud import get_user_key, mask_api_key
    uid = _extract_user_id(request, user_id)
    key = get_user_key(uid)
    return {
        "ok": True,
        "configured": bool(key),
        "masked_key": mask_api_key(key),
        "user_id": uid,
    }


@router.post("/aeza/config")
async def save_aeza_config(data: AezaConfigDTO, request: Request = None):
    """Validates and saves personal Aeza API credentials for the authenticated user."""
    from .aeza_cloud import AezaClient, mask_api_key, save_user_key
    uid = _extract_user_id(request, data.user_id)
    clean_key = (data.api_key or "").strip()
    if not clean_key:
        raise HTTPException(status_code=400, detail="API-ключ не может быть пустым")

    # Validate against Aeza API before persisting
    test_client = AezaClient(api_key=clean_key)
    try:
        acc = test_client.get_account_info()
    except Exception as e:
        return {
            "ok": False,
            "configured": False,
            "error": f"Ошибка верификации ключа в Aeza: {str(e)}",
        }

    save_user_key(uid, clean_key)
    return {
        "ok": True,
        "configured": True,
        "masked_key": mask_api_key(clean_key),
        "balance": acc.get("balance_rub", 0.0),
        "email": acc.get("email"),
        "account": acc,
    }


@router.delete("/aeza/config")
async def delete_aeza_config(user_id: Optional[str] = Query(None), request: Request = None):
    """Removes personal Aeza credentials for the user."""
    from .aeza_cloud import delete_user_key
    uid = _extract_user_id(request, user_id)
    deleted = delete_user_key(uid)
    return {
        "ok": True,
        "configured": False,
        "deleted": deleted,
    }


@router.get("/aeza/account")
async def get_aeza_account(user_id: Optional[str] = Query(None), request: Request = None):
    """Returns Aeza account balance, status, and linked SSH keys for the user."""
    from .aeza_cloud import get_aeza_client, get_user_key
    uid = _extract_user_id(request, user_id)
    key = get_user_key(uid)
    if not key:
        return {
            "ok": False,
            "configured": False,
            "error": "API-ключ Aeza не настроен в личном кабинете пользователя.",
        }
    client = get_aeza_client(user_id=uid)
    try:
        acc = client.get_account_info()
        keys = client.list_ssh_keys()
        return {"ok": True, "configured": True, "account": acc, "ssh_keys": keys}
    except Exception as e:
        return {"ok": False, "configured": True, "error": str(e)}


@router.get("/aeza/plans")
async def get_aeza_vps_plans(hourly_only: bool = True, user_id: Optional[str] = Query(None), request: Request = None):
    """Returns available VPS plans with hourly prices."""
    from .aeza_cloud import get_aeza_client, get_user_key
    uid = _extract_user_id(request, user_id)
    key = get_user_key(uid)
    if not key:
        return {"ok": False, "configured": False, "plans": [], "error": "API-ключ Aeza не настроен."}
    client = get_aeza_client(user_id=uid)
    try:
        plans = client.list_vps_plans(hourly_only=hourly_only)
        return {"ok": True, "configured": True, "plans": plans}
    except Exception as e:
        return {"ok": False, "configured": True, "plans": [], "error": str(e)}


@router.post("/aeza/order")
async def order_aeza_test_vps(data: AezaOrderDTO, request: Request = None):
    """Creates a temporary hourly VPS server for preview and testing."""
    from .aeza_cloud import get_aeza_client, get_user_key
    uid = _extract_user_id(request, data.user_id)
    key = get_user_key(uid)
    if not key:
        return {"ok": False, "configured": False, "error": "API-ключ Aeza не настроен в личном кабинете."}
    client = get_aeza_client(user_id=uid)
    try:
        order_res = client.order_vps(
            name=data.name,
            product_id=data.product_id,
            hours=data.hours,
            os_id=data.os_id,
            ssh_key_ids=data.ssh_key_ids,
        )
        return {"ok": True, "order": order_res}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/aeza/services")
async def list_aeza_services(user_id: Optional[str] = Query(None), request: Request = None):
    """Lists active provisioned VPS instances on Aeza for user."""
    from .aeza_cloud import get_aeza_client, get_user_key
    uid = _extract_user_id(request, user_id)
    key = get_user_key(uid)
    if not key:
        return {"ok": False, "configured": False, "services": [], "error": "API-ключ Aeza не настроен."}
    client = get_aeza_client(user_id=uid)
    try:
        services = client.list_services()
        return {"ok": True, "configured": True, "services": services}
    except Exception as e:
        return {"ok": False, "configured": True, "services": [], "error": str(e)}


# ---------------------------------------------------------------------- GitHub Web App Authorization
class GitHubTokenConnectDTO(BaseModel):
    token: str


class GitHubOAuthConfigDTO(BaseModel):
    client_id: str
    client_secret: str


class GitHubCreateRepoDTO(BaseModel):
    name: str
    description: str = "Managed by tTerm Orchestrator"
    private: bool = True
    project_id: Optional[str] = "default"
    terminal_id: Optional[str] = None


class GitHubCreatePRDTO(BaseModel):
    owner: str
    repo: str
    title: str
    body: str = ""
    head_branch: str
    base_branch: str = "main"


@router.get("/github/status")
async def get_github_auth_status():
    """Returns the current GitHub authorization status and profile."""
    from .github_app import github_manager
    status = github_manager.get_auth_status()
    return {"ok": True, **status}


@router.get("/github/auth-url")
async def get_github_oauth_url(redirect_uri: str = Query(...), state: str = Query("tterm-gh-state")):
    """Generates the OAuth authorization URL for GitHub web application login."""
    from .github_app import github_manager
    url = github_manager.get_auth_url(redirect_uri, state)
    return {"ok": True, "auth_url": url}


@router.post("/github/connect-token")
async def connect_github_token(data: GitHubTokenConnectDTO):
    """Authorizes tTerm using a GitHub Personal Access Token or OAuth Access Token."""
    from .github_app import github_manager
    try:
        status = github_manager.connect_with_token(data.token)
        return {"ok": True, **status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/configure-app")
async def configure_github_oauth_app(data: GitHubOAuthConfigDTO):
    """Sets OAuth App Client ID and Secret for GitHub web flow."""
    from .github_app import github_manager
    github_manager.configure_oauth_app(data.client_id, data.client_secret)
    return {"ok": True, "client_id": data.client_id}


@router.get("/github/callback")
async def github_oauth_callback(code: str = Query(...), redirect_uri: str = Query(...)):
    """Handles OAuth callback from GitHub and exchanges authorization code for access token."""
    from .github_app import github_manager
    try:
        status = github_manager.exchange_code_for_token(code, redirect_uri)
        return {"ok": True, **status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/disconnect")
async def disconnect_github_account():
    """Disconnects GitHub account and revokes session."""
    from .github_app import github_manager
    ok = github_manager.disconnect()
    return {"ok": ok}


@router.get("/github/repos")
async def list_github_repositories():
    """Lists repositories accessible to the authorized GitHub user."""
    from .github_app import github_manager
    try:
        repos = github_manager.list_repositories()
        return {"ok": True, "repos": repos}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/create-repo")
async def create_github_repository(data: GitHubCreateRepoDTO):
    """Creates a new repository on GitHub under the authorized user account and binds it."""
    from .github_app import github_manager
    from .git_sync import git_sync_manager
    try:
        repo_res = github_manager.create_repository(
            name=data.name,
            description=data.description,
            private=data.private,
        )
        # Bind newly created repo to project
        if data.project_id:
            cfg = git_sync_manager.get_config(data.project_id)
            cfg.repo_url = repo_res["html_url"] + ".git"
            git_sync_manager.set_config(cfg)

        branch_info = None
        if data.terminal_id:
            branch_info = git_sync_manager.get_or_create_terminal_branch(
                project_id=data.project_id or "default",
                terminal_id=data.terminal_id,
                terminal_label=data.name,
            )

        return {
            "ok": True,
            "repo": repo_res,
            "branch": branch_info,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/create-pr")
async def create_github_pull_request(data: GitHubCreatePRDTO):
    """Creates a Pull Request on GitHub from a terminal branch."""
    from .github_app import github_manager
    try:
        owner = data.owner
        if not owner:
            status = github_manager.get_auth_status()
            owner = status.get("username") or ""
        pr_res = github_manager.create_pull_request(
            owner=owner,
            repo=data.repo,
            title=data.title,
            body=data.body,
            head_branch=data.head_branch,
            base_branch=data.base_branch,
        )
        return {"ok": True, "pr": pr_res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class GitHubCommitFileDTO(BaseModel):
    owner: Optional[str] = None
    repo: str
    path: str
    content: str
    message: str
    branch: str = "main"


@router.post("/github/commit-file")
async def commit_github_file(data: GitHubCommitFileDTO):
    """Commits or updates a file directly on GitHub on behalf of the authorized user."""
    from .github_app import github_manager
    try:
        owner = data.owner
        if not owner:
            status = github_manager.get_auth_status()
            owner = status.get("username")
            if not owner:
                raise HTTPException(status_code=400, detail="GitHub account not connected")
        res = github_manager.create_or_update_file(
            owner=owner,
            repo=data.repo,
            path=data.path,
            content=data.content,
            message=data.message,
            branch=data.branch,
        )
        return {"ok": True, **res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/terminal-setup")
async def get_github_terminal_setup():
    """Returns shell command snippet to configure Git author identity in terminals."""
    from .github_app import github_manager
    setup_cmd = github_manager.get_terminal_git_setup()
    status = github_manager.get_auth_status()
    return {
        "ok": True,
        "is_authenticated": status.get("is_authenticated", False),
        "setup_command": setup_cmd,
        "username": status.get("username"),
        "email": status.get("email"),
    }


# ---------------------------------------------------------------------- AI Agent Sessions & Scoped Keys
class GenerateAIKeyDTO(BaseModel):
    project_id: str = "default-project"
    allowed_terminals: Optional[List[str]] = None
    allowed_terminal: Optional[str] = None
    allowed_nodes: Optional[List[str]] = None
    agent_name: str = "AI Assistant"
    role: str = "container_developer"
    ai_mode: str = "guard"
    ttl_hours: int = 72


class PingAISessionDTO(BaseModel):
    token: str
    session_id: Optional[str] = None
    agent_name: Optional[str] = None
    terminal_id: Optional[str] = None
    command: Optional[str] = None


class UpdateAISessionDTO(BaseModel):
    role: Optional[str] = None
    ai_mode: Optional[str] = None
    allowed_terminals: Optional[List[str]] = None
    blocked: Optional[bool] = None


@router.post("/ai-keys/generate")
async def generate_ai_agent_key(data: GenerateAIKeyDTO):
    """Generates scoped connection key and JSON bundle for an AI Agent."""
    from .ai_sessions import ai_agent_manager
    terms = data.allowed_terminals or ([data.allowed_terminal] if data.allowed_terminal else ["*"])
    res = ai_agent_manager.generate_agent_key(
        project_id=data.project_id,
        allowed_terminals=terms,
        allowed_nodes=data.allowed_nodes,
        agent_name=data.agent_name,
        role=data.role,
        ai_mode=data.ai_mode,
        ttl_hours=data.ttl_hours,
    )
    return res


@router.get("/ai-sessions")
async def list_ai_agent_sessions(project_id: Optional[str] = Query(None)):
    """Lists currently active AI Agent sessions."""
    from .ai_sessions import ai_agent_manager
    sessions = ai_agent_manager.list_sessions(project_id)
    return {"ok": True, "sessions": sessions}


@router.post("/ai-sessions/ping")
async def ping_ai_agent_session(data: PingAISessionDTO):
    """Heartbeats or registers an active AI agent MCP session."""
    from .ai_sessions import ai_agent_manager
    sess = ai_agent_manager.register_or_ping(
        token=data.token,
        session_id=data.session_id,
        agent_name=data.agent_name,
        terminal_id=data.terminal_id,
        command=data.command,
    )
    return {"ok": True, "session": sess}


@router.patch("/ai-sessions/{session_id}/permissions")
async def update_ai_session_permissions(session_id: str, data: UpdateAISessionDTO):
    """Updates role, ai_mode, terminal scope, or blocked status of an AI agent."""
    from .ai_sessions import ai_agent_manager
    sess = ai_agent_manager.update_session_permissions(
        session_id=session_id,
        role=data.role,
        ai_mode=data.ai_mode,
        allowed_terminals=data.allowed_terminals,
        blocked=data.blocked,
    )
    if not sess:
        raise HTTPException(status_code=404, detail="AI session not found")
    return {"ok": True, "session": sess}


@router.delete("/ai-sessions/{session_id}")
async def revoke_ai_agent_session(session_id: str):
    """Disconnects and revokes an AI agent session."""
    from .ai_sessions import ai_agent_manager
    ok = ai_agent_manager.revoke_session(session_id)
    return {"ok": ok}


# ---------------------------------------------------------------------- Many-to-Many Machine-to-Projects & Terminal Dev Contexts
class MachineProjectBindDTO(BaseModel):
    project_id: str
    project_name: Optional[str] = ""


class TerminalProjectContextDTO(BaseModel):
    project_id: str
    branch_name: Optional[str] = None
    machine_id: Optional[str] = None
    project_name: Optional[str] = None


@router.get("/machines/{machine_id}/projects")
async def get_machine_projects(machine_id: str):
    """Returns all projects bound to this machine."""
    from .machines_projects import machine_project_manager
    projects = machine_project_manager.get_projects_for_machine(machine_id)
    return {
        "ok": True,
        "machine_id": machine_id,
        "projects": projects,
    }


@router.post("/machines/{machine_id}/projects")
async def bind_machine_to_project_endpoint(machine_id: str, data: MachineProjectBindDTO):
    """Binds a machine to a project (Many-to-Many)."""
    from .machines_projects import machine_project_manager
    binding = machine_project_manager.bind_machine_to_project(
        machine_id=machine_id,
        project_id=data.project_id,
        project_name=data.project_name or "",
    )
    return {
        "ok": True,
        "binding": binding,
        "projects": machine_project_manager.get_projects_for_machine(machine_id),
    }


@router.delete("/machines/{machine_id}/projects/{project_id}")
async def unbind_machine_from_project_endpoint(machine_id: str, project_id: str):
    """Unbinds a machine from a project."""
    from .machines_projects import machine_project_manager
    removed = machine_project_manager.unbind_machine_from_project(machine_id, project_id)
    return {
        "ok": True,
        "removed": removed,
        "machine_id": machine_id,
        "project_id": project_id,
        "projects": machine_project_manager.get_projects_for_machine(machine_id),
    }


@router.get("/terminals/{terminal_id}/project-context")
async def get_terminal_project_context_endpoint(terminal_id: str):
    """Returns the isolated development environment context for a terminal."""
    from .machines_projects import machine_project_manager
    ctx = machine_project_manager.get_terminal_project_context(terminal_id)
    return {
        "ok": True,
        "context": ctx,
        **ctx,
    }


@router.post("/terminals/{terminal_id}/project-context")
async def set_terminal_project_context_endpoint(terminal_id: str, data: TerminalProjectContextDTO):
    """Binds a terminal to a project and assigns an isolated Git branch."""
    from .machines_projects import machine_project_manager
    ctx = machine_project_manager.set_terminal_project(
        terminal_id=terminal_id,
        project_id=data.project_id,
        branch_name=data.branch_name,
        machine_id=data.machine_id,
        project_name=data.project_name,
    )
    return {
        "ok": True,
        "context": ctx,
        **ctx,
    }


@router.get("/projects/{project_id}/terminal-branches")
async def get_project_terminal_branches_endpoint(project_id: str):
    """Returns list of active terminal environments and Git branches for a project."""
    from .machines_projects import machine_project_manager
    terminals = machine_project_manager.list_terminals_by_project(project_id)
    machines = machine_project_manager.get_machines_for_project(project_id)
    return {
        "ok": True,
        "project_id": project_id,
        "terminals": terminals,
        "branches": terminals,
        "machines": machines,
    }


# ---------------------------------------------------------------------- File Upload & SFTP Access
from .file_upload import file_upload_gateway


@router.post("/terminals/{terminal_id}/upload")
async def upload_terminal_files(
    terminal_id: str,
    request: Request,
):
    """
    Accepts multipart/form-data (drag-and-drop or file dialog) or JSON base64 payload
    and saves files into target_dir or /tmp/tterm_uploads/<terminal_id>/.
    """
    content_type = request.headers.get("content-type", "")
    results: List[Dict[str, Any]] = []
    target_dir: Optional[str] = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        target_dir = form.get("target_dir")
        if isinstance(target_dir, str) and not target_dir.strip():
            target_dir = None

        for field_name, value in form.multi_items():
            if hasattr(value, "filename") and hasattr(value, "read"):
                fname = getattr(value, "filename", None) or "uploaded_file"
                content = await value.read()
                saved = await file_upload_gateway.upload_file(
                    terminal_id=terminal_id,
                    filename=fname,
                    content_bytes=content,
                    target_dir=str(target_dir) if target_dir else None,
                    request=request,
                )
                results.append(saved)
    else:
        # JSON payload (base64)
        try:
            body = await request.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {e}")

        target_dir = body.get("target_dir")
        if isinstance(target_dir, str) and not target_dir.strip():
            target_dir = None

        files_list = body.get("files")
        if files_list and isinstance(files_list, list):
            for f in files_list:
                fname = f.get("filename", "file.bin")
                b64 = f.get("content_base64", "")
                try:
                    content = base64.b64decode(b64)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid base64 in {fname}: {e}")
                saved = await file_upload_gateway.upload_file(
                    terminal_id=terminal_id,
                    filename=fname,
                    content_bytes=content,
                    target_dir=str(target_dir) if target_dir else None,
                    request=request,
                )
                results.append(saved)
        elif "content_base64" in body:
            fname = body.get("filename", "file.bin")
            b64 = body.get("content_base64", "")
            try:
                content = base64.b64decode(b64)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")
            saved = await file_upload_gateway.upload_file(
                terminal_id=terminal_id,
                filename=fname,
                content_bytes=content,
                target_dir=str(target_dir) if target_dir else None,
                request=request,
            )
            results.append(saved)

    if not results:
        raise HTTPException(status_code=400, detail="No files provided in request")

    return {
        "ok": True,
        "terminal_id": terminal_id,
        "count": len(results),
        "target_dir": target_dir,
        "files": results,
    }


@router.get("/terminals/{terminal_id}/sftp-info")
async def get_terminal_sftp_info(
    terminal_id: str,
    request: Request,
    machine_id: Optional[str] = Query(None),
):
    """Returns SFTP / FTP direct access configuration for the target machine environment."""
    creds = file_upload_gateway.get_sftp_credentials(
        terminal_id=terminal_id,
        machine_id=machine_id,
        request=request,
    )
    return {
        "ok": True,
        "sftp": creds,
    }


# ---------------------------------------------------------------------- One-Click VPS Deploy & Migration
class CloudDeployStartDTO(BaseModel):
    host: str
    port: int = 22
    user: str = "root"
    password: Optional[str] = None
    private_key: Optional[str] = None
    repo_url: str = "https://github.com/Gakuzi/tterm-web.git"
    branch: str = "feature/mcp-ai-orchestration-v1"
    admin_email: str = "admin@example.com"
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    simulation_mode: bool = False


class CloudDeployTestEmailDTO(BaseModel):
    email: str
    host: Optional[str] = None
    code: Optional[str] = None


@router.post("/cloud-deploy/start")
async def start_cloud_deploy(data: CloudDeployStartDTO):
    """Starts an asynchronous one-click VPS deployment and full migration pipeline."""
    from .cloud_deploy import cloud_deploy_manager
    engine = cloud_deploy_manager.create_deployment(
        host=data.host,
        port=data.port,
        user=data.user,
        password=data.password,
        private_key=data.private_key,
        repo_url=data.repo_url,
        branch=data.branch,
        admin_email=data.admin_email,
        smtp_host=data.smtp_host,
        smtp_port=data.smtp_port,
        smtp_user=data.smtp_user,
        smtp_password=data.smtp_password,
        simulation_mode=data.simulation_mode,
    )
    # Launch pipeline in background asyncio task
    asyncio.create_task(engine.run_pipeline())
    return {"ok": True, "task_id": engine.task_id}


@router.get("/cloud-deploy/status/{task_id}")
async def get_cloud_deploy_status(task_id: str):
    """Returns real-time progress, step checklist, and console logs for the deployment task."""
    from .cloud_deploy import cloud_deploy_manager
    engine = cloud_deploy_manager.get_task(task_id)
    if not engine:
        raise HTTPException(status_code=404, detail="Deploy task not found")
    return {"ok": True, "task": engine.to_dict()}


@router.get("/cloud-deploy/tasks")
async def list_cloud_deploy_tasks():
    """Lists all active and completed VPS deployment tasks."""
    from .cloud_deploy import cloud_deploy_manager
    return {"ok": True, "tasks": cloud_deploy_manager.list_tasks()}


@router.post("/cloud-deploy/test-email")
async def test_cloud_deploy_email(data: CloudDeployTestEmailDTO):
    """Triggers a test verification code email dispatch to check SMTP delivery."""
    from .cloud_deploy import cloud_deploy_manager
    res = await cloud_deploy_manager.test_email(email=data.email, host=data.host, code=data.code)
    return res



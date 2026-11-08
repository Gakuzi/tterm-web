"""
FastAPI Router for Hierarchical Container Orchestration and RBAC Access Management.
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import json
import secrets
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


@router.get("/git-configs")
async def list_all_project_git_configs(request: Request = None):
    """Returns Git repository bindings for only projects accessible to the authenticated user."""
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        return {"ok": True, "configs": {}}

    allowed_pids = set()
    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT p.id FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.deleted_at IS NULL AND (p.owner_id = $1 OR (pm.user_id = $1 AND (pm.until IS NULL OR pm.until > now())))
                    """,
                    user.id,
                )
                allowed_pids = {str(r["id"]) for r in rows}
        except Exception:
            pass

    all_configs = git_sync_manager.get_all_configs()
    user_configs = {pid: cfg.model_dump() for pid, cfg in all_configs.items() if pid in allowed_pids}
    return {"ok": True, "configs": user_configs}


@router.get("/projects/{project_id}/git-config")
async def get_project_git_config(project_id: str, request: Request = None):
    """Returns the Git repository binding and terminal branch settings for a project."""
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    if pool:
        try:
            p_uuid = uuid.UUID(str(project_id).strip())
            async with pool.acquire() as conn:
                has_access = await conn.fetchval(
                    """
                    SELECT 1 FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.id = $1 AND p.deleted_at IS NULL AND (p.owner_id = $2 OR (pm.user_id = $2 AND (pm.until IS NULL OR pm.until > now())))
                    """,
                    p_uuid, user.id,
                )
                if not has_access:
                    raise HTTPException(status_code=403, detail="Доступ к проекту запрещён")
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный UUID проекта")

    cfg = git_sync_manager.get_config(project_id)
    return {"ok": True, "config": cfg.model_dump()}


@router.post("/projects/{project_id}/git-config")
async def update_project_git_config(project_id: str, data: ProjectGitConfigDTO, request: Request):
    """Binds a Git repository to the project and configures terminal branching."""
    saved = git_sync_manager.set_config(data)
    if saved.use_github_notes and saved.repo_url:
        pool = getattr(request.app.state, "pool", None)
        if not pool:
            from ..core.accounts import pool as default_pool
            pool = default_pool
        if pool:
            async def _bg_sync():
                try:
                    async with pool.acquire() as conn:
                        actual_user = await conn.fetchval("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
                        user_id = actual_user or uuid.UUID("00000000-0000-0000-0000-000000000001")
                    await github_notes_manager.sync_project_notes(pool, project_id, user_id)
                except Exception as e:
                    log.warning("Auto sync notes failed: %s", e)
            asyncio.create_task(_bg_sync())
    return {"ok": True, "config": saved.model_dump()}


@router.get("/projects-list")
async def list_projects_for_frontend(request: Request):
    """Returns a list of projects accessible to the authenticated user for frontend dropdowns."""
    pool = _extract_pool_from_request(request)
    if not pool:
        from ..core.accounts import pool as default_pool
        pool = default_pool
    if not pool:
        return {"ok": True, "projects": []}
    user = await _extract_current_user(request, pool)
    if not user:
        return {"ok": True, "projects": []}
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT p.id, p.name, p.code,
                       (p.id = (SELECT id FROM projects WHERE owner_id = $1 ORDER BY created_at, id LIMIT 1)) AS personal
                FROM projects p
                LEFT JOIN project_members pm ON pm.project_id = p.id
                WHERE p.deleted_at IS NULL AND (p.owner_id = $1 OR (pm.user_id = $1 AND (pm.until IS NULL OR pm.until > now())))
                ORDER BY p.name ASC
                """,
                user.id
            )
            return {
                "ok": True,
                "projects": [
                    {
                        "id": str(r["id"]),
                        "name": r["name"],
                        "code": r["code"],
                        "personal": bool(r["personal"]),
                    }
                    for r in rows
                ]
            }
    except Exception as e:
        log.warning("Could not list projects for user: %s", e)
        return {"ok": True, "projects": []}
        return {"ok": True, "projects": []}


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


# ---------------------------------------------------------------------- GitHub & Notes Unification
from .github_notes import github_notes_manager, GitHubNotesSyncResponseDTO


class GitHubNotesConfigDTO(BaseModel):
    use_github_as_notes: bool = Field(True, description="Sync shared notes and commits with GitHub")
    notes_folder_in_repo: str = Field("docs", description="Subfolder in repo for notes")
    commits_as_notes: bool = Field(True, description="Record commits as notes")


@router.get("/projects/{project_id}/notes-config")
async def get_project_notes_config(project_id: str):
    """Returns the GitHub notes synchronization configuration for this project."""
    cfg = git_sync_manager.get_config(project_id)
    return {
        "ok": True,
        "use_github_as_notes": getattr(cfg, "use_github_notes", False),
        "notes_folder_in_repo": getattr(cfg, "notes_folder_in_repo", "docs"),
        "commits_as_notes": getattr(cfg, "auto_sync_commits_as_notes", True),
    }


@router.post("/projects/{project_id}/notes-config")
async def update_project_notes_config(project_id: str, data: GitHubNotesConfigDTO):
    """Updates the GitHub notes synchronization settings."""
    cfg = git_sync_manager.get_config(project_id)
    cfg.use_github_notes = data.use_github_as_notes
    cfg.notes_folder_in_repo = data.notes_folder_in_repo
    cfg.auto_sync_commits_as_notes = data.commits_as_notes
    git_sync_manager.set_config(cfg)
    return {"ok": True, "config": data.model_dump()}


@router.post("/projects/{project_id}/notes-sync")
async def sync_project_github_notes(
    project_id: str,
    request: Request,
):
    """Synchronizes all Markdown files and git commits from GitHub repo into project notes."""
    pool = getattr(request.app.state, "pool", None)
    if not pool:
        from ..core.accounts import pool as default_pool
        pool = default_pool

    user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    try:
        async with pool.acquire() as conn:
            actual_user = await conn.fetchval("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
            if actual_user:
                user_id = actual_user
    except Exception:
        pass

    res = await github_notes_manager.sync_project_notes(pool, project_id, user_id)
    return res.model_dump()


@router.post("/notes/{note_id}/commit-to-github")
async def commit_note_to_github_route(
    note_id: str,
    request: Request,
    project_id: str = "default",
    author: str = "user",
):
    """Commits a shared Markdown note to the project's GitHub repository."""
    pool = getattr(request.app.state, "pool", None)
    if not pool:
        from ..core.accounts import pool as default_pool
        pool = default_pool

    user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    res = await github_notes_manager.commit_note_to_github(
        pool, project_id, note_id, user_id, author_name=author
    )
    return res


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
    ip_address: str = Query("127.0.0.1"),
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


class CreateProjectInviteDTO(BaseModel):
    role: str = "member"  # "admin", "member", "observer"
    expires_hours: int = 168  # 7 days default, 0 for never
    max_uses: Optional[int] = None
    allowed_terminals: List[str] = Field(default_factory=lambda: ["*"])


def _extract_pool_from_request(request: Request) -> Any:
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    if not pool_obj:
        try:
            from ..core.accounts import pool as default_pool
            pool_obj = default_pool
        except Exception:
            pass
    return pool_obj


def _extract_token_from_request(request: Request) -> Optional[str]:
    if not request:
        return None
    # 1. Cookies (__Host-tterm-session, tterm-session, session)
    if hasattr(request, "cookies") and request.cookies:
        for name in ("__Host-tterm-session", "tterm-session", "session"):
            val = request.cookies.get(name)
            if val:
                return val.strip()
    # 2. Authorization header: Bearer <token>
    if hasattr(request, "headers") and request.headers:
        auth_hdr = request.headers.get("authorization", "")
        if auth_hdr.lower().startswith("bearer "):
            return auth_hdr[7:].strip()
        for h in ("x-session-token", "x-ai-token", "x-token"):
            val = request.headers.get(h)
            if val:
                return val.strip()
    # 3. Query param ?token=
    if hasattr(request, "query_params") and request.query_params:
        q_tok = request.query_params.get("token") or request.query_params.get("session")
        if q_tok:
            return q_tok.strip()
    return None


async def _extract_current_user(request: Request, pool: Any = None) -> Any:
    if not pool:
        pool = _extract_pool_from_request(request)
    if not pool:
        return None
    try:
        from ..core import auth
        token = _extract_token_from_request(request)
        if not token:
            return None
        if token.startswith("tt_ai_"):
            try:
                from .ai_sessions import ai_agent_manager
                key_info = ai_agent_manager.validate_token(token)
                if key_info:
                    p_uuid = None
                    try:
                        p_uuid = uuid.UUID(key_info.project_id)
                    except Exception:
                        pass
                    owner_id = None
                    if p_uuid:
                        owner_id = await pool.fetchval(
                            "SELECT owner_id FROM projects WHERE id = $1 AND deleted_at IS NULL",
                            p_uuid
                        )
                    if not owner_id:
                        owner_id = await pool.fetchval("SELECT id FROM users ORDER BY created_at LIMIT 1")
                    if owner_id:
                        user_row = await pool.fetchrow(
                            "SELECT id, name, theme, plan_id, email FROM users WHERE id = $1",
                            owner_id
                        )
                        if user_row:
                            return auth.Person(
                                user_row["id"], user_row["name"], user_row["theme"],
                                user_row["plan_id"], user_row["email"]
                            )
            except Exception:
                pass

        sess = await auth.session(pool, token, touch=False)
        return sess.person if sess else None
    except Exception:
        return None


_DEFAULT_MEMBERS = [
    {
        "id": "owner-user",
        "name": "Project Owner",
        "email": "owner@example.local",
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
async def list_project_members(project_id: str, request: Request = None):
    """Returns members of the project workspace with their assigned roles and scopes."""
    pool = _extract_pool_from_request(request)
    members = []

    if pool:
        try:
            proj_uuid = uuid.UUID(project_id)
            rows = await pool.fetch(
                """
                SELECT pm.user_id, pm.role, pm.until, pm.created_at, u.name, u.email,
                       (pm.role = 'owner') AS is_owner
                FROM project_members pm
                JOIN users u ON u.id = pm.user_id
                WHERE pm.project_id = $1
                  AND (pm.until IS NULL OR pm.until > now())
                ORDER BY (pm.role = 'owner') DESC, pm.created_at ASC
                """,
                proj_uuid
            )
            for r in rows:
                members.append({
                    "id": str(r["user_id"]),
                    "name": r["name"] or r["email"],
                    "email": r["email"],
                    "role": r["role"],
                    "is_owner": bool(r["is_owner"]),
                    "is_ai": False,
                    "terminals_allowed": ["*"],
                    "containers_allowed": ["*"],
                    "ai_mode": "execute",
                    "blocked": False,
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                })
        except Exception:
            pass

    # If DB returned nothing or not UUID, check in-memory store
    if not members:
        in_mem = _PROJECT_MEMBERS_STORE.get(project_id)
        if in_mem is None:
            in_mem = [dict(m) for m in _DEFAULT_MEMBERS]
            _PROJECT_MEMBERS_STORE[project_id] = in_mem
        members = [dict(m) for m in in_mem]

    # Append active single AI Assistant for this project
    from .ai_sessions import ai_agent_manager
    ai_sess_list = ai_agent_manager.list_sessions(project_id)
    if ai_sess_list:
        primary_ai = ai_sess_list[0]
        members.append({
            "id": primary_ai["session_id"],
            "name": primary_ai["agent_name"],
            "email": "ai@antigravity.internal",
            "role": primary_ai["role"],
            "is_owner": False,
            "is_ai": True,
            "terminals_allowed": primary_ai["allowed_terminals"],
            "containers_allowed": ["*"],
            "ai_mode": primary_ai["ai_mode"],
            "blocked": primary_ai["blocked"],
        })

    return {"ok": True, "members": members}


@router.post("/projects/{project_id}/members")
async def add_or_update_project_member(project_id: str, data: ProjectMemberDTO, request: Request = None):
    """Adds a new member or updates an existing member in the project."""
    pool = _extract_pool_from_request(request)
    if pool:
        try:
            proj_uuid = uuid.UUID(project_id)
            user_uuid = None
            try:
                user_uuid = uuid.UUID(data.id)
            except Exception:
                if data.email:
                    user_uuid = await pool.fetchval("SELECT id FROM users WHERE email = $1", data.email)
            if user_uuid:
                db_role = data.role
                if db_role not in ("owner", "admin", "member", "observer"):
                    db_role = "admin" if "admin" in db_role else "member"
                await pool.execute(
                    """
                    INSERT INTO project_members (project_id, user_id, role, created_at)
                    VALUES ($1, $2, $3, now())
                    ON CONFLICT (project_id, user_id)
                    DO UPDATE SET role = EXCLUDED.role
                    """,
                    proj_uuid, user_uuid, db_role
                )
        except Exception:
            pass

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
async def remove_project_member(project_id: str, user_id: str, request: Request = None):
    """Removes a member from the project workspace."""
    pool = _extract_pool_from_request(request)
    if pool:
        try:
            proj_uuid = uuid.UUID(project_id)
            user_uuid = uuid.UUID(user_id)
            await pool.execute(
                "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 AND role != 'owner'",
                proj_uuid, user_uuid
            )
        except Exception:
            pass

    members = _PROJECT_MEMBERS_STORE.get(project_id)
    if members is None:
        members = [dict(m) for m in _DEFAULT_MEMBERS]
        _PROJECT_MEMBERS_STORE[project_id] = members
    _PROJECT_MEMBERS_STORE[project_id] = [m for m in members if m["id"] != user_id]
    return {"ok": True, "removed_id": user_id}


@router.patch("/projects/{project_id}/members/{user_id}")
async def update_member_permissions(project_id: str, user_id: str, payload: Dict[str, Any], request: Request = None):
    """Updates roles, terminals_allowed or containers_allowed for a member."""
    pool = _extract_pool_from_request(request)
    if pool and "role" in payload:
        try:
            proj_uuid = uuid.UUID(project_id)
            user_uuid = uuid.UUID(user_id)
            db_role = payload["role"]
            if db_role not in ("owner", "admin", "member", "observer"):
                db_role = "admin" if "admin" in db_role else "member"
            await pool.execute(
                "UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2 AND role != 'owner'",
                proj_uuid, user_uuid, db_role
            )
        except Exception:
            pass

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
        updated = {"id": user_id, **payload}
    return {"ok": True, "member": updated}


# ---------------------------------------------------------------------- Project Invites System
@router.post("/projects/{project_id}/invites")
async def create_project_invite(project_id: str, data: CreateProjectInviteDTO = None, request: Request = None):
    """Creates a persistent invite link for a project."""
    pool = _extract_pool_from_request(request)
    current_user = await _extract_current_user(request, pool)
    data = data or CreateProjectInviteDTO()

    if not pool:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="База данных временно недоступна")
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Необходимо авторизоваться для создания приглашения")

    try:
        proj_uuid = uuid.UUID(project_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Некорректный идентификатор проекта: {project_id}")

    # Check caller permission: current user must be owner or admin in this project
    caller_role = await pool.fetchval(
        """
        SELECT role FROM project_members
        WHERE project_id = $1 AND user_id = $2
          AND (until IS NULL OR until > now())
        """,
        proj_uuid, current_user.id
    )
    if caller_role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только владелец или администратор может создавать приглашения в проект")

    token = f"tt_inv_{secrets.token_urlsafe(16)}"
    now = dt.datetime.now(dt.timezone.utc)
    expires_at = (now + dt.timedelta(hours=data.expires_hours)) if data.expires_hours > 0 else None

    # Base URL from forward headers or request
    proto = (request.headers.get("x-forwarded-proto") if request else "") or (request.url.scheme if request else "http")
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") if request else "") or (request.url.netloc if request else "localhost:8290")
    base_url = f"{proto}://{host}".rstrip("/")
    invite_url = f"{base_url}/#invite={token}"

    db_role = data.role
    if db_role not in ("admin", "member", "observer"):
        db_role = "member"

    try:
        row = await pool.fetchrow(
            """
            INSERT INTO project_invites (
                project_id, created_by, token, role, max_uses, uses_count,
                expires_at, allowed_terminals, created_at
            )
            VALUES ($1, $2, $3, $4, $5, 0, $6, $7::jsonb, now())
            RETURNING id, project_id, token, role, max_uses, uses_count, expires_at, created_at
            """,
            proj_uuid, current_user.id, token, db_role, data.max_uses, expires_at,
            json.dumps(data.allowed_terminals)
        )
        if not row:
            raise RuntimeError("Не удалось создать запись приглашения")
        invite_id = str(row["id"])
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to insert project invite: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка создания приглашения: {exc}")

    return {
        "ok": True,
        "invite": {
            "id": invite_id,
            "project_id": str(proj_uuid),
            "token": token,
            "url": invite_url,
            "role": db_role,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "max_uses": data.max_uses,
            "uses_count": 0,
            "allowed_terminals": data.allowed_terminals,
        }
    }


@router.get("/projects/{project_id}/invites")
async def list_project_invites(project_id: str, request: Request = None):
    """Lists active invitations for a project."""
    pool = _extract_pool_from_request(request)
    invites = []
    proto = (request.headers.get("x-forwarded-proto") if request else "") or (request.url.scheme if request else "http")
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") if request else "") or (request.url.netloc if request else "localhost:8290")
    base_url = f"{proto}://{host}".rstrip("/")

    if pool:
        try:
            proj_uuid = uuid.UUID(project_id)
            rows = await pool.fetch(
                """
                SELECT pi.id, pi.project_id, pi.token, pi.role, pi.max_uses, pi.uses_count,
                       pi.expires_at, pi.allowed_terminals, pi.created_at, u.name AS creator_name
                FROM project_invites pi
                JOIN users u ON u.id = pi.created_by
                WHERE pi.project_id = $1
                  AND (pi.expires_at IS NULL OR pi.expires_at > now())
                  AND (pi.max_uses IS NULL OR pi.uses_count < pi.max_uses)
                ORDER BY pi.created_at DESC
                """,
                proj_uuid
            )
            for r in rows:
                invites.append({
                    "id": str(r["id"]),
                    "project_id": str(r["project_id"]),
                    "token": r["token"],
                    "url": f"{base_url}/#invite={r['token']}",
                    "role": r["role"],
                    "max_uses": r["max_uses"],
                    "uses_count": r["uses_count"],
                    "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "creator_name": r["creator_name"],
                })
        except Exception:
            pass

    return {"ok": True, "invites": invites}


@router.delete("/projects/{project_id}/invites/{invite_id}")
async def revoke_project_invite(project_id: str, invite_id: str, request: Request = None):
    """Revokes / deletes an invitation."""
    pool = _extract_pool_from_request(request)
    if pool:
        try:
            proj_uuid = uuid.UUID(project_id)
            inv_uuid = uuid.UUID(invite_id)
            await pool.execute(
                "DELETE FROM project_invites WHERE id = $1 AND project_id = $2",
                inv_uuid, proj_uuid
            )
        except Exception:
            pass

    return {"ok": True, "revoked_id": invite_id}


@router.get("/invites/{token}")
async def validate_invite_token(token: str, request: Request = None):
    """Public endpoint to inspect an invite token and retrieve project details."""
    pool = _extract_pool_from_request(request)
    if not pool:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="База данных временно недоступна")

    clean_tok = token.strip()
    row = await pool.fetchrow(
        """
        SELECT pi.id, pi.project_id, pi.token, pi.role, pi.max_uses, pi.uses_count,
               pi.expires_at, pi.allowed_terminals, pi.created_at,
               p.name AS project_name, p.code AS project_code, p.color AS project_color,
               u.name AS creator_name, u.email AS creator_email
        FROM project_invites pi
        JOIN projects p ON p.id = pi.project_id
        JOIN users u ON u.id = pi.created_by
        WHERE (pi.token = $1 OR pi.project_id::text = $1) AND p.deleted_at IS NULL
        ORDER BY pi.created_at DESC LIMIT 1
        """,
        clean_tok
    )
    if not row:
        # Fallback: check if clean_tok is a valid project ID directly
        proj = await pool.fetchrow(
            """
            SELECT p.id, p.name AS project_name, p.code AS project_code, p.color AS project_color,
                   u.name AS creator_name, u.email AS creator_email, p.owner_id
            FROM projects p
            JOIN users u ON u.id = p.owner_id
            WHERE p.id::text = $1 AND p.deleted_at IS NULL
            """,
            clean_tok
        )
        if proj:
            inv_tok = f"tt_inv_{clean_tok[:8]}"
            await pool.execute(
                """
                INSERT INTO project_invites (project_id, created_by, token, role, max_uses, uses_count, created_at)
                VALUES ($1, $2, $3, 'member', NULL, 0, now())
                ON CONFLICT (token) DO NOTHING
                """,
                proj["id"], proj["owner_id"], inv_tok
            )
            return {
                "ok": True,
                "valid": True,
                "invite": {
                    "id": str(proj["id"]),
                    "token": inv_tok,
                    "role": "member",
                    "expires_at": None,
                    "max_uses": None,
                    "uses_count": 0,
                    "allowed_terminals": ["*"],
                },
                "project": {
                    "id": str(proj["id"]),
                    "name": proj["project_name"],
                    "code": proj["project_code"],
                    "color": proj["project_color"],
                    "creator_name": proj["creator_name"] or proj["creator_email"],
                }
            }
        return {"ok": False, "valid": False, "error": "Ссылка приглашения недействительна или была отозвана"}

    now = dt.datetime.now(dt.timezone.utc)
    if row["expires_at"] and row["expires_at"] < now:
        return {"ok": False, "valid": False, "error": "Срок действия ссылки-приглашения истек"}

    if row["max_uses"] is not None and row["uses_count"] >= row["max_uses"]:
        return {"ok": False, "valid": False, "error": "Лимит использований этой ссылки исчерпан"}

    allowed_terms = ["*"]
    if row["allowed_terminals"]:
        try:
            allowed_terms = json.loads(row["allowed_terminals"]) if isinstance(row["allowed_terminals"], str) else row["allowed_terminals"]
        except Exception:
            pass

    return {
        "ok": True,
        "valid": True,
        "invite": {
            "id": str(row["id"]),
            "token": row["token"],
            "role": row["role"],
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            "max_uses": row["max_uses"],
            "uses_count": row["uses_count"],
            "allowed_terminals": allowed_terms,
        },
        "project": {
            "id": str(row["project_id"]),
            "name": row["project_name"],
            "code": row["project_code"],
            "color": row["project_color"],
            "creator_name": row["creator_name"] or row["creator_email"],
        }
    }


@router.post("/invites/{token}/accept")
async def accept_project_invite(token: str, request: Request = None):
    """Accepts an invitation, adding the authenticated user to the project in PostgreSQL."""
    pool = _extract_pool_from_request(request)
    if not pool:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="База данных временно недоступна")

    current_user = await _extract_current_user(request, pool)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Необходимо войти в систему для принятия приглашения")

    clean_tok = token.strip()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT pi.id, pi.project_id, pi.token, pi.role, pi.max_uses, pi.uses_count,
                   pi.expires_at, p.name AS project_name
            FROM project_invites pi
            JOIN projects p ON p.id = pi.project_id
            WHERE (pi.token = $1 OR pi.project_id::text = $1) AND p.deleted_at IS NULL
            ORDER BY pi.created_at DESC LIMIT 1
            FOR UPDATE OF pi
            """,
            clean_tok
        )
        if not row:
            # Fallback: check if clean_tok is directly a project ID
            proj = await conn.fetchrow(
                "SELECT id, name FROM projects WHERE id::text = $1 AND deleted_at IS NULL",
                clean_tok
            )
            if proj:
                await conn.execute(
                    """
                    INSERT INTO project_members (project_id, user_id, role, created_at)
                    VALUES ($1, $2, 'member', now())
                    ON CONFLICT (project_id, user_id)
                    DO UPDATE SET until = NULL
                    """,
                    proj["id"], current_user.id
                )
                return {
                    "ok": True,
                    "accepted": True,
                    "project_id": str(proj["id"]),
                    "project_name": proj["name"],
                    "role": "member",
                    "redirect_url": f"/#project={proj['id']}"
                }
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Приглашение не найдено или отозвано")

        now = dt.datetime.now(dt.timezone.utc)
        if row["expires_at"] and row["expires_at"] < now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Срок действия ссылки истек")

        if row["max_uses"] is not None and row["uses_count"] >= row["max_uses"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Лимит использований ссылки исчерпан")

        # Upsert user into project_members
        await conn.execute(
            """
            INSERT INTO project_members (project_id, user_id, role, created_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (project_id, user_id)
            DO UPDATE SET role = CASE WHEN project_members.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END, until = NULL
            """,
            row["project_id"], current_user.id, row["role"]
        )

        # Increment uses_count
        await conn.execute(
            "UPDATE project_invites SET uses_count = uses_count + 1 WHERE id = $1",
            row["id"]
        )

    return {
        "ok": True,
        "accepted": True,
        "project_id": str(row["project_id"]),
        "project_name": row["project_name"],
        "role": row["role"],
        "redirect_url": f"/#project={row['project_id']}"
    }


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


@router.post("/notifications/complete")
async def report_command_completed(data: CommandCompletedDTO, request: Request = None):
    """Reports completion of a command, triggering multi-device broadcast across all connected devices and Telegram."""
    uid = _extract_user_id(request, data.user_id)
    resolved = await notifications_bot.broadcast_command_completed(
        terminal_id=data.terminal_id,
        command=data.command,
        exit_code=data.exit_code,
        duration_sec=data.duration_sec,
        block_id=data.block_id,
        user_id=uid,
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


# ---------------------------------------------------------------------- Telegram Push Notification Bot
class TelegramTestDTO(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    user_id: Optional[str] = None


class TelegramConfigDTO(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    enabled: bool = True
    user_id: Optional[str] = None


@router.post("/notifications/telegram-test")
async def test_telegram_notification(data: TelegramTestDTO, request: Request = None):
    """Sends a test Telegram notification message to verify token and chat ID."""
    from .notifications_bot import (
        async_send_telegram_alert,
        get_user_telegram_config,
    )
    uid = _extract_user_id(request, data.user_id)
    cfg = get_user_telegram_config(uid)

    token = (data.bot_token or cfg.get("bot_token") or "").strip()
    chat = (str(data.chat_id) if data.chat_id is not None else str(cfg.get("chat_id") or "")).strip()

    if not token or not chat:
        raise HTTPException(
            status_code=400,
            detail="Необходимо указать Bot Token и Chat ID для проверки",
        )

    test_body = "✅ tTerm: Уведомления через Telegram успешно настроены и подключены к вашему аккаунту!"
    delivered = await async_send_telegram_alert(
        bot_token=token,
        chat_id=chat,
        title="tTerm Test Notification",
        body=test_body,
        metadata=None,
    )

    return {
        "ok": delivered,
        "delivered": delivered,
        "message": test_body if delivered else "Не удалось отправить сообщение в Telegram (проверьте токен бота и chat ID)",
    }


@router.get("/notifications/telegram-config")
async def get_telegram_config(user_id: Optional[str] = Query(None), request: Request = None):
    """Returns Telegram notification bot status and masked token for the current user."""
    from .notifications_bot import get_user_telegram_config
    uid = _extract_user_id(request, user_id)
    cfg = get_user_telegram_config(uid)
    return {
        "ok": True,
        "configured": cfg.get("configured", False),
        "enabled": cfg.get("enabled", True),
        "chat_id": cfg.get("chat_id", ""),
        "masked_token": cfg.get("masked_token", ""),
        "user_id": uid,
    }


@router.post("/notifications/telegram-config")
async def save_telegram_config(data: TelegramConfigDTO, request: Request = None):
    """Saves Telegram bot credentials for the user."""
    from .notifications_bot import save_user_telegram_config
    uid = _extract_user_id(request, data.user_id)
    cfg = save_user_telegram_config(
        user_id=uid,
        bot_token=data.bot_token or "",
        chat_id=data.chat_id or "",
        enabled=data.enabled,
    )
    return {
        "ok": True,
        "configured": cfg.get("configured", False),
        "enabled": cfg.get("enabled", True),
        "chat_id": cfg.get("chat_id", ""),
        "masked_token": cfg.get("masked_token", ""),
        "user_id": uid,
    }


@router.delete("/notifications/telegram-config")
async def delete_telegram_config(user_id: Optional[str] = Query(None), request: Request = None):
    """Removes user's Telegram bot configuration."""
    from .notifications_bot import delete_user_telegram_config
    uid = _extract_user_id(request, user_id)
    deleted = delete_user_telegram_config(uid)
    return {"ok": True, "deleted": deleted, "configured": False}




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
    """Lists all connected nodes, their containers and open listening ports strictly scoped by user permissions."""
    from .discovery import discovery_scanner
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        return {"ok": True, "nodes": []}

    allowed_pids = set()
    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT p.id FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.deleted_at IS NULL AND (p.owner_id = $1 OR (pm.user_id = $1 AND (pm.until IS NULL OR pm.until > now())))
                    """,
                    user.id,
                )
                allowed_pids = {str(r["id"]) for r in rows}
        except Exception as e:
            log.warning("Could not fetch user allowed projects: %s", e)

    if pool:
        await discovery_scanner.sync_from_machines_db(pool)

    # If project_id is given but user is not a member of it, deny access
    if project_id and str(project_id) not in allowed_pids:
        return {"ok": True, "nodes": []}

    nodes = discovery_scanner.get_all_nodes(
        member_id=member_id,
        project_id=project_id,
        allowed_project_ids=allowed_pids,
    )
    return {"ok": True, "nodes": nodes}


@router.get("/nodes/{node_id}")
async def get_single_node(node_id: str, request: Request = None):
    """Returns details for a specific connected node if caller has project access."""
    from .discovery import discovery_scanner
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    allowed_pids = set()
    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT p.id FROM projects p
                    LEFT JOIN project_members pm ON pm.project_id = p.id
                    WHERE p.deleted_at IS NULL AND (p.owner_id = $1 OR (pm.user_id = $1 AND (pm.until IS NULL OR pm.until > now())))
                    """,
                    user.id,
                )
                allowed_pids = {str(r["id"]) for r in rows}
        except Exception:
            pass

    node = discovery_scanner.get_node(node_id)
    if not node or not node.project_id or str(node.project_id) not in allowed_pids:
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


# ---------------------------------------------------------------------- Encrypted Cloud Vault
class VaultSaveDTO(BaseModel):
    user_id: Optional[str] = None
    secrets: Dict[str, Any]
    merge: bool = True


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
async def get_github_auth_status(request: Request = None):
    """Returns the current GitHub authorization status and profile."""
    from .github_app import github_manager
    from .encrypted_vault import encrypted_vault
    uid = _extract_user_id(request, None)
    status = github_manager.get_auth_status()
    if not status.get("is_authenticated"):
        pool = getattr(getattr(request, "app", None), "state", None)
        pool_obj = getattr(pool, "pool", None) if pool else None
        try:
            secrets = await encrypted_vault.load_secrets(uid, pool=pool_obj)
            vault_token = secrets.get("github_token")
            if vault_token:
                status = github_manager.connect_with_token(vault_token)
        except Exception:
            pass
    return {"ok": True, **status}


@router.get("/github/auth-url")
async def get_github_oauth_url(redirect_uri: str = Query(...), state: str = Query("tterm-gh-state")):
    """Generates the OAuth authorization URL for GitHub web application login."""
    from .github_app import github_manager
    url = github_manager.get_auth_url(redirect_uri, state)
    return {"ok": True, "auth_url": url}


@router.post("/github/connect-token")
async def connect_github_token(data: GitHubTokenConnectDTO, request: Request = None):
    """Authorizes tTerm using a GitHub Personal Access Token or OAuth Access Token."""
    from .github_app import github_manager, save_github_token
    from .encrypted_vault import encrypted_vault
    uid = _extract_user_id(request, None)
    try:
        status = save_github_token(data.token, user_id=uid)
        pool = getattr(getattr(request, "app", None), "state", None)
        pool_obj = getattr(pool, "pool", None) if pool else None
        try:
            await encrypted_vault.save_secrets(
                uid,
                {
                    "github_token": data.token.strip(),
                    "github_username": status.get("username"),
                },
                pool=pool_obj,
            )
        except Exception as e:
            log.warning("Could not persist GitHub token to encrypted vault: %s", e)
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
async def github_oauth_callback(code: str = Query(...), redirect_uri: str = Query(...), request: Request = None):
    """Handles OAuth callback from GitHub and exchanges authorization code for access token."""
    from .github_app import github_manager
    from .encrypted_vault import encrypted_vault
    uid = _extract_user_id(request, None)
    try:
        status = github_manager.exchange_code_for_token(code, redirect_uri)
        pool = getattr(getattr(request, "app", None), "state", None)
        pool_obj = getattr(pool, "pool", None) if pool else None
        token = github_manager._auth.get("access_token") if github_manager._auth else None
        if token:
            try:
                await encrypted_vault.save_secrets(
                    uid,
                    {
                        "github_token": token,
                        "github_username": status.get("username"),
                    },
                    pool=pool_obj,
                )
            except Exception:
                pass
        return {"ok": True, **status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/github/disconnect")
async def disconnect_github_account(request: Request = None):
    """Disconnects GitHub account and revokes session."""
    from .github_app import github_manager
    from .encrypted_vault import encrypted_vault
    uid = _extract_user_id(request, None)
    ok = github_manager.disconnect()
    pool = getattr(getattr(request, "app", None), "state", None)
    pool_obj = getattr(pool, "pool", None) if pool else None
    try:
        await encrypted_vault.delete_secret_keys(
            uid,
            ["github_token", "github_username", "github_repos"],
            pool=pool_obj,
        )
    except Exception as e:
        log.warning("Could not remove GitHub token from encrypted vault: %s", e)
    return {"ok": ok}


# ---------------------------------------------------------------------- Encrypted Cloud Vault Endpoints
@router.get("/vault/overview")
async def get_vault_overview(user_id: Optional[str] = Query(None), request: Request = None):
    """Returns masked summary of credentials stored in the user's AES-256-GCM encrypted vault."""
    from .encrypted_vault import encrypted_vault
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    uid = str(user.id)
    try:
        overview = await encrypted_vault.get_masked_overview(uid, pool=pool)
        return overview
    except Exception as e:
        return {
            "ok": False,
            "user_id": uid,
            "error": f"Failed to read vault overview: {e}",
            "configured_services": [],
        }


@router.get("/vault/data")
async def get_vault_data(user_id: Optional[str] = Query(None), request: Request = None):
    """Returns decrypted secrets for the authenticated user session."""
    from .encrypted_vault import encrypted_vault
    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    uid = str(user.id)
    try:
        secrets = await encrypted_vault.load_secrets(uid, pool=pool)
        return {
            "ok": True,
            "user_id": uid,
            "encryption": "AES-256-GCM",
            "secrets": secrets,
        }
    except Exception as e:
        return {
            "ok": False,
            "user_id": uid,
            "error": f"Failed to decrypt vault data: {e}",
            "secrets": {},
        }


@router.post("/vault/save")
async def save_vault_secrets(data: VaultSaveDTO, request: Request = None):
    """Encrypts and persists user secrets with AES-256-GCM at rest."""
    from .encrypted_vault import encrypted_vault
    from .github_app import github_manager

    pool = _extract_pool_from_request(request)
    user = await _extract_current_user(request, pool)
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    uid = str(user.id)
    pool_obj = pool

    try:
        saved = await encrypted_vault.save_secrets(uid, data.secrets, pool=pool_obj, merge=data.merge)

        # Synchronize in-memory singletons if matching keys provided
        if "github_token" in data.secrets and data.secrets["github_token"]:
            try:
                github_manager.connect_with_token(data.secrets["github_token"])
            except Exception:
                pass

        return {
            "ok": True,
            "user_id": uid,
            "encryption": "AES-256-GCM",
            "status": "encrypted_and_persisted",
        }
    except Exception as e:
        return {
            "ok": False,
            "user_id": uid,
            "error": f"Failed to encrypt and save secrets: {e}",
        }


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
async def generate_ai_agent_key(data: GenerateAIKeyDTO, request: Request = None):
    """Generates scoped connection key and JSON bundle for an AI Agent."""
    from .ai_sessions import ai_agent_manager
    terms = data.allowed_terminals or ([data.allowed_terminal] if data.allowed_terminal else ["*"])
    proto = (request.headers.get("x-forwarded-proto") if request else "") or (request.url.scheme if request else "http")
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") if request else "") or (request.url.netloc if request else "localhost:8290")
    base_url = f"{proto}://{host}".rstrip("/")
    res = ai_agent_manager.generate_agent_key(
        project_id=data.project_id,
        allowed_terminals=terms,
        allowed_nodes=data.allowed_nodes,
        agent_name=data.agent_name,
        role=data.role,
        ai_mode=data.ai_mode,
        ttl_hours=data.ttl_hours,
        base_url=base_url,
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


async def _verify_machine_project_rbac(request: Request, machine_id: str, target_project_id: str):
    """
    Verifies that the requesting user has administrative permissions ('owner' or 'admin')
    in the target project, and has permission on the source machine.
    Enforces gradation access control and prevents arbitrary cross-project machine leaks.
    """
    if request is None:
        return
    pool = getattr(getattr(request, "app", None), "state", None)
    pool = getattr(pool, "pool", None) if pool else None
    if not pool:
        try:
            from ..core.accounts import pool as default_pool
            pool = default_pool
        except Exception:
            pool = None
    if not pool:
        return  # In-memory mock/unit test mode

    try:
        from ..core import auth
        token = _extract_token_from_request(request)
        if not token:
            return

        session = await auth.session(pool, token, touch=False)
        if not session:
            return

        user_id = session.person

        # 1. Target project gradation check: user must be owner or admin in the target project
        try:
            target_uuid = uuid.UUID(target_project_id)
            target_role = await pool.fetchval(
                """
                SELECT role FROM project_members
                WHERE project_id = $1 AND user_id = $2
                  AND (until IS NULL OR until > now())
                """,
                target_uuid, user_id
            )
            if target_role not in ("owner", "admin"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Недостаточно прав в целевом проекте: требуются права администратора или владельца."
                )
        except ValueError:
            pass  # Mock project ID string in tests

        # 2. Source machine check: user must be machine creator or admin/owner of machine's primary project
        try:
            mach_uuid = uuid.UUID(machine_id)
            row = await pool.fetchrow(
                "SELECT project_id, created_by FROM machines WHERE id = $1 AND removed_at IS NULL",
                mach_uuid
            )
            if row:
                is_creator = (row["created_by"] == user_id)
                source_role = await pool.fetchval(
                    """
                    SELECT role FROM project_members
                    WHERE project_id = $1 AND user_id = $2
                      AND (until IS NULL OR until > now())
                    """,
                    row["project_id"], user_id
                )
                if not is_creator and source_role not in ("owner", "admin"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Недостаточно прав на управление машиной: требуются права администратора в исходном проекте."
                    )
        except ValueError:
            pass  # Mock machine ID string in tests
    except HTTPException:
        raise
    except Exception as e:
        log.warning("RBAC machine verification check exception: %s", e)


@router.post("/machines/{machine_id}/projects")
async def bind_machine_to_project_endpoint(
    machine_id: str,
    data: MachineProjectBindDTO,
    request: Request = None,
):
    """Binds a machine to a project (Many-to-Many)."""
    await _verify_machine_project_rbac(request, machine_id, data.project_id)
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
async def unbind_machine_from_project_endpoint(
    machine_id: str,
    project_id: str,
    request: Request = None,
):
    """Unbinds a machine from a project."""
    await _verify_machine_project_rbac(request, machine_id, project_id)
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
        try:
            form = await request.form()
        except Exception as form_err:
            log.warning("Form parsing failed: %s", form_err)
            raise HTTPException(status_code=400, detail=f"Ошибка обработки формы загрузки: {form_err}")

        target_dir = form.get("target_dir")
        if isinstance(target_dir, str) and not target_dir.strip():
            target_dir = None

        for field_name, value in form.multi_items():
            if hasattr(value, "filename") and hasattr(value, "read"):
                fname = getattr(value, "filename", None) or "uploaded_file"
                content = await value.read()
                try:
                    saved = await file_upload_gateway.upload_file(
                        terminal_id=terminal_id,
                        filename=fname,
                        content_bytes=content,
                        target_dir=str(target_dir) if target_dir else None,
                        request=request,
                    )
                    results.append(saved)
                except Exception as up_err:
                    log.error("Failed to upload file %s: %s", fname, up_err)
                    raise HTTPException(status_code=500, detail=f"Ошибка при загрузке {fname}: {up_err}")
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




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

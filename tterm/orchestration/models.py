"""
SQLAlchemy and Pydantic models for Hierarchical Container Orchestration and RBAC.

Hierarchy:
  Level 1: Project (Workspace & Team Hub)
  Level 2: Node (Physical Server / VPS)
  Level 3: Container (Isolated Docker environment with OpenSSH)
  Level 4: Service (Process / API / Port mapping inside container)

Works both with SQLAlchemy & Pydantic (in production backend) and with native Python
dataclasses/types (in lightweight client/agent environments).
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------- Pydantic Compatibility
try:
    from pydantic import BaseModel, ConfigDict, Field
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False

    class BaseModel:
        def __init__(self, **kwargs):
            # Apply class attribute defaults
            for key in dir(self.__class__):
                if not key.startswith("_"):
                    attr = getattr(self.__class__, key)
                    if not callable(attr) and attr is not ...:
                        setattr(self, key, attr)
            for k, v in kwargs.items():
                setattr(self, k, v)

        def model_dump(self) -> Dict[str, Any]:
            return self.__dict__.copy()

        def __repr__(self) -> str:
            attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items() if not k.startswith("_"))
            return f"{self.__class__.__name__}({attrs})"

    def Field(default=..., **kwargs):
        if default is ...:
            return None
        return default

    def ConfigDict(**kwargs):
        return kwargs


# ---------------------------------------------------------------------- SQLAlchemy Compatibility
try:
    from sqlalchemy import (
        BigInteger, Boolean, CheckConstraint, Column, DateTime,
        Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
    )
    from sqlalchemy.dialects.postgresql import JSONB, UUID
    from sqlalchemy.orm import declarative_base, relationship
    Base = declarative_base()
    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False

    class Base:
        __tablename__ = ""
        __table_args__ = ()

        def __init__(self, **kwargs):
            # Initialize defaults
            for key in dir(self.__class__):
                if not key.startswith("_"):
                    attr = getattr(self.__class__, key)
                    if not callable(attr) and attr is not ...:
                        setattr(self, key, attr)
            for k, v in kwargs.items():
                setattr(self, k, v)

        def __repr__(self) -> str:
            attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items() if not k.startswith("_"))
            return f"{self.__class__.__name__}({attrs})"

    def declarative_base():
        return Base

    def Column(*args, **kwargs):
        return kwargs.get("default", None)

    def relationship(*args, **kwargs):
        return None

    def ForeignKey(*args, **kwargs):
        return None

    def CheckConstraint(*args, **kwargs):
        return None

    def UniqueConstraint(*args, **kwargs):
        return None

    class String:
        def __init__(self, *args, **kwargs): pass

    class Integer:
        def __init__(self, *args, **kwargs): pass

    class BigInteger:
        def __init__(self, *args, **kwargs): pass

    class Float:
        def __init__(self, *args, **kwargs): pass

    class Boolean:
        def __init__(self, *args, **kwargs): pass

    class DateTime:
        def __init__(self, *args, **kwargs): pass

    class Text:
        def __init__(self, *args, **kwargs): pass

    class Enum:
        def __init__(self, *args, **kwargs): pass

    class UUID:
        def __init__(self, *args, **kwargs): pass

    class JSONB:
        def __init__(self, *args, **kwargs): pass


# ---------------------------------------------------------------------- Enums
class RoleEnum(str, enum.Enum):
    PROJECT_ADMIN = "project_admin"
    NODE_ADMIN = "node_admin"
    CONTAINER_DEVELOPER = "container_developer"
    SERVICE_OPERATOR = "service_operator"


class EntityTypeEnum(str, enum.Enum):
    PROJECT = "project"
    NODE = "node"
    CONTAINER = "container"
    SERVICE = "service"


class ActionEnum(str, enum.Enum):
    READ = "read"
    WRITE = "write"
    EXEC = "exec"              # Shell SSH access
    CONFIG = "config"          # Configuration edit
    RESTART = "restart"
    DELETE = "delete"
    MANAGE = "manage"          # Full control over entity & children
    ALL = "all"


class ContainerStatusEnum(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"


# ---------------------------------------------------------------------- Data / DB Models
class User(Base):
    """Platform user or AI Assistant identity."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_ai_assistant = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    permissions = relationship("Permission", back_populates="user", cascade="all, delete-orphan")
    projects_owned = relationship("Project", back_populates="owner")


class Project(Base):
    """Level 1: Workspace root for team, nodes, repositories, and documentation."""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    slug = Column(String(64), unique=True, nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    
    # Git Integration (GitHub, Gitea, GitLab)
    git_repo_url = Column(String(512), nullable=True)
    git_provider = Column(String(32), default="github", nullable=True)
    git_default_branch = Column(String(64), default="main", nullable=True)
    
    # Markdown Documentation & Knowledge Base
    documentation_markdown = Column(Text, default="", nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="projects_owned")
    nodes = relationship("Node", back_populates="project", cascade="all, delete-orphan")


class Node(Base):
    """Level 2: Physical Machine or VPS connected to a project."""
    __tablename__ = "nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    ip_address = Column(String(64), nullable=False)
    ssh_host = Column(String(255), nullable=False)
    ssh_port = Column(Integer, default=22, nullable=False)
    status = Column(String(32), default="online", nullable=False)
    
    total_cpus = Column(Float, default=4.0, nullable=False)
    total_memory_mb = Column(Integer, default=8192, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    project = relationship("Project", back_populates="nodes")
    containers = relationship("Container", back_populates="node", cascade="all, delete-orphan")


class Container(Base):
    """
    Level 3: Isolated Docker environment inside a Node.
    Hardened OpenSSH, dedicated bridge network, cgroups CPU & RAM limits.
    STRICT SECURITY RULE: mounting /var/run/docker.sock is strictly forbidden.
    """
    __tablename__ = "containers"
    __table_args__ = (
        CheckConstraint("mount_docker_socket = FALSE", name="check_no_docker_socket_mounting"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id = Column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    docker_container_id = Column(String(128), nullable=True)
    image = Column(String(255), default="ubuntu:24.04", nullable=False)
    status = Column(Enum(ContainerStatusEnum), default=ContainerStatusEnum.PENDING, nullable=False)
    
    # Network Isolation
    network_name = Column(String(128), nullable=False)
    
    # SSH Access details
    ssh_host_port = Column(Integer, nullable=False)           # Mapped external port (e.g. 2222)
    ssh_internal_port = Column(Integer, default=22, nullable=False)
    ssh_user = Column(String(64), default="developer", nullable=False)
    ssh_public_key = Column(Text, nullable=False)
    
    # cgroups limits
    cpus_limit = Column(Float, default=1.0, nullable=False)
    memory_limit_mb = Column(Integer, default=1024, nullable=False)
    
    # Security Anti-Escape policy
    mount_docker_socket = Column(Boolean, default=False, nullable=False)
    no_new_privileges = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    stopped_at = Column(DateTime(timezone=True), nullable=True)

    node = relationship("Node", back_populates="containers")
    services = relationship("Service", back_populates="container", cascade="all, delete-orphan")


class Service(Base):
    """Level 4: Application process, API port, or daemon inside a container."""
    __tablename__ = "services"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_id = Column(UUID(as_uuid=True), ForeignKey("containers.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    internal_port = Column(Integer, nullable=False)
    host_port = Column(Integer, nullable=True)
    protocol = Column(String(16), default="http", nullable=False)
    config_json = Column(JSONB, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    container = relationship("Container", back_populates="services")


class Permission(Base):
    """
    Granular RBAC Permission table based on:
    (user_id, role, entity_type, entity_id, action)
    """
    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", "action", name="uq_user_entity_action"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(RoleEnum), nullable=False)
    entity_type = Column(Enum(EntityTypeEnum), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    action = Column(Enum(ActionEnum), default=ActionEnum.ALL, nullable=False)
    granted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="permissions")


# ---------------------------------------------------------------------- DTOs
class UserDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    name: str
    is_active: bool
    is_ai_assistant: bool


class ProjectCreateDTO(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    slug: str = Field(..., min_length=2, max_length=64)
    git_repo_url: Optional[str] = None
    git_provider: Optional[str] = "github"
    documentation_markdown: Optional[str] = ""


class ProjectDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    owner_id: uuid.UUID
    git_repo_url: Optional[str] = None
    git_provider: Optional[str] = "github"
    documentation_markdown: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContainerCreateDTO(BaseModel):
    node_id: uuid.UUID
    name: str = Field(..., min_length=2, max_length=128)
    image: str = "ubuntu:24.04"
    cpus_limit: float = Field(1.0, ge=0.1, le=64.0)
    memory_limit_mb: int = Field(1024, ge=128, le=262144)
    ssh_user: str = "developer"
    ssh_public_key: Optional[str] = None


class TermiusConnectionDTO(BaseModel):
    label: str
    address: str
    port: int
    username: str
    key_name: str


class ConnectionInfoDTO(BaseModel):
    container_id: uuid.UUID
    container_name: str
    host: str
    port: int
    user: str
    private_key: Optional[str] = None
    public_key: str
    termius: TermiusConnectionDTO
    ssh_config_snippet: str
    ssh_command: str
    security_isolation_summary: dict[str, Any]

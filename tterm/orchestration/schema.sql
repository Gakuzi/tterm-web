-- ============================================================================
-- Hierarchical Container Orchestration & Granular RBAC Database Schema
--
-- Hierarchy:
--   Level 1: projects    (Workspaces, Git Repositories, Documentation)
--   Level 2: nodes       (Physical Servers, VPS Machines)
--   Level 3: containers  (Isolated Docker environments with OpenSSH & cgroups)
--   Level 4: services    (Processes, Ports, Daemons inside Containers)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Users & AI Assistants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_ai_assistant BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- Level 1: Projects (Workspaces, Team, Git Integration, Documentation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                   VARCHAR(128) NOT NULL,
    slug                   VARCHAR(64) UNIQUE NOT NULL,
    owner_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    git_repo_url           VARCHAR(512),
    git_provider           VARCHAR(32) DEFAULT 'github' CHECK (git_provider IN ('github', 'gitea', 'gitlab', 'custom')),
    git_default_branch     VARCHAR(64) DEFAULT 'main',
    documentation_markdown TEXT NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- ----------------------------------------------------------------------------
-- Level 2: Nodes (Physical Servers / VPS attached to a project)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(128) NOT NULL,
    ip_address      VARCHAR(64) NOT NULL,
    ssh_host        VARCHAR(255) NOT NULL,
    ssh_port        INTEGER NOT NULL DEFAULT 22,
    status          VARCHAR(32) NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')),
    total_cpus      DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    total_memory_mb INTEGER NOT NULL DEFAULT 8192,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);

-- ----------------------------------------------------------------------------
-- Level 3: Containers (Isolated Docker environments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS containers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id             UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name                VARCHAR(128) NOT NULL,
    docker_container_id VARCHAR(128),
    image               VARCHAR(255) NOT NULL DEFAULT 'ubuntu:24.04',
    status              VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'stopped', 'failed')),
    network_name        VARCHAR(128) NOT NULL,
    
    -- SSH Port Forwarding
    ssh_host_port       INTEGER NOT NULL,
    ssh_internal_port   INTEGER NOT NULL DEFAULT 22,
    ssh_user            VARCHAR(64) NOT NULL DEFAULT 'developer',
    ssh_public_key      TEXT NOT NULL,
    
    -- cgroups limits
    cpus_limit          DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    memory_limit_mb     INTEGER NOT NULL DEFAULT 1024,
    
    -- Security Isolation: Hard constraint prohibiting Docker socket mounting
    mount_docker_socket BOOLEAN NOT NULL DEFAULT FALSE,
    no_new_privileges   BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    stopped_at          TIMESTAMPTZ,
    
    CONSTRAINT check_no_docker_socket_mounting CHECK (mount_docker_socket = FALSE)
);
CREATE INDEX IF NOT EXISTS idx_containers_node ON containers(node_id);
CREATE INDEX IF NOT EXISTS idx_containers_status ON containers(status);

-- ----------------------------------------------------------------------------
-- Level 4: Services (Processes / Internal API ports inside a Container)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    container_id  UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    name          VARCHAR(128) NOT NULL,
    internal_port INTEGER NOT NULL,
    host_port     INTEGER,
    protocol      VARCHAR(16) NOT NULL DEFAULT 'http' CHECK (protocol IN ('http', 'tcp', 'grpc')),
    config_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_services_container ON services(container_id);

-- ----------------------------------------------------------------------------
-- Granular RBAC Permissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(32) NOT NULL CHECK (role IN ('project_admin', 'node_admin', 'container_developer', 'service_operator')),
    entity_type VARCHAR(32) NOT NULL CHECK (entity_type IN ('project', 'node', 'container', 'service')),
    entity_id   UUID NOT NULL,
    action      VARCHAR(32) NOT NULL DEFAULT 'all' CHECK (action IN ('read', 'write', 'exec', 'config', 'restart', 'delete', 'manage', 'all')),
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_user_entity_action UNIQUE (user_id, entity_type, entity_id, action)
);
CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_entity ON permissions(entity_type, entity_id);

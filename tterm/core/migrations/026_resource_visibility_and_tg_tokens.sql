-- Granular multi-project resource visibility, container sandboxing, and persistent Telegram bind tokens

CREATE TABLE IF NOT EXISTS telegram_bind_tokens (
    token       text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    consumed    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS tg_bind_tokens_expires ON telegram_bind_tokens (expires_at);

CREATE TABLE IF NOT EXISTS machine_resource_visibility (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id     uuid NOT NULL REFERENCES machines (id) ON DELETE CASCADE,
    project_id     uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    resource_type  text NOT NULL CHECK (resource_type IN ('container', 'service', 'port')),
    resource_name  text NOT NULL,
    is_visible     boolean NOT NULL DEFAULT true,
    allowed_roles  text[] NOT NULL DEFAULT '{"owner", "admin", "member"}',
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (machine_id, project_id, resource_type, resource_name)
);
CREATE INDEX IF NOT EXISTS machine_res_vis_proj ON machine_resource_visibility (project_id, machine_id);

ALTER TABLE project_members ADD COLUMN IF NOT EXISTS scoped_containers text[];
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS scoped_services text[];

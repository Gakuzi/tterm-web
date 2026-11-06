-- 023_project_invites.sql: Persistent link invitations for project collaboration and terminal access
CREATE TABLE IF NOT EXISTS project_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'observer')),
    max_uses INTEGER DEFAULT NULL,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    allowed_terminals JSONB DEFAULT '["*"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_invites_token ON project_invites(token);
CREATE INDEX IF NOT EXISTS idx_project_invites_project ON project_invites(project_id);

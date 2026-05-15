CREATE TABLE IF NOT EXISTS agent_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  files JSONB DEFAULT '{}'::jsonb,
  source_archive_base64 TEXT,
  source_archive_path TEXT,
  source_archive_provider TEXT,
  source_archive_size BIGINT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_projects_user ON agent_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_projects_org ON agent_projects(organization_id);

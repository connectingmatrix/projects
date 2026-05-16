create table if not exists ai_agent_app_deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid null,
  project_id uuid null,
  user_id uuid null,
  organization_id uuid null,
  chat_id uuid null,
  workflow_id uuid null,
  run_id text null,
  provider text not null default 'giga-static-host',
  status text not null default 'created',
  app_name text not null,
  app_slug text not null,
  build_id text not null,
  deployment_path text not null,
  live_url text null,
  health_url text null,
  manifest_url text null,
  entry_file text not null default 'index.html',
  manifest jsonb not null default '{}'::jsonb,
  health jsonb not null default '{}'::jsonb,
  inspection jsonb not null default '{}'::jsonb,
  files_count integer not null default 0,
  size_bytes bigint not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_agent_app_deployments_user on ai_agent_app_deployments(user_id, created_at desc);
create index if not exists idx_ai_agent_app_deployments_org on ai_agent_app_deployments(organization_id, created_at desc);
create index if not exists idx_ai_agent_app_deployments_chat on ai_agent_app_deployments(chat_id, created_at desc);
create index if not exists idx_ai_agent_app_deployments_status on ai_agent_app_deployments(status, created_at desc);
create unique index if not exists idx_ai_agent_app_deployments_build on ai_agent_app_deployments(build_id);

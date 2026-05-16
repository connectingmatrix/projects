import { ENTITY, FIELD, GigaEntity } from '@connectingmatrix/orm/orm/giga-orm-v2';

export type AIAgentAppDeploymentRow = {
  id: string;
  app_id?: string | null;
  project_id?: string | null;
  user_id?: string | null;
  organization_id?: string | null;
  chat_id?: string | null;
  workflow_id?: string | null;
  run_id?: string | null;
  provider: string;
  status: string;
  app_name: string;
  app_slug: string;
  build_id: string;
  deployment_path: string;
  live_url?: string | null;
  health_url?: string | null;
  manifest_url?: string | null;
  entry_file: string;
  manifest: Record<string, unknown>;
  health: Record<string, unknown>;
  inspection: Record<string, unknown>;
  files_count: number;
  size_bytes: number;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_agent_app_deployments', label: 'AIAgentAppDeployment', primaryKey: 'id', store: 'supabase' })
export class AIAgentAppDeploymentEntity extends GigaEntity<AIAgentAppDeploymentRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string;

  @FIELD({ type: 'string', index: true }) public declare app_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare project_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare user_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare chat_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare workflow_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare run_id: string | null;

  @FIELD({ type: 'string', required: true }) public declare provider: string;

  @FIELD({ type: 'string', required: true, index: true }) public declare status: string;

  @FIELD({ type: 'string', required: true }) public declare app_name: string;

  @FIELD({ type: 'string', required: true, index: true }) public declare app_slug: string;

  @FIELD({ type: 'string', required: true, index: true, unique: true }) public declare build_id: string;

  @FIELD({ type: 'string', required: true }) public declare deployment_path: string;

  @FIELD({ type: 'string' }) public declare live_url: string | null;

  @FIELD({ type: 'string' }) public declare health_url: string | null;

  @FIELD({ type: 'string' }) public declare manifest_url: string | null;

  @FIELD({ type: 'string', default: 'index.html' }) public declare entry_file: string;

  @FIELD({ type: 'json', default: {} }) public declare manifest: Record<string, unknown>;

  @FIELD({ type: 'json', default: {} }) public declare health: Record<string, unknown>;

  @FIELD({ type: 'json', default: {} }) public declare inspection: Record<string, unknown>;

  @FIELD({ type: 'number', default: 0 }) public declare files_count: number;

  @FIELD({ type: 'number', default: 0 }) public declare size_bytes: number;

  @FIELD({ type: 'string' }) public declare created_by: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;
}

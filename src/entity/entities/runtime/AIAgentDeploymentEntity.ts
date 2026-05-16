import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';

export type AIAgentDeploymentRow = {
  id: string;
  project_id: string;
  agent_id?: string | null;
  deployment_kind?: string | null;
  status?: string | null;
  url?: string | null;
  local_runner_id?: string | null;
  build_log?: Array<Record<string, unknown>> | null;
  runtime_state?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_agent_deployments', label: 'AIAgentDeployment', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'AI_AGENT_DEPLOYMENT_READ',
  list: 'AI_AGENT_DEPLOYMENT_LIST',
  create: 'AI_AGENT_DEPLOYMENT_CREATE',
  update: 'AI_AGENT_DEPLOYMENT_UPDATE',
  delete: 'AI_AGENT_DEPLOYMENT_DELETE',
})
export class AIAgentDeploymentEntity extends Entity<AIAgentDeploymentRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare project_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare agent_id: string | null;

  @FIELD({ type: 'string', required: true, default: 'sandbox' }) public declare deployment_kind: string | null;

  @FIELD({ type: 'string', required: true, default: 'queued' }) public declare status: string | null;

  @FIELD({ type: 'string' }) public declare url: string | null;

  @FIELD({ type: 'string', index: true }) public declare local_runner_id: string | null;

  @FIELD({ type: 'array', default: [] }) public declare build_log: Array<Record<string, unknown>> | null;

  @FIELD({ type: 'object', default: {} }) public declare runtime_state: Record<string, unknown> | null;

  @FIELD({ type: 'string', index: true }) public declare created_by: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;
}

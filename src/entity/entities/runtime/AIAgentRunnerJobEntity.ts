import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';

export type AIAgentRunnerJobRow = {
  id: string;
  runner_host_id: string;
  project_id?: string | null;
  job_kind?: string | null;
  status?: string | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  logs?: Array<Record<string, unknown>> | null;
  risk?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

@ENTITY({ table: 'ai_agent_runner_jobs', label: 'AIAgentRunnerJob', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'AI_AGENT_RUNNER_JOB_READ',
  list: 'AI_AGENT_RUNNER_JOB_LIST',
  create: 'AI_AGENT_RUNNER_JOB_CREATE',
  update: 'AI_AGENT_RUNNER_JOB_UPDATE',
  delete: 'AI_AGENT_RUNNER_JOB_DELETE',
})
export class AIAgentRunnerJobEntity extends Entity<AIAgentRunnerJobRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare runner_host_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare project_id: string | null;

  @FIELD({ type: 'string', required: true, default: 'command' }) public declare job_kind: string | null;

  @FIELD({ type: 'string', required: true, default: 'waiting_for_approval' }) public declare status: string | null;

  @FIELD({ type: 'object', default: {} }) public declare input: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare output: Record<string, unknown> | null;

  @FIELD({ type: 'array', default: [] }) public declare logs: Array<Record<string, unknown>> | null;

  @FIELD({ type: 'string', default: 'local-computer' }) public declare risk: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  @FIELD({ type: 'string' }) public declare started_at: string | null;

  @FIELD({ type: 'string' }) public declare completed_at: string | null;
}

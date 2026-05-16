import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';

export type AIAgentRunnerHostRow = {
  id: string;
  owner_type?: string | null;
  owner_id?: string | null;
  organization_id?: string | null;
  host_name: string;
  status?: string | null;
  port?: number | null;
  pairing_token_hash?: string | null;
  capabilities?: Record<string, unknown> | null;
  last_seen_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_agent_runner_hosts', label: 'AIAgentRunnerHost', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'AI_AGENT_RUNNER_HOST_READ',
  list: 'AI_AGENT_RUNNER_HOST_LIST',
  create: 'AI_AGENT_RUNNER_HOST_CREATE',
  update: 'AI_AGENT_RUNNER_HOST_UPDATE',
  delete: 'AI_AGENT_RUNNER_HOST_DELETE',
})
export class AIAgentRunnerHostEntity extends Entity<AIAgentRunnerHostRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true, default: 'user' }) public declare owner_type: string | null;

  @FIELD({ type: 'string', index: true }) public declare owner_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string', required: true }) public declare host_name: string | null;

  @FIELD({ type: 'string', required: true, default: 'pairing' }) public declare status: string | null;

  @FIELD({ type: 'number' }) public declare port: number | null;

  @FIELD({ type: 'string' }) public declare pairing_token_hash: string | null;

  @FIELD({ type: 'object', default: {} }) public declare capabilities: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare last_seen_at: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;
}

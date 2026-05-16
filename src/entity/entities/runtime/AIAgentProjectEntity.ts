import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';

export type AIAgentProjectRow = {
  id: string;
  agent_id?: string | null;
  owner_type?: string | null;
  owner_id?: string | null;
  organization_id?: string | null;
  chat_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  project_kind?: string | null;
  status?: string | null;
  stack?: Record<string, unknown> | null;
  architecture?: Record<string, unknown> | null;
  files?: Array<Record<string, unknown>> | null;
  database_manifest?: Record<string, unknown> | null;
  runtime_manifest?: Record<string, unknown> | null;
  last_run?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  source_archive_bucket?: string | null;
  source_archive_path?: string | null;
  source_archive_sha256?: string | null;
  source_archive_bytes?: number | null;
  source_archive_encoding?: string | null;
  source_archive_base64?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_agent_projects', label: 'AIAgentProject', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'AI_AGENT_PROJECT_READ',
  list: 'AI_AGENT_PROJECT_LIST',
  create: 'AI_AGENT_PROJECT_CREATE',
  update: 'AI_AGENT_PROJECT_UPDATE',
  delete: 'AI_AGENT_PROJECT_DELETE',
})
export class AIAgentProjectEntity extends Entity<AIAgentProjectRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', index: true }) public declare agent_id: string | null;

  @FIELD({ type: 'string', required: true, index: true, default: 'user' }) public declare owner_type: string | null;

  @FIELD({ type: 'string', index: true }) public declare owner_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare chat_id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare name: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare slug: string | null;

  @FIELD({ type: 'string' }) public declare description: string | null;

  @FIELD({ type: 'string' }) public declare project_kind: string | null;

  @FIELD({ type: 'string', default: 'draft' }) public declare status: string | null;

  @FIELD({ type: 'object', default: {} }) public declare stack: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare architecture: Record<string, unknown> | null;

  @FIELD({ type: 'array', default: [] }) public declare files: Array<Record<string, unknown>> | null;

  @FIELD({ type: 'object', default: {} }) public declare database_manifest: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare runtime_manifest: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare last_run: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare source_archive_bucket: string | null;

  @FIELD({ type: 'string' }) public declare source_archive_path: string | null;

  @FIELD({ type: 'string' }) public declare source_archive_sha256: string | null;

  @FIELD({ type: 'number' }) public declare source_archive_bytes: number | null;

  @FIELD({ type: 'string' }) public declare source_archive_encoding: string | null;

  @FIELD({ type: 'string' }) public declare source_archive_base64: string | null;

  @FIELD({ type: 'string', index: true }) public declare created_by: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;
}

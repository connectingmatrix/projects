import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm';

export type SharedSpaceCatalogRow = {
  id: string;
  scope_type?: string | null;
  user_id?: string | null;
  organization_id?: string | null;
  name?: string | null;
  slug?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'shared_spaces', label: 'SharedSpaceCatalog', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'SHARED_SPACE_READ',
  list: 'SHARED_SPACE_LIST',
  create: 'SHARED_SPACE_CREATE',
  update: 'SHARED_SPACE_UPDATE',
  delete: 'SHARED_SPACE_DELETE',
})
export class SharedSpaceCatalogEntity extends Entity<SharedSpaceCatalogRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string' }) public declare scope_type: string | null;

  @FIELD({ type: 'string', index: true }) public declare user_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string' }) public declare name: string | null;

  @FIELD({ type: 'string' }) public declare slug: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_by: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  protected async preCommit(row: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString();
    row.created_at ??= now;
    row.updated_at ??= now;
  }

  protected async preUpdate(row: Record<string, unknown>): Promise<void> {
    row.updated_at = new Date().toISOString();
  }
}

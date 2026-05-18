import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm';

export type BookmarkTargetType = 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST';

export type BookmarkRow = {
  id: string;
  user_id: string;
  target_type: BookmarkTargetType;
  target_id: string;
  channel_id?: string | null;
  category_id?: string | null;
  subject_id?: string | null;
  post_id?: string | null;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_bookmarks', label: 'Bookmark', store: 'supabase', primaryKey: 'id', scoped: true })
@PERMISSIONS({ read: 'BOOKMARK_READ', list: 'BOOKMARK_LIST', create: 'BOOKMARK_CREATE', delete: 'BOOKMARK_DELETE' })
export class BookmarkEntity extends Entity<BookmarkRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare user_id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare target_type: BookmarkTargetType | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare target_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare channel_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare category_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare subject_id: string | null;

  @FIELD({ type: 'string', index: true }) public declare post_id: string | null;

  @FIELD({ type: 'string', required: true }) public declare name: string | null;

  @FIELD({ type: 'string' }) public declare description: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;
}

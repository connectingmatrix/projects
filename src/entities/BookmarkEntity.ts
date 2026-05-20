import { ENTITY, FIELD, PERMISSIONS, Entity, GigaORM, Row } from '@connectingmatrix/orm';

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

const bookmarkTargetTypes: readonly BookmarkTargetType[] = ['CHANNEL', 'CATEGORY', 'SUBJECT', 'POST'];

const text = (value: unknown): string => String(value ?? '').trim();
const nullableText = (value: unknown): string | null => text(value) || null;
const currentUserId = (): string | null => text(GigaORM.requestContext()?.user_id) || null;

@ENTITY({ table: 'ai_bookmarks', label: 'Bookmark', store: 'supabase', primaryKey: 'id', scoped: true })
@PERMISSIONS({ read: 'BOOKMARK_READ', list: 'BOOKMARK_LIST', create: 'BOOKMARK_CREATE', delete: 'BOOKMARK_DELETE' })
export class BookmarkEntity extends Entity<BookmarkRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true, default: currentUserId }) public declare user_id: string | null;

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

  protected async preCommit(row: Row): Promise<void> {
    row.user_id = nullableText(row.user_id);
    if (!row.user_id) throw new Error('Bookmark user_id is required.');

    const targetType = text(row.target_type).toUpperCase() as BookmarkTargetType;
    if (!bookmarkTargetTypes.includes(targetType)) throw new Error('Bookmark target_type must be CHANNEL, CATEGORY, SUBJECT, or POST.');
    row.target_type = targetType;

    const targetId = nullableText(row.target_id);
    if (!targetId) throw new Error('Bookmark target_id is required.');
    row.target_id = targetId;

    row.channel_id = nullableText(row.channel_id);
    row.category_id = nullableText(row.category_id);
    row.subject_id = nullableText(row.subject_id);
    row.post_id = nullableText(row.post_id);

    row.name = text(row.name);
    if (!row.name) throw new Error('Bookmark name is required.');

    if (targetType === 'CHANNEL' && row.channel_id !== targetId) throw new Error('CHANNEL bookmark requires channel_id to match target_id.');
    if (targetType === 'CATEGORY' && (!row.channel_id || row.category_id !== targetId)) {
      throw new Error('CATEGORY bookmark requires channel_id and matching category_id.');
    }
    if (targetType === 'SUBJECT' && (!row.channel_id || !row.category_id || row.subject_id !== targetId)) {
      throw new Error('SUBJECT bookmark requires channel_id, category_id, and matching subject_id.');
    }
    if (targetType === 'POST' && (!row.channel_id || !row.category_id || !row.subject_id || row.post_id !== targetId)) {
      throw new Error('POST bookmark requires channel_id, category_id, subject_id, and matching post_id.');
    }
  }
}

import { ENTITY, FIELD, RELATION, PERMISSIONS, Entity, Relation } from '@connectingmatrix/orm';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import type { AttachmentEntity, AttachmentRow, ChunkEntity } from '@connectingmatrix/file-service/entities';

export type PostRow = {
  id: string;
  subject_id: string;
  title: string;
  narrative?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PostWithAttachmentsRow = PostRow & { ai_attachments: AttachmentRow[] };

@ENTITY({ table: 'ai_posts', label: 'Post', store: 'supabase', primaryKey: 'id', scoped: true })
@PERMISSIONS({
  read: 'POST_READ',
  list: 'POST_LIST',
  create: 'POST_CREATE',
  update: 'POST_UPDATE',
  delete: 'POST_DELETE',
  relations: {
    attachments: { list: 'ATTACHMENT_LIST', create: 'ATTACHMENT_CREATE' },
    chunks: { list: 'CHUNK_LIST', create: 'CHUNK_CREATE' },
  },
})
export class PostEntity extends Entity<PostRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare subject_id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare title: string | null;

  @FIELD({ type: 'string' }) public declare narrative: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  @RELATION({
    target: 'Attachment',
    relation: 'HAS_ATTACHMENT',
    store: 'supabase',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', childField: 'post_id' },
  })
  public declare attachments: Relation<AttachmentEntity>;

  @RELATION({
    target: 'Chunk',
    relation: 'HAS_CHUNK',
    store: 'supabase',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', childField: 'post_id' },
  })
  public declare chunks: Relation<ChunkEntity>;

  public static async listIdsBySubjectIds(subjectIds: string[]): Promise<Array<{ id: string }>> {
    const ids = subjectIds.map((value) => String(value || '').trim()).filter(Boolean);
    if (!ids.length) return [];
    const rows = await this.find().whereIn('subject_id', ids).select('id').many();
    return rows.map((row) => ({ id: String(row.id || '') })).filter((row) => Boolean(row.id));
  }

  public static async listIdsBySubjectId(subjectId: string): Promise<Array<{ id: string }>> {
    const id = String(subjectId || '').trim();
    if (!id) return [];
    const rows = await this.find({ subject_id: id }).select('id').many();
    return rows.map((row) => ({ id: String(row.id || '') })).filter((row) => Boolean(row.id));
  }

  public static async readScopeRow(id: string): Promise<Record<string, unknown> | null> {
    const row = await this.single(String(id || '').trim());
    return row ? (row.payload as Record<string, unknown>) : null;
  }

  public static async findBySubjectAndTitle(subjectId: string, title: string): Promise<PostWithAttachmentsRow | null> {
    if (!subjectId || !title) return null;
    const post = await this.find({ subject_id: subjectId, title }, { limit: 1 }).single();
    if (!post) return null;
    const attachments = await post.attachments.list(undefined, { orderBy: 'created_at', ascending: true });
    return {
      ...(post.extract() as PostRow),
      ai_attachments: attachments.map((attachment) => attachment.extract() as AttachmentRow),
    };
  }

  public static async countScoped(input: { userId: string; organizationId?: string | null }): Promise<number> {
    const subjectIds = await TreeGraphEntity.readScopedSubjectIds(input);
    if (!subjectIds.length) return 0;
    return this.find().whereIn('subject_id', subjectIds).count();
  }

  public static async listIdRowsByTitle(title: string): Promise<Array<{ id: string; title: string; subject_id: string }>> {
    if (!title) return [];
    const rows = await this.find().whereLike('title', `%${title}%`).select('id,title,subject_id').many();
    return rows
      .map((row) => row.extract() as PostRow)
      .map((row) => ({ id: String(row.id || ''), title: String(row.title || ''), subject_id: String(row.subject_id || '') }))
      .filter((row) => Boolean(row.id && row.subject_id));
  }

  public static async listContextPosts(input: { postIds?: string[] | null; subjectIds?: string[] | null; limit?: number }): Promise<PostRow[]> {
    let query = this.find()
      .orderBy('updated_at', 'desc')
      .limit(Math.max(1, Number(input.limit || 20)));
    const postIds = (input.postIds || []).map((value) => String(value || '').trim()).filter(Boolean);
    const subjectIds = (input.subjectIds || []).map((value) => String(value || '').trim()).filter(Boolean);
    if (postIds.length) query = query.whereIn('id', postIds);
    if (subjectIds.length) query = query.whereIn('subject_id', subjectIds);
    return (await query.many()).map((row) => row.extract() as PostRow);
  }

  public static async countBySubjectIds(subjectIds: string[]): Promise<Record<string, number>> {
    const ids = subjectIds.map((value) => String(value || '').trim()).filter(Boolean);
    if (!ids.length) return {};
    const rows = await this.find().whereIn('subject_id', ids).select('subject_id').many();
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    for (const row of rows) {
      const subjectId = String(row.subject_id || '').trim();
      if (!subjectId) continue;
      counts[subjectId] = (counts[subjectId] || 0) + 1;
    }
    return counts;
  }

  public static async deleteByIdPrefix(prefix: string): Promise<number> {
    if (!prefix) return 0;
    const rows = await this.find().whereLike('id', `${prefix}%`).select('id').many();
    const ids = rows.map((row) => String(row.id || '')).filter(Boolean);
    if (!ids.length) return 0;
    await this.deleteMany({ in: { id: ids } });
    return ids.length;
  }

  public static async deleteByMetadataContains(match: Record<string, unknown>): Promise<number> {
    const rows = await this.find({ metadata: match }).select('id').many();
    const ids = rows.map((row) => String(row.id || '')).filter(Boolean);
    if (!ids.length) return 0;
    await this.deleteMany({ in: { id: ids } });
    return ids.length;
  }

  public static async ensureKnowledgePosts(subjectId: string, posts: Array<Record<string, unknown>>): Promise<PostRow[]> {
    const created: PostRow[] = [];
    for (const post of posts || []) {
      const title = String(post.title || '').trim();
      if (!title) continue;
      const existing = await this.findBySubjectAndTitle(subjectId, title);
      if (existing) {
        created.push(existing);
        continue;
      }
      const row = await this.create({
        subject_id: subjectId,
        title,
        narrative: typeof post.narrative === 'string' ? post.narrative : null,
        metadata: (post.metadata as Record<string, unknown>) || null,
      });
      created.push(row.extract() as PostRow);
    }
    return created;
  }
}

export const Post = PostEntity;

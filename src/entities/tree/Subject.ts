import { ENTITY, FIELD, NEO, RELATION, NEO_RELATION, PERMISSIONS, Entity, Relation, Row } from '@connectingmatrix/orm';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import type { ChunkEntity } from '@connectingmatrix/file-service/entities';
import type { PostEntity } from './Post';
import type { TagEntity } from '../TagEntity';
import type { ResolvedSubjectFilter } from '@gigav2/types/graphql.types';

export type SubjectRow = {
  id: string;
  supabaseId?: string | null;
  createdBy?: string | null;
  organizationId?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  summary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'ai_subjects', label: 'SubjectRef', store: 'dual', primaryKey: 'id', scoped: true, graph: { mirror: true, label: 'SubjectRef' } })
@PERMISSIONS({
  read: 'SUBJECT_READ',
  list: 'SUBJECT_LIST',
  create: 'SUBJECT_CREATE',
  update: 'SUBJECT_UPDATE',
  delete: 'SUBJECT_DELETE',
  relations: {
    subjects: { list: 'SUBJECT_LIST', create: 'SUBJECT_CREATE', attach: 'SUBJECT_ATTACH', detach: 'SUBJECT_DETACH' },
    posts: { list: 'POST_LIST', create: 'POST_CREATE' },
    tags: { list: 'TAG_LIST', attach: 'TAG_ATTACH', detach: 'TAG_DETACH' },
    chunks: { list: 'CHUNK_LIST', create: 'CHUNK_CREATE' },
  },
})
export class SubjectEntity extends Entity<SubjectRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @NEO({ type: 'string', index: true }) public declare supabaseId: string | null;

  @NEO({ type: 'string', index: true }) public declare createdBy: string | null;

  @NEO({ type: 'string', index: true }) public declare organizationId: string | null;

  @FIELD({ type: 'string', index: true }) public declare name: string | null;

  @FIELD({ type: 'string', index: true, uniqueByOwner: true }) public declare slug: string | null;

  @FIELD({ type: 'string' }) public declare description: string | null;

  @FIELD({ type: 'object' }) public declare summary: Record<string, unknown> | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @NEO({ type: 'string' }) public declare createdAt: string | null;

  @NEO({ type: 'string' }) public declare updatedAt: string | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  @NEO_RELATION({
    target: 'SubjectRef',
    relation: 'CONTAINS_SUBJECT',
    store: 'dual',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', inherit: ['createdBy', 'organizationId'], unique: ['createdBy', 'organizationId', 'slug'] },
    graph: { edge: true, assertCycle: true },
  })
  public declare subjects: Relation<SubjectEntity>;

  @RELATION({
    target: 'Post',
    relation: 'HAS_POST',
    store: 'supabase',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', childField: 'subject_id' },
  })
  public declare posts: Relation<PostEntity>;

  @RELATION({
    target: 'Tag',
    relation: 'HAS_TAG',
    store: 'supabase',
    many: true,
    owner: { join: { table: 'ai_subject_tags', sourceField: 'subject_id', targetField: 'tag_id' } },
  })
  public declare tags: Relation<TagEntity>;

  @RELATION({
    target: 'Chunk',
    relation: 'HAS_CHUNK',
    store: 'supabase',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', childField: 'subject_id' },
  })
  public declare chunks: Relation<ChunkEntity>;

  protected async preCommit(row: Row): Promise<void> {
    const now = new Date().toISOString();
    row.created_at ??= now;
    row.updated_at ??= now;
  }

  public static async readScopeRow(id: string): Promise<Record<string, unknown> | null> {
    const row = await this.single(String(id || '').trim());
    return row ? (row.payload as Record<string, unknown>) : null;
  }

  public static async findByIds(ids: string[]): Promise<Array<{ id: string }>> {
    const normalized = ids.map((value) => String(value || '').trim()).filter(Boolean);
    if (!normalized.length) return [];
    const rows = await this.find().whereIn('id', normalized).select('id').many();
    return rows.map((row) => ({ id: String(row.id || '') })).filter((row) => Boolean(row.id));
  }

  public static async searchIdsByQuery(query: string): Promise<Array<{ id: string }>> {
    const normalized = String(query || '').trim();
    if (!normalized) return [];
    const rows = await this.find().whereIlike('name', `%${normalized}%`).select('id').many();
    return rows.map((row) => ({ id: String(row.id || '') })).filter((row) => Boolean(row.id));
  }

  public static readScopedIds(input: { userId: string; organizationId?: string | null }) {
    return TreeGraphEntity.readScopedSubjectIds(input);
  }

  public static countScoped(input: { userId: string; organizationId?: string | null }) {
    return TreeGraphEntity.readScopedSubjectCount(input);
  }

  public static async resolveIds(input: {
    supabase: unknown;
    subjectId?: string | null;
    subjectIds?: string[] | null;
    tagSlugs?: string[] | null;
    subjectQuery?: string | null;
  }): Promise<ResolvedSubjectFilter> {
    const module = await import('@gigav2/services/giga/tree/subject/filter');
    return module.resolveSubjectIds(input.supabase, {
      subjectId: input.subjectId || undefined,
      subjectIds: input.subjectIds || undefined,
      tagSlugs: input.tagSlugs || undefined,
      subjectQuery: input.subjectQuery || undefined,
    });
  }

  public static resolveFilter(input: {
    supabase: unknown;
    subjectId?: string | null;
    subjectIds?: string[] | null;
    tagSlugs?: string[] | null;
    subjectQuery?: string | null;
  }): Promise<ResolvedSubjectFilter> {
    return this.resolveIds(input);
  }
}

export const Subject = SubjectEntity;

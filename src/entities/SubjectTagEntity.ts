import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm';

export type SubjectTagRow = {
  subject_id: string;
  tag_id: number;
};

@ENTITY({ table: 'ai_subject_tags', label: 'SubjectTag', store: 'supabase', primaryKey: ['subject_id', 'tag_id'] })
@PERMISSIONS({ read: 'SUBJECT_TAG_READ', create: 'SUBJECT_TAG_CREATE', delete: 'SUBJECT_TAG_DELETE' })
export class SubjectTagEntity extends Entity<SubjectTagRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare subject_id: string | null;

  @FIELD({ type: 'number', required: true, index: true }) public declare tag_id: number | null;

  public static async findByTagIds(tagIds: number[]): Promise<SubjectTagEntity[]> {
    const values = tagIds.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (!values.length) return [];
    return this.find().whereIn('tag_id', values).many();
  }

  public static async findSubjectIdsByTagIds(tagIds: number[]): Promise<Array<{ subject_id: string }>> {
    const rows = await this.findByTagIds(tagIds);
    return rows.map((row) => ({ subject_id: String(row.subject_id || '') })).filter((row) => Boolean(row.subject_id));
  }

  public static async findBySubjectIdAndTagIds(subjectId: string, tagIds: number[]): Promise<SubjectTagEntity[]> {
    const normalizedSubjectId = String(subjectId || '').trim();
    if (!normalizedSubjectId) return [];
    const values = tagIds.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (!values.length) return [];
    return this.find({ subject_id: normalizedSubjectId }).whereIn('tag_id', values).many();
  }

  public static async findBySubjectId(subjectId: string): Promise<SubjectTagEntity[]> {
    const normalizedSubjectId = String(subjectId || '').trim();
    if (!normalizedSubjectId) return [];
    return this.find({ subject_id: normalizedSubjectId }).many();
  }

  public static async findBySubjectIds(subjectIds: string[]): Promise<SubjectTagEntity[]> {
    const ids = subjectIds.map((value) => String(value || '').trim()).filter(Boolean);
    if (!ids.length) return [];
    return this.find().whereIn('subject_id', ids).many();
  }
}

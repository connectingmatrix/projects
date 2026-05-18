import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm';

export type TagRow = {
  id?: number;
  name: string;
  slug: string;
};

@ENTITY({ table: 'ai_tags', label: 'Tag', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({ read: 'TAG_READ', list: 'TAG_LIST', create: 'TAG_CREATE', update: 'TAG_UPDATE', delete: 'TAG_DELETE' })
export class TagEntity extends Entity<TagRow> {
  @FIELD({ type: 'number', required: true, index: true }) public declare id: number | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare name: string | null;

  @FIELD({ type: 'string', required: true, index: true, unique: true }) public declare slug: string | null;

  public static async findBySlugs(slugs: string[]): Promise<TagEntity[]> {
    const values = slugs
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (!values.length) return [];
    return this.find().whereIn('slug', values).many();
  }

  public static async findIdsBySlugs(slugs: string[]): Promise<number[]> {
    const rows = await this.findBySlugs(slugs);
    return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  }
}

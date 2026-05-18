import { ENTITY, NEO, NEO_RELATION, PERMISSIONS, Entity, Relation, Row } from '@connectingmatrix/orm';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import { deleteAiCategoryBranch } from '@gigav2/services/giga/tree/deleteOwnedBranch';
import type { SubjectEntity } from './Subject';

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  createdBy?: string | null;
  organizationId?: string | null;
  image?: string | null;
  status?: string | null;
  categoryRatingId?: string | null;
  description?: string | null;
  isGlobal?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

@ENTITY({ label: 'Category', store: 'neo4j', primaryKey: 'id', scoped: true })
@PERMISSIONS({
  read: 'CATEGORY_READ',
  list: 'CATEGORY_LIST',
  create: 'CATEGORY_CREATE',
  update: 'CATEGORY_UPDATE',
  delete: 'CATEGORY_DELETE',
  relations: {
    categories: { list: 'CATEGORY_LIST', create: 'CATEGORY_CREATE', attach: 'CATEGORY_ATTACH', detach: 'CATEGORY_DETACH' },
    subjects: { list: 'SUBJECT_LIST', create: 'SUBJECT_CREATE', attach: 'SUBJECT_ATTACH', detach: 'SUBJECT_DETACH' },
  },
})
export class CategoryEntity extends Entity<CategoryRow> {
  @NEO({ type: 'string', required: true, index: true }) public declare id: string | null;

  @NEO({ type: 'string', required: true, index: true }) public declare name: string | null;

  @NEO({ type: 'string', required: true, index: true, uniqueByOwner: true }) public declare slug: string | null;

  @NEO({ type: 'string', index: true }) public declare createdBy: string | null;

  @NEO({ type: 'string', index: true }) public declare organizationId: string | null;

  @NEO({ type: 'string' }) public declare image: string | null;

  @NEO({ type: 'string' }) public declare status: string | null;

  @NEO({ type: 'string' }) public declare categoryRatingId: string | null;

  @NEO({ type: 'string' }) public declare description: string | null;

  @NEO({ type: 'boolean', index: true }) public declare isGlobal: boolean | null;

  @NEO({ type: 'string' }) public declare createdAt: string | null;

  @NEO({ type: 'string' }) public declare updatedAt: string | null;

  @NEO_RELATION({
    target: 'Category',
    relation: 'CONTAINS_CATEGORY',
    store: 'neo4j',
    many: true,
    owner: {
      scope: 'inherit',
      parentField: 'id',
      inherit: ['createdBy', 'organizationId', 'isGlobal'],
      unique: ['createdBy', 'organizationId', 'isGlobal', 'slug'],
    },
    graph: { edge: true, assertCycle: true },
  })
  public declare categories: Relation<CategoryEntity>;

  @NEO_RELATION({
    target: 'SubjectRef',
    relation: 'CONTAINS_SUBJECT',
    store: 'dual',
    many: true,
    owner: { scope: 'inherit', parentField: 'id', inherit: ['createdBy', 'organizationId'] },
    graph: { edge: true, assertCycle: true },
  })
  public declare subjects: Relation<SubjectEntity>;

  protected async preCommit(row: Row): Promise<void> {
    const now = new Date().toISOString();
    row.createdAt ??= now;
    row.updatedAt ??= now;
  }

  public static readOrganizationScopeRows(input: { id: string; organizationId: string }) {
    return TreeGraphEntity.readOrganizationScopeRows({ scopeType: 'category', id: input.id, organizationId: input.organizationId });
  }

  public async deleteOwnedBranch(input: { supabase: any; userPermissionsId: string }) {
    return deleteAiCategoryBranch(input.supabase, { categoryId: String(this.id || ''), userPermissionsId: input.userPermissionsId });
  }
}

export const Category = CategoryEntity;

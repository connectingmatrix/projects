import { ENTITY, NEO, NEO_RELATION, PERMISSIONS, Entity, Relation, Row } from '@connectingmatrix/orm';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import { deleteAiChannelBranch } from '@gigav2/services/giga/tree/deleteOwnedBranch';
import type { CategoryEntity } from './Category';

export type ChannelRow = {
  id: string;
  name: string;
  slug: string;
  createdBy?: string | null;
  organizationId?: string | null;
  image?: string | null;
  status?: string | null;
  description?: string | null;
  isGlobal?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

@ENTITY({ label: 'Channel', store: 'neo4j', primaryKey: 'id', scoped: true })
@PERMISSIONS({
  read: 'CHANNEL_READ',
  list: 'CHANNEL_LIST',
  create: 'CHANNEL_CREATE',
  update: 'CHANNEL_UPDATE',
  delete: 'CHANNEL_DELETE',
  relations: {
    children: { list: 'CHANNEL_LIST', create: 'CHANNEL_CREATE', attach: 'CHANNEL_ATTACH', detach: 'CHANNEL_DETACH' },
    categories: { list: 'CATEGORY_LIST', create: 'CATEGORY_CREATE', attach: 'CATEGORY_ATTACH', detach: 'CATEGORY_DETACH' },
  },
})
export class ChannelEntity extends Entity<ChannelRow> {
  @NEO({ type: 'string', required: true, index: true }) public declare id: string | null;

  @NEO({ type: 'string', required: true, index: true }) public declare name: string | null;

  @NEO({ type: 'string', required: true, index: true, uniqueByOwner: true }) public declare slug: string | null;

  @NEO({ type: 'string', index: true }) public declare createdBy: string | null;

  @NEO({ type: 'string', index: true }) public declare organizationId: string | null;

  @NEO({ type: 'string' }) public declare image: string | null;

  @NEO({ type: 'string' }) public declare status: string | null;

  @NEO({ type: 'string' }) public declare description: string | null;

  @NEO({ type: 'boolean', index: true }) public declare isGlobal: boolean | null;

  @NEO({ type: 'string' }) public declare createdAt: string | null;

  @NEO({ type: 'string' }) public declare updatedAt: string | null;

  @NEO_RELATION({
    target: 'Channel',
    relation: 'CONTAINS_CHANNEL',
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
  public declare children: Relation<ChannelEntity>;

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

  protected async preCommit(row: Row): Promise<void> {
    const now = new Date().toISOString();
    row.createdAt ??= now;
    row.updatedAt ??= now;
  }

  public static readScopeWhere(organizationId?: string | null) {
    return TreeGraphEntity.readScopeWhere(organizationId);
  }

  public static readOrganizationScopeRows(input: { id: string; organizationId: string }) {
    return TreeGraphEntity.readOrganizationScopeRows({ scopeType: 'channel', id: input.id, organizationId: input.organizationId });
  }

  public static countScoped(input: { userId: string; organizationId?: string | null }) {
    return TreeGraphEntity.readScopedChannelCount(input);
  }

  public static countScopedLinks(input: { userId: string; organizationId?: string | null }) {
    return TreeGraphEntity.readScopedLinkCount(input);
  }

  public static countScopedShares(input: { userId: string; organizationId?: string | null }) {
    return TreeGraphEntity.readScopedShareCount(input);
  }

  public async deleteOwnedBranch(input: { supabase: any; userPermissionsId: string }) {
    return deleteAiChannelBranch(input.supabase, { channelId: String(this.id || ''), userPermissionsId: input.userPermissionsId });
  }
}

export const Channel = ChannelEntity;

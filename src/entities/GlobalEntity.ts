import { ENTITY, NEO, NEO_RELATION, PERMISSIONS, Entity, Relation } from '@connectingmatrix/orm';
import type { ChannelEntity } from './tree/Channel';

export type GlobalRow = {
  id: string;
  name?: string | null;
};

@ENTITY({ label: 'GlobalRoot', store: 'neo4j', primaryKey: 'id', defaultRef: () => 'ROOT' })
@PERMISSIONS({
  read: 'GLOBAL_READ',
  relations: {
    channels: { list: 'GLOBAL_CHANNEL_LIST', create: 'GLOBAL_CHANNEL_CREATE', attach: 'GLOBAL_CHANNEL_ATTACH', detach: 'GLOBAL_CHANNEL_DETACH' },
  },
})
export class GlobalEntity extends Entity<GlobalRow> {
  @NEO({ type: 'string', required: true, index: true }) public declare id: string | null;

  @NEO({ type: 'string' }) public declare name: string | null;

  @NEO_RELATION({
    target: 'Channel',
    relation: 'OWNS_GLOBAL_CHANNEL',
    store: 'neo4j',
    many: true,
    owner: {
      scope: 'global',
      parentField: 'id',
      actorField: 'createdBy',
      defaults: { isGlobal: true },
      clear: ['organizationId'],
      unique: ['isGlobal', 'slug'],
    },
    graph: { edge: true },
  })
  public declare channels: Relation<ChannelEntity>;
}

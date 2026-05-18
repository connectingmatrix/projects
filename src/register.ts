import { ORM } from '@connectingmatrix/orm';
import { projectEntities } from './entities/registry';

type OrmRegistrar = { registerEntity(entity: Function): unknown };

export function registerProjectPackage(orm: OrmRegistrar = ORM): Function[] {
  for (const entity of projectEntities) orm.registerEntity(entity);
  return [...projectEntities];
}

export { projectEntities };

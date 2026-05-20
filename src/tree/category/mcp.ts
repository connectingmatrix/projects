import { RESOURCE_TYPES } from '@gigav2/types/graph.types';
import { actionResultValue, optionalText, requireCapability, resolveTreeNodeId } from '../shared/resolve';
import { executeTreeMutation, executeTreeOrm } from '../shared/inner-graphql';
import { runReadCategory } from '../shared/read';
import { emptyActionArtifacts, type GigaActionOutput } from '../types';
import { PERMISSION_MATRIX } from '../shared/permissions';
import { CategoryEntity, ChannelEntity } from '@gigav2/repositories/entities';
import type { AgentActionDefinition, AgentActionName, AgentActionRuntime } from '@gigav2/types/agent.types';

type InputRecord = Record<string, unknown>;

const schema = (input: Record<string, unknown>) => input;
const actionDef = (name: AgentActionName, description: string, input_schema: Record<string, unknown>, mutating = true): AgentActionDefinition => ({
  name,
  description,
  input_schema,
  mutating,
});
const entityRow = (value: any): Record<string, unknown> => ({ ...(value?.extract?.() || value?.payload || value?.data || value || {}) });

const createCategoryAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CATEGORY.CREATE, PERMISSION_MATRIX.CATEGORY.CREATE);
  const payload = input || {};
  const parentChannelId = optionalText(payload, 'parentChannelId') || optionalText(payload, 'parent_channel_id') || null;
  const parentCategoryId = optionalText(payload, 'parentCategoryId') || optionalText(payload, 'parent_category_id') || null;
  if (Boolean(parentChannelId) === Boolean(parentCategoryId)) throw new Error('Exactly one category parent is required.');
  const categoryPayload = { ...((payload.category || {}) as Record<string, unknown>) };
  const category = await executeTreeOrm<Record<string, unknown>>(
    runtime,
    'Categories.create',
    { input: { ...categoryPayload, parentChannelId, parentCategoryId } },
    async () => {
      const created = parentCategoryId
        ? await (CategoryEntity.load(parentCategoryId).categories as any).create(categoryPayload)
        : await (ChannelEntity.load(parentChannelId || '').categories as any).create(categoryPayload);
      return entityRow(created);
    },
  );
  return {
    summary: `Created category "${String(category.name || '')}".`,
    data: { category_id: category.id || null, category },
    ...emptyActionArtifacts,
  };
};

const updateCategoryAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CATEGORY.UPDATE, PERMISSION_MATRIX.CATEGORY.UPDATE);
  const payload = input || {};
  const id = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id:
        actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) ||
        optionalText(payload, 'category_id') ||
        optionalText(payload, 'id'),
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name;
  if (payload.slug !== undefined) patch.slug = payload.slug;
  if (payload.description !== undefined) patch.description = payload.description;
  if (payload.image !== undefined) patch.image = payload.image;
  if (payload.status !== undefined) patch.status = payload.status;
  const category = await executeTreeOrm<Record<string, unknown>>(runtime, 'Categories.update', { id, input: patch }, async () =>
    entityRow(await CategoryEntity.updateById(id, patch)),
  );
  return { summary: `Updated category "${String(category.name || id)}".`, data: { category_id: id, category }, ...emptyActionArtifacts };
};

const deleteCategoryAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CATEGORY.DELETE, PERMISSION_MATRIX.CATEGORY.DELETE);
  const payload = input || {};
  const id = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) || optionalText(payload, 'category_id') || '',
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const deletedCount = await executeTreeOrm<number>(runtime, 'Categories.delete', { id }, async () => CategoryEntity.deleteById(id));
  const message = deletedCount ? `Category ${id} deleted successfully` : `No category found for id ${id}`;
  return {
    summary: message,
    data: { category_id: id, message },
    ...emptyActionArtifacts,
  };
};

const resolveChannelIds = async (runtime: AgentActionRuntime, input: InputRecord): Promise<string[]> => {
  const directIds = Array.isArray(input.channel_ids) ? input.channel_ids.map((value) => String(value || '').trim()).filter(Boolean) : [];
  const single =
    actionResultValue(runtime, input, ['channel_action_id'], ['channel_id', 'channel']) ||
    optionalText(input, 'channel_id') ||
    (optionalText(input, 'channel_name')
      ? await resolveTreeNodeId(
          runtime,
          { ...input, id: '', channel_name: optionalText(input, 'channel_name') },
          { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
        )
      : '');
  return Array.from(new Set([single, ...directIds].filter(Boolean)));
};

const linkCategoryAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CATEGORY.LINK, PERMISSION_MATRIX.CATEGORY.LINK);
  const payload = input || {};
  const categoryId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) || optionalText(payload, 'category_id') || '',
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const channelIds = await resolveChannelIds(runtime, payload);
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiLinkCategoryToChannels', { input: { categoryId, channelIds } });
  return { summary: `Linked category "${categoryId}" to channels.`, data: result, ...emptyActionArtifacts };
};

const unlinkCategoryAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CATEGORY.UNLINK, PERMISSION_MATRIX.CATEGORY.UNLINK);
  const payload = input || {};
  const categoryId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) || optionalText(payload, 'category_id') || '',
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const channelIds = await resolveChannelIds(runtime, payload);
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiUnlinkCategoryFromChannels', { input: { categoryId, channelIds } });
  return { summary: `Unlinked category "${categoryId}" from channels.`, data: result, ...emptyActionArtifacts };
};

export const CATEGORY_TREE_READ_ACTION_NAMES: AgentActionName[] = ['read_category'];
export const CATEGORY_TREE_MUTATING_ACTION_NAMES: AgentActionName[] = [
  'create_category',
  'update_category',
  'delete_category',
  'link_category',
  'unlink_category',
];
export const CATEGORY_TREE_ACTION_NAMES: AgentActionName[] = [...CATEGORY_TREE_READ_ACTION_NAMES, ...CATEGORY_TREE_MUTATING_ACTION_NAMES];

export const CATEGORY_TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  actionDef(
    'read_category',
    'Read an accessible category by id or name after tree-access verification.',
    schema({
      id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
      category: 'string optional',
      name: 'string optional',
      organization_id: 'uuid optional',
    }),
    false,
  ),
  actionDef(
    'create_category',
    'Create a category under a channel or category.',
    schema({ parentChannelId: 'uuid optional', parentCategoryId: 'uuid optional', category: '{name,slug,description?}' }),
  ),
  actionDef(
    'update_category',
    'Update category fields.',
    schema({
      id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
      category: 'string optional',
      name: 'string optional',
      slug: 'string optional',
      description: 'string optional',
      image: 'string optional',
      status: 'string optional',
    }),
  ),
  actionDef(
    'delete_category',
    'Delete a category.',
    schema({
      id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
      category: 'string optional',
      name: 'string optional',
    }),
  ),
  actionDef(
    'link_category',
    'Link an existing category into one or more channels.',
    schema({
      category_id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
      channel_ids: 'uuid[] optional',
      channel_id: 'uuid optional',
      channel_action_id: 'action id optional',
      channel_name: 'string optional',
    }),
  ),
  actionDef(
    'unlink_category',
    'Remove category links from one or more channels.',
    schema({
      category_id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
      channel_ids: 'uuid[] optional',
      channel_id: 'uuid optional',
      channel_action_id: 'action id optional',
      channel_name: 'string optional',
    }),
  ),
];

export const CATEGORY_TREE_ACTION_HANDLERS: Partial<
  Record<AgentActionName, (runtime: AgentActionRuntime, input?: InputRecord) => Promise<GigaActionOutput>>
> = {
  read_category: runReadCategory,
  create_category: createCategoryAction,
  update_category: updateCategoryAction,
  delete_category: deleteCategoryAction,
  link_category: linkCategoryAction,
  unlink_category: unlinkCategoryAction,
};

import { RESOURCE_TYPES } from '@gigav2/types/graph.types';
import { actionResultValue, optionalText, requireCapability, resolveTreeNodeId } from '../shared/resolve';
import { executeTreeMutation } from '../shared/inner-graphql';
import { runReadChannel } from '../shared/read';
import { emptyActionArtifacts, type GigaActionOutput } from '../types';
import { PERMISSION_MATRIX } from '../shared/permissions';
import type { AgentActionDefinition, AgentActionName, AgentActionRuntime } from '@gigav2/types/agent.types';

const schema = (input: Record<string, unknown>) => input;
const actionDef = (name: AgentActionName, description: string, input_schema: Record<string, unknown>, mutating = true): AgentActionDefinition => ({
  name,
  description,
  input_schema,
  mutating,
});
type InputRecord = Record<string, unknown>;

const createChannelAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CHANNEL.CREATE, PERMISSION_MATRIX.CHANNEL.CREATE);
  const payload = input || {};
  const result = await executeTreeMutation<{ channel: Record<string, unknown> }>(runtime, 'gigaCreateChannel', {
    input: {
      organizationId: optionalText(payload, 'organizationId') || optionalText(payload, 'organization_id') || null,
      parentChannelId: optionalText(payload, 'parentChannelId') || optionalText(payload, 'parent_channel_id') || null,
      channel: (payload.channel || {}) as Record<string, unknown>,
    },
  });
  const channel = {
    id: String(result.channel?.id || ''),
    name: result.channel?.name || null,
    slug: result.channel?.slug || null,
    description: result.channel?.description || null,
    organizationId: result.channel?.organizationId || null,
  };
  return {
    summary: `Created channel "${String(channel.name || '')}".`,
    data: { channel_id: channel.id || null, channel },
    ...emptyActionArtifacts,
  };
};

const updateChannelAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CHANNEL.UPDATE, PERMISSION_MATRIX.CHANNEL.UPDATE);
  const payload = input || {};
  const id = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id:
        actionResultValue(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) ||
        optionalText(payload, 'channel_id') ||
        optionalText(payload, 'id'),
    },
    { idKey: 'id', label: 'channel', nameKeys: ['channel_name', 'channelName', 'name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const inputPatch: Record<string, unknown> = { id };
  if (payload.name !== undefined) inputPatch.name = payload.name;
  if (payload.slug !== undefined) inputPatch.slug = payload.slug;
  if (payload.description !== undefined) inputPatch.description = payload.description;
  if (payload.image !== undefined) inputPatch.image = payload.image;
  if (payload.status !== undefined) inputPatch.status = payload.status;
  const channel = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiUpdateChannel', { input: inputPatch });
  return { summary: `Updated channel "${String(channel.name || id)}".`, data: { channel_id: id, channel }, ...emptyActionArtifacts };
};

const deleteChannelAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CHANNEL.DELETE, PERMISSION_MATRIX.CHANNEL.DELETE);
  const payload = input || {};
  const namePrefix =
    optionalText(payload, 'name_prefix') ||
    optionalText(payload, 'namePrefix') ||
    optionalText(payload, 'starts_with') ||
    optionalText(payload, 'startsWith') ||
    optionalText(payload, 'prefix');
  if (namePrefix) {
    const readResult = await runReadChannel(runtime, { ...payload, name_prefix: namePrefix });
    const data = (readResult.data || {}) as Record<string, unknown>;
    const matched = Array.isArray(data.matched_channels) ? (data.matched_channels as Array<Record<string, unknown>>) : [];
    const ids: string[] = [];
    for (const channel of matched) {
      const id = optionalText(channel, 'id');
      if (id) ids.push(id);
    }
    if (!ids.length) {
      return {
        summary: `No channel found for prefix "${namePrefix}".`,
        data: { name_prefix: namePrefix, deleted_count: 0, deleted_channel_ids: [] },
        ...emptyActionArtifacts,
      };
    }
    for (const id of ids) await executeTreeMutation<{ message: string }>(runtime, 'deleteAiChannel', { id });
    return {
      summary: `Deleted ${ids.length} channel(s) for prefix "${namePrefix}".`,
      data: { name_prefix: namePrefix, deleted_count: ids.length, deleted_channel_ids: ids },
      ...emptyActionArtifacts,
    };
  }
  const id = await resolveTreeNodeId(
    runtime,
    { ...payload, id: optionalText(payload, 'id') || optionalText(payload, 'channel_id') || optionalText(payload, 'channel_action_id') || '' },
    { idKey: 'id', label: 'channel', nameKeys: ['channel_name', 'channelName', 'name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const result = await executeTreeMutation<{ message: string }>(runtime, 'deleteAiChannel', { id });
  return {
    summary: result.message || `Deleted channel "${id}".`,
    data: { channel_id: id, message: result.message || null },
    ...emptyActionArtifacts,
  };
};

const linkChannelAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CHANNEL.LINK, PERMISSION_MATRIX.CHANNEL.LINK);
  const payload = input || {};
  const parentChannelId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id:
        actionResultValue(runtime, payload, ['parent_channel_action_id'], ['channel_id', 'channel']) ||
        optionalText(payload, 'parent_channel_id') ||
        '',
    },
    { idKey: 'id', label: 'channel', nameKeys: ['parent_channel_name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const channelId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) || optionalText(payload, 'channel_id') || '',
    },
    { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiLinkChannel', { input: { parentChannelId, channelId } });
  return { summary: `Linked channel "${channelId}" under "${parentChannelId}".`, data: result, ...emptyActionArtifacts };
};

const unlinkChannelAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.CHANNEL.UNLINK, PERMISSION_MATRIX.CHANNEL.UNLINK);
  const payload = input || {};
  const parentChannelId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id:
        actionResultValue(runtime, payload, ['parent_channel_action_id'], ['channel_id', 'channel']) ||
        optionalText(payload, 'parent_channel_id') ||
        '',
    },
    { idKey: 'id', label: 'channel', nameKeys: ['parent_channel_name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const channelId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) || optionalText(payload, 'channel_id') || '',
    },
    { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: RESOURCE_TYPES.channel, preferScopedRoot: true },
  );
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiUnlinkChannel', { input: { parentChannelId, channelId } });
  return { summary: `Unlinked channel "${channelId}" from "${parentChannelId}".`, data: result, ...emptyActionArtifacts };
};

export const CHANNEL_TREE_READ_ACTION_NAMES: AgentActionName[] = ['read_channel'];
export const CHANNEL_TREE_MUTATING_ACTION_NAMES: AgentActionName[] = [
  'create_channel',
  'update_channel',
  'delete_channel',
  'link_channel',
  'unlink_channel',
];
export const CHANNEL_TREE_ACTION_NAMES: AgentActionName[] = [...CHANNEL_TREE_READ_ACTION_NAMES, ...CHANNEL_TREE_MUTATING_ACTION_NAMES];

export const CHANNEL_TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  actionDef(
    'read_channel',
    'Read one accessible channel by id, or list channels by name/name_prefix.',
    schema({ id: 'uuid optional', name: 'string optional', name_prefix: 'string optional', organization_id: 'uuid optional' }),
    false,
  ),
  actionDef(
    'create_channel',
    'Create a channel.',
    schema({ organizationId: 'uuid optional', parentChannelId: 'uuid optional', channel: '{name,slug,description?}' }),
  ),
  actionDef(
    'update_channel',
    'Update channel fields.',
    schema({
      id: 'uuid optional',
      channel_action_id: 'action id optional',
      channel_name: 'string optional',
      name: 'string optional',
      slug: 'string optional',
      description: 'string optional',
      image: 'string optional',
      status: 'string optional',
    }),
  ),
  actionDef(
    'delete_channel',
    'Delete one channel branch, or multiple channels by name_prefix.',
    schema({
      id: 'uuid optional',
      channel_name: 'string optional',
      channelName: 'string optional',
      name: 'string optional',
      name_prefix: 'string optional',
      namePrefix: 'string optional',
      prefix: 'string optional',
      organization_id: 'uuid optional',
    }),
  ),
  actionDef(
    'link_channel',
    'Link a child channel under a parent channel.',
    schema({
      parent_channel_id: 'uuid optional',
      parent_channel_name: 'string optional',
      parent_channel_action_id: 'action id optional',
      channel_id: 'uuid optional',
      channel_name: 'string optional',
      channel_action_id: 'action id optional',
    }),
  ),
  actionDef(
    'unlink_channel',
    'Remove a channel link under a parent channel.',
    schema({
      parent_channel_id: 'uuid optional',
      parent_channel_name: 'string optional',
      parent_channel_action_id: 'action id optional',
      channel_id: 'uuid optional',
      channel_name: 'string optional',
      channel_action_id: 'action id optional',
    }),
  ),
];

export const CHANNEL_TREE_ACTION_HANDLERS: Partial<
  Record<AgentActionName, (runtime: AgentActionRuntime, input?: InputRecord) => Promise<GigaActionOutput>>
> = {
  read_channel: runReadChannel,
  create_channel: createChannelAction,
  update_channel: updateChannelAction,
  delete_channel: deleteChannelAction,
  link_channel: linkChannelAction,
  unlink_channel: unlinkChannelAction,
};

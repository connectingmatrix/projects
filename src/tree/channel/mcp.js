"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNEL_TREE_ACTION_HANDLERS = exports.CHANNEL_TREE_ACTION_CATALOG = exports.CHANNEL_TREE_ACTION_NAMES = exports.CHANNEL_TREE_MUTATING_ACTION_NAMES = exports.CHANNEL_TREE_READ_ACTION_NAMES = void 0;
const graph_types_1 = require("@gigav2/types/graph.types");
const resolve_1 = require("../shared/resolve");
const inner_graphql_1 = require("../shared/inner-graphql");
const read_1 = require("../shared/read");
const types_1 = require("../types");
const permissions_1 = require("../shared/permissions");
const entities_1 = require("@connectingmatrix/orm/entities");
const schema = (input) => input;
const actionDef = (name, description, input_schema, mutating = true) => ({
    name,
    description,
    input_schema,
    mutating,
});
const entityRow = (value) => { var _a; return ({ ...(((_a = value === null || value === void 0 ? void 0 : value.extract) === null || _a === void 0 ? void 0 : _a.call(value)) || (value === null || value === void 0 ? void 0 : value.payload) || (value === null || value === void 0 ? void 0 : value.data) || value || {}) }); };
const createChannelAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CHANNEL.CREATE, permissions_1.PERMISSION_MATRIX.CHANNEL.CREATE);
    const payload = input || {};
    const channelPayload = { ...(payload.channel || {}) };
    const parentChannelId = (0, resolve_1.optionalText)(payload, 'parentChannelId') || (0, resolve_1.optionalText)(payload, 'parent_channel_id') || null;
    const organizationId = (0, resolve_1.optionalText)(payload, 'organizationId') || (0, resolve_1.optionalText)(payload, 'organization_id') || null;
    const channel = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Channels.create', { input: { ...channelPayload, parentChannelId, organizationId } }, async () => {
        const created = parentChannelId
            ? await entities_1.ChannelEntity.load(parentChannelId).children.create(channelPayload)
            : organizationId
                ? await entities_1.OrganisationEntity.load(organizationId).channels.create(channelPayload)
                : await entities_1.UserEntity.load().channels.create(channelPayload);
        return entityRow(created);
    });
    return {
        summary: `Created channel "${String(channel.name || '')}".`,
        data: { channel_id: String(channel.id || '') || null, channel },
        ...types_1.emptyActionArtifacts,
    };
};
const updateChannelAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CHANNEL.UPDATE, permissions_1.PERMISSION_MATRIX.CHANNEL.UPDATE);
    const payload = input || {};
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) ||
            (0, resolve_1.optionalText)(payload, 'channel_id') ||
            (0, resolve_1.optionalText)(payload, 'id'),
    }, { idKey: 'id', label: 'channel', nameKeys: ['channel_name', 'channelName', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const patch = {};
    if (payload.name !== undefined)
        patch.name = payload.name;
    if (payload.slug !== undefined)
        patch.slug = payload.slug;
    if (payload.description !== undefined)
        patch.description = payload.description;
    if (payload.image !== undefined)
        patch.image = payload.image;
    if (payload.status !== undefined)
        patch.status = payload.status;
    const channel = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Channels.update', { id, input: patch }, async () => entityRow(await entities_1.ChannelEntity.updateById(id, patch)));
    return { summary: `Updated channel "${String(channel.name || id)}".`, data: { channel_id: id, channel }, ...types_1.emptyActionArtifacts };
};
const deleteChannelAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CHANNEL.DELETE, permissions_1.PERMISSION_MATRIX.CHANNEL.DELETE);
    const payload = input || {};
    const namePrefix = (0, resolve_1.optionalText)(payload, 'name_prefix') ||
        (0, resolve_1.optionalText)(payload, 'namePrefix') ||
        (0, resolve_1.optionalText)(payload, 'starts_with') ||
        (0, resolve_1.optionalText)(payload, 'startsWith') ||
        (0, resolve_1.optionalText)(payload, 'prefix');
    if (namePrefix) {
        const readResult = await (0, read_1.runReadChannel)(runtime, { ...payload, name_prefix: namePrefix });
        const data = (readResult.data || {});
        const matched = Array.isArray(data.matched_channels) ? data.matched_channels : [];
        const ids = [];
        for (const channel of matched) {
            const id = (0, resolve_1.optionalText)(channel, 'id');
            if (id)
                ids.push(id);
        }
        if (!ids.length) {
            return {
                summary: `No channel found for prefix "${namePrefix}".`,
                data: { name_prefix: namePrefix, deleted_count: 0, deleted_channel_ids: [] },
                ...types_1.emptyActionArtifacts,
            };
        }
        for (const id of ids)
            await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Channels.delete', { id }, async () => entities_1.ChannelEntity.deleteById(id));
        return {
            summary: `Deleted ${ids.length} channel(s) for prefix "${namePrefix}".`,
            data: { name_prefix: namePrefix, deleted_count: ids.length, deleted_channel_ids: ids },
            ...types_1.emptyActionArtifacts,
        };
    }
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, { ...payload, id: (0, resolve_1.optionalText)(payload, 'id') || (0, resolve_1.optionalText)(payload, 'channel_id') || (0, resolve_1.optionalText)(payload, 'channel_action_id') || '' }, { idKey: 'id', label: 'channel', nameKeys: ['channel_name', 'channelName', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const deletedCount = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Channels.delete', { id }, async () => entities_1.ChannelEntity.deleteById(id));
    const message = deletedCount ? `Channel ${id} deleted successfully` : `No channel found for id ${id}`;
    return {
        summary: message,
        data: { channel_id: id, message },
        ...types_1.emptyActionArtifacts,
    };
};
const linkChannelAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CHANNEL.LINK, permissions_1.PERMISSION_MATRIX.CHANNEL.LINK);
    const payload = input || {};
    const parentChannelId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['parent_channel_action_id'], ['channel_id', 'channel']) ||
            (0, resolve_1.optionalText)(payload, 'parent_channel_id') ||
            '',
    }, { idKey: 'id', label: 'channel', nameKeys: ['parent_channel_name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const channelId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) || (0, resolve_1.optionalText)(payload, 'channel_id') || '',
    }, { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiLinkChannel', { input: { parentChannelId, channelId } });
    return { summary: `Linked channel "${channelId}" under "${parentChannelId}".`, data: result, ...types_1.emptyActionArtifacts };
};
const unlinkChannelAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CHANNEL.UNLINK, permissions_1.PERMISSION_MATRIX.CHANNEL.UNLINK);
    const payload = input || {};
    const parentChannelId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['parent_channel_action_id'], ['channel_id', 'channel']) ||
            (0, resolve_1.optionalText)(payload, 'parent_channel_id') ||
            '',
    }, { idKey: 'id', label: 'channel', nameKeys: ['parent_channel_name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const channelId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['channel_action_id'], ['channel_id', 'channel']) || (0, resolve_1.optionalText)(payload, 'channel_id') || '',
    }, { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true });
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiUnlinkChannel', { input: { parentChannelId, channelId } });
    return { summary: `Unlinked channel "${channelId}" from "${parentChannelId}".`, data: result, ...types_1.emptyActionArtifacts };
};
exports.CHANNEL_TREE_READ_ACTION_NAMES = ['read_channel'];
exports.CHANNEL_TREE_MUTATING_ACTION_NAMES = [
    'create_channel',
    'update_channel',
    'delete_channel',
    'link_channel',
    'unlink_channel',
];
exports.CHANNEL_TREE_ACTION_NAMES = [...exports.CHANNEL_TREE_READ_ACTION_NAMES, ...exports.CHANNEL_TREE_MUTATING_ACTION_NAMES];
exports.CHANNEL_TREE_ACTION_CATALOG = [
    actionDef('read_channel', 'Read one accessible channel by id, or list channels by name/name_prefix.', schema({ id: 'uuid optional', name: 'string optional', name_prefix: 'string optional', organization_id: 'uuid optional' }), false),
    actionDef('create_channel', 'Create a channel under the current user, an organization, or a parent channel.', schema({ organizationId: 'uuid optional', parentChannelId: 'uuid optional', channel: '{name,slug,description?}' })),
    actionDef('update_channel', 'Update channel fields.', schema({
        id: 'uuid optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
        name: 'string optional',
        slug: 'string optional',
        description: 'string optional',
        image: 'string optional',
        status: 'string optional',
    })),
    actionDef('delete_channel', 'Delete a channel by id/name, or delete all matched channels by name_prefix.', schema({
        id: 'uuid optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
        name: 'string optional',
        name_prefix: 'string optional',
        organization_id: 'uuid optional',
    })),
    actionDef('link_channel', 'Link an existing channel below another channel.', schema({
        parent_channel_id: 'uuid optional',
        parent_channel_action_id: 'action id optional',
        parent_channel_name: 'string optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
    })),
    actionDef('unlink_channel', 'Remove a shared channel link without deleting either channel.', schema({
        parent_channel_id: 'uuid optional',
        parent_channel_action_id: 'action id optional',
        parent_channel_name: 'string optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
    })),
];
exports.CHANNEL_TREE_ACTION_HANDLERS = {
    read_channel: read_1.runReadChannel,
    create_channel: createChannelAction,
    update_channel: updateChannelAction,
    delete_channel: deleteChannelAction,
    link_channel: linkChannelAction,
    unlink_channel: unlinkChannelAction,
};

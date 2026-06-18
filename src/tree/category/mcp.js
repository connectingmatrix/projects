"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_TREE_ACTION_HANDLERS = exports.CATEGORY_TREE_ACTION_CATALOG = exports.CATEGORY_TREE_ACTION_NAMES = exports.CATEGORY_TREE_MUTATING_ACTION_NAMES = exports.CATEGORY_TREE_READ_ACTION_NAMES = void 0;
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
const createCategoryAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CATEGORY.CREATE, permissions_1.PERMISSION_MATRIX.CATEGORY.CREATE);
    const payload = input || {};
    const parentChannelId = (0, resolve_1.optionalText)(payload, 'parentChannelId') || (0, resolve_1.optionalText)(payload, 'parent_channel_id') || null;
    const parentCategoryId = (0, resolve_1.optionalText)(payload, 'parentCategoryId') || (0, resolve_1.optionalText)(payload, 'parent_category_id') || null;
    if (Boolean(parentChannelId) === Boolean(parentCategoryId))
        throw new Error('Exactly one category parent is required.');
    const categoryPayload = { ...(payload.category || {}) };
    const category = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Categories.create', { input: { ...categoryPayload, parentChannelId, parentCategoryId } }, async () => {
        const created = parentCategoryId
            ? await entities_1.CategoryEntity.load(parentCategoryId).categories.create(categoryPayload)
            : await entities_1.ChannelEntity.load(parentChannelId || '').categories.create(categoryPayload);
        return entityRow(created);
    });
    return {
        summary: `Created category "${String(category.name || '')}".`,
        data: { category_id: category.id || null, category },
        ...types_1.emptyActionArtifacts,
    };
};
const updateCategoryAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CATEGORY.UPDATE, permissions_1.PERMISSION_MATRIX.CATEGORY.UPDATE);
    const payload = input || {};
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) ||
            (0, resolve_1.optionalText)(payload, 'category_id') ||
            (0, resolve_1.optionalText)(payload, 'id'),
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
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
    const category = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Categories.update', { id, input: patch }, async () => entityRow(await entities_1.CategoryEntity.updateById(id, patch)));
    return { summary: `Updated category "${String(category.name || id)}".`, data: { category_id: id, category }, ...types_1.emptyActionArtifacts };
};
const deleteCategoryAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CATEGORY.DELETE, permissions_1.PERMISSION_MATRIX.CATEGORY.DELETE);
    const payload = input || {};
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(payload, 'category_id') || '',
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
    const deletedCount = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Categories.delete', { id }, async () => entities_1.CategoryEntity.deleteById(id));
    const message = deletedCount ? `Category ${id} deleted successfully` : `No category found for id ${id}`;
    return {
        summary: message,
        data: { category_id: id, message },
        ...types_1.emptyActionArtifacts,
    };
};
const resolveChannelIds = async (runtime, input) => {
    const directIds = Array.isArray(input.channel_ids) ? input.channel_ids.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const single = (0, resolve_1.actionResultValue)(runtime, input, ['channel_action_id'], ['channel_id', 'channel']) ||
        (0, resolve_1.optionalText)(input, 'channel_id') ||
        ((0, resolve_1.optionalText)(input, 'channel_name')
            ? await (0, resolve_1.resolveTreeNodeId)(runtime, { ...input, id: '', channel_name: (0, resolve_1.optionalText)(input, 'channel_name') }, { idKey: 'id', label: 'channel', nameKeys: ['channel_name'], nodeType: graph_types_1.RESOURCE_TYPES.channel, preferScopedRoot: true })
            : '');
    return Array.from(new Set([single, ...directIds].filter(Boolean)));
};
const attachCategoryAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CATEGORY.LINK, permissions_1.PERMISSION_MATRIX.CATEGORY.LINK);
    const payload = input || {};
    const categoryId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(payload, 'category_id') || '',
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
    const channelIds = await resolveChannelIds(runtime, payload);
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiAttachCategoryToChannels', { input: { categoryId, channelIds } });
    return { summary: `Attached category "${categoryId}" to channels.`, data: result, ...types_1.emptyActionArtifacts };
};
const unlinkCategoryAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.CATEGORY.UNLINK, permissions_1.PERMISSION_MATRIX.CATEGORY.UNLINK);
    const payload = input || {};
    const categoryId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(payload, 'category_id') || '',
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
    const channelIds = await resolveChannelIds(runtime, payload);
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiUnlinkCategoryFromChannels', { input: { categoryId, channelIds } });
    return { summary: `Unlinked category "${categoryId}" from channels.`, data: result, ...types_1.emptyActionArtifacts };
};
exports.CATEGORY_TREE_READ_ACTION_NAMES = ['read_category'];
exports.CATEGORY_TREE_MUTATING_ACTION_NAMES = [
    'create_category',
    'update_category',
    'delete_category',
    'link_category',
    'unlink_category',
];
exports.CATEGORY_TREE_ACTION_NAMES = [...exports.CATEGORY_TREE_READ_ACTION_NAMES, ...exports.CATEGORY_TREE_MUTATING_ACTION_NAMES];
exports.CATEGORY_TREE_ACTION_CATALOG = [
    actionDef('read_category', 'Read an accessible category by id or name after tree-access verification.', schema({
        id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
        category: 'string optional',
        name: 'string optional',
        organization_id: 'uuid optional',
    }), false),
    actionDef('create_category', 'Create a category under a channel or category.', schema({ parentChannelId: 'uuid optional', parentCategoryId: 'uuid optional', category: '{name,slug,description?}' })),
    actionDef('update_category', 'Update category fields.', schema({
        id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
        category: 'string optional',
        name: 'string optional',
        slug: 'string optional',
        description: 'string optional',
        image: 'string optional',
        status: 'string optional',
    })),
    actionDef('delete_category', 'Delete a category.', schema({
        id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
        category: 'string optional',
        name: 'string optional',
    })),
    actionDef('link_category', 'Link an existing category into one or more channels.', schema({
        category_id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
        channel_ids: 'uuid[] optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
    })),
    actionDef('unlink_category', 'Remove category links from one or more channels.', schema({
        category_id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
        channel_ids: 'uuid[] optional',
        channel_id: 'uuid optional',
        channel_action_id: 'action id optional',
        channel_name: 'string optional',
    })),
];
exports.CATEGORY_TREE_ACTION_HANDLERS = {
    read_category: read_1.runReadCategory,
    create_category: createCategoryAction,
    update_category: updateCategoryAction,
    delete_category: deleteCategoryAction,
    link_category: attachCategoryAction,
    unlink_category: unlinkCategoryAction,
};

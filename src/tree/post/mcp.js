"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST_TREE_ACTION_HANDLERS = exports.POST_TREE_ACTION_CATALOG = exports.POST_TREE_ACTION_NAMES = exports.POST_TREE_MUTATING_ACTION_NAMES = exports.POST_TREE_READ_ACTION_NAMES = void 0;
const graph_types_1 = require("@gigav2/types/graph.types");
const resolve_1 = require("../shared/resolve");
const inner_graphql_1 = require("../shared/inner-graphql");
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
const readPostAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.POST.READ, permissions_1.PERMISSION_MATRIX.POST.READ);
    const payload = input || {};
    const id = await (0, resolve_1.resolvePostId)(runtime, payload, {
        idKeys: ['id', 'post_id'],
        titleKeys: ['post_title', 'title', 'name'],
        actionKeys: ['post_action_id'],
    });
    const post = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Posts.read', { id }, async () => {
        const row = await entities_1.PostEntity.single(id);
        return row ? entityRow(row) : null;
    });
    return {
        summary: post ? `Read post "${String(post.title || id)}".` : `No post found for id ${id}.`,
        data: { post_id: id, post },
        ...types_1.emptyActionArtifacts,
    };
};
const readAttachmentsAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.POST.ATTACHMENTS, permissions_1.PERMISSION_MATRIX.POST.ATTACHMENTS);
    const payload = input || {};
    const id = await (0, resolve_1.resolvePostId)(runtime, payload, { idKeys: ['post_id', 'id'], titleKeys: ['post_title', 'title'], actionKeys: ['post_action_id'] });
    const attachments = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Posts.Attachments.list', { id }, async () => {
        const rows = await entities_1.PostEntity.load(id).attachments.list(undefined, { orderBy: 'created_at', ascending: true });
        const attachmentId = (0, resolve_1.optionalText)(payload, 'attachment_id') || null;
        return rows
            .map((row) => entityRow(row))
            .filter((row) => !attachmentId || String(row.id || '') === attachmentId);
    });
    return { summary: `Read ${attachments.length} attachment(s) for post "${id}".`, data: { post_id: id, attachments }, ...types_1.emptyActionArtifacts };
};
const createPostAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.POST.CREATE, permissions_1.PERMISSION_MATRIX.POST.CREATE);
    const payload = input || {};
    const subjectId = String(payload.subject_id || '').trim();
    const postPayload = {
        title: payload.title,
        narrative: payload.narrative,
        metadata: payload.metadata,
    };
    const post = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Posts.create', { input: { ...postPayload, subject_id: subjectId } }, async () => entityRow(await entities_1.SubjectEntity.load(subjectId).posts.create(postPayload)));
    return {
        summary: `Created post "${String((post === null || post === void 0 ? void 0 : post.title) || payload.title || '')}".`,
        data: { post: post || null, post_id: (post === null || post === void 0 ? void 0 : post.id) || null },
        ...types_1.emptyActionArtifacts,
    };
};
const updatePostAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.POST.UPDATE, permissions_1.PERMISSION_MATRIX.POST.UPDATE);
    const payload = input || {};
    const id = await (0, resolve_1.resolvePostId)(runtime, payload, {
        idKeys: ['id', 'post_id'],
        titleKeys: ['post_title', 'title', 'name'],
        actionKeys: ['post_action_id'],
    });
    const subjectId = (0, resolve_1.optionalText)(payload, 'subject_id')
        ? await (0, resolve_1.resolveTreeNodeId)(runtime, {
            ...payload,
            id: (0, resolve_1.actionResultValue)(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || (0, resolve_1.optionalText)(payload, 'subject_id') || '',
        }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: graph_types_1.RESOURCE_TYPES.subject, preferScopedRoot: true })
        : null;
    const patch = {};
    if (payload.title !== undefined)
        patch.title = payload.title;
    if (payload.narrative !== undefined)
        patch.narrative = payload.narrative;
    if (payload.metadata !== undefined)
        patch.metadata = payload.metadata;
    if (subjectId)
        patch.subject_id = subjectId;
    const post = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Posts.update', { id, input: patch }, async () => entityRow(await entities_1.PostEntity.updateById(id, patch)));
    return { summary: `Updated post "${String((post === null || post === void 0 ? void 0 : post.title) || id)}".`, data: { post_id: id, post: post || null }, ...types_1.emptyActionArtifacts };
};
const deletePostAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.POST.DELETE, permissions_1.PERMISSION_MATRIX.POST.DELETE);
    const payload = input || {};
    const id = await (0, resolve_1.resolvePostId)(runtime, payload, {
        idKeys: ['id', 'post_id'],
        titleKeys: ['post_title', 'title', 'name'],
        actionKeys: ['post_action_id'],
    });
    const deletedCount = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'Posts.delete', { id }, async () => entities_1.PostEntity.deleteById(id));
    const message = deletedCount ? `Post ${id} deleted successfully` : `No post found for id ${id}`;
    return { summary: message, data: { post_id: id, message }, ...types_1.emptyActionArtifacts };
};
exports.POST_TREE_READ_ACTION_NAMES = ['read_post', 'read_attachments'];
exports.POST_TREE_MUTATING_ACTION_NAMES = ['create_post', 'update_post', 'delete_post'];
exports.POST_TREE_ACTION_NAMES = [...exports.POST_TREE_READ_ACTION_NAMES, ...exports.POST_TREE_MUTATING_ACTION_NAMES];
exports.POST_TREE_ACTION_CATALOG = [
    actionDef('read_post', 'Read an accessible post by id or title with bounded narrative and attachment metadata.', schema({
        id: 'uuid optional',
        post_id: 'uuid optional',
        post_action_id: 'action id optional',
        post_title: 'string optional',
        title: 'string optional',
        name: 'string optional',
        organization_id: 'uuid optional',
    }), false),
    actionDef('read_attachments', 'Read accessible post attachment metadata.', schema({ post_id: 'uuid optional', attachment_id: 'uuid optional', organization_id: 'uuid optional' }), false),
    actionDef('create_post', 'Create a post under a subject.', schema({ subject_id: 'uuid', title: 'string', narrative: 'string optional', metadata: 'object optional' })),
    actionDef('update_post', 'Update post fields.', schema({
        id: 'uuid optional',
        post_id: 'uuid optional',
        post_action_id: 'action id optional',
        post_title: 'string optional',
        title: 'string optional',
        subject_id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        subject: 'string optional',
        narrative: 'string optional',
        metadata: 'object optional',
    })),
    actionDef('delete_post', 'Delete a post.', schema({
        id: 'uuid optional',
        post_id: 'uuid optional',
        post_action_id: 'action id optional',
        post_title: 'string optional',
        title: 'string optional',
        name: 'string optional',
    })),
];
exports.POST_TREE_ACTION_HANDLERS = {
    read_post: readPostAction,
    read_attachments: readAttachmentsAction,
    create_post: createPostAction,
    update_post: updatePostAction,
    delete_post: deletePostAction,
};

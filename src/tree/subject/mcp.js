"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBJECT_TREE_ACTION_HANDLERS = exports.SUBJECT_TREE_ACTION_CATALOG = exports.SUBJECT_TREE_ACTION_NAMES = exports.SUBJECT_TREE_MUTATING_ACTION_NAMES = exports.SUBJECT_TREE_READ_ACTION_NAMES = void 0;
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
const createSubjectAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.SUBJECT.CREATE, permissions_1.PERMISSION_MATRIX.SUBJECT.CREATE);
    const payload = input || {};
    const categoryId = (0, resolve_1.optionalText)(payload, 'categoryId') || (0, resolve_1.optionalText)(payload, 'category_id') || null;
    const parentSubjectId = (0, resolve_1.optionalText)(payload, 'parentSubjectId') || (0, resolve_1.optionalText)(payload, 'parent_subject_id') || null;
    if (Boolean(categoryId) === Boolean(parentSubjectId))
        throw new Error('Exactly one subject parent is required.');
    const subjectPayload = {
        name: payload.name,
        description: payload.description || null,
        metadata: (payload.metadata || {}),
        summary: payload.summary || null,
    };
    const subject = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'SubjectRefs.create', { input: { ...subjectPayload, categoryId, parentSubjectId } }, async () => {
        const created = categoryId
            ? await entities_1.CategoryEntity.load(categoryId).subjects.create(subjectPayload)
            : await entities_1.SubjectEntity.load(parentSubjectId || '').subjects.create(subjectPayload);
        return entityRow(created);
    });
    const subjectId = String(subject.id || '');
    return {
        summary: `Created subject "${String(subject.name || payload.name || '')}".`,
        data: { subject_id: subjectId || null, subject },
        ...types_1.emptyActionArtifacts,
    };
};
const updateSubjectAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.SUBJECT.UPDATE, permissions_1.PERMISSION_MATRIX.SUBJECT.UPDATE);
    const payload = input || {};
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) ||
            (0, resolve_1.optionalText)(payload, 'subject_id') ||
            (0, resolve_1.optionalText)(payload, 'id'),
    }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.subject, preferScopedRoot: true });
    const patch = {};
    if (payload.name !== undefined)
        patch.name = payload.name;
    if (payload.description !== undefined)
        patch.description = payload.description;
    if (payload.metadata !== undefined)
        patch.metadata = payload.metadata;
    const subject = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'SubjectRefs.update', { id, input: patch }, async () => entityRow(await entities_1.SubjectEntity.updateById(id, patch)));
    return { summary: `Updated subject "${String(subject.name || id)}".`, data: { subject_id: id, subject }, ...types_1.emptyActionArtifacts };
};
const deleteSubjectAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.SUBJECT.DELETE, permissions_1.PERMISSION_MATRIX.SUBJECT.DELETE);
    const payload = input || {};
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || (0, resolve_1.optionalText)(payload, 'subject_id') || '',
    }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.subject, preferScopedRoot: true });
    const deletedCount = await (0, inner_graphql_1.executeTreeOrm)(runtime, 'SubjectRefs.delete', { id }, async () => entities_1.SubjectEntity.deleteById(id));
    const message = deletedCount ? `Subject ${id} deleted successfully` : `No subject found for id ${id}`;
    return {
        summary: message,
        data: { subject_id: id, message },
        ...types_1.emptyActionArtifacts,
    };
};
const linkSubjectAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.SUBJECT.LINK, permissions_1.PERMISSION_MATRIX.SUBJECT.LINK);
    const payload = input || {};
    const subjectId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || (0, resolve_1.optionalText)(payload, 'subject_id') || '',
    }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: graph_types_1.RESOURCE_TYPES.subject, preferScopedRoot: true });
    const categoryId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(payload, 'category_id') || '',
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiLinkSubjectToCategory', { input: { subjectId, categoryId } });
    return { summary: `Attached subject "${subjectId}" to category "${categoryId}".`, data: result, ...types_1.emptyActionArtifacts };
};
const unlinkSubjectAction = async (runtime, input) => {
    await (0, resolve_1.requireCapability)(runtime, permissions_1.PERMISSION_MATRIX.SUBJECT.UNLINK, permissions_1.PERMISSION_MATRIX.SUBJECT.UNLINK);
    const payload = input || {};
    const subjectId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || (0, resolve_1.optionalText)(payload, 'subject_id') || '',
    }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: graph_types_1.RESOURCE_TYPES.subject, preferScopedRoot: true });
    const categoryId = await (0, resolve_1.resolveTreeNodeId)(runtime, {
        ...payload,
        id: (0, resolve_1.actionResultValue)(runtime, payload, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(payload, 'category_id') || '',
    }, { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: graph_types_1.RESOURCE_TYPES.category, preferScopedRoot: true });
    const result = await (0, inner_graphql_1.executeTreeMutation)(runtime, 'aiUnlinkSubjectFromCategory', { input: { subjectId, categoryId } });
    return { summary: `Removed shared subject link "${subjectId}" from category "${categoryId}".`, data: result, ...types_1.emptyActionArtifacts };
};
exports.SUBJECT_TREE_READ_ACTION_NAMES = ['read_subject'];
exports.SUBJECT_TREE_MUTATING_ACTION_NAMES = [
    'create_subject',
    'update_subject',
    'delete_subject',
    'link_subject',
    'unlink_subject',
];
exports.SUBJECT_TREE_ACTION_NAMES = [...exports.SUBJECT_TREE_READ_ACTION_NAMES, ...exports.SUBJECT_TREE_MUTATING_ACTION_NAMES];
exports.SUBJECT_TREE_ACTION_CATALOG = [
    actionDef('read_subject', 'Read an accessible subject by id or name with bounded metadata and linked posts summary.', schema({
        id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        subject: 'string optional',
        name: 'string optional',
        organization_id: 'uuid optional',
    }), false),
    actionDef('create_subject', 'Create a subject under category/subject.', schema({
        name: 'string',
        description: 'string optional',
        categoryId: 'uuid optional',
        parentSubjectId: 'uuid optional',
        summary: 'object optional',
        metadata: 'object optional',
    })),
    actionDef('update_subject', 'Update subject fields.', schema({
        id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        subject: 'string optional',
        name: 'string optional',
        description: 'string optional',
        metadata: 'object optional',
    })),
    actionDef('delete_subject', 'Delete a subject.', schema({
        id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        subject: 'string optional',
        name: 'string optional',
    })),
    actionDef('link_subject', 'Attach a subject to a category hierarchy.', schema({
        subject_id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        category_id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
    })),
    actionDef('unlink_subject', 'Remove a shared subject LINKS edge from a category without detaching hierarchy.', schema({
        subject_id: 'uuid optional',
        subject_action_id: 'action id optional',
        subject_name: 'string optional',
        category_id: 'uuid optional',
        category_action_id: 'action id optional',
        category_name: 'string optional',
    })),
];
exports.SUBJECT_TREE_ACTION_HANDLERS = {
    read_subject: read_1.runReadSubject,
    create_subject: createSubjectAction,
    update_subject: updateSubjectAction,
    delete_subject: deleteSubjectAction,
    link_subject: linkSubjectAction,
    unlink_subject: unlinkSubjectAction,
};

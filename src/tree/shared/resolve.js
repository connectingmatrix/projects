"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordInput = recordInput;
exports.requiredText = requiredText;
exports.optionalText = optionalText;
exports.slug = slug;
exports.readActionCapabilities = readActionCapabilities;
exports.requireCapability = requireCapability;
exports.resultData = resultData;
exports.dependencyResultValue = dependencyResultValue;
exports.resultId = resultId;
exports.actionReferenceId = actionReferenceId;
exports.actionResultValue = actionResultValue;
exports.resolveActionReference = resolveActionReference;
exports.resolveTreeNodeId = resolveTreeNodeId;
exports.resolvePostId = resolvePostId;
const routing_controllers_1 = require("routing-controllers");
const user_matrix_1 = require("@gigav2/manifest/user-matrix");
const permission_context_1 = require("@gigav2/services/auth/permission-context");
const fetchUserTree_1 = require("@gigav2/services/giga/tree/fetchUserTree");
const Post_1 = require("@connectingmatrix/orm/entities/tree/Post");
const graph_types_1 = require("@gigav2/types/graph.types");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actionTokenPattern = /^(?:\$?\{|\{\{)([a-zA-Z0-9_-]+)\.([^}]+?)(?:\}\}|\})$/;
function recordInput(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function requiredText(input, key) {
    const value = String(recordInput(input)[key] || '').trim();
    if (!value)
        throw new routing_controllers_1.BadRequestError(`${key} is required.`);
    return value;
}
function optionalText(input, key) {
    return String(recordInput(input)[key] || '').trim() || undefined;
}
function slug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}
async function readActionCapabilities(runtime) {
    const matrix = await (0, user_matrix_1.readUserMatrixState)(runtime.supabase, { userId: runtime.userId });
    const permissions = (0, permission_context_1.buildPermissionContext)(matrix, false);
    return permissions;
}
async function requireCapability(runtime, key, label) {
    const permissions = runtime.capabilities || (await readActionCapabilities(runtime));
    if (permissions[key] === true)
        return;
    throw new routing_controllers_1.BadRequestError(`Plan access does not allow ${label}.`);
}
function resultData(runtime, actionId, key) {
    var _a, _b;
    const data = ((_b = (_a = runtime.resultsById) === null || _a === void 0 ? void 0 : _a[actionId]) === null || _b === void 0 ? void 0 : _b.data) || {};
    return recordInput(data)[key];
}
function dependencyResultValue(runtime, resultKeys) {
    var _a;
    const dependencyIds = ((_a = runtime.currentAction) === null || _a === void 0 ? void 0 : _a.depends_on) || [];
    for (const actionId of [...dependencyIds].reverse()) {
        for (const resultKey of resultKeys) {
            const value = resultData(runtime, actionId, resultKey);
            const textValue = String(value || '').trim();
            if (textValue)
                return textValue;
            const nestedId = String(recordInput(value).id || '').trim();
            if (nestedId)
                return nestedId;
        }
    }
    return '';
}
function resultId(runtime, actionId) {
    var _a, _b;
    const data = recordInput((_b = (_a = runtime.resultsById) === null || _a === void 0 ? void 0 : _a[actionId]) === null || _b === void 0 ? void 0 : _b.data);
    const direct = ['id', 'channel_id', 'category_id', 'subject_id', 'post_id', 'workflow_id', 'workflowId']
        .map((key) => String(data[key] || '').trim())
        .find(Boolean);
    if (direct)
        return direct;
    for (const key of ['channel', 'category', 'subject', 'post', 'workflow']) {
        const nested = String(recordInput(data[key]).id || recordInput(data[key]).workflowId || '').trim();
        if (nested)
            return nested;
    }
    return '';
}
function actionReferenceId(runtime, value) {
    var _a, _b, _c;
    const raw = String(value || '').trim();
    if (raw && ((_a = runtime.resultsById) === null || _a === void 0 ? void 0 : _a[raw]))
        return raw;
    const placeholder = raw.match(/^to_be_filled_from_([a-zA-Z0-9_-]+)$/);
    if ((placeholder === null || placeholder === void 0 ? void 0 : placeholder[1]) && ((_b = runtime.resultsById) === null || _b === void 0 ? void 0 : _b[placeholder[1]]))
        return placeholder[1];
    const match = raw.match(actionTokenPattern);
    const actionId = String((match === null || match === void 0 ? void 0 : match[1]) || '').trim();
    return actionId && ((_c = runtime.resultsById) === null || _c === void 0 ? void 0 : _c[actionId]) ? actionId : raw;
}
function actionResultValue(runtime, input, actionKeys, resultKeys) {
    for (const actionKey of actionKeys) {
        const actionId = actionReferenceId(runtime, optionalText(input, actionKey) || '');
        if (!actionId)
            continue;
        for (const resultKey of resultKeys) {
            const value = resultData(runtime, actionId, resultKey);
            const textValue = String(value || '').trim();
            if (textValue)
                return textValue;
            const nestedId = String(recordInput(value).id || '').trim();
            if (nestedId)
                return nestedId;
        }
        const direct = resolveActionReference(runtime, optionalText(input, actionKey) || '');
        if (direct && direct !== optionalText(input, actionKey))
            return direct;
    }
    return '';
}
function readPath(source, path) {
    const keys = path
        .split('.')
        .map((key) => String(key || '').trim())
        .filter(Boolean);
    let value = source;
    for (const key of keys) {
        if (!value || typeof value !== 'object')
            return undefined;
        value = value[key];
    }
    return value;
}
function resolveActionReference(runtime, value) {
    var _a, _b, _c, _d, _e, _f, _g;
    const raw = String(value || '').trim();
    const referencedActionId = actionReferenceId(runtime, raw);
    if (referencedActionId && referencedActionId !== raw)
        return resultId(runtime, referencedActionId) || raw;
    if (raw && ((_a = runtime.resultsById) === null || _a === void 0 ? void 0 : _a[raw]))
        return resultId(runtime, raw) || raw;
    const match = raw.match(actionTokenPattern);
    if (!match)
        return raw;
    const actionId = String(match[1] || '').trim();
    const path = String(match[2] || '')
        .trim()
        .replace(/^output\./, '');
    const source = recordInput((_b = runtime.resultsById) === null || _b === void 0 ? void 0 : _b[actionId]);
    if (!Object.keys(source).length || !path)
        return raw;
    const resolved = (_g = (_f = (_e = (_d = (_c = readPath(source, path)) !== null && _c !== void 0 ? _c : readPath(source, `data.${path}`)) !== null && _d !== void 0 ? _d : readPath(source, `action_result.${path}`)) !== null && _e !== void 0 ? _e : readPath(source, `data.action_result.${path}`)) !== null && _f !== void 0 ? _f : readPath(source, path.replace(/^action_result\./, ''))) !== null && _g !== void 0 ? _g : readPath(source, `data.${path.replace(/^action_result\./, '')}`);
    const text = String((resolved && typeof resolved === 'object' ? resolved.id : resolved) || resultId(runtime, actionId)).trim();
    return text || raw;
}
const treeNodes = (items) => {
    const rows = [];
    for (const item of items)
        rows.push(item, ...treeNodes(item.children || []));
    return rows;
};
async function resolveTreeNodeId(runtime, input, params) {
    var _a, _b, _c, _d, _e;
    const body = recordInput(input);
    const rawId = resolveActionReference(runtime, optionalText(body, params.idKey) || '');
    const names = params.nameKeys || [];
    const rawName = names.map((key) => optionalText(body, key)).find(Boolean);
    const lookup = String(rawName || rawId || '').trim();
    if (!lookup)
        throw new routing_controllers_1.BadRequestError(`${params.idKey} or ${params.label}_name is required.`);
    const scopeType = String(runtime.scopeType || ((_b = (_a = runtime.context) === null || _a === void 0 ? void 0 : _a.scope) === null || _b === void 0 ? void 0 : _b.scope_type) || '')
        .trim()
        .toUpperCase();
    const scopeId = String(runtime.scopeId || ((_d = (_c = runtime.context) === null || _c === void 0 ? void 0 : _c.scope) === null || _d === void 0 ? void 0 : _d.scope_id) || '').trim();
    if (rawId && uuidPattern.test(rawId) && rawId === scopeId && scopeType === params.nodeType)
        return rawId;
    if (rawId && uuidPattern.test(rawId) && (((_e = runtime.currentAction) === null || _e === void 0 ? void 0 : _e.depends_on) || []).some((actionId) => resultId(runtime, actionId) === rawId)) {
        return rawId;
    }
    if (rawId && uuidPattern.test(rawId) && !rawName) {
        const node = await (0, fetchUserTree_1.resolveAccessibleTreeNode)({
            userPermissionsId: runtime.userId,
            nodeId: rawId,
            nodeType: params.nodeType,
            organizationId: optionalText(body, 'organization_id') || null,
        });
        if (node)
            return rawId;
        throw new routing_controllers_1.BadRequestError(`${params.label} "${rawId}" was not found or is not accessible.`);
    }
    const scopedRoot = scopeId &&
        (params.preferScopedRoot || params.nodeType !== graph_types_1.RESOURCE_TYPES.channel) &&
        (scopeType === 'CHANNEL' || scopeType === 'CATEGORY' || scopeType === 'SUBJECT')
        ? { rootId: scopeId, rootType: scopeType }
        : {};
    const tree = await (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
        userPermissionsId: runtime.userId,
        includeGlobal: false,
        organizationId: optionalText(body, 'organization_id') || null,
        rootId: rawId && uuidPattern.test(rawId) ? rawId : undefined,
        ...scopedRoot,
    });
    const roots = optionalText(body, 'organization_id') ? tree.organization || [] : tree.user || [];
    const matches = treeNodes(roots).filter((node) => node.nodeType === params.nodeType && (node.id === lookup || node.name === lookup || node.slug === lookup));
    const uniqueMatches = Array.from(new Map(matches.map((node) => [node.id, node])).values());
    if (uniqueMatches.length === 1)
        return uniqueMatches[0].id;
    if (!rawName && rawId && uuidPattern.test(rawId))
        throw new routing_controllers_1.BadRequestError(`${params.label} "${rawId}" was not found or is not accessible.`);
    if (uniqueMatches.length > 1)
        throw new routing_controllers_1.BadRequestError(`Multiple ${params.label}s matched "${lookup}". Use the ${params.idKey} field.`);
    throw new routing_controllers_1.BadRequestError(`${params.label} "${lookup}" was not found or is not accessible.`);
}
async function resolvePostId(runtime, input, params) {
    var _a, _b, _c, _d, _e;
    const body = recordInput(input);
    const explicit = resolveActionReference(runtime, params.idKeys.map((key) => optionalText(body, key)).find(Boolean) || '');
    if (explicit && uuidPattern.test(explicit))
        return explicit;
    const actionId = actionResultValue(runtime, body, params.actionKeys || [], ['post_id', 'post']);
    if (actionId && uuidPattern.test(actionId))
        return actionId;
    const title = params.titleKeys.map((key) => optionalText(body, key)).find(Boolean) || (!uuidPattern.test(explicit) ? explicit : '');
    if (!title)
        throw new routing_controllers_1.BadRequestError('post_id or post title is required.');
    const scopeType = String(runtime.scopeType || ((_b = (_a = runtime.context) === null || _a === void 0 ? void 0 : _a.scope) === null || _b === void 0 ? void 0 : _b.scope_type) || '')
        .trim()
        .toUpperCase();
    const scopeId = String(runtime.scopeId || ((_d = (_c = runtime.context) === null || _c === void 0 ? void 0 : _c.scope) === null || _d === void 0 ? void 0 : _d.scope_id) || '').trim();
    if (scopeId && (scopeType === 'CHANNEL' || scopeType === 'CATEGORY' || scopeType === 'SUBJECT')) {
        const tree = await (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
            userPermissionsId: runtime.userId,
            organizationId: optionalText(body, 'organization_id') || null,
            rootId: scopeId,
            rootType: scopeType,
        });
        const scopedPosts = treeNodes([...(tree.user || []), ...(tree.organization || []), ...(tree.global || [])])
            .flatMap((node) => node.posts || [])
            .filter((post) => post.id === title || post.title === title);
        const scopedMatches = Array.from(new Map(scopedPosts.map((post) => [post.id, post])).values());
        if (scopedMatches.length === 1)
            return String(scopedMatches[0].id || '');
        if (scopedMatches.length > 1)
            throw new routing_controllers_1.BadRequestError(`Multiple posts matched "${title}". Use the post id.`);
    }
    const rows = await Post_1.Post.listIdRowsByTitle(title);
    if (rows.length === 1)
        return String(((_e = rows[0]) === null || _e === void 0 ? void 0 : _e.id) || '');
    if (rows.length > 1)
        throw new routing_controllers_1.BadRequestError(`Multiple posts matched "${title}". Use the post id.`);
    throw new routing_controllers_1.BadRequestError(`Post "${title}" was not found or is not accessible.`);
}

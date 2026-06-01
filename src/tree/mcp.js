"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMcpTreeAction = exports.fetchMcpTree = exports.WORKFLOW_TREE_GROUPED_ACTIONS = exports.TREE_ACTION_NAMES = exports.TREE_ACTION_CATALOG = exports.TREE_MUTATING_ACTION_NAMES = exports.TREE_READ_ACTION_NAMES = exports.FETCH_TREE_ACTION_CATALOG = void 0;
exports.isTreeAction = isTreeAction;
exports.executeTreeAction = executeTreeAction;
exports.ensureMcpChannelPath = ensureMcpChannelPath;
exports.ensureMcpKnowledgePosts = ensureMcpKnowledgePosts;
const routing_controllers_1 = require("routing-controllers");
const giga_ai_helper_1 = require("giga-ai-helper");
const Post_1 = require("@connectingmatrix/orm/entities/tree/Post");
const fetchUserTree_1 = require("./fetchUserTree");
const fetch_1 = require("./fetch");
const mcp_1 = require("./channel/mcp");
const mcp_2 = require("./category/mcp");
const mcp_3 = require("./subject/mcp");
const mcp_4 = require("./post/mcp");
const inputRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const schema = (input) => input;
const actionDef = (name, description, input_schema, mutating = true) => ({
    name,
    description,
    input_schema,
    mutating,
});
const pathSegments = (value) => {
    if (Array.isArray(value))
        return value.map((item) => (0, giga_ai_helper_1.toSafeString)(item)).filter(Boolean);
    return (0, giga_ai_helper_1.toSafeString)(value)
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);
};
const treeNodes = (items) => {
    const rows = [];
    for (const item of items || [])
        rows.push(item, ...treeNodes(item.children || []));
    return rows;
};
const childChannels = (items, parentId) => {
    if (!parentId)
        return items.filter((item) => (item === null || item === void 0 ? void 0 : item.nodeType) === 'CHANNEL');
    const parent = treeNodes(items).find((item) => (item === null || item === void 0 ? void 0 : item.id) === parentId);
    return ((parent === null || parent === void 0 ? void 0 : parent.children) || []).filter((item) => (item === null || item === void 0 ? void 0 : item.nodeType) === 'CHANNEL');
};
exports.FETCH_TREE_ACTION_CATALOG = [
    actionDef('fetch_user_tree', 'Fetch the current user tree of channels, categories, subjects, and posts.', schema({ root_id: 'uuid optional' }), false),
];
exports.TREE_READ_ACTION_NAMES = [
    'fetch_user_tree',
    ...mcp_1.CHANNEL_TREE_READ_ACTION_NAMES,
    ...mcp_2.CATEGORY_TREE_READ_ACTION_NAMES,
    ...mcp_3.SUBJECT_TREE_READ_ACTION_NAMES,
    ...mcp_4.POST_TREE_READ_ACTION_NAMES,
];
exports.TREE_MUTATING_ACTION_NAMES = [
    ...mcp_1.CHANNEL_TREE_MUTATING_ACTION_NAMES,
    ...mcp_2.CATEGORY_TREE_MUTATING_ACTION_NAMES,
    ...mcp_3.SUBJECT_TREE_MUTATING_ACTION_NAMES,
    ...mcp_4.POST_TREE_MUTATING_ACTION_NAMES,
];
exports.TREE_ACTION_CATALOG = [
    ...exports.FETCH_TREE_ACTION_CATALOG,
    ...mcp_1.CHANNEL_TREE_ACTION_CATALOG,
    ...mcp_2.CATEGORY_TREE_ACTION_CATALOG,
    ...mcp_3.SUBJECT_TREE_ACTION_CATALOG,
    ...mcp_4.POST_TREE_ACTION_CATALOG,
];
exports.TREE_ACTION_NAMES = new Set([
    'fetch_user_tree',
    ...mcp_1.CHANNEL_TREE_ACTION_NAMES,
    ...mcp_2.CATEGORY_TREE_ACTION_NAMES,
    ...mcp_3.SUBJECT_TREE_ACTION_NAMES,
    ...mcp_4.POST_TREE_ACTION_NAMES,
]);
exports.WORKFLOW_TREE_GROUPED_ACTIONS = {
    'run-channel-action': mcp_1.CHANNEL_TREE_ACTION_NAMES,
    'run-category-action': mcp_2.CATEGORY_TREE_ACTION_NAMES,
    'run-subject-action': mcp_3.SUBJECT_TREE_ACTION_NAMES,
    'run-post-action': mcp_4.POST_TREE_ACTION_NAMES,
    'run-user-tree-action': ['fetch_user_tree'],
};
const TREE_ACTION_HANDLERS = {
    fetch_user_tree: fetch_1.runFetchUserTree,
    ...mcp_1.CHANNEL_TREE_ACTION_HANDLERS,
    ...mcp_2.CATEGORY_TREE_ACTION_HANDLERS,
    ...mcp_3.SUBJECT_TREE_ACTION_HANDLERS,
    ...mcp_4.POST_TREE_ACTION_HANDLERS,
};
function isTreeAction(name) {
    return exports.TREE_ACTION_NAMES.has(name);
}
async function executeTreeAction(name, runtime, input) {
    const handler = TREE_ACTION_HANDLERS[name];
    if (!handler)
        throw new Error(`Unsupported tree action ${name}.`);
    return handler(runtime, input);
}
const fetchMcpTree = (runtime, args) => (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
    userPermissionsId: runtime.userId || '',
    organizationId: (0, giga_ai_helper_1.toSafeString)(args.organizationId) || null,
    rootId: (0, giga_ai_helper_1.toSafeString)(args.rootId) || undefined,
    rootType: ((0, giga_ai_helper_1.toSafeString)(args.rootType) || undefined),
    includeGlobal: args.includeGlobal !== false,
});
exports.fetchMcpTree = fetchMcpTree;
const runMcpTreeAction = (runtime, args) => {
    const action = (0, giga_ai_helper_1.toSafeString)(args.action);
    if (!exports.TREE_ACTION_NAMES.has(action))
        throw new routing_controllers_1.BadRequestError(`Unsupported tree action "${action}".`);
    const input = inputRecord(args.input);
    if (args.dryRun === true)
        return Promise.resolve({ action, input });
    return executeTreeAction(action, runtime, input);
};
exports.runMcpTreeAction = runMcpTreeAction;
async function ensureMcpChannelPath(runtime, args) {
    var _a, _b, _c;
    const organizationId = (0, giga_ai_helper_1.toSafeString)(args.organizationId);
    const segments = pathSegments(args.path || args.segments);
    if (!segments.length)
        throw new routing_controllers_1.BadRequestError('path or segments are required.');
    if (args.dryRun === true)
        return { action: 'ensure_channel_path', organizationId, segments };
    let tree = await (0, exports.fetchMcpTree)(runtime, args);
    let parentId = null;
    const created = [];
    const resolved = [];
    for (const segment of segments) {
        const roots = organizationId ? tree.organization || [] : tree.user || [];
        const match = childChannels(roots, parentId).find((node) => String(node.name || '').toLowerCase() === segment.toLowerCase() || String(node.slug || '').toLowerCase() === segment.toLowerCase());
        if (match) {
            parentId = String(match.id);
            resolved.push(match);
            continue;
        }
        const scopeId = organizationId || runtime.userId;
        const channelSlug = segment
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'channel';
        const result = await executeTreeAction('create_channel', runtime, {
            userPermissionsId: runtime.userId,
            scopeId,
            organizationId: organizationId || undefined,
            parentChannelId: parentId || undefined,
            channel: { name: segment, slug: channelSlug },
        });
        const channel = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.channel) || { id: (_b = result.data) === null || _b === void 0 ? void 0 : _b.channel_id, name: segment };
        parentId = String(channel.id || ((_c = result.data) === null || _c === void 0 ? void 0 : _c.channel_id) || '');
        created.push(channel);
        resolved.push(channel);
        tree = await (0, exports.fetchMcpTree)(runtime, args);
    }
    return { channelId: parentId, path: segments.join('/'), created, resolved };
}
async function ensureMcpKnowledgePosts(runtime, args) {
    var _a, _b, _c;
    let subjectId = (0, giga_ai_helper_1.toSafeString)(args.subjectId || args.subject_id);
    if (!subjectId && (0, giga_ai_helper_1.toSafeString)(args.subjectName || args.subject_name)) {
        const subject = await executeTreeAction('read_subject', runtime, {
            subject_name: (0, giga_ai_helper_1.toSafeString)(args.subjectName || args.subject_name),
            organization_id: (0, giga_ai_helper_1.toSafeString)(args.organizationId),
        }).catch(() => null);
        subjectId = (0, giga_ai_helper_1.toSafeString)((_b = (_a = subject === null || subject === void 0 ? void 0 : subject.data) === null || _a === void 0 ? void 0 : _a.subject) === null || _b === void 0 ? void 0 : _b.id);
    }
    if (!subjectId && (0, giga_ai_helper_1.toSafeString)(args.categoryId || args.category_id)) {
        const created = await executeTreeAction('create_subject', runtime, {
            name: (0, giga_ai_helper_1.toSafeString)(args.subjectName || args.subject_name || 'Knowledge'),
            categoryId: (0, giga_ai_helper_1.toSafeString)(args.categoryId || args.category_id),
            organizationId: (0, giga_ai_helper_1.toSafeString)(args.organizationId),
            userPermissionsId: runtime.userId,
        });
        subjectId = (0, giga_ai_helper_1.toSafeString)((_c = created.data) === null || _c === void 0 ? void 0 : _c.subject_id);
    }
    if (!subjectId)
        throw new routing_controllers_1.BadRequestError('subjectId, subjectName, or categoryId is required.');
    const posts = Array.isArray(args.posts) ? args.posts.map(inputRecord) : [];
    if (args.dryRun === true)
        return { action: 'ensure_knowledge_posts', subjectId, posts };
    const rows = await Post_1.PostEntity.ensureKnowledgePosts(subjectId, posts);
    return { subjectId, posts: rows, count: rows.length };
}

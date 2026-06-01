"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldApplyTreeOrganizationContext = shouldApplyTreeOrganizationContext;
exports.canAccessOrganizationTree = canAccessOrganizationTree;
exports.canReadOrganizationTreePosts = canReadOrganizationTreePosts;
exports.filterTreeGraphForOrganizationAccess = filterTreeGraphForOrganizationAccess;
exports.filterTreePostsForOrganizationAccess = filterTreePostsForOrganizationAccess;
const giga_ai_helper_1 = require("giga-ai-helper");
const NODE_LABEL_TO_MODULE = [
    { label: 'Channel', module: 'CHANNEL' },
    { label: 'Category', module: 'CATEGORY' },
    { label: 'SubjectRef', module: 'SUBJECT' },
];
function getReadPermission(accessContext, module) {
    var _a;
    if (accessContext.bypassPermissions) {
        return true;
    }
    return ((_a = accessContext.modulePermissions[module]) === null || _a === void 0 ? void 0 : _a.allowRead) !== false;
}
function inferNodeModule(node) {
    for (const candidate of NODE_LABEL_TO_MODULE) {
        if (node.labels.includes(candidate.label)) {
            return candidate.module;
        }
    }
    return null;
}
function isTreeNodeDenied(accessContext, node) {
    const module = inferNodeModule(node);
    if (!module)
        return false;
    if (module === 'CHANNEL')
        return accessContext.deniedChannelIds.has(node.id);
    if (module === 'CATEGORY')
        return accessContext.deniedCategoryIds.has(node.id);
    return accessContext.deniedSubjectIds.has(node.id);
}
function canReadGraphNode(accessContext, node) {
    var _a;
    if (!accessContext)
        return true;
    if (!getReadPermission(accessContext, (_a = inferNodeModule(node)) !== null && _a !== void 0 ? _a : 'CHANNEL'))
        return false;
    if (isTreeNodeDenied(accessContext, node))
        return false;
    return true;
}
function shouldApplyTreeOrganizationContext(organizationId) {
    return Boolean((0, giga_ai_helper_1.toSafeString)(organizationId));
}
function canAccessOrganizationTree(accessContext) {
    if (!accessContext)
        return true;
    if (accessContext.bypassPermissions)
        return true;
    return accessContext.hasMembership;
}
function canReadOrganizationTreePosts(accessContext) {
    if (!accessContext)
        return true;
    return getReadPermission(accessContext, 'POST');
}
function filterTreeGraphForOrganizationAccess(params) {
    var _a, _b;
    const accessContext = (_a = params.accessContext) !== null && _a !== void 0 ? _a : null;
    if (!accessContext) {
        return params.graph;
    }
    const nodeById = new Map();
    const edgesBySourceId = new Map();
    for (const node of params.graph.nodes) {
        nodeById.set(node.id, node);
    }
    for (const edge of params.graph.edges) {
        const bucket = (_b = edgesBySourceId.get(edge.sourceId)) !== null && _b !== void 0 ? _b : [];
        bucket.push(edge);
        edgesBySourceId.set(edge.sourceId, bucket);
    }
    const keptNodeIds = new Set();
    const keptEdges = [];
    const visit = (nodeId) => {
        var _a;
        if (keptNodeIds.has(nodeId))
            return;
        const node = nodeById.get(nodeId);
        if (!node || !canReadGraphNode(accessContext, node)) {
            return;
        }
        keptNodeIds.add(nodeId);
        for (const edge of (_a = edgesBySourceId.get(nodeId)) !== null && _a !== void 0 ? _a : []) {
            const child = nodeById.get(edge.targetId);
            if (!child || !canReadGraphNode(accessContext, child)) {
                continue;
            }
            keptEdges.push(edge);
            visit(edge.targetId);
        }
    };
    visit(params.rootId);
    return {
        nodes: params.graph.nodes.filter((node) => keptNodeIds.has(node.id)),
        edges: keptEdges.filter((edge) => keptNodeIds.has(edge.sourceId) && keptNodeIds.has(edge.targetId)),
    };
}
function filterTreePostsForOrganizationAccess(posts, accessContext) {
    const orgContext = accessContext !== null && accessContext !== void 0 ? accessContext : null;
    if (!orgContext)
        return posts;
    if (!canReadOrganizationTreePosts(orgContext))
        return [];
    return posts.filter((post) => !orgContext.deniedPostIds.has((0, giga_ai_helper_1.toSafeString)(post.id)));
}

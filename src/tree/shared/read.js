"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentExcerpt = contentExcerpt;
exports.readTreeNode = readTreeNode;
exports.assertNodeType = assertNodeType;
exports.runReadChannel = runReadChannel;
exports.runReadCategory = runReadCategory;
exports.runReadSubject = runReadSubject;
const routing_controllers_1 = require("routing-controllers");
const entities_1 = require("@connectingmatrix/orm/entities");
const system_1 = require("@gigav2/services/giga/tree/system");
const Subject_1 = require("@connectingmatrix/orm/entities/tree/Subject");
const fetchUserTree_1 = require("@gigav2/services/giga/tree/fetchUserTree");
const graph_types_1 = require("@gigav2/types/graph.types");
const types_1 = require("../types");
const resolve_1 = require("./resolve");
const MAX_TEXT = 1200;
function contentExcerpt(value) {
    const text = String(value || '');
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}
function nodes(items) {
    const rows = [];
    for (const item of items) {
        rows.push(item, ...nodes(item.children || []));
    }
    return rows;
}
async function readTreeNode(runtime, input, capability, label) {
    await (0, resolve_1.requireCapability)(runtime, capability, `${label} read`);
    const id = (0, resolve_1.requiredText)(input, 'id');
    const tree = await (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
        userPermissionsId: runtime.userId,
        rootId: id,
        organizationId: (0, resolve_1.optionalText)(input, 'organization_id') || null,
    });
    const match = nodes([...(tree.user || []), ...(tree.organization || []), ...(tree.global || [])]).find((node) => node.id === id);
    if (!match)
        throw new routing_controllers_1.BadRequestError(`${label} not found or not accessible.`);
    return match;
}
function assertNodeType(node, label) {
    const expected = label === 'channel' ? graph_types_1.RESOURCE_TYPES.channel : label === 'category' ? graph_types_1.RESOURCE_TYPES.category : graph_types_1.RESOURCE_TYPES.subject;
    if (node.nodeType !== expected)
        throw new routing_controllers_1.BadRequestError(`${label} id resolved to ${node.nodeType}.`);
}
function nodeData(node) {
    var _a, _b;
    return {
        id: node.id,
        nodeType: node.nodeType,
        name: node.name || null,
        slug: node.slug || null,
        description: node.description || null,
        isGlobal: node.isGlobal === true,
        children_count: ((_a = node.children) === null || _a === void 0 ? void 0 : _a.length) || 0,
        posts_count: ((_b = node.posts) === null || _b === void 0 ? void 0 : _b.length) || 0,
        permission: node.permission || null,
    };
}
const graphLabelByType = {
    [graph_types_1.RESOURCE_TYPES.channel]: graph_types_1.GRAPH_LABELS.channel,
    [graph_types_1.RESOURCE_TYPES.category]: graph_types_1.GRAPH_LABELS.category,
    [graph_types_1.RESOURCE_TYPES.subject]: graph_types_1.GRAPH_LABELS.subjectRef,
};
async function readPersonalNodeData(runtime, id, nodeType) {
    const neo = await system_1.TreeGraphEntity.getNeo();
    const rows = await neo.run(`
      MATCH (node:${graphLabelByType[nodeType]} {id: $id})
      WHERE node.createdBy = $userPermissionsId AND coalesce(node.organizationId, '') = ''
      OPTIONAL MATCH (node)-[:CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT]->(child)
      RETURN properties(node) AS node, count(DISTINCT child) AS childrenCount
      LIMIT 1
    `, { id, userPermissionsId: runtime.userId });
    const row = rows[0];
    if (!(row === null || row === void 0 ? void 0 : row.node))
        return null;
    return {
        id: row.node.id,
        nodeType,
        name: row.node.name || null,
        slug: row.node.slug || null,
        description: row.node.description || null,
        isGlobal: row.node.isGlobal === true,
        children_count: Number(row.childrenCount || 0),
        posts_count: 0,
        permission: null,
    };
}
async function readOrganizationChannel(runtime, input, id) {
    const organizationId = (0, resolve_1.optionalText)(input, 'organization_id') || (0, resolve_1.optionalText)(input, 'organizationId');
    if (!organizationId)
        return null;
    const [access, restrictions] = await Promise.all([
        entities_1.OrganisationEntity.readScopeAccessRows(runtime.userId, organizationId),
        entities_1.OrganisationEntity.readRestrictionRows({
            table: 'organization_node_restrictions',
            orgIds: [organizationId],
            fieldSelect: 'node_id,node_type',
            userId: runtime.userId,
        }),
    ]);
    const blocked = restrictions
        .map((row) => row)
        .some((row) => String(row.node_type || '').toUpperCase() === 'CHANNEL' && String(row.node_id || '') === id);
    if (!access.organization || access.organization.is_active === false)
        throw new routing_controllers_1.BadRequestError('Organization not found or inactive.');
    if (!access.membership)
        throw new routing_controllers_1.BadRequestError('Channel not found or not accessible.');
    if (blocked)
        throw new routing_controllers_1.BadRequestError('Channel not found or not accessible.');
    const neo = await system_1.TreeGraphEntity.getNeo();
    const rows = await neo.run(`
      MATCH (organizationNode:Organisation {id: $organizationId})-[grant:OWNS|LINKS]->(ancestor)
      MATCH path = (ancestor)-[:CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT|LINKS*0..]->(root:Channel {id: $id})
      WHERE ancestor.id = root.id OR type(grant) IN ['OWNS', 'LINKS'] OR coalesce(grant.recursive, false) = true
      WITH root, grant, ancestor, path
      ORDER BY length(path) ASC
      LIMIT 1
      OPTIONAL MATCH (root)-[:CONTAINS_CHANNEL]->(childChannel:Channel)
      OPTIONAL MATCH (root)-[:CONTAINS_CATEGORY|LINKS]->(category:Category)
      RETURN properties(root) AS channel, type(grant) AS grantType, ancestor.id AS ancestorId,
        count(DISTINCT childChannel) + count(DISTINCT category) AS childrenCount
    `, { id, organizationId });
    const row = rows[0];
    if (!(row === null || row === void 0 ? void 0 : row.channel))
        throw new routing_controllers_1.BadRequestError('Channel not found or not accessible.');
    return {
        id: row.channel.id,
        nodeType: graph_types_1.RESOURCE_TYPES.channel,
        name: row.channel.name || null,
        slug: row.channel.slug || null,
        description: row.channel.description || null,
        isGlobal: row.channel.isGlobal === true,
        children_count: Number(row.childrenCount || 0),
        posts_count: 0,
        permission: {
            sourceUserPermissionsId: runtime.userId,
            grantedByUserPermissionsId: null,
            grantType: row.grantType || 'LINKS',
            read: true,
            write: row.grantType === 'OWNS',
            recursive: true,
            availableFrom: null,
            availableTo: null,
            inheritedFromResourceId: row.ancestorId || id,
        },
    };
}
const channelSelector = (input) => {
    const prefix = (0, resolve_1.optionalText)(input, 'name_prefix') ||
        (0, resolve_1.optionalText)(input, 'namePrefix') ||
        (0, resolve_1.optionalText)(input, 'starts_with') ||
        (0, resolve_1.optionalText)(input, 'startsWith') ||
        (0, resolve_1.optionalText)(input, 'prefix');
    const name = (0, resolve_1.optionalText)(input, 'name') || (0, resolve_1.optionalText)(input, 'channel_name') || (0, resolve_1.optionalText)(input, 'channelName') || (0, resolve_1.optionalText)(input, 'slug');
    const match = (0, resolve_1.optionalText)(input, 'match') || (0, resolve_1.optionalText)(input, 'query');
    const wildcard = String(name || match || '').trim();
    const wildcardPrefix = wildcard.endsWith('*') ? wildcard.slice(0, -1).trim() : '';
    return { prefix: String(prefix || wildcardPrefix || '').trim(), exact: String(wildcardPrefix ? '' : wildcard).trim() };
};
const channelRows = (tree) => nodes([...(tree.user || []), ...(tree.organization || []), ...(tree.global || [])])
    .filter((node) => node.nodeType === graph_types_1.RESOURCE_TYPES.channel)
    .map((node) => {
    var _a, _b;
    return ({
        id: node.id,
        name: node.name || null,
        slug: node.slug || null,
        description: node.description || null,
        isGlobal: node.isGlobal === true,
        children_count: ((_a = node.children) === null || _a === void 0 ? void 0 : _a.length) || 0,
        posts_count: ((_b = node.posts) === null || _b === void 0 ? void 0 : _b.length) || 0,
        permission: node.permission || null,
    });
});
async function runReadChannel(runtime, input) {
    await (0, resolve_1.requireCapability)(runtime, 'CAN_READ_CHANNEL', 'channel read');
    const id = (0, resolve_1.actionResultValue)(runtime, input, ['channel_action_id'], ['channel_id', 'channel']) || (0, resolve_1.optionalText)(input, 'id');
    if (id) {
        const directChannel = await readOrganizationChannel(runtime, input, id);
        if (directChannel)
            return { summary: `Read channel "${directChannel.name || directChannel.id}".`, data: { channel: directChannel }, ...types_1.emptyActionArtifacts };
        const personalChannel = await readPersonalNodeData(runtime, id, graph_types_1.RESOURCE_TYPES.channel);
        if (personalChannel)
            return {
                summary: `Read channel "${personalChannel.name || personalChannel.id}".`,
                data: { channel: personalChannel },
                ...types_1.emptyActionArtifacts,
            };
        const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_CHANNEL', 'channel');
        assertNodeType(node, 'channel');
        const channel = nodeData(node);
        return { summary: `Read channel "${channel.name || channel.id}".`, data: { channel }, ...types_1.emptyActionArtifacts };
    }
    const selector = channelSelector(input);
    if (!selector.prefix && !selector.exact)
        throw new routing_controllers_1.BadRequestError('read_channel requires id, name, or name_prefix.');
    const tree = await (0, fetchUserTree_1.fetchUserTree)(runtime.supabase, {
        userPermissionsId: runtime.userId,
        organizationId: (0, resolve_1.optionalText)(input, 'organization_id') || (0, resolve_1.optionalText)(input, 'organizationId') || null,
    });
    const rows = channelRows(tree);
    const prefix = selector.prefix.toLowerCase();
    const exact = selector.exact.toLowerCase();
    const matches = rows.filter((channel) => {
        const name = String(channel.name || '').toLowerCase();
        const slug = String(channel.slug || '').toLowerCase();
        if (selector.prefix)
            return name.startsWith(prefix) || slug.startsWith(prefix);
        return channel.id === selector.exact || name === exact || slug === exact;
    });
    const key = selector.prefix ? `${selector.prefix}*` : selector.exact;
    return {
        summary: matches.length ? `Matched ${matches.length} channel(s) for "${key}".` : `No channel found for selector "${key}".`,
        data: { selector: key, matched_count: matches.length, matched_channels: matches, channel: matches.length === 1 ? matches[0] : null },
        ...types_1.emptyActionArtifacts,
    };
}
async function runReadCategory(runtime, input) {
    await (0, resolve_1.requireCapability)(runtime, 'CAN_READ_CATEGORY', 'category read');
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, { ...input, id: (0, resolve_1.actionResultValue)(runtime, input, ['category_action_id'], ['category_id', 'category']) || (0, resolve_1.optionalText)(input, 'id') }, { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.category });
    const personalCategory = await readPersonalNodeData(runtime, id, graph_types_1.RESOURCE_TYPES.category);
    if (personalCategory)
        return {
            summary: `Read category "${personalCategory.name || personalCategory.id}".`,
            data: { category: personalCategory },
            ...types_1.emptyActionArtifacts,
        };
    const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_CATEGORY', 'category');
    assertNodeType(node, 'category');
    const category = nodeData(node);
    return { summary: `Read category "${category.name || category.id}".`, data: { category }, ...types_1.emptyActionArtifacts };
}
async function runReadSubject(runtime, input) {
    await (0, resolve_1.requireCapability)(runtime, 'CAN_READ_SUBJECT', 'subject read');
    const id = await (0, resolve_1.resolveTreeNodeId)(runtime, { ...input, id: (0, resolve_1.actionResultValue)(runtime, input, ['subject_action_id'], ['subject_id', 'subject']) || (0, resolve_1.optionalText)(input, 'id') }, { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: graph_types_1.RESOURCE_TYPES.subject });
    const personalSubject = await readPersonalNodeData(runtime, id, graph_types_1.RESOURCE_TYPES.subject);
    let graph = personalSubject;
    if (!graph) {
        const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_SUBJECT', 'subject');
        assertNodeType(node, 'subject');
        graph = nodeData(node);
    }
    const row = await Subject_1.Subject.single(id);
    if (!row)
        throw new routing_controllers_1.BadRequestError('Subject not found.');
    const data = row.extract();
    const subject = { ...data, graph, summary: contentExcerpt(data.summary) };
    return { summary: `Read subject "${String(data.name || data.id || id)}".`, data: { subject }, ...types_1.emptyActionArtifacts };
}

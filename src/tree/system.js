"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeGraphEntity = void 0;
const routing_controllers_1 = require("routing-controllers");
const fetchUserTree_1 = require("@gigav2/services/giga/tree/fetchUserTree");
const graph_types_1 = require("@gigav2/types/graph.types");
const neo_1 = require("@gigav2/decorators/neo");
const requireRecord = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new routing_controllers_1.BadRequestError(`${label} must be an object.`);
    return value;
};
const enforceKeys = (label, value, keys) => {
    const allowed = new Set(keys);
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new routing_controllers_1.BadRequestError(`${label}.${key} is not supported.`);
};
const readTextOrNull = (value, _label) => {
    const text = String(value || '').trim();
    return text || null;
};
const requireBoolean = (value, label) => {
    if (typeof value !== 'boolean')
        throw new routing_controllers_1.BadRequestError(`${label} must be a boolean.`);
    return value;
};
class TreeGraphEntity {
    static async getNeo() {
        return neo_1.Neo4JConnection.getInstance();
    }
    static async fetchTreeByUser(auth, input) {
        var _a, _b, _c;
        return (0, fetchUserTree_1.fetchUserTree)(auth.context.supabase, {
            userPermissionsId: auth.userId,
            rootId: input.rootId || undefined,
            rootType: input.rootType || undefined,
            depth: (_a = input.depth) !== null && _a !== void 0 ? _a : null,
            includeCounts: input.includeCounts === true,
            includeGlobal: input.includeGlobal,
            includePosts: input.includePosts !== false,
            first: (_b = input.first) !== null && _b !== void 0 ? _b : null,
            offset: (_c = input.offset) !== null && _c !== void 0 ? _c : null,
            organizationId: input.organizationId || null,
            nowIso: input.nowIso || undefined,
        });
    }
    static parseTreeFetchInput(input) {
        const value = requireRecord(input, 'tree.fetchTree input');
        enforceKeys('tree.fetchTree input', value, [
            'rootId',
            'rootType',
            'depth',
            'includeCounts',
            'includeGlobal',
            'includePosts',
            'first',
            'offset',
            'organizationId',
            'nowIso',
        ]);
        const inputRootType = readTextOrNull(value.rootType, 'tree.fetchTree input.rootType');
        if (inputRootType &&
            inputRootType !== graph_types_1.RESOURCE_TYPES.channel &&
            inputRootType !== graph_types_1.RESOURCE_TYPES.category &&
            inputRootType !== graph_types_1.RESOURCE_TYPES.subject) {
            throw new routing_controllers_1.BadRequestError('tree.fetchTree input.rootType is invalid.');
        }
        const rootType = (inputRootType || null);
        const rootId = readTextOrNull(value.rootId, 'tree.fetchTree input.rootId');
        const depth = value.depth === null || value.depth === undefined ? null : Math.max(0, Math.floor(Number(value.depth)));
        const first = value.first === null || value.first === undefined ? null : Math.max(0, Math.floor(Number(value.first)));
        const offset = value.offset === null || value.offset === undefined ? null : Math.max(0, Math.floor(Number(value.offset)));
        if (depth !== null && !Number.isFinite(depth))
            throw new routing_controllers_1.BadRequestError('tree.fetchTree input.depth must be a number.');
        if (first !== null && !Number.isFinite(first))
            throw new routing_controllers_1.BadRequestError('tree.fetchTree input.first must be a number.');
        if (offset !== null && !Number.isFinite(offset))
            throw new routing_controllers_1.BadRequestError('tree.fetchTree input.offset must be a number.');
        if (rootId && rootId === graph_types_1.GRAPH_SYSTEM_IDS.userGlobal) {
            return {
                rootId,
                rootType: graph_types_1.RESOURCE_TYPES.channel,
                depth,
                includeCounts: value.includeCounts === true,
                includeGlobal: requireBoolean(value.includeGlobal, 'tree.fetchTree input.includeGlobal'),
                includePosts: value.includePosts !== false,
                first,
                offset,
                organizationId: readTextOrNull(value.organizationId, 'tree.fetchTree input.organizationId'),
                nowIso: readTextOrNull(value.nowIso, 'tree.fetchTree input.nowIso'),
            };
        }
        return {
            rootId,
            rootType,
            depth,
            includeCounts: value.includeCounts === true,
            includeGlobal: requireBoolean(value.includeGlobal, 'tree.fetchTree input.includeGlobal'),
            includePosts: value.includePosts !== false,
            first,
            offset,
            organizationId: readTextOrNull(value.organizationId, 'tree.fetchTree input.organizationId'),
            nowIso: readTextOrNull(value.nowIso, 'tree.fetchTree input.nowIso'),
        };
    }
    static async readCount(statement, params) {
        var _a;
        const rows = await (await neo_1.Neo4JConnection.getInstance()).run(statement, params);
        return Number((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) || 0;
    }
    static async mergeFixtureNodesByLabel(label, nodes) {
        if (!nodes.length)
            return;
        await (await neo_1.Neo4JConnection.getInstance()).run(`
        UNWIND $nodes AS node
        MERGE (n:${label} {id: node.id})
        SET n += node.props
        RETURN count(n) AS count
      `, { nodes });
    }
    static async mergeFixtureEdges(input) {
        if (!input.rows.length)
            return;
        await (await neo_1.Neo4JConnection.getInstance()).run(`
        UNWIND $rows AS row
        MATCH (source:${input.sourceLabel} {id: row.sourceId})
        MATCH (target:${input.targetLabel} {id: row.targetId})
        MERGE (source)-[rel:${input.relation}]->(target)
        SET rel += row.props
        SET rel.createdAt = coalesce(rel.createdAt, $nowIso)
        SET rel.updatedAt = $nowIso
        RETURN count(rel) AS count
      `, { rows: input.rows, nowIso: input.nowIso });
    }
    static async cleanupFixtureGraph(input) {
        await (await neo_1.Neo4JConnection.getInstance()).run(`
        MATCH (n)
        WHERE (n.id STARTS WITH $prefix OR n.id IN $extraPermissionIds)
          AND n.id <> $userGlobal
        DETACH DELETE n
        RETURN count(n) AS count
      `, input);
    }
    static readScopeWhere(organizationId) {
        return organizationId
            ? `coalesce(node.organizationId, '') = $organizationId`
            : `coalesce(node.organizationId, '') = '' AND coalesce(node.isGlobal, false) = false AND coalesce(node.createdBy, '') = $userId`;
    }
    static async readScopedSubjectIds(input) {
        const rows = await (await neo_1.Neo4JConnection.getInstance()).run(`MATCH (node:${graph_types_1.GRAPH_LABELS.subjectRef}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN DISTINCT node.id AS id`, input);
        return rows.map((row) => row.id).filter(Boolean);
    }
    static readScopedChannelCount(input) {
        return this.readCount(`MATCH (node:${graph_types_1.GRAPH_LABELS.channel}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN count(DISTINCT node) AS count`, input);
    }
    static readScopedSubjectCount(input) {
        return this.readCount(`MATCH (node:${graph_types_1.GRAPH_LABELS.subjectRef}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN count(DISTINCT node) AS count`, input);
    }
    static readScopedShareCount(input) {
        const scope = input.organizationId
            ? `coalesce(resource.organizationId, '') = $organizationId`
            : `coalesce(resource.organizationId, '') = '' AND coalesce(resource.createdBy, '') = $userId`;
        return this.readCount(`MATCH (:${graph_types_1.GRAPH_LABELS.userPermissions} {id: $userId})-[rel:${graph_types_1.ACCESS_RELATIONS.canAccess}|${graph_types_1.ACCESS_RELATIONS.subscribedTo}]->(resource) WHERE ${scope} RETURN count(DISTINCT rel) AS count`, input);
    }
    static readScopedLinkCount(input) {
        const scope = input.organizationId
            ? `(coalesce(source.organizationId, '') = $organizationId OR coalesce(target.organizationId, '') = $organizationId)`
            : `coalesce(source.organizationId, '') = '' AND coalesce(target.organizationId, '') = '' AND (coalesce(source.createdBy, '') = $userId OR coalesce(target.createdBy, '') = $userId)`;
        return this.readCount(`MATCH (source)-[rel:${graph_types_1.STRUCTURAL_RELATIONS.links}]->(target) WHERE coalesce(rel.createdByUserPermissionsId, '') = $userId AND ${scope} RETURN count(DISTINCT rel) AS count`, input);
    }
    static async readOrganizationScopeRows(input) {
        const label = input.scopeType === 'channel' ? 'Channel' : 'Category';
        const neo = await neo_1.Neo4JConnection.getInstance();
        return neo.run(`
      MATCH (organizationNode:Organisation {id: $organizationId})-[grant:OWNS|LINKS]->(ancestor)
      MATCH accessPath = (ancestor)-[:CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT|LINKS*0..]->(root:${label} {id: $id})
      WHERE ancestor.id = root.id OR type(grant) IN ['OWNS', 'LINKS'] OR coalesce(grant.recursive, false) = true
      WITH root, accessPath
      ORDER BY length(accessPath) ASC
      LIMIT 1
      OPTIONAL MATCH subjectPath = (root)-[:CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT|LINKS*0..]->(subject:SubjectRef)
      RETURN properties(root) AS root,
        subject.id AS subjectId,
        [node IN nodes(subjectPath) WHERE node:Channel | node.id] AS channelIds,
        [node IN nodes(subjectPath) WHERE node:Category | node.id] AS categoryIds
    `, { id: input.id, organizationId: input.organizationId });
    }
    static async listOrganizationRootNodes(organizationId) {
        const neo = await neo_1.Neo4JConnection.getInstance();
        return neo.run(`
      MATCH (:Organisation {id: $organizationId})-[:OWNS]->(root)
      WHERE root:Channel OR root:Category OR root:SubjectRef
      RETURN root.id AS rootId, labels(root) AS labels
    `, { organizationId });
    }
    static async readOwnedBranchRoot(input) {
        const neo = await neo_1.Neo4JConnection.getInstance();
        const rows = await neo.run(`
      OPTIONAL MATCH (root:${input.rootLabel} {id: $rootId})
      RETURN
        root IS NOT NULL AS exists,
        root.createdBy = $userPermissionsId AS owns,
        coalesce(root.organizationId, '') AS organizationId
    `, { rootId: input.rootId, userPermissionsId: input.userPermissionsId });
        return rows[0] || null;
    }
    static async readInheritedBranchOwnership(input) {
        var _a;
        const neo = await neo_1.Neo4JConnection.getInstance();
        const rows = await neo.run(`
      MATCH (root:${input.rootLabel} {id: $rootId})
      MATCH (owner:UserPermissions {id: $userPermissionsId})-[:OWNS]->(ancestor)
      OPTIONAL MATCH ownershipPath = (ancestor)-[:${this.CONTAINS_TRAVERSAL}*0..]->(root)
      RETURN count(ownershipPath) > 0 AS owns
    `, { rootId: input.rootId, userPermissionsId: input.userPermissionsId });
        return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.owns) === true;
    }
    static async listBranchNodes(input) {
        var _a;
        const neo = await neo_1.Neo4JConnection.getInstance();
        const rows = await neo.run(`
      MATCH (root:${input.rootLabel} {id: $rootId})
      OPTIONAL MATCH (root)-[:${this.CONTAINS_TRAVERSAL}*0..]->(node)
      WITH collect(DISTINCT node) AS nodes
      RETURN [n IN nodes | {id: n.id, labels: labels(n), supabaseId: n.supabaseId}] AS nodes
    `, { rootId: input.rootId });
        return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.nodes) || [];
    }
    static async deleteBranchNodes(input) {
        var _a, _b;
        const neo = await neo_1.Neo4JConnection.getInstance();
        const rows = await neo.run(`
      MATCH (root:${input.rootLabel} {id: $rootId})
      OPTIONAL MATCH (root)-[:${this.CONTAINS_TRAVERSAL}*0..]->(node)
      WITH collect(DISTINCT node) AS nodes
      FOREACH (node IN nodes | DETACH DELETE node)
      RETURN size(nodes) AS deletedNodeCount
    `, { rootId: input.rootId });
        return (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.deletedNodeCount) !== null && _b !== void 0 ? _b : 0;
    }
}
exports.TreeGraphEntity = TreeGraphEntity;
TreeGraphEntity.CONTAINS_TRAVERSAL = 'CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT';

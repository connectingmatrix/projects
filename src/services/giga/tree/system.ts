import { BadRequestError } from 'routing-controllers';
import { fetchUserTree } from '@gigav2/services/giga/tree/fetchUserTree';
import { GRAPH_SYSTEM_IDS, RESOURCE_TYPES, ACCESS_RELATIONS, GRAPH_LABELS, STRUCTURAL_RELATIONS } from '@gigav2/types/graph.types';
import { Neo4JConnection } from '@gigav2/decorators/neo';
import type { GraphEntityTypeToken, ResourceType } from '@gigav2/types/graph.types';

type FluentAuth = { context: { supabase: any }; userId: string };

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError(`${label} must be an object.`);
  return value as Record<string, unknown>;
};

const enforceKeys = (label: string, value: Record<string, unknown>, keys: readonly string[]): void => {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new BadRequestError(`${label}.${key} is not supported.`);
};

const readTextOrNull = (value: unknown, _label: string): string | null => {
  const text = String(value || '').trim();
  return text || null;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new BadRequestError(`${label} must be a boolean.`);
  return value;
};

export type TreeFetchInput = {
  rootId?: string | null;
  rootType?: ResourceType | null;
  depth?: number | null;
  includeCounts?: boolean | null;
  includeGlobal: boolean;
  includePosts?: boolean | null;
  first?: number | null;
  offset?: number | null;
  organizationId?: string | null;
  nowIso?: string | null;
};

export class TreeGraphEntity {
  private static readonly CONTAINS_TRAVERSAL = 'CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT';

  public static async getNeo() {
    return Neo4JConnection.getInstance();
  }

  public static async fetchTreeByUser(auth: FluentAuth, input: TreeFetchInput) {
    return fetchUserTree(auth.context.supabase, {
      userPermissionsId: auth.userId,
      rootId: input.rootId || undefined,
      rootType: input.rootType || undefined,
      depth: input.depth ?? null,
      includeCounts: input.includeCounts === true,
      includeGlobal: input.includeGlobal,
      includePosts: input.includePosts !== false,
      first: input.first ?? null,
      offset: input.offset ?? null,
      organizationId: input.organizationId || null,
      nowIso: input.nowIso || undefined,
    });
  }

  public static parseTreeFetchInput(input: Record<string, string | number | boolean | null | undefined>): TreeFetchInput {
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
    if (
      inputRootType &&
      inputRootType !== RESOURCE_TYPES.channel &&
      inputRootType !== RESOURCE_TYPES.category &&
      inputRootType !== RESOURCE_TYPES.subject
    ) {
      throw new BadRequestError('tree.fetchTree input.rootType is invalid.');
    }
    const rootType = (inputRootType || null) as ResourceType | null;
    const rootId = readTextOrNull(value.rootId, 'tree.fetchTree input.rootId');
    const depth = value.depth === null || value.depth === undefined ? null : Math.max(0, Math.floor(Number(value.depth)));
    const first = value.first === null || value.first === undefined ? null : Math.max(0, Math.floor(Number(value.first)));
    const offset = value.offset === null || value.offset === undefined ? null : Math.max(0, Math.floor(Number(value.offset)));
    if (depth !== null && !Number.isFinite(depth)) throw new BadRequestError('tree.fetchTree input.depth must be a number.');
    if (first !== null && !Number.isFinite(first)) throw new BadRequestError('tree.fetchTree input.first must be a number.');
    if (offset !== null && !Number.isFinite(offset)) throw new BadRequestError('tree.fetchTree input.offset must be a number.');
    if (rootId && rootId === GRAPH_SYSTEM_IDS.userGlobal) {
      return {
        rootId,
        rootType: RESOURCE_TYPES.channel,
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

  private static async readCount(statement: string, params: Record<string, unknown>) {
    const rows = await (await Neo4JConnection.getInstance()).run<{ count: number }>(statement, params);
    return Number(rows[0]?.count) || 0;
  }

  public static async mergeFixtureNodesByLabel(label: GraphEntityTypeToken, nodes: Array<{ id: string; props: Record<string, unknown> }>) {
    if (!nodes.length) return;
    await (
      await Neo4JConnection.getInstance()
    ).run(
      `
        UNWIND $nodes AS node
        MERGE (n:${label} {id: node.id})
        SET n += node.props
        RETURN count(n) AS count
      `,
      { nodes },
    );
  }

  public static async mergeFixtureEdges(input: {
    sourceLabel: GraphEntityTypeToken;
    relation: string;
    targetLabel: GraphEntityTypeToken;
    rows: Array<{ sourceId: string; targetId: string; props: Record<string, unknown> }>;
    nowIso: string;
  }) {
    if (!input.rows.length) return;
    await (
      await Neo4JConnection.getInstance()
    ).run(
      `
        UNWIND $rows AS row
        MATCH (source:${input.sourceLabel} {id: row.sourceId})
        MATCH (target:${input.targetLabel} {id: row.targetId})
        MERGE (source)-[rel:${input.relation}]->(target)
        SET rel += row.props
        SET rel.createdAt = coalesce(rel.createdAt, $nowIso)
        SET rel.updatedAt = $nowIso
        RETURN count(rel) AS count
      `,
      { rows: input.rows, nowIso: input.nowIso },
    );
  }

  public static async cleanupFixtureGraph(input: { prefix: string; extraPermissionIds: string[]; userGlobal: string }) {
    await (
      await Neo4JConnection.getInstance()
    ).run(
      `
        MATCH (n)
        WHERE (n.id STARTS WITH $prefix OR n.id IN $extraPermissionIds)
          AND n.id <> $userGlobal
        DETACH DELETE n
        RETURN count(n) AS count
      `,
      input,
    );
  }

  public static readScopeWhere(organizationId?: string | null) {
    return organizationId
      ? `coalesce(node.organizationId, '') = $organizationId`
      : `coalesce(node.organizationId, '') = '' AND coalesce(node.isGlobal, false) = false AND coalesce(node.createdBy, '') = $userId`;
  }

  public static async readScopedSubjectIds(input: { organizationId?: string | null; userId: string }) {
    const rows = await (
      await Neo4JConnection.getInstance()
    ).run<{ id: string }>(
      `MATCH (node:${GRAPH_LABELS.subjectRef}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN DISTINCT node.id AS id`,
      input,
    );
    return rows.map((row) => row.id).filter(Boolean);
  }

  public static readScopedChannelCount(input: { organizationId?: string | null; userId: string }) {
    return this.readCount(
      `MATCH (node:${GRAPH_LABELS.channel}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN count(DISTINCT node) AS count`,
      input,
    );
  }

  public static readScopedSubjectCount(input: { organizationId?: string | null; userId: string }) {
    return this.readCount(
      `MATCH (node:${GRAPH_LABELS.subjectRef}) WHERE ${this.readScopeWhere(input.organizationId)} RETURN count(DISTINCT node) AS count`,
      input,
    );
  }

  public static readScopedShareCount(input: { organizationId?: string | null; userId: string }) {
    const scope = input.organizationId
      ? `coalesce(resource.organizationId, '') = $organizationId`
      : `coalesce(resource.organizationId, '') = '' AND coalesce(resource.createdBy, '') = $userId`;
    return this.readCount(
      `MATCH (:${GRAPH_LABELS.userPermissions} {id: $userId})-[rel:${ACCESS_RELATIONS.canAccess}|${ACCESS_RELATIONS.subscribedTo}]->(resource) WHERE ${scope} RETURN count(DISTINCT rel) AS count`,
      input,
    );
  }

  public static readScopedLinkCount(input: { organizationId?: string | null; userId: string }) {
    const scope = input.organizationId
      ? `(coalesce(source.organizationId, '') = $organizationId OR coalesce(target.organizationId, '') = $organizationId)`
      : `coalesce(source.organizationId, '') = '' AND coalesce(target.organizationId, '') = '' AND (coalesce(source.createdBy, '') = $userId OR coalesce(target.createdBy, '') = $userId)`;
    return this.readCount(
      `MATCH (source)-[rel:${STRUCTURAL_RELATIONS.links}]->(target) WHERE coalesce(rel.createdByUserPermissionsId, '') = $userId AND ${scope} RETURN count(DISTINCT rel) AS count`,
      input,
    );
  }

  public static async readOrganizationScopeRows(input: { scopeType: 'channel' | 'category'; id: string; organizationId: string }) {
    const label = input.scopeType === 'channel' ? 'Channel' : 'Category';
    const neo = await Neo4JConnection.getInstance();
    return neo.run<Record<string, unknown>>(
      `
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
    `,
      { id: input.id, organizationId: input.organizationId },
    );
  }

  public static async listOrganizationRootNodes(organizationId: string) {
    const neo = await Neo4JConnection.getInstance();
    return neo.run<{ rootId: string; labels: string[] }>(
      `
      MATCH (:Organisation {id: $organizationId})-[:OWNS]->(root)
      WHERE root:Channel OR root:Category OR root:SubjectRef
      RETURN root.id AS rootId, labels(root) AS labels
    `,
      { organizationId },
    );
  }

  public static async readOwnedBranchRoot(input: { rootLabel: string; rootId: string; userPermissionsId: string }) {
    const neo = await Neo4JConnection.getInstance();
    const rows = await neo.run<{ exists?: boolean; owns?: boolean; organizationId?: string }>(
      `
      OPTIONAL MATCH (root:${input.rootLabel} {id: $rootId})
      RETURN
        root IS NOT NULL AS exists,
        root.createdBy = $userPermissionsId AS owns,
        coalesce(root.organizationId, '') AS organizationId
    `,
      { rootId: input.rootId, userPermissionsId: input.userPermissionsId },
    );
    return rows[0] || null;
  }

  public static async readInheritedBranchOwnership(input: { rootLabel: string; rootId: string; userPermissionsId: string }) {
    const neo = await Neo4JConnection.getInstance();
    const rows = await neo.run<{ owns?: boolean }>(
      `
      MATCH (root:${input.rootLabel} {id: $rootId})
      MATCH (owner:UserPermissions {id: $userPermissionsId})-[:OWNS]->(ancestor)
      OPTIONAL MATCH ownershipPath = (ancestor)-[:${this.CONTAINS_TRAVERSAL}*0..]->(root)
      RETURN count(ownershipPath) > 0 AS owns
    `,
      { rootId: input.rootId, userPermissionsId: input.userPermissionsId },
    );
    return rows[0]?.owns === true;
  }

  public static async listBranchNodes(input: { rootLabel: string; rootId: string }) {
    const neo = await Neo4JConnection.getInstance();
    const rows = await neo.run<{ nodes: Array<{ id: string; labels: string[]; supabaseId?: string | null }> }>(
      `
      MATCH (root:${input.rootLabel} {id: $rootId})
      OPTIONAL MATCH (root)-[:${this.CONTAINS_TRAVERSAL}*0..]->(node)
      WITH collect(DISTINCT node) AS nodes
      RETURN [n IN nodes | {id: n.id, labels: labels(n), supabaseId: n.supabaseId}] AS nodes
    `,
      { rootId: input.rootId },
    );
    return rows[0]?.nodes || [];
  }

  public static async deleteBranchNodes(input: { rootLabel: string; rootId: string }) {
    const neo = await Neo4JConnection.getInstance();
    const rows = await neo.run<{ deletedNodeCount: number }>(
      `
      MATCH (root:${input.rootLabel} {id: $rootId})
      OPTIONAL MATCH (root)-[:${this.CONTAINS_TRAVERSAL}*0..]->(node)
      WITH collect(DISTINCT node) AS nodes
      FOREACH (node IN nodes | DETACH DELETE node)
      RETURN size(nodes) AS deletedNodeCount
    `,
      { rootId: input.rootId },
    );
    return rows[0]?.deletedNodeCount ?? 0;
  }
}

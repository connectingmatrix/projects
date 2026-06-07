import { SupabaseClient } from '@supabase/supabase-js';
import { Neo4JConnection } from '@gigav2/decorators/neo';
import { invariant } from '@gigav2/lib/helper';
import { getScopedLogger } from '@gigav2/lib/logger';
import { buildTreeFromGraph } from '@gigav2/lib/tree';
import { AIPostsRepository } from '@gigav2/repositories/ai-posts.repository';
import { GraphEntity } from '@gigav2/repositories/GraphEntity';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import { getOrganizationAccessContext } from '@gigav2/services/organization/access';
import {
  canAccessOrganizationTree,
  filterTreeGraphForOrganizationAccess,
  filterTreePostsForOrganizationAccess,
  shouldApplyTreeOrganizationContext,
} from '@gigav2/services/giga/tree/fetchUserTreeOrganizationFilter';
import {
  ACCESS_RELATIONS,
  AccessEdgeProperties,
  FetchUserTreeInput,
  FetchUserTreeResult,
  GRAPH_LABELS,
  GRAPH_RESOURCE_LABEL_BY_TYPE,
  GRAPH_SYSTEM_IDS,
  GraphEdgeRecord,
  GraphNodeRecord,
  RESOURCE_TYPES,
  ResourceType,
  STRUCTURAL_RELATIONS,
  STRUCTURAL_RELATION_SET,
  TreePermission,
  TreeRootGrant,
} from '@gigav2/types/graph.types';
import type { OrganizationAccessContext } from '@gigav2/types/org.types';

type TreeGraph = {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
};

type RootGraphMap = Map<string, TreeGraph>;
type GraphLoadMode = 'batched' | 'grouped' | 'legacy';
type GraphLoadResult = {
  graphs: RootGraphMap;
  mode: GraphLoadMode;
  queryCount: number;
  fallbackReason: string | null;
  maxDepth: number;
};
type TreeNodeSummary = {
  categoryCount: number;
  subjectCount: number;
  postCount: number;
};

const logger = getScopedLogger('giga.fetch-user-tree');

const STRUCTURAL_TRAVERSAL = STRUCTURAL_RELATION_SET.join('|');
const STRUCTURAL_RELATION_TRAVERSAL = STRUCTURAL_RELATION_SET.map((relation) => `\`${relation}\``).join('|');
const TREE_GRANT_RELATIONS = [ACCESS_RELATIONS.owns, STRUCTURAL_RELATIONS.links] as const;
const ACCESS_TRAVERSAL = [...TREE_GRANT_RELATIONS].join('|');
const TREE_NODE_LABELS = [GRAPH_LABELS.channel, GRAPH_LABELS.category, GRAPH_LABELS.subjectRef];

const DEFAULT_GRAPH_TREE_MAX_DEPTH = 8;
const MAX_GRAPH_TREE_MAX_DEPTH = 24;
const FETCH_USER_TREE_DEBUG_ENABLED = String(process.env.FETCH_USER_TREE_DEBUG || '').toLowerCase() === 'true';

const CYPHER_LIST_DIRECT_ROOT_GRANTS = /* cypher */ `
    MATCH (permissionsNode:UserPermissions {id: $userPermissionsId})-[grant:${ACCESS_TRAVERSAL}]->(root)
    WHERE (root:Channel OR root:Category OR root:SubjectRef)
      AND (
        type(grant) IN ['OWNS', 'LINKS']
        OR (
          (grant.availableFrom IS NULL OR datetime(grant.availableFrom) <= datetime($nowIso))
          AND (grant.availableTo IS NULL OR datetime(grant.availableTo) >= datetime($nowIso))
        )
      )
    OPTIONAL MATCH (permissionsNode)-[higher:${ACCESS_TRAVERSAL}]->(ancestor)-[:${STRUCTURAL_TRAVERSAL}*1..]->(root)
    WHERE ancestor.id <> root.id
      AND (
        type(higher) IN ['OWNS', 'LINKS']
        OR (
          (higher.availableFrom IS NULL OR datetime(higher.availableFrom) <= datetime($nowIso))
          AND (higher.availableTo IS NULL OR datetime(higher.availableTo) >= datetime($nowIso))
          AND coalesce(higher.recursive, false) = true
        )
      )
    WITH root, grant, count(DISTINCT ancestor) AS blockingAncestors
    WHERE blockingAncestors = 0
    WITH DISTINCT root, grant
    RETURN
      root.id AS rootId,
      root.id AS ancestorId,
      CASE
        WHEN root:Channel THEN 'CHANNEL'
        WHEN root:Category THEN 'CATEGORY'
        ELSE 'SUBJECT'
      END AS rootType,
      type(grant) AS grantType,
      properties(grant) AS permission
    ORDER BY coalesce(root.name, root.slug, root.id) ASC
`;

const CYPHER_RESOLVE_EXPLICIT_ROOT_GRANT = /* cypher */ `
    MATCH (permissionsNode:UserPermissions {id: $userPermissionsId})-[grant:${ACCESS_TRAVERSAL}]->(ancestor)
    WHERE (
      type(grant) IN ['OWNS', 'LINKS']
      OR (
        (grant.availableFrom IS NULL OR datetime(grant.availableFrom) <= datetime($nowIso))
        AND (grant.availableTo IS NULL OR datetime($nowIso) <= datetime(grant.availableTo))
      )
    )
    MATCH path = (ancestor)-[:${STRUCTURAL_TRAVERSAL}*0..]->(root {id: $rootId})
    WHERE (root:Channel OR root:Category OR root:SubjectRef)
      AND (
        ancestor.id = root.id
        OR type(grant) IN ['OWNS', 'LINKS']
        OR coalesce(grant.recursive, false) = true
      )
    RETURN
      root.id AS rootId,
      ancestor.id AS ancestorId,
      CASE
        WHEN root:Channel THEN 'CHANNEL'
        WHEN root:Category THEN 'CATEGORY'
        ELSE 'SUBJECT'
      END AS rootType,
      type(grant) AS grantType,
      properties(grant) AS permission,
      length(path) AS pathLength
    ORDER BY pathLength ASC
    LIMIT 1
`;

const CYPHER_LIST_ORGANIZATION_ROOT_GRANTS = /* cypher */ `
    MATCH (organizationNode:${GRAPH_LABELS.organization} {id: $organizationId})-[grant:${ACCESS_TRAVERSAL}]->(root)
    WHERE (root:Channel OR root:Category OR root:SubjectRef)
      AND (
        type(grant) IN ['OWNS', 'LINKS']
        OR (
          (grant.availableFrom IS NULL OR datetime(grant.availableFrom) <= datetime($nowIso))
          AND (grant.availableTo IS NULL OR datetime(grant.availableTo) >= datetime($nowIso))
        )
      )
    OPTIONAL MATCH (organizationNode)-[higher:${ACCESS_TRAVERSAL}]->(ancestor)-[:${STRUCTURAL_TRAVERSAL}*1..]->(root)
    WHERE ancestor.id <> root.id
      AND (
        type(higher) IN ['OWNS', 'LINKS']
        OR (
          (higher.availableFrom IS NULL OR datetime(higher.availableFrom) <= datetime($nowIso))
          AND (higher.availableTo IS NULL OR datetime(higher.availableTo) >= datetime($nowIso))
          AND coalesce(higher.recursive, false) = true
        )
      )
    WITH root, grant, count(DISTINCT ancestor) AS blockingAncestors
    WHERE blockingAncestors = 0
    WITH DISTINCT root, grant
    RETURN
      root.id AS rootId,
      root.id AS ancestorId,
      CASE
        WHEN root:Channel THEN 'CHANNEL'
        WHEN root:Category THEN 'CATEGORY'
        ELSE 'SUBJECT'
      END AS rootType,
      type(grant) AS grantType,
      properties(grant) AS permission
    ORDER BY coalesce(root.name, root.slug, root.id) ASC
`;

const CYPHER_RESOLVE_EXPLICIT_ORGANIZATION_ROOT_GRANT = /* cypher */ `
    MATCH (organizationNode:${GRAPH_LABELS.organization} {id: $organizationId})-[grant:${ACCESS_TRAVERSAL}]->(ancestor)
    WHERE (
      type(grant) IN ['OWNS', 'LINKS']
      OR (
        (grant.availableFrom IS NULL OR datetime(grant.availableFrom) <= datetime($nowIso))
        AND (grant.availableTo IS NULL OR datetime(grant.availableTo) >= datetime($nowIso))
      )
    )
    MATCH path = (ancestor)-[:${STRUCTURAL_TRAVERSAL}*0..]->(root {id: $rootId})
    WHERE (root:Channel OR root:Category OR root:SubjectRef)
      AND (
        ancestor.id = root.id
        OR type(grant) IN ['OWNS', 'LINKS']
        OR coalesce(grant.recursive, false) = true
      )
    RETURN
      root.id AS rootId,
      ancestor.id AS ancestorId,
      CASE
        WHEN root:Channel THEN 'CHANNEL'
        WHEN root:Category THEN 'CATEGORY'
        ELSE 'SUBJECT'
      END AS rootType,
      type(grant) AS grantType,
      properties(grant) AS permission,
      length(path) AS pathLength
    ORDER BY pathLength ASC
    LIMIT 1
`;

function resolveGraphTreeMaxDepth(input?: number): number {
  const candidate = Number.isFinite(Number(input)) ? Number(input) : Number(process.env.GRAPH_TREE_MAX_DEPTH || DEFAULT_GRAPH_TREE_MAX_DEPTH);
  if (!Number.isFinite(candidate) || candidate < 0) {
    return DEFAULT_GRAPH_TREE_MAX_DEPTH;
  }
  return Math.min(Math.floor(candidate), MAX_GRAPH_TREE_MAX_DEPTH);
}

function logDebug(event: string, meta: Record<string, unknown>) {
  if (!FETCH_USER_TREE_DEBUG_ENABLED) {
    return;
  }
  logger.info(event, meta);
}

function toRootKey(grant: TreeRootGrant): string {
  return `${grant.rootType}:${grant.rootId}`;
}

function toUniqueRootGrants(rootGrants: TreeRootGrant[]): TreeRootGrant[] {
  const seen = new Set<string>();
  const rows: TreeRootGrant[] = [];
  for (const rootGrant of rootGrants) {
    const key = toRootKey(rootGrant);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(rootGrant);
  }
  return rows;
}

type RootGrantBranch = 'organization' | 'user' | 'global';

type RootGrantPageRow = {
  branch: RootGrantBranch;
  grant: TreeRootGrant;
};

function appendRootGrantPageRows(rows: RootGrantPageRow[], branch: RootGrantBranch, grants: TreeRootGrant[]) {
  for (const grant of grants) {
    rows.push({ branch, grant });
  }
}

function paginateRootGrantRows(input: FetchUserTreeInput, rows: RootGrantPageRow[]): RootGrantPageRow[] {
  if (input.rootId || (!input.first && !input.offset)) {
    return rows;
  }
  const offset = input.offset && input.offset > 0 ? Math.floor(input.offset) : 0;
  const first = input.first && input.first > 0 ? Math.floor(input.first) : null;
  return first ? rows.slice(offset, offset + first) : rows.slice(offset);
}

function rootGrantsForBranch(rows: RootGrantPageRow[], branch: RootGrantBranch): TreeRootGrant[] {
  const grants: TreeRootGrant[] = [];
  for (const row of rows) {
    if (row.branch === branch) {
      grants.push(row.grant);
    }
  }
  return grants;
}

function normalizeGraphRecords(graph: TreeGraph): TreeGraph {
  const nodeById = new Map<string, GraphNodeRecord>();
  for (const node of graph.nodes || []) {
    if (!node || !node.id) {
      continue;
    }
    nodeById.set(node.id, node);
  }

  const edgeByKey = new Map<string, GraphEdgeRecord>();
  for (const edge of graph.edges || []) {
    if (!edge || !edge.sourceId || !edge.targetId || !edge.type) {
      continue;
    }
    const key = `${edge.sourceId}|${edge.targetId}|${edge.type}|${JSON.stringify(edge.props || {})}`;
    edgeByKey.set(key, {
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      props: edge.props || {},
    });
  }

  return {
    nodes: Array.from(nodeById.values()),
    edges: Array.from(edgeByKey.values()),
  };
}

function subjectLookupId(node: GraphNodeRecord): string {
  const raw = node.props?.supabaseId;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return node.id;
}

function assertGraphRows(rows: Array<{ rootId?: string; nodes?: unknown; edges?: unknown }>, _expectedRootIds: string[]) {
  for (const row of rows) {
    if (typeof row.rootId !== 'string' || !Array.isArray(row.nodes) || !Array.isArray(row.edges)) {
      throw new Error('Unsupported batched graph response shape.');
    }
  }
}

function buildBatchedGraphQuery(maxDepth: number): string {
  return `
    UNWIND $roots AS rootRef
    MATCH (root {id: rootRef.rootId})
    WHERE rootRef.rootLabel IN labels(root)
    OPTIONAL MATCH path = (root)-[pathRels:${STRUCTURAL_RELATION_TRAVERSAL}*0..${maxDepth}]->(reachable)
    WHERE reachable IS NULL OR (
      ALL(node IN nodes(path) WHERE ANY(label IN labels(node) WHERE label IN $include))
      AND ALL(rel IN relationships(path) WHERE type(rel) <> 'CONTAINS_CATEGORY' OR rootRef.rootLabel <> 'Channel' OR startNode(rel) = root OR rootRef.rootId IN coalesce(rel.channelIds, []))
    )
    WITH rootRef, root, collect(DISTINCT reachable) AS reachedNodes
    WITH rootRef, [root] + reachedNodes AS rawNodes
    UNWIND rawNodes AS rawNode
    WITH rootRef, collect(DISTINCT rawNode) AS nodes
    UNWIND nodes AS node
    OPTIONAL MATCH (node)-[rel]->(child)
    WHERE child IN nodes
      AND type(rel) IN $relations
      AND (type(rel) <> 'CONTAINS_CATEGORY' OR rootRef.rootLabel <> 'Channel' OR node = root OR rootRef.rootId IN coalesce(rel.channelIds, []))
    RETURN
      rootRef.rootId AS rootId,
      [n IN nodes | {id: n.id, labels: labels(n), props: properties(n)}] AS nodes,
      [edge IN collect(DISTINCT CASE
        WHEN rel IS NULL THEN NULL
        ELSE {
          sourceId: startNode(rel).id,
          targetId: endNode(rel).id,
          type: type(rel),
          props: properties(rel)
        }
      END) WHERE edge IS NOT NULL] AS edges
  `;
}

function buildGroupedGraphQuery(rootLabel: string, maxDepth: number): string {
  return `
    UNWIND $rootIds AS rootId
    MATCH (root:${rootLabel} {id: rootId})
    OPTIONAL MATCH path = (root)-[pathRels:${STRUCTURAL_RELATION_TRAVERSAL}*0..${maxDepth}]->(reachable)
    WHERE reachable IS NULL OR (
      ALL(node IN nodes(path) WHERE ANY(label IN labels(node) WHERE label IN $include))
      AND ALL(rel IN relationships(path) WHERE type(rel) <> 'CONTAINS_CATEGORY' OR '${rootLabel}' <> 'Channel' OR startNode(rel) = root OR rootId IN coalesce(rel.channelIds, []))
    )
    WITH rootId, root, collect(DISTINCT reachable) AS reachedNodes
    WITH rootId, [root] + reachedNodes AS rawNodes
    UNWIND rawNodes AS rawNode
    WITH rootId, collect(DISTINCT rawNode) AS nodes
    UNWIND nodes AS node
    OPTIONAL MATCH (node)-[rel]->(child)
    WHERE child IN nodes
      AND type(rel) IN $relations
      AND (type(rel) <> 'CONTAINS_CATEGORY' OR '${rootLabel}' <> 'Channel' OR node = root OR rootId IN coalesce(rel.channelIds, []))
    RETURN
      rootId,
      [n IN nodes | {id: n.id, labels: labels(n), props: properties(n)}] AS nodes,
      [edge IN collect(DISTINCT CASE
        WHEN rel IS NULL THEN NULL
        ELSE {
          sourceId: startNode(rel).id,
          targetId: endNode(rel).id,
          type: type(rel),
          props: properties(rel)
        }
      END) WHERE edge IS NOT NULL] AS edges
  `;
}

function rowsToGraphMap(rows: Array<{ rootId: string; nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }>): RootGraphMap {
  const graphMap: RootGraphMap = new Map();
  for (const row of rows) {
    graphMap.set(row.rootId, normalizeGraphRecords({ nodes: row.nodes, edges: row.edges }));
  }
  return graphMap;
}

function rootModeGroups(rootGrants: TreeRootGrant[]) {
  const grouped = new Map<TreeRootGrant['rootType'], string[]>();
  for (const rootGrant of rootGrants) {
    const ids = grouped.get(rootGrant.rootType) || [];
    ids.push(rootGrant.rootId);
    grouped.set(rootGrant.rootType, ids);
  }
  return Array.from(grouped.entries()).map(([rootType, rootIds]) => ({
    rootType,
    rootIds: Array.from(new Set(rootIds)),
  }));
}

function createGraphRowsFromGrouped(rows: Array<{ rootId: string; nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }>) {
  return rows.map((row) => ({
    rootId: row.rootId,
    nodes: row.nodes,
    edges: row.edges,
  }));
}

function batchedRootsInput(rootGrants: TreeRootGrant[]) {
  return rootGrants.map((rootGrant) => ({
    rootId: rootGrant.rootId,
    rootLabel: GRAPH_RESOURCE_LABEL_BY_TYPE[rootGrant.rootType],
  }));
}

function mapRootIds(rootGrants: TreeRootGrant[]) {
  return rootGrants.map((rootGrant) => rootGrant.rootId);
}

function fallbackWarning(fallbackFrom: GraphLoadMode, fallbackTo: GraphLoadMode, error: unknown) {
  // prettier-ignore
  logger.warn('fetch-user-tree.graph-loader.fallback', { from: fallbackFrom, to: fallbackTo, message: error instanceof Error ? error.message : String(error || 'Unknown graph loading error'), });
}

async function loadGraphsForRootGrantsBatched(
  neo: Neo4JConnection,
  rootGrants: TreeRootGrant[],
  maxDepth: number,
): Promise<{ map: RootGraphMap; queryCount: number }> {
  const uniqueRootGrants = toUniqueRootGrants(rootGrants);
  const query = buildBatchedGraphQuery(maxDepth);
  const rows = await neo.run<{
    rootId: string;
    nodes: GraphNodeRecord[];
    edges: GraphEdgeRecord[];
  }>(query, {
    roots: batchedRootsInput(uniqueRootGrants),
    include: TREE_NODE_LABELS,
    relations: STRUCTURAL_RELATION_SET,
  });

  assertGraphRows(rows as Array<{ rootId?: string; nodes?: unknown; edges?: unknown }>, mapRootIds(uniqueRootGrants));
  return {
    map: rowsToGraphMap(rows),
    queryCount: 1,
  };
}

async function loadGraphsForRootGrantsGrouped(
  neo: Neo4JConnection,
  rootGrants: TreeRootGrant[],
  maxDepth: number,
): Promise<{ map: RootGraphMap; queryCount: number }> {
  const groupedRoots = rootModeGroups(toUniqueRootGrants(rootGrants));
  const resultRows: Array<{ rootId: string; nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }> = [];
  let queryCount = 0;

  for (const groupedRoot of groupedRoots) {
    const rootLabel = GRAPH_RESOURCE_LABEL_BY_TYPE[groupedRoot.rootType];
    const rows = await neo.run<{
      rootId: string;
      nodes: GraphNodeRecord[];
      edges: GraphEdgeRecord[];
    }>(buildGroupedGraphQuery(rootLabel, maxDepth), {
      rootIds: groupedRoot.rootIds,
      include: TREE_NODE_LABELS,
      relations: STRUCTURAL_RELATION_SET,
    });
    queryCount += 1;
    resultRows.push(...createGraphRowsFromGrouped(rows));
  }

  assertGraphRows(resultRows as Array<{ rootId?: string; nodes?: unknown; edges?: unknown }>, mapRootIds(toUniqueRootGrants(rootGrants)));
  return {
    map: rowsToGraphMap(resultRows),
    queryCount,
  };
}

async function loadGraphForRoot(rootId: string, rootType: TreeRootGrant['rootType'], maxDepth: number): Promise<TreeGraph> {
  const rootLabel = GRAPH_RESOURCE_LABEL_BY_TYPE[rootType];
  const root = new GraphEntity({
    type: rootLabel,
    data: {
      id: rootId,
    },
  });
  try {
    return await root.fetchTreeGraph({ maxDepth });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (message.includes('was not found in graph')) {
      logger.warn('fetch-user-tree.graph-loader.missing-root', { rootId, rootType });
      return { nodes: [], edges: [] };
    }
    throw error;
  }
}

async function loadGraphsForRootGrantsLegacy(rootGrants: TreeRootGrant[], maxDepth: number): Promise<{ map: RootGraphMap; queryCount: number }> {
  const map: RootGraphMap = new Map();
  const uniqueRootGrants = toUniqueRootGrants(rootGrants);

  for (const rootGrant of uniqueRootGrants) {
    const graph = await loadGraphForRoot(rootGrant.rootId, rootGrant.rootType, maxDepth);
    map.set(rootGrant.rootId, normalizeGraphRecords(graph));
  }

  return {
    map,
    queryCount: uniqueRootGrants.length,
  };
}

async function loadGraphsForRootGrantsWithStats(
  neo: Neo4JConnection,
  rootGrants: TreeRootGrant[],
  options?: {
    maxDepth?: number;
    mode?: 'auto' | GraphLoadMode;
  },
): Promise<GraphLoadResult> {
  if (rootGrants.length === 0) {
    return {
      graphs: new Map(),
      mode: 'batched',
      queryCount: 0,
      fallbackReason: null,
      maxDepth: resolveGraphTreeMaxDepth(options?.maxDepth),
    };
  }

  const maxDepth = resolveGraphTreeMaxDepth(options?.maxDepth);
  const mode = options?.mode || 'auto';

  if (mode === 'legacy') {
    const legacyResult = await loadGraphsForRootGrantsLegacy(rootGrants, maxDepth);
    return {
      graphs: legacyResult.map,
      mode: 'legacy',
      queryCount: legacyResult.queryCount,
      fallbackReason: null,
      maxDepth,
    };
  }

  if (mode === 'grouped') {
    const groupedResult = await loadGraphsForRootGrantsGrouped(neo, rootGrants, maxDepth);
    return {
      graphs: groupedResult.map,
      mode: 'grouped',
      queryCount: groupedResult.queryCount,
      fallbackReason: null,
      maxDepth,
    };
  }

  if (mode === 'batched') {
    const batchedResult = await loadGraphsForRootGrantsBatched(neo, rootGrants, maxDepth);
    return {
      graphs: batchedResult.map,
      mode: 'batched',
      queryCount: batchedResult.queryCount,
      fallbackReason: null,
      maxDepth,
    };
  }

  try {
    const batchedResult = await loadGraphsForRootGrantsBatched(neo, rootGrants, maxDepth);
    return {
      graphs: batchedResult.map,
      mode: 'batched',
      queryCount: batchedResult.queryCount,
      fallbackReason: null,
      maxDepth,
    };
  } catch (batchedError) {
    fallbackWarning('batched', 'grouped', batchedError);
    try {
      const groupedResult = await loadGraphsForRootGrantsGrouped(neo, rootGrants, maxDepth);
      return {
        graphs: groupedResult.map,
        mode: 'grouped',
        queryCount: groupedResult.queryCount + 1,
        fallbackReason: batchedError instanceof Error ? batchedError.message : String(batchedError || ''),
        maxDepth,
      };
    } catch (groupedError) {
      fallbackWarning('grouped', 'legacy', groupedError);
      const legacyResult = await loadGraphsForRootGrantsLegacy(rootGrants, maxDepth);
      return {
        graphs: legacyResult.map,
        mode: 'legacy',
        queryCount: legacyResult.queryCount + rootModeGroups(toUniqueRootGrants(rootGrants)).length + 1,
        fallbackReason: groupedError instanceof Error ? groupedError.message : String(groupedError || ''),
        maxDepth,
      };
    }
  }
}

async function loadGraphsForRootGrants(
  rootGrants: TreeRootGrant[],
  options?: {
    maxDepth?: number;
  },
): Promise<RootGraphMap> {
  const neo = await TreeGraphEntity.getNeo();
  const result = await loadGraphsForRootGrantsWithStats(neo, rootGrants, {
    maxDepth: options?.maxDepth,
  });
  return result.graphs;
}

async function loadTreeNodeSummaries(
  neo: Neo4JConnection,
  postsRepository: AIPostsRepository,
  nodeIds: string[],
  maxDepth: number,
): Promise<Map<string, TreeNodeSummary>> {
  const summaryByNodeId = new Map<string, TreeNodeSummary>();
  const uniqueNodeIds = Array.from(new Set(nodeIds.filter(Boolean)));
  if (!uniqueNodeIds.length) return summaryByNodeId;
  const summaryDepth = Math.max(resolveGraphTreeMaxDepth(maxDepth), DEFAULT_GRAPH_TREE_MAX_DEPTH);

  const rows = await neo.run<{ categoryCount: number; nodeId: string; subjectCount: number; subjectIds: string[] }>(
    `
      UNWIND $nodeIds AS nodeId
      MATCH (node {id: nodeId})
      OPTIONAL MATCH (node)-[:${STRUCTURAL_RELATION_TRAVERSAL}*1..${summaryDepth}]->(category:${GRAPH_LABELS.category})
      WITH nodeId, node, count(DISTINCT category) AS categoryCount
      OPTIONAL MATCH (node)-[:${STRUCTURAL_RELATION_TRAVERSAL}*1..${summaryDepth}]->(subject:${GRAPH_LABELS.subjectRef})
      WITH nodeId, node, categoryCount, count(DISTINCT subject) AS subjectCount
      OPTIONAL MATCH path = (node)-[:${STRUCTURAL_RELATION_TRAVERSAL}*0..${summaryDepth}]->(descendant:${GRAPH_LABELS.subjectRef})
      RETURN
        nodeId,
        categoryCount,
        subjectCount,
        collect(DISTINCT coalesce(descendant.supabaseId, descendant.id)) AS subjectIds
    `,
    { nodeIds: uniqueNodeIds },
  );

  const subjectIds = Array.from(new Set(rows.flatMap((row) => row.subjectIds || []).filter(Boolean)));
  const postCounts = await postsRepository.countBySubjectIds(subjectIds);

  for (const row of rows) {
    const postCount = (row.subjectIds || []).reduce((total, subjectId) => total + (postCounts.get(subjectId) || 0), 0);
    summaryByNodeId.set(row.nodeId, {
      categoryCount: Number(row.categoryCount) || 0,
      subjectCount: Number(row.subjectCount) || 0,
      postCount,
    });
  }

  return summaryByNodeId;
}

function attachTreeNodeSummaries(node: FetchUserTreeResult['user'][number], summaries: Map<string, TreeNodeSummary>) {
  const summary = summaries.get(node.id);
  const children = node.children.map((child) => attachTreeNodeSummaries(child, summaries));
  return {
    ...node,
    categoryCount: summary?.categoryCount ?? children.filter((child) => child.nodeType === RESOURCE_TYPES.category).length,
    subjectCount: summary?.subjectCount ?? children.filter((child) => child.nodeType === RESOURCE_TYPES.subject).length,
    postCount: summary?.postCount ?? node.posts.length,
    childCount: children.length,
    children,
  };
}

function normalizePermission(
  userPermissionsId: string,
  ancestorId: string,
  grantType: string,
  raw: Record<string, unknown> | AccessEdgeProperties | null,
): TreePermission {
  const permission = raw || {};
  return {
    sourceUserPermissionsId: userPermissionsId,
    grantedByUserPermissionsId: typeof permission.grantedByUserPermissionsId === 'string' ? permission.grantedByUserPermissionsId : null,
    grantType,
    read: grantType === 'OWNS' || grantType === 'LINKS' ? true : permission.read === true,
    write: grantType === 'OWNS' ? true : permission.write === true,
    recursive: grantType === 'OWNS' || grantType === 'LINKS' ? true : permission.recursive === true,
    availableFrom: typeof permission.availableFrom === 'string' ? permission.availableFrom : null,
    availableTo: typeof permission.availableTo === 'string' ? permission.availableTo : null,
    inheritedFromResourceId: ancestorId,
  };
}

async function loadRootGrants(
  neo: Neo4JConnection,
  params: { userPermissionsId: string; organizationId?: string | null; nowIso: string; rootId?: string },
): Promise<TreeRootGrant[]> {
  if (params.organizationId && params.rootId) {
    const rows = await neo.run<
      TreeRootGrant & {
        pathLength: number;
      }
    >(CYPHER_RESOLVE_EXPLICIT_ORGANIZATION_ROOT_GRANT, {
      organizationId: params.organizationId,
      rootId: params.rootId,
      nowIso: params.nowIso,
    });

    return rows.map((row) => ({
      rootId: row.rootId,
      ancestorId: row.ancestorId,
      rootType: row.rootType,
      grantType: row.grantType,
      permission: row.permission,
    }));
  }

  if (params.organizationId) {
    return neo.run<TreeRootGrant>(CYPHER_LIST_ORGANIZATION_ROOT_GRANTS, {
      organizationId: params.organizationId,
      nowIso: params.nowIso,
    });
  }

  if (params.rootId) {
    const rows = await neo.run<
      TreeRootGrant & {
        pathLength: number;
      }
    >(CYPHER_RESOLVE_EXPLICIT_ROOT_GRANT, {
      userPermissionsId: params.userPermissionsId,
      rootId: params.rootId,
      nowIso: params.nowIso,
    });

    return rows.map((row) => ({
      rootId: row.rootId,
      ancestorId: row.ancestorId,
      rootType: row.rootType,
      grantType: row.grantType,
      permission: row.permission,
    }));
  }

  return neo.run<TreeRootGrant>(CYPHER_LIST_DIRECT_ROOT_GRANTS, {
    userPermissionsId: params.userPermissionsId,
    nowIso: params.nowIso,
  });
}

export async function resolveAccessibleTreeNode(input: {
  userPermissionsId: string;
  nodeId: string;
  nodeType: ResourceType;
  organizationId?: string | null;
  nowIso?: string;
}): Promise<TreeRootGrant | null> {
  const neo = await TreeGraphEntity.getNeo();
  const rootGrants = await loadRootGrants(neo, {
    userPermissionsId: input.userPermissionsId,
    organizationId: input.organizationId || null,
    rootId: input.nodeId,
    nowIso: input.nowIso || new Date().toISOString(),
  });
  return rootGrants.find((grant) => grant.rootId === input.nodeId && grant.rootType === input.nodeType) || null;
}

async function buildForest(
  supabase: SupabaseClient,
  neo: Neo4JConnection,
  userPermissionsId: string,
  rootGrants: TreeRootGrant[],
  orgContext?: OrganizationAccessContext | null,
  options: { includeCounts?: boolean; includePosts?: boolean; maxDepth?: number | null } = {},
): Promise<FetchUserTreeResult['user']> {
  const buildStartedAt = Date.now();

  if (rootGrants.length === 0) {
    logDebug('fetch-user-tree.build-forest', {
      mode: 'empty',
      userPermissionsId,
      rootGrantCount: 0,
      totalDurationMs: Date.now() - buildStartedAt,
    });
    return [];
  }

  if (!canAccessOrganizationTree(orgContext)) {
    logDebug('fetch-user-tree.build-forest', {
      mode: 'denied',
      userPermissionsId,
      rootGrantCount: rootGrants.length,
      totalDurationMs: Date.now() - buildStartedAt,
    });
    return [];
  }

  const postsRepository = new AIPostsRepository(supabase);
  const forests: FetchUserTreeResult['user'] = [];

  const graphLoadStartedAt = Date.now();
  const graphLoad = await loadGraphsForRootGrantsWithStats(neo, rootGrants, { maxDepth: options.maxDepth ?? undefined });
  const graphLoadDurationMs = Date.now() - graphLoadStartedAt;

  const filteredGraphByRootId = new Map<string, TreeGraph>();
  const uniqueSubjectIds = new Set<string>();

  for (const rootGrant of rootGrants) {
    const graph = graphLoad.graphs.get(rootGrant.rootId) || { nodes: [], edges: [] };
    const filteredGraph = filterTreeGraphForOrganizationAccess({
      rootId: rootGrant.rootId,
      graph,
      accessContext: orgContext,
    });

    filteredGraphByRootId.set(rootGrant.rootId, filteredGraph);
    for (const node of filteredGraph.nodes) {
      if (node.labels.includes(GRAPH_LABELS.subjectRef)) {
        uniqueSubjectIds.add(subjectLookupId(node));
      }
    }
  }

  const postHydrationStartedAt = Date.now();
  const hydratedPosts = options.includePosts === false ? [] : await postsRepository.getBySubjectIds(Array.from(uniqueSubjectIds));
  const filteredPosts = filterTreePostsForOrganizationAccess(hydratedPosts, orgContext);
  const postsBySubjectId = new Map<string, typeof filteredPosts>();

  for (const post of filteredPosts) {
    if (!post.subject_id) {
      continue;
    }
    const bucket = postsBySubjectId.get(post.subject_id) || [];
    bucket.push(post);
    postsBySubjectId.set(post.subject_id, bucket);
  }

  const postHydrationDurationMs = Date.now() - postHydrationStartedAt;
  const summaryByNodeId = options.includeCounts
    ? await loadTreeNodeSummaries(
        neo,
        postsRepository,
        Array.from(filteredGraphByRootId.values()).flatMap((graph) => graph.nodes.map((node) => node.id)),
        graphLoad.maxDepth,
      )
    : new Map<string, TreeNodeSummary>();

  for (const rootGrant of rootGrants) {
    const filteredGraph = filteredGraphByRootId.get(rootGrant.rootId) || { nodes: [], edges: [] };
    if (!filteredGraph.nodes.length) {
      continue;
    }

    const rootPostsBySubjectId = new Map<string, typeof filteredPosts>();
    for (const node of filteredGraph.nodes) {
      if (!node.labels.includes(GRAPH_LABELS.subjectRef)) {
        continue;
      }
      rootPostsBySubjectId.set(node.id, postsBySubjectId.get(subjectLookupId(node)) || []);
    }

    const tree = buildTreeFromGraph({
      rootId: rootGrant.rootId,
      nodes: filteredGraph.nodes,
      edges: filteredGraph.edges,
      permission: normalizePermission(userPermissionsId, rootGrant.ancestorId, rootGrant.grantType, rootGrant.permission),
      allowDescendants:
        rootGrant.grantType === ACCESS_RELATIONS.owns ||
        rootGrant.grantType === STRUCTURAL_RELATIONS.links ||
        rootGrant.permission?.recursive === true,
      postsBySubjectId: rootPostsBySubjectId,
    });
    forests.push(options.includeCounts ? attachTreeNodeSummaries(tree, summaryByNodeId) : tree);
  }

  logDebug('fetch-user-tree.build-forest', {
    userPermissionsId,
    rootGrantCount: rootGrants.length,
    graphQueryCount: graphLoad.queryCount,
    graphLoadMode: graphLoad.mode,
    graphFallbackReason: graphLoad.fallbackReason,
    uniqueSubjectIdCount: uniqueSubjectIds.size,
    graphMaxDepth: graphLoad.maxDepth,
    graphLoadDurationMs,
    postHydrationDurationMs,
    includeCounts: options.includeCounts === true,
    includePosts: options.includePosts !== false,
    totalDurationMs: Date.now() - buildStartedAt,
  });

  return forests;
}

export async function fetchUserTree(supabase: SupabaseClient, input: FetchUserTreeInput): Promise<FetchUserTreeResult> {
  const startedAt = Date.now();
  invariant(Boolean(input.userPermissionsId), 'userPermissionsId is required to fetch user tree.');

  const neo = await TreeGraphEntity.getNeo();
  const nowIso = input.nowIso || new Date().toISOString();
  const organizationId = input.organizationId || null;
  const orgContext = shouldApplyTreeOrganizationContext(organizationId)
    ? await getOrganizationAccessContext(supabase, input.userPermissionsId, organizationId)
    : null;

  const [organizationRootGrants, userRootGrants, globalRootGrants] = await Promise.all([
    organizationId
      ? loadRootGrants(neo, {
          userPermissionsId: input.userPermissionsId,
          organizationId,
          rootId: input.rootId,
          nowIso,
        })
      : Promise.resolve([]),
    loadRootGrants(neo, {
      userPermissionsId: input.userPermissionsId,
      rootId: input.rootId,
      nowIso,
    }),
    input.includeGlobal === false
      ? Promise.resolve([])
      : loadRootGrants(neo, {
          userPermissionsId: GRAPH_SYSTEM_IDS.userGlobal,
          rootId: input.rootId,
          nowIso,
        }),
  ]);

  const rootGrantRows: RootGrantPageRow[] = [];
  appendRootGrantPageRows(rootGrantRows, 'organization', organizationRootGrants);
  appendRootGrantPageRows(rootGrantRows, 'user', userRootGrants);
  appendRootGrantPageRows(rootGrantRows, 'global', globalRootGrants);
  const pagedRootGrantRows = paginateRootGrantRows(input, rootGrantRows);
  const organizationGrants = rootGrantsForBranch(pagedRootGrantRows, 'organization');
  const userGrants = rootGrantsForBranch(pagedRootGrantRows, 'user');
  const globalGrants = rootGrantsForBranch(pagedRootGrantRows, 'global');

  const [organization, user, global] = await Promise.all([
    buildForest(supabase, neo, input.userPermissionsId, organizationGrants, orgContext, {
      includeCounts: input.includeCounts === true,
      includePosts: input.includePosts !== false,
      maxDepth: input.depth ?? null,
    }),
    buildForest(supabase, neo, input.userPermissionsId, userGrants, orgContext, {
      includeCounts: input.includeCounts === true,
      includePosts: input.includePosts !== false,
      maxDepth: input.depth ?? null,
    }),
    buildForest(supabase, neo, GRAPH_SYSTEM_IDS.userGlobal, globalGrants, orgContext, {
      includeCounts: input.includeCounts === true,
      includePosts: input.includePosts !== false,
      maxDepth: input.depth ?? null,
    }),
  ]);

  logDebug('fetch-user-tree.completed', {
    mode: organizationId ? 'organization' : 'personal',
    userPermissionsId: input.userPermissionsId,
    organizationId,
    includeGlobal: input.includeGlobal !== false,
    first: input.first ?? null,
    offset: input.offset ?? null,
    organizationRootCount: organization.length,
    userRootCount: user.length,
    globalRootCount: global.length,
    totalDurationMs: Date.now() - startedAt,
  });

  return { user, organization, global };
}

export const __fetchUserTreeTestUtils = {
  loadGraphsForRootGrants,
  loadGraphsForRootGrantsWithStats,
  loadGraphsForRootGrantsLegacy,
  normalizeGraphRecords,
  resolveGraphTreeMaxDepth,
};

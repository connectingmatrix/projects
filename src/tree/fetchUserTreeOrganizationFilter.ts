import { toSafeString } from 'giga-ai-helper';
import type { GraphEdgeRecord, GraphNodeRecord } from '@gigav2/types/graph.types';
import type { OrganizationAccessContext, OrganizationModule } from '@gigav2/types/org.types';

type TreeGraph = {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
};

type TreeNodeModule = 'CHANNEL' | 'CATEGORY' | 'SUBJECT';

const NODE_LABEL_TO_MODULE: Array<{ label: string; module: TreeNodeModule }> = [
  { label: 'Channel', module: 'CHANNEL' },
  { label: 'Category', module: 'CATEGORY' },
  { label: 'SubjectRef', module: 'SUBJECT' },
];

function getReadPermission(accessContext: OrganizationAccessContext, module: OrganizationModule): boolean {
  if (accessContext.bypassPermissions) {
    return true;
  }

  return accessContext.modulePermissions[module]?.allowRead !== false;
}

function inferNodeModule(node: GraphNodeRecord): TreeNodeModule | null {
  for (const candidate of NODE_LABEL_TO_MODULE) {
    if (node.labels.includes(candidate.label)) {
      return candidate.module;
    }
  }

  return null;
}

function isTreeNodeDenied(accessContext: OrganizationAccessContext, node: GraphNodeRecord): boolean {
  const module = inferNodeModule(node);
  if (!module) return false;

  if (module === 'CHANNEL') return accessContext.deniedChannelIds.has(node.id);
  if (module === 'CATEGORY') return accessContext.deniedCategoryIds.has(node.id);
  return accessContext.deniedSubjectIds.has(node.id);
}

function canReadGraphNode(accessContext: OrganizationAccessContext | null | undefined, node: GraphNodeRecord): boolean {
  if (!accessContext) return true;
  if (!getReadPermission(accessContext, inferNodeModule(node) ?? 'CHANNEL')) return false;
  if (isTreeNodeDenied(accessContext, node)) return false;
  return true;
}

export function shouldApplyTreeOrganizationContext(organizationId: unknown): boolean {
  return Boolean(toSafeString(organizationId));
}

export function canAccessOrganizationTree(accessContext: OrganizationAccessContext | null | undefined): boolean {
  if (!accessContext) return true;
  if (accessContext.bypassPermissions) return true;
  return accessContext.hasMembership;
}

export function canReadOrganizationTreePosts(accessContext: OrganizationAccessContext | null | undefined): boolean {
  if (!accessContext) return true;
  return getReadPermission(accessContext, 'POST');
}

export function filterTreeGraphForOrganizationAccess(params: {
  rootId: string;
  graph: TreeGraph;
  accessContext?: OrganizationAccessContext | null;
}): TreeGraph {
  const accessContext = params.accessContext ?? null;
  if (!accessContext) {
    return params.graph;
  }

  const nodeById = new Map<string, GraphNodeRecord>();
  const edgesBySourceId = new Map<string, GraphEdgeRecord[]>();

  for (const node of params.graph.nodes) {
    nodeById.set(node.id, node);
  }

  for (const edge of params.graph.edges) {
    const bucket = edgesBySourceId.get(edge.sourceId) ?? [];
    bucket.push(edge);
    edgesBySourceId.set(edge.sourceId, bucket);
  }

  const keptNodeIds = new Set<string>();
  const keptEdges: GraphEdgeRecord[] = [];

  const visit = (nodeId: string) => {
    if (keptNodeIds.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node || !canReadGraphNode(accessContext, node)) {
      return;
    }

    keptNodeIds.add(nodeId);

    for (const edge of edgesBySourceId.get(nodeId) ?? []) {
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

export function filterTreePostsForOrganizationAccess<T extends { id?: string | null }>(
  posts: T[],
  accessContext?: OrganizationAccessContext | null,
): T[] {
  const orgContext = accessContext ?? null;
  if (!orgContext) return posts;
  if (!canReadOrganizationTreePosts(orgContext)) return [];

  return posts.filter((post) => !orgContext.deniedPostIds.has(toSafeString(post.id)));
}

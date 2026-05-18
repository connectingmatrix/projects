import { BadRequestError } from 'routing-controllers';
import { OrganisationEntity } from '@gigav2/repositories/entities';
import { TreeGraphEntity } from '@gigav2/services/giga/tree/system';
import { Subject } from '@gigav2/repositories/entities/tree/Subject';
import { fetchUserTree } from '@gigav2/services/giga/tree/fetchUserTree';
import { AgentActionCapability, AgentActionRuntime } from '@gigav2/types/agent.types';
import { GRAPH_LABELS, RESOURCE_TYPES, ResourceType, TreeNode } from '@gigav2/types/graph.types';
import { GigaActionOutput, emptyActionArtifacts } from '../types';
import { actionResultValue, optionalText, requiredText, requireCapability, resolveTreeNodeId } from './resolve';

const MAX_TEXT = 1200;

export function contentExcerpt(value: unknown) {
  const text = String(value || '');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

function nodes(items: TreeNode[]): TreeNode[] {
  const rows: TreeNode[] = [];
  for (const item of items) {
    rows.push(item, ...nodes(item.children || []));
  }
  return rows;
}

export async function readTreeNode(runtime: AgentActionRuntime, input: any, capability: AgentActionCapability, label: string) {
  await requireCapability(runtime, capability, `${label} read`);
  const id = requiredText(input, 'id');
  const tree = await fetchUserTree(runtime.supabase, {
    userPermissionsId: runtime.userId,
    rootId: id,
    organizationId: optionalText(input, 'organization_id') || null,
  } as any);
  const match = nodes([...(tree.user || []), ...(tree.organization || []), ...(tree.global || [])]).find((node) => node.id === id);
  if (!match) throw new BadRequestError(`${label} not found or not accessible.`);
  return match;
}

export function assertNodeType(node: TreeNode, label: string) {
  const expected = label === 'channel' ? RESOURCE_TYPES.channel : label === 'category' ? RESOURCE_TYPES.category : RESOURCE_TYPES.subject;
  if (node.nodeType !== expected) throw new BadRequestError(`${label} id resolved to ${node.nodeType}.`);
}

function nodeData(node: TreeNode) {
  return {
    id: node.id,
    nodeType: node.nodeType,
    name: node.name || null,
    slug: node.slug || null,
    description: node.description || null,
    isGlobal: node.isGlobal === true,
    children_count: node.children?.length || 0,
    posts_count: node.posts?.length || 0,
    permission: node.permission || null,
  };
}

const graphLabelByType: Record<ResourceType, string> = {
  [RESOURCE_TYPES.channel]: GRAPH_LABELS.channel,
  [RESOURCE_TYPES.category]: GRAPH_LABELS.category,
  [RESOURCE_TYPES.subject]: GRAPH_LABELS.subjectRef,
};

async function readPersonalNodeData(runtime: AgentActionRuntime, id: string, nodeType: ResourceType) {
  const neo = await TreeGraphEntity.getNeo();
  const rows = await neo.run<{ childrenCount: number; node: TreeNode | null }>(
    `
      MATCH (node:${graphLabelByType[nodeType]} {id: $id})
      WHERE node.createdBy = $userPermissionsId AND coalesce(node.organizationId, '') = ''
      OPTIONAL MATCH (node)-[:CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT]->(child)
      RETURN properties(node) AS node, count(DISTINCT child) AS childrenCount
      LIMIT 1
    `,
    { id, userPermissionsId: runtime.userId },
  );
  const row = rows[0];
  if (!row?.node) return null;
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

async function readOrganizationChannel(runtime: AgentActionRuntime, input: any, id: string) {
  const organizationId = optionalText(input, 'organization_id') || optionalText(input, 'organizationId');
  if (!organizationId) return null;
  type NodeRestrictionRow = { node_id?: string | null; node_type?: string | null };
  const [access, restrictions] = await Promise.all([
    OrganisationEntity.readScopeAccessRows(runtime.userId, organizationId),
    OrganisationEntity.readRestrictionRows({
      table: 'organization_node_restrictions',
      orgIds: [organizationId],
      fieldSelect: 'node_id,node_type',
      userId: runtime.userId,
    }),
  ]);
  const blocked = restrictions
    .map((row) => row as NodeRestrictionRow)
    .some((row) => String(row.node_type || '').toUpperCase() === 'CHANNEL' && String(row.node_id || '') === id);
  if (!access.organization || access.organization.is_active === false) throw new BadRequestError('Organization not found or inactive.');
  if (!access.membership) throw new BadRequestError('Channel not found or not accessible.');
  if (blocked) throw new BadRequestError('Channel not found or not accessible.');
  const neo = await TreeGraphEntity.getNeo();
  const rows = await neo.run<any>(
    `
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
    `,
    { id, organizationId },
  );
  const row = rows[0];
  if (!row?.channel) throw new BadRequestError('Channel not found or not accessible.');
  return {
    id: row.channel.id,
    nodeType: RESOURCE_TYPES.channel,
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

const channelSelector = (input: any) => {
  const prefix =
    optionalText(input, 'name_prefix') ||
    optionalText(input, 'namePrefix') ||
    optionalText(input, 'starts_with') ||
    optionalText(input, 'startsWith') ||
    optionalText(input, 'prefix');
  const name =
    optionalText(input, 'name') || optionalText(input, 'channel_name') || optionalText(input, 'channelName') || optionalText(input, 'slug');
  const match = optionalText(input, 'match') || optionalText(input, 'query');
  const wildcard = String(name || match || '').trim();
  const wildcardPrefix = wildcard.endsWith('*') ? wildcard.slice(0, -1).trim() : '';
  return { prefix: String(prefix || wildcardPrefix || '').trim(), exact: String(wildcardPrefix ? '' : wildcard).trim() };
};

const channelRows = (tree: any) =>
  nodes([...(tree.user || []), ...(tree.organization || []), ...(tree.global || [])])
    .filter((node) => node.nodeType === RESOURCE_TYPES.channel)
    .map((node) => ({
      id: node.id,
      name: node.name || null,
      slug: node.slug || null,
      description: node.description || null,
      isGlobal: node.isGlobal === true,
      children_count: node.children?.length || 0,
      posts_count: node.posts?.length || 0,
      permission: node.permission || null,
    }));

export async function runReadChannel(runtime: AgentActionRuntime, input: any): Promise<GigaActionOutput> {
  await requireCapability(runtime, 'CAN_READ_CHANNEL', 'channel read');
  const id = actionResultValue(runtime, input, ['channel_action_id'], ['channel_id', 'channel']) || optionalText(input, 'id');
  if (id) {
    const directChannel = await readOrganizationChannel(runtime, input, id);
    if (directChannel)
      return { summary: `Read channel "${directChannel.name || directChannel.id}".`, data: { channel: directChannel }, ...emptyActionArtifacts };
    const personalChannel = await readPersonalNodeData(runtime, id, RESOURCE_TYPES.channel);
    if (personalChannel)
      return {
        summary: `Read channel "${personalChannel.name || personalChannel.id}".`,
        data: { channel: personalChannel },
        ...emptyActionArtifacts,
      };
    const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_CHANNEL', 'channel');
    assertNodeType(node, 'channel');
    const channel = nodeData(node);
    return { summary: `Read channel "${channel.name || channel.id}".`, data: { channel }, ...emptyActionArtifacts };
  }
  const selector = channelSelector(input);
  if (!selector.prefix && !selector.exact) throw new BadRequestError('read_channel requires id, name, or name_prefix.');
  const tree = await fetchUserTree(runtime.supabase, {
    userPermissionsId: runtime.userId,
    organizationId: optionalText(input, 'organization_id') || optionalText(input, 'organizationId') || null,
  } as any);
  const rows = channelRows(tree);
  const prefix = selector.prefix.toLowerCase();
  const exact = selector.exact.toLowerCase();
  const matches = rows.filter((channel) => {
    const name = String(channel.name || '').toLowerCase();
    const slug = String(channel.slug || '').toLowerCase();
    if (selector.prefix) return name.startsWith(prefix) || slug.startsWith(prefix);
    return channel.id === selector.exact || name === exact || slug === exact;
  });
  const key = selector.prefix ? `${selector.prefix}*` : selector.exact;
  return {
    summary: matches.length ? `Matched ${matches.length} channel(s) for "${key}".` : `No channel found for selector "${key}".`,
    data: { selector: key, matched_count: matches.length, matched_channels: matches, channel: matches.length === 1 ? matches[0] : null },
    ...emptyActionArtifacts,
  };
}

export async function runReadCategory(runtime: AgentActionRuntime, input: any): Promise<GigaActionOutput> {
  await requireCapability(runtime, 'CAN_READ_CATEGORY', 'category read');
  const id = await resolveTreeNodeId(
    runtime,
    { ...input, id: actionResultValue(runtime, input, ['category_action_id'], ['category_id', 'category']) || optionalText(input, 'id') },
    { idKey: 'id', label: 'category', nameKeys: ['category_name', 'category', 'name'], nodeType: RESOURCE_TYPES.category },
  );
  const personalCategory = await readPersonalNodeData(runtime, id, RESOURCE_TYPES.category);
  if (personalCategory)
    return {
      summary: `Read category "${personalCategory.name || personalCategory.id}".`,
      data: { category: personalCategory },
      ...emptyActionArtifacts,
    };
  const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_CATEGORY', 'category');
  assertNodeType(node, 'category');
  const category = nodeData(node);
  return { summary: `Read category "${category.name || category.id}".`, data: { category }, ...emptyActionArtifacts };
}

export async function runReadSubject(runtime: AgentActionRuntime, input: any): Promise<GigaActionOutput> {
  await requireCapability(runtime, 'CAN_READ_SUBJECT', 'subject read');
  const id = await resolveTreeNodeId(
    runtime,
    { ...input, id: actionResultValue(runtime, input, ['subject_action_id'], ['subject_id', 'subject']) || optionalText(input, 'id') },
    { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: RESOURCE_TYPES.subject },
  );
  const personalSubject = await readPersonalNodeData(runtime, id, RESOURCE_TYPES.subject);
  let graph = personalSubject;
  if (!graph) {
    const node = await readTreeNode(runtime, { ...input, id }, 'CAN_READ_SUBJECT', 'subject');
    assertNodeType(node, 'subject');
    graph = nodeData(node);
  }
  const row = await Subject.single(id);
  if (!row) throw new BadRequestError('Subject not found.');
  const data = row.extract() as Record<string, unknown>;
  const subject = { ...data, graph, summary: contentExcerpt(data.summary) };
  return { summary: `Read subject "${String(data.name || data.id || id)}".`, data: { subject }, ...emptyActionArtifacts };
}

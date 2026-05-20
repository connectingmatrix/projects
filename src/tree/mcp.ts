import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { PostEntity } from '@connectingmatrix/orm/entities/tree/Post';
import { fetchUserTree } from './fetchUserTree';
import { runFetchUserTree } from './fetch';
import {
  CHANNEL_TREE_ACTION_CATALOG,
  CHANNEL_TREE_ACTION_HANDLERS,
  CHANNEL_TREE_ACTION_NAMES,
  CHANNEL_TREE_MUTATING_ACTION_NAMES,
  CHANNEL_TREE_READ_ACTION_NAMES,
} from './channel/mcp';
import {
  CATEGORY_TREE_ACTION_CATALOG,
  CATEGORY_TREE_ACTION_HANDLERS,
  CATEGORY_TREE_ACTION_NAMES,
  CATEGORY_TREE_MUTATING_ACTION_NAMES,
  CATEGORY_TREE_READ_ACTION_NAMES,
} from './category/mcp';
import {
  SUBJECT_TREE_ACTION_CATALOG,
  SUBJECT_TREE_ACTION_HANDLERS,
  SUBJECT_TREE_ACTION_NAMES,
  SUBJECT_TREE_MUTATING_ACTION_NAMES,
  SUBJECT_TREE_READ_ACTION_NAMES,
} from './subject/mcp';
import {
  POST_TREE_ACTION_CATALOG,
  POST_TREE_ACTION_HANDLERS,
  POST_TREE_ACTION_NAMES,
  POST_TREE_MUTATING_ACTION_NAMES,
  POST_TREE_READ_ACTION_NAMES,
} from './post/mcp';
import type { AgentActionDefinition, AgentActionName, AgentActionRuntime } from '@gigav2/types/agent.types';
import type { GigaActionOutput } from './types';

const inputRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const schema = (input: Record<string, unknown>) => input;
const actionDef = (name: AgentActionName, description: string, input_schema: Record<string, unknown>, mutating = true): AgentActionDefinition => ({
  name,
  description,
  input_schema,
  mutating,
});

const pathSegments = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => toSafeString(item)).filter(Boolean);
  return toSafeString(value)
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
};

const treeNodes = (items: any[]): any[] => {
  const rows: any[] = [];
  for (const item of items || []) rows.push(item, ...treeNodes(item.children || []));
  return rows;
};

const childChannels = (items: any[], parentId: string | null) => {
  if (!parentId) return items.filter((item) => item?.nodeType === 'CHANNEL');
  const parent = treeNodes(items).find((item) => item?.id === parentId);
  return (parent?.children || []).filter((item: any) => item?.nodeType === 'CHANNEL');
};

export const FETCH_TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  actionDef(
    'fetch_user_tree',
    'Fetch the current user tree of channels, categories, subjects, and posts.',
    schema({ root_id: 'uuid optional' }),
    false,
  ),
];
export const TREE_READ_ACTION_NAMES: AgentActionName[] = [
  'fetch_user_tree',
  ...CHANNEL_TREE_READ_ACTION_NAMES,
  ...CATEGORY_TREE_READ_ACTION_NAMES,
  ...SUBJECT_TREE_READ_ACTION_NAMES,
  ...POST_TREE_READ_ACTION_NAMES,
];
export const TREE_MUTATING_ACTION_NAMES: AgentActionName[] = [
  ...CHANNEL_TREE_MUTATING_ACTION_NAMES,
  ...CATEGORY_TREE_MUTATING_ACTION_NAMES,
  ...SUBJECT_TREE_MUTATING_ACTION_NAMES,
  ...POST_TREE_MUTATING_ACTION_NAMES,
];
export const TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  ...FETCH_TREE_ACTION_CATALOG,
  ...CHANNEL_TREE_ACTION_CATALOG,
  ...CATEGORY_TREE_ACTION_CATALOG,
  ...SUBJECT_TREE_ACTION_CATALOG,
  ...POST_TREE_ACTION_CATALOG,
];
export const TREE_ACTION_NAMES = new Set<AgentActionName>([
  'fetch_user_tree',
  ...CHANNEL_TREE_ACTION_NAMES,
  ...CATEGORY_TREE_ACTION_NAMES,
  ...SUBJECT_TREE_ACTION_NAMES,
  ...POST_TREE_ACTION_NAMES,
]);
export const WORKFLOW_TREE_GROUPED_ACTIONS: Record<string, AgentActionName[]> = {
  'run-channel-action': CHANNEL_TREE_ACTION_NAMES,
  'run-category-action': CATEGORY_TREE_ACTION_NAMES,
  'run-subject-action': SUBJECT_TREE_ACTION_NAMES,
  'run-post-action': POST_TREE_ACTION_NAMES,
  'run-user-tree-action': ['fetch_user_tree'],
};

const TREE_ACTION_HANDLERS: Partial<
  Record<AgentActionName, (runtime: AgentActionRuntime, input?: Record<string, any>) => Promise<GigaActionOutput>>
> = {
  fetch_user_tree: runFetchUserTree,
  ...CHANNEL_TREE_ACTION_HANDLERS,
  ...CATEGORY_TREE_ACTION_HANDLERS,
  ...SUBJECT_TREE_ACTION_HANDLERS,
  ...POST_TREE_ACTION_HANDLERS,
};

export function isTreeAction(name: AgentActionName) {
  return TREE_ACTION_NAMES.has(name);
}

export async function executeTreeAction(name: AgentActionName, runtime: AgentActionRuntime, input?: Record<string, any>): Promise<GigaActionOutput> {
  const handler = TREE_ACTION_HANDLERS[name];
  if (!handler) throw new Error(`Unsupported tree action ${name}.`);
  return handler(runtime, input);
}

export const fetchMcpTree = (runtime: AgentActionRuntime, args: Record<string, unknown>) =>
  fetchUserTree(runtime.supabase, {
    userPermissionsId: runtime.userId || '',
    organizationId: toSafeString(args.organizationId) || null,
    rootId: toSafeString(args.rootId) || undefined,
    rootType: (toSafeString(args.rootType) || undefined) as any,
    includeGlobal: args.includeGlobal !== false,
  });

export const runMcpTreeAction = (runtime: AgentActionRuntime, args: Record<string, unknown>) => {
  const action = toSafeString(args.action) as AgentActionName;
  if (!TREE_ACTION_NAMES.has(action)) throw new BadRequestError(`Unsupported tree action "${action}".`);
  const input = inputRecord(args.input);
  if (args.dryRun === true) return Promise.resolve({ action, input });
  return executeTreeAction(action, runtime, input);
};

export async function ensureMcpChannelPath(runtime: AgentActionRuntime, args: Record<string, unknown>) {
  const organizationId = toSafeString(args.organizationId);
  const segments = pathSegments(args.path || args.segments);
  if (!segments.length) throw new BadRequestError('path or segments are required.');
  if (args.dryRun === true) return { action: 'ensure_channel_path', organizationId, segments };

  let tree = await fetchMcpTree(runtime, args);
  let parentId: string | null = null;
  const created: any[] = [];
  const resolved: any[] = [];

  for (const segment of segments) {
    const roots = organizationId ? tree.organization || [] : tree.user || [];
    const match = childChannels(roots, parentId).find(
      (node) => String(node.name || '').toLowerCase() === segment.toLowerCase() || String(node.slug || '').toLowerCase() === segment.toLowerCase(),
    );
    if (match) {
      parentId = String(match.id);
      resolved.push(match);
      continue;
    }

    const scopeId = organizationId || runtime.userId;
    const channelSlug =
      segment
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
    const channel = (result.data as any)?.channel || { id: (result.data as any)?.channel_id, name: segment };
    parentId = String(channel.id || (result.data as any)?.channel_id || '');
    created.push(channel);
    resolved.push(channel);
    tree = await fetchMcpTree(runtime, args);
  }

  return { channelId: parentId, path: segments.join('/'), created, resolved };
}

export async function ensureMcpKnowledgePosts(runtime: AgentActionRuntime, args: Record<string, unknown>) {
  let subjectId = toSafeString(args.subjectId || args.subject_id);
  if (!subjectId && toSafeString(args.subjectName || args.subject_name)) {
    const subject = await executeTreeAction('read_subject', runtime, {
      subject_name: toSafeString(args.subjectName || args.subject_name),
      organization_id: toSafeString(args.organizationId),
    }).catch(() => null);
    subjectId = toSafeString((subject?.data as any)?.subject?.id);
  }
  if (!subjectId && toSafeString(args.categoryId || args.category_id)) {
    const created = await executeTreeAction('create_subject', runtime, {
      name: toSafeString(args.subjectName || args.subject_name || 'Knowledge'),
      categoryId: toSafeString(args.categoryId || args.category_id),
      organizationId: toSafeString(args.organizationId),
      userPermissionsId: runtime.userId,
    });
    subjectId = toSafeString((created.data as any)?.subject_id);
  }
  if (!subjectId) throw new BadRequestError('subjectId, subjectName, or categoryId is required.');

  const posts = Array.isArray(args.posts) ? args.posts.map(inputRecord) : [];
  if (args.dryRun === true) return { action: 'ensure_knowledge_posts', subjectId, posts };
  const rows = await PostEntity.ensureKnowledgePosts(subjectId, posts);

  return { subjectId, posts: rows, count: rows.length };
}

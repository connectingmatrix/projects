import { RESOURCE_TYPES } from '@gigav2/types/graph.types';
import { actionResultValue, optionalText, requireCapability, resolvePostId, resolveTreeNodeId } from '../shared/resolve';
import { executeTreeOrm } from '../shared/inner-graphql';
import { emptyActionArtifacts, type GigaActionOutput } from '../types';
import { PERMISSION_MATRIX } from '../shared/permissions';
import { PostEntity, SubjectEntity } from '@gigav2/repositories/entities';
import type { AgentActionDefinition, AgentActionName, AgentActionRuntime } from '@gigav2/types/agent.types';

type InputRecord = Record<string, unknown>;

const schema = (input: Record<string, unknown>) => input;
const actionDef = (name: AgentActionName, description: string, input_schema: Record<string, unknown>, mutating = true): AgentActionDefinition => ({
  name,
  description,
  input_schema,
  mutating,
});
const entityRow = (value: any): Record<string, unknown> => ({ ...(value?.extract?.() || value?.payload || value?.data || value || {}) });

const readPostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.READ, PERMISSION_MATRIX.POST.READ);
  const payload = input || {};
  const id = await resolvePostId(runtime, payload, {
    idKeys: ['id', 'post_id'],
    titleKeys: ['post_title', 'title', 'name'],
    actionKeys: ['post_action_id'],
  });
  const post = await executeTreeOrm<Record<string, unknown> | null>(runtime, 'Posts.read', { id }, async () => {
    const row = await PostEntity.single(id);
    return row ? entityRow(row) : null;
  });
  return {
    summary: post ? `Read post "${String(post.title || id)}".` : `No post found for id ${id}.`,
    data: { post_id: id, post },
    ...emptyActionArtifacts,
  };
};

const readAttachmentsAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.ATTACHMENTS, PERMISSION_MATRIX.POST.ATTACHMENTS);
  const payload = input || {};
  const id = await resolvePostId(runtime, payload, { idKeys: ['post_id', 'id'], titleKeys: ['post_title', 'title'], actionKeys: ['post_action_id'] });
  const attachments = await executeTreeOrm<Array<Record<string, unknown>>>(runtime, 'Posts.Attachments.list', { id }, async () => {
    const rows = await (PostEntity.load(id).attachments as any).list(undefined, { orderBy: 'created_at', ascending: true });
    const attachmentId = optionalText(payload, 'attachment_id') || null;
    return rows
      .map((row: any) => entityRow(row))
      .filter((row: Record<string, unknown>) => !attachmentId || String(row.id || '') === attachmentId);
  });
  return { summary: `Read ${attachments.length} attachment(s) for post "${id}".`, data: { post_id: id, attachments }, ...emptyActionArtifacts };
};

const createPostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.CREATE, PERMISSION_MATRIX.POST.CREATE);
  const payload = input || {};
  const subjectId = String(payload.subject_id || '').trim();
  const postPayload = {
    title: payload.title,
    narrative: payload.narrative,
    metadata: payload.metadata,
  };
  const post = await executeTreeOrm<Record<string, unknown> | null>(
    runtime,
    'Posts.create',
    { input: { ...postPayload, subject_id: subjectId } },
    async () => entityRow(await (SubjectEntity.load(subjectId).posts as any).create(postPayload)),
  );
  return {
    summary: `Created post "${String(post?.title || payload.title || '')}".`,
    data: { post: post || null, post_id: post?.id || null },
    ...emptyActionArtifacts,
  };
};

const updatePostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.UPDATE, PERMISSION_MATRIX.POST.UPDATE);
  const payload = input || {};
  const id = await resolvePostId(runtime, payload, {
    idKeys: ['id', 'post_id'],
    titleKeys: ['post_title', 'title', 'name'],
    actionKeys: ['post_action_id'],
  });
  const subjectId = optionalText(payload, 'subject_id')
    ? await resolveTreeNodeId(
        runtime,
        {
          ...payload,
          id: actionResultValue(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || optionalText(payload, 'subject_id') || '',
        },
        { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: RESOURCE_TYPES.subject, preferScopedRoot: true },
      )
    : null;
  const patch: Record<string, unknown> = {};
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.narrative !== undefined) patch.narrative = payload.narrative;
  if (payload.metadata !== undefined) patch.metadata = payload.metadata;
  if (subjectId) patch.subject_id = subjectId;
  const post = await executeTreeOrm<Record<string, unknown> | null>(runtime, 'Posts.update', { id, input: patch }, async () =>
    entityRow(await PostEntity.updateById(id, patch)),
  );
  return { summary: `Updated post "${String(post?.title || id)}".`, data: { post_id: id, post: post || null }, ...emptyActionArtifacts };
};

const deletePostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.DELETE, PERMISSION_MATRIX.POST.DELETE);
  const payload = input || {};
  const id = await resolvePostId(runtime, payload, {
    idKeys: ['id', 'post_id'],
    titleKeys: ['post_title', 'title', 'name'],
    actionKeys: ['post_action_id'],
  });
  const deletedCount = await executeTreeOrm<number>(runtime, 'Posts.delete', { id }, async () => PostEntity.deleteById(id));
  const message = deletedCount ? `Post ${id} deleted successfully` : `No post found for id ${id}`;
  return { summary: message, data: { post_id: id, message }, ...emptyActionArtifacts };
};

export const POST_TREE_READ_ACTION_NAMES: AgentActionName[] = ['read_post', 'read_attachments'];
export const POST_TREE_MUTATING_ACTION_NAMES: AgentActionName[] = ['create_post', 'update_post', 'delete_post'];
export const POST_TREE_ACTION_NAMES: AgentActionName[] = [...POST_TREE_READ_ACTION_NAMES, ...POST_TREE_MUTATING_ACTION_NAMES];

export const POST_TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  actionDef(
    'read_post',
    'Read an accessible post by id or title with bounded narrative and attachment metadata.',
    schema({
      id: 'uuid optional',
      post_id: 'uuid optional',
      post_action_id: 'action id optional',
      post_title: 'string optional',
      title: 'string optional',
      name: 'string optional',
      organization_id: 'uuid optional',
    }),
    false,
  ),
  actionDef(
    'read_attachments',
    'Read accessible post attachment metadata.',
    schema({ post_id: 'uuid optional', attachment_id: 'uuid optional', organization_id: 'uuid optional' }),
    false,
  ),
  actionDef(
    'create_post',
    'Create a post under a subject.',
    schema({ subject_id: 'uuid', title: 'string', narrative: 'string optional', metadata: 'object optional' }),
  ),
  actionDef(
    'update_post',
    'Update post fields.',
    schema({
      id: 'uuid optional',
      post_id: 'uuid optional',
      post_action_id: 'action id optional',
      post_title: 'string optional',
      title: 'string optional',
      subject_id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      subject: 'string optional',
      narrative: 'string optional',
      metadata: 'object optional',
    }),
  ),
  actionDef(
    'delete_post',
    'Delete a post.',
    schema({
      id: 'uuid optional',
      post_id: 'uuid optional',
      post_action_id: 'action id optional',
      post_title: 'string optional',
      title: 'string optional',
      name: 'string optional',
    }),
  ),
];

export const POST_TREE_ACTION_HANDLERS: Partial<
  Record<AgentActionName, (runtime: AgentActionRuntime, input?: InputRecord) => Promise<GigaActionOutput>>
> = {
  read_post: readPostAction,
  read_attachments: readAttachmentsAction,
  create_post: createPostAction,
  update_post: updatePostAction,
  delete_post: deletePostAction,
};

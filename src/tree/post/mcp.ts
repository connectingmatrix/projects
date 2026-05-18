import { RESOURCE_TYPES } from '@gigav2/types/graph.types';
import { actionResultValue, optionalText, requireCapability, resolvePostId, resolveTreeNodeId } from '../shared/resolve';
import { executeTreeMutation, executeTreeQuery } from '../shared/inner-graphql';
import { emptyActionArtifacts, type GigaActionOutput } from '../types';
import { PERMISSION_MATRIX } from '../shared/permissions';
import type { AgentActionDefinition, AgentActionName, AgentActionRuntime } from '@gigav2/types/agent.types';

type InputRecord = Record<string, unknown>;

const schema = (input: Record<string, unknown>) => input;
const actionDef = (name: AgentActionName, description: string, input_schema: Record<string, unknown>, mutating = true): AgentActionDefinition => ({
  name,
  description,
  input_schema,
  mutating,
});

const readPostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.READ, PERMISSION_MATRIX.POST.READ);
  const payload = input || {};
  const id = await resolvePostId(runtime, payload, {
    idKeys: ['id', 'post_id'],
    titleKeys: ['post_title', 'title', 'name'],
    actionKeys: ['post_action_id'],
  });
  const post = await executeTreeQuery<Record<string, unknown> | null>(runtime, 'aiReadPost', { input: { id } });
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
  const attachments = await executeTreeQuery<Array<Record<string, unknown>>>(runtime, 'aiReadAttachments', {
    input: { post_id: id, attachment_id: optionalText(payload, 'attachment_id') || null },
  });
  return { summary: `Read ${attachments.length} attachment(s) for post "${id}".`, data: { post_id: id, attachments }, ...emptyActionArtifacts };
};

const createPostAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.POST.CREATE, PERMISSION_MATRIX.POST.CREATE);
  const payload = input || {};
  const post = await executeTreeMutation<Record<string, unknown> | null>(runtime, 'createAiPost', {
    input: {
      subject_id: payload.subject_id,
      title: payload.title,
      narrative: payload.narrative,
      metadata: payload.metadata,
    },
  });
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
  const patch: Record<string, unknown> = { id };
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.narrative !== undefined) patch.narrative = payload.narrative;
  if (payload.metadata !== undefined) patch.metadata = payload.metadata;
  if (subjectId) patch.subject_id = subjectId;
  const post = await executeTreeMutation<Record<string, unknown> | null>(runtime, 'aiUpdatePost', { input: patch });
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
  const result = await executeTreeMutation<{ message: string }>(runtime, 'deleteAiPost', { id });
  return { summary: result.message || `Deleted post "${id}".`, data: { post_id: id, message: result.message || null }, ...emptyActionArtifacts };
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

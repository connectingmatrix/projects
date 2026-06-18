import { RESOURCE_TYPES } from '@gigav2/types/graph.types';
import { actionResultValue, optionalText, requireCapability, resolveTreeNodeId } from '../shared/resolve';
import { executeTreeMutation, executeTreeOrm } from '../shared/inner-graphql';
import { runReadSubject } from '../shared/read';
import { emptyActionArtifacts, type GigaActionOutput } from '../types';
import { PERMISSION_MATRIX } from '../shared/permissions';
import { CategoryEntity, SubjectEntity } from '@connectingmatrix/orm/entities';
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

const createSubjectAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.SUBJECT.CREATE, PERMISSION_MATRIX.SUBJECT.CREATE);
  const payload = input || {};
  const categoryId = optionalText(payload, 'categoryId') || optionalText(payload, 'category_id') || null;
  const parentSubjectId = optionalText(payload, 'parentSubjectId') || optionalText(payload, 'parent_subject_id') || null;
  if (Boolean(categoryId) === Boolean(parentSubjectId)) throw new Error('Exactly one subject parent is required.');
  const subjectPayload = {
    name: payload.name,
    description: payload.description || null,
    metadata: (payload.metadata || {}) as Record<string, unknown>,
    summary: payload.summary || null,
  };
  const subject = await executeTreeOrm<Record<string, unknown>>(
    runtime,
    'SubjectRefs.create',
    { input: { ...subjectPayload, categoryId, parentSubjectId } },
    async () => {
      const created = categoryId
        ? await (CategoryEntity.load(categoryId).subjects as any).create(subjectPayload)
        : await (SubjectEntity.load(parentSubjectId || '').subjects as any).create(subjectPayload);
      return entityRow(created);
    },
  );
  const subjectId = String(subject.id || '');
  return {
    summary: `Created subject "${String(subject.name || payload.name || '')}".`,
    data: { subject_id: subjectId || null, subject },
    ...emptyActionArtifacts,
  };
};

const updateSubjectAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.SUBJECT.UPDATE, PERMISSION_MATRIX.SUBJECT.UPDATE);
  const payload = input || {};
  const id = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id:
        actionResultValue(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) ||
        optionalText(payload, 'subject_id') ||
        optionalText(payload, 'id'),
    },
    { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: RESOURCE_TYPES.subject, preferScopedRoot: true },
  );
  const patch: Record<string, unknown> = {};
  if (payload.name !== undefined) patch.name = payload.name;
  if (payload.description !== undefined) patch.description = payload.description;
  if (payload.metadata !== undefined) patch.metadata = payload.metadata;
  const subject = await executeTreeOrm<Record<string, unknown>>(runtime, 'SubjectRefs.update', { id, input: patch }, async () =>
    entityRow(await SubjectEntity.updateById(id, patch)),
  );
  return { summary: `Updated subject "${String(subject.name || id)}".`, data: { subject_id: id, subject }, ...emptyActionArtifacts };
};

const deleteSubjectAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.SUBJECT.DELETE, PERMISSION_MATRIX.SUBJECT.DELETE);
  const payload = input || {};
  const id = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || optionalText(payload, 'subject_id') || '',
    },
    { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject', 'name'], nodeType: RESOURCE_TYPES.subject, preferScopedRoot: true },
  );
  const deletedCount = await executeTreeOrm<number>(runtime, 'SubjectRefs.delete', { id }, async () => SubjectEntity.deleteById(id));
  const message = deletedCount ? `Subject ${id} deleted successfully` : `No subject found for id ${id}`;
  return {
    summary: message,
    data: { subject_id: id, message },
    ...emptyActionArtifacts,
  };
};

const attachSubjectAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.SUBJECT.LINK, PERMISSION_MATRIX.SUBJECT.LINK);
  const payload = input || {};
  const subjectId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || optionalText(payload, 'subject_id') || '',
    },
    { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: RESOURCE_TYPES.subject, preferScopedRoot: true },
  );
  const categoryId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) || optionalText(payload, 'category_id') || '',
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiAttachSubjectToCategory', { input: { subjectId, categoryId } });
  return { summary: `Attached subject "${subjectId}" to category "${categoryId}".`, data: result, ...emptyActionArtifacts };
};

const unlinkSubjectAction = async (runtime: AgentActionRuntime, input?: InputRecord): Promise<GigaActionOutput> => {
  await requireCapability(runtime, PERMISSION_MATRIX.SUBJECT.UNLINK, PERMISSION_MATRIX.SUBJECT.UNLINK);
  const payload = input || {};
  const subjectId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['subject_action_id'], ['subject_id', 'subject']) || optionalText(payload, 'subject_id') || '',
    },
    { idKey: 'id', label: 'subject', nameKeys: ['subject_name', 'subject'], nodeType: RESOURCE_TYPES.subject, preferScopedRoot: true },
  );
  const categoryId = await resolveTreeNodeId(
    runtime,
    {
      ...payload,
      id: actionResultValue(runtime, payload, ['category_action_id'], ['category_id', 'category']) || optionalText(payload, 'category_id') || '',
    },
    { idKey: 'id', label: 'category', nameKeys: ['category_name'], nodeType: RESOURCE_TYPES.category, preferScopedRoot: true },
  );
  const result = await executeTreeMutation<Record<string, unknown>>(runtime, 'aiUnlinkSubjectFromCategory', { input: { subjectId, categoryId } });
  return { summary: `Removed shared subject link "${subjectId}" from category "${categoryId}".`, data: result, ...emptyActionArtifacts };
};

export const SUBJECT_TREE_READ_ACTION_NAMES: AgentActionName[] = ['read_subject'];
export const SUBJECT_TREE_MUTATING_ACTION_NAMES: AgentActionName[] = [
  'create_subject',
  'update_subject',
  'delete_subject',
  'link_subject',
  'unlink_subject',
];
export const SUBJECT_TREE_ACTION_NAMES: AgentActionName[] = [...SUBJECT_TREE_READ_ACTION_NAMES, ...SUBJECT_TREE_MUTATING_ACTION_NAMES];

export const SUBJECT_TREE_ACTION_CATALOG: AgentActionDefinition[] = [
  actionDef(
    'read_subject',
    'Read an accessible subject by id or name with bounded metadata and linked posts summary.',
    schema({
      id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      subject: 'string optional',
      name: 'string optional',
      organization_id: 'uuid optional',
    }),
    false,
  ),
  actionDef(
    'create_subject',
    'Create a subject under category/subject.',
    schema({
      name: 'string',
      description: 'string optional',
      categoryId: 'uuid optional',
      parentSubjectId: 'uuid optional',
      summary: 'object optional',
      metadata: 'object optional',
    }),
  ),
  actionDef(
    'update_subject',
    'Update subject fields.',
    schema({
      id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      subject: 'string optional',
      name: 'string optional',
      description: 'string optional',
      metadata: 'object optional',
    }),
  ),
  actionDef(
    'delete_subject',
    'Delete a subject.',
    schema({
      id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      subject: 'string optional',
      name: 'string optional',
    }),
  ),
  actionDef(
    'link_subject',
    'Attach a subject to a category hierarchy.',
    schema({
      subject_id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      category_id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
    }),
  ),
  actionDef(
    'unlink_subject',
    'Remove a shared subject LINKS edge from a category without detaching hierarchy.',
    schema({
      subject_id: 'uuid optional',
      subject_action_id: 'action id optional',
      subject_name: 'string optional',
      category_id: 'uuid optional',
      category_action_id: 'action id optional',
      category_name: 'string optional',
    }),
  ),
];

export const SUBJECT_TREE_ACTION_HANDLERS: Partial<
  Record<AgentActionName, (runtime: AgentActionRuntime, input?: InputRecord) => Promise<GigaActionOutput>>
> = {
  read_subject: runReadSubject,
  create_subject: createSubjectAction,
  update_subject: updateSubjectAction,
  delete_subject: deleteSubjectAction,
  link_subject: attachSubjectAction,
  unlink_subject: unlinkSubjectAction,
};

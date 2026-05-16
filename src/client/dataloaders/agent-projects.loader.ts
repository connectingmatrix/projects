import type { AIAgentProjectBuildPayload, AIAgentProjectDatabasePayload, AIAgentProjectDatabaseViewerPayload, AIAgentProjectExternalDatabaseVerifyPayload, AIAgentProjectFileDeletePayload, AIAgentProjectFileRecord, AIAgentProjectRecord } from '@giga/dataloader/client/legacy/orm';
import { aiAgentProjectOperation, aiAgentProjectsOperation, alterAiAgentProjectDatabaseOperation, buildAiAgentProjectOperation, createAiAgentProjectFolderOperation, createAiAgentProjectOperation, deleteAiAgentProjectFileOperation, deleteAiAgentProjectOperation, deployAiAgentProjectOperation, launchAiAgentProjectDatabaseViewerOperation, queryAiAgentProjectDatabaseOperation, readAiAgentProjectFileOperation, runAiAgentProjectOperation, updateAiAgentProjectOperation, verifyAiAgentProjectExternalDatabaseOperation, writeAiAgentProjectFileOperation } from '@giga/dataloader/client/legacy/orm';
import type { UiDataContext } from '@giga/dataloader/client/legacy/dataloaders/context';
import { assertCanPerform } from '@giga/dataloader/client/legacy/dataloaders/permissions.loader';

export const loadAiAgentProject = async (context: UiDataContext, id: string): Promise<AIAgentProjectRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'read');
    return aiAgentProjectOperation(id);
};

export const listAiAgentProjects = async (context: UiDataContext, agentId?: string | null): Promise<AIAgentProjectRecord[]> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'list');
    return aiAgentProjectsOperation(agentId || null);
};

export const createAiAgentProject = async (context: UiDataContext, input: Parameters<typeof createAiAgentProjectOperation>[0]): Promise<AIAgentProjectRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'create');
    return createAiAgentProjectOperation({ ...input, organizationId: input.organizationId || (context.policy.scope.kind === 'organization' ? context.policy.scope.id : null) });
};

export const updateAiAgentProject = async (context: UiDataContext, input: Parameters<typeof updateAiAgentProjectOperation>[0]): Promise<AIAgentProjectRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'update');
    return updateAiAgentProjectOperation(input);
};

export const deleteAiAgentProject = async (context: UiDataContext, id: string): Promise<void> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'delete');
    const deleted = await deleteAiAgentProjectOperation(id);
    if (!deleted) throw new Error(`AI Agent project ${id} was not deleted.`);
};

export const readAiAgentProjectFile = async (context: UiDataContext, projectId: string, path: string): Promise<AIAgentProjectFileRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'read');
    return readAiAgentProjectFileOperation(projectId, path);
};

export const writeAiAgentProjectFile = async (context: UiDataContext, projectId: string, path: string, content: string, mimeType?: string | null): Promise<AIAgentProjectFileRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'update');
    return writeAiAgentProjectFileOperation(projectId, path, content, mimeType || null);
};

export const createAiAgentProjectFolder = async (context: UiDataContext, projectId: string, path: string): Promise<AIAgentProjectFileRecord> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'update');
    return createAiAgentProjectFolderOperation(projectId, path);
};

export const deleteAiAgentProjectFile = async (context: UiDataContext, projectId: string, path: string): Promise<AIAgentProjectFileDeletePayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'delete');
    return deleteAiAgentProjectFileOperation(projectId, path);
};

export const queryAiAgentProjectDatabase = async (context: UiDataContext, projectId: string, sql: string): Promise<AIAgentProjectDatabasePayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return queryAiAgentProjectDatabaseOperation(projectId, sql);
};

export const alterAiAgentProjectDatabase = async (context: UiDataContext, projectId: string, sql: string): Promise<AIAgentProjectDatabasePayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'update');
    return alterAiAgentProjectDatabaseOperation(projectId, sql);
};

export const buildAiAgentProject = async (context: UiDataContext, projectId: string): Promise<AIAgentProjectBuildPayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return buildAiAgentProjectOperation(projectId, 'build', false);
};

export const runAiAgentProject = async (context: UiDataContext, projectId: string): Promise<AIAgentProjectBuildPayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return runAiAgentProjectOperation(projectId, 'run');
};

export const deployAiAgentProject = async (context: UiDataContext, projectId: string): Promise<AIAgentProjectBuildPayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return deployAiAgentProjectOperation(projectId, 'deploy');
};

export const verifyAiAgentProjectExternalDatabase = async (context: UiDataContext, projectId: string, connectionId?: string | null): Promise<AIAgentProjectExternalDatabaseVerifyPayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return verifyAiAgentProjectExternalDatabaseOperation(projectId, connectionId || null);
};

export const launchAiAgentProjectDatabaseViewer = async (context: UiDataContext, projectId: string, mode: 'query' | 'connect' = 'query', connectionId?: string | null): Promise<AIAgentProjectDatabaseViewerPayload> => {
    assertCanPerform(context.policy, 'AIAgentProject', 'execute');
    return launchAiAgentProjectDatabaseViewerOperation(projectId, mode, connectionId || null);
};


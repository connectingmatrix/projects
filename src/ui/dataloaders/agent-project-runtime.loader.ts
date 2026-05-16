import {
    aiAgentProjectFileOperation,
    aiAgentProjectFilesOperation,
    chatWithAIAgentProjectDeveloperOperation,
    executeAIAgentProjectDatabaseOperation,
    runAIAgentDataAnalysisOperation,
    runAIAgentProjectBuildOperation,
    writeAIAgentProjectFileOperation
} from '@/orm';
import type { AIAgentDataAnalysisPayload, AIAgentDataAnalysisTask, AIAgentProjectBuildPayload, AIAgentProjectDatabasePayload, AIAgentProjectDeveloperChatPayload, AIAgentProjectFilePayload } from '@/orm';
import type { UiDataContext } from '@/dataloaders/context';
import { assertCanPerform } from '@/dataloaders/permissions.loader';

export const listAIAgentProjectFiles = async (context: UiDataContext, projectId: string): Promise<AIAgentProjectFilePayload[]> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return aiAgentProjectFilesOperation(projectId);
};

export const readAIAgentProjectFile = async (context: UiDataContext, projectId: string, path: string): Promise<AIAgentProjectFilePayload | null> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return aiAgentProjectFileOperation(projectId, path);
};

export const writeAIAgentProjectFile = async (context: UiDataContext, projectId: string, path: string, content: string): Promise<AIAgentProjectFilePayload> => {
    assertCanPerform(context.policy, 'Application', 'update');
    return writeAIAgentProjectFileOperation({ projectId, path, content });
};

export const executeAIAgentProjectDatabase = async (context: UiDataContext, projectId: string, sql: string, mode?: 'QUERY' | 'ALTER', confirmed = false): Promise<AIAgentProjectDatabasePayload> => {
    assertCanPerform(context.policy, 'Application', 'update');
    return executeAIAgentProjectDatabaseOperation({ projectId, sql, mode, confirmed });
};

export const runAIAgentProjectBuild = async (context: UiDataContext, projectId: string, action: 'BUILD' | 'DEPLOY', command?: string | null): Promise<AIAgentProjectBuildPayload> => {
    assertCanPerform(context.policy, 'Application', 'deploy');
    return runAIAgentProjectBuildOperation({ projectId, action, command });
};

export const chatWithAIAgentProjectDeveloper = async (context: UiDataContext, projectId: string, message: string, agentId?: string | null): Promise<AIAgentProjectDeveloperChatPayload> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return chatWithAIAgentProjectDeveloperOperation({ projectId, message, agentId });
};

export const runAIAgentDataAnalysis = async (
    context: UiDataContext,
    agentId: string,
    task: AIAgentDataAnalysisTask,
    targetColumn?: string | null,
    buildAndDeploy?: boolean,
    deploymentTarget?: string | null
): Promise<AIAgentDataAnalysisPayload> => {
    assertCanPerform(context.policy, 'AIAgent', 'update');
    return runAIAgentDataAnalysisOperation({ agentId, task, targetColumn, buildAndDeploy: buildAndDeploy || null, deploymentTarget: deploymentTarget || null });
};

export interface ProjectRuntimeStatusRow {
    processId: string;
    projectId: string;
    kind: 'build' | 'run' | 'deploy' | 'assistant';
    status: 'queued' | 'started' | 'running' | 'log' | 'heartbeat' | 'completed' | 'failed' | 'aborted';
    progress: number;
    source: string;
    updatedAt: string;
    logs: string[];
}

export const loadProjectRuntimeStatus = async (projectId?: string): Promise<ProjectRuntimeStatusRow[]> => {
    const response = await fetch(`${import.meta.env.VITE_GRAPHQL_API_URL}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'query ProjectRuntimeStatus($projectId: ID){ projectRuntimeStatus(projectId: $projectId) }', variables: { projectId } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    return JSON.parse(payload.data.projectRuntimeStatus || '[]') as ProjectRuntimeStatusRow[];
};

export const closeProjectEditingSession = async (sessionId: string): Promise<boolean> => {
    const response = await fetch(`${import.meta.env.VITE_API_ORIGIN}/projects/session/close`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) });
    const payload = await response.json();
    return Boolean(payload);
};

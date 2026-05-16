import { launchAIAgentProjectDatabaseViewerOperation, verifyAIAgentProjectDatabaseConnectionOperation } from '@/orm';
import type { AIAgentProjectDatabaseLaunch } from '@/orm';
import type { UiDataContext } from '@/dataloaders/context';
import { assertCanPerform } from '@/dataloaders/permissions.loader';

export const launchAIAgentProjectDatabaseViewer = async (context: UiDataContext, projectId: string, databasePath?: string | null, mode = 'internal'): Promise<AIAgentProjectDatabaseLaunch> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return launchAIAgentProjectDatabaseViewerOperation({ projectId, databasePath, mode });
};

export const verifyAIAgentProjectDatabaseConnection = async (context: UiDataContext, projectId: string, connectionId?: string | null): Promise<AIAgentProjectDatabaseLaunch> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return verifyAIAgentProjectDatabaseConnectionOperation({ projectId, connectionId, mode: connectionId ? 'external' : 'internal' });
};

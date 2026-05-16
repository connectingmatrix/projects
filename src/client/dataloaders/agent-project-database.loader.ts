import { launchAIAgentProjectDatabaseViewerOperation, verifyAIAgentProjectDatabaseConnectionOperation } from '@giga/dataloader/client/legacy/orm';
import type { AIAgentProjectDatabaseLaunch } from '@giga/dataloader/client/legacy/orm';
import type { UiDataContext } from '@giga/dataloader/client/legacy/dataloaders/context';
import { assertCanPerform } from '@giga/dataloader/client/legacy/dataloaders/permissions.loader';

export const launchAIAgentProjectDatabaseViewer = async (context: UiDataContext, projectId: string, databasePath?: string | null, mode = 'internal'): Promise<AIAgentProjectDatabaseLaunch> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return launchAIAgentProjectDatabaseViewerOperation({ projectId, databasePath, mode });
};

export const verifyAIAgentProjectDatabaseConnection = async (context: UiDataContext, projectId: string, connectionId?: string | null): Promise<AIAgentProjectDatabaseLaunch> => {
    assertCanPerform(context.policy, 'Application', 'read');
    return verifyAIAgentProjectDatabaseConnectionOperation({ projectId, connectionId, mode: connectionId ? 'external' : 'internal' });
};

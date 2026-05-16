import { nowIso } from './contracts.js';
export function createConnectingmatrixProjectsStubLauncher(context = {}) {
    return {
        packageName: '@connectingmatrix/projects',
        title: 'Projects Launcher',
        mode: 'stub',
        status: 'ready',
        checkedAt: nowIso(),
        summary: 'Launches project CRUD, source tree APIs, build/run APIs, and file-module based source archives.',
        healthPath: '/projects/health',
        graphqlNamespace: 'projects',
        routes: [
            { method: 'GET', path: '/projects/health', description: 'Health/status endpoint' },
            { method: 'GET', path: '/projects/launcher', description: 'Stub launcher panel' }
        ],
        owns: {
            ui: ['dataloaders', 'bindWithServer', 'status/launcher UI'],
            backend: ["project builder", "runner", "source archive adapter"],
            entity: ["Project", "ProjectFile", "ProjectBuild"],
            migrations: ['migrations/*.sql']
        },
        actions: [
            { name: 'createProject', label: 'createProject', method: 'LOCAL', description: 'Run createProject demo action' },
            { name: 'writeFile', label: 'writeFile', method: 'LOCAL', description: 'Run writeFile demo action' },
            { name: 'build', label: 'build', method: 'LOCAL', description: 'Run build demo action' },
            { name: 'run', label: 'run', method: 'LOCAL', description: 'Run run demo action' }
        ],
        sampleData: { context: 'stub-playground', userId: context.userId ?? 'stub-user' },
        context: { userId: context.userId, organizationId: context.organizationId, root: Boolean(context.root), traceId: context.traceId },
        notes: [
            'This launcher is intentionally stub-mode playable so the package can be tested outside giga-ai-backend.',
            'The launcher exposes this package boundary only; cross-package behavior is injected through adapters.'
        ]
    };
}
export const createStubLauncher = createConnectingmatrixProjectsStubLauncher;
export const Launcher = { open: createConnectingmatrixProjectsStubLauncher, mode: 'stub' };
export const launcher = createConnectingmatrixProjectsStubLauncher;

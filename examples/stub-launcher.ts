import { nowIso, type PackageLauncherPanel, type RequestContext } from './contracts.js';

export function createConnectingmatrixProjectsStubLauncher(context: RequestContext = {}): PackageLauncherPanel {
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
      { name: 'createProject', label: 'createProject', method: 'LOCAL' as const, description: 'Run createProject demo action' },
      { name: 'writeFile', label: 'writeFile', method: 'LOCAL' as const, description: 'Run writeFile demo action' },
      { name: 'build', label: 'build', method: 'LOCAL' as const, description: 'Run build demo action' },
      { name: 'run', label: 'run', method: 'LOCAL' as const, description: 'Run run demo action' }
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
export const Launcher = { open: createConnectingmatrixProjectsStubLauncher, mode: 'stub' as const };
export const launcher = createConnectingmatrixProjectsStubLauncher;

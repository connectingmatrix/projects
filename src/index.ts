import { GraphQLClient } from './ui/graphql-client.js';
import { InMemoryRepository, type BaseRecord } from './entity/repository.js';
import { LocalEventBus, makeId, nowIso, type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
import { createStubLauncher } from './launcher.js';
import { PackageObservability } from './observability.js';

export type ProjectStatus = 'draft' | 'active' | 'building' | 'running' | 'deployed' | 'errored' | 'aborted';
export interface ProjectRecord extends BaseRecord { name: string; description?: string; status?: ProjectStatus; activeDeploymentId?: string; activeProcessId?: string; lastHeartbeatAt?: string; error?: string; metadata?: Record<string, unknown>; }
export interface ProjectFile extends BaseRecord { projectId: string; path: string; content: string; mimeType?: string; metadata?: Record<string, unknown>; }
export interface ProjectBuild extends BaseRecord { projectId: string; status: 'queued' | 'running' | 'passed' | 'failed' | 'aborted'; output: string; errors: string[]; processId?: string; sessionId?: string; }
export interface ProjectRun extends BaseRecord { projectId: string; status: 'running' | 'success' | 'error' | 'aborted'; output?: string; logs: string[]; processId?: string; }
export interface ProjectDeployment extends BaseRecord { projectId: string; buildId: string; status: 'deployed' | 'failed' | 'aborted'; url?: string; logs: string[]; processId?: string; }
export interface ProjectDatabase extends BaseRecord { projectId: string; name: string; kind?: 'sqlite' | 'postgres' | 'mysql' | 'clickhouse' | 'supabase' | 'neo4j' | string; connectionRef?: string; driveFileId?: string; metadata?: Record<string, unknown>; }
export interface ProjectAssistantSession extends BaseRecord { projectId: string; mode: 'debug-project' | 'build-project' | 'deploy-project' | 'project-chat'; browserContext: Record<string, unknown>; persistChat: false; messages: number; processId: string; sourceMount?: { sessionId: string; files: string[]; mountedAt: string }; }
export interface ProjectDebugEvent extends BaseRecord { projectId: string; sessionId?: string; role: 'user' | 'assistant' | 'system'; content: string; metadata?: Record<string, unknown>; }
export interface ProjectHeartbeat extends BaseRecord { projectId: string; status: 'ok' | 'running' | 'stale' | 'error' | 'failed' | 'aborted'; message?: string; metadata?: Record<string, unknown>; }
export interface ProjectLog extends BaseRecord { projectId: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string; processId?: string; metadata?: Record<string, unknown>; }
export interface SourceArchiveFile { path: string; content: string; }
export interface FileModuleArchiveProvider { createArchive(files: SourceArchiveFile[], options?: { exclude?: string[] }): Promise<Uint8Array>; extractArchive(archive: Uint8Array | string): Promise<SourceArchiveFile[]>; uploadArchive?(projectId: string, archive: Uint8Array, context: RequestContext): Promise<{ url?: string; path?: string; storageId?: string }>; }
export interface FileModuleLike { createSourceArchiveAdapter?: (provider?: string) => FileModuleArchiveProvider; }
export interface ProcessMonitoringLike { register?: (input: { processId?: string; kind?: string; packageName?: string; name?: string; title?: string; targetId?: string; metadata?: Record<string, unknown> }, context?: RequestContext) => unknown; start?: (input: { kind: string; packageName: string; title: string; targetId?: string; context?: RequestContext; metadata?: Record<string, unknown> }) => { id?: string; processId?: string } | unknown; heartbeat?: (processId: string, input?: { status?: string; message?: string; metadata?: Record<string, unknown> }) => unknown; appendLog?: (processId: string, level: 'debug'|'info'|'warn'|'error', message: string, data?: unknown) => unknown; complete?: (processId: string, metadata?: Record<string, unknown>) => unknown; fail?: (processId: string, error: unknown, metadata?: Record<string, unknown>) => unknown; abort?: (processId: string, reason?: string) => unknown; logs?: { list?: (processId: string, limit?: number) => unknown[]; live?: (processId: string, handler?: (logs: unknown[]) => unknown) => unknown[] | (() => void) }; }
export interface SoftwareBuilderAgent { run(input: { project: ProjectRecord; files: ProjectFile[]; session: ProjectAssistantSession; message: string; databases: ProjectDatabase[]; build: () => ProjectBuild; deploy: () => Promise<ProjectDeployment>; queryDatabase: (db: ProjectDatabase, sql: string) => Promise<unknown>; }, context: RequestContext): Promise<ProjectAssistantOutput>; }
export interface ProjectAssistantOutput { output: string; actions: string[]; processId: string; build?: ProjectBuild; deployment?: ProjectDeployment; queryResults?: unknown[]; sourceMount?: ProjectAssistantSession['sourceMount']; }

const projects = new InMemoryRepository<ProjectRecord>('project');
const files = new InMemoryRepository<ProjectFile>('project_file');
const builds = new InMemoryRepository<ProjectBuild>('project_build');
const runs = new InMemoryRepository<ProjectRun>('project_run');
const deployments = new InMemoryRepository<ProjectDeployment>('project_deployment');
const databases = new InMemoryRepository<ProjectDatabase>('project_database');
const sessions = new InMemoryRepository<ProjectAssistantSession>('project_assistant_session');
const events = new InMemoryRepository<ProjectDebugEvent>('project_debug_event');
const heartbeats = new InMemoryRepository<ProjectHeartbeat>('project_heartbeat');
const logs = new InMemoryRepository<ProjectLog>('project_log');
const client = new GraphQLClient();
const bus = new LocalEventBus();
let endpoint = '/graphql';
let processMonitoring: ProcessMonitoringLike | undefined;
let fileModule: FileModuleLike | undefined;
let archiveProvider: FileModuleArchiveProvider | undefined;
let chatRuntime: unknown;
let builderAgent: SoftwareBuilderAgent | undefined;
let debugLogSink: ((event: ProjectDebugEvent, context: RequestContext) => Promise<void> | void) | undefined;
let databaseExecutor: ((database: ProjectDatabase, sql: string, context: RequestContext) => Promise<unknown> | unknown) | undefined;
let deploymentAdapter: ((project: ProjectRecord, build: ProjectBuild, context: RequestContext) => Promise<{ status?: 'deployed' | 'failed'; url?: string; logs?: string[] }> | { status?: 'deployed' | 'failed'; url?: string; logs?: string[] }) | undefined;

export const ARCHIVE_EXCLUDES = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.turbo/', 'coverage/', '.cache/', 'vendor/', '*.log', '*.tmp'];
export function shouldArchive(path: string): boolean { const clean = path.replace(/^\/+/, ''); return !ARCHIVE_EXCLUDES.some((pattern) => pattern.endsWith('/') ? clean.startsWith(pattern) || clean.includes(`/${pattern}`) : pattern.startsWith('*.') ? clean.endsWith(pattern.slice(1)) : clean === pattern); }
export const shouldArchiveSourcePath = shouldArchive;
function requestBody(request: unknown): Record<string, unknown> { return request && typeof request === 'object' && 'body' in request && (request as { body?: unknown }).body && typeof (request as { body?: unknown }).body === 'object' ? (request as { body: Record<string, unknown> }).body : {}; }
function requestContext(request: unknown): RequestContext { return request && typeof request === 'object' && 'context' in request ? ((request as { context?: RequestContext }).context ?? {}) : {}; }
function projectFiles(projectId: string, context: RequestContext): ProjectFile[] { return files.list(context, { limit: 1000 }).items.filter((file) => file.projectId === projectId); }
function projectDatabases(projectId: string, context: RequestContext): ProjectDatabase[] { return databases.list(context, { limit: 1000 }).items.filter((db) => db.projectId === projectId); }
function processIdOf(row: unknown, fallback: string): string { return row && typeof row === 'object' ? ((row as { id?: string; processId?: string }).id ?? (row as { id?: string; processId?: string }).processId ?? fallback) : fallback; }
function registerProcess(input: { kind?: string; title: string; targetId?: string; metadata?: Record<string, unknown> }, context: RequestContext): string { const fallback = input.targetId ?? `project:${makeId('proc')}`; const proc = processMonitoring?.start?.({ kind: input.kind ?? 'Projects', packageName: '@connectingmatrix/projects', title: input.title, targetId: fallback, context, metadata: input.metadata }) ?? processMonitoring?.register?.({ processId: fallback, kind: input.kind ?? 'Projects', packageName: '@connectingmatrix/projects', name: input.title, metadata: input.metadata }, context); return processIdOf(proc, fallback); }
function appendProjectLog(projectId: string, level: ProjectLog['level'], message: string, context: RequestContext = {}, metadata?: Record<string, unknown>, processId?: string): ProjectLog { const row = logs.create({ projectId, level, message, metadata, processId }, context); if (processId) processMonitoring?.appendLog?.(processId, level, message, metadata); void PackageObservability.emit(level, 'project-log', { projectId, processId, metadata }, context); return row; }
async function writeDebug(event: Omit<ProjectDebugEvent, 'id'|'createdAt'|'updatedAt'|'userId'|'organizationId'>, context: RequestContext): Promise<ProjectDebugEvent> { const row = events.create(event, context); await debugLogSink?.(row, context); return row; }
function archiveAdapter(): FileModuleArchiveProvider | undefined { return archiveProvider ?? fileModule?.createSourceArchiveAdapter?.('supabase'); }
function filteredFiles(projectId: string, context: RequestContext): ProjectFile[] { return projectFiles(projectId, context).filter((file) => shouldArchive(file.path)); }
function extractSql(message: string): string | undefined { return message.match(/```sql\s*([\s\S]*?)```/i)?.[1]?.trim() ?? message.match(/\b(select|show|describe|with)\b[\s\S]*$/i)?.[0]?.trim(); }


export type ProjectRuntimeEventType = 'queued' | 'started' | 'running' | 'log' | 'heartbeat' | 'completed' | 'failed' | 'aborted';
export interface ProjectRuntimeStatus {
  processId: string;
  projectId: string;
  kind: 'build' | 'run' | 'deploy' | 'assistant';
  status: ProjectRuntimeEventType;
  progress: number;
  updatedAt: string;
  source: 'project-runtime-queue' | 'local';
  logs: string[];
  metadata?: Record<string, unknown>;
}
export interface ProjectRuntimeQueueAdapter {
  publish?: (event: ProjectRuntimeStatus & { command?: string; payload?: unknown }) => Promise<void> | void;
  subscribe?: (handler: (event: Partial<ProjectRuntimeStatus> & { projectId: string; processId: string; type?: ProjectRuntimeEventType; message?: string }) => void | Promise<void>) => void | Promise<() => void> | (() => void);
  cancel?: (processId: string, reason?: string) => Promise<void> | void;
  status?: (projectId?: string) => ProjectRuntimeStatus[] | Promise<ProjectRuntimeStatus[]>;
  logs?: (processId: string) => unknown[] | Promise<unknown[]>;
}
export interface ProjectPnpmCacheConfig { localDir: string; pvcMountDir: string; storeDir: string; virtualStoreDir: string; packageImportMethod: 'hardlink' | 'copy' | 'clone'; }
export interface SanctionedDependencyProfile { name: string; packages: string[]; description: string; }
export const SANCTIONED_DEPENDENCY_PROFILES: SanctionedDependencyProfile[] = [
  { name: 'ui-kit', description: 'Frontend UI kit and icons.', packages: ['@vitejs/plugin-react','vite','typescript','react','react-dom','lucide-react'] },
  { name: 'frontend', description: 'Sanctioned browser app/runtime modules.', packages: ['@vitejs/plugin-react','vite','typescript','react','react-dom','lucide-react','zustand','@tanstack/react-query'] },
  { name: 'backend', description: 'Server and API runtime modules.', packages: ['typescript','tsx','express','graphql','@apollo/server','zod','dotenv','kafkajs'] },
  { name: 'threejs', description: '3D and spatial rendering modules.', packages: ['three','@react-three/fiber','@react-three/drei'] },
  { name: 'electronjs', description: 'Desktop shell modules.', packages: ['electron','electron-builder','vite'] },
  { name: 'big-data', description: 'Charts, dataframe, and geospatial modules.', packages: ['d3','arquero','apache-arrow','topojson-client','recharts'] },
  { name: 'workflow-nodes', description: 'Workflow dynamic node safe modules.', packages: ['lodash','zod','d3','arquero'] },
];
const projectRuntimeStatuses = new Map<string, ProjectRuntimeStatus>();
const mountedSourceSessions = new Map<string, { projectId: string; files: string[]; mountedAt: string; lastSeenAt: string; closed?: boolean }>();
let projectRuntimeQueue: ProjectRuntimeQueueAdapter | undefined;
let projectRuntimeQueueStop: (() => void) | undefined;
let pnpmCacheConfig: ProjectPnpmCacheConfig = { localDir: '/tmp/giga-project-cache', pvcMountDir: '/var/lib/giga/runtime-cache', storeDir: '/var/lib/giga/runtime-cache/pnpm/store', virtualStoreDir: '/var/lib/giga/runtime-cache/pnpm/virtual', packageImportMethod: 'hardlink' };
function projectRuntimeApply(event: Partial<ProjectRuntimeStatus> & { projectId: string; processId: string; type?: ProjectRuntimeEventType; message?: string }): ProjectRuntimeStatus {
  const status = event.status ?? event.type ?? 'running';
  const previous = projectRuntimeStatuses.get(event.processId);
  const line = event.message ?? (status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'queued' ? 'queued' : 'running');
  const row: ProjectRuntimeStatus = { processId: event.processId, projectId: event.projectId, kind: event.kind ?? previous?.kind ?? 'build', status, progress: event.progress ?? (status === 'queued' ? 0 : status === 'running' || status === 'started' || status === 'heartbeat' || status === 'log' ? 50 : 100), updatedAt: nowIso(), source: event.source ?? 'project-runtime-queue', logs: [...(previous?.logs ?? []), line].slice(-500), metadata: { ...(previous?.metadata ?? {}), ...(event.metadata ?? {}) } };
  projectRuntimeStatuses.set(row.processId, row);
  const project = projects.get(row.projectId, { root: true });
  if (project) {
    const projectStatus: ProjectStatus = status === 'failed' ? 'errored' : status === 'aborted' ? 'aborted' : row.kind === 'deploy' && status === 'completed' ? 'deployed' : row.kind === 'run' ? 'running' : row.kind === 'build' ? 'building' : project.status ?? 'active';
    try { projects.update(row.projectId, { status: projectStatus, activeProcessId: ['completed','failed','aborted'].includes(status) ? undefined : row.processId, error: status === 'failed' ? line : project.error }, { root: true }); } catch {}
  }
  processMonitoring?.heartbeat?.(row.processId, { status: status === 'failed' ? 'error' : status === 'aborted' ? 'stale' : 'ok', message: line, metadata: { projectId: row.projectId, kind: row.kind, source: row.source } });
  processMonitoring?.appendLog?.(row.processId, status === 'failed' ? 'error' : 'info', line, { event: row });
  void bus.emit('project:runtime-status', row);
  return row;
}
function projectRuntimeStatus(projectId?: string): ProjectRuntimeStatus[] { const rows = [...projectRuntimeStatuses.values()]; return projectId ? rows.filter((row) => row.projectId === projectId) : rows; }
function dependencyProfile(name: string): SanctionedDependencyProfile | undefined { return SANCTIONED_DEPENDENCY_PROFILES.find((profile) => profile.name === name); }
function dependencyPlanForFiles(entries: Array<{ path: string; content?: string }>): { profiles: string[]; packages: string[]; rejected: string[]; cache: ProjectPnpmCacheConfig } {
  const text = entries.map((entry) => `${entry.path}\n${entry.content ?? ''}`).join('\n').toLowerCase();
  const profiles = new Set<string>();
  if (/react|vite|lucide-react|\.tsx/.test(text)) profiles.add('frontend');
  if (/three|@react-three/.test(text)) profiles.add('threejs');
  if (/electron/.test(text)) profiles.add('electronjs');
  if (/arquero|apache-arrow|topojson|d3|recharts/.test(text)) profiles.add('big-data');
  if (/express|graphql|apollo|kafkajs|node:/.test(text)) profiles.add('backend');
  const packageJsonDependencies: string[] = [];
  for (const entry of entries) {
    if (!entry.path.endsWith('package.json') || !entry.content) continue;
    try {
      const parsed = JSON.parse(entry.content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; peerDependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> };
      packageJsonDependencies.push(...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {}), ...Object.keys(parsed.peerDependencies ?? {}), ...Object.keys(parsed.optionalDependencies ?? {}));
    } catch {
      packageJsonDependencies.push('__invalid_package_json__');
    }
  }
  for (const dep of packageJsonDependencies) {
    if (['react','react-dom','lucide-react','vite','@vitejs/plugin-react','zustand','@tanstack/react-query'].includes(dep)) profiles.add('frontend');
    if (['three','@react-three/fiber','@react-three/drei'].includes(dep)) profiles.add('threejs');
    if (['electron','electron-builder'].includes(dep)) profiles.add('electronjs');
    if (['d3','arquero','apache-arrow','topojson-client','recharts'].includes(dep)) profiles.add('big-data');
    if (['express','graphql','@apollo/server','zod','dotenv','kafkajs','tsx'].includes(dep)) profiles.add('backend');
    if (['lodash','zod','d3','arquero'].includes(dep)) profiles.add('workflow-nodes');
  }
  if (!profiles.size) profiles.add('ui-kit');
  const packages = [...profiles].flatMap((name) => dependencyProfile(name)?.packages ?? []);
  const imports = [
    ...[...text.matchAll(/(?:from\s+['"]|require\(['"])([^'".][^'"]*)['"]/g)].map((match) => match[1].split('/').slice(0, match[1].startsWith('@') ? 2 : 1).join('/')),
    ...packageJsonDependencies,
  ];
  const allowed = new Set(packages);
  const rejected = [...new Set(imports.filter((name) => name !== '__invalid_package_json__' && !allowed.has(name)))];
  if (packageJsonDependencies.includes('__invalid_package_json__')) rejected.push('__invalid_package_json__');
  return { profiles: [...profiles], packages: [...new Set(packages)], rejected, cache: pnpmCacheConfig };
}
const defaultBuilderAgent: SoftwareBuilderAgent = { async run(input, context) { const actions: string[] = []; const results: unknown[] = []; let build: ProjectBuild | undefined; let deployment: ProjectDeployment | undefined; const lower = input.message.toLowerCase(); if (/build|debug|fix/.test(lower)) { build = input.build(); actions.push('build'); } const sql = extractSql(input.message); if (sql && input.databases[0]) { results.push(await input.queryDatabase(input.databases[0], sql)); actions.push('query-database'); } if (/deploy/.test(lower)) { deployment = await input.deploy(); actions.push('deploy'); } return { output: `Project assistant handled ${actions.join(', ') || 'context'} for ${input.project.name}.`, actions, processId: input.session.processId, build, deployment, queryResults: results, sourceMount: input.session.sourceMount }; } };

export const Projects = {
  bindWithServer(url: string) { endpoint = url.replace(/\/$/, ''); client.bindWithServer(endpoint); return Projects; },
  bindLogger(logger: unknown) { PackageObservability.bindLogger(logger); return Projects; },
  bindSockets(sockets: unknown) { PackageObservability.bindSockets(sockets); return Projects; },
  bindProcessMonitor(monitor: ProcessMonitoringLike) { processMonitoring = monitor; return Projects; },
  bindProcessMonitoring(monitor: ProcessMonitoringLike) { return Projects.bindProcessMonitor(monitor); },
  useFileModule(module: FileModuleLike) { fileModule = module; archiveProvider = module.createSourceArchiveAdapter?.('supabase') ?? module.createSourceArchiveAdapter?.('memory'); return Projects; },
  setArchiveProvider(provider: FileModuleArchiveProvider) { archiveProvider = provider; return Projects; },
  createFileModuleArchiveProvider(provider: FileModuleArchiveProvider) { archiveProvider = provider; return provider; },
  useChat(chat: unknown) { chatRuntime = chat; return Projects; },
  bindChat(chat: unknown) { return Projects.useChat(chat); },
  bindAdvancedAgents(advanced: { runAgent?: (kind: string, input: unknown, context?: RequestContext) => Promise<unknown> | unknown }) {
    builderAgent = {
      async run(input, context) {
        const fallback = await defaultBuilderAgent.run(input, context);
        const advancedResult = await advanced.runAgent?.('software-builder-agent', { prompt: input.message, projectId: input.project.id, files: input.files.map((file) => file.path), databases: input.databases.map((db) => db.name) }, context);
        return { ...fallback, output: [advancedResult ? `Software builder agent: ${typeof advancedResult === 'string' ? advancedResult : JSON.stringify(advancedResult)}` : '', fallback.output].filter(Boolean).join('\n') };
      }
    };
    return Projects;
  },
  setSoftwareBuilderAgent(agent: SoftwareBuilderAgent) { builderAgent = agent; return Projects; },
  bindSoftwareBuilderAgent(agent: SoftwareBuilderAgent) { return Projects.setSoftwareBuilderAgent(agent); },
  setDatabaseExecutor(executor: typeof databaseExecutor) { databaseExecutor = executor; return Projects; },
  setDeploymentAdapter(adapter: typeof deploymentAdapter) { deploymentAdapter = adapter; return Projects; },
  setClickHouseDebugSink(sink: typeof debugLogSink) { debugLogSink = sink; return Projects; },
  setDebugSink(sink: typeof debugLogSink) { debugLogSink = sink; return Projects; },
  create(input: { name: string; description?: string; metadata?: Record<string, unknown> }, context: RequestContext = {}) { return projects.create({ ...input, status: 'active' }, context); },
  getObject(id: string, context: RequestContext = {}) { return projects.get(id, context); },
  getList(pagination: PaginationOptions = {}, context: RequestContext = {}): ListResult<ProjectRecord> { return projects.list(context, pagination); },
  search(term: string, context: RequestContext = {}) { return projects.search(term, context, ['name', 'description']); },
  update(id: string, patch: Partial<ProjectRecord>, context: RequestContext = {}) { return projects.update(id, patch, context); },
  delete(id: string, context: RequestContext = {}) { return projects.delete(id, context); },
  writeFile(projectId: string, path: string, content: string, context: RequestContext = {}) { projects.get(projectId, context); const existing = projectFiles(projectId, context).find((file) => file.path === path); return existing ? files.update(existing.id, { content }, context) : files.create({ projectId, path, content }, context); },
  readFile(projectId: string, path: string, context: RequestContext = {}) { projects.get(projectId, context); return projectFiles(projectId, context).find((file) => file.path === path); },
  listFiles(projectId: string, context: RequestContext = {}) { projects.get(projectId, context); return projectFiles(projectId, context); },
  deleteFile(projectId: string, path: string, context: RequestContext = {}) { const file = Projects.readFile(projectId, path, context); return file ? files.delete(file.id, context) : false; },
  async saveSourceArchive(projectId: string, context: RequestContext = {}) { projects.get(projectId, context); const provider = archiveAdapter(); const entries = filteredFiles(projectId, context).map((file) => ({ path: file.path, content: file.content })); if (!provider) throw new Error('@connectingmatrix/file source archive adapter is required'); const archive = await provider.createArchive(entries, { exclude: ARCHIVE_EXCLUDES }); const upload = await provider?.uploadArchive?.(projectId, archive, context); appendProjectLog(projectId, 'info', 'Project source archive saved', context, { fileCount: entries.length, upload }); return { archive, files: entries.map((entry) => entry.path), upload }; },
  async restoreSourceArchive(projectId: string, archive: Uint8Array | string, context: RequestContext = {}) { projects.get(projectId, context); const provider = archiveAdapter(); if (!provider) throw new Error('@connectingmatrix/file source archive adapter is required'); const entries = await provider.extractArchive(archive); for (const entry of entries) Projects.writeFile(projectId, entry.path, entry.content, context); appendProjectLog(projectId, 'info', 'Project source archive restored', context, { fileCount: entries.length }); return entries; },
  build(projectId: string, context: RequestContext = {}, sessionId?: string) { const project = projects.get(projectId, context); if (!project) throw new Error(`Project not found: ${projectId}`); const processId = registerProcess({ title: `Build ${project.name}`, targetId: `project:build:${makeId('build')}`, metadata: { projectId } }, context); projects.update(projectId, { status: 'building', activeProcessId: processId }, context); const source = filteredFiles(projectId, context); const errors: string[] = []; if (!source.length) errors.push('Project has no source files'); const packageJson = source.find((file) => file.path.endsWith('package.json')); if (packageJson) { try { JSON.parse(packageJson.content); } catch { errors.push('package.json is not valid JSON'); } } const status: ProjectBuild['status'] = errors.length ? 'failed' : 'passed'; const build = builds.create({ projectId, status, errors, output: status === 'passed' ? 'Build validation passed' : errors.join('\n'), sessionId, processId }, context); projects.update(projectId, { status: status === 'passed' ? 'active' : 'errored', error: errors[0], activeProcessId: undefined }, context); appendProjectLog(projectId, status === 'passed' ? 'info' : 'error', `Build ${status}`, context, { buildId: build.id, errors }, processId); if (status === 'passed') processMonitoring?.complete?.(processId, { projectId, buildId: build.id }); else processMonitoring?.fail?.(processId, errors.join('; '), { projectId, buildId: build.id }); return build; },
  run(projectId: string, context: RequestContext = {}) { const project = projects.get(projectId, context); if (!project) throw new Error(`Project not found: ${projectId}`); const build = Projects.build(projectId, context); if (build.status !== 'passed') throw new Error(`Cannot run failed build: ${build.errors.join(', ')}`); const processId = registerProcess({ title: `Run ${project.name}`, targetId: `project:run:${makeId('run')}`, metadata: { projectId } }, context); const run = runs.create({ projectId, status: 'running', output: 'Run launched from project package', logs: ['Run started'], processId }, context); projects.update(projectId, { status: 'running', activeProcessId: processId }, context); appendProjectLog(projectId, 'info', 'Project run started', context, { runId: run.id }, processId); processMonitoring?.heartbeat?.(processId, { status: 'ok', message: 'Project run launched', metadata: { projectId, runId: run.id } }); return run; },
  async deploy(projectId: string, input: { buildId?: string; target?: string } = {}, context: RequestContext = {}) { const project = projects.get(projectId, context); if (!project) throw new Error(`Project not found: ${projectId}`); const build = input.buildId ? builds.get(input.buildId, context) : Projects.build(projectId, context); if (!build || build.status !== 'passed') throw new Error('Deployment requires a passed build'); const processId = registerProcess({ title: `Deploy ${project.name}`, targetId: `project:deploy:${makeId('deploy')}`, metadata: { projectId, buildId: build.id, target: input.target } }, context); const external = deploymentAdapter ? await deploymentAdapter(project, build, context) : { status: 'deployed' as const, url: `https://apps.local/${project.id}`, logs: ['Deployment adapter not configured; local package deployment simulated.'] }; const deployment = deployments.create({ projectId, buildId: build.id, status: external.status ?? 'deployed', url: external.url, logs: external.logs ?? [], processId }, context); projects.update(projectId, { activeDeploymentId: deployment.id, status: deployment.status === 'deployed' ? 'deployed' : 'errored', activeProcessId: undefined, error: deployment.status === 'failed' ? 'Deployment failed' : undefined }, context); for (const line of deployment.logs) appendProjectLog(projectId, deployment.status === 'deployed' ? 'info' : 'error', line, context, { deploymentId: deployment.id }, processId); if (deployment.status === 'deployed') processMonitoring?.complete?.(processId, { projectId, deploymentId: deployment.id }); else processMonitoring?.fail?.(processId, 'Deployment failed', { projectId, deploymentId: deployment.id }); return deployment; },
  deployments: { list(projectId?: string, context: RequestContext = {}) { const rows = deployments.list(context, { limit: 1000 }).items; return projectId ? rows.filter((row) => row.projectId === projectId) : rows; }, logs(projectId: string, context: RequestContext = {}) { return Projects.checkDeploymentLogs(projectId, context); } },
  checkDeploymentLogs(projectId: string, context: RequestContext = {}) { return deployments.list(context, { limit: 1000 }).items.filter((deployment) => deployment.projectId === projectId).flatMap((deployment) => deployment.logs.map((line) => ({ deploymentId: deployment.id, line }))); },
  connectDatabase(projectId: string, input: { name: string; kind?: ProjectDatabase['kind']; connectionRef?: string; driveFileId?: string; metadata?: Record<string, unknown> }, context: RequestContext = {}) { projects.get(projectId, context); return databases.create({ ...input, projectId }, context); },
  listDatabases(projectId: string, context: RequestContext = {}) { projects.get(projectId, context); return projectDatabases(projectId, context); },
  async executeDatabaseQuery(projectId: string, connectionId: string, sql: string, context: RequestContext = {}) { const db = projectDatabases(projectId, context).find((item) => item.id === connectionId || item.connectionRef === connectionId); if (!db) throw new Error(`Connected database not found for this project: ${connectionId}`); appendProjectLog(projectId, 'info', 'Database query executed by project AI', context, { databaseId: db.id, kind: db.kind, sql }); if (databaseExecutor) { const result = await databaseExecutor(db, sql, context); if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) return result as { databaseId?: string; sql?: string; rows: unknown[] }; return { databaseId: db.id, kind: db.kind, sql, rows: [], result }; } return { databaseId: db.id, kind: db.kind, sql, rows: [], readonly: /^\s*(select|show|describe|with)\b/i.test(sql), simulated: true }; },
  startAssistantSession(projectId: string, input: { mode?: ProjectAssistantSession['mode']; browserContext?: Record<string, unknown>; clearContext?: boolean } = {}, context: RequestContext = {}) { const project = projects.get(projectId, context); if (!project) throw new Error(`Project not found: ${projectId}`); const processId = registerProcess({ title: `Project AI ${project.name}`, targetId: `project:assistant:${makeId('assistant')}`, metadata: { projectId, mode: input.mode ?? 'debug-project' } }, context); const session = sessions.create({ projectId, mode: input.mode ?? 'debug-project', browserContext: input.clearContext ? {} : (input.browserContext ?? {}), persistChat: false, messages: 0, processId }, context); return sessions.update(session.id, { sourceMount: Projects.mountSourceSession(projectId, context, { sessionId: session.id }).sourceMount }, context); },
  mountSourceSession(projectId: string, context: RequestContext = {}, input: { sessionId?: string } = {}) { projects.get(projectId, context); const mountedAt = nowIso(); const mount = { sessionId: input.sessionId ?? makeId('mount'), files: filteredFiles(projectId, context).map((file) => file.path), mountedAt }; const session = input.sessionId ? sessions.get(input.sessionId, context) : undefined; if (session) sessions.update(session.id, { sourceMount: mount }, context); appendProjectLog(projectId, 'info', 'Temporary source session mounted', context, { files: mount.files, sessionId: mount.sessionId }); return { sourceMount: mount, files: mount.files }; },
  async assistantMessage(sessionId: string, message: string, context: RequestContext = {}): Promise<ProjectAssistantOutput> { const session = sessions.get(sessionId, context); if (!session) throw new Error(`Project assistant session not found: ${sessionId}`); const project = projects.get(session.projectId, context); if (!project) throw new Error(`Project not found: ${session.projectId}`); processMonitoring?.heartbeat?.(session.processId, { status: 'ok', message: 'Project AI assistant running', metadata: { projectId: project.id, sessionId } }); await writeDebug({ projectId: project.id, sessionId, role: 'user', content: message }, context); const agent = builderAgent ?? defaultBuilderAgent; const output = await agent.run({ project, files: projectFiles(project.id, context), session, message, databases: projectDatabases(project.id, context), build: () => Projects.build(project.id, context, session.id), deploy: () => Projects.deploy(project.id, {}, context), queryDatabase: (db, sql) => Projects.executeDatabaseQuery(project.id, db.id, sql, context) }, context); sessions.update(session.id, { messages: session.messages + 2 }, context); await writeDebug({ projectId: project.id, sessionId, role: 'assistant', content: output.output, metadata: { actions: output.actions, processId: session.processId } }, context); appendProjectLog(project.id, 'info', output.output, context, { actions: output.actions }, session.processId); processMonitoring?.heartbeat?.(session.processId, { status: 'ok', message: 'Project AI assistant finished turn', metadata: { actions: output.actions } }); return output; },
  async debugWithAI(projectId: string, input: { message: string; databaseId?: string; query?: string; sessionId?: string; mode?: ProjectAssistantSession['mode']; browserContext?: Record<string, unknown>; clearContext?: boolean } = { message: 'debug project' }, context: RequestContext = {}) { const session = input.sessionId ? sessions.get(input.sessionId, context) : Projects.startAssistantSession(projectId, { mode: input.mode, browserContext: input.browserContext, clearContext: input.clearContext }, context); if (!session) throw new Error('Project assistant session not found'); const message = input.query ? `${input.message}\n\n\`\`\`sql\n${input.query}\n\`\`\`` : input.message; const result = await Projects.assistantMessage(session.id, message, context); if (input.databaseId && input.query) { const queryResult = await Projects.executeDatabaseQuery(projectId, input.databaseId, input.query, context); return { ...result, queryResults: [...(result.queryResults ?? []), queryResult] }; } return result; },
  clearAssistantContext(sessionId: string, context: RequestContext = {}) { const session = sessions.get(sessionId, context); if (!session) return false; sessions.update(sessionId, { browserContext: {}, messages: 0, sourceMount: undefined }, context); appendProjectLog(session.projectId, 'info', 'Project AI browser context cleared', context, { sessionId }, session.processId); return true; },
  debugEvents(sessionId?: string, context: RequestContext = {}) { const all = events.list(context, { limit: 1000 }).items; return sessionId ? all.filter((event) => event.sessionId === sessionId) : all; },
  heartbeat(projectId: string, input: { status?: ProjectHeartbeat['status']; message?: string; error?: string; metadata?: Record<string, unknown>; metrics?: Record<string, unknown>; processId?: string } = {}, context: RequestContext = {}) { const project = projects.get(projectId, context); if (!project) throw new Error(`Project not found: ${projectId}`); const status = input.status ?? 'ok'; const message = input.message ?? input.error; const metadata = { ...(input.metadata ?? {}), ...(input.metrics ? { metrics: input.metrics } : {}) }; const row = heartbeats.create({ projectId, status, message, metadata }, context); const nextStatus: ProjectStatus = status === 'error' || status === 'failed' ? 'errored' : status === 'aborted' ? 'aborted' : status === 'running' ? 'running' : project.status ?? 'active'; projects.update(projectId, { lastHeartbeatAt: row.createdAt, status: nextStatus, error: status === 'error' || status === 'failed' ? message : project.error }, context); appendProjectLog(projectId, status === 'error' || status === 'failed' ? 'error' : 'info', message ?? `Heartbeat ${status}`, context, metadata, input.processId); if (input.processId) processMonitoring?.heartbeat?.(input.processId, { status, message, metadata }); return row; },
  logs(projectId: string, context: RequestContext = {}) { return logs.list(context, { limit: 1000 }).items.filter((row) => row.projectId === projectId); },
  getProjectLogs(projectId: string, context: RequestContext = {}) { return Projects.logs(projectId, context); },
  processLogs(projectId: string, context: RequestContext = {}) { const project = projects.get(projectId, context); const ids = new Set<string>(); if (project?.activeProcessId) ids.add(project.activeProcessId); for (const row of [...builds.list(context, { limit: 1000 }).items, ...runs.list(context, { limit: 1000 }).items, ...deployments.list(context, { limit: 1000 }).items, ...sessions.list(context, { limit: 1000 }).items]) { if ('projectId' in row && row.projectId === projectId && 'processId' in row && row.processId) ids.add(String(row.processId)); } return [...ids].flatMap((id) => processMonitoring?.logs?.list?.(id, 100) ?? []); },
  markErrored(projectId: string, message: string, context: RequestContext = {}) { const project = projects.update(projectId, { status: 'errored', error: message }, context); const heartbeat = Projects.heartbeat(projectId, { status: 'error', message }, context); return { project, heartbeat }; },
  abort(idOrProcessId: string, reason = 'aborted by user', context: RequestContext = {}) { const project = projects.get(idOrProcessId, context); const projectId = project?.id ?? [...builds.list({ root: true }).items, ...runs.list({ root: true }).items, ...deployments.list({ root: true }).items, ...sessions.list({ root: true }).items].find((row) => 'processId' in row && row.processId === idOrProcessId)?.projectId; if (!projectId) throw new Error(`Project/process not found: ${idOrProcessId}`); const processIds = [idOrProcessId, ...builds.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...runs.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...deployments.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...sessions.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId)].filter(Boolean); for (const processId of Array.from(new Set(processIds))) processMonitoring?.abort?.(processId, reason); for (const run of runs.list({ root: true }).items.filter((row) => row.projectId === projectId && row.status === 'running')) runs.update(run.id, { status: 'aborted', logs: [...rowLogs(run), reason] }, { root: true }); const updated = projects.update(projectId, { status: 'aborted', error: reason, activeProcessId: undefined }, context); appendProjectLog(projectId, 'warn', reason, context, { aborted: true, processIds }, processIds[0]); return { project: updated, processIds, reason }; },
  appendLog: appendProjectLog,
  launcher: createStubLauncher,
  health(): PackageHealth { return { name: '@connectingmatrix/projects', status: 'ok', checkedAt: nowIso(), details: { endpoint, projects: projects.list({ root: true }).total, files: files.list({ root: true }).total, archiveOwner: '@connectingmatrix/file', archiveProvider: Boolean(archiveAdapter()), chatBound: Boolean(chatRuntime), softwareBuilderAgent: Boolean(builderAgent), debugSink: debugLogSink ? 'clickhouse' : 'memory', databaseExecutor: Boolean(databaseExecutor), processMonitoring: Boolean(processMonitoring), runtimeQueue: Boolean(projectRuntimeQueue), runtimeStatuses: projectRuntimeStatuses.size, pnpmCache: pnpmCacheConfig, sanctionedDependencyProfiles: SANCTIONED_DEPENDENCY_PROFILES.map((profile)=>profile.name), mountedSourceSessions: mountedSourceSessions.size, deployments: deployments.list({ root: true }).total, assistantSessions: sessions.list({ root: true }).total, heartbeats: heartbeats.list({ root: true }).total, logs: logs.list({ root: true }).total, observability: PackageObservability.healthDetails() } }; },
};

const originalProjectBuild = Projects.build.bind(Projects);
const originalProjectRun = Projects.run.bind(Projects);
const originalProjectDeploy = Projects.deploy.bind(Projects);
(Projects as unknown as { build: typeof Projects.build }).build = function buildWithRuntimeQueue(projectId: string, context: RequestContext = {}, sessionId?: string): ProjectBuild {
  if (!projectRuntimeQueue?.publish) return originalProjectBuild(projectId, context, sessionId);
  const project = projects.get(projectId, context);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const processId = registerProcess({ title: `Build ${project.name}`, targetId: `project:build:${makeId('build')}`, metadata: { projectId, runtimeQueue: true } }, context);
  const build = builds.create({ projectId, status: 'queued', output: 'Build queued through project runtime queue', errors: [], sessionId, processId }, context);
  projects.update(projectId, { status: 'building', activeProcessId: processId }, context);
  const status = projectRuntimeApply({ projectId, processId, kind: 'build', status: 'queued', progress: 0, message: 'Project build queued', metadata: { buildId: build.id } });
  void projectRuntimeQueue.publish({ ...status, command: 'build', payload: { projectId, buildId: build.id, files: filteredFiles(projectId, context).map((file) => file.path), dependencyPlan: dependencyPlanForFiles(filteredFiles(projectId, context)) } });
  return build;
};
(Projects as unknown as { run: typeof Projects.run }).run = function runWithRuntimeQueue(projectId: string, context: RequestContext = {}): ProjectRun {
  if (!projectRuntimeQueue?.publish) return originalProjectRun(projectId, context);
  const project = projects.get(projectId, context);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const processId = registerProcess({ title: `Run ${project.name}`, targetId: `project:run:${makeId('run')}`, metadata: { projectId, runtimeQueue: true } }, context);
  const run = runs.create({ projectId, status: 'running', output: 'Run queued through project runtime queue', logs: ['Run queued'], processId }, context);
  projects.update(projectId, { status: 'running', activeProcessId: processId }, context);
  const status = projectRuntimeApply({ projectId, processId, kind: 'run', status: 'queued', progress: 0, message: 'Project run queued', metadata: { runId: run.id } });
  void projectRuntimeQueue.publish({ ...status, command: 'run', payload: { projectId, runId: run.id } });
  return run;
};
(Projects as unknown as { deploy: typeof Projects.deploy }).deploy = async function deployWithRuntimeQueue(projectId: string, input: { buildId?: string; target?: string } = {}, context: RequestContext = {}): Promise<ProjectDeployment> {
  if (!projectRuntimeQueue?.publish) return originalProjectDeploy(projectId, input, context);
  const project = projects.get(projectId, context);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const build = input.buildId ? builds.get(input.buildId, context) : originalProjectBuild(projectId, context);
  if (!build || (build.status !== 'passed' && build.status !== 'queued' && build.status !== 'running')) throw new Error('Deployment requires a passed or queued build');
  const processId = registerProcess({ title: `Deploy ${project.name}`, targetId: `project:deploy:${makeId('deploy')}`, metadata: { projectId, buildId: build.id, target: input.target, runtimeQueue: true } }, context);
  const deployment = deployments.create({ projectId, buildId: build.id, status: 'deployed', url: undefined, logs: ['Deployment queued through project runtime queue'], processId }, context);
  projects.update(projectId, { status: 'running', activeProcessId: processId }, context);
  const status = projectRuntimeApply({ projectId, processId, kind: 'deploy', status: 'queued', progress: 0, message: 'Project deployment queued', metadata: { deploymentId: deployment.id, target: input.target } });
  void projectRuntimeQueue.publish({ ...status, command: 'deploy', payload: { projectId, buildId: build.id, deploymentId: deployment.id, target: input.target } });
  return deployment;
};
Object.assign(Projects, {
  bindRuntimeQueue(queue: ProjectRuntimeQueueAdapter) { projectRuntimeQueue = queue; const subscription = queue.subscribe?.((event) => { projectRuntimeApply(event); }); if (subscription && typeof (subscription as { then?: unknown }).then === 'function') void (subscription as Promise<() => void>).then((stop) => { projectRuntimeQueueStop = stop; }); else if (typeof subscription === 'function') projectRuntimeQueueStop = subscription; return Projects; },
  stopRuntimeQueue() { projectRuntimeQueueStop?.(); projectRuntimeQueueStop = undefined; return Projects; },
  applyRuntimeStatus(event: Partial<ProjectRuntimeStatus> & { projectId: string; processId: string; type?: ProjectRuntimeEventType; message?: string }) { return projectRuntimeApply(event); },
  runtimeQueueStatus(projectId?: string) { return projectRuntimeStatus(projectId); },
  queueStatus(projectId?: string) { return projectRuntimeStatus(projectId); },
  onRuntimeStatus(handler: (row: ProjectRuntimeStatus) => void | Promise<void>) { return bus.on('project:runtime-status', handler); },
  async abortRuntime(processId: string, reason = 'aborted by user') { await projectRuntimeQueue?.cancel?.(processId, reason); projectRuntimeApply({ projectId: projectRuntimeStatuses.get(processId)?.projectId ?? processId, processId, kind: projectRuntimeStatuses.get(processId)?.kind ?? 'build', status: 'aborted', message: reason }); return Projects.abort(processId, reason, { root: true }); },
  configurePnpmCache(input: Partial<ProjectPnpmCacheConfig>) { pnpmCacheConfig = { ...pnpmCacheConfig, ...input }; return pnpmCacheConfig; },
  pnpmCacheConfig() { return pnpmCacheConfig; },
  sanctionedDependencyProfiles() { return SANCTIONED_DEPENDENCY_PROFILES; },
  dependencyPlan(projectId: string, context: RequestContext = {}) { projects.get(projectId, context); return dependencyPlanForFiles(filteredFiles(projectId, context)); },
  linkSanctionedModules(projectId: string, profiles?: string[], context: RequestContext = {}) { projects.get(projectId, context); const plan = profiles?.length ? { profiles, packages: [...new Set(profiles.flatMap((name) => dependencyProfile(name)?.packages ?? []))], rejected: [], cache: pnpmCacheConfig } : dependencyPlanForFiles(filteredFiles(projectId, context)); appendProjectLog(projectId, plan.rejected.length ? 'warn' : 'info', plan.rejected.length ? 'Dependency plan contains non-sanctioned modules' : 'Sanctioned dependencies linked through pnpm cache', context, plan); return { ...plan, command: `PNPM_STORE_DIR=${pnpmCacheConfig.storeDir} pnpm install --offline --package-import-method=${pnpmCacheConfig.packageImportMethod}` }; },
  closeAssistantSession(sessionId: string, context: RequestContext = {}) { const session = sessions.get(sessionId, context); if (!session) return false; mountedSourceSessions.set(sessionId, { projectId: session.projectId, files: session.sourceMount?.files ?? [], mountedAt: session.sourceMount?.mountedAt ?? nowIso(), lastSeenAt: nowIso(), closed: true }); sessions.delete(sessionId, context); processMonitoring?.abort?.(session.processId, 'Project editing session closed'); appendProjectLog(session.projectId, 'info', 'Project editing session closed and temporary mount scheduled for cleanup', context, { sessionId }, session.processId); return true; },
  garbageCollectSessions(input: { olderThanMs?: number; includeOpen?: boolean } = {}, context: RequestContext = {}) { const olderThanMs = input.olderThanMs ?? 30 * 60 * 1000; const now = Date.now(); let cleaned = 0; for (const session of sessions.list(context, { limit: 1000 }).items) { const age = now - Date.parse(session.updatedAt); if (input.includeOpen || age > olderThanMs) { sessions.delete(session.id, context); mountedSourceSessions.set(session.id, { projectId: session.projectId, files: session.sourceMount?.files ?? [], mountedAt: session.sourceMount?.mountedAt ?? session.createdAt, lastSeenAt: nowIso(), closed: true }); processMonitoring?.abort?.(session.processId, 'Project session garbage collected'); cleaned += 1; } } for (const [id, mount] of [...mountedSourceSessions.entries()]) { if (mount.closed && now - Date.parse(mount.lastSeenAt) > olderThanMs) mountedSourceSessions.delete(id); } return { cleaned, activeSessions: sessions.list(context, { limit: 1 }).total, retainedMounts: mountedSourceSessions.size }; },
  mountedSourceSessions() { return [...mountedSourceSessions.entries()].map(([sessionId, mount]) => ({ sessionId, ...mount })); },
});
function rowLogs(row: { logs?: string[] }): string[] { return Array.isArray(row.logs) ? row.logs : []; }

export const ProjectAssistant = Projects;
export function createFileModuleArchiveProvider(provider: FileModuleArchiveProvider): FileModuleArchiveProvider { archiveProvider = provider; return provider; }

export const graphql = { namespace: 'projects', typeDefs: `type Project { id: ID!, name: String!, description: String, status: String } type ProjectFile { id: ID!, projectId: ID!, path: String!, content: String! } type ProjectBuild { id: ID!, projectId: ID!, status: String!, output: String! } type ProjectAssistantSession { id: ID!, projectId: ID!, mode: String!, persistChat: Boolean! } type Query { projectsList: [Project!]!, projectFiles(projectId: ID!): [ProjectFile!]!, projectDatabases(projectId: ID!): String!, projectLogs(projectId: ID!): String!, projectRuntimeStatus(projectId: ID): String!, projectDependencyPlan(projectId: ID!): String!, projectsLauncher: String! } type Mutation { projectCreate(name: String!, description: String): Project!, projectWriteFile(projectId: ID!, path: String!, content: String!): ProjectFile!, projectBuild(projectId: ID!): ProjectBuild!, projectHeartbeat(projectId: ID!, status: String, message: String): String!, projectAbort(projectId: ID!, reason: String): String!, projectStartAssistantSession(projectId: ID!, mode: String): ProjectAssistantSession!, projectAssistantMessage(sessionId: ID!, message: String!): String! }`, resolvers: { Query: { projectsList: (_: unknown, __: unknown, ctx: RequestContext) => Projects.getList({}, ctx).items, projectFiles: (_: unknown, args: { projectId: string }, ctx: RequestContext) => Projects.listFiles(args.projectId, ctx), projectDatabases: (_: unknown, args: { projectId: string }, ctx: RequestContext) => JSON.stringify(Projects.listDatabases(args.projectId, ctx)), projectLogs: (_: unknown, args: { projectId: string }, ctx: RequestContext) => JSON.stringify(Projects.logs(args.projectId, ctx)), projectRuntimeStatus: (_: unknown, args: { projectId?: string }) => JSON.stringify((Projects as unknown as { runtimeQueueStatus: (projectId?: string)=>unknown }).runtimeQueueStatus(args.projectId)), projectDependencyPlan: (_: unknown, args: { projectId: string }, ctx: RequestContext) => JSON.stringify((Projects as unknown as { dependencyPlan: (projectId: string, context?: RequestContext)=>unknown }).dependencyPlan(args.projectId, ctx)), projectsLauncher: (_: unknown, __: unknown, ctx: RequestContext) => JSON.stringify(createStubLauncher(ctx)) }, Mutation: { projectCreate: (_: unknown, args: { name: string; description?: string }, ctx: RequestContext) => Projects.create(args, ctx), projectWriteFile: (_: unknown, args: { projectId: string; path: string; content: string }, ctx: RequestContext) => Projects.writeFile(args.projectId, args.path, args.content, ctx), projectBuild: (_: unknown, args: { projectId: string }, ctx: RequestContext) => Projects.build(args.projectId, ctx), projectHeartbeat: (_: unknown, args: { projectId: string; status?: ProjectHeartbeat['status']; message?: string }, ctx: RequestContext) => JSON.stringify(Projects.heartbeat(args.projectId, args, ctx)), projectAbort: (_: unknown, args: { projectId: string; reason?: string }, ctx: RequestContext) => JSON.stringify(Projects.abort(args.projectId, args.reason, ctx)), projectStartAssistantSession: (_: unknown, args: { projectId: string; mode?: ProjectAssistantSession['mode'] }, ctx: RequestContext) => Projects.startAssistantSession(args.projectId, { mode: args.mode }, ctx), projectAssistantMessage: async (_: unknown, args: { sessionId: string; message: string }, ctx: RequestContext) => JSON.stringify(await Projects.assistantMessage(args.sessionId, args.message, ctx)) } }, migrations: ['migrations/0001_init.sql','migrations/20260515_ai_agent_project_source_archives.sql'] };

export function createPackage(): PackageModule { return { name: '@connectingmatrix/projects', version: '0.4.0', health: () => Projects.health(), graphql, migrations: graphql.migrations, launcher: createStubLauncher, routes: [ { method: 'GET', path: '/projects/health', handler: () => Projects.health() }, { method: 'GET', path: '/projects/launcher', handler: (request) => createStubLauncher(requestContext(request)) }, { method: 'POST', path: '/projects/debug', handler: (request) => Projects.debugWithAI(String(requestBody(request).projectId ?? ''), { message: String(requestBody(request).message ?? 'debug project'), sessionId: typeof requestBody(request).sessionId === 'string' ? String(requestBody(request).sessionId) : undefined }, requestContext(request)) }, { method: 'GET', path: '/projects/runtime-status', handler: (request) => (Projects as unknown as { runtimeQueueStatus: (projectId?: string)=>unknown }).runtimeQueueStatus(String(requestBody(request).projectId ?? '')) }, { method: 'GET', path: '/projects/dependency-plan', handler: (request) => (Projects as unknown as { dependencyPlan: (projectId: string, context?: RequestContext)=>unknown }).dependencyPlan(String(requestBody(request).projectId ?? ''), requestContext(request)) }, { method: 'POST', path: '/projects/session/close', handler: (request) => (Projects as unknown as { closeAssistantSession: (sessionId: string, context?: RequestContext)=>unknown }).closeAssistantSession(String(requestBody(request).sessionId ?? ''), requestContext(request)) }, { method: 'POST', path: '/projects/gc', handler: (request) => (Projects as unknown as { garbageCollectSessions: (input?: { olderThanMs?: number; includeOpen?: boolean }, context?: RequestContext)=>unknown }).garbageCollectSessions(requestBody(request) as { olderThanMs?: number; includeOpen?: boolean }, requestContext(request)) }, { method: 'POST', path: '/projects/heartbeat', handler: (request) => Projects.heartbeat(String(requestBody(request).projectId ?? ''), requestBody(request) as { status?: ProjectHeartbeat['status']; message?: string; error?: string; processId?: string }, requestContext(request)) }, { method: 'POST', path: '/projects/abort', handler: (request) => Projects.abort(String(requestBody(request).projectId ?? requestBody(request).processId ?? ''), String(requestBody(request).reason ?? 'aborted by user'), requestContext(request)) }, { method: 'GET', path: '/projects/logs', handler: (request) => Projects.logs(String(requestBody(request).projectId ?? ''), requestContext(request)) } ], runtime: { Projects, ProjectAssistant: Projects, observability: PackageObservability } }; }

export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './launcher.js';

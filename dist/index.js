import { GraphQLClient } from './ui/graphql-client.js';
import { InMemoryRepository } from './entity/repository.js';
import { LocalEventBus, makeId, nowIso } from './contracts.js';
import { createStubLauncher } from './launcher.js';
import { PackageObservability } from './observability.js';
const projects = new InMemoryRepository('project');
const files = new InMemoryRepository('project_file');
const builds = new InMemoryRepository('project_build');
const runs = new InMemoryRepository('project_run');
const deployments = new InMemoryRepository('project_deployment');
const databases = new InMemoryRepository('project_database');
const sessions = new InMemoryRepository('project_assistant_session');
const events = new InMemoryRepository('project_debug_event');
const heartbeats = new InMemoryRepository('project_heartbeat');
const logs = new InMemoryRepository('project_log');
const client = new GraphQLClient();
const bus = new LocalEventBus();
let endpoint = '/graphql';
let processMonitoring;
let fileModule;
let archiveProvider;
let chatRuntime;
let builderAgent;
let debugLogSink;
let databaseExecutor;
let deploymentAdapter;
export const ARCHIVE_EXCLUDES = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.turbo/', 'coverage/', '.cache/', 'vendor/', '*.log', '*.tmp'];
export function shouldArchive(path) { const clean = path.replace(/^\/+/, ''); return !ARCHIVE_EXCLUDES.some((pattern) => pattern.endsWith('/') ? clean.startsWith(pattern) || clean.includes(`/${pattern}`) : pattern.startsWith('*.') ? clean.endsWith(pattern.slice(1)) : clean === pattern); }
export const shouldArchiveSourcePath = shouldArchive;
function requestBody(request) { return request && typeof request === 'object' && 'body' in request && request.body && typeof request.body === 'object' ? request.body : {}; }
function requestContext(request) { return request && typeof request === 'object' && 'context' in request ? (request.context ?? {}) : {}; }
function projectFiles(projectId, context) { return files.list(context, { limit: 1000 }).items.filter((file) => file.projectId === projectId); }
function projectDatabases(projectId, context) { return databases.list(context, { limit: 1000 }).items.filter((db) => db.projectId === projectId); }
function processIdOf(row, fallback) { return row && typeof row === 'object' ? (row.id ?? row.processId ?? fallback) : fallback; }
function registerProcess(input, context) { const fallback = input.targetId ?? `project:${makeId('proc')}`; const proc = processMonitoring?.start?.({ kind: input.kind ?? 'Projects', packageName: '@connectingmatrix/projects', title: input.title, targetId: fallback, context, metadata: input.metadata }) ?? processMonitoring?.register?.({ processId: fallback, kind: input.kind ?? 'Projects', packageName: '@connectingmatrix/projects', name: input.title, metadata: input.metadata }, context); return processIdOf(proc, fallback); }
function appendProjectLog(projectId, level, message, context = {}, metadata, processId) { const row = logs.create({ projectId, level, message, metadata, processId }, context); if (processId)
    processMonitoring?.appendLog?.(processId, level, message, metadata); void PackageObservability.emit(level, 'project-log', { projectId, processId, metadata }, context); return row; }
async function writeDebug(event, context) { const row = events.create(event, context); await debugLogSink?.(row, context); return row; }
function archiveAdapter() { return archiveProvider ?? fileModule?.createSourceArchiveAdapter?.('supabase'); }
function filteredFiles(projectId, context) { return projectFiles(projectId, context).filter((file) => shouldArchive(file.path)); }
function extractSql(message) { return message.match(/```sql\s*([\s\S]*?)```/i)?.[1]?.trim() ?? message.match(/\b(select|show|describe|with)\b[\s\S]*$/i)?.[0]?.trim(); }
export const SANCTIONED_DEPENDENCY_PROFILES = [
    { name: 'ui-kit', description: 'Frontend UI kit and icons.', packages: ['@vitejs/plugin-react', 'vite', 'typescript', 'react', 'react-dom', 'lucide-react'] },
    { name: 'frontend', description: 'Sanctioned browser app/runtime modules.', packages: ['@vitejs/plugin-react', 'vite', 'typescript', 'react', 'react-dom', 'lucide-react', 'zustand', '@tanstack/react-query'] },
    { name: 'backend', description: 'Server and API runtime modules.', packages: ['typescript', 'tsx', 'express', 'graphql', '@apollo/server', 'zod', 'dotenv', 'kafkajs'] },
    { name: 'threejs', description: '3D and spatial rendering modules.', packages: ['three', '@react-three/fiber', '@react-three/drei'] },
    { name: 'electronjs', description: 'Desktop shell modules.', packages: ['electron', 'electron-builder', 'vite'] },
    { name: 'big-data', description: 'Charts, dataframe, and geospatial modules.', packages: ['d3', 'arquero', 'apache-arrow', 'topojson-client', 'recharts'] },
    { name: 'workflow-nodes', description: 'Workflow dynamic node safe modules.', packages: ['lodash', 'zod', 'd3', 'arquero'] },
];
const projectRuntimeStatuses = new Map();
const mountedSourceSessions = new Map();
let projectRuntimeQueue;
let projectRuntimeQueueStop;
let pnpmCacheConfig = { localDir: '/tmp/giga-project-cache', pvcMountDir: '/var/lib/giga/runtime-cache', storeDir: '/var/lib/giga/runtime-cache/pnpm/store', virtualStoreDir: '/var/lib/giga/runtime-cache/pnpm/virtual', packageImportMethod: 'hardlink' };
function projectRuntimeApply(event) {
    const status = event.status ?? event.type ?? 'running';
    const previous = projectRuntimeStatuses.get(event.processId);
    const line = event.message ?? (status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'queued' ? 'queued' : 'running');
    const row = { processId: event.processId, projectId: event.projectId, kind: event.kind ?? previous?.kind ?? 'build', status, progress: event.progress ?? (status === 'queued' ? 0 : status === 'running' || status === 'started' || status === 'heartbeat' || status === 'log' ? 50 : 100), updatedAt: nowIso(), source: event.source ?? 'project-runtime-queue', logs: [...(previous?.logs ?? []), line].slice(-500), metadata: { ...(previous?.metadata ?? {}), ...(event.metadata ?? {}) } };
    projectRuntimeStatuses.set(row.processId, row);
    const project = projects.get(row.projectId, { root: true });
    if (project) {
        const projectStatus = status === 'failed' ? 'errored' : status === 'aborted' ? 'aborted' : row.kind === 'deploy' && status === 'completed' ? 'deployed' : row.kind === 'run' ? 'running' : row.kind === 'build' ? 'building' : project.status ?? 'active';
        try {
            projects.update(row.projectId, { status: projectStatus, activeProcessId: ['completed', 'failed', 'aborted'].includes(status) ? undefined : row.processId, error: status === 'failed' ? line : project.error }, { root: true });
        }
        catch { }
    }
    processMonitoring?.heartbeat?.(row.processId, { status: status === 'failed' ? 'error' : status === 'aborted' ? 'stale' : 'ok', message: line, metadata: { projectId: row.projectId, kind: row.kind, source: row.source } });
    processMonitoring?.appendLog?.(row.processId, status === 'failed' ? 'error' : 'info', line, { event: row });
    void bus.emit('project:runtime-status', row);
    return row;
}
function projectRuntimeStatus(projectId) { const rows = [...projectRuntimeStatuses.values()]; return projectId ? rows.filter((row) => row.projectId === projectId) : rows; }
function dependencyProfile(name) { return SANCTIONED_DEPENDENCY_PROFILES.find((profile) => profile.name === name); }
function dependencyPlanForFiles(entries) {
    const text = entries.map((entry) => `${entry.path}\n${entry.content ?? ''}`).join('\n').toLowerCase();
    const profiles = new Set();
    if (/react|vite|lucide-react|\.tsx/.test(text))
        profiles.add('frontend');
    if (/three|@react-three/.test(text))
        profiles.add('threejs');
    if (/electron/.test(text))
        profiles.add('electronjs');
    if (/arquero|apache-arrow|topojson|d3|recharts/.test(text))
        profiles.add('big-data');
    if (/express|graphql|apollo|kafkajs|node:/.test(text))
        profiles.add('backend');
    const packageJsonDependencies = [];
    for (const entry of entries) {
        if (!entry.path.endsWith('package.json') || !entry.content)
            continue;
        try {
            const parsed = JSON.parse(entry.content);
            packageJsonDependencies.push(...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {}), ...Object.keys(parsed.peerDependencies ?? {}), ...Object.keys(parsed.optionalDependencies ?? {}));
        }
        catch {
            packageJsonDependencies.push('__invalid_package_json__');
        }
    }
    for (const dep of packageJsonDependencies) {
        if (['react', 'react-dom', 'lucide-react', 'vite', '@vitejs/plugin-react', 'zustand', '@tanstack/react-query'].includes(dep))
            profiles.add('frontend');
        if (['three', '@react-three/fiber', '@react-three/drei'].includes(dep))
            profiles.add('threejs');
        if (['electron', 'electron-builder'].includes(dep))
            profiles.add('electronjs');
        if (['d3', 'arquero', 'apache-arrow', 'topojson-client', 'recharts'].includes(dep))
            profiles.add('big-data');
        if (['express', 'graphql', '@apollo/server', 'zod', 'dotenv', 'kafkajs', 'tsx'].includes(dep))
            profiles.add('backend');
        if (['lodash', 'zod', 'd3', 'arquero'].includes(dep))
            profiles.add('workflow-nodes');
    }
    if (!profiles.size)
        profiles.add('ui-kit');
    const packages = [...profiles].flatMap((name) => dependencyProfile(name)?.packages ?? []);
    const imports = [
        ...[...text.matchAll(/(?:from\s+['"]|require\(['"])([^'".][^'"]*)['"]/g)].map((match) => match[1].split('/').slice(0, match[1].startsWith('@') ? 2 : 1).join('/')),
        ...packageJsonDependencies,
    ];
    const allowed = new Set(packages);
    const rejected = [...new Set(imports.filter((name) => name !== '__invalid_package_json__' && !allowed.has(name)))];
    if (packageJsonDependencies.includes('__invalid_package_json__'))
        rejected.push('__invalid_package_json__');
    return { profiles: [...profiles], packages: [...new Set(packages)], rejected, cache: pnpmCacheConfig };
}
const defaultBuilderAgent = { async run(input, context) { const actions = []; const results = []; let build; let deployment; const lower = input.message.toLowerCase(); if (/build|debug|fix/.test(lower)) {
        build = input.build();
        actions.push('build');
    } const sql = extractSql(input.message); if (sql && input.databases[0]) {
        results.push(await input.queryDatabase(input.databases[0], sql));
        actions.push('query-database');
    } if (/deploy/.test(lower)) {
        deployment = await input.deploy();
        actions.push('deploy');
    } return { output: `Project assistant handled ${actions.join(', ') || 'context'} for ${input.project.name}.`, actions, processId: input.session.processId, build, deployment, queryResults: results, sourceMount: input.session.sourceMount }; } };
export const Projects = {
    bindWithServer(url) { endpoint = url.replace(/\/$/, ''); client.bindWithServer(endpoint); return Projects; },
    bindLogger(logger) { PackageObservability.bindLogger(logger); return Projects; },
    bindSockets(sockets) { PackageObservability.bindSockets(sockets); return Projects; },
    bindProcessMonitor(monitor) { processMonitoring = monitor; return Projects; },
    bindProcessMonitoring(monitor) { return Projects.bindProcessMonitor(monitor); },
    useFileModule(module) { fileModule = module; archiveProvider = module.createSourceArchiveAdapter?.('supabase') ?? module.createSourceArchiveAdapter?.('memory'); return Projects; },
    setArchiveProvider(provider) { archiveProvider = provider; return Projects; },
    createFileModuleArchiveProvider(provider) { archiveProvider = provider; return provider; },
    useChat(chat) { chatRuntime = chat; return Projects; },
    bindChat(chat) { return Projects.useChat(chat); },
    bindAdvancedAgents(advanced) {
        builderAgent = {
            async run(input, context) {
                const fallback = await defaultBuilderAgent.run(input, context);
                const advancedResult = await advanced.runAgent?.('software-builder-agent', { prompt: input.message, projectId: input.project.id, files: input.files.map((file) => file.path), databases: input.databases.map((db) => db.name) }, context);
                return { ...fallback, output: [advancedResult ? `Software builder agent: ${typeof advancedResult === 'string' ? advancedResult : JSON.stringify(advancedResult)}` : '', fallback.output].filter(Boolean).join('\n') };
            }
        };
        return Projects;
    },
    setSoftwareBuilderAgent(agent) { builderAgent = agent; return Projects; },
    bindSoftwareBuilderAgent(agent) { return Projects.setSoftwareBuilderAgent(agent); },
    setDatabaseExecutor(executor) { databaseExecutor = executor; return Projects; },
    setDeploymentAdapter(adapter) { deploymentAdapter = adapter; return Projects; },
    setClickHouseDebugSink(sink) { debugLogSink = sink; return Projects; },
    setDebugSink(sink) { debugLogSink = sink; return Projects; },
    create(input, context = {}) { return projects.create({ ...input, status: 'active' }, context); },
    getObject(id, context = {}) { return projects.get(id, context); },
    getList(pagination = {}, context = {}) { return projects.list(context, pagination); },
    search(term, context = {}) { return projects.search(term, context, ['name', 'description']); },
    update(id, patch, context = {}) { return projects.update(id, patch, context); },
    delete(id, context = {}) { return projects.delete(id, context); },
    writeFile(projectId, path, content, context = {}) { projects.get(projectId, context); const existing = projectFiles(projectId, context).find((file) => file.path === path); return existing ? files.update(existing.id, { content }, context) : files.create({ projectId, path, content }, context); },
    readFile(projectId, path, context = {}) { projects.get(projectId, context); return projectFiles(projectId, context).find((file) => file.path === path); },
    listFiles(projectId, context = {}) { projects.get(projectId, context); return projectFiles(projectId, context); },
    deleteFile(projectId, path, context = {}) { const file = Projects.readFile(projectId, path, context); return file ? files.delete(file.id, context) : false; },
    async saveSourceArchive(projectId, context = {}) { projects.get(projectId, context); const provider = archiveAdapter(); const entries = filteredFiles(projectId, context).map((file) => ({ path: file.path, content: file.content })); if (!provider)
        throw new Error('@connectingmatrix/file source archive adapter is required'); const archive = await provider.createArchive(entries, { exclude: ARCHIVE_EXCLUDES }); const upload = await provider?.uploadArchive?.(projectId, archive, context); appendProjectLog(projectId, 'info', 'Project source archive saved', context, { fileCount: entries.length, upload }); return { archive, files: entries.map((entry) => entry.path), upload }; },
    async restoreSourceArchive(projectId, archive, context = {}) { projects.get(projectId, context); const provider = archiveAdapter(); if (!provider)
        throw new Error('@connectingmatrix/file source archive adapter is required'); const entries = await provider.extractArchive(archive); for (const entry of entries)
        Projects.writeFile(projectId, entry.path, entry.content, context); appendProjectLog(projectId, 'info', 'Project source archive restored', context, { fileCount: entries.length }); return entries; },
    build(projectId, context = {}, sessionId) { const project = projects.get(projectId, context); if (!project)
        throw new Error(`Project not found: ${projectId}`); const processId = registerProcess({ title: `Build ${project.name}`, targetId: `project:build:${makeId('build')}`, metadata: { projectId } }, context); projects.update(projectId, { status: 'building', activeProcessId: processId }, context); const source = filteredFiles(projectId, context); const errors = []; if (!source.length)
        errors.push('Project has no source files'); const packageJson = source.find((file) => file.path.endsWith('package.json')); if (packageJson) {
        try {
            JSON.parse(packageJson.content);
        }
        catch {
            errors.push('package.json is not valid JSON');
        }
    } const status = errors.length ? 'failed' : 'passed'; const build = builds.create({ projectId, status, errors, output: status === 'passed' ? 'Build validation passed' : errors.join('\n'), sessionId, processId }, context); projects.update(projectId, { status: status === 'passed' ? 'active' : 'errored', error: errors[0], activeProcessId: undefined }, context); appendProjectLog(projectId, status === 'passed' ? 'info' : 'error', `Build ${status}`, context, { buildId: build.id, errors }, processId); if (status === 'passed')
        processMonitoring?.complete?.(processId, { projectId, buildId: build.id });
    else
        processMonitoring?.fail?.(processId, errors.join('; '), { projectId, buildId: build.id }); return build; },
    run(projectId, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error(`Project not found: ${projectId}`); const build = Projects.build(projectId, context); if (build.status !== 'passed')
        throw new Error(`Cannot run failed build: ${build.errors.join(', ')}`); const processId = registerProcess({ title: `Run ${project.name}`, targetId: `project:run:${makeId('run')}`, metadata: { projectId } }, context); const run = runs.create({ projectId, status: 'running', output: 'Run launched from project package', logs: ['Run started'], processId }, context); projects.update(projectId, { status: 'running', activeProcessId: processId }, context); appendProjectLog(projectId, 'info', 'Project run started', context, { runId: run.id }, processId); processMonitoring?.heartbeat?.(processId, { status: 'ok', message: 'Project run launched', metadata: { projectId, runId: run.id } }); return run; },
    async deploy(projectId, input = {}, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error(`Project not found: ${projectId}`); const build = input.buildId ? builds.get(input.buildId, context) : Projects.build(projectId, context); if (!build || build.status !== 'passed')
        throw new Error('Deployment requires a passed build'); const processId = registerProcess({ title: `Deploy ${project.name}`, targetId: `project:deploy:${makeId('deploy')}`, metadata: { projectId, buildId: build.id, target: input.target } }, context); const external = deploymentAdapter ? await deploymentAdapter(project, build, context) : { status: 'deployed', url: `https://apps.local/${project.id}`, logs: ['Deployment adapter not configured; local package deployment simulated.'] }; const deployment = deployments.create({ projectId, buildId: build.id, status: external.status ?? 'deployed', url: external.url, logs: external.logs ?? [], processId }, context); projects.update(projectId, { activeDeploymentId: deployment.id, status: deployment.status === 'deployed' ? 'deployed' : 'errored', activeProcessId: undefined, error: deployment.status === 'failed' ? 'Deployment failed' : undefined }, context); for (const line of deployment.logs)
        appendProjectLog(projectId, deployment.status === 'deployed' ? 'info' : 'error', line, context, { deploymentId: deployment.id }, processId); if (deployment.status === 'deployed')
        processMonitoring?.complete?.(processId, { projectId, deploymentId: deployment.id });
    else
        processMonitoring?.fail?.(processId, 'Deployment failed', { projectId, deploymentId: deployment.id }); return deployment; },
    deployments: { list(projectId, context = {}) { const rows = deployments.list(context, { limit: 1000 }).items; return projectId ? rows.filter((row) => row.projectId === projectId) : rows; }, logs(projectId, context = {}) { return Projects.checkDeploymentLogs(projectId, context); } },
    checkDeploymentLogs(projectId, context = {}) { return deployments.list(context, { limit: 1000 }).items.filter((deployment) => deployment.projectId === projectId).flatMap((deployment) => deployment.logs.map((line) => ({ deploymentId: deployment.id, line }))); },
    connectDatabase(projectId, input, context = {}) { projects.get(projectId, context); return databases.create({ ...input, projectId }, context); },
    listDatabases(projectId, context = {}) { projects.get(projectId, context); return projectDatabases(projectId, context); },
    async executeDatabaseQuery(projectId, connectionId, sql, context = {}) { const db = projectDatabases(projectId, context).find((item) => item.id === connectionId || item.connectionRef === connectionId); if (!db)
        throw new Error(`Connected database not found for this project: ${connectionId}`); appendProjectLog(projectId, 'info', 'Database query executed by project AI', context, { databaseId: db.id, kind: db.kind, sql }); if (databaseExecutor) {
        const result = await databaseExecutor(db, sql, context);
        if (result && typeof result === 'object' && Array.isArray(result.rows))
            return result;
        return { databaseId: db.id, kind: db.kind, sql, rows: [], result };
    } return { databaseId: db.id, kind: db.kind, sql, rows: [], readonly: /^\s*(select|show|describe|with)\b/i.test(sql), simulated: true }; },
    startAssistantSession(projectId, input = {}, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error(`Project not found: ${projectId}`); const processId = registerProcess({ title: `Project AI ${project.name}`, targetId: `project:assistant:${makeId('assistant')}`, metadata: { projectId, mode: input.mode ?? 'debug-project' } }, context); const session = sessions.create({ projectId, mode: input.mode ?? 'debug-project', browserContext: input.clearContext ? {} : (input.browserContext ?? {}), persistChat: false, messages: 0, processId }, context); return sessions.update(session.id, { sourceMount: Projects.mountSourceSession(projectId, context, { sessionId: session.id }).sourceMount }, context); },
    mountSourceSession(projectId, context = {}, input = {}) { projects.get(projectId, context); const mountedAt = nowIso(); const mount = { sessionId: input.sessionId ?? makeId('mount'), files: filteredFiles(projectId, context).map((file) => file.path), mountedAt }; const session = input.sessionId ? sessions.get(input.sessionId, context) : undefined; if (session)
        sessions.update(session.id, { sourceMount: mount }, context); appendProjectLog(projectId, 'info', 'Temporary source session mounted', context, { files: mount.files, sessionId: mount.sessionId }); return { sourceMount: mount, files: mount.files }; },
    async assistantMessage(sessionId, message, context = {}) { const session = sessions.get(sessionId, context); if (!session)
        throw new Error(`Project assistant session not found: ${sessionId}`); const project = projects.get(session.projectId, context); if (!project)
        throw new Error(`Project not found: ${session.projectId}`); processMonitoring?.heartbeat?.(session.processId, { status: 'ok', message: 'Project AI assistant running', metadata: { projectId: project.id, sessionId } }); await writeDebug({ projectId: project.id, sessionId, role: 'user', content: message }, context); const agent = builderAgent ?? defaultBuilderAgent; const output = await agent.run({ project, files: projectFiles(project.id, context), session, message, databases: projectDatabases(project.id, context), build: () => Projects.build(project.id, context, session.id), deploy: () => Projects.deploy(project.id, {}, context), queryDatabase: (db, sql) => Projects.executeDatabaseQuery(project.id, db.id, sql, context) }, context); sessions.update(session.id, { messages: session.messages + 2 }, context); await writeDebug({ projectId: project.id, sessionId, role: 'assistant', content: output.output, metadata: { actions: output.actions, processId: session.processId } }, context); appendProjectLog(project.id, 'info', output.output, context, { actions: output.actions }, session.processId); processMonitoring?.heartbeat?.(session.processId, { status: 'ok', message: 'Project AI assistant finished turn', metadata: { actions: output.actions } }); return output; },
    async debugWithAI(projectId, input = { message: 'debug project' }, context = {}) { const session = input.sessionId ? sessions.get(input.sessionId, context) : Projects.startAssistantSession(projectId, { mode: input.mode, browserContext: input.browserContext, clearContext: input.clearContext }, context); if (!session)
        throw new Error('Project assistant session not found'); const message = input.query ? `${input.message}\n\n\`\`\`sql\n${input.query}\n\`\`\`` : input.message; const result = await Projects.assistantMessage(session.id, message, context); if (input.databaseId && input.query) {
        const queryResult = await Projects.executeDatabaseQuery(projectId, input.databaseId, input.query, context);
        return { ...result, queryResults: [...(result.queryResults ?? []), queryResult] };
    } return result; },
    clearAssistantContext(sessionId, context = {}) { const session = sessions.get(sessionId, context); if (!session)
        return false; sessions.update(sessionId, { browserContext: {}, messages: 0, sourceMount: undefined }, context); appendProjectLog(session.projectId, 'info', 'Project AI browser context cleared', context, { sessionId }, session.processId); return true; },
    debugEvents(sessionId, context = {}) { const all = events.list(context, { limit: 1000 }).items; return sessionId ? all.filter((event) => event.sessionId === sessionId) : all; },
    heartbeat(projectId, input = {}, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error(`Project not found: ${projectId}`); const status = input.status ?? 'ok'; const message = input.message ?? input.error; const metadata = { ...(input.metadata ?? {}), ...(input.metrics ? { metrics: input.metrics } : {}) }; const row = heartbeats.create({ projectId, status, message, metadata }, context); const nextStatus = status === 'error' || status === 'failed' ? 'errored' : status === 'aborted' ? 'aborted' : status === 'running' ? 'running' : project.status ?? 'active'; projects.update(projectId, { lastHeartbeatAt: row.createdAt, status: nextStatus, error: status === 'error' || status === 'failed' ? message : project.error }, context); appendProjectLog(projectId, status === 'error' || status === 'failed' ? 'error' : 'info', message ?? `Heartbeat ${status}`, context, metadata, input.processId); if (input.processId)
        processMonitoring?.heartbeat?.(input.processId, { status, message, metadata }); return row; },
    logs(projectId, context = {}) { return logs.list(context, { limit: 1000 }).items.filter((row) => row.projectId === projectId); },
    getProjectLogs(projectId, context = {}) { return Projects.logs(projectId, context); },
    processLogs(projectId, context = {}) { const project = projects.get(projectId, context); const ids = new Set(); if (project?.activeProcessId)
        ids.add(project.activeProcessId); for (const row of [...builds.list(context, { limit: 1000 }).items, ...runs.list(context, { limit: 1000 }).items, ...deployments.list(context, { limit: 1000 }).items, ...sessions.list(context, { limit: 1000 }).items]) {
        if ('projectId' in row && row.projectId === projectId && 'processId' in row && row.processId)
            ids.add(String(row.processId));
    } return [...ids].flatMap((id) => processMonitoring?.logs?.list?.(id, 100) ?? []); },
    markErrored(projectId, message, context = {}) { const project = projects.update(projectId, { status: 'errored', error: message }, context); const heartbeat = Projects.heartbeat(projectId, { status: 'error', message }, context); return { project, heartbeat }; },
    abort(idOrProcessId, reason = 'aborted by user', context = {}) { const project = projects.get(idOrProcessId, context); const projectId = project?.id ?? [...builds.list({ root: true }).items, ...runs.list({ root: true }).items, ...deployments.list({ root: true }).items, ...sessions.list({ root: true }).items].find((row) => 'processId' in row && row.processId === idOrProcessId)?.projectId; if (!projectId)
        throw new Error(`Project/process not found: ${idOrProcessId}`); const processIds = [idOrProcessId, ...builds.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...runs.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...deployments.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId ?? ''), ...sessions.list({ root: true }).items.filter((row) => row.projectId === projectId).map((row) => row.processId)].filter(Boolean); for (const processId of Array.from(new Set(processIds)))
        processMonitoring?.abort?.(processId, reason); for (const run of runs.list({ root: true }).items.filter((row) => row.projectId === projectId && row.status === 'running'))
        runs.update(run.id, { status: 'aborted', logs: [...rowLogs(run), reason] }, { root: true }); const updated = projects.update(projectId, { status: 'aborted', error: reason, activeProcessId: undefined }, context); appendProjectLog(projectId, 'warn', reason, context, { aborted: true, processIds }, processIds[0]); return { project: updated, processIds, reason }; },
    appendLog: appendProjectLog,
    launcher: createStubLauncher,
    health() { return { name: '@connectingmatrix/projects', status: 'ok', checkedAt: nowIso(), details: { endpoint, projects: projects.list({ root: true }).total, files: files.list({ root: true }).total, archiveOwner: '@connectingmatrix/file', archiveProvider: Boolean(archiveAdapter()), chatBound: Boolean(chatRuntime), softwareBuilderAgent: Boolean(builderAgent), debugSink: debugLogSink ? 'clickhouse' : 'memory', databaseExecutor: Boolean(databaseExecutor), processMonitoring: Boolean(processMonitoring), runtimeQueue: Boolean(projectRuntimeQueue), runtimeStatuses: projectRuntimeStatuses.size, pnpmCache: pnpmCacheConfig, sanctionedDependencyProfiles: SANCTIONED_DEPENDENCY_PROFILES.map((profile) => profile.name), mountedSourceSessions: mountedSourceSessions.size, deployments: deployments.list({ root: true }).total, assistantSessions: sessions.list({ root: true }).total, heartbeats: heartbeats.list({ root: true }).total, logs: logs.list({ root: true }).total, observability: PackageObservability.healthDetails() } }; },
};
const originalProjectBuild = Projects.build.bind(Projects);
const originalProjectRun = Projects.run.bind(Projects);
const originalProjectDeploy = Projects.deploy.bind(Projects);
Projects.build = function buildWithRuntimeQueue(projectId, context = {}, sessionId) {
    if (!projectRuntimeQueue?.publish)
        return originalProjectBuild(projectId, context, sessionId);
    const project = projects.get(projectId, context);
    if (!project)
        throw new Error(`Project not found: ${projectId}`);
    const processId = registerProcess({ title: `Build ${project.name}`, targetId: `project:build:${makeId('build')}`, metadata: { projectId, runtimeQueue: true } }, context);
    const build = builds.create({ projectId, status: 'queued', output: 'Build queued through project runtime queue', errors: [], sessionId, processId }, context);
    projects.update(projectId, { status: 'building', activeProcessId: processId }, context);
    const status = projectRuntimeApply({ projectId, processId, kind: 'build', status: 'queued', progress: 0, message: 'Project build queued', metadata: { buildId: build.id } });
    void projectRuntimeQueue.publish({ ...status, command: 'build', payload: { projectId, buildId: build.id, files: filteredFiles(projectId, context).map((file) => file.path), dependencyPlan: dependencyPlanForFiles(filteredFiles(projectId, context)) } });
    return build;
};
Projects.run = function runWithRuntimeQueue(projectId, context = {}) {
    if (!projectRuntimeQueue?.publish)
        return originalProjectRun(projectId, context);
    const project = projects.get(projectId, context);
    if (!project)
        throw new Error(`Project not found: ${projectId}`);
    const processId = registerProcess({ title: `Run ${project.name}`, targetId: `project:run:${makeId('run')}`, metadata: { projectId, runtimeQueue: true } }, context);
    const run = runs.create({ projectId, status: 'running', output: 'Run queued through project runtime queue', logs: ['Run queued'], processId }, context);
    projects.update(projectId, { status: 'running', activeProcessId: processId }, context);
    const status = projectRuntimeApply({ projectId, processId, kind: 'run', status: 'queued', progress: 0, message: 'Project run queued', metadata: { runId: run.id } });
    void projectRuntimeQueue.publish({ ...status, command: 'run', payload: { projectId, runId: run.id } });
    return run;
};
Projects.deploy = async function deployWithRuntimeQueue(projectId, input = {}, context = {}) {
    if (!projectRuntimeQueue?.publish)
        return originalProjectDeploy(projectId, input, context);
    const project = projects.get(projectId, context);
    if (!project)
        throw new Error(`Project not found: ${projectId}`);
    const build = input.buildId ? builds.get(input.buildId, context) : originalProjectBuild(projectId, context);
    if (!build || (build.status !== 'passed' && build.status !== 'queued' && build.status !== 'running'))
        throw new Error('Deployment requires a passed or queued build');
    const processId = registerProcess({ title: `Deploy ${project.name}`, targetId: `project:deploy:${makeId('deploy')}`, metadata: { projectId, buildId: build.id, target: input.target, runtimeQueue: true } }, context);
    const deployment = deployments.create({ projectId, buildId: build.id, status: 'deployed', url: undefined, logs: ['Deployment queued through project runtime queue'], processId }, context);
    projects.update(projectId, { status: 'running', activeProcessId: processId }, context);
    const status = projectRuntimeApply({ projectId, processId, kind: 'deploy', status: 'queued', progress: 0, message: 'Project deployment queued', metadata: { deploymentId: deployment.id, target: input.target } });
    void projectRuntimeQueue.publish({ ...status, command: 'deploy', payload: { projectId, buildId: build.id, deploymentId: deployment.id, target: input.target } });
    return deployment;
};
Object.assign(Projects, {
    bindRuntimeQueue(queue) { projectRuntimeQueue = queue; const subscription = queue.subscribe?.((event) => { projectRuntimeApply(event); }); if (subscription && typeof subscription.then === 'function')
        void subscription.then((stop) => { projectRuntimeQueueStop = stop; });
    else if (typeof subscription === 'function')
        projectRuntimeQueueStop = subscription; return Projects; },
    stopRuntimeQueue() { projectRuntimeQueueStop?.(); projectRuntimeQueueStop = undefined; return Projects; },
    applyRuntimeStatus(event) { return projectRuntimeApply(event); },
    runtimeQueueStatus(projectId) { return projectRuntimeStatus(projectId); },
    queueStatus(projectId) { return projectRuntimeStatus(projectId); },
    onRuntimeStatus(handler) { return bus.on('project:runtime-status', handler); },
    async abortRuntime(processId, reason = 'aborted by user') { await projectRuntimeQueue?.cancel?.(processId, reason); projectRuntimeApply({ projectId: projectRuntimeStatuses.get(processId)?.projectId ?? processId, processId, kind: projectRuntimeStatuses.get(processId)?.kind ?? 'build', status: 'aborted', message: reason }); return Projects.abort(processId, reason, { root: true }); },
    configurePnpmCache(input) { pnpmCacheConfig = { ...pnpmCacheConfig, ...input }; return pnpmCacheConfig; },
    pnpmCacheConfig() { return pnpmCacheConfig; },
    sanctionedDependencyProfiles() { return SANCTIONED_DEPENDENCY_PROFILES; },
    dependencyPlan(projectId, context = {}) { projects.get(projectId, context); return dependencyPlanForFiles(filteredFiles(projectId, context)); },
    linkSanctionedModules(projectId, profiles, context = {}) { projects.get(projectId, context); const plan = profiles?.length ? { profiles, packages: [...new Set(profiles.flatMap((name) => dependencyProfile(name)?.packages ?? []))], rejected: [], cache: pnpmCacheConfig } : dependencyPlanForFiles(filteredFiles(projectId, context)); appendProjectLog(projectId, plan.rejected.length ? 'warn' : 'info', plan.rejected.length ? 'Dependency plan contains non-sanctioned modules' : 'Sanctioned dependencies linked through pnpm cache', context, plan); return { ...plan, command: `PNPM_STORE_DIR=${pnpmCacheConfig.storeDir} pnpm install --offline --package-import-method=${pnpmCacheConfig.packageImportMethod}` }; },
    closeAssistantSession(sessionId, context = {}) { const session = sessions.get(sessionId, context); if (!session)
        return false; mountedSourceSessions.set(sessionId, { projectId: session.projectId, files: session.sourceMount?.files ?? [], mountedAt: session.sourceMount?.mountedAt ?? nowIso(), lastSeenAt: nowIso(), closed: true }); sessions.delete(sessionId, context); processMonitoring?.abort?.(session.processId, 'Project editing session closed'); appendProjectLog(session.projectId, 'info', 'Project editing session closed and temporary mount scheduled for cleanup', context, { sessionId }, session.processId); return true; },
    garbageCollectSessions(input = {}, context = {}) { const olderThanMs = input.olderThanMs ?? 30 * 60 * 1000; const now = Date.now(); let cleaned = 0; for (const session of sessions.list(context, { limit: 1000 }).items) {
        const age = now - Date.parse(session.updatedAt);
        if (input.includeOpen || age > olderThanMs) {
            sessions.delete(session.id, context);
            mountedSourceSessions.set(session.id, { projectId: session.projectId, files: session.sourceMount?.files ?? [], mountedAt: session.sourceMount?.mountedAt ?? session.createdAt, lastSeenAt: nowIso(), closed: true });
            processMonitoring?.abort?.(session.processId, 'Project session garbage collected');
            cleaned += 1;
        }
    } for (const [id, mount] of [...mountedSourceSessions.entries()]) {
        if (mount.closed && now - Date.parse(mount.lastSeenAt) > olderThanMs)
            mountedSourceSessions.delete(id);
    } return { cleaned, activeSessions: sessions.list(context, { limit: 1 }).total, retainedMounts: mountedSourceSessions.size }; },
    mountedSourceSessions() { return [...mountedSourceSessions.entries()].map(([sessionId, mount]) => ({ sessionId, ...mount })); },
});
function rowLogs(row) { return Array.isArray(row.logs) ? row.logs : []; }
export const ProjectAssistant = Projects;
export function createFileModuleArchiveProvider(provider) { archiveProvider = provider; return provider; }
export const graphql = { namespace: 'projects', typeDefs: `type Project { id: ID!, name: String!, description: String, status: String } type ProjectFile { id: ID!, projectId: ID!, path: String!, content: String! } type ProjectBuild { id: ID!, projectId: ID!, status: String!, output: String! } type ProjectAssistantSession { id: ID!, projectId: ID!, mode: String!, persistChat: Boolean! } type Query { projectsList: [Project!]!, projectFiles(projectId: ID!): [ProjectFile!]!, projectDatabases(projectId: ID!): String!, projectLogs(projectId: ID!): String!, projectRuntimeStatus(projectId: ID): String!, projectDependencyPlan(projectId: ID!): String!, projectsLauncher: String! } type Mutation { projectCreate(name: String!, description: String): Project!, projectWriteFile(projectId: ID!, path: String!, content: String!): ProjectFile!, projectBuild(projectId: ID!): ProjectBuild!, projectHeartbeat(projectId: ID!, status: String, message: String): String!, projectAbort(projectId: ID!, reason: String): String!, projectStartAssistantSession(projectId: ID!, mode: String): ProjectAssistantSession!, projectAssistantMessage(sessionId: ID!, message: String!): String! }`, resolvers: { Query: { projectsList: (_, __, ctx) => Projects.getList({}, ctx).items, projectFiles: (_, args, ctx) => Projects.listFiles(args.projectId, ctx), projectDatabases: (_, args, ctx) => JSON.stringify(Projects.listDatabases(args.projectId, ctx)), projectLogs: (_, args, ctx) => JSON.stringify(Projects.logs(args.projectId, ctx)), projectRuntimeStatus: (_, args) => JSON.stringify(Projects.runtimeQueueStatus(args.projectId)), projectDependencyPlan: (_, args, ctx) => JSON.stringify(Projects.dependencyPlan(args.projectId, ctx)), projectsLauncher: (_, __, ctx) => JSON.stringify(createStubLauncher(ctx)) }, Mutation: { projectCreate: (_, args, ctx) => Projects.create(args, ctx), projectWriteFile: (_, args, ctx) => Projects.writeFile(args.projectId, args.path, args.content, ctx), projectBuild: (_, args, ctx) => Projects.build(args.projectId, ctx), projectHeartbeat: (_, args, ctx) => JSON.stringify(Projects.heartbeat(args.projectId, args, ctx)), projectAbort: (_, args, ctx) => JSON.stringify(Projects.abort(args.projectId, args.reason, ctx)), projectStartAssistantSession: (_, args, ctx) => Projects.startAssistantSession(args.projectId, { mode: args.mode }, ctx), projectAssistantMessage: async (_, args, ctx) => JSON.stringify(await Projects.assistantMessage(args.sessionId, args.message, ctx)) } }, migrations: ['migrations/0001_init.sql', 'migrations/20260515_ai_agent_project_source_archives.sql'] };
export function createPackage() { return { name: '@connectingmatrix/projects', version: '0.4.0', health: () => Projects.health(), graphql, migrations: graphql.migrations, launcher: createStubLauncher, routes: [{ method: 'GET', path: '/projects/health', handler: () => Projects.health() }, { method: 'GET', path: '/projects/launcher', handler: (request) => createStubLauncher(requestContext(request)) }, { method: 'POST', path: '/projects/debug', handler: (request) => Projects.debugWithAI(String(requestBody(request).projectId ?? ''), { message: String(requestBody(request).message ?? 'debug project'), sessionId: typeof requestBody(request).sessionId === 'string' ? String(requestBody(request).sessionId) : undefined }, requestContext(request)) }, { method: 'GET', path: '/projects/runtime-status', handler: (request) => Projects.runtimeQueueStatus(String(requestBody(request).projectId ?? '')) }, { method: 'GET', path: '/projects/dependency-plan', handler: (request) => Projects.dependencyPlan(String(requestBody(request).projectId ?? ''), requestContext(request)) }, { method: 'POST', path: '/projects/session/close', handler: (request) => Projects.closeAssistantSession(String(requestBody(request).sessionId ?? ''), requestContext(request)) }, { method: 'POST', path: '/projects/gc', handler: (request) => Projects.garbageCollectSessions(requestBody(request), requestContext(request)) }, { method: 'POST', path: '/projects/heartbeat', handler: (request) => Projects.heartbeat(String(requestBody(request).projectId ?? ''), requestBody(request), requestContext(request)) }, { method: 'POST', path: '/projects/abort', handler: (request) => Projects.abort(String(requestBody(request).projectId ?? requestBody(request).processId ?? ''), String(requestBody(request).reason ?? 'aborted by user'), requestContext(request)) }, { method: 'GET', path: '/projects/logs', handler: (request) => Projects.logs(String(requestBody(request).projectId ?? ''), requestContext(request)) }], runtime: { Projects, ProjectAssistant: Projects, observability: PackageObservability } }; }
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './launcher.js';

import { type BaseRecord } from './entity/repository.js';
import { type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
import { createPackageStatusPanel } from './services/package-status.service.js';
export type ProjectStatus = 'draft' | 'active' | 'building' | 'running' | 'deployed' | 'errored' | 'aborted';
export interface ProjectRecord extends BaseRecord {
    name: string;
    description?: string;
    status?: ProjectStatus;
    activeDeploymentId?: string;
    activeProcessId?: string;
    lastHeartbeatAt?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectFile extends BaseRecord {
    projectId: string;
    path: string;
    content: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectBuild extends BaseRecord {
    projectId: string;
    status: 'passed' | 'failed' | 'aborted';
    output: string;
    errors: string[];
    processId?: string;
    sessionId?: string;
}
export interface ProjectRun extends BaseRecord {
    projectId: string;
    status: 'running' | 'success' | 'error' | 'aborted';
    output?: string;
    logs: string[];
    processId?: string;
}
export interface ProjectDeployment extends BaseRecord {
    projectId: string;
    buildId: string;
    status: 'deployed' | 'failed' | 'aborted';
    url?: string;
    logs: string[];
    processId?: string;
}
export interface ProjectDatabase extends BaseRecord {
    projectId: string;
    name: string;
    kind?: 'sqlite' | 'postgres' | 'mysql' | 'clickhouse' | 'supabase' | 'neo4j' | string;
    connectionRef?: string;
    driveFileId?: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectAssistantSession extends BaseRecord {
    projectId: string;
    mode: 'debug-project' | 'build-project' | 'deploy-project' | 'project-chat';
    browserContext: Record<string, unknown>;
    persistChat: false;
    messages: number;
    processId: string;
    sourceMount?: {
        sessionId: string;
        files: string[];
        mountedAt: string;
    };
}
export interface ProjectDebugEvent extends BaseRecord {
    projectId: string;
    sessionId?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectHeartbeat extends BaseRecord {
    projectId: string;
    status: 'ok' | 'running' | 'stale' | 'error' | 'failed' | 'aborted';
    message?: string;
    metadata?: Record<string, unknown>;
}
export interface ProjectLog extends BaseRecord {
    projectId: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    processId?: string;
    metadata?: Record<string, unknown>;
}
export interface SourceArchiveFile {
    path: string;
    content: string;
}
export interface FileModuleArchiveProvider {
    createArchive(files: SourceArchiveFile[], options?: {
        exclude?: string[];
    }): Promise<Uint8Array>;
    extractArchive(archive: Uint8Array | string): Promise<SourceArchiveFile[]>;
    uploadArchive?(projectId: string, archive: Uint8Array, context: RequestContext): Promise<{
        url?: string;
        path?: string;
        storageId?: string;
    }>;
}
export interface FileModuleLike {
    createSourceArchiveAdapter?: (provider?: string) => FileModuleArchiveProvider;
}
export interface ProcessMonitoringLike {
    register?: (input: {
        processId?: string;
        kind?: string;
        packageName?: string;
        name?: string;
        title?: string;
        targetId?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext) => unknown;
    start?: (input: {
        kind: string;
        packageName: string;
        title: string;
        targetId?: string;
        context?: RequestContext;
        metadata?: Record<string, unknown>;
    }) => {
        id?: string;
        processId?: string;
    } | unknown;
    heartbeat?: (processId: string, input?: {
        status?: string;
        message?: string;
        metadata?: Record<string, unknown>;
    }) => unknown;
    appendLog?: (processId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => unknown;
    complete?: (processId: string, metadata?: Record<string, unknown>) => unknown;
    fail?: (processId: string, error: unknown, metadata?: Record<string, unknown>) => unknown;
    abort?: (processId: string, reason?: string) => unknown;
    logs?: {
        list?: (processId: string, limit?: number) => unknown[];
        live?: (processId: string, handler?: (logs: unknown[]) => unknown) => unknown[] | (() => void);
    };
}
export interface SoftwareBuilderAgent {
    run(input: {
        project: ProjectRecord;
        files: ProjectFile[];
        session: ProjectAssistantSession;
        message: string;
        databases: ProjectDatabase[];
        build: () => ProjectBuild;
        deploy: () => Promise<ProjectDeployment>;
        queryDatabase: (db: ProjectDatabase, sql: string) => Promise<unknown>;
    }, context: RequestContext): Promise<ProjectAssistantOutput>;
}
export interface ProjectAssistantOutput {
    output: string;
    actions: string[];
    processId: string;
    build?: ProjectBuild;
    deployment?: ProjectDeployment;
    queryResults?: unknown[];
    sourceMount?: ProjectAssistantSession['sourceMount'];
}
declare let debugLogSink: ((event: ProjectDebugEvent, context: RequestContext) => Promise<void> | void) | undefined;
declare let databaseExecutor: ((database: ProjectDatabase, sql: string, context: RequestContext) => Promise<unknown> | unknown) | undefined;
declare let deploymentAdapter: ((project: ProjectRecord, build: ProjectBuild, context: RequestContext) => Promise<{
    status?: 'deployed' | 'failed';
    url?: string;
    logs?: string[];
}> | {
    status?: 'deployed' | 'failed';
    url?: string;
    logs?: string[];
}) | undefined;
export declare const ARCHIVE_EXCLUDES: string[];
export declare function shouldArchive(path: string): boolean;
export declare const shouldArchiveSourcePath: typeof shouldArchive;
declare function appendProjectLog(projectId: string, level: ProjectLog['level'], message: string, context?: RequestContext, metadata?: Record<string, unknown>, processId?: string): ProjectLog;
export declare const Projects: {
    bindWithServer(url: string): /*elided*/ any;
    bindLogger(logger: unknown): /*elided*/ any;
    bindSockets(sockets: unknown): /*elided*/ any;
    bindProcessMonitor(monitor: ProcessMonitoringLike): /*elided*/ any;
    bindProcessMonitoring(monitor: ProcessMonitoringLike): /*elided*/ any;
    useFileModule(module: FileModuleLike): /*elided*/ any;
    setArchiveProvider(provider: FileModuleArchiveProvider): /*elided*/ any;
    createFileModuleArchiveProvider(provider: FileModuleArchiveProvider): FileModuleArchiveProvider;
    useChat(chat: unknown): /*elided*/ any;
    bindChat(chat: unknown): /*elided*/ any;
    bindAdvancedAgents(advanced: {
        runAgent?: (kind: string, input: unknown, context?: RequestContext) => Promise<unknown> | unknown;
    }): /*elided*/ any;
    setSoftwareBuilderAgent(agent: SoftwareBuilderAgent): /*elided*/ any;
    bindSoftwareBuilderAgent(agent: SoftwareBuilderAgent): /*elided*/ any;
    setDatabaseExecutor(executor: typeof databaseExecutor): /*elided*/ any;
    setDeploymentAdapter(adapter: typeof deploymentAdapter): /*elided*/ any;
    setClickHouseDebugSink(sink: typeof debugLogSink): /*elided*/ any;
    setDebugSink(sink: typeof debugLogSink): /*elided*/ any;
    create(input: {
        name: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext): ProjectRecord;
    getObject(id: string, context?: RequestContext): ProjectRecord;
    getList(pagination?: PaginationOptions, context?: RequestContext): ListResult<ProjectRecord>;
    search(term: string, context?: RequestContext): ProjectRecord[];
    update(id: string, patch: Partial<ProjectRecord>, context?: RequestContext): ProjectRecord;
    delete(id: string, context?: RequestContext): boolean;
    writeFile(projectId: string, path: string, content: string, context?: RequestContext): ProjectFile;
    readFile(projectId: string, path: string, context?: RequestContext): ProjectFile;
    listFiles(projectId: string, context?: RequestContext): ProjectFile[];
    deleteFile(projectId: string, path: string, context?: RequestContext): boolean;
    saveSourceArchive(projectId: string, context?: RequestContext): Promise<{
        archive: Uint8Array<ArrayBufferLike>;
        files: string[];
        upload: {
            url?: string;
            path?: string;
            storageId?: string;
        };
    }>;
    restoreSourceArchive(projectId: string, archive: Uint8Array | string, context?: RequestContext): Promise<SourceArchiveFile[]>;
    build(projectId: string, context?: RequestContext, sessionId?: string): ProjectBuild;
    run(projectId: string, context?: RequestContext): ProjectRun;
    deploy(projectId: string, input?: {
        buildId?: string;
        target?: string;
    }, context?: RequestContext): Promise<ProjectDeployment>;
    deployments: {
        list(projectId?: string, context?: RequestContext): ProjectDeployment[];
        logs(projectId: string, context?: RequestContext): {
            deploymentId: string;
            line: string;
        }[];
    };
    checkDeploymentLogs(projectId: string, context?: RequestContext): {
        deploymentId: string;
        line: string;
    }[];
    connectDatabase(projectId: string, input: {
        name: string;
        kind?: ProjectDatabase["kind"];
        connectionRef?: string;
        driveFileId?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext): ProjectDatabase;
    listDatabases(projectId: string, context?: RequestContext): ProjectDatabase[];
    executeDatabaseQuery(projectId: string, connectionId: string, sql: string, context?: RequestContext): Promise<{
        databaseId?: string;
        sql?: string;
        rows: unknown[];
    } | {
        databaseId: string;
        kind: string;
        sql: string;
        rows: any[];
        result: unknown;
        readonly?: undefined;
        simulated?: undefined;
    } | {
        databaseId: string;
        kind: string;
        sql: string;
        rows: any[];
        readonly: boolean;
        simulated: boolean;
        result?: undefined;
    }>;
    startAssistantSession(projectId: string, input?: {
        mode?: ProjectAssistantSession["mode"];
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    }, context?: RequestContext): ProjectAssistantSession;
    mountSourceSession(projectId: string, context?: RequestContext, input?: {
        sessionId?: string;
    }): {
        sourceMount: {
            sessionId: string;
            files: string[];
            mountedAt: string;
        };
        files: string[];
    };
    assistantMessage(sessionId: string, message: string, context?: RequestContext): Promise<ProjectAssistantOutput>;
    debugWithAI(projectId: string, input?: {
        message: string;
        databaseId?: string;
        query?: string;
        sessionId?: string;
        mode?: ProjectAssistantSession["mode"];
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    }, context?: RequestContext): Promise<ProjectAssistantOutput>;
    clearAssistantContext(sessionId: string, context?: RequestContext): boolean;
    debugEvents(sessionId?: string, context?: RequestContext): ProjectDebugEvent[];
    heartbeat(projectId: string, input?: {
        status?: ProjectHeartbeat["status"];
        message?: string;
        error?: string;
        metadata?: Record<string, unknown>;
        metrics?: Record<string, unknown>;
        processId?: string;
    }, context?: RequestContext): ProjectHeartbeat;
    logs(projectId: string, context?: RequestContext): ProjectLog[];
    getProjectLogs(projectId: string, context?: RequestContext): ProjectLog[];
    processLogs(projectId: string, context?: RequestContext): unknown[];
    markErrored(projectId: string, message: string, context?: RequestContext): {
        project: ProjectRecord;
        heartbeat: ProjectHeartbeat;
    };
    abort(idOrProcessId: string, reason?: string, context?: RequestContext): {
        project: ProjectRecord;
        processIds: string[];
        reason: string;
    };
    appendLog: typeof appendProjectLog;
    launcher: typeof createPackageStatusPanel;
    health(): PackageHealth;
};
export declare const ProjectAssistant: {
    bindWithServer(url: string): /*elided*/ any;
    bindLogger(logger: unknown): /*elided*/ any;
    bindSockets(sockets: unknown): /*elided*/ any;
    bindProcessMonitor(monitor: ProcessMonitoringLike): /*elided*/ any;
    bindProcessMonitoring(monitor: ProcessMonitoringLike): /*elided*/ any;
    useFileModule(module: FileModuleLike): /*elided*/ any;
    setArchiveProvider(provider: FileModuleArchiveProvider): /*elided*/ any;
    createFileModuleArchiveProvider(provider: FileModuleArchiveProvider): FileModuleArchiveProvider;
    useChat(chat: unknown): /*elided*/ any;
    bindChat(chat: unknown): /*elided*/ any;
    bindAdvancedAgents(advanced: {
        runAgent?: (kind: string, input: unknown, context?: RequestContext) => Promise<unknown> | unknown;
    }): /*elided*/ any;
    setSoftwareBuilderAgent(agent: SoftwareBuilderAgent): /*elided*/ any;
    bindSoftwareBuilderAgent(agent: SoftwareBuilderAgent): /*elided*/ any;
    setDatabaseExecutor(executor: typeof databaseExecutor): /*elided*/ any;
    setDeploymentAdapter(adapter: typeof deploymentAdapter): /*elided*/ any;
    setClickHouseDebugSink(sink: typeof debugLogSink): /*elided*/ any;
    setDebugSink(sink: typeof debugLogSink): /*elided*/ any;
    create(input: {
        name: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext): ProjectRecord;
    getObject(id: string, context?: RequestContext): ProjectRecord;
    getList(pagination?: PaginationOptions, context?: RequestContext): ListResult<ProjectRecord>;
    search(term: string, context?: RequestContext): ProjectRecord[];
    update(id: string, patch: Partial<ProjectRecord>, context?: RequestContext): ProjectRecord;
    delete(id: string, context?: RequestContext): boolean;
    writeFile(projectId: string, path: string, content: string, context?: RequestContext): ProjectFile;
    readFile(projectId: string, path: string, context?: RequestContext): ProjectFile;
    listFiles(projectId: string, context?: RequestContext): ProjectFile[];
    deleteFile(projectId: string, path: string, context?: RequestContext): boolean;
    saveSourceArchive(projectId: string, context?: RequestContext): Promise<{
        archive: Uint8Array<ArrayBufferLike>;
        files: string[];
        upload: {
            url?: string;
            path?: string;
            storageId?: string;
        };
    }>;
    restoreSourceArchive(projectId: string, archive: Uint8Array | string, context?: RequestContext): Promise<SourceArchiveFile[]>;
    build(projectId: string, context?: RequestContext, sessionId?: string): ProjectBuild;
    run(projectId: string, context?: RequestContext): ProjectRun;
    deploy(projectId: string, input?: {
        buildId?: string;
        target?: string;
    }, context?: RequestContext): Promise<ProjectDeployment>;
    deployments: {
        list(projectId?: string, context?: RequestContext): ProjectDeployment[];
        logs(projectId: string, context?: RequestContext): {
            deploymentId: string;
            line: string;
        }[];
    };
    checkDeploymentLogs(projectId: string, context?: RequestContext): {
        deploymentId: string;
        line: string;
    }[];
    connectDatabase(projectId: string, input: {
        name: string;
        kind?: ProjectDatabase["kind"];
        connectionRef?: string;
        driveFileId?: string;
        metadata?: Record<string, unknown>;
    }, context?: RequestContext): ProjectDatabase;
    listDatabases(projectId: string, context?: RequestContext): ProjectDatabase[];
    executeDatabaseQuery(projectId: string, connectionId: string, sql: string, context?: RequestContext): Promise<{
        databaseId?: string;
        sql?: string;
        rows: unknown[];
    } | {
        databaseId: string;
        kind: string;
        sql: string;
        rows: any[];
        result: unknown;
        readonly?: undefined;
        simulated?: undefined;
    } | {
        databaseId: string;
        kind: string;
        sql: string;
        rows: any[];
        readonly: boolean;
        simulated: boolean;
        result?: undefined;
    }>;
    startAssistantSession(projectId: string, input?: {
        mode?: ProjectAssistantSession["mode"];
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    }, context?: RequestContext): ProjectAssistantSession;
    mountSourceSession(projectId: string, context?: RequestContext, input?: {
        sessionId?: string;
    }): {
        sourceMount: {
            sessionId: string;
            files: string[];
            mountedAt: string;
        };
        files: string[];
    };
    assistantMessage(sessionId: string, message: string, context?: RequestContext): Promise<ProjectAssistantOutput>;
    debugWithAI(projectId: string, input?: {
        message: string;
        databaseId?: string;
        query?: string;
        sessionId?: string;
        mode?: ProjectAssistantSession["mode"];
        browserContext?: Record<string, unknown>;
        clearContext?: boolean;
    }, context?: RequestContext): Promise<ProjectAssistantOutput>;
    clearAssistantContext(sessionId: string, context?: RequestContext): boolean;
    debugEvents(sessionId?: string, context?: RequestContext): ProjectDebugEvent[];
    heartbeat(projectId: string, input?: {
        status?: ProjectHeartbeat["status"];
        message?: string;
        error?: string;
        metadata?: Record<string, unknown>;
        metrics?: Record<string, unknown>;
        processId?: string;
    }, context?: RequestContext): ProjectHeartbeat;
    logs(projectId: string, context?: RequestContext): ProjectLog[];
    getProjectLogs(projectId: string, context?: RequestContext): ProjectLog[];
    processLogs(projectId: string, context?: RequestContext): unknown[];
    markErrored(projectId: string, message: string, context?: RequestContext): {
        project: ProjectRecord;
        heartbeat: ProjectHeartbeat;
    };
    abort(idOrProcessId: string, reason?: string, context?: RequestContext): {
        project: ProjectRecord;
        processIds: string[];
        reason: string;
    };
    appendLog: typeof appendProjectLog;
    launcher: typeof createPackageStatusPanel;
    health(): PackageHealth;
};
export declare function createFileModuleArchiveProvider(provider: FileModuleArchiveProvider): FileModuleArchiveProvider;
export declare const graphql: {
    namespace: string;
    typeDefs: string;
    resolvers: {
        Query: {
            projectsList: (_: unknown, __: unknown, ctx: RequestContext) => ProjectRecord[];
            projectFiles: (_: unknown, args: {
                projectId: string;
            }, ctx: RequestContext) => ProjectFile[];
            projectDatabases: (_: unknown, args: {
                projectId: string;
            }, ctx: RequestContext) => string;
            projectLogs: (_: unknown, args: {
                projectId: string;
            }, ctx: RequestContext) => string;
            projectsLauncher: (_: unknown, __: unknown, ctx: RequestContext) => string;
        };
        Mutation: {
            projectCreate: (_: unknown, args: {
                name: string;
                description?: string;
            }, ctx: RequestContext) => ProjectRecord;
            projectWriteFile: (_: unknown, args: {
                projectId: string;
                path: string;
                content: string;
            }, ctx: RequestContext) => ProjectFile;
            projectBuild: (_: unknown, args: {
                projectId: string;
            }, ctx: RequestContext) => ProjectBuild;
            projectHeartbeat: (_: unknown, args: {
                projectId: string;
                status?: ProjectHeartbeat["status"];
                message?: string;
            }, ctx: RequestContext) => string;
            projectAbort: (_: unknown, args: {
                projectId: string;
                reason?: string;
            }, ctx: RequestContext) => string;
            projectStartAssistantSession: (_: unknown, args: {
                projectId: string;
                mode?: ProjectAssistantSession["mode"];
            }, ctx: RequestContext) => ProjectAssistantSession;
            projectAssistantMessage: (_: unknown, args: {
                sessionId: string;
                message: string;
            }, ctx: RequestContext) => Promise<string>;
        };
    };
    migrations: string[];
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';
export * from './package-structure.js';
export * from './observability.js';
export * from './services/package-status.service.js';

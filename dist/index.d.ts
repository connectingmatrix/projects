import { type BaseRecord } from './entity/repository.js';
import { type ListResult, type PackageHealth, type PackageModule, type PaginationOptions, type RequestContext } from './contracts.js';
export interface ProjectRecord extends BaseRecord {
    name: string;
    description?: string;
    files: Record<string, string>;
    sourceArchiveBase64?: string;
    sourceArchivePath?: string;
    sourceArchiveProvider?: string;
    sourceArchiveSize?: number;
    status: 'active' | 'archived';
}
export interface SourceArchiveAdapter {
    zip(files: Array<{
        path: string;
        content: string;
    }>): Promise<Uint8Array>;
    unzip(archive: Uint8Array | string): Promise<Array<{
        path: string;
        content: string | Uint8Array;
    }>>;
    upload?(name: string, archive: Uint8Array, context?: RequestContext): Promise<{
        path: string;
        provider?: string;
        size?: number;
    }>;
    download?(path: string, context?: RequestContext): Promise<Uint8Array>;
}
export type ProjectBuilderAdapter = (project: ProjectRecord, context: RequestContext) => Promise<BuildResult>;
export interface BuildResult {
    id: string;
    projectId: string;
    success: boolean;
    logs: string[];
    artifact?: string;
    createdAt: string;
    errors?: string[];
}
export declare const Projects: {
    bindWithServer(_endpoint: string): /*elided*/ any;
    setSourceArchiveAdapter(adapter: SourceArchiveAdapter): /*elided*/ any;
    setBuilderAdapter(adapter: ProjectBuilderAdapter): /*elided*/ any;
    create(input: {
        name: string;
        description?: string;
        files?: Record<string, string>;
    }, context?: RequestContext): ProjectRecord;
    getObject(id: string, context?: RequestContext): ProjectRecord | undefined;
    getList(pagination?: PaginationOptions, context?: RequestContext): ListResult<ProjectRecord>;
    search(term: string, context?: RequestContext): ProjectRecord[];
    update(id: string, patch: Partial<ProjectRecord>, context?: RequestContext): ProjectRecord;
    delete(id: string, context?: RequestContext): boolean;
    readFile(projectId: string, path: string, context?: RequestContext): string | undefined;
    writeFile(projectId: string, path: string, content: string, context?: RequestContext): ProjectRecord;
    deleteFile(projectId: string, path: string, context?: RequestContext): ProjectRecord;
    saveSourceArchive(projectId: string, context?: RequestContext): Promise<ProjectRecord>;
    restoreSourceArchive(projectId: string, context?: RequestContext): Promise<Record<string, string>>;
    build(projectId: string, context?: RequestContext): Promise<BuildResult>;
    run(projectId: string, command?: string, context?: RequestContext): Promise<{
        id: string;
        projectId: string;
        command: string;
        success: boolean;
        logs: string[];
        createdAt: string;
    }>;
    health(): PackageHealth;
};
export declare const graphql: {
    namespace: string;
    typeDefs: string;
    resolvers: {
        Query: {
            projectList: (_: unknown, args: PaginationOptions, ctx: RequestContext) => ProjectRecord[];
            projectGet: (_: unknown, args: {
                id: string;
            }, ctx: RequestContext) => ProjectRecord | undefined;
            projectReadFile: (_: unknown, args: {
                id: string;
                path: string;
            }, ctx: RequestContext) => string | undefined;
        };
        Mutation: {
            projectCreate: (_: unknown, args: {
                input: {
                    name: string;
                    description?: string;
                };
            }, ctx: RequestContext) => ProjectRecord;
            projectWriteFile: (_: unknown, args: {
                id: string;
                path: string;
                content: string;
            }, ctx: RequestContext) => ProjectRecord;
            projectBuild: (_: unknown, args: {
                id: string;
            }, ctx: RequestContext) => Promise<BuildResult>;
            projectRun: (_: unknown, args: {
                id: string;
                command?: string;
            }, ctx: RequestContext) => Promise<{
                id: string;
                projectId: string;
                command: string;
                success: boolean;
                logs: string[];
                createdAt: string;
            }>;
        };
    };
    migrations: string[];
};
export declare function createPackage(): PackageModule;
export * from './contracts.js';

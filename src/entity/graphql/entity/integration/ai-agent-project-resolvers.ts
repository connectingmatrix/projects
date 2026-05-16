import {
  buildAIAgentProject,
  createAIAgentProject,
  createAIAgentProjectFolder,
  deleteAIAgentProject,
  deleteAIAgentProjectFile,
  deployAIAgentProject,
  getAIAgentProject,
  launchAIAgentProjectDatabaseViewer,
  listAIAgentProjects,
  queryAIAgentProjectDatabase,
  readAIAgentProjectFile,
  updateAIAgentProject,
  verifyAIAgentProjectExternalDatabase,
  writeAIAgentProjectFile,
} from '@connectingmatrix/ai-agents/services/ai-agents/projects/agent-project-service';
import { EntityRequestContext } from '@connectingmatrix/orm/orm/request-entity-context';
import type { AIAgentProjectRow } from '@connectingmatrix/orm/repositories/entities/runtime/AIAgentProjectEntity';

type GraphqlRecord = Record<string, unknown>;
type GraphqlContext = GraphqlRecord & { supabase?: unknown; req?: unknown; request?: unknown; requestId?: string | null; request_id?: string | null };
type ProjectCreateInput = Parameters<typeof createAIAgentProject>[0];
type ProjectUpdateInput = Parameters<typeof updateAIAgentProject>[0];
type ProjectFileReadInput = Parameters<typeof readAIAgentProjectFile>[0];
type ProjectFileWriteInput = Parameters<typeof writeAIAgentProjectFile>[0];
type ProjectFolderInput = Parameters<typeof createAIAgentProjectFolder>[0];
type ProjectFileDeleteInput = Parameters<typeof deleteAIAgentProjectFile>[0];
type ProjectDatabaseInput = Parameters<typeof queryAIAgentProjectDatabase>[0];
type ProjectBuildInput = Parameters<typeof buildAIAgentProject>[0];
type ProjectDatabaseViewerInput = Parameters<typeof launchAIAgentProjectDatabaseViewer>[0];

const record = (value: unknown): GraphqlRecord => (value && typeof value === 'object' && !Array.isArray(value) ? (value as GraphqlRecord) : {});
const text = (value: unknown): string => String(value ?? '').trim();

const withGraphqlEntityContext = async <T>(context: GraphqlContext, callback: () => Promise<T>): Promise<T> => {
  if (EntityRequestContext.maybeCurrent?.()) return callback();
  return EntityRequestContext.fromRequest(
    {
      request: record(context.req || context.request),
      supabase: context.supabase as never,
      requestId: text(context.requestId || context.request_id) || null,
    },
    callback,
  );
};

const projectIdInput = (input: GraphqlRecord): string => text(input.projectId || input.project_id || input.id);
const projectFileInput = <T extends { projectId: string; path: string }>(input: GraphqlRecord): T =>
  ({ projectId: projectIdInput(input), path: text(input.path) } as T);

export const aiAgentProjectResolvers = {
  AIAgentProject: {
    agentId: (parent: AIAgentProjectRow) => parent.agent_id,
    ownerType: (parent: AIAgentProjectRow) => parent.owner_type,
    ownerId: (parent: AIAgentProjectRow) => parent.owner_id,
    organizationId: (parent: AIAgentProjectRow) => parent.organization_id,
    chatId: (parent: AIAgentProjectRow) => parent.chat_id,
    projectKind: (parent: AIAgentProjectRow) => parent.project_kind,
    databaseManifest: (parent: AIAgentProjectRow) => parent.database_manifest,
    runtimeManifest: (parent: AIAgentProjectRow) => parent.runtime_manifest,
    lastRun: (parent: AIAgentProjectRow) => parent.last_run,
    sourceArchiveBucket: (parent: AIAgentProjectRow) => parent.source_archive_bucket,
    sourceArchivePath: (parent: AIAgentProjectRow) => parent.source_archive_path,
    sourceArchiveSha256: (parent: AIAgentProjectRow) => parent.source_archive_sha256,
    sourceArchiveBytes: (parent: AIAgentProjectRow) => parent.source_archive_bytes,
    sourceArchiveEncoding: (parent: AIAgentProjectRow) => parent.source_archive_encoding,
    sourceArchiveBase64: (parent: AIAgentProjectRow) => parent.source_archive_base64,
    createdBy: (parent: AIAgentProjectRow) => parent.created_by,
    createdAt: (parent: AIAgentProjectRow) => parent.created_at,
    updatedAt: (parent: AIAgentProjectRow) => parent.updated_at,
  },
  Query: {
    aiAgentProjects: async (_parent: unknown, args: { agentId?: string | null; first?: number | null; offset?: number | null }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => listAIAgentProjects({ agentId: args.agentId || null, first: args.first || null, offset: args.offset || null })),
    aiAgentProject: async (_parent: unknown, args: { id: string }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => getAIAgentProject({ id: args.id })),
  },
  Mutation: {
    createAiAgentProject: async (_parent: unknown, args: { input: ProjectCreateInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => createAIAgentProject(args.input)),
    updateAiAgentProject: async (_parent: unknown, args: { input: ProjectUpdateInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => updateAIAgentProject(args.input)),
    deleteAiAgentProject: async (_parent: unknown, args: { id: string }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => deleteAIAgentProject({ id: args.id })),
    aiAgentProjectReadFile: async (_parent: unknown, args: { input: ProjectFileReadInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => readAIAgentProjectFile(projectFileInput(args.input as GraphqlRecord))),
    aiAgentProjectWriteFile: async (_parent: unknown, args: { input: ProjectFileWriteInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () =>
        writeAIAgentProjectFile({ ...projectFileInput(args.input as GraphqlRecord), content: String(args.input.content ?? ''), mimeType: args.input.mimeType || null }),
      ),
    aiAgentProjectCreateFolder: async (_parent: unknown, args: { input: ProjectFolderInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => createAIAgentProjectFolder(projectFileInput(args.input as GraphqlRecord))),
    aiAgentProjectDeleteFile: async (_parent: unknown, args: { input: ProjectFileDeleteInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => deleteAIAgentProjectFile(projectFileInput(args.input as GraphqlRecord))),
    aiAgentProjectDatabaseQuery: async (_parent: unknown, args: { input: ProjectDatabaseInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => queryAIAgentProjectDatabase({ projectId: projectIdInput(args.input as GraphqlRecord), sql: text(args.input.sql), mode: 'query' })),
    aiAgentProjectDatabaseAlter: async (_parent: unknown, args: { input: ProjectDatabaseInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => queryAIAgentProjectDatabase({ projectId: projectIdInput(args.input as GraphqlRecord), sql: text(args.input.sql), mode: 'alter' })),
    aiAgentProjectBuild: async (_parent: unknown, args: { input: ProjectBuildInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => buildAIAgentProject({ projectId: projectIdInput(args.input as GraphqlRecord), command: args.input.command || null, deploy: args.input.deploy === true })),
    aiAgentProjectRun: async (_parent: unknown, args: { input: ProjectBuildInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => buildAIAgentProject({ projectId: projectIdInput(args.input as GraphqlRecord), command: args.input.command || 'run', deploy: false })),
    aiAgentProjectDeploy: async (_parent: unknown, args: { input: ProjectBuildInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => deployAIAgentProject({ projectId: projectIdInput(args.input as GraphqlRecord), command: args.input.command || 'deploy' })),
    aiAgentProjectVerifyExternalDatabase: async (_parent: unknown, args: { input: ProjectDatabaseViewerInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => verifyAIAgentProjectExternalDatabase({ projectId: projectIdInput(args.input as GraphqlRecord), connectionId: args.input.connectionId || null })),
    aiAgentProjectLaunchDatabaseViewer: async (_parent: unknown, args: { input: ProjectDatabaseViewerInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => launchAIAgentProjectDatabaseViewer({ projectId: projectIdInput(args.input as GraphqlRecord), mode: args.input.mode || null, connectionId: args.input.connectionId || null })),
    aiAgentProjectDatabaseLaunchViewer: async (_parent: unknown, args: { input: ProjectDatabaseViewerInput }, context: GraphqlContext) =>
      withGraphqlEntityContext(context, async () => launchAIAgentProjectDatabaseViewer({ projectId: projectIdInput(args.input as GraphqlRecord), mode: args.input.mode || null, connectionId: args.input.connectionId || null })),
  },
};

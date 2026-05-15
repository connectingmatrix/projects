import { InMemoryRepository } from './entity/repository.js';
import { makeId, nowIso } from './contracts.js';
let sourceArchiveAdapter;
let builderAdapter;
function archiveToBase64(data) { return Buffer.from(data).toString('base64'); }
function archiveFromBase64(data) { return new Uint8Array(Buffer.from(data, 'base64')); }
const projects = new InMemoryRepository('project');
export const Projects = {
    bindWithServer(_endpoint) { return Projects; },
    setSourceArchiveAdapter(adapter) { sourceArchiveAdapter = adapter; return Projects; },
    setBuilderAdapter(adapter) { builderAdapter = adapter; return Projects; },
    create(input, context = {}) { return projects.create({ name: input.name, description: input.description, files: input.files ?? {}, status: 'active' }, context); },
    getObject(id, context = {}) { return projects.get(id, context); },
    getList(pagination = {}, context = {}) { return projects.list(context, pagination); },
    search(term, context = {}) { return projects.search(term, context, ['name', 'description']); },
    update(id, patch, context = {}) { return projects.update(id, patch, context); },
    delete(id, context = {}) { return projects.delete(id, context); },
    readFile(projectId, path, context = {}) { return projects.get(projectId, context)?.files[path]; },
    writeFile(projectId, path, content, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error('Project not found'); project.files[path] = content; return projects.update(projectId, { files: { ...project.files } }, context); },
    deleteFile(projectId, path, context = {}) { const project = projects.get(projectId, context); if (!project)
        throw new Error('Project not found'); delete project.files[path]; return projects.update(projectId, { files: { ...project.files } }, context); },
    async saveSourceArchive(projectId, context = {}) {
        const project = projects.get(projectId, context);
        if (!project)
            throw new Error('Project not found');
        const entries = Object.entries(project.files).map(([path, content]) => ({ path, content }));
        const archive = sourceArchiveAdapter ? await sourceArchiveAdapter.zip(entries) : new TextEncoder().encode(JSON.stringify(entries));
        const uploaded = sourceArchiveAdapter?.upload ? await sourceArchiveAdapter.upload(`${project.id}.zip`, archive, context) : undefined;
        return projects.update(projectId, {
            sourceArchiveBase64: archiveToBase64(archive),
            sourceArchivePath: uploaded?.path,
            sourceArchiveProvider: uploaded?.provider ?? (uploaded ? 'supabase' : 'database'),
            sourceArchiveSize: uploaded?.size ?? archive.byteLength,
        }, context);
    },
    async restoreSourceArchive(projectId, context = {}) {
        const project = projects.get(projectId, context);
        if (!project)
            throw new Error('Project not found');
        const archive = project.sourceArchivePath && sourceArchiveAdapter?.download ? await sourceArchiveAdapter.download(project.sourceArchivePath, context) : project.sourceArchiveBase64 ? archiveFromBase64(project.sourceArchiveBase64) : undefined;
        if (!archive)
            return project.files;
        const entries = sourceArchiveAdapter ? await sourceArchiveAdapter.unzip(archive) : JSON.parse(new TextDecoder().decode(archive));
        const restored = {};
        for (const entry of entries)
            restored[entry.path] = typeof entry.content === 'string' ? entry.content : new TextDecoder().decode(entry.content);
        projects.update(projectId, { files: restored }, context);
        return restored;
    },
    async build(projectId, context = {}) {
        const project = projects.get(projectId, context);
        if (!project)
            throw new Error('Project not found');
        if (builderAdapter)
            return builderAdapter(project, context);
        const fileNames = Object.keys(project.files);
        const logs = [`Loaded ${fileNames.length} source files`];
        const errors = [];
        if (!fileNames.length)
            errors.push('Project has no source files');
        if (project.files['package.json']) {
            try {
                const pkg = JSON.parse(project.files['package.json']);
                logs.push(pkg.scripts?.build ? 'package.json build script detected' : 'package.json detected without build script');
            }
            catch {
                errors.push('package.json is not valid JSON');
            }
        }
        else {
            logs.push('No package.json found; static source validation only');
        }
        if (!fileNames.some((name) => /(^|\/)(index|main|app)\.(ts|tsx|js|jsx|mjs)$/.test(name)))
            logs.push('No standard entrypoint detected; build adapter may be required');
        const success = errors.length === 0;
        return { id: makeId('build'), projectId, success, logs, errors, artifact: success ? `${project.name}-artifact` : undefined, createdAt: nowIso() };
    },
    async run(projectId, command = 'start', context = {}) {
        const build = await Projects.build(projectId, context);
        if (!build.success)
            return { id: makeId('run'), projectId, command, success: false, logs: [...build.logs, ...(build.errors ?? [])], createdAt: nowIso() };
        return { id: makeId('run'), projectId, command, success: true, logs: [...build.logs, `Run command ready: ${command}`], createdAt: nowIso() };
    },
    health() { return { name: '@connectingmatrix/projects', status: 'ok', checkedAt: nowIso(), details: { projects: projects.list({ root: true }).total, sourceArchiveAdapter: Boolean(sourceArchiveAdapter), builderAdapter: Boolean(builderAdapter) } }; },
};
export const graphql = {
    namespace: 'projects',
    typeDefs: `
    scalar JSON
    type Project { id: ID!, name: String!, description: String, status: String!, createdAt: String!, updatedAt: String! }
    type BuildResult { id: ID!, projectId: ID!, success: Boolean!, logs: [String!]!, errors: [String!], artifact: String, createdAt: String! }
    input ProjectInput { name: String!, description: String }
    type Query { projectList(limit: Int, offset: Int): [Project!]!, projectGet(id: ID!): Project, projectReadFile(id: ID!, path: String!): String }
    type Mutation { projectCreate(input: ProjectInput!): Project!, projectWriteFile(id: ID!, path: String!, content: String!): Project!, projectBuild(id: ID!): BuildResult!, projectRun(id: ID!, command: String): JSON! }
  `,
    resolvers: {
        Query: { projectList: (_, args, ctx) => Projects.getList(args, ctx).items, projectGet: (_, args, ctx) => Projects.getObject(args.id, ctx), projectReadFile: (_, args, ctx) => Projects.readFile(args.id, args.path, ctx) },
        Mutation: { projectCreate: (_, args, ctx) => Projects.create(args.input, ctx), projectWriteFile: (_, args, ctx) => Projects.writeFile(args.id, args.path, args.content, ctx), projectBuild: (_, args, ctx) => Projects.build(args.id, ctx), projectRun: (_, args, ctx) => Projects.run(args.id, args.command, ctx) },
    },
    migrations: ['migrations/0001_init.sql'],
};
export function createPackage() { return { name: '@connectingmatrix/projects', version: '0.1.0', health: () => Projects.health(), graphql, migrations: graphql.migrations, routes: [{ method: 'GET', path: '/projects/health', handler: () => Projects.health() }] }; }
export * from './contracts.js';

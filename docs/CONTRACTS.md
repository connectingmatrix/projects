# @connectingmatrix/projects

Project CRUD, source tree, source archives via file module, temporary mounted source sessions, project debug agent chat, connected DB query tools, build/run/deploy/log ownership.

## Ownership

This package owns its `src/ui`, `src/backend`, `src/entity`, GraphQL bundle, migrations, health/status, launcher, and package contracts. It can be included in backend or UI without assuming a monorepo.

## Public contracts

- `Projects.create/getObject/getList/update/delete`
- `Projects.writeFile/readFile/listFiles`
- `Projects.useFileModule/useArchiveProvider`
- `Projects.saveSourceArchive/restoreSourceArchive with node_modules/dist/build/.git excluded`
- `Projects.mountSourceSession/clearAgentContext`
- `Projects.bindChat(Chat) for browser-only debug context`
- `Projects.debugWithAI(projectId, { message, databaseId, query })`
- `Projects.connectDatabase/listDatabases/executeDatabaseQuery`
- `Projects.setDatabaseQueryAdapter`
- `Projects.build/run/deploy/getDeploymentLogs`
- `Projects.setBuilderAdapter/setDeploymentAdapter`
- `Projects.setDebugEventSink ClickHouse hook`


## Basic usage

```ts
import { Projects } from '@connectingmatrix/projects';
Projects.useFileModule(File, 'supabase');
Projects.bindChat(Chat);
const project = Projects.create({ name: 'Agent App' }, ctx);
Projects.writeFile(project.id, 'package.json', JSON.stringify({ scripts: { build: 'vite build' } }), ctx);
const session = Projects.mountSourceSession(project.id, ctx);
await Projects.debugWithAI(project.id, { sessionId: session.id, message: 'fix build', databaseId, query: 'select 1' }, ctx);
await Projects.deploy(project.id, { target: 'dev' }, ctx);
```

## Server usage

```ts
import { createPackage } from '@connectingmatrix/projects';
const pkg = createPackage();
await pkg.health?.();
// register pkg.routes as middleware and merge pkg.graphql into /graphql
```

## UI usage

Package UI modules expose `bindWithServer('/graphql')` where applicable. Domain packages own their dataloaders; the thin UI only renders/binds.

## Observability and process monitor

All packages expose `PackageObservability`. The server wires logger and sockets into every package. Logger registers package health probes and exposes `/logger/process-monitor` plus `/server/process-monitor`.

## Launcher

Run locally:

```bash
npm run build
node playground.mjs
```

The launcher opens in stub mode so the package can be tested independently, similar to workflow designer stub mode.

## GraphQL and routes

GraphQL namespace and routes are returned by `createPackage()`. Routes include health and launcher endpoints when needed.

## Exports

- `.`
- `./backend`
- `./ui`
- `./entity`
- `./package.json`
- `./package-structure`
- `./launcher`
- `./observability`
- `./backend/project-agent`

## Folder counts

- `src/ui`: 6 files
- `src/backend`: 18 files
- `src/entity`: 9 files
- `migrations`: 3 files

## Eighth pass project runtime contract

`@connectingmatrix/projects` owns project CRUD, project source sessions, build/run/deploy, project logs, heartbeat state, connected DB query tools, and the project software-builder assistant.

Public contracts:

```ts
Projects.bindProcessMonitor(processMonitoring);
Projects.useFileModule(File);
Projects.connectDatabase(projectId, { name: 'Local DB', kind: 'sqlite', driveFileId: '...' });
Projects.startAssistantSession(projectId, { mode: 'debug-project' });
await Projects.debugWithAI(projectId, { message: 'build deploy', databaseId, query: 'select 1' });
Projects.heartbeat(projectId, { status: 'failed', error: 'runtime crashed', processId });
Projects.logs(projectId);
Projects.processLogs(projectId);
Projects.abort(projectId, 'user stopped project');
await Projects.saveSourceArchive(projectId);
await Projects.restoreSourceArchive(projectId, archive);
```

Source archives are delegated to `@connectingmatrix/file` and exclude `node_modules/`, build outputs, caches, git metadata, logs, and temporary files. Debug chat stays browser-context-only; debug events can be sent to a ClickHouse-style sink without writing normal Chat DB messages.

# Usage for @connectingmatrix/projects

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

See `../README.md` for the full contract list.

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

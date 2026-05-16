# Auto-generated API

```json
{
  "package": "@connectingmatrix/projects",
  "summary": "Project CRUD, source tree, source archives via file module, temporary mounted source sessions, project debug agent chat, connected DB query tools, build/run/deploy/log ownership.",
  "contracts": [
    "Projects.create/getObject/getList/update/delete",
    "Projects.writeFile/readFile/listFiles",
    "Projects.useFileModule/useArchiveProvider",
    "Projects.saveSourceArchive/restoreSourceArchive with node_modules/dist/build/.git excluded",
    "Projects.mountSourceSession/clearAgentContext",
    "Projects.bindChat(Chat) for browser-only debug context",
    "Projects.debugWithAI(projectId, { message, databaseId, query })",
    "Projects.connectDatabase/listDatabases/executeDatabaseQuery",
    "Projects.setDatabaseQueryAdapter",
    "Projects.build/run/deploy/getDeploymentLogs",
    "Projects.setBuilderAdapter/setDeploymentAdapter",
    "Projects.setDebugEventSink ClickHouse hook"
  ],
  "exports": [
    ".",
    "./backend",
    "./ui",
    "./entity",
    "./package.json",
    "./package-structure",
    "./launcher",
    "./observability",
    "./backend/project-agent"
  ],
  "folderCounts": {
    "src/client": 6,
    "src/backend": 18,
    "src/entity": 9,
    "migrations": 3
  },
  "launcher": "playground.mjs",
  "observability": true
}
```

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

# Auto-generated contracts for `@connectingmatrix/projects`

This document is generated from the final package audit. The package owns its `src/client`, `src/backend`, `src/entity`, migrations, GraphQL/API surfaces, health/status, launcher, and tests unless this is a thin shell repo.

## Public contracts

- `Projects.create/update/delete/getList/getObject/search`
- `Projects.writeFile/readFile/listFiles/sourceManifest`
- `Projects.saveSourceArchive/restoreSourceArchive via @connectingmatrix/file`
- `Projects.build/run/deploy/checkDeploymentLogs`
- `Projects.heartbeat(projectId,state)`
- `Projects.logs/getProjectLogs/processLogs`
- `Projects.startAssistantSession/assistantMessage/debugWithAI/clearAssistantContext`
- `Projects.connectDatabase/executeDatabaseQuery`
- `Projects.abort(projectIdOrProcessId)`

## Package use

```ts
import { createPackage } from '@connectingmatrix/projects';
const pkg = createPackage();
await pkg.health?.();
```

## Backend registration

Register `pkg.routes`, merge `pkg.graphql`, run `pkg.migrations`, and keep auth/signature handling delegated to `@connectingmatrix/orm`.

## Frontend binding

UI adapters expose `bindWithServer('/graphql')` or route-specific helpers. Domain logic remains in the owning package.

## Launcher

```bash
npm run build
npm test
node playground.mjs
```

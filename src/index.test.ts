import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects, shouldArchiveSourcePath } from './index.js';

test('projects build/run, heartbeat, logs, debug, DB tools, and delegate archives to file module', async () => {
  const ctx = { userId: 'u1' };
  const p = Projects.create({ name: 'P' }, ctx);
  Projects.writeFile(p.id, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }), ctx);
  Projects.writeFile(p.id, 'src/index.ts', 'export const ok = true;', ctx);
  assert.equal(shouldArchiveSourcePath('node_modules/react/index.js'), false);
  assert.equal(shouldArchiveSourcePath('src/index.ts'), true);
  const hb = Projects.heartbeat(p.id, { status: 'running', message: 'dev server alive', metrics: { pid: 1 } }, ctx);
  assert.equal(hb.status, 'running');
  const db = Projects.connectDatabase(p.id, { name: 'local-db', kind: 'sqlite', driveFileId: 'drive-file-1' }, ctx);
  const query = await Projects.executeDatabaseQuery(p.id, db.id, 'select 1', ctx) as { rows?: unknown[] };
  assert.equal(Array.isArray(query.rows), true);
  const b = await Projects.build(p.id, ctx);
  assert.equal(b.status, 'passed');
  const debug = await Projects.debugWithAI(p.id, { message: 'debug build', databaseId: db.id, query: 'select 1' }, ctx);
  assert.equal(typeof debug.output, 'string');
  const deployed = await Projects.deploy(p.id, { target: 'dev' }, ctx);
  assert.equal(deployed.status, 'deployed');
  assert.equal(Projects.getProjectLogs(p.id, ctx).length > 0, true);
  const error = Projects.markErrored(p.id, 'crashed', ctx);
  assert.equal(error.project?.status, 'errored');
  assert.equal(Projects.health().details?.archiveOwner, '@connectingmatrix/file');
});

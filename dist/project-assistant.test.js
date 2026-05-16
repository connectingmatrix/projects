import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects } from './index.js';
test('project assistant mounts filtered source, queries DB, logs debug, builds, deploys and heartbeats', async () => {
    const ctx = { userId: 'u-project' };
    const processEvents = [];
    const monitor = {
        start(input) { const id = `proc_${processEvents.length}`; processEvents.push(`${id}:start:${input.title}`); return { id }; },
        heartbeat(id, input) { processEvents.push(`${id}:heartbeat:${input?.status ?? 'healthy'}:${input?.message ?? ''}`); },
        appendLog(id, level, message) { processEvents.push(`${id}:log:${level}:${message}`); },
        complete(id) { processEvents.push(`${id}:complete`); },
        fail(id, error) { processEvents.push(`${id}:fail:${String(error)}`); },
        abort(id, reason) { processEvents.push(`${id}:abort:${reason ?? ''}`); },
        logs: { list: (id) => processEvents.filter((event) => event.startsWith(`${id}:`)) },
    };
    Projects.bindProcessMonitor(monitor);
    const p = Projects.create({ name: 'Debuggable Project' }, ctx);
    Projects.writeFile(p.id, 'package.json', '{"scripts":{"build":"tsc"}}', ctx);
    Projects.writeFile(p.id, 'src/index.ts', 'export const value = 1;', ctx);
    Projects.writeFile(p.id, 'node_modules/pkg/index.js', 'ignored', ctx);
    const logged = [];
    Projects.setClickHouseDebugSink((event) => { logged.push(event); });
    Projects.setDatabaseExecutor((db, sql) => ({ databaseId: db.id, sql, rows: [{ ok: true }] }));
    const db = Projects.connectDatabase(p.id, { name: 'Local DB', kind: 'sqlite', connectionRef: 'local.db', driveFileId: 'drive-db-file' }, ctx);
    const session = Projects.startAssistantSession(p.id, { browserContext: { tab: 'debug' } }, ctx);
    const mounted = Projects.mountSourceSession(p.id, ctx, { sessionId: session.id });
    assert.equal(mounted.files.includes('src/index.ts'), true);
    assert.equal(mounted.files.some((path) => path.includes('node_modules')), false);
    const out = await Projects.assistantMessage(session.id, `build deploy and run this query\n\n\`\`\`sql\nselect * from users\n\`\`\``, ctx);
    assert.equal(out.actions.includes('build'), true);
    assert.equal(out.actions.includes('deploy'), true);
    assert.equal(out.actions.includes('query-database'), true);
    assert.equal((out.queryResults?.[0]).databaseId, db.id);
    assert.equal(logged.length >= 2, true);
    assert.equal(Projects.checkDeploymentLogs(p.id, ctx).length >= 1, true);
    Projects.heartbeat(p.id, { status: 'failed', error: 'runtime crashed', processId: out.processId }, ctx);
    assert.equal(Projects.getObject(p.id, ctx)?.status, 'errored');
    assert.equal(Projects.logs(p.id, ctx).some((log) => log.message.includes('runtime crashed') || log.message.includes('heartbeat')), true);
    Projects.abort(p.id, 'user stopped project', ctx);
    assert.equal(Projects.getObject(p.id, ctx)?.status, 'aborted');
    assert.equal(processEvents.some((event) => event.includes(':abort:user stopped project')), true);
    Projects.clearAssistantContext(session.id, ctx);
});

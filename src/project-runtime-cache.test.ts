import test from 'node:test';
import assert from 'node:assert/strict';
import { Projects } from './index.js';

type RuntimeProjects = typeof Projects & {
  configurePnpmCache(input: Record<string, unknown>): unknown;
  bindRuntimeQueue(queue: unknown): typeof Projects;
  runtimeQueueStatus(projectId?: string): Array<{ status: string; kind: string; processId: string }>;
  dependencyPlan(projectId: string, context?: { root?: boolean }): { packages: string[]; rejected: string[] };
  closeAssistantSession(sessionId: string, context?: { root?: boolean }): boolean;
  garbageCollectSessions(input?: { olderThanMs?: number; includeOpen?: boolean }, context?: { root?: boolean }): { cleaned: number; retainedMounts: number };
};

test('projects use runtime queue, sanctioned dependency planning, and session garbage collection', () => {
  const Runtime = Projects as RuntimeProjects;
  Runtime.configurePnpmCache({ localDir: '/tmp/giga-test-cache', pvcMountDir: '/var/lib/giga/runtime-cache' });
  const published: unknown[] = [];
  Runtime.bindRuntimeQueue({ publish: (event: unknown) => { published.push(event); } });
  const project = Projects.create({ name: 'Runtime project' }, { root: true });
  Projects.writeFile(project.id, 'package.json', JSON.stringify({ dependencies: { react: '^19.0.0', unknownpkg: '1.0.0' } }), { root: true });
  Projects.writeFile(project.id, 'src/App.tsx', "import { Icon } from 'lucide-react'; export default function App(){ return null }", { root: true });
  const plan = Runtime.dependencyPlan(project.id, { root: true });
  assert.ok(plan.packages.includes('lucide-react'));
  assert.ok(plan.rejected.includes('unknownpkg'));
  const build = Projects.build(project.id, { root: true });
  assert.equal(build.status, 'queued');
  assert.equal(published.length, 1);
  assert.equal(Runtime.runtimeQueueStatus(project.id)[0].status, 'queued');
  const session = Projects.startAssistantSession(project.id, {}, { root: true });
  assert.equal(Runtime.closeAssistantSession(session.id, { root: true }), true);
  const gc = Runtime.garbageCollectSessions({ olderThanMs: 0, includeOpen: true }, { root: true });
  assert.ok(gc.retainedMounts >= 0);
});

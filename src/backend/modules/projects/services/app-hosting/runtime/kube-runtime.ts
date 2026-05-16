import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { kubeManifest } from '../contracts/kube-runtime-manifest';
import { runShellCommand } from './kube-runtime-shell';
import type { KubeRuntimeConfig } from '../contracts/kube-runtime-config';

type KubeDeployInput = {
  deploymentId: string;
  appSlug: string;
  rootPath: string;
  config: KubeRuntimeConfig;
};

export type KubeDeployOutput = {
  provider: 'giga-kube-host';
  host: string;
  deploymentName: string;
  serviceName: string;
  ingressName: string;
  liveUrl: string;
};

const text = (value: string): string => String(value || '').trim();
const slug = (value: string): string =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export async function deployAppToKube(input: KubeDeployInput): Promise<KubeDeployOutput> {
  if (!input.config.domain) throw new Error('GIGA_AGENT_APP_DOMAIN is required for kube app hosting.');
  const id = createHash('sha1').update(input.deploymentId).digest('hex').slice(0, 8);
  const base = `agent-app-${slug(input.appSlug)}-${id}`;
  const host = `${base}.${input.config.domain}`;
  const temp = await mkdtemp(join(tmpdir(), 'giga-app-bundle-'));
  const bundle = join(temp, 'app.tgz');
  const secret = `${base}-bundle`;
  await runShellCommand({ command: 'tar', args: ['-czf', bundle, '-C', input.rootPath, '.'] });
  const secretYaml = await runShellCommand({
    command: 'kubectl',
    args: ['-n', input.config.namespace, 'create', 'secret', 'generic', secret, `--from-file=app.tgz=${bundle}`, '--dry-run=client', '-o', 'yaml'],
  });
  await runShellCommand({ command: 'kubectl', args: ['apply', '-f', '-'], stdin: secretYaml });
  await runShellCommand({
    command: 'kubectl',
    args: ['apply', '-f', '-'],
    stdin: kubeManifest({ config: input.config, appName: base, bundleSecret: secret, host }),
  });
  await runShellCommand({ command: 'kubectl', args: ['-n', input.config.namespace, 'rollout', 'status', `deployment/${base}`, '--timeout=5m'] });
  await rm(temp, { recursive: true, force: true });
  return {
    provider: 'giga-kube-host',
    host,
    deploymentName: base,
    serviceName: base,
    ingressName: base,
    liveUrl: `https://${host}/`,
  };
}

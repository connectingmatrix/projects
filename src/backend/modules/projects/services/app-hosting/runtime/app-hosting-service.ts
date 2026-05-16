import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { EnvLoader } from '@giga/shared/lib/env';
import { AIAgentAppDeploymentEntity } from '@connectingmatrix/orm/repositories/entities/runtime/AIAgentAppDeploymentEntity';
import { readGeneratedAppBuildInput } from '@connectingmatrix/ai-agents/services/ai-agents/contracts';
import { readKubeRuntimeConfig } from '../contracts/kube-runtime-config';
import { injectGigaAppAnchors } from './anchors';
import { buildGeneratedAppFrameHtml } from './frame';
import { deployAppToKube } from './kube-runtime';
import type { GeneratedAppBuildInput, GeneratedAppDeploymentResult, GeneratedAppFile, GeneratedAppInspectionResult } from '../contracts/types';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'generated-app';

const deploymentRoot = () => EnvLoader.get('GIGA_AGENT_APP_DEPLOYMENT_ROOT') || join(process.cwd(), 'storage', 'agent-apps');
const publicBase = () =>
  EnvLoader.get('GIGA_AGENT_APP_PUBLIC_BASE_URL') || EnvLoader.get('PUBLIC_API_BASE_URL') || `http://localhost:${process.env.PORT || 4000}`;

function assertSafePath(filePath: string): string {
  const safe = normalize(filePath)
    .replace(/^([.][.][/\\])+/, '')
    .replace(/^[/\\]+/, '');
  if (!safe || safe.includes('..')) throw new Error(`Unsafe generated app file path: ${filePath}`);
  return safe;
}

async function writeGeneratedFile(root: string, file: GeneratedAppFile): Promise<number> {
  const safe = assertSafePath(file.path);
  const target = join(root, safe);
  await mkdir(join(target, '..'), { recursive: true });
  const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content));
  await writeFile(target, content);
  return content.byteLength;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function deployGeneratedApp(input: GeneratedAppBuildInput): Promise<GeneratedAppDeploymentResult> {
  const buildInput = readGeneratedAppBuildInput(input);
  const now = new Date().toISOString();
  const deploymentId = randomUUID();
  const appId = buildInput.appId || randomUUID();
  const slug = slugify(buildInput.appSlug || buildInput.appName);
  const buildId = createHash('sha256').update(`${appId}:${deploymentId}:${now}:${buildInput.appName}`).digest('hex').slice(0, 24);
  const root = join(deploymentRoot(), deploymentId);
  await mkdir(root, { recursive: true });

  const entryFile = buildInput.entryFile || 'index.html';
  const manifest = {
    appId,
    deploymentId,
    buildId,
    appName: buildInput.appName,
    appSlug: slug,
    createdAt: now,
    sourcePromptHash: buildInput.sourcePrompt ? createHash('sha256').update(buildInput.sourcePrompt).digest('hex') : null,
    metadata: buildInput.metadata || {},
  };

  const health = {
    ok: true,
    appId,
    deploymentId,
    buildId,
    generatedAt: now,
    entryFile,
  };

  const files = [...buildInput.files];
  const entryIndex = files.findIndex((file) => file.path === entryFile);
  if (entryIndex >= 0) {
    const appEntry = injectGigaAppAnchors(String(files[entryIndex].content), manifest);
    files[entryIndex] = {
      ...files[entryIndex],
      content: buildGeneratedAppFrameHtml(deploymentId, manifest),
      contentType: files[entryIndex].contentType || 'text/html',
    };
    files.push({ path: `__app/${entryFile}`, content: appEntry, contentType: files[entryIndex].contentType || 'text/html' });
  } else {
    const appEntry = injectGigaAppAnchors(
      '<!doctype html><html><head><title>Generated App</title></head><body><div id="root"></div></body></html>',
      manifest,
    );
    files.push({
      path: entryFile,
      content: buildGeneratedAppFrameHtml(deploymentId, manifest),
      contentType: 'text/html',
    });
    files.push({ path: `__app/${entryFile}`, content: appEntry, contentType: 'text/html' });
  }

  files.push({ path: '__giga/manifest.json', content: JSON.stringify(manifest, null, 2), contentType: 'application/json' });
  files.push({ path: '__giga/health.json', content: JSON.stringify(health, null, 2), contentType: 'application/json' });

  let sizeBytes = 0;
  for (const file of files) sizeBytes += await writeGeneratedFile(root, file);

  const base = publicBase().replace(/\/$/, '');
  const compatibilityLiveUrl = `${base}/api/v2/agent-apps/live/${deploymentId}/`;
  const runtimeConfig = readKubeRuntimeConfig();
  const runtime =
    runtimeConfig.mode === 'kube'
      ? await deployAppToKube({
          deploymentId,
          appSlug: slug,
          rootPath: root,
          config: runtimeConfig,
        })
      : null;
  const liveUrl = runtime?.liveUrl || compatibilityLiveUrl;
  const healthUrl = `${liveUrl.replace(/\/$/, '')}/__giga/health.json`;
  const manifestUrl = `${liveUrl.replace(/\/$/, '')}/__giga/manifest.json`;

  const row = await AIAgentAppDeploymentEntity.create({
    id: deploymentId,
    app_id: appId,
    project_id: buildInput.projectId || null,
    user_id: buildInput.userId || null,
    organization_id: buildInput.organizationId || null,
    chat_id: buildInput.chatId || null,
    workflow_id: buildInput.workflowId || null,
    run_id: buildInput.runId || null,
    provider: runtime?.provider || 'giga-static-host',
    status: 'deployed',
    app_name: input.appName,
    app_slug: slug,
    build_id: buildId,
    deployment_path: root,
    live_url: liveUrl,
    health_url: healthUrl,
    manifest_url: manifestUrl,
    entry_file: entryFile,
    manifest: {
      ...manifest,
      runtime: runtime || null,
      compatibility: { live_url: compatibilityLiveUrl },
    },
    health,
    inspection: {},
    files_count: files.length,
    size_bytes: sizeBytes,
    created_by: buildInput.createdBy || buildInput.userId || null,
    created_at: now,
    updated_at: now,
  });

  const inspection = await inspectLiveGeneratedApp({ deploymentId, liveUrl, root });
  await row.update({ inspection, updated_at: new Date().toISOString() });

  return {
    type: 'generated_app_deployment',
    app_id: appId,
    deployment_id: deploymentId,
    build_id: buildId,
    status: inspection.ok ? 'deployed' : 'failed',
    live_url: liveUrl,
    health_url: healthUrl,
    manifest_url: manifestUrl,
    inspection,
    manifest: {
      ...manifest,
      runtime: runtime || null,
      compatibility: { live_url: compatibilityLiveUrl },
    },
  };
}

export async function readDeploymentFile(deploymentId: string, requestedPath: string): Promise<{ content: Buffer; contentType: string } | null> {
  const root = join(deploymentRoot(), deploymentId);
  const requested = requestedPath.endsWith('/') ? `${requestedPath}index.html` : requestedPath;
  const safe = assertSafePath(requested || 'index.html');
  const target = join(root, safe);
  const fallback = join(root, 'index.html');
  const actual = (await fileExists(target)) ? target : fallback;
  if (!(await fileExists(actual))) return null;
  const content = await readFile(actual);
  const ext = actual.split('.').pop()?.toLowerCase();
  const contentType = ext === 'json' ? 'application/json' : ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : 'text/html';
  return { content, contentType };
}

export async function inspectLiveGeneratedApp(input: {
  deploymentId: string;
  liveUrl: string;
  root?: string;
}): Promise<GeneratedAppInspectionResult> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  let html = '';
  let healthOk = false;
  let manifestOk = false;
  try {
    if (input.root) {
      html = await readFile(join(input.root, 'index.html'), 'utf8');
      const health = JSON.parse(await readFile(join(input.root, '__giga/health.json'), 'utf8'));
      const manifest = JSON.parse(await readFile(join(input.root, '__giga/manifest.json'), 'utf8'));
      healthOk = health?.ok === true && String(health.deploymentId) === input.deploymentId;
      manifestOk = String(manifest.deploymentId) === input.deploymentId;
    } else {
      const [htmlRes, healthRes, manifestRes] = await Promise.all([
        fetch(input.liveUrl),
        fetch(`${input.liveUrl.replace(/\/$/, '')}/__giga/health.json`),
        fetch(`${input.liveUrl.replace(/\/$/, '')}/__giga/manifest.json`),
      ]);
      html = await htmlRes.text();
      const health = await healthRes.json();
      const manifest = await manifestRes.json();
      healthOk = health?.ok === true;
      manifestOk = Boolean(manifest?.deploymentId);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  const checks = {
    statusCode: html.length > 0,
    health: healthOk,
    manifest: manifestOk,
    metaAnchor: /<meta\s+name=["']giga-app-id["']/i.test(html),
    domAnchor: /id=["']giga-app-verification-anchor["']/i.test(html),
    dataAnchor: /data-giga-app-id=/i.test(html),
    scriptAnchor: /window\.__GIGA_APP_MANIFEST__/.test(html),
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, liveUrl: input.liveUrl, checkedAt, checks, errors };
}

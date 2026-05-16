import { parseRecordValue, parseStringValue, parseUnknownArray } from 'giga-ai-helper/workflow';
import { readDeploymentFile } from './app-hosting-service';

type ConnectivityCheck = { operation: string; endpoint: string; method?: string; expectedStatus: number };
type Manifest = { name?: string; slug?: string; connectivity?: { checks: ConnectivityCheck[] } };

const readManifest = (value: unknown): Manifest => {
  const input = parseRecordValue(value);
  const connectivity = parseRecordValue(input.connectivity);
  const checks: ConnectivityCheck[] = [];
  for (const item of parseUnknownArray(connectivity.checks)) {
    const check = parseRecordValue(item);
    const operation = parseStringValue(check.operation).trim();
    const endpoint = parseStringValue(check.endpoint).trim();
    if (operation && endpoint)
      checks.push({
        operation,
        endpoint,
        method: parseStringValue(check.method).trim() || undefined,
        expectedStatus: Number(check.expectedStatus || 200),
      });
  }
  return { name: parseStringValue(input.name).trim() || undefined, slug: parseStringValue(input.slug).trim() || undefined, connectivity: { checks } };
};

export function buildGeneratedAppApiResponse(manifest: Manifest, operation: string, method: string, body: unknown) {
  const check = manifest.connectivity?.checks.find((item) => item.operation === operation);
  if (!check) return { status: 404, body: { ok: false, error: `Generated app API operation ${operation} is not defined.` } };
  if (check.method && check.method !== method) return { status: 405, body: { ok: false, error: `${operation} expects ${check.method}.` } };
  const [entity, action = operation] = operation.split('.');
  return {
    status: check.expectedStatus || 200,
    body: {
      ok: true,
      operation,
      method,
      app: { name: manifest.name || 'Generated application', slug: manifest.slug || 'generated-app' },
      data: {
        session: operation === 'login' ? 'generated-session-token' : undefined,
        user: ['login', 'current-user', 'protected-route', 'admin-only'].includes(operation)
          ? { id: 'demo-user', role: 'organization_admin' }
          : undefined,
        records: action === 'list' ? [{ id: `${entity}-demo`, title: 'Demo record', status: 'verified' }] : undefined,
        record: ['create', 'update', 'delete'].includes(action) ? body || { id: `${entity}-demo`, status: 'verified' } : undefined,
        offline: operation === 'offline' ? { fallback: '/pwa/offline.html', cacheSafe: true } : undefined,
      },
    },
  };
}

export async function readGeneratedAppApiResponse(deploymentId: string, operation: string, method: string, body?: unknown) {
  const file = await readDeploymentFile(deploymentId, 'app.manifest.json');
  if (!file || file.contentType !== 'application/json') return { status: 404, body: { ok: false, error: 'Generated app contract not found.' } };
  return buildGeneratedAppApiResponse(readManifest(JSON.parse(file.content.toString('utf8'))), operation, method, body);
}

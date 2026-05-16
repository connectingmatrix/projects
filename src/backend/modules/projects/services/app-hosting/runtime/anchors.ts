export const GIGA_APP_ANCHOR_ID = 'giga-app-verification-anchor';
export const GIGA_APP_META_NAME = 'giga-app-id';
export const GIGA_APP_DATA_ATTR = 'data-giga-app-id';

export function injectGigaAppAnchors(html: string, manifest: Record<string, unknown>): string {
  const appId = String(manifest.appId || manifest.app_id || 'unknown-app');
  const deploymentId = String(manifest.deploymentId || manifest.deployment_id || 'unknown-deployment');
  const encoded = JSON.stringify(manifest).replace(/</g, '\\u003c');
  const meta = `<meta name="${GIGA_APP_META_NAME}" content="${appId}">`;
  const script = `<script>window.__AGENT_APP_LIVE__=true;window.__GIGA_APP_MANIFEST__=${encoded};</script>`;
  const anchor = `<div id="${GIGA_APP_ANCHOR_ID}" ${GIGA_APP_DATA_ATTR}="${appId}" data-giga-deployment-id="${deploymentId}" hidden aria-hidden="true"></div>`;

  let next = html;
  if (!next.includes(`name="${GIGA_APP_META_NAME}"`)) next = next.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  if (!next.includes('window.__GIGA_APP_MANIFEST__')) next = next.replace(/<head([^>]*)>/i, `<head$1>${script}`);
  if (!next.includes(`id="${GIGA_APP_ANCHOR_ID}"`)) next = next.replace(/<body([^>]*)>/i, `<body$1>${anchor}`);
  return next;
}

export type GeneratedAppHostManifest = {
  appId?: string | null;
  buildId?: string | null;
  deploymentId?: string | null;
  appName?: string | null;
};

export function buildGeneratedAppFrameHtml(deploymentId: string, manifest: GeneratedAppHostManifest): string {
  const appId = manifest.appId || 'unknown-app';
  const appName = manifest.appName || 'Generated application';
  const cacheKey = encodeURIComponent(manifest.buildId || manifest.deploymentId || deploymentId);
  const encoded = JSON.stringify(manifest).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="giga-app-id" content="${appId}"><title>${appName}</title><script>window.__AGENT_APP_LIVE__=true;window.__GIGA_APP_MANIFEST__=${encoded};</script><style>html,body{margin:0;width:100%;height:100%;background:#e9eef3}#giga-app-frame{display:block;width:100vw;height:100vh;border:0;background:white}</style></head><body><div id="giga-app-verification-anchor" data-giga-app-id="${appId}" data-giga-deployment-id="${deploymentId}" hidden aria-hidden="true"></div><iframe id="giga-app-frame" title="${appName}" sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe><script>const frame=document.getElementById('giga-app-frame');const sync=()=>{frame.src='./__app/?v=${cacheKey}'+(location.hash||'#/home')};addEventListener('hashchange',sync);sync();</script></body></html>`;
}

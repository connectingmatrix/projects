export type { GeneratedAppBuildInput, GeneratedAppFile } from '@connectingmatrix/ai-agents/services/ai-agents/contracts';

export type GeneratedAppDeploymentResult = {
  type: 'generated_app_deployment';
  app_id: string | null;
  deployment_id: string;
  build_id: string;
  status: 'deployed' | 'failed';
  live_url: string;
  health_url: string;
  manifest_url: string;
  inspection: GeneratedAppInspectionResult;
  manifest: Record<string, unknown>;
};

export type GeneratedAppInspectionResult = {
  ok: boolean;
  liveUrl: string;
  checkedAt: string;
  checks: {
    statusCode: boolean;
    health: boolean;
    manifest: boolean;
    metaAnchor: boolean;
    domAnchor: boolean;
    dataAnchor: boolean;
    scriptAnchor: boolean;
  };
  errors: string[];
};

import { EnvLoader } from '@giga/shared/lib/env';

export type AgentAppHostMode = 'static' | 'kube';

export type KubeRuntimeConfig = {
  mode: AgentAppHostMode;
  namespace: string;
  ingressClass: string;
  domain: string;
  nodeLabelKey: string;
  nodeLabelValue: string;
  tolerationKey: string;
  cpuLimit: string;
  memoryLimit: string;
  cpuRequest: string;
  memoryRequest: string;
};

const text = (value: string | undefined): string => String(value || '').trim();

export const readKubeRuntimeConfig = (): KubeRuntimeConfig => {
  const modeValue = text(EnvLoader.get('GIGA_AGENT_APP_HOST_MODE')).toLowerCase();
  const domain = text(EnvLoader.get('GIGA_AGENT_APP_DOMAIN'));
  const mode: AgentAppHostMode = modeValue === 'kube' || (!modeValue && domain) ? 'kube' : 'static';
  return {
    mode,
    namespace: text(EnvLoader.get('GIGA_AGENT_APP_KUBE_NAMESPACE')) || 'giga-app-runtime',
    ingressClass: text(EnvLoader.get('GIGA_AGENT_APP_KUBE_INGRESS_CLASS')) || 'nginx',
    domain,
    nodeLabelKey: text(EnvLoader.get('GIGA_AGENT_APP_NODE_LABEL_KEY')) || 'nodepool',
    nodeLabelValue: text(EnvLoader.get('GIGA_AGENT_APP_NODE_LABEL_VALUE')) || 'agent-apps',
    tolerationKey: text(EnvLoader.get('GIGA_AGENT_APP_TOLERATION_KEY')) || 'dedicated',
    cpuLimit: text(EnvLoader.get('GIGA_AGENT_APP_CPU_LIMIT')) || '4',
    memoryLimit: text(EnvLoader.get('GIGA_AGENT_APP_MEMORY_LIMIT')) || '24Gi',
    cpuRequest: text(EnvLoader.get('GIGA_AGENT_APP_CPU_REQUEST')) || '250m',
    memoryRequest: text(EnvLoader.get('GIGA_AGENT_APP_MEMORY_REQUEST')) || '512Mi',
  };
};

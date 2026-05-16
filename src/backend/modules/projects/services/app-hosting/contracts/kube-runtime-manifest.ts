import type { KubeRuntimeConfig } from './kube-runtime-config';

export const kubeManifest = (input: {
  config: KubeRuntimeConfig;
  appName: string;
  bundleSecret: string;
  host: string;
}): string => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${input.appName}
  namespace: ${input.config.namespace}
spec:
  replicas: 1
  selector: { matchLabels: { app: ${input.appName} } }
  template:
    metadata: { labels: { app: ${input.appName} } }
    spec:
      nodeSelector: { ${input.config.nodeLabelKey}: ${input.config.nodeLabelValue} }
      tolerations: [{ key: ${input.config.tolerationKey}, operator: Equal, value: agent-app, effect: NoSchedule }]
      securityContext: { runAsNonRoot: true, fsGroup: 101 }
      initContainers:
      - name: unpack
        image: alpine:3.20
        command: ["sh", "-c", "mkdir -p /work && tar -xzf /bundle/app.tgz -C /work"]
        volumeMounts: [{ name: bundle, mountPath: /bundle }, { name: content, mountPath: /work }]
      containers:
      - name: web
        image: nginx:1.27-alpine
        ports: [{ containerPort: 80 }]
        resources: { requests: { cpu: "${input.config.cpuRequest}", memory: "${input.config.memoryRequest}" }, limits: { cpu: "${input.config.cpuLimit}", memory: "${input.config.memoryLimit}" } }
        securityContext: { allowPrivilegeEscalation: false, runAsUser: 101, readOnlyRootFilesystem: true }
        volumeMounts: [{ name: content, mountPath: /usr/share/nginx/html }]
      volumes:
      - name: bundle
        secret: { secretName: ${input.bundleSecret} }
      - name: content
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: ${input.appName}
  namespace: ${input.config.namespace}
spec:
  selector: { app: ${input.appName} }
  ports: [{ port: 80, targetPort: 80 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${input.appName}
  namespace: ${input.config.namespace}
spec:
  ingressClassName: ${input.config.ingressClass}
  rules:
  - host: ${input.host}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: ${input.appName}, port: { number: 80 } } }
`;

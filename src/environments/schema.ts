import { z } from 'zod';
import { changeSpecSchema } from '../case/change.js';

export const resourceSchema = z.object({
  apiVersion: z.string().min(1), kind: z.string().min(1),
  metadata: z.object({ name: z.string().min(1), namespace: z.string().optional(), uid: z.string().optional() }).passthrough(),
}).passthrough();
export const namespaceSchema = z.object({ metadata: z.object({ name: z.string(), uid: z.string().min(1) }) });
const kinds = ['ConfigMap', 'Deployment', 'StatefulSet', 'Service', 'Job', 'PersistentVolumeClaim', 'NetworkPolicy', 'Pod'];
const verbs = ['get', 'scale', 'exec', 'patch', 'annotate', 'label', 'wait', 'rollout'];
export const faultNamePattern = /^[a-z][a-z0-9-]*$/;
export const environmentSpecSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['kind', 'docker']).optional(),
  dockerHost: z.string().startsWith('unix://'),
  colimaProfile: z.string().regex(/^praman-[a-z0-9-]+$/).optional(),
  inotifyMaxUserInstances: z.number().int().min(128).max(65536).optional(),
  nodeImage: z.string().min(1).optional(),
  namespace: z.string().regex(/^praman-[a-z0-9-]+$/),
  resources: z.array(resourceSchema),
  workloads: z.record(z.string(), z.object({ args: z.array(z.string()).min(1), service: z.string().optional(), input: z.string().optional() }).strict()),
  readinessWorkloads: z.array(z.string().min(1)).optional(),
  services: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.object({
    image: z.string().min(1), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional(),
    port: z.number().int().min(1).max(65535), dataPath: z.string().regex(/^\/[^\0]*[^/\0]$/).optional(), ready: z.union([z.array(z.string()).min(1), z.object({ http: z.string().startsWith('/') }).strict()]),
    // The application reaches a proxied service through an owned fault proxy; `probe` checks that path.
    proxy: z.object({ probe: z.array(z.string()).min(1).optional() }).strict().optional(),
  }).strict()).optional(),
  faultService: z.string().optional(),
  faults: z.record(z.string().regex(faultNamePattern), z.discriminatedUnion('kind', [
    z.object({ service: z.string(), kind: z.literal('delay'), delayMs: z.number().int().min(100).max(60_000) }).strict(),
    z.object({ service: z.string(), kind: z.literal('timeout'), timeoutMs: z.number().int().min(100).max(60_000) }).strict(),
    z.object({ service: z.string(), kind: z.literal('drop') }).strict(),
    z.object({ service: z.string(), kind: z.literal('down') }).strict(),
  ])).optional(),
  application: z.object({ module: z.string().min(1), config: z.unknown() }).strict().optional(),
  scenario: z.string().min(1).optional(),
}).strict().superRefine((spec, ctx) => {
  if (spec.provider === 'docker') {
    if (!spec.services || !Object.keys(spec.services).length || spec.resources.length) {
      ctx.addIssue({ code: 'custom', message: 'Docker environments require services and cannot declare Kubernetes resources' });
    }
    for (const [name, workload] of Object.entries(spec.workloads)) {
      if (!workload.service || !spec.services?.[workload.service]) ctx.addIssue({ code: 'custom', path: ['workloads', name], message: 'Docker workloads require a declared service' });
    }
    const named = Object.keys(spec.faults ?? {}).length > 0;
    if ((!named || spec.faultService !== undefined) && (!spec.faultService || !spec.services?.[spec.faultService])) ctx.addIssue({ code: 'custom', path: ['faultService'], message: 'A declared fault service is required' });
    for (const [name, fault] of Object.entries(spec.faults ?? {})) {
      if (!spec.services?.[fault.service]?.proxy) ctx.addIssue({ code: 'custom', path: ['faults', name, 'service'], message: 'A fault needs a declared service with proxy' });
    }
    for (const [name, service] of Object.entries(spec.services ?? {})) {
      if (!service.proxy) continue;
      if (service.proxy.probe ? !service.proxy.probe.some(arg => arg.includes('{proxyPort}')) : Array.isArray(service.ready)) {
        ctx.addIssue({ code: 'custom', path: ['services', name, 'proxy', 'probe'], message: 'A proxied service needs HTTP readiness or a proxy.probe command that uses {proxyPort}' });
      }
    }
  } else if (spec.faults || Object.values(spec.services ?? {}).some(service => service.proxy)) {
    ctx.addIssue({ code: 'custom', path: ['faults'], message: 'Network faults need a Docker environment' });
  } else if (!spec.nodeImage || spec.services) {
    ctx.addIssue({ code: 'custom', message: 'Kind requires nodeImage and cannot declare Docker services' });
  }
  if (spec.inotifyMaxUserInstances && !spec.colimaProfile) {
    ctx.addIssue({ code: 'custom', path: ['inotifyMaxUserInstances'], message: 'Runner tuning requires an explicitly named dedicated Colima profile' });
  }
  for (const name of spec.readinessWorkloads ?? []) {
    if (!Object.hasOwn(spec.workloads, name)) ctx.addIssue({ code: 'custom', path: ['readinessWorkloads'], message: `Unknown readiness workload: ${name}` });
  }
  for (const [index, resource] of spec.resources.entries()) {
    if (!kinds.includes(resource.kind) || (resource.metadata.namespace && resource.metadata.namespace !== spec.namespace)) {
      ctx.addIssue({ code: 'custom', path: ['resources', index], message: 'Only supported namespaced resources in the owned namespace are allowed' });
    }
  }
  for (const [name, workload] of Object.entries(spec.workloads)) {
    const boundary = workload.args.indexOf('--');
    const flags = boundary < 0 ? workload.args : workload.args.slice(0, boundary);
    if (spec.provider !== 'docker' && (!verbs.includes(workload.args[0]) || flags.some(arg => /^--(?:kubeconfig|context|server|namespace|all-namespaces|as|token|certificate-authority|client-certificate|client-key)(?:=|$)/.test(arg) || /^-[Ans]/.test(arg)))) {
      ctx.addIssue({ code: 'custom', path: ['workloads', name], message: 'Workloads may not override the owned Kubernetes connection/namespace' });
    }
  }
});
export const environmentStateSchema = z.object({
  version: z.literal(3), id: z.string().regex(/^[a-f0-9]{12}$/), directory: z.string(), spec: environmentSpecSchema,
  clusterName: z.string(), clusterOwned: z.boolean(), kubeconfig: z.string(), phase: z.enum(['creating', 'ready', 'failed', 'destroyed']),
  fault: z.boolean(), generation: z.number().int().nonnegative(),
  processes: z.array(z.object({ pid: z.number().int().positive(), startedAt: z.string(), command: z.string(), args: z.array(z.string()), log: z.string() })),
  urls: z.record(z.string(), z.string()), scenario: changeSpecSchema.optional(), sourceHashes: z.record(z.string(), z.string()).optional(),
  services: z.record(z.string(), z.object({ name: z.string(), port: z.number().int(), owned: z.boolean(), directPort: z.number().int().optional() })).optional(),
  ownershipToken: z.string().optional(),
  network: z.object({ name: z.string(), owned: z.literal(true) }).strict().optional(),
  proxy: z.object({ name: z.string(), apiPort: z.number().int(), token: z.string(), listen: z.record(z.string(), z.number().int()) }).strict().optional(),
  activeFault: z.object({ name: z.string(), healthyMs: z.number(), startedAt: z.string() }).strict().optional(),
  world: z.object({ id: z.string().regex(/^[a-f0-9]{12}$/), directory: z.string() }).strict().optional(),
  privateInputs: z.array(z.string()).optional(),
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { environmentSpecSchema } from '../src/environments/schema.js';
import { manageEnvironment } from '../src/environments/manager.js';
import type { EnvironmentState } from '../src/environments/types.js';

let base: string;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'praman-managed-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });
const spec = {
  name: 'isolated Kubernetes', dockerHost: 'unix:///no-docker.sock', nodeImage: 'kindest/node:v1.37.0', namespace: 'praman-test',
  resources: [{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'seed' }, data: { revision: 'seed' } }], workloads: {},
};
function persist(overrides: Partial<EnvironmentState> = {}) {
  const id = '0123456789ab';
  const directory = join(base, id); mkdirSync(directory);
  const state: EnvironmentState = { version: 3, id, directory, spec, clusterName: `praman-${id}`, clusterOwned: true, kubeconfig: join(directory, 'kubeconfig'), phase: 'ready', fault: true, generation: 0, processes: [], urls: {}, ...overrides };
  writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  return state;
}
describe('managed environment isolation and evidence', () => {
  it('rejects foreign Docker workloads and fault targets, and mixed provider resources', () => {
    const docker = {
      ...spec, provider: 'docker', nodeImage: undefined, resources: [],
      services: { storage: { image: 'minio/minio', port: 9000, ready: { http: '/minio/health/ready' } } },
      faultService: 'storage', workloads: { read: { service: 'storage', args: ['mc', 'ls'] } },
    };
    expect(environmentSpecSchema.safeParse(docker).success).toBe(true);
    expect(environmentSpecSchema.safeParse({ ...docker, faultService: 'foreign' }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...docker, workloads: { read: { service: 'foreign', args: ['mc', 'ls'] } } }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...docker, resources: spec.resources }).success).toBe(false);
  });
  it('keeps application constraints inside integrations instead of accepting app keys in core', () => {
    expect(environmentSpecSchema.safeParse({ ...spec, kan: {} }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...spec, headlamp: {} }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...spec, application: { module: 'external.mjs', config: { arbitrary: true } } }).success).toBe(true);
  });
  it('rejects cluster-scoped seeds and seed namespace escapes', () => {
    expect(environmentSpecSchema.safeParse({ ...spec, resources: [{ apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'unowned' } }] }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...spec, resources: [{ ...spec.resources[0], metadata: { name: 'seed', namespace: 'other' } }] }).success).toBe(false);
  });
  it('requires an explicit dedicated runner before changing its kernel limits', () => {
    expect(environmentSpecSchema.safeParse({ ...spec, inotifyMaxUserInstances: 1024 }).success).toBe(false);
    expect(environmentSpecSchema.safeParse({ ...spec, colimaProfile: 'default', inotifyMaxUserInstances: 1024 }).success).toBe(false);
  });
  it('rejects an unavailable live-service readiness probe instead of declaring readiness', () => {
    expect(environmentSpecSchema.safeParse({ ...spec, readinessWorkloads: ['missing-service-probe'] }).success).toBe(false);
  });
  it('blocks workload connection overrides without blocking commands inside the owned pod', () => {
    for (const flag of ['--context=production', '--kubeconfig=/home/user/config', '-nother', '--all-namespaces']) {
      expect(environmentSpecSchema.safeParse({ ...spec, workloads: { escape: { args: ['get', 'pods', flag] } } }).success).toBe(false);
    }
    expect(environmentSpecSchema.safeParse({ ...spec, workloads: { request: { args: ['exec', 'deployment/web', '--', 'wget', '-qO-', 'http://web:8080'] } } }).success).toBe(true);
  });
  it('refuses teardown when persisted cluster ownership was changed', async () => {
    const state = persist({ clusterName: 'manual-cluster' });
    await expect(manageEnvironment('destroy', { id: state.id, baseDir: base })).rejects.toThrow('ownership');
    expect(JSON.parse(readFileSync(join(state.directory, 'state.json'), 'utf8')).clusterName).toBe('manual-cluster');
  });
  it('cannot pause a cluster after creation refused ownership', async () => {
    const state = persist({ clusterOwned: false, phase: 'failed', fault: false });
    const result = await manageEnvironment('fault', { id: state.id, baseDir: base });
    expect(result.verdict).toBe('insufficient_evidence');
    expect(JSON.parse(readFileSync(join(state.directory, 'state.json'), 'utf8')).fault).toBe(false);
  });
  it('records blocked execution as insufficient evidence while preserving the active fault', async () => {
    const state = persist();
    const result = await manageEnvironment('workload', { id: state.id, baseDir: base, workload: 'read' });
    expect(result.verdict).toBe('insufficient_evidence');
    const saved = JSON.parse(readFileSync(join(state.directory, 'state.json'), 'utf8'));
    expect(saved.fault).toBe(true);
    expect(saved.phase).toBe('ready');
    expect(JSON.parse(readFileSync(join(state.directory, 'operations.jsonl'), 'utf8')).verdict).toBe('insufficient_evidence');
  });
  it('does not execute a destroyed instance', async () => {
    const dead = persist({ phase: 'destroyed', fault: false });
    expect((await manageEnvironment('verify', { id: dead.id, baseDir: base })).verdict).toBe('insufficient_evidence');
    expect(JSON.parse(readFileSync(join(dead.directory, 'state.json'), 'utf8')).phase).toBe('destroyed');
  });
});

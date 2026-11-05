import { setTimeout as delay } from 'node:timers/promises';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnvironmentState, SaveState } from './types.js';
import { z } from 'zod';
import { namespaceSchema, resourceSchema } from './schema.js';
import { command, ensureDockerRunner } from './runtime.js';


export function kubectl(state: EnvironmentState, args: string[], opts: { input?: string; timeoutMs?: number } = {}) {
  return command(state, 'kubectl', ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.clusterName}`, '--namespace', state.spec.namespace, '--request-timeout=15s', ...args], opts);
}
function owned(state: EnvironmentState, requireCreated = true) {
  if (state.clusterName !== `praman-${state.id}` || !/^[a-f0-9]{12}$/.test(state.id) || (requireCreated && !state.clusterOwned)) throw new Error('Refusing non-owned cluster');
}
async function clusters(state: EnvironmentState) {
  return (await command(state, 'kind', ['get', 'clusters'])).trim().split(/\s+/).filter(Boolean);
}
async function waitApi(state: EnvironmentState) {
  const deadline = Date.now() + 90_000;
  let error: unknown;
  do {
    try { await kubectl(state, ['get', '--raw=/readyz'], { timeoutMs: 8_000 }); return; }
    catch (e) { error = e; await delay(500); }
  } while (Date.now() < deadline);
  throw error;
}
async function seed(state: EnvironmentState) {
  await kubectl(state, ['create', 'namespace', state.spec.namespace]);
  const resources = state.spec.resources.map(resource => ({ ...resource, metadata: { ...resource.metadata, namespace: state.spec.namespace } }));
  if (resources.length) await kubectl(state, ['apply', '-f', '-'], { input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items: resources }) });
  for (const resource of resources) {
    const name = resource.metadata.name;
    if (resource.kind === 'Deployment' || resource.kind === 'StatefulSet') {
      await kubectl(state, ['rollout', 'status', `${resource.kind.toLowerCase()}/${name}`, '--timeout=180s'], { timeoutMs: 190_000 });
    } else if (resource.kind === 'Job') {
      await kubectl(state, ['wait', '--for=condition=complete', `job/${name}`, '--timeout=180s'], { timeoutMs: 190_000 });
    } else if (resource.kind === 'Pod') {
      await kubectl(state, ['wait', '--for=condition=Ready', `pod/${name}`, '--timeout=180s'], { timeoutMs: 190_000 });
    }
  }
  const readiness: Array<{ name: string; output: string; observedAt: string }> = [];
  for (const name of state.spec.readinessWorkloads ?? []) {
    const deadline = Date.now() + 90_000;
    while (true) {
      try {
        const output = await kubectl(state, state.spec.workloads[name].args, { timeoutMs: 8_000 });
        readiness.push({ name, output, observedAt: new Date().toISOString() });
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw new Error(`Live service readiness ${name} failed: ${error}`);
        await delay(250);
      }
    }
  }
  writeFileSync(join(state.directory, `readiness-${Date.now()}.json`), JSON.stringify(readiness, null, 2));
}
export async function provisionKind(state: EnvironmentState, save: SaveState) {
  owned(state, false);
  await command(state, 'kind', ['version']);
  await command(state, 'kubectl', ['version', '--client=true']);
  await ensureDockerRunner(state);
  if (state.spec.inotifyMaxUserInstances && state.spec.colimaProfile) {
    const prefix = ['ssh', '--profile', state.spec.colimaProfile, '--'];
    const previous = Number((await command(state, 'colima', [...prefix, 'sysctl', '-n', 'fs.inotify.max_user_instances'])).trim());
    if (!Number.isInteger(previous) || previous <= 0) throw new Error('Cannot establish runner inotify capacity');
    if (previous < state.spec.inotifyMaxUserInstances) {
      await command(state, 'colima', [...prefix, 'sudo', 'sysctl', '-w', `fs.inotify.max_user_instances=${state.spec.inotifyMaxUserInstances}`]);
    }
    const effective = Number((await command(state, 'colima', [...prefix, 'sysctl', '-n', 'fs.inotify.max_user_instances'])).trim());
    if (effective < state.spec.inotifyMaxUserInstances) throw new Error('Dedicated runner inotify capacity was not configured');
    writeFileSync(join(state.directory, 'runner.json'), JSON.stringify({ profile: state.spec.colimaProfile, setting: 'fs.inotify.max_user_instances', previous, effective }, null, 2));
  }
  if ((await clusters(state)).includes(state.clusterName)) throw new Error(`Cluster already exists: ${state.clusterName}; refusing adoption`);
  state.clusterOwned = true;
  save();
  await command(state, 'kind', ['create', 'cluster', '--name', state.clusterName, '--image', state.spec.nodeImage!, '--kubeconfig', state.kubeconfig, '--wait', '180s'], { timeoutMs: 300_000 });
  chmodSync(state.kubeconfig, 0o600);
  await waitApi(state);
  // API readiness does not establish DNS/service-network readiness.
  for (const component of ['daemonset/kindnet', 'daemonset/kube-proxy', 'deployment/coredns']) {
    await kubectl(state, ['--namespace=kube-system', 'rollout', 'status', component, '--timeout=180s'], { timeoutMs: 190_000 });
  }
  await seed(state);
}
export async function observeKind(state: EnvironmentState) {
  owned(state);
  const namespace = namespaceSchema.parse(JSON.parse(await kubectl(state, ['get', 'namespace', state.spec.namespace, '-o', 'json'])));
  const resources = z.object({ items: z.array(resourceSchema) }).parse(JSON.parse(await kubectl(state, ['get', 'configmaps,deployments,statefulsets,pods,services,jobs,persistentvolumeclaims', '-o', 'json'])));
  return { namespace: { name: namespace.metadata.name, uid: namespace.metadata.uid }, resources: resources.items };
}
export async function workloadKind(state: EnvironmentState, name: string) {
  owned(state);
  const workload = state.spec.workloads[name];
  if (!workload) throw new Error(`Unknown workload: ${name}`);
  const output = await kubectl(state, workload.args);
  return { name, output, observed: await observeKind(state) };
}
export async function faultKind(state: EnvironmentState, enabled: boolean, save: SaveState) {
  owned(state);
  const node = `${state.clusterName}-control-plane`;
  if (enabled && !state.fault) await waitApi(state);
  if (enabled) { state.fault = true; save(); }
  const paused = (await command(state, 'docker', ['inspect', '--format', '{{.State.Paused}}', node])).trim() === 'true';
  if (paused !== enabled) await command(state, 'docker', [enabled ? 'pause' : 'unpause', node]);
  const actual = (await command(state, 'docker', ['inspect', '--format', '{{.State.Paused}}', node])).trim() === 'true';
  if (actual !== enabled) throw new Error('Requested dependency fault did not reach the owned container');
  if (enabled) {
    let apiFailure: string | undefined;
    try { await kubectl(state, ['get', '--raw=/readyz', '--request-timeout=3s'], { timeoutMs: 5_000 }); }
    catch (error) { apiFailure = String(error); }
    if (!apiFailure) throw new Error('Container paused but Kubernetes API still responded; no failure effect established');
    return { applied: true, boundary: 'Kubernetes API server container', node, paused: actual, apiAvailable: false, apiFailure };
  }
  await waitApi(state);
  state.fault = false; save();
  return { applied: false, recovered: true, node, paused: actual, apiAvailable: true };
}
export async function resetKind(state: EnvironmentState, save: SaveState) {
  owned(state);
  if (state.fault) await faultKind(state, false, save);
  await kubectl(state, ['delete', 'namespace', state.spec.namespace, '--ignore-not-found=true', '--wait=true', '--timeout=120s']);
  await seed(state);
}
export async function destroyKind(state: EnvironmentState, save: SaveState) {
  owned(state, false);
  if ((await clusters(state)).includes(state.clusterName)) {
    if (!state.clusterOwned) throw new Error('Refusing to delete an existing cluster that this environment did not create');
    if (state.fault) await faultKind(state, false, save);
    await command(state, 'kind', ['delete', 'cluster', '--name', state.clusterName, '--kubeconfig', state.kubeconfig], { timeoutMs: 180_000 });
  }
  if ((await clusters(state)).includes(state.clusterName)) throw new Error('Owned kind cluster still exists after teardown');
  state.fault = false; state.clusterOwned = false; save();
  writeFileSync(join(state.directory, 'teardown.json'), JSON.stringify({ clusterName: state.clusterName, clusterAbsent: true, observedAt: new Date().toISOString() }, null, 2));
}

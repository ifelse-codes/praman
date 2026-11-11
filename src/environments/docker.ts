import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, ensureDockerRunner, freePort } from './runtime.js';
import type { EnvironmentState, SaveState } from './types.js';
import { archiveFile, copyIn, copyOut, loadWorld, worldIdOf, type WorldManifest, type WorldStart } from './world.js';
import { inspectContainer as inspect, ownerLabel as label } from './container.js';
import { createNetwork, destroyProxy, proxiedServices, startProxy } from './proxy.js';
import { checkOutside, destroyOutside, loadRecording, startOutside } from './outside.js';

export async function ownedService(state: EnvironmentState, service: string) {
  const item = state.services?.[service];
  if (!item || !item.owned || item.name !== `praman-${state.id}-${service}` || !state.ownershipToken) throw new Error('Refusing non-owned Docker service');
  const container = await inspect(state, item.name);
  if (container && container.Config.Labels?.[label] !== state.ownershipToken) throw new Error(`Docker ownership label differs for ${service}; refusing adoption or mutation`);
  return { item, container };
}
/** The service's own published port; for a proxied service this bypasses the fault proxy. */
const directPort = (item: { port: number; directPort?: number }) => item.directPort ?? item.port;
async function probe(state: EnvironmentState, service: string) {
  const spec = state.spec.services![service];
  const { item, container } = await ownedService(state, service);
  if (!container?.State.Running || container.State.Paused) throw new Error(`${service} is not running/recovered`);
  if (Array.isArray(spec.ready)) return command(state, 'docker', ['exec', item.name, ...spec.ready], { timeoutMs: 5_000 });
  const url = `http://127.0.0.1:${directPort(item)}${spec.ready.http}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`${service} readiness HTTP ${response.status}`);
  return { url, status: response.status };
}
async function waitService(state: EnvironmentState, service: string) {
  const deadline = Date.now() + 90_000;
  while (true) {
    try { return await probe(state, service); }
    catch (error) { if (Date.now() >= deadline) throw error; await delay(300); }
  }
}
export async function provisionDocker(state: EnvironmentState, save: SaveState): Promise<WorldStart[]> {
  await ensureDockerRunner(state);
  state.ownershipToken ??= randomBytes(24).toString('hex');
  state.services ??= {}; save();
  // A world is verified before any container exists; a changed world starts nothing.
  const world = state.world ? { ref: state.world, manifest: await loadWorld(state.world, state) } : undefined;
  // So is a recording. The recorder is kept across a reset, so only the first provision starts it.
  const startRecorder = !!state.spec.outsideCalls && !state.outside;
  const recording = startRecorder && state.recording ? loadRecording(state.recording) : undefined;
  const starts: WorldStart[] = [];
  // Only a declaration with a proxied service gets an owned network and a fault proxy.
  const network = proxiedServices(state).length ? await createNetwork(state, save) : undefined;
  for (const [name, spec] of Object.entries(state.spec.services!)) {
    const containerName = `praman-${state.id}-${name}`;
    if (await inspect(state, containerName)) throw new Error(`Container ${containerName} exists; refusing adoption`);
    const port = await freePort();
    state.services[name] = { name: containerName, port, owned: true }; save();
    // No host mounts. Docker owns each container's writable state; a world is copied in before start.
    const options = ['--name', containerName, '--label', `${label}=${state.ownershipToken}`, ...(network ? ['--network', network] : []),
      '-p', `127.0.0.1:${port}:${spec.port}`, ...Object.entries(spec.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]), spec.image, ...(spec.args ?? [])];
    const entry = world?.manifest.services[name];
    if (world && entry) {
      await command(state, 'docker', ['create', ...options], { timeoutMs: 300_000 });
      await copyIn(state, containerName, dirname(entry.dataPath), archiveFile(world.ref.directory, name));
      const restored = await copyOut(state, containerName, entry.dataPath);
      const start = { service: name, worldId: world.ref.id, sha256: restored.sha256, matchesWorld: restored.sha256 === entry.sha256 };
      starts.push(start);
      if (!start.matchesWorld) throw new Error(`Restored data of ${name} differs from world ${world.ref.id}; refusing to start`);
      await command(state, 'docker', ['start', containerName]);
    } else await command(state, 'docker', ['run', '-d', ...options], { timeoutMs: 300_000 });
    const readiness = await waitService(state, name);
    writeFileSync(join(state.directory, `${name}-readiness-${Date.now()}.json`), JSON.stringify(readiness, null, 2));
  }
  if (network) await startProxy(state, save);
  if (startRecorder) await startOutside(state, save, recording);
  else if (state.outside) await checkOutside(state);
  return starts;
}
/**
 * Saves the data paths of the declared services as a hashed world under `<worlds>/<id>`. Each
 * service is stopped for its copy and started again, so the copy is a cleanly stopped state.
 */
export async function saveWorldDocker(state: EnvironmentState, worldsDirectory: string) {
  const names = Object.entries(state.spec.services!).filter(([, service]) => service.dataPath).map(([name]) => name);
  if (!names.length) throw new Error('No service declares dataPath; there is nothing to save as a world');
  const staging = join(worldsDirectory, `.saving-${randomBytes(6).toString('hex')}`);
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  const manifest: WorldManifest = { version: 1, services: {} };
  try {
    for (const name of names) {
      const { item, container } = await ownedService(state, name);
      if (!container) throw new Error(`Service ${name} is missing`);
      const spec = state.spec.services![name];
      await command(state, 'docker', ['stop', '--time', '30', item.name], { timeoutMs: 60_000 });
      try {
        const copied = await copyOut(state, item.name, spec.dataPath!, archiveFile(staging, name));
        manifest.services[name] = { image: spec.image, dataPath: spec.dataPath!, bytes: copied.bytes, sha256: copied.sha256 };
      } finally {
        await command(state, 'docker', ['start', item.name]);
        await waitService(state, name);
      }
    }
    const id = worldIdOf(manifest);
    writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    const directory = join(worldsDirectory, id);
    rmSync(directory, { recursive: true, force: true });
    renameSync(staging, directory);
    return { id, directory, manifest };
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
}
export async function observeDocker(state: EnvironmentState) {
  const services: Record<string, unknown> = {};
  for (const name of Object.keys(state.spec.services!)) {
    const { item, container } = await ownedService(state, name);
    if (!container) throw new Error(`Managed service missing: ${name}`);
    services[name] = { name: item.name, id: container.Id, image: container.Image, port: item.port, running: container.State.Running, paused: container.State.Paused };
  }
  return services;
}
export async function workloadDocker(state: EnvironmentState, name: string) {
  const workload = state.spec.workloads[name];
  if (!workload?.service) throw new Error(`Unknown Docker workload: ${name}`);
  const { item, container } = await ownedService(state, workload.service);
  if (!container?.State.Running || container.State.Paused) throw new Error('Workload dependency unavailable');
  const output = await command(state, 'docker', ['exec', '-i', item.name, ...workload.args], { input: workload.input });
  return { name, output, observed: await observeDocker(state) };
}
export async function faultDocker(state: EnvironmentState, enabled: boolean, save: SaveState) {
  const name = state.spec.faultService!;
  const { item, container } = await ownedService(state, name);
  if (!container) throw new Error('Fault target missing');
  if (enabled && !state.fault) await probe(state, name);
  if (enabled) { state.fault = true; save(); }
  if (container.State.Paused) await command(state, 'docker', ['unpause', item.name]);
  if (container.State.Running === enabled) await command(state, 'docker', enabled ? ['stop', '--time', '2', item.name] : ['start', item.name]);
  const actual = await ownedService(state, name);
  if (!actual.container || actual.container.State.Running === enabled) throw new Error('Dependency fault/recovery not applied');
  if (enabled) {
    let effect: string | undefined;
    const readiness = state.spec.services![name].ready;
    const endpoint = Array.isArray(readiness) ? undefined : `http://127.0.0.1:${directPort(item)}${readiness.http}`;
    if (endpoint) {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(3_000) });
        if (response.ok) throw new Error('Stopped dependency still responded successfully');
        effect = `HTTP ${response.status}`;
      } catch (error) {
        if (String(error).includes('still responded')) throw error;
        effect = String(error);
      }
    } else if (Array.isArray(readiness)) {
      try { await command(state, 'docker', ['exec', item.name, ...readiness], { timeoutMs: 5_000 }); throw new Error('Stopped dependency still responded'); }
      catch (error) { if (String(error).includes('still responded')) throw error; effect = String(error); }
    }
    if (!effect) throw new Error('No actual dependency failure observed');
    return { applied: true, service: name, container: item.name, stopped: true, available: false, effect, endpoint };
  }
  const readiness = await waitService(state, name);
  state.fault = false; save();
  return { applied: false, recovered: true, service: name, readiness };
}
/** `keepOutside` (reset and world restores) leaves the outside-call recorder running: the outside world is not the application's data. */
export async function destroyDocker(state: EnvironmentState, save: SaveState, keepOutside = false) {
  const errors: string[] = [];
  if (!keepOutside) try { await destroyOutside(state, save); } catch (error) { errors.push(String(error)); }
  // The proxy goes first so the application loses its dependencies in one step; the network goes last.
  try { await destroyProxy(state, save, 'container'); } catch (error) { errors.push(String(error)); }
  for (const name of Object.keys(state.services ?? {}).reverse()) {
    try {
      const { item, container } = await ownedService(state, name);
      if (container) {
        if (container.State.Paused) await command(state, 'docker', ['unpause', item.name]);
        await command(state, 'docker', ['rm', '-fv', item.name]);
      }
      if (await inspect(state, item.name)) throw new Error(`Container remains: ${item.name}`);
      delete state.services![name]; save();
    } catch (error) { errors.push(String(error)); }
  }
  if (!errors.length) try { await destroyProxy(state, save, 'network'); } catch (error) { errors.push(String(error)); }
  if (errors.length) throw new Error(errors.join('\n'));
  state.services = {}; state.fault = false; delete state.activeFault; save();
  writeFileSync(join(state.directory, 'teardown.json'), JSON.stringify({ containersAbsent: true, observedAt: new Date().toISOString() }, null, 2));
}

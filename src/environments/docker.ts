import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, ensureDockerRunner, freePort } from './runtime.js';
import type { EnvironmentState, SaveState } from './types.js';
import { z } from 'zod';

const containerSchema = z.object({
  Id: z.string(), Image: z.string(), Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
  State: z.object({ Running: z.boolean(), Paused: z.boolean() }),
});

const label = 'io.praman.owner';
async function inspect(state: EnvironmentState, name: string) {
  const ids = (await command(state, 'docker', ['ps', '-aq', '--filter', `name=^/${name}$`])).trim();
  if (!ids) return null;
  return containerSchema.parse(JSON.parse(await command(state, 'docker', ['inspect', name]))[0]);
}
export async function ownedService(state: EnvironmentState, service: string) {
  const item = state.services?.[service];
  if (!item || !item.owned || item.name !== `praman-${state.id}-${service}` || !state.ownershipToken) throw new Error('Refusing non-owned Docker service');
  const container = await inspect(state, item.name);
  if (container && container.Config.Labels?.[label] !== state.ownershipToken) throw new Error(`Docker ownership label differs for ${service}; refusing adoption or mutation`);
  return { item, container };
}
async function probe(state: EnvironmentState, service: string) {
  const spec = state.spec.services![service];
  const { item, container } = await ownedService(state, service);
  if (!container?.State.Running || container.State.Paused) throw new Error(`${service} is not running/recovered`);
  if (Array.isArray(spec.ready)) return command(state, 'docker', ['exec', item.name, ...spec.ready], { timeoutMs: 5_000 });
  const url = `http://127.0.0.1:${item.port}${spec.ready.http}`;
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
export async function provisionDocker(state: EnvironmentState, save: SaveState) {
  await ensureDockerRunner(state);
  state.ownershipToken ??= randomBytes(24).toString('hex');
  state.services ??= {}; save();
  for (const [name, spec] of Object.entries(state.spec.services!)) {
    const containerName = `praman-${state.id}-${name}`;
    if (await inspect(state, containerName)) throw new Error(`Container ${containerName} exists; refusing adoption`);
    const port = await freePort();
    state.services[name] = { name: containerName, port, owned: true }; save();
    // No host mounts or persistent shared volumes. Docker owns each container's writable state.
    await command(state, 'docker', ['run', '-d', '--name', containerName, '--label', `${label}=${state.ownershipToken}`,
      '-p', `127.0.0.1:${port}:${spec.port}`, ...Object.entries(spec.env ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]), spec.image, ...(spec.args ?? [])], { timeoutMs: 300_000 });
    const readiness = await waitService(state, name);
    writeFileSync(join(state.directory, `${name}-readiness-${Date.now()}.json`), JSON.stringify(readiness, null, 2));
  }
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
    const endpoint = Array.isArray(readiness) ? undefined : `http://127.0.0.1:${item.port}${readiness.http}`;
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
export async function destroyDocker(state: EnvironmentState, save: SaveState) {
  const errors: string[] = [];
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
  if (errors.length) throw new Error(errors.join('\n'));
  state.services = {}; state.fault = false; save();
  writeFileSync(join(state.directory, 'teardown.json'), JSON.stringify({ containersAbsent: true, observedAt: new Date().toISOString() }, null, 2));
}

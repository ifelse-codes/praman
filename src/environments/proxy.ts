import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { inspectContainer, inspectNetwork, ownerLabel } from './container.js';
import { command, freePort } from './runtime.js';
import type { EnvironmentState, NetworkFault, SaveState } from './types.js';

/**
 * Network faults through Toxiproxy (Shopify, MIT), run as one owned container per environment.
 * Core knows TCP, HTTP readiness and a declared probe command; it never learns the protocol of a service.
 */
export const proxyImage = 'ghcr.io/shopify/toxiproxy:2.13.0';
const toxicName = 'praman-fault';
const firstListenPort = 20_000;

export const proxiedServices = (state: EnvironmentState) => Object.entries(state.spec.services ?? {}).filter(([, service]) => service.proxy).map(([name]) => name);

export async function createNetwork(state: EnvironmentState, save: SaveState) {
  const name = `praman-${state.id}`;
  if (await inspectNetwork(state, name)) throw new Error(`Network ${name} exists; refusing adoption`);
  state.network = { name, owned: true }; save();
  await command(state, 'docker', ['network', 'create', '--label', `${ownerLabel}=${state.ownershipToken}`, name]);
  return name;
}

async function api(state: EnvironmentState, method: string, path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${state.proxy!.apiPort}${path}`, {
    method, headers: { authorization: `Bearer ${state.proxy!.token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Fault proxy ${method} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const short = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 300);

/** One probe through the proxy: HTTP readiness from the host, or the declared command inside the service container. */
export async function probeProxy(state: EnvironmentState, service: string, timeoutMs: number) {
  const spec = state.spec.services![service];
  const item = state.services![service];
  const started = performance.now();
  try {
    if (spec.proxy!.probe) {
      const args = spec.proxy!.probe.map(arg => arg.replaceAll('{proxyHost}', state.proxy!.name).replaceAll('{proxyPort}', String(state.proxy!.listen[service])));
      await command(state, 'docker', ['exec', item.name, ...args], { timeoutMs });
    } else {
      const ready = spec.ready as { http: string };
      const response = await fetch(`http://127.0.0.1:${item.port}${ready.http}`, { signal: AbortSignal.timeout(timeoutMs) });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - started), error: short(error) };
  }
}

async function waitProbe(state: EnvironmentState, service: string, healthy: (probe: { ok: boolean; ms: number }) => boolean) {
  const deadline = Date.now() + 30_000;
  for (let attempts = 1; ; attempts++) {
    const probe = await probeProxy(state, service, 10_000);
    if (healthy(probe) || Date.now() >= deadline) return { ...probe, attempts };
    await delay(300);
  }
}

export async function startProxy(state: EnvironmentState, save: SaveState) {
  const services = proxiedServices(state);
  const name = `praman-${state.id}--toxiproxy`;
  if (await inspectContainer(state, name)) throw new Error(`Container ${name} exists; refusing adoption`);
  const listen: Record<string, number> = {}, hostPorts: Record<string, number> = {};
  for (const [index, service] of services.entries()) { listen[service] = firstListenPort + index; hostPorts[service] = await freePort(); }
  state.proxy = { name, apiPort: await freePort(), token: randomBytes(24).toString('hex'), listen }; save();
  await command(state, 'docker', ['run', '-d', '--name', name, '--label', `${ownerLabel}=${state.ownershipToken}`, '--network', state.network!.name,
    '-e', `TOXIPROXY_AUTH_TOKEN=${state.proxy.token}`, '-p', `127.0.0.1:${state.proxy.apiPort}:8474`,
    ...services.flatMap(service => ['-p', `127.0.0.1:${hostPorts[service]}:${listen[service]}`]), proxyImage, '-host=0.0.0.0'], { timeoutMs: 300_000 });
  const deadline = Date.now() + 30_000;
  let version: unknown;
  while (true) {
    try { version = await api(state, 'GET', '/version'); break; }
    catch (error) { if (Date.now() >= deadline) throw new Error(`Fault proxy did not answer: ${short(error)}`); await delay(300); }
  }
  const readiness: Record<string, unknown> = {};
  for (const service of services) {
    const item = state.services![service];
    // Docker resolves the container name on the owned network, so a restarted service keeps its address.
    await api(state, 'POST', '/proxies', { name: service, listen: `0.0.0.0:${listen[service]}`, upstream: `${item.name}:${state.spec.services![service].port}`, enabled: true });
    item.directPort = item.port; item.port = hostPorts[service]; save();
    readiness[service] = await waitProbe(state, service, probe => probe.ok);
    if (!(readiness[service] as { ok: boolean }).ok) throw new Error(`${service} is not reachable through the fault proxy: ${(readiness[service] as { error?: string }).error}`);
  }
  writeFileSync(join(state.directory, `proxy-readiness-${Date.now()}.json`), JSON.stringify({ image: proxyImage, version, readiness }, null, 2));
}

/** Removes the owned proxy container (`container`) or the owned network (`network`); unlabelled ones are refused. */
export async function destroyProxy(state: EnvironmentState, save: SaveState, part: 'container' | 'network') {
  if (part === 'container' && state.proxy) {
    const container = await inspectContainer(state, state.proxy.name);
    if (container && container.Config.Labels?.[ownerLabel] !== state.ownershipToken) throw new Error('Fault proxy ownership label differs; refusing removal');
    if (container) await command(state, 'docker', ['rm', '-fv', state.proxy.name]);
    if (await inspectContainer(state, state.proxy.name)) throw new Error(`Container remains: ${state.proxy.name}`);
    delete state.proxy; save();
  }
  if (part === 'network' && state.network) {
    const network = await inspectNetwork(state, state.network.name);
    if (network && network.Labels?.[ownerLabel] !== state.ownershipToken) throw new Error('Network ownership label differs; refusing removal');
    if (network) await command(state, 'docker', ['network', 'rm', state.network.name]);
    if (await inspectNetwork(state, state.network.name)) throw new Error(`Network remains: ${state.network.name}`);
    delete state.network; save();
  }
}

const toxic = (fault: NetworkFault) => fault.kind === 'delay' ? { type: 'latency', attributes: { latency: fault.delayMs, jitter: 0 } }
  : fault.kind === 'timeout' ? { type: 'timeout', attributes: { timeout: fault.timeoutMs } }
  : { type: 'reset_peer', attributes: { timeout: 0 } };
/** For `delay` the probe must be this share of the delay slower than healthy; after removal it must be faster. */
const delayShare = 0.8;
const added = (fault: NetworkFault, probe: { ms: number }, healthyMs: number) => fault.kind === 'delay' && probe.ms - healthyMs >= delayShare * fault.delayMs;

export function declaredFault(state: EnvironmentState, name: string) {
  const fault = state.spec.faults?.[name];
  if (!fault) throw new Error(`Unknown fault "${name}"; declare it under faults`);
  if (!state.proxy) throw new Error('The fault proxy is not running');
  return fault;
}

/** Applies a named fault and observes its effect through the proxy; an unobserved effect throws. */
export async function applyFault(state: EnvironmentState, name: string, save: SaveState) {
  const fault = declaredFault(state, name);
  if (state.fault) throw new Error('A fault is already active; recover first');
  const healthy = await probeProxy(state, fault.service, 10_000);
  if (!healthy.ok) throw new Error(`${fault.service} is not healthy through the proxy before the fault: ${healthy.error}`);
  state.fault = true; state.activeFault = { name, healthyMs: healthy.ms, startedAt: new Date().toISOString() }; save();
  if (fault.kind === 'down') await api(state, 'POST', `/proxies/${fault.service}`, { enabled: false });
  else await api(state, 'POST', `/proxies/${fault.service}/toxics`, { name: toxicName, stream: 'downstream', toxicity: 1, ...toxic(fault) });
  const shown = await api(state, 'GET', `/proxies/${fault.service}`) as { enabled: boolean; toxics: Array<{ name: string; type: string; attributes: unknown }> };
  const applied = fault.kind === 'down' ? shown.enabled === false : shown.toxics.find(row => row.name === toxicName && row.type === toxic(fault).type);
  if (!applied) throw new Error(`The fault proxy does not show fault "${name}"`);
  const timeoutMs = fault.kind === 'delay' ? 4 * fault.delayMs + 10_000 : fault.kind === 'timeout' ? fault.timeoutMs + 10_000 : 10_000;
  const during = await probeProxy(state, fault.service, timeoutMs);
  const observed = fault.kind === 'delay' ? during.ok && added(fault, during, healthy.ms) : !during.ok;
  const effect = fault.kind === 'delay'
    ? `probe ${during.ok ? 'answered' : 'failed'} in ${during.ms} ms, ${during.ms - healthy.ms} ms slower than healthy (${healthy.ms} ms); delay ${fault.delayMs} ms`
    : `probe ${during.ok ? 'answered' : 'failed'} after ${during.ms} ms${during.error ? `: ${during.error}` : ''}`;
  if (!observed) throw new Error(`Fault "${name}" was applied but its effect was not observed (${effect})`);
  return { fault: name, kind: fault.kind, service: fault.service, applied: true, healthy, during, effect };
}

/** Removes the active named fault and observes recovery through the proxy; unobserved recovery throws. */
export async function removeFault(state: EnvironmentState, save: SaveState) {
  const active = state.activeFault;
  if (!active) throw new Error('No named fault is active');
  const fault = declaredFault(state, active.name);
  const activeMs = Date.now() - Date.parse(active.startedAt);
  if (fault.kind === 'down') await api(state, 'POST', `/proxies/${fault.service}`, { enabled: true });
  else {
    try { await api(state, 'DELETE', `/proxies/${fault.service}/toxics/${toxicName}`); }
    catch (error) { if (!short(error).includes('HTTP 404')) throw error; }
  }
  const shown = await api(state, 'GET', `/proxies/${fault.service}`) as { enabled: boolean; toxics: Array<{ name: string }> };
  if (!shown.enabled || shown.toxics.some(row => row.name === toxicName)) throw new Error(`The fault proxy still shows fault "${active.name}"`);
  const recovery = await waitProbe(state, fault.service, probe => probe.ok && !added(fault, probe, active.healthyMs));
  if (!recovery.ok || added(fault, recovery, active.healthyMs)) throw new Error(`Fault "${active.name}" was removed but recovery was not observed (probe ${recovery.ok ? 'answered' : 'failed'} in ${recovery.ms} ms)`);
  state.fault = false; delete state.activeFault; save();
  return { fault: active.name, kind: fault.kind, service: fault.service, removed: true, activeMs, recovery };
}

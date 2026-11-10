import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { manageEnvironment } from '../src/environments/manager.js';
import { environmentSpecSchema } from '../src/environments/schema.js';
import { changeSpecSchema } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';

// A fake `docker` on PATH keeps containers and networks as JSON files. The fault proxy image starts a
// small fake Toxiproxy API in the background; the probe command reads the proxy state and behaves like a
// client of the proxied service would (slower, hanging or refused). No Docker daemon, no real proxy.
const fakeProxy = `
const http = require('node:http'); const fs = require('node:fs');
const [port, stateFile, token] = process.argv.slice(2);
const state = { proxies: {} }; const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
save();
http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    const send = (code, value) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
    if (req.headers.authorization !== 'Bearer ' + token) return send(401, { error: 'missing or invalid auth token' });
    const parts = req.url.split('/').filter(Boolean); const input = body ? JSON.parse(body) : {};
    if (req.url === '/version') return send(200, { version: 'fake' });
    if (parts[0] !== 'proxies') return send(404, {});
    if (parts.length === 1 && req.method === 'POST') { state.proxies[input.name] = { ...input, toxics: [] }; save(); return send(201, state.proxies[input.name]); }
    const proxy = state.proxies[parts[1]]; if (!proxy) return send(404, {});
    if (parts.length === 2 && req.method === 'GET') return send(200, proxy);
    if (parts.length === 2 && req.method === 'POST') { Object.assign(proxy, input); save(); return send(200, proxy); }
    if (parts.length === 3 && req.method === 'POST') { proxy.toxics.push(input); save(); return send(200, input); }
    if (parts.length === 4 && req.method === 'DELETE') { const before = proxy.toxics.length; proxy.toxics = proxy.toxics.filter(t => t.name !== parts[3]); save(); return send(before === proxy.toxics.length ? 404 : 204); }
    send(404, {});
  });
}).listen(Number(port), '127.0.0.1');
`;
const fakeDocker = `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path'); const { spawn } = require('node:child_process');
const root = process.env.FAKE_DOCKER; const args = process.argv.slice(2);
const file = name => path.join(root, name + '.json'); const net = name => path.join(root, 'network-' + name + '.json');
const load = name => fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : null;
const save = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
const fail = message => { console.error(message); process.exit(1); };
const flag = name => args[args.indexOf(name) + 1];
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const cmd = args[0];
fs.appendFileSync(path.join(root, 'calls.log'), args.join(' ') + '\\n');
if (cmd === 'info') console.log('fake');
else if (cmd === 'network' && args[1] === 'ls') console.log(fs.readdirSync(root).filter(f => f.startsWith('network-')).map(f => f.slice(8, -5)).join('\\n'));
else if (cmd === 'network' && args[1] === 'create') { const name = args[args.length - 1]; if (fs.existsSync(net(name))) fail('exists'); fs.writeFileSync(net(name), JSON.stringify({ Labels: { 'io.praman.owner': flag('--label').split('=')[1] } })); }
else if (cmd === 'network' && args[1] === 'inspect') console.log(JSON.stringify([JSON.parse(fs.readFileSync(net(args[2]), 'utf8'))]));
else if (cmd === 'network' && args[1] === 'rm') fs.unlinkSync(net(args[2]));
else if (cmd === 'ps') { const name = args[args.length - 1].replace('name=^/', '').replace('$', ''); if (load(name)) console.log('fakeid'); }
else if (cmd === 'inspect') { const c = load(args[1]); console.log(JSON.stringify([{ Id: 'fakeid', Image: 'sha256:fake', Config: { Labels: c.labels }, State: { Running: c.running, Paused: false } }])); }
else if (cmd === 'run' || cmd === 'create') {
  const name = flag('--name'); if (load(name)) fail('exists');
  const network = args.includes('--network') ? flag('--network') : undefined;
  if (network && !fs.existsSync(net(network))) fail('no such network');
  const value = { labels: { 'io.praman.owner': flag('--label').split('=')[1] }, running: cmd === 'run', data: 'seed', network };
  if (args.some(a => a.includes('toxiproxy:'))) {
    const api = args.find(a => a.endsWith(':8474')).split(':')[1]; const token = args.find(a => a.startsWith('TOXIPROXY_AUTH_TOKEN=')).split('=')[1];
    const child = spawn(process.execPath, [path.join(root, '..', 'bin', 'fake-proxy.cjs'), api, path.join(root, 'proxy-state.json'), token], { detached: true, stdio: 'ignore' });
    child.unref(); value.pid = child.pid; fs.appendFileSync(path.join(root, 'pids'), child.pid + '\\n');
  }
  save(name, value);
}
else if (cmd === 'start' || cmd === 'stop') { const name = args[args.length - 1]; const c = load(name); if (!c) fail('missing'); c.running = cmd === 'start'; save(name, c); }
else if (cmd === 'exec') {
  const c = load(args[1]); if (!c || !c.running) process.exit(1);
  if (args[2] === 'probe-through') {
    const listen = args[4]; const inert = fs.existsSync(path.join(root, 'inert'));
    const state = JSON.parse(fs.readFileSync(path.join(root, 'proxy-state.json'), 'utf8'));
    const proxy = Object.values(state.proxies).find(p => p.listen.endsWith(':' + listen)); if (!proxy) process.exit(2);
    if (inert) process.exit(0);
    if (!proxy.enabled) process.exit(2);
    for (const t of proxy.toxics) {
      if (t.type === 'latency') sleep(2 * t.attributes.latency);
      if (t.type === 'timeout') { sleep(t.attributes.timeout); process.exit(2); }
      if (t.type === 'reset_peer') process.exit(2);
    }
  }
  process.exit(0);
}
else if (cmd === 'rm') { const name = args[args.length - 1]; const c = load(name); if (c && c.pid) { try { process.kill(c.pid); } catch {} } fs.unlinkSync(file(name)); }
else fail('unsupported ' + cmd);
`;

let base: string, bin: string, fake: string, oldPath: string | undefined, servers: Server[];
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'praman-faults-'));
  bin = join(base, 'bin'); fake = join(base, 'fake'); mkdirSync(bin); mkdirSync(fake);
  writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
  writeFileSync(join(bin, 'fake-proxy.cjs'), fakeProxy);
  oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`; process.env.FAKE_DOCKER = fake;
  servers = [];
});
afterEach(() => {
  const pids = existsSync(join(fake, 'pids')) ? readFileSync(join(fake, 'pids'), 'utf8').split('\n').filter(Boolean) : [];
  for (const pid of pids) { try { process.kill(Number(pid)); } catch { /* already stopped */ } }
  process.env.PATH = oldPath; delete process.env.FAKE_DOCKER; servers.forEach(server => server.close());
  rmSync(base, { recursive: true, force: true });
});

const faults = { 'db-slow': { service: 'db', kind: 'delay', delayMs: 300 }, 'db-hang': { service: 'db', kind: 'timeout', timeoutMs: 300 }, 'db-drop': { service: 'db', kind: 'drop' }, 'db-down': { service: 'db', kind: 'down' } };
const declaration = (extra: Record<string, unknown> = {}) => ({
  name: 'faults', provider: 'docker', dockerHost: 'unix:///no-docker.sock', namespace: 'praman-test', resources: [], workloads: {},
  services: { db: { image: 'fake/db:1', port: 5432, ready: ['true'], proxy: { probe: ['probe-through', '{proxyHost}', '{proxyPort}'] } } }, faults, ...extra,
});
const write = (name: string, value: unknown) => { const path = join(base, name); writeFileSync(path, JSON.stringify(value)); return path; };
type Result = { verdict: string; id: string; evidence: any };
const created = async (specPath: string) => manageEnvironment('create', { specPath, baseDir: base }) as Promise<Result>;
const state = (id: string) => JSON.parse(readFileSync(join(base, id, 'state.json'), 'utf8'));
const operations = (id: string) => readFileSync(join(base, id, 'operations.jsonl'), 'utf8');
const owned = () => readdirSync(fake).filter(name => name.startsWith('praman-') || name.startsWith('network-'));

describe('network faults: declaration', () => {
  it('accepts proxied services and named faults; keeps old declarations valid', () => {
    expect(environmentSpecSchema.safeParse(declaration()).success).toBe(true);
    const old = { ...declaration(), services: { db: { image: 'x', port: 1, ready: ['true'] } }, faultService: 'db' };
    delete (old as Record<string, unknown>).faults;
    expect(environmentSpecSchema.safeParse(old).success).toBe(true);
  });
  it.each([
    ['a fault on a service without proxy', { services: { db: { image: 'x', port: 1, ready: ['true'] } } }],
    ['command readiness without a probe through the proxy', { services: { db: { image: 'x', port: 1, ready: ['true'], proxy: { probe: ['pg_isready'] } } } }],
    ['command readiness and no probe', { services: { db: { image: 'x', port: 1, ready: ['true'], proxy: {} } } }],
    ['an unknown fault kind', { faults: { x: { service: 'db', kind: 'slow' } } }],
    ['a delay below 100 ms', { faults: { x: { service: 'db', kind: 'delay', delayMs: 10 } } }],
    ['no faults and no faultService', { faults: {} }],
  ])('rejects %s', (_name, extra) => {
    expect(environmentSpecSchema.safeParse(declaration(extra)).success).toBe(false);
  });
  it('accepts an HTTP-ready proxied service without a probe', () => {
    expect(environmentSpecSchema.safeParse(declaration({ services: { web: { image: 'x', port: 80, ready: { http: '/health' }, proxy: {} } }, faults: { 'web-down': { service: 'web', kind: 'down' } } })).success).toBe(true);
  });
  it('resolves scenario fault windows by step id and refuses overlapping or unknown windows', () => {
    const scenario = (windows: unknown) => ({ title: 't', mode: 'acceptance', change: 'c', afterUrl: 'http://127.0.0.1:9/',
      steps: [{ id: 'a', action: 'goto', path: '/', note: 'n' }, { id: 'b', action: 'goto', path: '/', note: 'n' }, { id: 'c', action: 'goto', path: '/', note: 'n' }],
      checks: [{ id: 'x', kind: 'pageErrors', equals: 0 }], faults: windows });
    expect(changeSpecSchema.parse(scenario([{ name: 'db-slow', fromStep: 'a', throughStep: 'b' }, { name: 'db-down', fromStep: 'c', throughStep: 2 }])).faults)
      .toEqual([{ name: 'db-slow', fromStep: 0, throughStep: 1 }, { name: 'db-down', fromStep: 2, throughStep: 2 }]);
    expect(changeSpecSchema.safeParse(scenario([{ name: 'db-slow', fromStep: 'a', throughStep: 'b' }, { name: 'db-down', fromStep: 'b', throughStep: 'c' }])).success).toBe(false);
    expect(changeSpecSchema.safeParse(scenario([{ name: 'db-slow', fromStep: 'b', throughStep: 'a' }])).success).toBe(false);
    expect(changeSpecSchema.safeParse(scenario([{ name: 'db-slow', fromStep: 'missing', throughStep: 'a' }])).success).toBe(false);
    const { faults: _none, ...old } = scenario(undefined);
    expect('faults' in changeSpecSchema.parse(old)).toBe(false);
  });
});

describe('network faults: proxy lifecycle', () => {
  it('puts an owned proxy between the application port and the service, and removes it with the network', async () => {
    const env = await created(write('env.json', declaration()));
    expect(env.verdict).toBe('passed');
    const saved = state(env.id);
    expect(saved.network).toEqual({ name: `praman-${env.id}`, owned: true });
    expect(saved.services.db.directPort).toBeTypeOf('number');
    expect(saved.services.db.port).not.toBe(saved.services.db.directPort);
    const proxy = JSON.parse(readFileSync(join(fake, 'proxy-state.json'), 'utf8')).proxies.db;
    expect(proxy).toMatchObject({ upstream: `praman-${env.id}-db:5432`, enabled: true });
    expect(JSON.parse(readFileSync(join(fake, `praman-${env.id}-db.json`), 'utf8')).network).toBe(`praman-${env.id}`);
    expect(JSON.stringify(env)).not.toContain(saved.proxy.token);

    const destroyed = await manageEnvironment('destroy', { id: env.id, baseDir: base });
    expect(destroyed.verdict).toBe('passed');
    expect(owned()).toEqual([]);
    expect(state(env.id).proxy).toBeUndefined();
  });

  it('starts no network and no proxy for a declaration without proxy', async () => {
    const env = await created(write('env.json', { ...declaration(), services: { db: { image: 'x', port: 1, ready: ['true'] } }, faults: undefined, faultService: 'db' }));
    expect(env.verdict).toBe('passed');
    expect(owned()).toEqual([`praman-${env.id}-db.json`]);
    expect(readFileSync(join(fake, 'calls.log'), 'utf8')).not.toMatch(/network create|--network/);
  });

  it('refuses to remove a network whose ownership label differs', async () => {
    const env = await created(write('env.json', declaration()));
    writeFileSync(join(fake, `network-praman-${env.id}.json`), JSON.stringify({ Labels: { 'io.praman.owner': 'someone-else' } }));
    const destroyed = await manageEnvironment('destroy', { id: env.id, baseDir: base });
    expect(destroyed.verdict).toBe('insufficient_evidence');
    expect(existsSync(join(fake, `network-praman-${env.id}.json`))).toBe(true);
  });
});

describe('network faults: named faults', () => {
  it.each(Object.keys(faults))('applies %s, observes its effect and observes recovery', async name => {
    const env = await created(write('env.json', declaration()));
    const applied = await manageEnvironment('fault', { id: env.id, baseDir: base, fault: name }) as Result;
    expect(applied.verdict).toBe('passed');
    expect(applied.evidence).toMatchObject({ fault: name, applied: true, healthy: { ok: true } });
    if (name === 'db-slow') expect(applied.evidence.during.ok).toBe(true);
    else expect(applied.evidence.during.ok).toBe(false);
    expect(state(env.id)).toMatchObject({ fault: true, activeFault: { name } });
    const blocked = await manageEnvironment('verify', { id: env.id, baseDir: base });
    expect(blocked.verdict).toBe('insufficient_evidence');

    const recovered = await manageEnvironment('recover', { id: env.id, baseDir: base }) as Result;
    expect(recovered.verdict).toBe('passed');
    expect(recovered.evidence).toMatchObject({ fault: name, removed: true, recovery: { ok: true } });
    expect(state(env.id).fault).toBe(false);
    expect(state(env.id).activeFault).toBeUndefined();
  });

  it('is not proven when the proxy shows the fault but the probe sees no effect', async () => {
    const env = await created(write('env.json', declaration()));
    writeFileSync(join(fake, 'inert'), '');
    for (const name of Object.keys(faults)) {
      const applied = await manageEnvironment('fault', { id: env.id, baseDir: base, fault: name }) as Result;
      expect(applied.verdict).toBe('insufficient_evidence');
      expect(operations(env.id).split('\n').filter(Boolean).at(-1)).toContain('effect was not observed');
      rmSync(join(fake, 'inert'));
      expect((await manageEnvironment('recover', { id: env.id, baseDir: base })).verdict).toBe('passed');
      writeFileSync(join(fake, 'inert'), '');
    }
  });

  it('refuses an undeclared fault name and an unnamed fault without faultService', async () => {
    const env = await created(write('env.json', declaration()));
    const unknown = await manageEnvironment('fault', { id: env.id, baseDir: base, fault: 'db-missing' }) as Result;
    expect(unknown.verdict).toBe('insufficient_evidence');
    expect(operations(env.id)).toContain('Unknown fault');
    const unnamed = await manageEnvironment('fault', { id: env.id, baseDir: base }) as Result;
    expect(unnamed.verdict).toBe('insufficient_evidence');
    expect(state(env.id).fault).toBe(false);
  });
});

describe('network faults: windows at step ids', () => {
  async function app() {
    const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>t</title><p id="ok">ok</p>'); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const integration = `
const integration = {
  configure: config => config,
  start: async (state, save) => { state.urls.app = state.spec.application.config.url; if (state.scenario) state.scenario.afterUrl = state.urls.app + '/'; save(); },
  observe: async state => ({ dbPort: state.services.db.port }),
  reset: async (state, save, resetInfrastructure) => { await resetInfrastructure(); await integration.start(state, save); },
};
export default integration;`;
  const scenario = (url: string, windows: unknown) => ({
    title: 'Faults at step ids', mode: 'acceptance', change: 'The page answers while the dependency is slow or down', afterUrl: `${url}/`, repeats: 2,
    steps: [{ id: 'open', action: 'goto', path: '/', note: 'Open' }, { id: 'slow', action: 'goto', path: '/', note: 'Reload while slow' }, { id: 'down', action: 'goto', path: '/', note: 'Reload while down' }],
    checks: [{ id: 'ok', kind: 'text', selector: '#ok', equals: 'ok', afterStep: 'down' }], faults: windows,
  });
  async function setup(windows: unknown, extra: Record<string, unknown> = {}) {
    const url = await app();
    writeFileSync(join(base, 'integration.mjs'), integration);
    writeFileSync(join(base, 'scenario.json'), JSON.stringify(scenario(url, windows)));
    return created(write('env.json', declaration({ application: { module: './integration.mjs', config: { url } }, scenario: './scenario.json', ...extra })));
  }
  const windows = [{ name: 'db-slow', fromStep: 'slow', throughStep: 'slow' }, { name: 'db-down', fromStep: 'down', throughStep: 'down' }];

  it('applies each window in every repeat, records applied and removed, and leaves no fault active', async () => {
    const env = await setup(windows);
    expect(env.verdict).toBe('passed');
    const result = await manageEnvironment('verify', { id: env.id, baseDir: base }) as Result;
    expect(result.verdict).toBe('passed');
    const proof = JSON.parse(readFileSync(join(result.evidence.output, 'proof.json'), 'utf8'));
    for (const run of proof.after) {
      expect(run.faults.map((row: { name: string }) => row.name)).toEqual(['db-slow', 'db-down']);
      for (const row of run.faults) expect(row).toMatchObject({ applied: { applied: true }, removed: { removed: true, recovery: { ok: true } } });
      expect(run.faults[0]).toMatchObject({ fromStep: 1, throughStep: 1 });
    }
    expect(JSON.parse(readFileSync(join(result.evidence.output, 'after-1', 'result.json'), 'utf8')).faults).toHaveLength(2);
    const summary = { verdict: 'passed', windows: [{ name: 'db-slow', applied: true, removed: true }, { name: 'db-down', applied: true, removed: true }] };
    expect(result.evidence.faultWindows).toEqual({ repeats: [summary, summary] });
    expect(Object.keys(result.evidence).indexOf('faultWindows')).toBeLessThan(Object.keys(result.evidence).indexOf('proof'));
    const last = Object.keys(result).at(-1);
    expect(last).toBe('faultSummary');
    expect((result as unknown as { faultSummary: string }).faultSummary).toBe('repeat 1 passed: db-slow applied and removed, db-down applied and removed; repeat 2 passed: db-slow applied and removed, db-down applied and removed');
    expect(state(env.id).fault).toBe(false);
  });

  it('is not proven when a window\'s effect is not observed, and the fault is still removed', async () => {
    const env = await setup(windows);
    writeFileSync(join(fake, 'inert'), '');
    const result = await manageEnvironment('verify', { id: env.id, baseDir: base }) as Result;
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.evidence.proof.after.every((run: { verdict: string }) => run.verdict === 'insufficient_evidence')).toBe(true);
    expect(state(env.id).fault).toBe(false);
    expect(state(env.id).activeFault).toBeUndefined();
  });

  it('refuses a scenario that names a fault the environment does not declare', async () => {
    const env = await setup([{ name: 'db-missing', fromStep: 'slow', throughStep: 'slow' }]);
    expect(env.verdict).toBe('insufficient_evidence');
    expect(operations(env.id)).toContain('does not declare');
    expect(owned()).toEqual([]);
  });

  it('never runs fault windows outside a managed environment', async () => {
    const out = join(base, 'unmanaged');
    const result = await proveChange(changeSpecSchema.parse(scenario('http://127.0.0.1:9', windows)), out);
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.proof.after.every(run => run.error?.includes('managed environment'))).toBe(true);
    expect(existsSync(join(out, 'after-1'))).toBe(false);
  });
});

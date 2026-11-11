import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { manageEnvironment } from '../src/environments/manager.js';
import { environmentSpecSchema } from '../src/environments/schema.js';
import { changeSpecSchema } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';

// A fixed, throwaway test CA certificate (no key is kept anywhere); the fake recorder hands it out as its CA.
const testCa = `-----BEGIN CERTIFICATE-----
MIIDLjCCAhagAwIBAgIUIBSBSQAflQcSq4D426/SZaHUhM4wDQYJKoZIhvcNAQEL
BQAwLzEUMBIGA1UECgwLUFJBTUFOIHRlc3QxFzAVBgNVBAMMDnByYW1hbi50ZXN0
LmNhMB4XDTI2MTExMTE0MDQxOFoXDTM2MTEwODE0MDQxOFowLzEUMBIGA1UECgwL
UFJBTUFOIHRlc3QxFzAVBgNVBAMMDnByYW1hbi50ZXN0LmNhMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvR6D9AJ7HdReVDLgh37wX3yycyfTPt2TxlpS
juH/f5nn65gLZe+LI+iXsZ1hkYB/MR6ENHQAIo47JhGPJ9nqFUxR3bqWEArfXDpV
YY7WhJ3bnMHqmxYo1LFH5agaLegbHzsLIjOM3bM1ygZGbXKJ4iBcjc8lZBmnfcre
MVZpXz9mGH938csV7jDe4x0O4+Ws5JVGgg9zsjJrnjH2ai/tFl/6jUSdOgI+Pg5H
Q9pRCQRspgPiJzxnMAKSgfkoneETlzIV9MP+i7IiQQ4YidzJHpHMzU8nPDd6UtUX
sc8/OKqDwyF218jwXHCWBW/hs5AbvSqlMNxcFIfcWVZGTtteKwIDAQABo0IwQDAd
BgNVHQ4EFgQUWIaKFVhVIdQiXP92rMH+2F24z/EwDwYDVR0TAQH/BAUwAwEB/zAO
BgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBACJiC5qsLif0R/URdIbk
cfmMt8G0pD0Vv8+NV7jqHX7qgmzwAlqA8o53JXq1VS+Qdx+Cu55rxRvWdHczx5Du
QmrODD/0erny1xywo3YJa9aI3qWsv68dPgzTN4AgLdNSNSWN8yzjUESFpvvgLgfB
3GjaOQfDuwwdo8HaP5V6hk4R1MThK5ktlmFbFJrnmcArAkcLv1uFA4B8gSocEEYR
IAvuPBVJec9X6CJA10yMevrweaeQXQlMWEXVarlL/1DYqMKRm306VvWmLZEmGOpO
RC+4fmqzkEp74NE7LgRqQTAafmHz/R5/szx3rhSeIpE1Pj0OAS0CF9wRdB7Y+GMp
+F0=
-----END CERTIFICATE-----
`;

// A fake Hoverfly: an admin API (token sign-in, mode, simulation, journal) and an HTTP forward proxy that
// records (capture) or replays (simulate). Hosts with special meaning: `down.test` (the real service fails)
// and `tls-untrusted.test` (the client rejects the CA: only a log line, no journal entry).
const fakeRecorder = `
const http = require('node:http'); const fs = require('node:fs');
const [adminPort, proxyPort, password, startMode, log] = process.argv.slice(2);
let mode = startMode; let pairs = []; let journal = [];
const token = 'tok-' + password;
http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    const send = (code, value) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
    const url = new URL(req.url, 'http://admin');
    if (url.pathname === '/api/token-auth') { const input = JSON.parse(body); return input.username === 'praman' && input.password === password ? send(200, { token }) : send(401, {}); }
    if (req.headers.authorization !== 'Bearer ' + token) return send(401, { error: 'unauthorized' });
    if (url.pathname === '/api/v2/hoverfly/mode') return send(200, { mode });
    if (url.pathname === '/api/v2/simulation' && req.method === 'GET') return send(200, { data: { pairs }, meta: { schemaVersion: 'v5.3' } });
    if (url.pathname === '/api/v2/simulation' && req.method === 'PUT') { pairs = JSON.parse(body).data.pairs; return send(200, {}); }
    if (url.pathname === '/api/v2/journal' && req.method === 'DELETE') { journal = []; return send(200, {}); }
    if (url.pathname === '/api/v2/journal') { const offset = Number(url.searchParams.get('offset')); const limit = Number(url.searchParams.get('limit'));
      return send(200, { journal: journal.slice(offset, offset + limit), total: journal.length, offset, limit }); }
    send(404, {});
  });
}).listen(Number(adminPort), '127.0.0.1');
http.createServer((req, res) => {
  if (req.headers['proxy-authorization'] !== 'Basic ' + Buffer.from('praman:' + password).toString('base64')) { res.writeHead(407); return res.end(); }
  const target = new URL(req.url);
  if (target.hostname === 'tls-untrusted.test') { fs.appendFileSync(log, 'WARN: Cannot handshake client tls-untrusted.test:443 remote error: tls: unknown certificate authority\\n'); return req.socket.destroy(); }
  const request = { method: req.method, scheme: 'http', destination: target.host, path: target.pathname, query: {} };
  let response;
  const key = p => p.request.destination + p.request.path;
  if (mode === 'capture') {
    response = target.hostname === 'down.test' ? { status: 502, body: 'Hoverfly Error!\\n\\nThere was an error when forwarding the request' } : { status: 200, body: 'outside page ' + target.pathname };
    if (response.status === 200 && !pairs.some(p => key(p) === key({ request }))) pairs.push({ request, response });
  } else {
    const pair = pairs.find(p => key(p) === key({ request }));
    response = pair ? pair.response : { status: 502, body: 'Hoverfly Error!\\n\\nThere was an error when matching' };
  }
  journal.push({ request, response, timeStarted: new Date().toISOString() });
  res.writeHead(response.status, { 'content-type': 'text/plain' }); res.end(response.body);
}).listen(Number(proxyPort), '127.0.0.1');
`;
const fakeDocker = `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path'); const { spawn } = require('node:child_process');
const root = process.env.FAKE_DOCKER; const args = process.argv.slice(2);
const file = name => path.join(root, name + '.json'); const net = name => path.join(root, 'network-' + name + '.json');
const load = name => fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : null;
const save = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
const fail = message => { console.error(message); process.exit(1); };
const flag = name => args[args.indexOf(name) + 1];
const cmd = args[0];
fs.appendFileSync(path.join(root, 'calls.log'), args.join(' ') + '\\n');
if (cmd === 'info') console.log('fake');
else if (cmd === 'network' && args[1] === 'ls') console.log(fs.readdirSync(root).filter(f => f.startsWith('network-')).map(f => f.slice(8, -5)).join('\\n'));
else if (cmd === 'network' && args[1] === 'create') { const name = args[args.length - 1]; if (fs.existsSync(net(name))) fail('exists');
  const options = Object.fromEntries(args.flatMap((a, i) => a === '-o' ? [args[i + 1].split('=')] : []));
  fs.writeFileSync(net(name), JSON.stringify({ Labels: { 'io.praman.owner': flag('--label').split('=')[1] }, Options: options })); }
else if (cmd === 'network' && args[1] === 'inspect') console.log(JSON.stringify([JSON.parse(fs.readFileSync(net(args[2]), 'utf8'))]));
else if (cmd === 'network' && args[1] === 'rm') fs.unlinkSync(net(args[2]));
else if (cmd === 'ps') { const name = args[args.length - 1].replace('name=^/', '').replace('$', ''); if (load(name)) console.log('fakeid'); }
else if (cmd === 'inspect') { const c = load(args[1]); console.log(JSON.stringify([{ Id: 'fakeid', Image: 'sha256:fake', Config: { Labels: c.labels }, State: { Running: c.running, Paused: false } }])); }
else if (cmd === 'run') {
  const name = flag('--name'); if (load(name)) fail('exists');
  const network = args.includes('--network') ? flag('--network') : undefined;
  if (network && !fs.existsSync(net(network))) fail('no such network');
  const value = { labels: { 'io.praman.owner': flag('--label').split('=')[1] }, running: true, network, args };
  if (args.some(a => a.startsWith('spectolabs/hoverfly:'))) {
    const port = suffix => args.find(a => a.endsWith(suffix)).split(':')[1];
    value.log = path.join(root, name + '.log'); fs.writeFileSync(value.log, 'INFO: serving proxy\\n');
    const child = spawn(process.execPath, [path.join(root, '..', 'bin', 'fake-recorder.cjs'), port(':8888'), port(':8500'), flag('-password'), args.includes('-capture') ? 'capture' : 'simulate', value.log], { detached: true, stdio: 'ignore' });
    child.unref(); value.pid = child.pid; fs.appendFileSync(path.join(root, 'pids'), child.pid + '\\n');
  }
  save(name, value);
}
else if (cmd === 'cp') { const [from, to] = args.slice(1); const name = from.split(':')[0]; if (!load(name)) fail('missing'); fs.writeFileSync(to, process.env.FAKE_CA); }
else if (cmd === 'logs') { const c = load(args[1]); if (!c) fail('missing'); process.stderr.write(fs.readFileSync(c.log, 'utf8')); }
else if (cmd === 'exec') { const c = load(args[1]); process.exit(c && c.running ? 0 : 1); }
else if (cmd === 'rm') { const name = args[args.length - 1]; const c = load(name); if (c && c.pid) { try { process.kill(c.pid); } catch {} } fs.unlinkSync(file(name)); }
else fail('unsupported ' + cmd);
`;
// The application: its page shows what its server fetched from an outside address through the proxy it was given.
const integration = `
import { createServer, request } from 'node:http';
const servers = globalThis.__pramanOutsideApps ??= [];
function fetchThroughProxy(proxyUrl, target) {
  const proxy = new URL(proxyUrl);
  return new Promise(resolve => {
    const req = request({ host: proxy.hostname, port: proxy.port, path: target, headers: { host: new URL(target).host,
      'proxy-authorization': 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64') } }, res => {
      let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve(res.statusCode === 200 ? body : 'outside call failed'));
    });
    req.on('error', () => resolve('outside call failed')); req.end();
  });
}
const integration = {
  configure: config => config,
  start: async (state, save) => {
    const config = state.spec.application.config;
    if (!state.urls.app) {
      const server = createServer(async (req, res) => {
        if (req.url !== '/') { res.statusCode = 404; return res.end(); }
        const text = config.bypass ? 'outside page /page' : await fetchThroughProxy(state.outside.proxyUrl, config.outsideUrl);
        res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>t</title><p id="outside">' + text + '</p>');
      });
      server.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); servers.push(server);
      state.urls.app = 'http://127.0.0.1:' + server.address().port;
    }
    if (state.scenario) state.scenario.afterUrl = state.urls.app + '/';
    save();
  },
  observe: async state => ({ app: state.urls.app }),
  reset: async (state, save, resetInfrastructure) => { await resetInfrastructure(); await integration.start(state, save); },
};
export default integration;`;

let base: string, bin: string, fake: string, oldPath: string | undefined, servers: Server[];
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'praman-outside-'));
  bin = join(base, 'bin'); fake = join(base, 'fake'); mkdirSync(bin); mkdirSync(fake);
  writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
  writeFileSync(join(bin, 'fake-recorder.cjs'), fakeRecorder);
  writeFileSync(join(base, 'integration.mjs'), integration);
  oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`; process.env.FAKE_DOCKER = fake; process.env.FAKE_CA = testCa;
  servers = [];
});
afterEach(() => {
  const pids = existsSync(join(fake, 'pids')) ? readFileSync(join(fake, 'pids'), 'utf8').split('\n').filter(Boolean) : [];
  for (const pid of pids) { try { process.kill(Number(pid)); } catch { /* already stopped */ } }
  const apps = (globalThis as { __pramanOutsideApps?: Server[] }).__pramanOutsideApps ?? [];
  apps.splice(0).forEach(server => server.close());
  process.env.PATH = oldPath; delete process.env.FAKE_DOCKER; delete process.env.FAKE_CA; servers.forEach(server => server.close());
  rmSync(base, { recursive: true, force: true });
});

const scenario = (expected = 'outside page /page') => ({
  title: 'Outside calls', mode: 'acceptance', change: 'The page shows what the server fetched from outside', afterUrl: 'http://127.0.0.1:9/', repeats: 2,
  steps: [{ id: 'open', action: 'waitFor', selector: '#outside', note: 'The first page load fetches from outside once' }],
  checks: [{ id: 'shown', kind: 'text', selector: '#outside', equals: expected, afterStep: 'open' }],
});
const declaration = (config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  name: 'outside', provider: 'docker', dockerHost: 'unix:///no-docker.sock', namespace: 'praman-test', resources: [], workloads: {},
  services: { db: { image: 'fake/db:1', port: 5432, ready: ['true'] } }, faultService: 'db', outsideCalls: {},
  application: { module: './integration.mjs', config: { outsideUrl: 'http://outside.test/page', ...config } }, scenario: './scenario.json', ...extra,
});
const write = (name: string, value: unknown) => { const path = join(base, name); writeFileSync(path, JSON.stringify(value)); return path; };
type Result = { verdict: string; id: string; evidence: any; outsideSummary?: string };
async function create(config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, recording?: string, expected?: string) {
  write('scenario.json', scenario(expected));
  return manageEnvironment('create', { specPath: write('env.json', declaration(config, extra)), baseDir: base, ...(recording ? { recording } : {}) }) as Promise<Result>;
}
const act = (action: 'verify' | 'reset' | 'destroy' | 'recording-save' | 'demonstrate', id: string) => manageEnvironment(action, { id, baseDir: base }) as Promise<Result>;
/** Why a verify did not pass, from the private operation log: a timing failure on a loaded runner must name its cause. */
const why = (id: string) => operations(id).split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.action === 'verify')
  .map(row => ({ verdict: row.verdict, error: row.error, reason: row.evidence?.proof?.reason, runs: row.evidence?.proof?.after?.map((run: { error?: string; outside?: unknown }) => ({ error: run.error, outside: run.outside })) })).at(-1);
const verifiedPass = async (id: string) => { const result = await act('verify', id); expect(result.verdict, JSON.stringify(why(id))).toBe('passed'); return result; };
const state = (id: string) => JSON.parse(readFileSync(join(base, id, 'state.json'), 'utf8'));
const operations = (id: string) => readFileSync(join(base, id, 'operations.jsonl'), 'utf8');
const owned = () => readdirSync(fake).filter(name => (name.startsWith('praman-') || name.startsWith('network-')) && name.endsWith('.json'));
const recorder = (id: string) => JSON.parse(readFileSync(join(fake, `praman-${id}--hoverfly.json`), 'utf8'));
async function recorded() {
  const env = await create();
  await verifiedPass(env.id);
  const saved = await act('recording-save', env.id);
  expect(saved.verdict).toBe('passed');
  expect((await act('destroy', env.id)).verdict).toBe('passed');
  return saved.evidence.recording.id as string;
}

describe('outside calls: declaration', () => {
  it('accepts outsideCalls on Docker and keeps old declarations unchanged', () => {
    expect(environmentSpecSchema.safeParse(declaration()).success).toBe(true);
    expect(environmentSpecSchema.safeParse(declaration({}, { outsideCalls: { minPerRun: 0 } })).success).toBe(true);
    const { outsideCalls: _none, ...old } = declaration();
    expect('outsideCalls' in environmentSpecSchema.parse(old)).toBe(false);
  });
  it.each([
    ['an unknown option', { outsideCalls: { hosts: ['x'] } }],
    ['a minimum above 1000', { outsideCalls: { minPerRun: 1001 } }],
    ['a kind environment', { provider: 'kind', nodeImage: 'kindest/node:x', services: undefined, faultService: undefined }],
  ])('rejects %s', (_name, extra) => {
    expect(environmentSpecSchema.safeParse(declaration({}, extra)).success).toBe(false);
  });
  it('starts no recorder for a declaration without outsideCalls', async () => {
    write('scenario.json', scenario('outside page /page'));
    const { outsideCalls: _none, ...old } = declaration({ bypass: true });
    const env = await manageEnvironment('create', { specPath: write('env.json', old), baseDir: base }) as Result;
    expect(env.verdict).toBe('passed');
    expect(state(env.id).outside).toBeUndefined();
    expect(readFileSync(join(fake, 'calls.log'), 'utf8')).not.toContain('hoverfly');
  });
});

describe('outside calls: record, save and replay', () => {
  it('records through an owned recorder, saves a hashed recording and removes everything on destroy', async () => {
    const env = await create();
    expect(env.verdict).toBe('passed');
    const saved = state(env.id);
    expect(saved.outside).toMatchObject({ mode: 'record', name: `praman-${env.id}--hoverfly` });
    expect(saved.outside.proxyUrl).toBe(`http://praman:${saved.outside.password}@127.0.0.1:${saved.outside.proxyPort}`);
    expect(readFileSync(saved.outside.caCert, 'utf8')).toBe(testCa);
    const run = recorder(env.id).args as string[];
    expect(run).toEqual(expect.arrayContaining(['-generate-ca-cert', '-auth', '-capture', '-v', `127.0.0.1:${saved.outside.proxyPort}:8500`, `127.0.0.1:${saved.outside.adminPort}:8888`]));
    expect(run).not.toContain('--network');
    expect(JSON.stringify(env)).not.toContain(saved.outside.password);
    expect(env.evidence.outsideCalls).toEqual({ mode: 'record' });

    const verified = await verifiedPass(env.id);
    expect(Object.keys(verified).at(-1)).toBe('outsideSummary');
    expect(verified.outsideSummary).toBe('repeat 1 passed: recording, 1 served, 0 refused, 0 TLS refused; repeat 2 passed: recording, 1 served, 0 refused, 0 TLS refused');
    expect(verified.evidence.outsideCalls.repeats[0]).toEqual({ verdict: 'passed', mode: 'record', served: 1, refused: 0, tlsRefused: 0, ok: true });
    // Addresses stay in the private per-run file, never in the result.
    expect(JSON.stringify(verified)).not.toContain('outside.test');
    const calls = JSON.parse(readFileSync(join(verified.evidence.output, 'after-1', 'outside-calls.json'), 'utf8'));
    expect(calls.calls).toEqual([expect.objectContaining({ method: 'GET', url: 'http://outside.test/page', status: 200, served: true })]);

    const recording = await act('recording-save', env.id);
    expect(recording.verdict).toBe('passed');
    const id = recording.evidence.recording.id;
    expect(id).toMatch(/^[a-f0-9]{12}$/);
    const manifest = JSON.parse(readFileSync(join(base, 'recordings', id, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ version: 1, image: 'spectolabs/hoverfly:v1.12.17', calls: 1 });
    expect(JSON.parse(readFileSync(join(base, 'recordings', id, 'simulation.json'), 'utf8')).data.pairs).toHaveLength(1);

    expect((await act('destroy', env.id)).verdict).toBe('passed');
    expect(owned()).toEqual([]);
    expect(state(env.id).outside).toBeUndefined();
  });

  it('replays a recording on a network with no outbound route and refuses an unrecorded call before the app starts', async () => {
    const id = await recorded();
    const env = await create({}, {}, id);
    expect(env.verdict).toBe('passed');
    const saved = state(env.id);
    expect(saved.outside).toMatchObject({ mode: 'replay', recordingId: id, network: `praman-${env.id}--outside` });
    expect(JSON.parse(readFileSync(join(fake, `network-praman-${env.id}--outside.json`), 'utf8')).Options).toEqual({ 'com.docker.network.bridge.enable_ip_masquerade': 'false' });
    expect(recorder(env.id).args).not.toContain('-capture');
    expect(recorder(env.id).network).toBe(`praman-${env.id}--outside`);
    const readiness = readdirSync(join(base, env.id)).find(name => name.startsWith('outside-readiness-'))!;
    expect(JSON.parse(readFileSync(join(base, env.id, readiness), 'utf8')).probes).toEqual({ withoutPassword: 407, unrecorded: 502 });

    const verified = await verifiedPass(env.id);
    expect(verified.outsideSummary).toBe(`repeat 1 passed: replay of ${id}, 1 served, 0 refused, 0 TLS refused; repeat 2 passed: replay of ${id}, 1 served, 0 refused, 0 TLS refused`);
    expect((await act('destroy', env.id)).verdict).toBe('passed');
    expect(owned()).toEqual([]);
  });

  it('gives insufficient_evidence, never a pass, when the app makes a call that is not in the recording', async () => {
    const id = await recorded();
    // The page would show the replay's refusal; even a check written to accept it cannot pass.
    const env = await create({ outsideUrl: 'http://outside.test/other' }, {}, id, 'outside call failed');
    const verified = await act('verify', env.id);
    expect(verified.verdict).toBe('insufficient_evidence');
    expect(verified.evidence.proof.reason).toContain('not in the recording (1)');
    expect(verified.evidence.proof.after.every((run: { checks: Array<{ verdict: string }> }) => run.checks[0].verdict === 'passed')).toBe(true);
    expect(verified.outsideSummary).toContain('0 served, 1 refused');
  });

  it('gives insufficient_evidence when the app bypasses the replay, unless the declaration allows runs without calls', async () => {
    const id = await recorded();
    const env = await create({ bypass: true }, {}, id);
    const verified = await act('verify', env.id);
    expect(verified.verdict).toBe('insufficient_evidence');
    expect(verified.evidence.proof.reason).toContain('Only 0 outside call(s) went through the replay');
    await act('destroy', env.id);
    const allowed = await create({ bypass: true }, { outsideCalls: { minPerRun: 0 } }, id);
    await verifiedPass(allowed.id);
  });

  it('gives insufficient_evidence when the app rejects the environment CA during an HTTPS call', async () => {
    const env = await create({ outsideUrl: 'http://tls-untrusted.test/page' }, {}, undefined, 'outside call failed');
    const verified = await act('verify', env.id);
    expect(verified.verdict).toBe('insufficient_evidence');
    expect(verified.outsideSummary).toContain('0 served, 0 refused, 1 TLS refused');
  });

  it('gives insufficient_evidence when the real service fails while recording', async () => {
    const env = await create({ outsideUrl: 'http://down.test/page' }, {}, undefined, 'outside call failed');
    const verified = await act('verify', env.id);
    expect(verified.verdict).toBe('insufficient_evidence');
    expect(verified.evidence.proof.reason).toContain('could not be recorded');
  });
});

describe('outside calls: recordings are checked', () => {
  it('refuses an altered or missing recording before any container starts', async () => {
    const id = await recorded();
    appendFileSync(join(base, 'recordings', id, 'simulation.json'), ' ');
    const runsBefore = readFileSync(join(fake, 'calls.log'), 'utf8').split('\n').filter(line => line.startsWith('run ')).length;
    const altered = await create({}, {}, id);
    expect(altered.verdict).toBe('insufficient_evidence');
    expect(operations(altered.id)).toContain('was altered');
    expect(readFileSync(join(fake, 'calls.log'), 'utf8').split('\n').filter(line => line.startsWith('run ')).length).toBe(runsBefore);
    const missing = await create({}, {}, 'aaaaaaaaaaaa');
    expect(missing.verdict).toBe('insufficient_evidence');
    expect(operations(missing.id)).toContain('not found');
  });

  it('refuses a recording for a declaration without outsideCalls', async () => {
    write('scenario.json', scenario());
    const { outsideCalls: _none, ...old } = declaration();
    await expect(manageEnvironment('create', { specPath: write('env.json', old), baseDir: base, recording: 'aaaaaaaaaaaa' })).rejects.toThrow('needs a declaration with outsideCalls');
  });

  it('refuses recording-save for a replay and for an empty recorder', async () => {
    const id = await recorded();
    const replay = await create({}, {}, id);
    expect((await act('recording-save', replay.id)).verdict).toBe('insufficient_evidence');
    expect(operations(replay.id)).toContain('needs an environment that records');
    await act('destroy', replay.id);
    const empty = await create();
    expect((await act('recording-save', empty.id)).verdict).toBe('insufficient_evidence');
    expect(operations(empty.id)).toContain('Nothing was recorded');
  });
});

describe('outside calls: lifecycle', () => {
  it('keeps the recorder across reset and still checks every run', async () => {
    const env = await create();
    const before = state(env.id).outside;
    expect((await act('reset', env.id)).verdict).toBe('passed');
    expect(state(env.id).outside).toEqual(before);
    expect(readFileSync(join(fake, 'calls.log'), 'utf8').split('\n').filter(line => line.includes('--hoverfly') && line.startsWith('run '))).toHaveLength(1);
    await verifiedPass(env.id);
  });

  it('refuses demonstrate for an environment with outsideCalls', async () => {
    const env = await create();
    expect((await act('demonstrate', env.id)).verdict).toBe('insufficient_evidence');
    expect(operations(env.id)).toContain('demonstrate is not supported with outsideCalls');
  });
});

describe('outside calls: proof gate', () => {
  async function app() {
    const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>t</title><p id="outside">outside page /page</p>'); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  it('never passes a run whose outside evidence is not ok or cannot be read, even when every check passed', async () => {
    const url = await app();
    const spec = changeSpecSchema.parse({ ...scenario(), afterUrl: `${url}/` });
    const refused = await proveChange(spec, join(base, 'refused'), undefined, { outside: { begin: async () => {}, end: async () => ({ mode: 'replay', served: 0, refused: 1, tlsRefused: 0, minPerRun: 1, ok: false, reason: 'refused call' }) } });
    expect(refused.verdict).toBe('insufficient_evidence');
    expect(refused.proof.reason).toBe('refused call');
    expect(refused.proof.after.every(run => run.checks.every(check => check.verdict === 'passed'))).toBe(true);
    const unreadable = await proveChange(spec, join(base, 'unreadable'), undefined, { outside: { begin: async () => {}, end: async () => { throw new Error('journal gone'); } } });
    expect(unreadable.verdict).toBe('insufficient_evidence');
    expect(unreadable.proof.after[0].error).toContain('journal gone');
    const passed = await proveChange(spec, join(base, 'passed'), undefined, { outside: { begin: async () => {}, end: async () => ({ mode: 'replay', served: 1, refused: 0, tlsRefused: 0, minPerRun: 1, ok: true }) } });
    expect(passed.verdict).toBe('passed');
  });
});

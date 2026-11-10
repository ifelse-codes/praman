import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { manageEnvironment } from '../src/environments/manager.js';
import { environmentSpecSchema } from '../src/environments/schema.js';
import { canonicalManifest, loadWorld, worldIdOf, type WorldManifest } from '../src/environments/world.js';
import type { EnvironmentState } from '../src/environments/types.js';

// A fake `docker` on PATH keeps containers as JSON files; `docker cp` streams the container's
// data text. No Docker daemon, no real database.
const fakeDocker = `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const root = process.env.FAKE_DOCKER; const args = process.argv.slice(2);
const file = name => path.join(root, name + '.json');
const load = name => fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), 'utf8')) : null;
const save = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
const fail = message => { console.error(message); process.exit(1); };
const make = (running) => {
  const name = args[args.indexOf('--name') + 1]; const label = args[args.indexOf('--label') + 1].split('=')[1];
  if (load(name)) fail('exists');
  save(name, { labels: { 'io.praman.owner': label }, running, data: 'seed' });
};
const cmd = args[0];
if (cmd === 'info') console.log('fake');
else if (cmd === 'ps') { const name = args[args.length - 1].replace('name=^/', '').replace('$', ''); if (load(name)) console.log('fakeid'); }
else if (cmd === 'inspect') { const c = load(args[1]); console.log(JSON.stringify([{ Id: 'fakeid', Image: 'sha256:fake', Config: { Labels: c.labels }, State: { Running: c.running, Paused: false } }])); }
else if (cmd === 'run') make(true);
else if (cmd === 'create') make(false);
else if (cmd === 'start' || cmd === 'stop') { const name = args[args.length - 1]; const c = load(name); if (!c) fail('missing'); c.running = cmd === 'start'; save(name, c); }
else if (cmd === 'exec') { const c = load(args[1]); process.exit(c && c.running ? 0 : 1); }
else if (cmd === 'rm') fs.unlinkSync(file(args[args.length - 1]));
else if (cmd === 'cp' && args[1] === '-') { const name = args[2].split(':')[0]; const c = load(name); if (!c) fail('missing'); c.data = fs.readFileSync(0, 'utf8'); save(name, c); }
else if (cmd === 'cp' && args[2] === '-') { const c = load(args[1].split(':')[0]); if (!c) fail('missing'); process.stdout.write(c.data); }
else fail('unsupported ' + cmd);
`;

let base: string, bin: string, fake: string, oldPath: string | undefined, servers: Server[];
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'praman-worlds-'));
  bin = join(base, 'bin'); fake = join(base, 'fake'); mkdirSync(bin); mkdirSync(fake);
  writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
  oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`; process.env.FAKE_DOCKER = fake;
  servers = [];
});
afterEach(() => { process.env.PATH = oldPath; delete process.env.FAKE_DOCKER; servers.forEach(server => server.close()); rmSync(base, { recursive: true, force: true }); });

const container = (state: string, name = 'db') => JSON.parse(readFileSync(join(fake, `praman-${state}-${name}.json`), 'utf8')) as { data: string; running: boolean };
const setData = (id: string, data: string) => { const path = join(fake, `praman-${id}-db.json`); writeFileSync(path, JSON.stringify({ ...container(id), data })); };
const declaration = (extra: Record<string, unknown> = {}) => ({
  name: 'worlds', provider: 'docker', dockerHost: 'unix:///no-docker.sock', namespace: 'praman-test', resources: [], workloads: {},
  services: { db: { image: 'fake/db:1', port: 5432, dataPath: '/var/lib/data', ready: ['true'] } }, faultService: 'db', ...extra,
});
const write = (name: string, value: unknown) => { const path = join(base, name); writeFileSync(path, JSON.stringify(value)); return path; };
const created = async (specPath: string, world?: string) => manageEnvironment('create', { specPath, baseDir: base, world }) as Promise<{ verdict: string; id: string; evidence: any }>;

describe('worlds: declaration', () => {
  it('accepts an absolute dataPath and rejects relative or trailing-slash paths', () => {
    expect(environmentSpecSchema.safeParse(declaration()).success).toBe(true);
    for (const dataPath of ['data', '/data/', '']) {
      const bad = declaration({ services: { db: { image: 'x', port: 1, dataPath, ready: ['true'] } } });
      expect(environmentSpecSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('worlds: save, hash and copy', () => {
  it('saves a hashed world and starts independent copies from it', async () => {
    const spec = write('env.json', declaration());
    const source = await created(spec);
    expect(source.verdict).toBe('passed');
    setData(source.id, 'seeded rows');
    const saved = await manageEnvironment('world-save', { id: source.id, baseDir: base }) as { verdict: string; evidence: { world: { id: string; services: Record<string, { sha256: string }> } } };
    expect(saved.verdict).toBe('passed');
    const worldId = saved.evidence.world.id;
    expect(worldId).toMatch(/^[a-f0-9]{12}$/);
    expect(container(source.id).running).toBe(true);
    const manifest = JSON.parse(readFileSync(join(base, 'worlds', worldId, 'manifest.json'), 'utf8')) as WorldManifest;
    expect(worldIdOf(manifest)).toBe(worldId);
    expect(manifest.services.db.sha256).toBe(saved.evidence.world.services.db.sha256);

    const a = await created(spec, worldId), b = await created(spec, worldId);
    expect(a.verdict).toBe('passed'); expect(b.verdict).toBe('passed');
    expect(container(a.id).data).toBe('seeded rows');
    expect(a.evidence.world.services[0]).toMatchObject({ worldId, matchesWorld: true, sha256: manifest.services.db.sha256 });
    setData(a.id, 'changed in A');
    expect(container(b.id).data).toBe('seeded rows');
    expect(container(source.id).data).toBe('seeded rows');
  });

  it('refuses an altered archive and starts nothing', async () => {
    const spec = write('env.json', declaration());
    const source = await created(spec);
    const saved = await manageEnvironment('world-save', { id: source.id, baseDir: base }) as { evidence: { world: { id: string } } };
    const worldId = saved.evidence.world.id, directory = join(base, 'worlds', worldId);
    const before = readdirSync(fake).length;

    writeFileSync(join(directory, 'db.tar'), 'tampered');
    const altered = await created(spec, worldId);
    expect(altered.verdict).toBe('insufficient_evidence');
    expect(readFileSync(join(base, altered.id, 'operations.jsonl'), 'utf8')).toContain('was altered or is missing');
    expect(readdirSync(fake).length).toBe(before);
  });

  it('detects a changed manifest, a different image and a world that does not exist', async () => {
    const spec = write('env.json', declaration());
    const source = await created(spec);
    const saved = await manageEnvironment('world-save', { id: source.id, baseDir: base }) as { evidence: { world: { id: string } } };
    const worldId = saved.evidence.world.id, directory = join(base, 'worlds', worldId);
    const state = JSON.parse(readFileSync(join(base, source.id, 'state.json'), 'utf8')) as EnvironmentState;
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as WorldManifest;
    await expect(loadWorld({ id: worldId, directory }, state)).resolves.toBeTruthy();
    const otherImage = { ...state, spec: { ...state.spec, services: { db: { ...state.spec.services!.db, image: 'fake/db:2' } } } };
    await expect(loadWorld({ id: worldId, directory }, otherImage)).rejects.toThrow('different image');
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, services: { db: { ...manifest.services.db, bytes: manifest.services.db.bytes + 1 } } }));
    await expect(loadWorld({ id: worldId, directory }, state)).rejects.toThrow('altered');
    const missing = await created(spec, 'ffffffffffff');
    expect(missing.verdict).toBe('insufficient_evidence');
    expect(canonicalManifest(manifest)).toContain('"db"');
  });

  it('refuses to save when no service declares dataPath', async () => {
    const plain = declaration({ services: { db: { image: 'fake/db:1', port: 5432, ready: ['true'] } } });
    const source = await created(write('plain.json', plain));
    const saved = await manageEnvironment('world-save', { id: source.id, baseDir: base });
    expect(saved.verdict).toBe('insufficient_evidence');
    expect(existsSync(join(base, 'worlds')) ? readdirSync(join(base, 'worlds')) : []).toEqual([]);
  });
});

describe('worlds: a fresh copy for every repeat', () => {
  // A tiny app whose data lives in the "container": /add stores one more record; the integration's
  // reset restores the app state from the fake container, as a real database restore would.
  async function app(counter: { n: number }) {
    const server = createServer((req, res) => {
      if (req.url === '/add') counter.n += 1;
      res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><title>t</title><p id="n">${counter.n}</p>`);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const integration = (counter: string) => `
import { readFileSync } from 'node:fs';
const read = state => Number(JSON.parse(readFileSync(process.env.FAKE_DOCKER + '/praman-' + state.id + '-db.json', 'utf8')).data.replace('rows:', '') || 0);
const integration = {
  configure: config => config,
  start: async (state, save) => { state.urls.app = state.spec.application.config.url; globalThis[${JSON.stringify(counter)}].n = read(state); if (state.scenario) state.scenario.afterUrl = state.urls.app + '/'; save(); },
  observe: async state => ({ rows: read(state) }),
  reset: async (state, save, resetInfrastructure) => { await resetInfrastructure(); await integration.start(state, save); },
};
export default integration;`;
  const scenario = (url: string) => ({
    title: 'Add one record', mode: 'acceptance', change: 'Each repeat adds one record to the same starting data', afterUrl: `${url}/`, repeats: 2,
    steps: [{ id: 'added', action: 'goto', path: '/add', note: 'Add one record' }],
    checks: [{ id: 'one-more', kind: 'text', selector: '#n', equals: '1', afterStep: 'added' }],
  });

  async function setup(withWorld: boolean) {
    const counter = { n: 0 }; (globalThis as any).worldCounter = counter;
    const url = await app(counter);
    writeFileSync(join(base, 'integration.mjs'), integration('worldCounter'));
    writeFileSync(join(base, 'scenario.json'), JSON.stringify(scenario(url)));
    const spec = write('env.json', declaration({ application: { module: './integration.mjs', config: { url } }, scenario: './scenario.json' }));
    const source = await created(spec);
    setData(source.id, 'rows:0');
    let worldId: string | undefined;
    if (withWorld) {
      const saved = await manageEnvironment('world-save', { id: source.id, baseDir: base }) as { evidence: { world: { id: string } } };
      worldId = saved.evidence.world.id;
    }
    const copy = await created(spec, worldId);
    return { copy, worldId, counter };
  }

  it('without a world the second repeat sees the first repeat\'s record (the gap)', async () => {
    const { copy } = await setup(false);
    const result = await manageEnvironment('verify', { id: copy.id, baseDir: base });
    expect(result.verdict).not.toBe('passed');
  });

  it('with a world every repeat starts from the world and records its starting hash', async () => {
    const { copy, worldId } = await setup(true);
    setData(copy.id, 'rows:0');
    const result = await manageEnvironment('verify', { id: copy.id, baseDir: base }) as { verdict: string; evidence: { output: string; world: { id: string; runs: Array<{ repeat: number; services: Array<{ matchesWorld: boolean; worldId: string }> }> } } };
    expect(result.verdict).toBe('passed');
    expect(result.evidence.world.id).toBe(worldId);
    expect(result.evidence.world.runs.map(run => run.repeat)).toEqual([1, 2]);
    for (const run of result.evidence.world.runs) expect(run.services[0]).toMatchObject({ matchesWorld: true, worldId });
    const file = JSON.parse(readFileSync(join(result.evidence.output, 'world-runs.json'), 'utf8'));
    expect(file.runs).toHaveLength(2);
  });

  it('is not counted as a pass when the world cannot be restored for a repeat', async () => {
    const { copy, worldId } = await setup(true);
    writeFileSync(join(base, 'worlds', worldId!, 'db.tar'), 'tampered');
    const result = await manageEnvironment('verify', { id: copy.id, baseDir: base }) as { verdict: string };
    expect(result.verdict).toBe('insufficient_evidence');
  });

  it('does not record a demonstration from a used copy', async () => {
    const { copy } = await setup(true);
    const result = await manageEnvironment('demonstrate', { id: copy.id, baseDir: base });
    expect(result.verdict).toBe('insufficient_evidence');
  });
});

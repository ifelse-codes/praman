import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSource, sharedSourceRoot, snapshotSource } from '../src/environments/source.js';
import { manageEnvironment } from '../src/environments/manager.js';

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'praman-application-')); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

it('keeps source snapshots independent while covering external dependency symlink targets', () => {
  const source = join(directory, 'evidence', 'old'), snapshot = join(directory, 'runs', 'before');
  const dependencies = join(directory, 'installed', 'node_modules');
  mkdirSync(source, { recursive: true }); mkdirSync(dependencies, { recursive: true });
  writeFileSync(join(source, 'main.js'), 'export const value = "old";');
  writeFileSync(join(source, '.env.local'), 'private');
  symlinkSync(dependencies, join(source, 'node_modules'), 'dir');
  const roots = snapshotSource(source, snapshot, []);
  expect(sharedSourceRoot([snapshot, ...roots])).toBe(realpathSync(directory));
  expect(realpathSync(join(snapshot, 'node_modules'))).toBe(realpathSync(dependencies));
  const originalHash = hashSource(snapshot, []);
  writeFileSync(join(source, 'main.js'), 'export const value = "new";');
  expect(readFileSync(join(snapshot, 'main.js'), 'utf8')).toBe('export const value = "old";');
  writeFileSync(join(snapshot, '.env.local'), 'different private value');
  writeFileSync(join(dependencies, 'installed.js'), 'new dependency bytes');
  expect(hashSource(snapshot, [])).toBe(originalHash);
  writeFileSync(join(snapshot, 'main.js'), 'export const value = "changed snapshot";');
  expect(hashSource(snapshot, [])).not.toBe(originalHash);
});

it('returns insufficient evidence for a missing external integration and still allows teardown', async () => {
  const specPath = join(directory, 'environment.json');
  writeFileSync(specPath, JSON.stringify({ name: 'external application', dockerHost: 'unix:///no-docker.sock',
    provider: 'docker', namespace: 'praman-external', resources: [], workloads: {},
    services: { dependency: { image: 'unused', port: 9000, ready: ['true'] } }, faultService: 'dependency',
    application: { module: './missing-integration.mjs', config: {} } }));
  const base = join(directory, 'environments');
  const result = await manageEnvironment('create', { specPath, baseDir: base });
  expect(result.verdict).toBe('insufficient_evidence');
  expect(result.phase).toBe('failed');
  const state = JSON.parse(readFileSync(join(result.directory, 'state.json'), 'utf8'));
  expect(state.clusterOwned).toBe(false);
  expect(state.processes).toEqual([]);
  const destroyed = await manageEnvironment('destroy', { id: result.id, baseDir: base });
  expect(destroyed.verdict).toBe('passed');
  expect(destroyed.phase).toBe('destroyed');
});

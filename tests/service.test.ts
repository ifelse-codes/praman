import { expect, test } from 'vitest';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startService, serviceSchema } from '../src/gateway/service.js';

const declaration = {
  version: 1, initial: 'ready', states: {
    ready: [{ method: 'POST', path: '/work', next: 'failed', response: { status: 503, body: { retry: true } } }],
    failed: [{ method: 'POST', path: '/work', next: 'ready', response: { status: 201, body: { accepted: true } } }],
  },
};

test('saved service state reproduces ordered failure/recovery and stays isolated', async () => {
  const first = startService({ port: 0, declaration });
  const second = startService({ port: 0, declaration });
  const dir = mkdtempSync(join(tmpdir(), 'praman-service-'));
  try {
    await Promise.all([once(first.server, 'listening'), once(second.server, 'listening')]);
    const address = first.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    const url = `http://127.0.0.1:${address.port}/work`;
    const initial = first.snapshot();
    const failed = await fetch(url, { method: 'POST' });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ retry: true });
    expect(first.snapshot()).toMatchObject({ state: 'failed', requests: 1 });
    expect(second.snapshot()).toEqual(initial);
    const file = join(dir, 'snapshot.json');
    first.save(file);
    expect((await fetch(url, { method: 'POST' })).status).toBe(201);
    first.load(file);
    expect(first.snapshot()).toMatchObject({ state: 'failed', requests: 1 });
    expect((await fetch(url, { method: 'POST' })).status).toBe(201);
    first.restore(initial);
    expect((await fetch(url, { method: 'POST' })).status).toBe(503);
    const beforeUnknown = first.snapshot();
    expect((await fetch(`${url}?different`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(url)).status).toBe(404);
    expect(first.snapshot()).toEqual(beforeUnknown);
    expect(() => first.restore({ ...initial, declarationHash: 'different' })).toThrow('does not match');
    expect(() => first.restore({ ...initial, state: 'absent' })).toThrow('does not match');
    expect(first.snapshot()).toEqual(beforeUnknown);
    first.reset();
    expect(first.snapshot()).toEqual(initial);
  } finally {
    const closed = [once(first.server, 'close'), once(second.server, 'close')];
    first.server.close();
    second.server.close();
    await Promise.all(closed);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects ambiguous routes and unknown states before listening', () => {
  const route = declaration.states.ready[0];
  expect(() => serviceSchema.parse({ ...declaration, initial: 'absent' })).toThrow('Unknown initial');
  expect(() => serviceSchema.parse({ ...declaration, states: { ready: [route, route], failed: [] } })).toThrow('Duplicate route');
  expect(() => serviceSchema.parse({ ...declaration, states: { ready: [route] } })).toThrow('Unknown next');
});

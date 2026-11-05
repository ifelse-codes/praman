import { expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { replayService, serviceReplaySchema } from '../src/gateway/replay.js';
import { serviceSchema } from '../src/gateway/service.js';

import { z } from 'zod';

const evidenceSchema = z.object({
  proof: z.boolean(),
  runs: z.array(z.object({
    initial: z.object({ state: z.string(), requests: z.number() }),
    steps: z.array(z.object({ status: z.number() })),
    final: z.object({ state: z.string(), requests: z.number() }),
  })),
});
const service = { version: 1, initial: 'ready', states: {
  ready: [{ method: 'POST', path: '/work', next: 'retry', response: { status: 503, body: { secret: 'private-marker', retry: true } } }],
  retry: [{ method: 'POST', path: '/work', next: 'ready', response: { status: 201, body: { accepted: true } } }],
} };
const failure = { method: 'POST', path: '/work', expect: { status: 503, body: { kind: 'json', value: { retry: true, secret: 'private-marker' } } } };
const recovery = { method: 'POST', path: '/work', expect: { status: 201, body: { kind: 'json', value: { accepted: true } } } };
const declaration = { version: 1, service, start: { kind: 'initial' }, steps: [failure, recovery], final: { state: 'ready', requests: 2 } };
async function fixture(run: (dir: string, execute: (spec: unknown, name?: string) => Promise<{
  verdict: string; proofPath: string; runs: { diagnostics: unknown[] }[];
}>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-replay-'));
  let count = 0;
  try {
    await run(dir, async (spec, name) => {
      const file = join(dir, `spec-${++count}.json`);
      writeFileSync(file, JSON.stringify(spec));
      return replayService(file, join(dir, name ?? `out-${count}`));
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('replays failure/recovery from identical fresh state, keeps observations private and refuses output reuse', async () => {
  await fixture(async (dir, execute) => {
    const result = await execute(declaration, 'evidence');
    expect(result.verdict).toBe('passed');
    const saved = evidenceSchema.parse(JSON.parse(readFileSync(result.proofPath, 'utf8')));
    expect(saved.proof).toBe(false);
    expect(saved.runs.map(run => [run.initial.requests, run.steps.map(step => step.status), run.final.state, run.final.requests]))
      .toEqual([[0, [503, 201], 'ready', 2], [0, [503, 201], 'ready', 2]]);
    expect(JSON.stringify(result)).not.toContain('private-marker');
    expect(readFileSync(result.proofPath, 'utf8')).toContain('private-marker');
    expect(statSync(result.proofPath).mode & 0o777).toBe(0o600);
    const original = readFileSync(result.proofPath, 'utf8');
    await expect(execute(declaration, 'evidence')).rejects.toThrow();
    expect(readFileSync(join(dir, 'evidence/replay.json'), 'utf8')).toBe(original);
  });
});

test('restores supplied snapshot for every repeat and does not change the source snapshot', async () => {
  await fixture(async (dir, execute) => {
    const snapshot = { version: 1, declarationHash: createHash('sha256').update(JSON.stringify(serviceSchema.parse(service))).digest('hex'), state: 'retry', requests: 7 };
    const input = JSON.stringify(snapshot);
    writeFileSync(join(dir, 'state.json'), input);
    const result = await execute({ ...declaration, start: { kind: 'snapshot', path: 'state.json' }, steps: [recovery], final: { state: 'ready', requests: 8 } });
    expect(result.verdict).toBe('passed');
    const saved = evidenceSchema.parse(JSON.parse(readFileSync(result.proofPath, 'utf8')));
    expect(saved.runs.map(run => [run.initial.state, run.initial.requests, run.final.requests]))
      .toEqual([['retry', 7, 8], ['retry', 7, 8]]);
    expect(readFileSync(join(dir, 'state.json'), 'utf8')).toBe(input);
  });
});

test('observed status, JSON body and final-state mismatches fail independently, not as missing evidence', async () => {
  await fixture(async (_dir, execute) => {
    for (const spec of [
      { ...declaration, steps: [{ ...failure, expect: { ...failure.expect, status: 200 } }, recovery] },
      { ...declaration, steps: [{ ...failure, expect: { ...failure.expect, body: { kind: 'json', value: { retry: false } } } }, recovery] },
      { ...declaration, final: { state: 'retry', requests: 2 } },
      { ...declaration, final: { state: 'ready', requests: 3 } },
    ]) expect((await execute(spec)).verdict).toBe('failed');
  });
});

test('unknown routes do not mutate state and HTTP bodyless responses use text expectations', async () => {
  await fixture(async (_dir, execute) => {
    const unknown = { method: 'GET', path: '/work?unknown', expect: { status: 404, body: { kind: 'json', value: { error: 'No declared transition' } } } };
    expect((await execute({ ...declaration, steps: [unknown, failure, recovery] })).verdict).toBe('passed');
    const headService = { version: 1, initial: 'only', states: { only: [{ method: 'HEAD', path: '/head', next: 'only', response: { status: 204, body: { ignored: true } } }] } };
    const head = { method: 'HEAD', path: '/head', expect: { status: 204, body: { kind: 'text', value: '' } } };
    expect((await execute({ ...declaration, service: headService, steps: [head], final: { state: 'only', requests: 1 } })).verdict).toBe('passed');
    expect((await execute({ ...declaration, service: headService, steps: [{ ...head, expect: { status: 204, body: { kind: 'json', value: null } } }], final: { state: 'only', requests: 1 } })).verdict).toBe('failed');
  });
});

test('missing or incompatible snapshots and invalid declarations cannot establish a pass', async () => {
  await fixture(async (dir, execute) => {
    const spec = { ...declaration, start: { kind: 'snapshot', path: 'missing.json' } };
    expect((await execute(spec)).verdict).toBe('insufficient_evidence');
    writeFileSync(join(dir, 'missing.json'), JSON.stringify({ version: 1, declarationHash: 'wrong', state: 'ready', requests: 0 }));
    const incompatible = await execute(spec);
    expect(incompatible.verdict).toBe('insufficient_evidence');
    expect(incompatible.runs.every(run => run.diagnostics.length === 0)).toBe(true);
    expect((await execute({ ...declaration, steps: [] })).verdict).toBe('insufficient_evidence');
    for (const change of [{ repeats: 1 }, { repeats: 11 }, { deadlineMs: 10001 }, { start: undefined }, { steps: [{ ...failure, path: 'http://example.org/' }] }]) {
      expect(serviceReplaySchema.safeParse({ ...declaration, ...change }).success).toBe(false);
    }
  });
});

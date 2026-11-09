import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema, type ChangeSpec } from '../src/case/change.js';
import { hashSpec, proveChange } from '../src/eval/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';
import type { z } from 'zod';

const note = 'Act on the page';
const base = { mode: 'acceptance', title: 'Counter', change: 'Each Add click adds one', afterUrl: 'http://127.0.0.1:1', repeats: 2 } as const;
const help = { action: 'hover', selector: '#help', note: 'Read the help tip' } as const;
const add = (id?: string) => ({ action: 'click', selector: '#add', note, ...(id ? { id } : {}) }) as const;
const counts = (first: number | string, second: number | string) => [
  { id: 'one', kind: 'text' as const, selector: '#count', equals: '1', afterStep: first },
  { id: 'two', kind: 'text' as const, selector: '#count', equals: '2', afterStep: second },
];
const parse = (value: object) => changeSpecSchema.safeParse({ ...base, ...value });
const messages = (value: object) => { const result = parse(value); return result.success ? [] : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`); };

describe('step ids in declarations', () => {
  it('resolves ids to indexes in every reference field, alongside plain indexes', () => {
    const spec = changeSpecSchema.parse({ ...base,
      steps: [add('first'), { ...help, id: 'tip' }, add('second')],
      checks: [...counts('first', 2), { id: 'net', kind: 'network', match: { urlPattern: '/api' }, window: { fromStep: 'first', throughStep: 'second', settleMs: 0 }, equals: 0 }],
      walkthrough: { startStep: 'tip', after: [{ step: 'second', text: 'The count reaches two.' }, { step: 1, text: 'The tip shows.' }] } });
    expect(spec.checks.map(check => check.kind === 'network' ? [check.window.fromStep, check.window.throughStep] : check.afterStep)).toEqual([0, 2, [0, 2]]);
    expect(spec.walkthrough?.startStep).toBe(1);
    expect(spec.walkthrough?.after.map(beat => beat.step)).toEqual([2, 1]);
    expect(spec.steps.map(step => step.id)).toEqual(['first', 'tip', 'second']);
    // Parsing again (as every entry point does) is stable.
    expect(changeSpecSchema.parse(spec)).toEqual(spec);
  });

  it('keeps an index-only declaration and its specHash unchanged; ids are part of the hash', () => {
    const indexOnly = changeSpecSchema.parse({ ...base, steps: [add(), add()], checks: counts(0, 1) });
    expect(indexOnly.steps.every(step => !('id' in step))).toBe(true);
    const named = changeSpecSchema.parse({ ...base, steps: [add('a'), add('b')], checks: counts('a', 'b') });
    expect(named.checks).toEqual(indexOnly.checks);
    expect(hashSpec(named)).not.toBe(hashSpec(indexOnly));
    expect(hashSpec(named)).toBe(hashSpec(changeSpecSchema.parse({ ...base, steps: [add('a'), add('b')], checks: counts(0, 1) })));
  });

  it.each([
    ['an unknown checkpoint id', { steps: [add('first')], checks: counts('first', 'secnd') }, 'checks.1.afterStep: checks.1.afterStep refers to unknown step id "secnd"'],
    ['an unknown network window id', { steps: [add('a')], checks: [{ id: 'n', kind: 'network', match: { urlPattern: 'x' }, window: { fromStep: 'a', throughStep: 'b', settleMs: 0 }, equals: 0 }] },
      'checks.0.window.throughStep: checks.0.window.throughStep refers to unknown step id "b"'],
    ['an unknown story start', { steps: [add('a')], checks: counts(0, 0), walkthrough: { startStep: 'start', after: [{ step: 'a', text: 'Shown.' }] } },
      'walkthrough.startStep: walkthrough.startStep refers to unknown step id "start"'],
    ['an unknown story beat step', { steps: [add('a')], checks: counts(0, 0), walkthrough: { startStep: 0, after: [{ step: 'b', text: 'Shown.' }] } },
      'walkthrough.after.0.step: walkthrough.after.0.step refers to unknown step id "b"'],
    ['a duplicate step id', { steps: [add('a'), add('a')], checks: counts('a', 1) }, 'steps.1.id: Duplicate step id "a"; step ids must be unique'],
  ])('rejects %s before execution, naming the field', (_, value, message) => {
    expect(messages(value)).toContain(message);
  });

  it('rejects step ids outside letters, digits, "-" and "_", and an index past the last step', () => {
    expect(parse({ steps: [add('add item')], checks: counts(0, 0) }).success).toBe(false);
    expect(parse({ steps: [add('a')], checks: counts('a', 'a b') }).success).toBe(false);
    expect(messages({ steps: [add('a')], checks: counts(0, 3) })).toContain('checks.1.afterStep: Checkpoints require an existing step; runtime errors must be checked at the end');
  });
});

let server: Server;
let origin: string;
let dir: string;
beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url !== '/') { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<button id="help" onmouseover="document.querySelector('#tip').textContent='Adds one item'">?</button><p id="tip"></p>
<button id="add" onclick="const c=document.querySelector('#count'); c.textContent=String(Number(c.textContent)+1)">Add</button><p id="count">0</p>`);
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-named-steps-'));
});
afterEach(async () => {
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive: true, force: true });
});

function scenario(value: Pick<z.input<typeof changeSpecSchema>, 'steps' | 'checks'>): ChangeSpec {
  return changeSpecSchema.parse({ ...base, afterUrl: origin, ...value });
}

it('inserting a step keeps id checkpoints on the same actions; index checkpoints silently move', async () => {
  const byIndex = await proveChange(scenario({ steps: [help, add(), add()], checks: counts(0, 1) }), join(dir, 'index'));
  const byId = await proveChange(scenario({ steps: [help, add('add-first'), add('add-second')], checks: counts('add-first', 'add-second') }), join(dir, 'id'));
  expect(byIndex.verdict).toBe('failed');
  expect(byIndex.proof.after[0].checks.map(row => [row.afterStep, row.observed])).toEqual([[0, '0'], [1, '1']]);
  expect(byId.verdict).toBe('passed');
  expect(byId.proof.after[0].checks.map(row => [row.afterStep, row.afterStepId, row.observed])).toEqual([[1, 'add-first', '1'], [2, 'add-second', '2']]);
}, 60_000);

it('keeps step ids in private evidence and shows only indexes in safe output', async () => {
  const spec = scenario({ steps: [add('private-step-name'), { action: 'click', id: 'private-missing-step', selector: '#absent', note }], checks: counts('private-step-name', 0) });
  const outDir = join(dir, 'private');
  const result = await proveChange(spec, outDir);
  expect(result.verdict).toBe('insufficient_evidence');
  const run = JSON.parse(readFileSync(join(outDir, 'after-1', 'result.json'), 'utf8'));
  expect([run.failedStep, run.failedStepId]).toEqual([1, 'private-missing-step']);
  expect(run.checks.map((row: { afterStepId?: string }) => row.afterStepId)).toEqual(['private-step-name', 'private-step-name']);
  const shown = safeFeedbackValue(result, spec);
  expect(formatSummary(shown)).toContain('step[1]');
  for (const text of [JSON.stringify(shown), formatSummary(shown), readFileSync(join(outDir, 'feedback.json'), 'utf8'), readFileSync(join(outDir, 'REPORT.md'), 'utf8')]) {
    expect(text).not.toContain('private-step-name');
    expect(text).not.toContain('private-missing-step');
  }
}, 60_000);

it('previews a walkthrough that starts and narrates at step ids', async () => {
  const { previewChange } = await import('../src/core/preview.js');
  const spec = changeSpecSchema.parse({ ...base, afterUrl: origin, steps: [{ ...help, id: 'tip' }, add('first'), add('second')], checks: counts('first', 'second'),
    walkthrough: { startStep: 'first', after: [{ step: 'first', text: 'One click adds one.', selector: '#count' }, { step: 'second', text: 'A second click adds another.', selector: '#count' }] } });
  const result = await previewChange(spec, join(dir, 'preview'));
  expect(result).toMatchObject({ status: 'passed', diagnostics: [] });
  expect(result.scenes.map(scene => scene.step)).toEqual([1, 2]);
}, 60_000);

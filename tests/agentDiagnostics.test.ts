import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema, type ChangeSpec } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

// Distinctive private declaration text that must never reach summaries, feedback or reports.
const ambiguous = 'button[data-private="selector-secret"]';
const missing = '#selector-secret-absent';
let server: Server;
let origin: string;
let dir: string;
beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url !== '/') { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<button data-private="selector-secret">A</button><button data-private="selector-secret">B</button><button data-private="selector-secret">C</button><p id="status">ready</p>');
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-agent-diagnostics-'));
});
afterEach(async () => {
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive: true, force: true });
});

function scenario(body: Pick<ChangeSpec, 'steps' | 'checks'>): ChangeSpec {
  return changeSpecSchema.parse({ mode: 'acceptance', title: 'Diagnostics fixture', change: 'Expose the failure kind', afterUrl: origin, repeats: 2, ...body });
}
async function verify(spec: ChangeSpec, name: string) {
  const outDir = join(dir, name);
  const result = await proveChange(spec, outDir);
  const shown = safeFeedbackValue(result, spec);
  return { result, shown, summary: formatSummary(shown), report: readFileSync(join(outDir, 'REPORT.md'), 'utf8'),
    feedback: readFileSync(join(outDir, 'feedback.json'), 'utf8'), proof: JSON.parse(readFileSync(join(outDir, 'proof.json'), 'utf8')) };
}
function expectPrivate(...texts: string[]) {
  for (const text of texts) for (const secret of ['selector-secret', 'strict mode violation', 'Timeout', 'locator(', '127.0.0.1:']) expect(text).not.toContain(secret);
}

it('names an ambiguous step selector and its match count without changing the verdict', async () => {
  const spec = scenario({ steps: [{ action: 'click', selector: ambiguous, note: 'Click the button' }],
    checks: [{ id: 'status', kind: 'text', selector: '#status', equals: 'ready' }] });
  const { result, shown, summary, report, feedback, proof } = await verify(spec, 'ambiguous-step');
  expect(result.verdict).toBe('insufficient_evidence');
  expect(proof.verdict).toBe('insufficient_evidence');
  expect(result.diagnostics.map(row => [row.category, row.run, row.step, row.diagnosis])).toEqual([1, 2].map(run =>
    ['execution_unavailable', run, 0, { kind: 'locator_ambiguous', facts: { matched: 3 } }]));
  // The MCP result is the same safe value the CLI prints.
  expect(shown.diagnostics[0].diagnosis).toEqual({ kind: 'locator_ambiguous', facts: { matched: 3 } });
  expect(summary).toContain('execution_unavailable: current run 1 step[0]; diagnosis: locator_ambiguous (3 elements)');
  expect(summary).toContain('Next: The selector matched 3 elements; make it match exactly one');
  expect(JSON.parse(feedback).diagnostics[0].diagnosis.kind).toBe('locator_ambiguous');
  expect(report.split('\n').slice(0, 6)).toEqual(['Outcome: insufficient_evidence', '', '## Checks', '',
    '| Check | Kind | After step | Run 1 | Run 2 | Diagnosis |', '| --- | --- | --- | --- | --- | --- |']);
  expect(report).toContain('| 0 | text | end | not_executed | not_executed | locator_ambiguous (3 elements) at step 0 |');
  expect(report).toContain('### Check[0]');
  expectPrivate(summary, report, feedback, JSON.stringify(shown));
}, 60_000);

it('tables passing, ambiguous and timed-out checks and keeps each verdict', async () => {
  const spec = scenario({ steps: [{ action: 'hover', selector: '#status', note: 'Hover the status' }],
    checks: [{ id: 'status', kind: 'text', selector: '#status', equals: 'ready', afterStep: 0 },
      { id: 'many', kind: 'text', selector: ambiguous, equals: 'A' },
      { id: 'absent', kind: 'text', selector: missing, equals: 'x' }] });
  const { result, summary, report, feedback } = await verify(spec, 'checks');
  expect(result.verdict).toBe('insufficient_evidence');
  expect(result.diagnostics.map(row => [row.category, row.run, row.checkIndex, row.diagnosis?.kind])).toEqual([
    ['evidence_unavailable', 1, 1, 'locator_ambiguous'], ['evidence_unavailable', 1, 2, 'locator_timeout'],
    ['evidence_unavailable', 2, 1, 'locator_ambiguous'], ['evidence_unavailable', 2, 2, 'locator_timeout']]);
  expect(result.diagnostics[1].diagnosis).toEqual({ kind: 'locator_timeout', facts: { timeoutMs: 1500 } });
  expect(summary).toContain('evidence_unavailable: current run 1 check[1]; diagnosis: locator_ambiguous (3 elements)');
  expect(report).toContain('| 0 | text | 0 | passed | passed |  |');
  expect(report).toContain('| 1 | text | end | insufficient_evidence | insufficient_evidence | locator_ambiguous (3 elements) |');
  expect(report).toContain('| 2 | text | end | insufficient_evidence | insufficient_evidence | locator_timeout (1500 ms) |');
  expectPrivate(summary, report, feedback);
}, 60_000);

it('classifies a failed navigation step', async () => {
  const spec = scenario({ steps: [{ action: 'goto', path: '/missing', note: 'Open a page' }],
    checks: [{ id: 'status', kind: 'text', selector: '#status', equals: 'ready' }] });
  const { result, summary, report } = await verify(spec, 'navigation');
  expect(result.verdict).toBe('insufficient_evidence');
  expect(result.diagnostics[0]).toMatchObject({ category: 'execution_unavailable', step: 0, diagnosis: { kind: 'navigation_failed', facts: {} } });
  expect(summary).toContain('diagnosis: navigation_failed');
  expect(report).toContain('| 0 | text | end | not_executed | not_executed | navigation_failed at step 0 |');
  expectPrivate(summary, report);
}, 60_000);

it('adds no diagnosis to a passing run and keeps its table green', async () => {
  const spec = scenario({ steps: [{ action: 'hover', selector: '#status', note: 'Hover the status' }],
    checks: [{ id: 'status', kind: 'text', selector: '#status', equals: 'ready' }] });
  const { result, report } = await verify(spec, 'passing');
  expect(result.verdict).toBe('passed');
  expect(result.diagnostics).toEqual([]);
  expect(report).toContain('| 0 | text | end | passed | passed |  |');
}, 60_000);

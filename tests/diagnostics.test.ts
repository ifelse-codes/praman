import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proveCommands } from '../src/eval/command.js';
import { checkDiagnostics, recordingDiagnostic } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';
import { changeSpecSchema } from '../src/case/change.js';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'praman-diagnosis-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('locates a private command mismatch by declaration index, result pointer and captured output', async () => {
  const secret = 'opaque-private-business-text';
  const declaration = join(root, 'input.json');
  writeFileSync(declaration, JSON.stringify({ mode: 'acceptance', title: secret, requirement: secret,
    current: { executable: process.execPath, args: ['-e', `console.log(${JSON.stringify(secret)})`], cwd: root, deadlineMs: 2000 },
    checks: [{ id: secret, source: 'stdout', operator: 'equals', value: 'different-private-value' }], repeats: 2 }));
  const result = await proveCommands(declaration, join(root, 'proof'));
  expect(result.verdict).toBe('failed');
  expect(result.diagnostics.map(row => [row.category, row.run, row.checkIndex])).toEqual([['check_mismatch', 1, 0], ['check_mismatch', 2, 0]]);
  const diagnostic = result.diagnostics[1];
  const observation = diagnostic.references.find(ref => ref.path.endsWith('stdout.txt'))!;
  expect(readFileSync(observation.path, 'utf8')).toBe(secret + '\n');
  const expected = diagnostic.references.find(ref => ref.path.endsWith('declaration.json'))!;
  expect(expected.pointer).toBe('/checks/0');
  expect(JSON.parse(readFileSync(expected.path, 'utf8')).checks[0].value).toBe('different-private-value');
  expect(diagnostic.references.find(ref => ref.path.endsWith('result.json'))?.pointer).toBe('/checks/1');
  for (const text of [JSON.stringify(result), readFileSync(result.feedbackPath, 'utf8'), readFileSync(result.report, 'utf8')]) {
    expect(text).not.toContain(secret); expect(text).not.toContain('different-private-value');
  }
});

it('retains an observed mismatch alongside unavailable execution and mode-gate failures', () => {
  const screenshot = join(root, 'check.png'); writeFileSync(screenshot, 'private image');
  const diagnostics = checkDiagnostics(root, { verdict: 'insufficient_evidence', after: [
    { verdict: 'failed', checks: [{ id: 'private-id', verdict: 'failed', observed: false, screenshot }] },
    { verdict: 'insufficient_evidence', error: 'private exception', failedStep: 3, checks: [] },
  ] }, ['private-id']);
  expect(diagnostics.map(row => [row.category, row.run, row.checkIndex, row.step])).toEqual([
    ['check_mismatch', 1, 0, undefined], ['execution_unavailable', 2, undefined, 3],
  ]);
  expect(diagnostics[0].references[0].pointer).toBe('/after/0/checks/0');
  expect(JSON.stringify(diagnostics)).not.toContain('private exception');
  expect(checkDiagnostics(root, { verdict: 'insufficient_evidence', after: [] }, ['x'])[0].category).toBe('proof_gate');
});

it('reports only reached preflight positions and does not reuse successful preflight positions for later failures', () => {
  const directory = join(root, 'video', 'preflight'); mkdirSync(directory, { recursive: true });
  const receipt = join(directory, 'preflight.json');
  writeFileSync(receipt, JSON.stringify({ status: 'blocked', position: { stage: 'after', beat: 2, step: 4 }, error: 'private exception', scenes: [{ text: 'private DOM' }] }));
  const diagnostic = recordingDiagnostic(root, join(root, 'failure.json'));
  expect(diagnostic).toMatchObject({ category: 'story_preflight', stage: 'current', beat: 2, step: 4 });
  expect(diagnostic.references.some(ref => ref.path === receipt)).toBe(true);
  expect(JSON.stringify(diagnostic)).not.toContain('private exception');
  writeFileSync(receipt, JSON.stringify({ status: 'passed', position: { stage: 'after', beat: 9 } }));
  expect(recordingDiagnostic(root, join(root, 'failure.json'))).toMatchObject({ category: 'recording_unavailable' });
  expect(recordingDiagnostic(root, join(root, 'failure.json')).beat).toBeUndefined();
});

it('withholds arbitrary application values and identifiers while preserving numeric observations and owned IDs', () => {
  const value = safeFeedbackValue({ id: 'owned-environment', checks: [{ id: 'private-check-id', verdict: 'failed', expected: 'private expectation', observed: { arbitrary: 'private DOM' } }],
    target: 'private selector', title: 'private title', next: { observed: 0, expected: true } });
  expect(value.id).toBe('owned-environment');
  expect(value.next).toEqual({ observed: 0, expected: true });
  for (const text of ['private-check-id', 'private expectation', 'private DOM', 'private selector', 'private title']) expect(JSON.stringify(value)).not.toContain(text);
});

it.each(['314159', '00314159', '3.14159e5'])('withholds numeric observations matching private input %s', privateInput => {
  const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Private input', change: 'Inspect the result', afterUrl: 'http://localhost:1',
    steps: [{ action: 'fill', selector: '#pin', value: privateInput, note: 'Enter private input' }],
    checks: [{ id: 'pin', kind: 'json', path: '/result', field: ['pin'], equals: 314159 }] });
  const value = safeFeedbackValue({ expected: 314159, observed: 314159, nested: [314159], other: { observed: 0, expected: true } }, spec);
  expect(value.expected).toBe('[REDACTED]');
  expect(value.observed).toBe('[REDACTED]');
  expect(value.nested).toEqual(['[REDACTED]']);
  expect(value.other).toEqual({ observed: 0, expected: true });
});

it('recognizes numeric credentials in sensitive fields without treating whitespace as zero', () => {
  const value = safeFeedbackValue({ password: 73182, rows: [{ observed: 73182 }, { observed: 0 }] }, undefined, [' ']);
  expect(value.password).toBe('[REDACTED]');
  expect(value.rows).toEqual([{ observed: '[REDACTED]' }, { observed: 0 }]);
});

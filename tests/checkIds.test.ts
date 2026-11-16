import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { proveCommands } from '../src/eval/command.js';
import { changeSpecSchema, type ChangeProof, type ScenarioRun } from '../src/case/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue, saveFeedback } from '../src/review/feedback.js';
import { describeBrowserCheck, describeCommandCheck } from '../src/review/describe.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-check-ids-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('authored check ids in reports', () => {
  it('command: shows ids and a plain line per check, never the expected value', async () => {
    const file = path.join(root, 'sum.json');
    writeFileSync(file, JSON.stringify({ mode: 'acceptance', title: 'Sum', requirement: 'Print the sum',
      current: { executable: process.execPath, args: ['-e', 'console.log("total=11")'], cwd: '.', deadlineMs: 5000 },
      checks: [{ id: 'total-is-ten', source: 'stdout', operator: 'contains', value: 'expected-total=10' }, { id: 'quiet', source: 'stderr', operator: 'equals', value: '' }], repeats: 2 }));
    const result = await proveCommands(file, path.join(root, 'out'));
    expect(result.verdict).toBe('failed');
    const report = readFileSync(result.report, 'utf8');
    expect(report).toContain('| Check | Id | Kind | What it checks | Run 1 | Run 2 | Diagnosis |');
    expect(report).toContain('| exit | $exit | exit | exit code equals | passed | passed |  |');
    expect(report).toContain('| 0 | total-is-ten | stdout | stdout contains | failed | failed |  |');
    expect(report).toContain('| 1 | quiet | stderr | stderr equals | passed | passed |  |');
    const feedback = JSON.parse(readFileSync(result.feedbackPath, 'utf8'));
    expect(feedback.findings.map((row: { checkId: string; description: string }) => [row.checkId, row.description]))
      .toEqual([['$exit', 'exit code equals'], ['total-is-ten', 'stdout contains'], ['quiet', 'stderr equals']]);
    const summary = formatSummary(result);
    expect(summary).toContain('check_mismatch: current run 1 check[0] (total-is-ten)');
    for (const text of [report, JSON.stringify(feedback), summary]) expect(text).not.toContain('expected-total=10');
  });

  it('browser: shows ids in REPORT.md, REPORT.html and feedback; selectors, expected values and known secrets stay withheld', () => {
    const secret = 'hunter2-fill';
    const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Login', change: 'Signs in', afterUrl: 'http://127.0.0.1:1', repeats: 2,
      steps: [{ action: 'fill', selector: '#private-password-field', value: secret, note: 'Type the password' }],
      checks: [{ id: 'greeting', kind: 'text', selector: '#private-greeting', equals: 'Welcome, private user' },
        { id: `${secret}-echo`, kind: 'count', selector: '.private-row', equals: 3 }, { id: 'runtime', kind: 'pageErrors', equals: 0 }] });
    const after = [1, 2].map(n => {
      const folder = path.join(root, `after-${n}`); mkdirSync(folder);
      const checks = spec.checks.map((check, i) => { const screenshot = path.join(folder, `check-${i + 1}.png`); writeFileSync(screenshot, 'png');
        return { id: check.id, verdict: 'passed' as const, expected: check.equals, observed: check.equals, evidence: 'private', screenshot }; });
      return { url: 'http://127.0.0.1:1', verdict: 'passed', checks, screenshots: checks.map(row => row.screenshot) } satisfies ScenarioRun;
    });
    const proof: ChangeProof = { mode: 'acceptance', specHash: 'h', verifiedAt: '2026-11-16T00:00:00.000Z', scope: 'Only the declared scenario.', verdict: 'passed', reason: 'Fixture', after };
    const saved = saveFeedback(spec, proof, root);
    const report = readFileSync(saved.report, 'utf8');
    expect(report).toContain('| Check | Id | Kind | What it checks | After step | Run 1 | Run 2 | Diagnosis |');
    expect(report).toContain('| 0 | greeting | text | element text equals | end | passed | passed |  |');
    expect(report).toContain('| 1 | [REDACTED]-echo | count | element count equals | end | passed | passed |  |');
    expect(report).toContain('### Check[0] greeting — passed');
    expect(report).toContain('What it checks: no page runtime errors.');
    const html = readFileSync(saved.reportHtml, 'utf8');
    expect(html).toContain('<td>greeting</td><td>text</td><td>element text equals</td>');
    const feedback = readFileSync(saved.feedbackPath, 'utf8');
    expect(JSON.parse(feedback).findings[0]).toMatchObject({ checkId: 'greeting', description: 'element text equals' });
    for (const text of [report, feedback, JSON.stringify(safeFeedbackValue(saved, spec))]) {
      for (const hidden of [secret, '#private-greeting', 'Welcome, private user', '.private-row', '#private-password-field']) expect(text).not.toContain(hidden);
    }
  });

  it('describes every check kind from its kind, source and operator only', () => {
    expect(['text', 'value', 'visible', 'attribute', 'class', 'json', 'pageErrors', 'image', 'count', 'network'].map(kind => describeBrowserCheck({ kind }))).toEqual([
      'element text equals', 'input value equals', 'element visibility equals', 'element attribute equals', 'element class token presence equals',
      'same-origin JSON field equals', 'no page runtime errors', 'image loads with real dimensions', 'element count equals', 'matching network request count equals']);
    expect(describeBrowserCheck({ kind: 'state', state: 'checked' })).toBe('element checked state equals');
    expect(describeCommandCheck({ source: 'artifact', operator: 'matches' })).toBe('artifact matches');
    expect(describeCommandCheck({ source: 'artifact', operator: 'video' })).toBe('artifact video format and properties');
  });
});

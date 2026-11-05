import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { changeSpecSchema, type ChangeProof, type ScenarioRun } from '../src/case/change.js';
import { buildFeedback, safeFeedbackValue, saveFeedback } from '../src/review/feedback.js';
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'praman-feedback-')); writeFileSync(join(dir, 'check.png'), 'evidence'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const spec = changeSpecSchema.parse({ mode: 'repair', baselineKind: 'historical', title: 'Image preview', change: 'Decode the uploaded image', beforeUrl: 'http://localhost:1', afterUrl: 'http://localhost:2',
  steps: [{ action: 'fill', selector: 'input[name=password]', value: 'private pass!word', note: 'Authenticate' }, { action: 'click', selector: '#open', note: 'Open preview' }],
  checks: [{ id: 'preview', kind: 'image', selector: '#preview', equals: true }, { id: 'outage-message', kind: 'visible', selector: '#success', equals: false }], regressionCheck: 'preview' });
function run(url: string, preview = true): ScenarioRun {
  return { url, verdict: preview ? 'passed' : 'failed', screenshots: [join(dir, 'check.png')], checks: [
    { id: 'preview', verdict: preview ? 'passed' : 'failed', expected: true, observed: preview, evidence: 'private', screenshot: join(dir, 'check.png') },
    { id: 'outage-message', verdict: 'passed', expected: false, observed: false, evidence: 'private', screenshot: join(dir, 'check.png') },
  ] };
}
function proof(): ChangeProof {
  return { mode: 'repair', baselineKind: 'historical', specHash: 'hash', verifiedAt: '2026-11-02T00:00:00Z', scope: 'Declared checks only; not whole-app correctness.', verdict: 'passed', reason: 'Named regression reproduced',
    before: run(spec.beforeUrl!, false), after: [run(spec.afterUrl), run(spec.afterUrl)] };
}
describe('declared-scenario feedback', () => {
  it('separates resolved historical failure and satisfied negative assertions from current repairs', () => {
    const feedback = buildFeedback(spec, proof(), dir, { environmentId: 'owned-id', generation: 2 });
    expect(feedback.findings.map(row => row.status)).toEqual(['resolved_regression', 'passed']);
    expect(feedback.findings[0].occurrences.map(row => row.version)).toEqual(['before', 'current', 'current']);
    expect(feedback.reproduction.setup).toContain('fresh managed instance');
    expect(feedback.reproduction.steps[0]).toEqual({ step: 0, action: 'fill' });
  });
  it('groups intermittent current failures without hiding unaffected assertions or run observations', () => {
    const input = proof(); input.verdict = 'failed'; input.after[0] = run(spec.afterUrl, false);
    const feedback = buildFeedback(spec, input, dir);
    expect(feedback.findings.map(row => row.status)).toEqual(['current_failure', 'passed']);
    expect(feedback.findings[0].occurrences.map(row => row.observed)).toEqual([false, false, true]);
    expect(feedback.findings[0].rootCause).toBe('unknown');
  });
  it('never turns missing screenshot, observation or repetition into a pass', () => {
    const input = proof(); input.verdict = 'insufficient_evidence';
    input.after[0].checks[0].screenshot = join(dir, 'missing.png');
    delete input.after[1].checks[0].observed;
    const feedback = buildFeedback(spec, input, dir);
    expect(feedback.findings[0].status).toBe('incomplete');
    expect(feedback.findings[0].occurrences.slice(1).map(row => row.verdict)).toEqual(['insufficient_evidence', 'insufficient_evidence']);
    input.after.pop();
    const absent = buildFeedback(spec, input, dir);
    expect(absent.findings[0].occurrences[2]).toMatchObject({ verdict: 'not_executed' });
    expect(absent.issues).toContain('Expected 2 current runs; retained 1.');
  });
  it('attributes unavailable actions and preserves an earlier observed mismatch in a mixed incomplete proof', () => {
    const input = proof(); input.verdict = 'insufficient_evidence';
    input.after[0] = run(spec.afterUrl, false); input.after[1].checks = [];
    input.after[1].error = 'Failed private pass!word'; input.after[1].failedStep = 1;
    const feedback = buildFeedback(spec, input, dir);
    expect(feedback.findings[0].status).toBe('current_failure');
    expect(feedback.findings[0].occurrences[2]).toMatchObject({ verdict: 'not_executed', failedStep: 1 });
    expect(feedback.issues.some(issue => issue.includes('step 1'))).toBe(true);
    expect(JSON.stringify(feedback)).not.toContain('private pass!word');
  });
  it('does not declare a named regression resolved when another declared check lacks evidence', () => {
    const input = proof(); input.after[0].checks[1].screenshot = join(dir, 'missing.png');
    expect(buildFeedback(spec, input, dir).findings[0].status).not.toBe('resolved_regression');
  });
  it('withholds credential-bearing errors, headers, nested signed image URLs and all private fill values', () => {
    const signed = 'http://storage/image.png?X-Amz-Credential=aws-credential&X-Amz-Signature=signed-secret';
    const payload = { proof: { before: { error: 'Unknown prose: hidden-error-secret', checks: [{ evidence: signed, expected: 'private pass!word', observed: `http://user:user-secret@localhost/_next/image?url=${encodeURIComponent(signed)}&w=20` }] } },
      headers: { Authorization: 'Bearer header-secret', Cookie: 'session=cookie-secret' },
      fields: [{ name: 'Authorization', value: 'array-header-secret' }, { name: 'password', value: 'array-form-secret' }],
      database: 'postgresql://user:database-secret@localhost/db?token=query-secret',
      failure: 'password=labelled-secret', form: { password: 'form-secret' },
      other: 'private%20pass!word', url: 'http://localhost/path#fragment-secret' };
    const safe = JSON.stringify(safeFeedbackValue(payload, spec));
    for (const secret of ['private pass!word', 'private%20pass!word', 'aws-credential', 'signed-secret', 'user-secret', 'header-secret', 'cookie-secret', 'labelled-secret', 'form-secret', 'fragment-secret', 'hidden-error-secret', 'array-header-secret', 'array-form-secret', 'database-secret', 'query-secret']) expect(safe).not.toContain(secret);
  });
  it('saves safe text and JSON while leaving original proof objects and raw files unchanged', () => {
    const input = proof(); input.after[0].checks[0].observed = 'private pass!word';
    input.before!.checks[0].evidence = 'signed-private-secret';
    const raw = JSON.stringify(input); writeFileSync(join(dir, 'proof.json'), raw);
    const { feedbackPath, report } = saveFeedback(spec, input, dir);
    for (const file of [feedbackPath, report]) {
      const text = readFileSync(file, 'utf8'); expect(text).not.toContain('private pass!word'); expect(text).not.toContain('signed-private-secret');
    }
    expect(readFileSync(join(dir, 'proof.json'), 'utf8')).toBe(raw);
    expect(input.before!.checks[0].evidence).toBe('signed-private-secret');
  });
});

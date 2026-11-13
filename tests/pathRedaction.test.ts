import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

// A declared private value (a fill input) that is also the name of a folder the caller chose for the output.
const privateName = 'shiori-owner';
let root: string;
let outDir: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'praman-paths-'));
  outDir = join(root, privateName, 'runs', '1-verify');
  mkdirSync(outDir, { recursive: true });
  for (const file of ['REPORT.html', 'REPORT.md', 'feedback.json', 'proof.json']) writeFileSync(join(outDir, file), 'x');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Sign in', change: 'The owner can sign in', afterUrl: 'http://127.0.0.1:1',
  steps: [{ action: 'fill', selector: '#username', value: privateName, note: 'Enter the user name' },
    { action: 'fill', selector: '#password', value: 'gopher-pass', note: 'Enter the password' }],
  checks: [{ id: 'in', kind: 'visible', selector: '#home', equals: true }] });

function record() {
  return {
    action: 'verify', id: 'abc', directory: join(root, privateName),
    verdict: 'passed',
    evidence: {
      output: outDir, proofPath: join(outDir, 'proof.json'),
      feedbackPath: join(outDir, 'feedback.json'), report: join(outDir, 'REPORT.md'), reportHtml: join(outDir, 'REPORT.html'),
      identityEvidence: { path: join(outDir, 'proof.json'), private: true },
      references: [{ kind: 'proof', path: join(outDir, 'proof.json'), exists: true, private: true }],
      message: `Signed in as ${privateName} with gopher-pass`,
      observedUrl: `http://127.0.0.1:1/users/${privateName}`,
    },
    reportHtml: join(outDir, 'REPORT.html'),
  };
}

describe('returned output paths', () => {
  it('keeps a path that contains a declared private value openable and says so once', () => {
    const shown = safeFeedbackValue(record(), spec) as ReturnType<typeof record> & { pathNote?: string };
    for (const path of [shown.reportHtml, shown.evidence.reportHtml, shown.evidence.report, shown.evidence.feedbackPath, shown.evidence.proofPath,
      shown.evidence.output, shown.directory, shown.evidence.identityEvidence.path, shown.evidence.references[0].path]) {
      expect(path, path).not.toContain('[REDACTED]');
      expect(existsSync(path), path).toBe(true);
    }
    expect(shown.pathNote).toBe('A known private value occurs in a returned path; the folder name was chosen by the caller.');
    expect(JSON.stringify(shown)).not.toContain('gopher-pass');
  });

  it('still redacts the same value in every field that is not an output path', () => {
    const shown = safeFeedbackValue(record(), spec);
    expect(shown.evidence.message).toBe('Signed in as [REDACTED] with [REDACTED]');
    expect(shown.evidence.observedUrl).toBe('http://127.0.0.1:1/users/[REDACTED]');
    // The note never carries the value.
    expect((shown as { pathNote?: string }).pathNote).not.toContain(privateName);
  });

  it('still hides credential fields and a path-named field that is not a path', () => {
    const shown = safeFeedbackValue({ ...record(), password: 'p1', evidence: { ...record().evidence, output: 'http://h/a?token=zzz', report: 'line one\nsecret=abc',
      headers: [{ name: 'authorization', value: 'Bearer abc' }] } }, spec) as unknown as { password: string; evidence: { output: string; report: string; headers: string } };
    expect(shown.password).toBe('[REDACTED]');
    expect(shown.evidence.headers).toBe('[REDACTED]');
    expect(shown.evidence.output).toBe('http://h/a?[REDACTED]');
    expect(shown.evidence.report).not.toContain('abc');
  });

  it('adds no note when no known private value occurs in a returned path', () => {
    const plain = { ...record(), directory: root, evidence: { output: root, reportHtml: join(root, 'x.html') }, reportHtml: join(root, 'x.html') };
    const shown = safeFeedbackValue(plain, spec) as { pathNote?: string };
    expect(shown.pathNote).toBeUndefined();
  });

  it('does not add a note for an array result', () => {
    expect(safeFeedbackValue([{ output: outDir }], spec)).toEqual([{ output: outDir }]);
  });
});

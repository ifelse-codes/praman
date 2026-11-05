import { describe, expect, it } from 'vitest';
import { selectCodeExcerpts } from '../src/report/codeExcerpts.js';
import { changeSpecSchema } from '../src/case/change.js';

const diff = `--- a/settings.ts
+++ b/settings.ts
@@ -10,4 +10,5 @@
 const storage = {
-  host: guessHost(endpoint),
+  host: new URL(endpoint).hostname,
+  port: new URL(endpoint).port,
 };
 export default storage;
@@ -30 +31 @@
-const legacy = true;
+const legacy = false;
--- a/other.ts
+++ b/other.ts
@@ -10 +10 @@
-old unrelated code
+new unrelated code
`;

describe('focused source presentation', () => {
  it('keeps old and new line coordinates distinct across insertions, hunks and files', () => {
    const excerpts = selectCodeExcerpts(diff, [
      { file: 'settings.ts', side: 'before', from: 10, to: 13, label: 'Previously' },
      { file: 'settings.ts', side: 'after', from: 10, to: 14, label: 'Now' },
    ]);
    expect(excerpts[0].lines).toEqual([
      { number: 10, code: 'const storage = {', changed: false },
      { number: 11, code: '  host: guessHost(endpoint),', changed: true },
      { number: 12, code: '};', changed: false },
      { number: 13, code: 'export default storage;', changed: false },
    ]);
    expect(excerpts[1].lines).toEqual([
      { number: 10, code: 'const storage = {', changed: false },
      { number: 11, code: '  host: new URL(endpoint).hostname,', changed: true },
      { number: 12, code: '  port: new URL(endpoint).port,', changed: true },
      { number: 13, code: '};', changed: false },
      { number: 14, code: 'export default storage;', changed: false },
    ]);
  });

  it('rejects absent ranges and incomplete source rather than fabricating code', () => {
    expect(() => selectCodeExcerpts(diff, [{ file: 'settings.ts', side: 'after', from: 13, to: 15, label: 'Now' }])).toThrow('not fully present');
    expect(() => selectCodeExcerpts(diff, [{ file: 'missing.ts', side: 'before', from: 10, to: 10, label: 'Previously' }])).toThrow('not fully present');
    expect(() => selectCodeExcerpts('--- a/file\n+++ b/file\n@@ -1,2 +1,2 @@\n one line\n')).toThrow('incomplete source hunk');
  });

  it('marks omitted ranges and treats header-like source as source inside a hunk', () => {
    expect(selectCodeExcerpts(diff)[0].lines).toEqual([
      { number: 11, code: '  host: guessHost(endpoint),', changed: true },
      { number: null, code: '… omitted lines …', changed: false },
      { number: 30, code: 'const legacy = true;', changed: true },
    ]);
    expect(selectCodeExcerpts('--- a/file\n+++ b/file\n@@ -1 +1 @@\n--- previously\n+++ now\n')[1].lines)
      .toEqual([{ number: 1, code: '++ now', changed: true }]);
  });

  it('rejects unreachable presentation beats and early runtime-error verdicts', () => {
    const base = { mode: 'repair', baselineKind: 'historical', title: 'Product details', change: 'Correct the product name', beforeUrl: 'http://localhost:1', afterUrl: 'http://localhost:2',
      steps: [{ action: 'hover', selector: '#details', note: 'Open details' }],
      checks: [{ id: 'name', kind: 'text', selector: '#name', equals: 'Widget' }], regressionCheck: 'name' };
    expect(changeSpecSchema.safeParse({ ...base, checks: [...base.checks, { id: 'errors', kind: 'pageErrors', equals: 0, afterStep: 0 }] }).success).toBe(false);
    expect(changeSpecSchema.safeParse({ ...base, walkthrough: { startStep: 0, before: [{ step: 2, text: 'Unavailable action' }],
      after: [{ step: 0, text: 'Open details' }], code: { text: 'Correct the name' } } }).success).toBe(false);
  });
  it('rejects narration pointing outside the displayed source or at the wrong version', () => {
    const base = { mode: 'repair', baselineKind: 'historical', title: 'Storage preview', change: 'Match the endpoint', beforeUrl: 'http://localhost:1', afterUrl: 'http://localhost:2',
      steps: [{ action: 'hover', selector: '#preview', note: 'Inspect preview' }],
      checks: [{ id: 'preview', kind: 'visible', selector: '#preview', equals: true }], regressionCheck: 'preview', diffPath: 'change.diff' };
    const code = { text: 'Use the endpoint', excerpts: [{ file: 'settings.ts', side: 'after', from: 10, to: 14, label: 'Now' }] };
    for (const focus of [
      { file: 'settings.ts', side: 'after', from: 13, to: 15 },
      { file: 'settings.ts', side: 'before', from: 10, to: 12 },
      { file: 'other.ts', side: 'after', from: 10, to: 12 },
      { file: 'settings.ts', side: 'after', from: 12, to: 10 },
    ]) {
      expect(changeSpecSchema.safeParse({ ...base, walkthrough: { startStep: 0, before: [{ step: 0, text: 'Before' }],
        after: [{ step: 0, text: 'After' }], code: { ...code, beats: [{ text: 'This is the change', focus }] } } }).success).toBe(false);
    }
  });
});

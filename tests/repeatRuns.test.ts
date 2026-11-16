import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { proveCommands } from '../src/eval/command.js';
import { changeSpecSchema } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-repeat-')); mkdirSync(path.join(root, '.praman')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function declare(extra: object = {}, file = 'check.json') {
  writeFileSync(path.join(root, 'helper.mjs'), readHelper());
  const spec = { mode: 'acceptance', title: 'Count', requirement: 'Count items',
    current: { executable: process.execPath, args: ['helper.mjs'], cwd: '.', deadlineMs: 5000, identity: { files: [{ role: 'script', path: 'helper.mjs' }] } },
    checks: [{ id: 'count', source: 'stdout', operator: 'contains', value: 'items=3' }], repeats: 2, ...extra };
  writeFileSync(path.join(root, file), JSON.stringify(spec));
  return path.join(root, file);
}
let helper = 'console.log("items=3")';
const readHelper = () => helper;
const run = (declaration: string, name: string) => proveCommands(declaration, path.join(root, '.praman', name));

describe('a run that repeats an earlier one', () => {
  beforeEach(() => { helper = 'console.log("items=3")'; });

  it('is marked when the declaration and declared inputs are the same as a sibling run; the verdict is unchanged', async () => {
    const declaration = declare();
    const first = await run(declaration, 'verify-1');
    expect(first.verdict).toBe('passed');
    expect(first).not.toHaveProperty('repeatNote');
    const second = await run(declaration, 'verify-2');
    expect(second.verdict).toBe('passed');
    expect(second.repeatOf).toBe(path.join(root, '.praman', 'verify-1'));
    expect(second.repeatNote).toContain('this run proves nothing new about a change');
    const summary = formatSummary(second);
    expect(summary).toContain('Repeat: Same declaration and declared inputs as an earlier run (passed, ');
    expect(summary).toContain(`Earlier run: ${path.join(root, '.praman', 'verify-1')}`);
    expect(readFileSync(second.report, 'utf8')).toContain('Repeat: Same declaration and declared inputs');
    const feedback = JSON.parse(readFileSync(second.feedbackPath, 'utf8'));
    expect(feedback.repeatOf).toBe(path.join(root, '.praman', 'verify-1'));
    const proofs = [first, second].map(result => JSON.parse(readFileSync(result.proofPath, 'utf8')));
    expect(proofs[0].inputsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proofs[1].inputsHash).toBe(proofs[0].inputsHash);
    // A third identical run points at the newest earlier run.
    const third = await run(declaration, 'verify-3');
    expect(third.repeatOf).toBe(path.join(root, '.praman', 'verify-2'));
  });

  it('is not marked when a declared input changed, the declaration changed, or the earlier run is elsewhere', async () => {
    const declaration = declare();
    await run(declaration, 'verify-1');
    helper = 'console.log("items=3"); // changed helper';
    declare();
    const changedInput = await run(declaration, 'verify-2');
    expect(changedInput).not.toHaveProperty('repeatOf');
    const changedDeclaration = await run(declare({ title: 'Count again' }, 'check-2.json'), 'verify-3');
    expect(changedDeclaration).not.toHaveProperty('repeatOf');
    const elsewhere = await proveCommands(declaration, path.join(root, 'other-parent', 'verify-1'));
    expect(elsewhere).not.toHaveProperty('repeatOf');
  });

  it('ignores a sibling folder with an unreadable or older-format proof', async () => {
    const declaration = declare();
    mkdirSync(path.join(root, '.praman', 'broken'));
    writeFileSync(path.join(root, '.praman', 'broken', 'proof.json'), '{ not json');
    mkdirSync(path.join(root, '.praman', 'old'));
    writeFileSync(path.join(root, '.praman', 'old', 'proof.json'), JSON.stringify({ verdict: 'passed', verifiedAt: '2026-11-01T00:00:00.000Z' }));
    const result = await run(declaration, 'verify-1');
    expect(result.verdict).toBe('passed');
    expect(result).not.toHaveProperty('repeatOf');
  });

  describe('browser scenarios', () => {
    let server: Server, origin: string;
    beforeEach(async () => {
      server = createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1 id="title">Board</h1>'); });
      const listening = once(server, 'listening'); server.listen(0, '127.0.0.1'); await listening;
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
      origin = `http://127.0.0.1:${address.port}`;
    });
    afterEach(async () => { const closed = once(server, 'close'); server.close(); await closed; });

    it('marks the second identical scenario run in the summary, REPORT.md, REPORT.html and safe output', async () => {
      const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Board', change: 'Shows the board', afterUrl: origin, repeats: 2,
        steps: [{ action: 'waitFor', selector: '#title', note: 'Wait for the board' }], checks: [{ id: 'title', kind: 'text', selector: '#title', equals: 'Board' }] });
      const first = await proveChange(spec, path.join(root, '.praman', 'scenario-1'));
      expect(first.proof.repeatOf).toBeUndefined();
      const out = path.join(root, '.praman', 'scenario-2');
      const second = await proveChange(spec, out);
      expect(second.verdict).toBe('passed');
      const shown = safeFeedbackValue(second, spec);
      expect(shown.repeatOf).toBe(path.join(root, '.praman', 'scenario-1'));
      expect(formatSummary(shown)).toContain('Repeat: Same declaration and declared inputs as an earlier run (passed, ');
      expect(readFileSync(path.join(out, 'REPORT.md'), 'utf8')).toContain('Repeat: Same declaration');
      expect(readFileSync(path.join(out, 'REPORT.html'), 'utf8')).toContain('this run proves nothing new about a change');
    }, 60_000);
  });
});

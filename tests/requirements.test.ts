import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandProofSchema, proveCommands } from '../src/eval/command.js';
import { changeSpecSchema } from '../src/case/change.js';
import { hashSpec, proveChange } from '../src/eval/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-requirements-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const node = (code: string) => ({ executable: process.execPath, args: ['-e', code], cwd: '.', deadlineMs: 5000 });
const commandDeclaration = (extra: object = {}, code = 'console.log("total=10")') => ({ mode: 'acceptance', title: 'Sum', requirement: 'Print the sum', current: node(code),
  checks: [{ id: 'total', source: 'stdout', operator: 'contains', value: 'total=10' }, { id: 'no-warning', source: 'stderr', operator: 'equals', value: '' }], repeats: 2, ...extra });
async function command(extra: object = {}, code?: string, name = 'run') {
  const file = path.join(root, `${name}.json`);
  writeFileSync(file, JSON.stringify(commandDeclaration(extra, code)));
  return proveCommands(file, path.join(root, name));
}

describe('requirements in command declarations', () => {
  it('passes when every requirement has a passing check and says how many are covered', async () => {
    const result = await command({ requirements: [
      { id: 'R1', text: 'Print the sum of the values', checks: ['total'] },
      { id: 'R2', text: 'Exit cleanly without warnings', checks: ['$exit', 'no-warning'] }] });
    expect(result.verdict).toBe('passed');
    expect(result.requirements).toMatchObject({ declared: true, total: 2, checked: 2, untested: [],
      requirements: [{ id: 'R1', checks: ['total'], status: 'passed' }, { id: 'R2', checks: ['$exit', 'no-warning'], status: 'passed' }] });
    expect(formatSummary(result)).toContain('Requirements: 2 of 2 have a check (2 passed).');
    // Last key, so an MCP client that shows only the end of a long result still sees it.
    expect(Object.keys(result).at(-1)).toBe('coverageSummary');
    expect(result.coverageSummary).toBe('Requirements: 2 of 2 have a check (2 passed). App under test: not identified. Declare "target" (for example a command that prints the git commit) to record which version was tested.');
    const proof = JSON.parse(readFileSync(result.proofPath, 'utf8'));
    expect(proof.requirements.summary).toBe('Requirements: 2 of 2 have a check (2 passed).');
    // The requirement text stays in the private declaration; results carry ids and statuses only.
    for (const text of [JSON.stringify(result), readFileSync(result.feedbackPath, 'utf8'), readFileSync(result.report, 'utf8')]) expect(text).not.toContain('Print the sum of the values');
  });

  it('turns a would-be pass into not proven when a requirement has no check, and names it', async () => {
    const result = await command({ requirements: [
      { id: 'R1', text: 'Print the sum', checks: ['total'] },
      { id: 'R2', text: 'Reject a list that is not numbers', checks: [] },
      { id: 'R3', text: 'Two people sign a close', checks: [] }] });
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.feedback.reason).toContain('2 of 3 declared requirements have no check (R2, R3)');
    expect(result.requirements.untested).toEqual(['R2', 'R3']);
    const summary = formatSummary(result);
    expect(summary).toContain('Outcome: insufficient_evidence');
    expect(summary).toContain('Requirements: 1 of 3 have a check (1 passed). No check: R2, R3.');
    expect(summary).toContain('requirement_untested: requirement R2');
    expect(summary).toContain('declaration.json#/requirements/1');
    expect(result.diagnostics.map(row => row.category)).toEqual(['requirement_untested', 'requirement_untested']);
    const report = readFileSync(result.report, 'utf8');
    expect(report).toContain('## Requirements');
    expect(report).toContain('| R2 | none | untested |');
    expect(report).toContain('| R1 | total | passed |');
  });

  it('keeps an observed failure failed even when a requirement also has no check', async () => {
    const result = await command({ requirements: [{ id: 'R1', text: 'Print the sum', checks: ['total'] }, { id: 'R2', text: 'Untested', checks: [] }] }, 'console.log("total=11")');
    expect(result.verdict).toBe('failed');
    expect(result.requirements.requirements.map(row => row.status)).toEqual(['failed', 'untested']);
  });

  it('rejects unknown check ids and duplicate requirement ids before anything runs', () => {
    const issues = (value: object) => { const parsed = commandProofSchema.safeParse(commandDeclaration(value)); return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`); };
    expect(issues({ requirements: [{ id: 'R1', text: 'x', checks: ['totl'] }] })).toContain('requirements.0.checks.0: requirements[0] refers to unknown check id "totl"');
    expect(issues({ requirements: [{ id: 'R1', text: 'x', checks: [] }, { id: 'R1', text: 'y', checks: [] }] })).toContain('requirements.1.id: Duplicate requirement id "R1"');
    expect(issues({ requirements: [] })).not.toEqual([]);
  });

  it('keeps a declaration without the list unchanged: same verdict, same hash, coverage "not declared"', async () => {
    const parsed = commandProofSchema.parse(commandDeclaration());
    expect('requirements' in parsed).toBe(false);
    const result = await command();
    expect(result.verdict).toBe('passed');
    expect(result.requirements.declared).toBe(false);
    expect(formatSummary(result)).toContain('Requirements: not declared.');
    const proof = JSON.parse(readFileSync(result.proofPath, 'utf8'));
    const spec = JSON.parse(readFileSync(path.join(root, 'run', 'declaration.json'), 'utf8'));
    expect(proof.specHash).toBe(createHash('sha256').update(JSON.stringify(spec)).digest('hex'));
    expect('requirements' in spec).toBe(false);
  });
});

describe('requirements in browser scenarios', () => {
  const base = { mode: 'acceptance', title: 'Board', change: 'Shows the board', afterUrl: 'http://127.0.0.1:1', repeats: 2,
    steps: [{ action: 'waitFor', selector: '#title', note: 'Wait for the board' }],
    checks: [{ id: 'title', kind: 'text', selector: '#title', equals: 'Board' }, { id: 'runtime', kind: 'pageErrors', equals: 0 }] };
  const issues = (value: object) => { const parsed = changeSpecSchema.safeParse({ ...base, ...value }); return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`); };

  it('accepts check and invariant ids, rejects unknown and ambiguous ids, and keeps the old hash without the list', () => {
    expect(issues({ requirements: [{ id: 'R1', text: 'Title', checks: ['title', 'runtime'] }] })).toEqual([]);
    expect(issues({ requirements: [{ id: 'R1', text: 'Title', checks: ['titel'] }] })).toContain('requirements.0.checks.0: requirements[0] refers to unknown check id "titel"');
    const users = { count: 2, after: [{ action: 'waitFor', selector: '#title', note: 'Look' }] };
    expect(issues({ users: { ...users, invariants: [{ id: 'one-board', kind: 'count', selector: '.board', equals: { perUser: 1 } }] }, requirements: [{ id: 'R1', text: 'One board each', checks: ['one-board'] }] })).toEqual([]);
    expect(issues({ users: { ...users, invariants: [{ id: 'title', kind: 'count', selector: '.board', equals: { perUser: 1 } }] }, requirements: [{ id: 'R1', text: 'x', checks: ['title'] }] }))
      .toContain('requirements.0.checks.0: "title" is both a check id and an invariant id; rename one');
    const plain = changeSpecSchema.parse(base);
    expect('requirements' in plain).toBe(false);
    expect(hashSpec(plain)).toBe(hashSpec(changeSpecSchema.parse(JSON.parse(JSON.stringify(base)))));
  });

  describe('against a real page', () => {
    let server: Server, origin: string;
    beforeEach(async () => {
      server = createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1 id="title">Board</h1>'); });
      const listening = once(server, 'listening'); server.listen(0, '127.0.0.1'); await listening;
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
      origin = `http://127.0.0.1:${address.port}`;
    });
    afterEach(async () => { const closed = once(server, 'close'); server.close(); await closed; });

    it('reports coverage in the summary, REPORT.md, REPORT.html and feedback; an untested requirement is not proven', async () => {
      const covered = changeSpecSchema.parse({ ...base, afterUrl: origin, requirements: [{ id: 'R1', text: 'Shows the board title', checks: ['title'] }, { id: 'R2', text: 'No page errors', checks: ['runtime'] }] });
      const ok = await proveChange(covered, path.join(root, 'covered'));
      expect(ok.verdict).toBe('passed');
      expect(formatSummary(safeFeedbackValue(ok, covered))).toContain('Requirements: 2 of 2 have a check (2 passed).');
      expect(Object.keys(safeFeedbackValue(ok, covered)).at(-1)).toBe('coverageSummary');
      const gap = changeSpecSchema.parse({ ...base, afterUrl: origin, requirements: [{ id: 'R1', text: 'Shows the board title', checks: ['title'] }, { id: 'R4', text: 'Timeline lists events newest first', checks: [] }] });
      const out = path.join(root, 'gap');
      const result = await proveChange(gap, out);
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.proof.reason).toContain('1 of 2 declared requirements have no check (R4)');
      expect(result.proof.after.every(run => run.verdict === 'passed')).toBe(true);
      const shown = safeFeedbackValue(result, gap);
      expect(formatSummary(shown)).toContain('No check: R4.');
      expect(formatSummary(shown)).toContain('requirement_untested: requirement R4');
      expect(formatSummary(shown)).not.toContain('proof_gate');
      expect(readFileSync(path.join(out, 'REPORT.md'), 'utf8')).toContain('| R4 | none | untested |');
      const html = readFileSync(path.join(out, 'REPORT.html'), 'utf8');
      expect(html).toContain('Timeline lists events newest first');
      expect(html).toContain('Requirement R4 has no check');
      const feedback = JSON.parse(readFileSync(path.join(out, 'feedback.json'), 'utf8'));
      expect(feedback.requirements.untested).toEqual(['R4']);
      expect(JSON.stringify(feedback)).not.toContain('Timeline lists events newest first');
    }, 60_000);
  });
});

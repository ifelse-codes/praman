import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { proveCommands } from '../src/eval/command.js';
import { changeSpecSchema } from '../src/case/change.js';
import { loadChangeSpec } from '../src/case/loadChange.js';
import { proveChange } from '../src/eval/change.js';
import { workflowSchema } from '../src/case/workflow.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';
import { relativePathArguments } from '../src/mcp/paths.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-target-')); mkdirSync(path.join(root, '.praman')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const node = (code: string) => ({ executable: process.execPath, args: ['-e', code], cwd: '.' });
// Prints the content of version.txt: the "app under test" of these tests.
const readVersion = node('process.stdout.write(require("fs").readFileSync("version.txt", "utf8"))');
// Bumps a counter on every reading, so the version changes between readings.
const bumping = node('const fs=require("fs");const n=Number(fs.existsSync("n.txt")?fs.readFileSync("n.txt","utf8"):0)+1;fs.writeFileSync("n.txt",String(n));console.log("build-"+n)');
function declaration(target?: object, file = 'check.json') {
  writeFileSync(path.join(root, file), JSON.stringify({ mode: 'acceptance', title: 'Sum', requirement: 'Print the sum',
    current: { ...node('console.log("total=10")'), deadlineMs: 5000 }, checks: [{ id: 'total', source: 'stdout', operator: 'contains', value: 'total=10' }], repeats: 2,
    ...(target ? { target } : {}) }));
  return path.join(root, file);
}
const verify = (file: string, name: string) => proveCommands(file, path.join(root, '.praman', name));

describe('app under test (declared target)', () => {
  it('records a short version read before every run and after the last, and prints it next to the identity line', async () => {
    writeFileSync(path.join(root, 'version.txt'), '3f2a1c9\n');
    const result = await verify(declaration(readVersion), 'verify-1');
    expect(result.verdict).toBe('passed');
    expect(result.appUnderTest).toMatchObject({ status: 'identified', value: '3f2a1c9' });
    const proof = JSON.parse(readFileSync(result.proofPath, 'utf8'));
    expect(proof.appUnderTest.readings.map((row: { label: string }) => row.label)).toEqual(['before run 1', 'before run 2', 'after the last run']);
    expect(formatSummary(result)).toContain('App under test: 3f2a1c9 (same before every run and after the last).');
    const report = readFileSync(result.report, 'utf8');
    expect(report).toContain('Identity of the runner, the executable and the declared files: stable.');
    expect(report).toContain('App under test: 3f2a1c9');
  });

  it('says "not identified" without a target and keeps the verdict', async () => {
    const result = await verify(declaration(), 'verify-1');
    expect(result.verdict).toBe('passed');
    expect(result.appUnderTest.status).toBe('not_declared');
    expect(formatSummary(result)).toContain('App under test: not identified.');
  });

  it('is not proven when the target changes during verification or cannot be read', async () => {
    const changed = await verify(declaration(bumping), 'verify-1');
    expect(changed.verdict).toBe('insufficient_evidence');
    expect(changed.appUnderTest.status).toBe('changed');
    expect(changed.diagnostics.map(row => row.category)).toEqual(['target_unavailable']);
    expect(formatSummary(changed)).toContain('App under test: changed during verification');
    const failing = await verify(declaration(node('process.exit(3)'), 'fail.json'), 'verify-2');
    expect(failing.verdict).toBe('insufficient_evidence');
    expect(failing.appUnderTest.status).toBe('unavailable');
    expect(failing.feedback.reason).toContain('could not be read');
    const empty = await verify(declaration(node(''), 'empty.json'), 'verify-3');
    expect(empty.appUnderTest.status).toBe('unavailable');
    // An observed failure stays failed.
    writeFileSync(path.join(root, 'bad.json'), JSON.stringify({ mode: 'acceptance', title: 'Sum', requirement: 'Print the sum', current: { ...node('console.log("total=11")'), deadlineMs: 5000 },
      checks: [{ id: 'total', source: 'stdout', operator: 'contains', value: 'total=10' }], repeats: 2, target: node('process.exit(3)') }));
    expect((await verify(path.join(root, 'bad.json'), 'verify-4')).verdict).toBe('failed');
  });

  it('shows a long or multi-word reading only as a short hash', async () => {
    writeFileSync(path.join(root, 'version.txt'), 'build 42 from branch main\n');
    const result = await verify(declaration(readVersion), 'verify-1');
    expect(result.appUnderTest.value).toBeUndefined();
    expect(result.appUnderTest.summary).toMatch(/^App under test: sha256:[a-f0-9]{12} /);
  });

  it('tells a changed app apart from a repeat of the same declaration', async () => {
    const file = declaration(readVersion);
    writeFileSync(path.join(root, 'version.txt'), 'v1');
    await verify(file, 'verify-1');
    writeFileSync(path.join(root, 'version.txt'), 'v2');
    const changedApp = await verify(file, 'verify-2');
    expect(changedApp).not.toHaveProperty('repeatOf');
    const sameApp = await verify(file, 'verify-3');
    expect(sameApp.repeatOf).toBe(path.join(root, '.praman', 'verify-2'));
    expect(sameApp.repeatNote).toContain('Same declaration, declared inputs and app version as an earlier run');
  });

  it('resolves cwd from the declaration file, is refused relative by a rejecting MCP server, and is not accepted in workflow commands', () => {
    const scenarioFile = path.join(root, 'scenario.json');
    writeFileSync(scenarioFile, JSON.stringify({ mode: 'acceptance', title: 'Board', change: 'Shows the board', afterUrl: 'http://127.0.0.1:1',
      steps: [{ action: 'waitFor', selector: '#title', note: 'Wait' }], checks: [{ id: 'title', kind: 'text', selector: '#title', equals: 'Board' }], target: { executable: 'git', args: ['rev-parse', 'HEAD'], cwd: '..' } }));
    expect(loadChangeSpec(scenarioFile).target?.cwd).toBe(path.dirname(root));
    expect(relativePathArguments({ scenario: { target: { executable: './bin/version', cwd: 'app' } }, outDir: '/abs' })).toEqual(['scenario.target.cwd', 'scenario.target.executable']);
    const command = { mode: 'acceptance', title: 't', requirement: 'r', current: { ...node(''), deadlineMs: 1000 }, checks: [{ id: 'c', source: 'stdout', operator: 'equals', value: '' }] };
    const workflow = (extra: object) => workflowSchema.safeParse({ version: 1, command: { ...command, ...extra } });
    expect(workflow({ target: node('') }).error?.issues.some(issue => issue.message.includes('do not take requirements or target'))).toBe(true);
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

    it('reads the target around every repeat and shows it in the summary, REPORT.md and REPORT.html', async () => {
      writeFileSync(path.join(root, 'version.txt'), 'a1b2c3d');
      const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Board', change: 'Shows the board', afterUrl: origin, repeats: 2,
        steps: [{ action: 'waitFor', selector: '#title', note: 'Wait for the board' }], checks: [{ id: 'title', kind: 'text', selector: '#title', equals: 'Board' }],
        target: { ...readVersion, cwd: root } });
      const out = path.join(root, '.praman', 'scenario-1');
      const result = await proveChange(spec, out);
      expect(result.verdict).toBe('passed');
      expect(result.proof.appUnderTest?.readings).toHaveLength(3);
      expect(formatSummary(safeFeedbackValue(result, spec))).toContain('App under test: a1b2c3d (same before every run and after the last).');
      expect(readFileSync(path.join(out, 'REPORT.md'), 'utf8')).toContain('Identity of the runner, the browser and the declared files: stable.');
      expect(readFileSync(path.join(out, 'REPORT.html'), 'utf8')).toContain('App under test: a1b2c3d');
      const changing = changeSpecSchema.parse({ ...spec, target: { ...bumping, cwd: root } });
      const moved = await proveChange(changing, path.join(root, '.praman', 'scenario-2'));
      expect(moved.verdict).toBe('insufficient_evidence');
      expect(moved.proof.after.every(run => run.verdict === 'passed')).toBe(true);
    }, 60_000);
  });
});

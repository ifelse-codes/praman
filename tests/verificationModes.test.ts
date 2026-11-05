import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { assessProof, proveChange } from '../src/eval/change.js';
import { commandProofSchema, loadCommandSpec, proveCommands, type CommandSpec } from '../src/eval/command.js';
import { commandReplayGate } from '../src/core/commandDemonstrate.js';

let root: string, origin: string, server: Server;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'praman-modes-'));
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<button id="open" onclick="document.querySelector('#result').textContent='${req.url === '/good' ? 'ready' : 'wrong'}'">Open</button><p id="result"></p>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); rmSync(root, { recursive: true, force: true }); });
function browserSpec() {
  return changeSpecSchema.parse({ mode: 'acceptance', title: 'Current workflow', change: 'Show ready on opening', afterUrl: origin + '/good',
    steps: [{ action: 'click', selector: '#open', note: 'Open the result' }],
    checks: [{ id: 'result', kind: 'text', selector: '#result', equals: 'ready' }, { id: 'button', kind: 'visible', selector: '#open', equals: true }] });
}
function commandSpec() {
  return commandProofSchema.parse({ mode: 'acceptance', title: 'Current output', requirement: 'Print ready',
    current: { executable: process.execPath, args: ['-e', 'console.log("ready")'], cwd: root, deadlineMs: 2000 },
    checks: [{ id: 'result', source: 'stdout', operator: 'equals', value: 'ready\n' }, { id: 'quiet', source: 'stderr', operator: 'equals', value: '' }] });
}
async function commandRun(spec: CommandSpec, name: string) {
  const file = join(root, name + '.json'); writeFileSync(file, JSON.stringify(spec));
  const result = await proveCommands(file, join(root, name));
  return { file, result, proof: JSON.parse(readFileSync(result.proofPath, 'utf8')) };
}

it('uses explicit baseline/current roles when a comparison uses the same browser URL', async () => {
  const spec = changeSpecSchema.parse({ ...browserSpec(), mode: 'comparison', baselineKind: 'synthetic', beforeUrl: origin + '/good',
    checks: [{ id: 'button', kind: 'visible', selector: '#open', equals: true, beforeEquals: false }] });
  const result = await proveChange(spec, join(root, 'same-url'));
  expect(result.verdict).toBe('passed');
  expect(result.proof.before!.checks[0]).toMatchObject({ expected: false, observed: true, verdict: 'failed' });
  expect(result.proof.after.map(run => run.checks[0])).toEqual([
    expect.objectContaining({ expected: true, observed: true, verdict: 'passed' }),
    expect.objectContaining({ expected: true, observed: true, verdict: 'passed' }),
  ]);
}, 90000);

describe('explicit verification modes', () => {
  it('accepts repeated current browser behavior without a baseline and keeps failures and unavailable observations distinct', async () => {
    const spec = browserSpec();
    const passed = await proveChange(spec, join(root, 'pass'));
    expect(passed.verdict).toBe('passed');
    expect(passed.proof.before).toBeUndefined();
    expect(existsSync(join(root, 'pass/before'))).toBe(false);
    expect(passed.proof.after.map(row => [row.checks[0].verdict, row.checks[0].observed])).toEqual([['passed', 'ready'], ['passed', 'ready']]);
    const failed = await proveChange({ ...spec, afterUrl: origin + '/bad' }, join(root, 'fail'));
    expect(failed.verdict).toBe('failed');
    expect(failed.feedback.findings[0].status).toBe('current_failure');
    const unavailable = await proveChange({ ...spec, checks: [{ id: 'missing', kind: 'text', selector: '#absent', equals: 'ready' }] }, join(root, 'missing'));
    expect(unavailable.verdict).toBe('insufficient_evidence');
    expect(unavailable.feedback.findings[0].status).toBe('incomplete');
  }, 90000);

  it('compares two passing browser versions but never promotes a synthetic control into historical repair', async () => {
    const spec = changeSpecSchema.parse({ ...browserSpec(), mode: 'comparison', beforeUrl: origin + '/good', baselineKind: 'unattested' });
    expect((await proveChange(spec, join(root, 'two-pass'))).verdict).toBe('passed');
    const control = await proveChange({ ...spec, beforeUrl: origin + '/bad', baselineKind: 'synthetic' }, join(root, 'control'));
    expect(control.verdict).toBe('passed');
    expect(control.feedback).toMatchObject({ mode: 'comparison', baselineKind: 'synthetic' });
    expect(control.feedback.findings.map(row => row.status)).toEqual(['baseline_mismatch', 'passed']);
    const repair = changeSpecSchema.parse({ ...spec, mode: 'repair', baselineKind: 'historical', regressionCheck: 'result' });
    const unproven = await proveChange(repair, join(root, 'not-repair'));
    expect(unproven.verdict).toBe('insufficient_evidence');
    const strict = await proveChange({ ...repair, beforeUrl: origin + '/bad' }, join(root, 'repair'));
    expect(strict.verdict).toBe('passed');
    const extraFailure = structuredClone(strict.proof.before!);
    extraFailure.checks[1].verdict = 'failed'; extraFailure.checks[1].observed = false;
    expect(assessProof({ ...repair, beforeUrl: origin + '/bad' }, extraFailure, strict.proof.after).verdict).toBe('insufficient_evidence');
    rmSync(strict.proof.after[0].checks[0].screenshot!);
    expect(assessProof({ ...repair, beforeUrl: origin + '/bad' }, strict.proof.before, strict.proof.after).verdict).toBe('insufficient_evidence');
  }, 90000);

  it('accepts current-only commands and replays only the current stage; failures and missing evidence do not pass', async () => {
    const spec = commandSpec();
    const { file, result, proof } = await commandRun(spec, 'pass');
    expect(result.verdict).toBe('passed'); expect(proof.before).toBeUndefined();
    expect(existsSync(join(root, 'pass/before'))).toBe(false);
    const replay = commandReplayGate(loadCommandSpec(file), result.proofPath, root);
    await expect(replay('before')).rejects.toThrow('no baseline');
    expect(readFileSync((await replay('current')).run.stdout, 'utf8')).toBe('ready\n');
    const failed = await commandRun({ ...spec, current: { ...spec.current, args: ['-e', 'console.log("wrong")'] } }, 'fail');
    expect(failed.result.verdict).toBe('failed');
    expect(failed.result.feedback.findings.find(row => row.checkIndex === 0)?.status).toBe('current_failure');
    const unavailable = await commandRun({ ...spec, current: { ...spec.current, executable: join(root, 'absent') } }, 'missing');
    expect(unavailable.result.verdict).toBe('insufficient_evidence');
  });

  it('allows passing command baselines, labels synthetic mismatches, and keeps the repair gate strict', async () => {
    const spec = commandSpec();
    const comparison = commandProofSchema.parse({ ...spec, mode: 'comparison', baselineKind: 'unattested', before: spec.current });
    expect((await commandRun(comparison, 'two-pass')).result.verdict).toBe('passed');
    const control = { ...comparison, baselineKind: 'synthetic' as const, before: { ...spec.current, args: ['-e', 'console.log("wrong")'] } };
    const compared = await commandRun(control, 'control');
    expect(compared.result.verdict).toBe('passed');
    expect(compared.result.feedback.findings.find(row => row.checkIndex === 0)?.status).toBe('baseline_mismatch');
    const replay = commandReplayGate(loadCommandSpec(compared.file), compared.result.proofPath, root);
    expect((await replay('before')).run.verdict).toBe('failed');
    expect((await replay('current')).run.verdict).toBe('passed');
    const repair = commandProofSchema.parse({ ...comparison, mode: 'repair', baselineKind: 'historical', regressionCheck: 'result' });
    expect((await commandRun(repair, 'not-repair')).result.verdict).toBe('insufficient_evidence');
    expect((await commandRun({ ...repair, before: control.before }, 'repair')).result.verdict).toBe('passed');
    expect((await commandRun({ ...repair, before: { ...spec.current, args: ['-e', 'console.log("wrong");console.error("unexpected")'] } }, 'extra-failure')).result.verdict).toBe('insufficient_evidence');
  });

  it('rejects ambiguous modes and synthetic historical-repair claims before execution', () => {
    for (const [schema, spec, baseline] of [
      [changeSpecSchema, browserSpec(), { beforeUrl: origin + '/bad' }],
      [commandProofSchema, commandSpec(), { before: commandSpec().current }],
    ] as const) {
      expect(schema.safeParse({ ...spec, ...baseline }).success).toBe(false);
      expect(schema.safeParse({ ...spec, mode: 'repair', ...baseline, baselineKind: 'synthetic', regressionCheck: 'result' }).success).toBe(false);
      expect(schema.safeParse({ ...spec, mode: 'comparison', ...baseline, baselineKind: 'synthetic', regressionCheck: 'result' }).success).toBe(false);
      const { mode: _, ...unlabeled } = spec;
      expect(schema.safeParse(unlabeled).success).toBe(false);
    }
    expect(changeSpecSchema.safeParse({ ...browserSpec(), walkthrough: { startStep: 0, before: [{ step: 0, text: 'Fake old failure' }], after: [{ step: 0, text: 'Current' }] } }).success).toBe(false);
    expect(changeSpecSchema.safeParse({ ...browserSpec(), walkthrough: { startStep: 0, after: [{ step: 0, text: 'Declared current behavior' }] } }).success).toBe(true);
  });
});

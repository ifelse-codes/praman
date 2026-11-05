import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { commandProofSchema, proveCommands } from '../src/eval/command.js';
type Spec = z.input<typeof commandProofSchema>;
const proofSchema = z.object({
  before: z.object({ checks: z.array(z.object({ id: z.string(), verdict: z.string(), evidence: z.string() })) }),
  current: z.array(z.object({ status: z.string(), stdout: z.string(), checks: z.array(z.object({ id: z.string(), verdict: z.string(), evidence: z.string() })) })),
});

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-command-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function command(code: string) { return { executable: process.execPath, args: ['-e', code], cwd: '.', deadlineMs: 2000 }; }
async function run(current: Spec['current'] = command('console.log("correct")'), checks: Spec['checks'] = [{ id: 'message', source: 'stdout', operator: 'equals', value: 'correct\n' }], before: Spec['before'] = command('console.log("wrong")')) {
  const declaration = path.join(root, 'spec.json');
  writeFileSync(declaration, JSON.stringify({ mode: 'repair', baselineKind: 'historical', title: 'Command behavior', requirement: 'Print correct result', before, current, checks, regressionCheck: checks[0].id, repeats: 2 }));
  const result = await proveCommands(declaration, path.join(root, 'proof'));
  const proof = proofSchema.parse(JSON.parse(readFileSync(result.proofPath, 'utf8')));
  return { result, proof };
}
describe('command proof', () => {
  it('requires reproduced old mismatch and every repeated current check; retains raw evidence privately', async () => {
    const { result, proof } = await run();
    expect(result.verdict).toBe('passed');
    expect(result.feedback.findings.find(row => row.checkIndex === 0)?.status).toBe('resolved_regression');
    expect(proof.before.checks.find(row => row.id === 'message')?.verdict).toBe('failed');
    expect(proof.current.map(row => readFileSync(row.stdout, 'utf8'))).toEqual(['correct\n', 'correct\n']);
  });
  it('does not certify unchanged wrong current output', async () => {
    const { result } = await run(command('console.log("wrong")'));
    expect(result.verdict).toBe('failed');
    expect(result.feedback.findings.find(row => row.checkIndex === 0)?.status).toBe('current_failure');
  });
  it('separates deadlines from behavior mismatches', async () => {
    const { result, proof } = await run({ ...command('setInterval(() => {}, 1000)'), deadlineMs: 50 });
    // Real subprocess deadline and OS process cleanup cannot be exercised with fake timers.
    expect(result.verdict).toBe('insufficient_evidence');
    expect(proof.current.map(row => row.status)).toEqual(['timeout', 'timeout']);
    expect(result.feedback.findings.find(row => row.checkIndex === 0)?.status).toBe('incomplete');
  });
  it('separates unavailable executable from an observed failure', async () => {
    const { result, proof } = await run({ ...command(''), executable: path.join(root, 'missing') });
    expect(result.verdict).toBe('insufficient_evidence');
    expect(proof.current[0].status).toBe('unavailable');
  });
  it('rejects a successful output accompanied by the wrong exit status', async () => {
    const { result, proof } = await run(command('console.log("correct"); process.exitCode = 3'));
    expect(result.verdict).toBe('failed');
    expect(proof.current[0].checks[0].verdict).toBe('failed');
  });
  it('never accepts a missing artifact', async () => {
    const { result } = await run(command(''), [{ id: 'artifact', source: 'artifact', path: 'missing.txt', operator: 'equals', value: 'correct' }]);
    expect(result.verdict).toBe('insufficient_evidence');
  });
  it('captures rewritten artifacts per run', async () => {
    const checks: Spec['checks'] = [{ id: 'artifact', source: 'artifact', path: 'result.txt', operator: 'equals', value: 'correct' }];
    const { result, proof } = await run(command('require("fs").writeFileSync("result.txt", "correct")'), checks, command('require("fs").writeFileSync("result.txt", "wrong")'));
    expect(result.verdict).toBe('passed');
    expect(readFileSync(proof.before.checks[1].evidence, 'utf8')).toBe('wrong');
    expect(readFileSync(proof.current[0].checks[1].evidence, 'utf8')).toBe('correct');
  });
  it('rejects stale artifacts even when their content satisfies the assertion', async () => {
    writeFileSync(path.join(root, 'result.txt'), 'correct');
    const { result } = await run(command(''), [{ id: 'artifact', source: 'artifact', path: 'result.txt', operator: 'equals', value: 'correct' }]);
    expect(result.verdict).toBe('insufficient_evidence');
  });
  it('rejects reserved exit-check IDs before execution', async () => {
    await expect(run(command(''), [{ id: '$exit', source: 'stdout', operator: 'equals', value: '' }])).rejects.toThrow('reserved $exit');
  });
  it('withholds raw private output, arguments, environment and assertions from delivery', async () => {
    const secret = 'private-value-uniquely-sensitive';
    const { result, proof } = await run({ ...command(`console.log(${JSON.stringify(secret)})`), env: { CUSTOM_PRIVATE: secret } }, [{ id: 'message', source: 'stdout', operator: 'contains', value: secret }]);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(readFileSync(proof.current[0].stdout, 'utf8')).toContain(secret);
  });
});

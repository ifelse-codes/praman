import { expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayWorkflow } from '../src/core/workflow.js';
import { reconstructWorkflow } from '../src/case/reconstruct.js';
import { workflowTraceSchema } from '../src/case/workflow.js';

function command(cwd: string, script: string, expected: string) {
  return { mode: 'acceptance', title: 'fixture', requirement: 'declared result', current: {
    executable: process.execPath, args: ['--input-type=module', '-e', script], cwd, deadlineMs: 5000,
  }, checks: [{ id: 'result', source: 'stdout', operator: 'equals', value: expected }] };
}
function declaration(dir: string) {
  return { version: 1, dependency: { version: 1, service: { version: 1, initial: 'ready', states: {
    ready: [{ method: 'GET', path: '/work', next: 'retry', response: { status: 503, body: { retry: true } } }],
    retry: [{ method: 'GET', path: '/work', next: 'ready', response: { status: 200, body: { ok: true } } }],
  } }, start: { kind: 'initial' }, steps: [
    { method: 'GET', path: '/work', expect: { status: 503, body: { kind: 'json', value: { retry: true } } } },
    { method: 'GET', path: '/work', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } },
  ], final: { state: 'ready', requests: 2 } }, applicationState: { kind: 'stateless' },
    command: command(dir, 'const a=await fetch("{{serviceUrl}}/work"); await a.text(); const b=await fetch("{{serviceUrl}}/work"); console.log((await b.json()).ok);', 'true\n') };
}
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-workflow-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('complete trace restores the exact simulator start and keeps independently declared expectations through reconstruction', async () => {
  await fixture(async dir => {
    const input = join(dir, 'input.json'); writeFileSync(input, JSON.stringify(declaration(dir)));
    const first = await replayWorkflow(input, join(dir, 'first'));
    expect(first.verdict).toBe('passed');
    for (const run of first.runs) {
      const trace = workflowTraceSchema.parse(JSON.parse(readFileSync(run.tracePath, 'utf8')));
      expect(trace.interactions.map(row => [row.status, row.before, row.after])).toEqual([[503, 'ready', 'retry'], [200, 'retry', 'ready']]);
      expect(trace.initial.requests).toBe(0);
    }
    const original = readFileSync(first.runs[0].tracePath, 'utf8');
    const converted = reconstructWorkflow(first.runs[0].tracePath, join(dir, 'case'), 'reproduction');
    expect(converted.verdict).toBe('passed');
    if (converted.verdict !== 'passed') throw new Error('No case');
    expect((await replayWorkflow(converted.casePath, join(dir, 'again'))).verdict).toBe('passed');
    expect(readFileSync(first.runs[0].tracePath, 'utf8')).toBe(original);
    expect(() => reconstructWorkflow(first.runs[0].tracePath, join(dir, 'case'), 'reuse')).toThrow();
  });
});

test('a captured failure remains a failure after reconstruction rather than turning observations into expectations', async () => {
  await fixture(async dir => {
    const spec = declaration(dir); spec.command.checks[0].value = 'wrong';
    const input = join(dir, 'input.json'); writeFileSync(input, JSON.stringify(spec));
    const first = await replayWorkflow(input, join(dir, 'first'));
    expect(first.verdict).toBe('failed');
    const converted = reconstructWorkflow(first.runs[0].tracePath, join(dir, 'case'), 'failed-result');
    if (converted.verdict !== 'passed') throw new Error('Complete failing case was not reconstructed');
    const again = await replayWorkflow(converted.casePath, join(dir, 'again'));
    expect(again.verdict).toBe('failed');
    expect(again.runs.map(run => run.commandVerdict)).toEqual(['failed', 'failed']);
  });
});

test('application reset is checked before each repeat, and failed reset blocks application execution', async () => {
  await fixture(async dir => {
    const spec = declaration(dir);
    const reset = command(dir, 'import fs from "node:fs";fs.writeFileSync("counter","0");console.log("reset");', 'reset\n');
    const app = command(dir, 'import fs from "node:fs";const n=Number(fs.readFileSync("counter"))+1;fs.writeFileSync("counter",String(n));await (await fetch("{{serviceUrl}}/work")).text();await (await fetch("{{serviceUrl}}/work")).text();console.log(n);', '1\n');
    const input = join(dir, 'input.json');
    writeFileSync(input, JSON.stringify({ ...spec, applicationState: { kind: 'reset', command: reset }, command: app }));
    expect((await replayWorkflow(input, join(dir, 'reset-good'))).verdict).toBe('passed');
    reset.checks[0].value = 'not reset';
    writeFileSync(input, JSON.stringify({ ...spec, applicationState: { kind: 'reset', command: reset }, command: app }));
    const blocked = await replayWorkflow(input, join(dir, 'reset-bad'));
    expect(blocked.verdict).toBe('insufficient_evidence');
    expect(blocked.runs.map(run => run.commandVerdict)).toEqual([undefined, undefined]);
    expect(reconstructWorkflow(blocked.runs[0].tracePath, join(dir, 'blocked-case'), 'blocked').verdict).toBe('insufficient_evidence');
  });
});

test('missing requests and wrong final state are observed workflow failures, not successful command-only proof', async () => {
  await fixture(async dir => {
    const spec = declaration(dir); spec.command = command(dir, 'console.log("true");', 'true\n');
    const input = join(dir, 'input.json'); writeFileSync(input, JSON.stringify(spec));
    const missing = await replayWorkflow(input, join(dir, 'missing'));
    expect(missing.verdict).toBe('failed');
    expect(missing.runs.map(run => [run.commandVerdict, run.dependencyVerdict])).toEqual([['passed', 'failed'], ['passed', 'failed']]);
    const second = declaration(dir); second.dependency.final.state = 'retry';
    writeFileSync(input, JSON.stringify(second));
    expect((await replayWorkflow(input, join(dir, 'final'))).verdict).toBe('failed');
  });
});

test('unavailable/timeout commands, legacy spans and incomplete captures cannot reconstruct runnable success', async () => {
  await fixture(async dir => {
    const input = join(dir, 'input.json');
    // Real child-process deadline integration: fake timers cannot control the spawned Node runtime.
    for (const [name, change] of [['unavailable', { executable: '/nonexistent/praman-workflow-command' }], ['timeout', { args: ['-e', 'setTimeout(()=>{},5000)'], deadlineMs: 20 }]] as const) {
      const spec = declaration(dir);
      writeFileSync(input, JSON.stringify({ ...spec, command: { ...spec.command, current: { ...spec.command.current, ...change } } }));
      const result = await replayWorkflow(input, join(dir, name));
      expect(result.verdict).toBe('insufficient_evidence');
      expect(reconstructWorkflow(result.runs[0].tracePath, join(dir, `${name}-case`), name).verdict).toBe('insufficient_evidence');
    }
    writeFileSync(input, JSON.stringify({ spans: [{ name: 'request', kind: 'tool' }] }));
    expect(reconstructWorkflow(input, join(dir, 'legacy'), 'legacy').verdict).toBe('insufficient_evidence');
    expect(reconstructWorkflow(join(dir, 'absent'), join(dir, 'absent-case'), 'absent').verdict).toBe('insufficient_evidence');
  });
});

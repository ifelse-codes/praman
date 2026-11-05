import { expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewCoverage } from '../src/review/coverage.js';
import { replayService, serviceReplaySchema } from '../src/gateway/replay.js';
import { workflowSchema } from '../src/case/workflow.js';

function inputs(dir: string) {
  const service = { version: 1, initial: 'ready', states: {
    ready: [{ method: 'GET', path: '/private-work', next: 'retry', response: { status: 503, body: { retry: true } } },
      { method: 'HEAD', path: '/private-health', next: 'ready', response: { status: 204, body: { private: 'hidden' } } }],
    retry: [{ method: 'GET', path: '/private-work', next: 'ready', response: { status: 200, body: { ok: true } } }],
    unreachable: [{ method: 'DELETE', path: '/private-orphan', next: 'ready', response: { status: 200, body: null } }],
  } };
  const retry = workflowSchema.parse({ version: 1, dependency: { version: 1, service, start: { kind: 'initial' }, steps: [
    { method: 'GET', path: '/private-work', expect: { status: 503, body: { kind: 'json', value: { retry: true } } } },
    { method: 'GET', path: '/private-work', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } },
  ], final: { state: 'ready', requests: 2 } }, applicationState: { kind: 'stateless' }, command: {
    mode: 'acceptance', title: 'private-title', requirement: 'private-requirement', current: {
      executable: process.execPath, cwd: '.', deadlineMs: 5000, args: ['--input-type=module', '-e',
        'await (await fetch("{{serviceUrl}}/private-work")).text();const r=await fetch("{{serviceUrl}}/private-work");console.log((await r.json()).ok);'],
    }, checks: [{ id: 'private-result', source: 'stdout', operator: 'equals', value: 'true\n' }],
  } });
  const health = structuredClone(retry);
  health.dependency.steps = [{ method: 'HEAD', path: '/private-health', expect: { status: 204, body: { kind: 'text', value: '' } } }];
  health.dependency.final.requests = 1;
  health.command.current.args = ['--input-type=module', '-e', 'const r=await fetch("{{serviceUrl}}/private-health",{method:"HEAD"});console.log(r.status);'];
  health.command.checks[0].value = '204\n';
  const manifest = { version: 1, service, cases: ['retry.json'], requirements: [
    { description: 'private-retry-requirement', checks: [{ caseIndex: 0, checkIndex: 0 }] },
    { description: 'private-health-requirement', checks: [] as { caseIndex: number; checkIndex: number }[] },
  ] };
  writeFileSync(join(dir, 'retry.json'), JSON.stringify(retry));
  writeFileSync(join(dir, 'health.json'), JSON.stringify(health));
  writeFileSync(join(dir, 'review.json'), JSON.stringify(manifest));
  return { service, retry, health, manifest };
}
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-coverage-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('finds reachable gaps and unmapped requirements without inflating unique coverage across repeats', async () => {
  await fixture(async dir => {
    inputs(dir);
    const result = await reviewCoverage(join(dir, 'review.json'), join(dir, 'out'));
    expect(result.verdict).toBe('failed');
    expect(result.cases.map(row => row.verdict)).toEqual(['passed']);
    expect(result.counts).toEqual({ reachable: 3, unreachable: 1, exercised: 2, verified: 2, untestedRequirements: 1 });
    expect(result.requirements.map(row => row.status)).toEqual(['passed', 'untested']);
    expect(result.transitions.map(row => [row.reachable, row.status])).toEqual([[true, 'verified'], [true, 'untested'], [true, 'verified'], [false, 'untested']]);
    expect(result.transitions[0].occurrences.map(row => [row.run, row.interactionIndex])).toEqual([[1, 0], [2, 0]]);
    expect(result.transitions[3].candidatePath).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(statSync(result.reportPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'out')).mode & 0o777).toBe(0o700);
    const gap = result.transitions[1].candidatePath!;
    expect(JSON.parse(readFileSync(gap, 'utf8')).steps).toEqual([{ method: 'HEAD', path: '/private-health', expect: { status: 204, body: { kind: 'text', value: '' } } }]);
    expect((await replayService(gap, join(dir, 'candidate-run'))).verdict).toBe('passed');
    // A model-only candidate is not added to the application suite or accepted as fresh application proof.
    expect(JSON.parse(readFileSync(result.reportPath, 'utf8')).counts.verified).toBe(2);
  });
});

test('authored application cases close the gap with direct assertion evidence and explicit exit mapping', async () => {
  await fixture(async dir => {
    const { manifest } = inputs(dir);
    manifest.cases.push('health.json');
    manifest.requirements[1].checks.push({ caseIndex: 1, checkIndex: 0 }, { caseIndex: 1, checkIndex: -1 });
    writeFileSync(join(dir, 'review.json'), JSON.stringify(manifest));
    const result = await reviewCoverage(join(dir, 'review.json'), join(dir, 'out'));
    expect(result.verdict).toBe('passed');
    expect(result.proof).toBe(false);
    expect(result.counts.verified).toBe(3);
    for (const requirement of result.requirements) for (const check of requirement.checks) for (const evidence of check.evidence) {
      const raw = JSON.parse(readFileSync(evidence.resultPath, 'utf8'));
      expect(raw.command.checks[check.checkIndex + 1].verdict).toBe('passed');
      expect(evidence.pointer).toBe(`/command/checks/${check.checkIndex + 1}`);
    }
    expect(result.transitions[0].candidatePath).toBeUndefined();
  });
});

test('failed assertions remain observed failures, with exercised but unverified transitions and shortest model stimuli', async () => {
  await fixture(async dir => {
    const { retry } = inputs(dir);
    retry.command.checks[0].value = 'not true';
    writeFileSync(join(dir, 'retry.json'), JSON.stringify(retry));
    const result = await reviewCoverage(join(dir, 'review.json'), join(dir, 'out'));
    expect(result.verdict).toBe('failed');
    expect(result.requirements[0].status).toBe('failed');
    expect(result.counts).toMatchObject({ exercised: 2, verified: 0 });
    expect(result.transitions[2].status).toBe('exercised');
    const candidate = result.transitions[2].candidatePath!;
    const model = serviceReplaySchema.parse(JSON.parse(readFileSync(candidate, 'utf8')));
    expect(model.steps.map(step => step.expect.status)).toEqual([503, 200]);
    expect(model.final).toEqual({ state: 'ready', requests: 2 });
    expect((await replayService(candidate, join(dir, 'candidate'))).verdict).toBe('passed');
    expect(result.requirements[0].status).toBe('failed');
  });
});

test('unavailable execution and failed application reset cannot become transition coverage', async () => {
  await fixture(async dir => {
    const { retry } = inputs(dir);
    retry.command.current.executable = '/nonexistent/praman-coverage-command';
    writeFileSync(join(dir, 'retry.json'), JSON.stringify(retry));
    const absent = await reviewCoverage(join(dir, 'review.json'), join(dir, 'absent'));
    expect(absent.verdict).toBe('insufficient_evidence');
    expect(absent.requirements[0].status).toBe('insufficient_evidence');
    expect(absent.counts.exercised).toBe(0);
    retry.command.current.executable = process.execPath;
    const reset = structuredClone(retry.command);
    reset.current.args = ['-e', 'console.log("not reset")'];
    writeFileSync(join(dir, 'retry.json'), JSON.stringify({ ...retry, applicationState: { kind: 'reset', command: reset } }));
    const blocked = await reviewCoverage(join(dir, 'review.json'), join(dir, 'blocked'));
    expect(blocked.verdict).toBe('insufficient_evidence');
    expect(blocked.counts.exercised).toBe(0);
    expect(blocked.requirements[0].status).toBe('insufficient_evidence');
    expect(blocked.requirements[0].checks[0].evidence.map(row => row.pointer)).toEqual(['', '']);
  });
});
test('partial request evidence from timed-out commands never counts as exercised coverage', async () => {
  await fixture(async dir => {
    const { retry } = inputs(dir);
    // Real child-process deadlines cannot be driven by the parent test's fake clock.
    retry.command.current.args = ['--input-type=module', '-e', 'await (await fetch("{{serviceUrl}}/private-work")).text();setInterval(()=>{},1000);'];
    retry.command.current.deadlineMs = 1000;
    writeFileSync(join(dir, 'retry.json'), JSON.stringify(retry));
    const result = await reviewCoverage(join(dir, 'review.json'), join(dir, 'out'));
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.counts.exercised).toBe(0);
    expect(result.requirements[0].status).toBe('insufficient_evidence');
    for (const run of [1, 2]) {
      const trace = JSON.parse(readFileSync(join(dir, 'out', 'case-0', `run-${run}`, 'trace.json'), 'utf8'));
      expect(trace.complete).toBe(false);
      expect(trace.interactions.map((row: { status: number }) => row.status)).toEqual([503]);
    }
  });
});


test('invalid mappings, mixed models, snapshots and absent inputs are rejected before any application runs', async () => {
  await fixture(async dir => {
    const { retry, health, manifest } = inputs(dir);
    const marker = join(dir, 'executed');
    retry.command.current.args = ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`];
    writeFileSync(join(dir, 'retry.json'), JSON.stringify(retry));
    const variants = [
      { ...manifest, requirements: [{ description: 'missing check', checks: [{ caseIndex: 0, checkIndex: 1 }] }] },
      { ...manifest, requirements: [{ description: 'missing case', checks: [{ caseIndex: 1, checkIndex: 0 }] }] },
      { ...manifest, cases: ['retry.json', 'missing.json'] },
    ];
    health.dependency.service = structuredClone(health.dependency.service);
    health.dependency.service.states.ready[0].response.status = 500;
    writeFileSync(join(dir, 'health.json'), JSON.stringify(health));
    variants.push({ ...manifest, cases: ['retry.json', 'health.json'] });
    for (const [index, value] of variants.entries()) {
      writeFileSync(join(dir, 'review.json'), JSON.stringify(value));
      const result = await reviewCoverage(join(dir, 'review.json'), join(dir, `invalid-${index}`));
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.cases).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }
    writeFileSync(join(dir, 'retry.json'), JSON.stringify({ ...retry, dependency: { ...retry.dependency, start: { kind: 'snapshot', path: 'snapshot.json' } } }));
    writeFileSync(join(dir, 'review.json'), JSON.stringify(manifest));
    expect((await reviewCoverage(join(dir, 'review.json'), join(dir, 'snapshot'))).verdict).toBe('insufficient_evidence');
    expect(existsSync(marker)).toBe(false);
    expect((await reviewCoverage(join(dir, 'absent.json'), join(dir, 'absent'))).verdict).toBe('insufficient_evidence');
  });
});

test('fresh-output refusal preserves existing evidence and declarations are not mutated by normalization', async () => {
  await fixture(async dir => {
    inputs(dir);
    const before = readFileSync(join(dir, 'retry.json'), 'utf8');
    const output = join(dir, 'out');
    const first = await reviewCoverage(join(dir, 'review.json'), output);
    const evidence = readFileSync(first.reportPath, 'utf8');
    await expect(reviewCoverage(join(dir, 'review.json'), output)).rejects.toThrow();
    expect(readFileSync(first.reportPath, 'utf8')).toBe(evidence);
    expect(readFileSync(join(dir, 'retry.json'), 'utf8')).toBe(before);
  });
});

import { expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCampaign } from '../src/core/campaign.js';
import { serviceSchema } from '../src/gateway/service.js';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { reconstructWorkflow } from '../src/case/reconstruct.js';

function spec() {
  const command = { mode: 'acceptance', title: 'state', requirement: 'retain local counter', current: {
    executable: process.execPath, cwd: '{{runDir}}', deadlineMs: 5000,
    args: ['--input-type=module', '-e', `import fs from 'node:fs';const n=Number(fs.readFileSync('counter'))+1;fs.writeFileSync('counter',String(n));await(await fetch('{{serviceUrl}}/work')).text();await(await fetch('{{serviceUrl}}/work')).text();console.log('ok');`],
  }, checks: [{ id: 'output', source: 'stdout', operator: 'equals', value: 'ok\n' }] };
  return { version: 1, command, applicationState: { kind: 'reset', command: { ...command, current: { ...command.current, args: ['-e', `require('fs').writeFileSync('counter','0',{flag:'wx'});console.log('ok')`] } } }, dependency: {
    version: 1, repeats: 2, start: { kind: 'initial' }, service: { version: 1, initial: 'ready', states: {
      ready: [{ method: 'GET', path: '/work', next: 'retry', response: { status: 503, body: { retry: true } as { retry?: boolean; ok?: boolean } } }],
      retry: [{ method: 'GET', path: '/work', next: 'ready', response: { status: 200, body: { ok: true } } }],
    } }, steps: [{ method: 'GET', path: '/work', expect: { status: 503, body: { kind: 'json', value: { retry: true } } } }, { method: 'GET', path: '/work', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } }], final: { state: 'ready', requests: 2 },
  } };
}
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-worker-state-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function inputs(dir: string, value: unknown, extra: object = {}) {
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify(value));
  const file = join(dir, 'campaign.json');
  writeFileSync(file, JSON.stringify({ version: 1, cases: ['workflow.json'], rounds: 4, concurrency: 2, state: { kind: 'per-worker' }, ...extra }));
  return file;
}

test('each worker retains its own seeded application and model state across jobs, with once-only reset and truthful counts', async () => {
  await fixture(async dir => {
    const source = inputs(dir, spec());
    const original = readFileSync(join(dir, 'workflow.json'), 'utf8');
    const result = await runCampaign(source, join(dir, 'out'));
    expect(result.verdict).toBe('passed');
    expect(result.state.kind).toBe('per-worker');
    expect(result.state.workers.length).toBe(2);
    for (const worker of result.state.workers) {
      const runs = result.jobs.filter(job => job.workerIndex === worker.workerIndex).flatMap(job => job.runs);
      expect(readFileSync(join(worker.workspacePath, 'counter'), 'utf8')).toBe(String(runs.length));
      expect(runs.map(run => JSON.parse(readFileSync(run.tracePath, 'utf8')).initial.requests)).toEqual(runs.map((_, index) => index * 2));
      for (const [index, run] of runs.entries()) {
        const trace = JSON.parse(readFileSync(run.tracePath, 'utf8'));
        expect(trace.declaration.dependency.final.requests).toBe((index + 1) * 2);
        expect(run.workspacePath).toBe(worker.workspacePath);
      }
      expect(runs.filter(run => JSON.parse(readFileSync(run.resultPath, 'utf8')).reset).length).toBe(1);
      const final = JSON.parse(readFileSync(worker.receiptPath, 'utf8'));
      expect(final.final).toMatchObject({ state: 'ready', requests: runs.length * 2 });
      expect(final.resetComplete).toBe(true);
      expect(statSync(worker.receiptPath).mode & 0o777).toBe(0o600);
    }
    expect(new Set(result.state.workers.map(worker => worker.workspacePath)).size).toBe(2);
    expect(readFileSync(join(dir, 'workflow.json'), 'utf8')).toBe(original);
    const receipt = readFileSync(result.reportPath, 'utf8');
    await expect(runCampaign(source, join(dir, 'out'))).rejects.toThrow();
    expect(readFileSync(result.reportPath, 'utf8')).toBe(receipt);
  });
});

test('failed worker reset is checked once and blocks all later applications instead of retrying destructive setup', async () => {
  await fixture(async dir => {
    const value = spec(); value.applicationState.command.checks = [{ id: 'reset', source: 'stdout', operator: 'equals', value: 'wrong' }];
    const result = await runCampaign(inputs(dir, value), join(dir, 'out'));
    expect(result.verdict).toBe('insufficient_evidence');
    for (const worker of result.state.workers) {
      const runs = result.jobs.filter(job => job.workerIndex === worker.workerIndex).flatMap(job => job.runs);
      expect(runs.every(run => run.commandVerdict === undefined)).toBe(true);
      expect(runs.filter(run => JSON.parse(readFileSync(run.resultPath, 'utf8')).reset).length).toBe(1);
      expect(readFileSync(join(worker.workspacePath, 'counter'), 'utf8')).toBe('0');
      expect(JSON.parse(readFileSync(worker.receiptPath, 'utf8')).resetFailed).toBe(true);
    }
  });
});

test('a saved nonzero service baseline contributes a per-iteration delta without changing source snapshot', async () => {
  await fixture(async dir => {
    const value = spec();
    const snapshot = { version: 1, declarationHash: createHash('sha256').update(JSON.stringify(serviceSchema.parse(value.dependency.service))).digest('hex'), state: 'ready', requests: 4 };
    writeFileSync(join(dir, 'saved.json'), JSON.stringify(snapshot));
    const input = { ...value, dependency: { ...value.dependency, start: { kind: 'snapshot', path: 'saved.json' }, final: { state: 'ready', requests: 6 } } };
    const result = await runCampaign(inputs(dir, input, { rounds: 2, concurrency: 1 }), join(dir, 'out'));
    expect(result.verdict).toBe('passed');
    const traces = result.jobs.flatMap(job => job.runs).map(run => JSON.parse(readFileSync(run.tracePath, 'utf8')));
    expect(traces.map(trace => trace.initial.requests)).toEqual([4, 6, 8, 10]);
    expect(traces.map(trace => trace.declaration.dependency.final.requests)).toEqual([6, 8, 10, 12]);
    expect(JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8'))).toEqual(snapshot);
    const negative = { ...input, dependency: { ...input.dependency, final: { state: 'ready', requests: 3 } } };
    expect((await runCampaign(inputs(dir, negative), join(dir, 'negative'))).jobs).toEqual([]);
  });
});

test('persistent multiple-input scope is rejected before any reset; absent mode still makes fresh state per repeat', async () => {
  await fixture(async dir => {
    const result = await runCampaign(inputs(dir, spec(), { cases: ['workflow.json', 'workflow.json'] }), join(dir, 'invalid'));
    expect(result.verdict).toBe('insufficient_evidence'); expect(result.jobs).toEqual([]);
    expect(existsSync(join(dir, 'invalid', 'worker-0'))).toBe(false);
    const file = inputs(dir, spec(), { state: undefined, rounds: 2 });
    const isolated = await runCampaign(file, join(dir, 'isolated'));
    expect(isolated.verdict).toBe('passed');
    expect(isolated.state.kind).toBe('isolated');
    for (const run of isolated.jobs.flatMap(job => job.runs)) {
      expect(readFileSync(join(run.workspacePath!, 'counter'), 'utf8')).toBe('1');
      expect(JSON.parse(readFileSync(run.tracePath, 'utf8')).initial.requests).toBe(0);
    }
  });
});

test('concurrent workers use one atomic model but keep attributed journals and application state separate', async () => {
  await fixture(async dir => {
    let waiting: ServerResponse[] = [];
    const coordinator = createServer((_request, response) => {
      waiting.push(response);
      if (waiting.length === 2) { waiting.forEach(item => item.end()); waiting = []; }
    }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const value = spec();
      value.dependency.service.states.ready = [{ method: 'GET', path: '/work', next: 'ready', response: { status: 200, body: { ok: true } } }];
      value.dependency.steps = [value.dependency.steps[1], value.dependency.steps[1]];
      value.command.current.args[2] = value.command.current.args[2].replace('const n=', `fs.writeFileSync('endpoint','{{serviceUrl}}');await(await fetch('http://127.0.0.1:${address.port}')).text();const n=`);
      const result = await runCampaign(inputs(dir, value, { state: { kind: 'shared-service' } }), join(dir, 'out'));
      expect(result.verdict).toBe('passed');
      expect(result.state.shared?.verdict).toBe('passed');
      const shared = JSON.parse(readFileSync(result.state.shared!.receiptPath, 'utf8'));
      expect(shared.final.requests).toBe(16);
      expect(shared.expected.requests).toBe(16);
      for (const worker of result.state.workers) {
        const runs = result.jobs.filter(job => job.workerIndex === worker.workerIndex).flatMap(job => job.runs);
        expect(readFileSync(join(worker.workspacePath, 'counter'), 'utf8')).toBe(String(runs.length));
        const endpoint = readFileSync(join(worker.workspacePath, 'endpoint'), 'utf8');
        await expect(fetch(endpoint, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
        for (const run of runs) {
          const trace = JSON.parse(readFileSync(run.tracePath, 'utf8'));
          expect(trace.kind).toBe('praman-shared-workflow');
          expect(trace.interactions.map((row: { status: number }) => row.status)).toEqual([200, 200]);
        }
      }
      const converted = reconstructWorkflow(result.jobs[0].runs[0].tracePath, join(dir, 'reconstructed'), 'shared-is-not-isolated');
      expect(converted.verdict).toBe('insufficient_evidence');
    } finally {
      coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('shared contention preserves observed conflicts instead of resetting the shared dependency per worker', async () => {
  await fixture(async dir => {
    const value = spec();
    value.dependency.service.states.ready = [{ method: 'GET', path: '/work', next: 'retry', response: { status: 201, body: { ok: true } } }];
    value.dependency.service.states.retry = [{ method: 'GET', path: '/work', next: 'retry', response: { status: 409, body: { ok: true } } }];
    value.dependency.steps = [
      { method: 'GET', path: '/work', expect: { status: 201, body: { kind: 'json', value: { ok: true } } } },
      { method: 'GET', path: '/work', expect: { status: 409, body: { kind: 'json', value: { ok: true } } } },
    ];
    value.dependency.final.state = 'retry';
    const result = await runCampaign(inputs(dir, value, { state: { kind: 'shared-service' }, rounds: 2 }), join(dir, 'out'));
    expect(result.verdict).toBe('failed');
    expect(result.state.shared?.verdict).toBe('passed');
    const interactions = result.jobs.flatMap(job => job.runs).flatMap(run => JSON.parse(readFileSync(run.tracePath, 'utf8')).interactions);
    expect(interactions.filter(row => row.status === 201).length).toBe(1);
    expect(interactions.filter(row => row.status === 409).length).toBe(7);
    expect(result.jobs.some(job => job.runs.some(run => run.dependencyVerdict === 'failed'))).toBe(true);
  });
});

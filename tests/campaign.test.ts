import { expect, test, vi } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runCampaign } from '../src/core/campaign.js';
import { serviceSchema } from '../src/gateway/service.js';

function workflow(script?: string) {
  return { version: 1, dependency: { version: 1, repeats: 2, service: { version: 1, initial: 'ready', states: {
    ready: [{ method: 'GET', path: '/private-route', next: 'retry', response: { status: 503, body: { retry: true } } }],
    retry: [{ method: 'GET', path: '/private-route', next: 'ready', response: { status: 200, body: { ok: true } } }],
  } }, start: { kind: 'initial' }, steps: [
    { method: 'GET', path: '/private-route', expect: { status: 503, body: { kind: 'json', value: { retry: true } } } },
    { method: 'GET', path: '/private-route', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } },
  ], final: { state: 'ready', requests: 2 } }, applicationState: { kind: 'stateless' }, command: {
    mode: 'acceptance', title: 'private-title', requirement: 'private-requirement', current: {
      executable: process.execPath, cwd: '{{runDir}}', deadlineMs: 5000,
      args: ['--input-type=module', '-e', script ?? 'await (await fetch("{{serviceUrl}}/private-route")).text();await (await fetch("{{serviceUrl}}/private-route")).text();console.log("ok");'],
    }, checks: [{ id: 'private-check', source: 'stdout', operator: 'equals', value: 'ok\n' }],
  } };
}
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-campaign-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function inputs(dir: string, cases: unknown[], schedule: number | { durationMs: number; maxJobs: number } = 1, concurrency = 2) {
  cases.forEach((value, index) => writeFileSync(join(dir, `input-${index}.json`), JSON.stringify(value)));
  const manifest = join(dir, 'campaign-input.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, cases: cases.map((_, index) => `input-${index}.json`), ...(typeof schedule === 'number' ? { rounds: schedule } : schedule), concurrency }));
  return manifest;
}

test('overlapping commands have independent HTTP state, workspace/home/temp and evidence in every repeat', async () => {
  await fixture(async dir => {
    let waiting: ServerResponse[] = [], pairs = 0;
    const coordinator = createServer((_req, response) => {
      waiting.push(response);
      if (waiting.length === 2) { pairs++; waiting.forEach(item => item.end('go')); waiting = []; }
    }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const script = `import fs from 'node:fs';import path from 'node:path';
        fs.writeFileSync('counter','1',{flag:'wx'});
        if(fs.realpathSync(process.env.HOME)!==path.join(process.cwd(),'home')||fs.realpathSync(process.env.TMPDIR)!==path.join(process.cwd(),'tmp')||process.env.TMP!==process.env.TEMP||process.env.TMP!==process.env.TMPDIR)process.exit(9);
        fs.writeFileSync(path.join(process.env.HOME,'state'),'1',{flag:'wx'});fs.writeFileSync(path.join(process.env.TMPDIR,'state'),'1',{flag:'wx'});
        if((await fetch('{{serviceUrl}}/private-route')).status!==503)process.exit(8);
        await (await fetch('http://127.0.0.1:${address.port}')).text();
        if((await fetch('{{serviceUrl}}/private-route')).status!==200)process.exit(7);console.log('ok');`;
      const result = await runCampaign(inputs(dir, [workflow(script), workflow(script)]), join(dir, 'out'));
      expect(result.verdict).toBe('passed');
      expect(pairs).toBe(2); // Neither command can finish without its simultaneously running peer.
      expect(result.counts).toEqual({ jobs: 2, passed: 2, failed: 0, insufficient_evidence: 0, runs: 4 });
      expect(result.peakConcurrency).toBe(2);
      const runs = result.jobs.flatMap(job => job.runs);
      expect(new Set(runs.map(run => run.workspacePath)).size).toBe(4);
      for (const run of runs) {
        expect(readFileSync(join(run.workspacePath!, 'counter'), 'utf8')).toBe('1');
        const trace = JSON.parse(readFileSync(run.tracePath, 'utf8'));
        expect(trace.initial.requests).toBe(0);
        expect(trace.interactions.map((row: { status: number }) => row.status)).toEqual([503, 200]);
        expect(trace.declaration.command.current.cwd).toBe(run.workspacePath);
        expect(statSync(run.workspacePath!).mode & 0o777).toBe(0o700);
        expect(statSync(run.tracePath).mode & 0o777).toBe(0o600);
      }
      const publicText = JSON.stringify(result) + readFileSync(result.report, 'utf8');
      for (const secret of ['private-route', 'private-title', 'private-requirement', 'private-check', script]) expect(publicText).not.toContain(secret);
    } finally {
      coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('round-major queue is bounded and serial at concurrency one, without retaining state across repeats', async () => {
  await fixture(async dir => {
    const result = await runCampaign(inputs(dir, [workflow(), workflow()], 2, 1), join(dir, 'out'));
    expect(result.verdict).toBe('passed');
    expect(result.jobs.map(job => [job.jobIndex, job.caseIndex, job.round])).toEqual([[0, 0, 1], [1, 1, 1], [2, 0, 2], [3, 1, 2]]);
    expect(result.peakConcurrency).toBe(1);
    for (let index = 1; index < result.jobs.length; index++) expect(result.jobs[index].startedAt >= result.jobs[index - 1].endedAt).toBe(true);
    expect(result.jobs.flatMap(job => job.runs).every(run => JSON.parse(readFileSync(run.tracePath, 'utf8')).initial.requests === 0)).toBe(true);
  });
});

test('mismatches and unavailable/timeout commands do not stop peers, with conservative aggregate precedence', async () => {
  await fixture(async dir => {
    const failed = workflow(); failed.command.checks[0].value = 'different';
    const unavailable = workflow(); unavailable.command.current.executable = '/nonexistent/praman-campaign-command';
    // A spawned process uses the platform clock; fake timers cannot exercise its deadline.
    const timeout = workflow('setTimeout(()=>{},5000)'); timeout.command.current.deadlineMs = 50;
    const result = await runCampaign(inputs(dir, [failed, unavailable, timeout, workflow()], 1, 2), join(dir, 'out'));
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.jobs.map(job => job.verdict)).toEqual(['failed', 'insufficient_evidence', 'insufficient_evidence', 'passed']);
    expect(result.counts.runs).toBe(8);
    expect(result.peakConcurrency).toBeLessThanOrEqual(2);
    expect((await runCampaign(inputs(dir, [failed, workflow()]), join(dir, 'failed'))).verdict).toBe('failed');
  });
});

test('checked reset runs in its own repeat workspace and a blocked reset never executes its application', async () => {
  await fixture(async dir => {
    const base = workflow();
    const reset = { ...base.command, current: { ...base.command.current, args: ['-e', 'require("fs").writeFileSync("counter","0");console.log("ok");'] } };
    const app = workflow('import fs from "node:fs";const n=Number(fs.readFileSync("counter"))+1;fs.writeFileSync("counter",String(n));await (await fetch("{{serviceUrl}}/private-route")).text();await (await fetch("{{serviceUrl}}/private-route")).text();console.log(n);');
    app.command.checks[0].value = '1\n';
    const good = { ...app, applicationState: { kind: 'reset', command: reset } };
    const bad = structuredClone(good); bad.applicationState.command.checks[0].value = 'not reset';
    const result = await runCampaign(inputs(dir, [good, bad]), join(dir, 'out'));
    expect(result.jobs.map(job => job.verdict)).toEqual(['passed', 'insufficient_evidence']);
    for (const run of result.jobs[0].runs) expect(readFileSync(join(run.workspacePath!, 'counter'), 'utf8')).toBe('1');
    for (const run of result.jobs[1].runs) {
      expect(run.commandVerdict).toBeUndefined();
      expect(readFileSync(join(run.workspacePath!, 'counter'), 'utf8')).toBe('0');
      expect(JSON.parse(readFileSync(run.resultPath, 'utf8')).reset.verdict).toBe('failed');
    }
  });
});

test('saved service state is privately captured, restored independently, and never mutates the source', async () => {
  await fixture(async dir => {
    const spec = workflow('await (await fetch("{{serviceUrl}}/private-route")).text();console.log("ok");');
    const snapshot = { version: 1, declarationHash: createHash('sha256').update(JSON.stringify(serviceSchema.parse(spec.dependency.service))).digest('hex'), state: 'retry', requests: 4 };
    const source = join(dir, 'saved.json'), original = JSON.stringify(snapshot);
    writeFileSync(source, original);
    const saved = { ...spec, dependency: { ...spec.dependency, start: { kind: 'snapshot', path: 'saved.json' }, steps: [spec.dependency.steps[1]], final: { state: 'ready', requests: 5 } } };
    const result = await runCampaign(inputs(dir, [saved, saved]), join(dir, 'out'));
    expect(result.verdict).toBe('passed');
    for (const run of result.jobs.flatMap(job => job.runs)) {
      expect(JSON.parse(readFileSync(run.tracePath, 'utf8')).initial).toEqual(snapshot);
      expect(JSON.parse(readFileSync(run.resultPath, 'utf8')).final).toMatchObject({ state: 'ready', requests: 5 });
    }
    expect(readFileSync(source, 'utf8')).toBe(original);
    const receipt = readFileSync(result.reportPath, 'utf8');
    await expect(runCampaign(join(dir, 'campaign-input.json'), join(dir, 'out'))).rejects.toThrow();
    expect(readFileSync(result.reportPath, 'utf8')).toBe(receipt);
  });
});

test('invalid later input, snapshot, cwd, artifact escape and scheduling bounds reject the whole suite before commands', async () => {
  await fixture(async dir => {
    const marker = join(dir, 'should-not-exist');
    const first = workflow(`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'executed');`);
    const wrongCwd = workflow(); wrongCwd.command.current.cwd = '.';
    const escape = workflow(); escape.command.checks = [{ id: 'artifact', source: 'artifact', operator: 'equals', value: 'x', path: '../outside' } as typeof escape.command.checks[number]];
    const missing = { ...workflow(), dependency: { ...workflow().dependency, start: { kind: 'snapshot', path: 'absent.json' } } };
    writeFileSync(join(dir, 'incompatible.json'), JSON.stringify({ version: 1, declarationHash: 'wrong', state: 'ready', requests: 0 }));
    const incompatible = { ...missing, dependency: { ...missing.dependency, start: { kind: 'snapshot', path: 'incompatible.json' } } };
    for (const [index, invalid] of [null, wrongCwd, escape, missing, incompatible].entries()) {
      const result = await runCampaign(inputs(dir, [first, invalid]), join(dir, `out-${index}`));
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.jobs).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }
    for (const [index, settings] of [{ rounds: 0 }, { concurrency: 9 }, { rounds: 20, cases: Array(6).fill('input-0.json') }].entries()) {
      const file = inputs(dir, [first]);
      writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...settings }));
      expect((await runCampaign(file, join(dir, `bounds-${index}`))).verdict).toBe('insufficient_evidence');
      expect(existsSync(marker)).toBe(false);
    }
  });
});

test('duration admission uses a monotonic cutoff, cycles the suite and never starts a job at the boundary', async () => {
  await fixture(async dir => {
    // Only the admission clock is controlled; commands and HTTP requests execute for real.
    let elapsed = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const coordinator = createServer((_request, response) => { elapsed += 25; response.end(); }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const spec = workflow(`import fs from 'node:fs';fs.writeFileSync('counter','1',{flag:'wx'});await(await fetch('{{serviceUrl}}/private-route')).text();await(await fetch('http://127.0.0.1:${address.port}')).text();await(await fetch('{{serviceUrl}}/private-route')).text();console.log('ok');`);
      const result = await runCampaign(inputs(dir, [spec], { durationMs: 100, maxJobs: 10 }, 1), join(dir, 'out'));
      expect(result.verdict).toBe('passed');
      expect(result.jobs.map(job => [job.caseIndex, job.round, job.startedAfterMs])).toEqual([[0, 1, 0], [0, 2, 50]]);
      expect(result.schedule).toMatchObject({ kind: 'duration', stopReason: 'duration_elapsed', elapsedMs: 100, admissionClosedAfterMs: 100, drainMs: 0, unstartedCases: [] });
      for (const run of result.jobs.flatMap(job => job.runs)) {
        expect(readFileSync(join(run.workspacePath!, 'counter'), 'utf8')).toBe('1');
        expect(JSON.parse(readFileSync(run.tracePath, 'utf8')).initial.requests).toBe(0);
      }
      const before = readFileSync(result.reportPath, 'utf8');
      await expect(runCampaign(join(dir, 'campaign-input.json'), join(dir, 'out'))).rejects.toThrow();
      expect(readFileSync(result.reportPath, 'utf8')).toBe(before);
    } finally {
      clock.mockRestore(); coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('duration expiry drains both active workflows including later repeats and closes every dependency', async () => {
  await fixture(async dir => {
    let elapsed = 0, requests = 0;
    const pending: ServerResponse[] = [], services = new Set<string>();
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const coordinator = createServer((request, response) => {
      services.add(new URL(request.url!, 'http://localhost').searchParams.get('service')!);
      requests++;
      if (requests <= 2) {
        pending.push(response);
        if (requests === 2) { elapsed = 100; pending.forEach(item => item.end()); }
      } else { elapsed = 200; response.end(); }
    }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const spec = workflow(`await(await fetch('{{serviceUrl}}/private-route')).text();await(await fetch('http://127.0.0.1:${address.port}/?service={{serviceUrl}}')).text();await(await fetch('{{serviceUrl}}/private-route')).text();console.log('ok');`);
      const result = await runCampaign(inputs(dir, [spec, spec], { durationMs: 100, maxJobs: 20 }, 2), join(dir, 'out'));
      expect(result.verdict).toBe('passed');
      expect(result.jobs.map(job => job.startedAfterMs)).toEqual([0, 0]);
      expect(result.counts).toEqual({ jobs: 2, passed: 2, failed: 0, insufficient_evidence: 0, runs: 4 });
      expect(requests).toBe(4);
      expect(services.size).toBe(4);
      expect(result.schedule).toMatchObject({ stopReason: 'duration_elapsed', admissionClosedAfterMs: 100, elapsedMs: 200, drainMs: 100 });
      for (const service of services) await expect(fetch(service, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
      for (const run of result.jobs.flatMap(job => job.runs)) {
        expect(run.verdict).toBe('passed');
        expect(JSON.parse(readFileSync(run.tracePath, 'utf8')).interactions.map((row: { status: number }) => row.status)).toEqual([503, 200]);
      }
    } finally {
      clock.mockRestore(); coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('a job cap cannot establish a completed soak even when all observed checks pass', async () => {
  await fixture(async dir => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      const result = await runCampaign(inputs(dir, [workflow()], { durationMs: 100, maxJobs: 1 }, 1), join(dir, 'out'));
      expect(result.jobs.map(job => job.verdict)).toEqual(['passed']);
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.schedule).toMatchObject({ stopReason: 'job_limit', unstartedCases: [] });
    } finally { clock.mockRestore(); }
  });
});

test('a duration window that never admits a declared case stays insufficient, not partial-suite green', async () => {
  await fixture(async dir => {
    let elapsed = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const coordinator = createServer((_request, response) => { elapsed = 100; response.end(); }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const spec = workflow(`await(await fetch('{{serviceUrl}}/private-route')).text();await(await fetch('http://127.0.0.1:${address.port}')).text();await(await fetch('{{serviceUrl}}/private-route')).text();console.log('ok');`);
      const result = await runCampaign(inputs(dir, [spec, workflow()], { durationMs: 100, maxJobs: 10 }, 1), join(dir, 'out'));
      expect(result.jobs.map(job => job.verdict)).toEqual(['passed']);
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.schedule).toMatchObject({ stopReason: 'duration_elapsed', unstartedCases: [1] });
    } finally {
      clock.mockRestore(); coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('duration completion retains failures and unavailable execution while continuing with other cases', async () => {
  await fixture(async dir => {
    let elapsed = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const coordinator = createServer((_request, response) => { elapsed += 50; response.end(); }).listen(0, '127.0.0.1');
    await once(coordinator, 'listening');
    const address = coordinator.address();
    if (!address || typeof address === 'string') throw new Error('No coordinator');
    try {
      const spec = workflow(`await(await fetch('{{serviceUrl}}/private-route')).text();await(await fetch('http://127.0.0.1:${address.port}')).text();await(await fetch('{{serviceUrl}}/private-route')).text();console.log('ok');`);
      for (const kind of ['failed', 'unavailable', 'reset'] as const) {
        elapsed = 0;
        const bad = structuredClone(spec);
        if (kind === 'failed') bad.command.checks[0].value = 'wrong';
        if (kind === 'unavailable') bad.command.current.executable = '/nonexistent/praman-soak-command';
        const blocked = { ...bad, applicationState: { kind: 'reset', command: { ...spec.command, current: { ...spec.command.current, args: ['-e', 'console.log(\"not reset\")'] } } } };
        const result = await runCampaign(inputs(dir, [kind === 'reset' ? blocked : bad, spec], { durationMs: kind === 'failed' ? 200 : 100, maxJobs: 10 }, 1), join(dir, kind));
        expect(result.schedule).toMatchObject({ stopReason: 'duration_elapsed', unstartedCases: [] });
        expect(result.jobs.map(job => job.verdict)).toEqual([kind === 'failed' ? 'failed' : 'insufficient_evidence', 'passed']);
        expect(result.verdict).toBe(kind === 'failed' ? 'failed' : 'insufficient_evidence');
      }
    } finally {
      clock.mockRestore(); coordinator.closeAllConnections();
      const closed = Promise.withResolvers<void>(); coordinator.close(() => closed.resolve()); await closed.promise;
    }
  });
});

test('ambiguous and out-of-bounds duration schedules reject before any application command', async () => {
  await fixture(async dir => {
    const marker = join(dir, 'should-not-exist');
    const spec = workflow(`require('fs').writeFileSync(${JSON.stringify(marker)},'executed');`);
    const variants = [
      { durationMs: 0, maxJobs: 10 }, { durationMs: 86400001, maxJobs: 10 },
      { durationMs: 100, maxJobs: 0 }, { durationMs: 100, maxJobs: 1001 },
      { durationMs: 100 }, { maxJobs: 10 }, {},
      { rounds: 1, durationMs: 100, maxJobs: 10 }, { rounds: 1, maxJobs: 10 },
    ];
    for (const [index, schedule] of variants.entries()) {
      const file = inputs(dir, [spec]);
      writeFileSync(file, JSON.stringify({ version: 1, cases: ['input-0.json'], concurrency: 1, ...schedule }));
      const result = await runCampaign(file, join(dir, `invalid-duration-${index}`));
      expect(result.verdict).toBe('insufficient_evidence');
      expect(result.schedule.stopReason).toBe('input_error');
      expect(result.jobs).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    }
  });
});

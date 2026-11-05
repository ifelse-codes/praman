import { expect, test } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startDurableCampaign, resumeDurableCampaign } from '../src/core/durableCampaign.js';

async function fixture(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'praman-durable-'));
  try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function inputs(dir: string, coordinator: string, schedule: object = {}) {
  const workflow = { version: 1, applicationState: { kind: 'stateless' }, command: {
    mode: 'acceptance', title: 'private-title', requirement: 'private-requirement', current: {
      executable: process.execPath, args: ['--input-type=module', '-e', `await(await fetch('{{serviceUrl}}/work')).text();await(await fetch('${coordinator}?pid='+process.pid)).text();console.log('ok');`], cwd: '{{runDir}}', deadlineMs: 5000,
    }, checks: [{ id: 'private-check', source: 'stdout', operator: 'equals', value: 'ok\n' }],
  }, dependency: { version: 1, repeats: 2, start: { kind: 'initial' }, service: { version: 1, initial: 'ready', states: { ready: [{ method: 'GET', path: '/work', next: 'ready', response: { status: 200, body: { ok: true } } }] } },
    steps: [{ method: 'GET', path: '/work', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } }], final: { state: 'ready', requests: 1 } } };
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify(workflow));
  const file = join(dir, 'input.json'); writeFileSync(file, JSON.stringify({ version: 1, cases: ['workflow.json'], rounds: 3, concurrency: 1, ...schedule }));
  return file;
}
async function server(handler: (response: ServerResponse, pid: number) => void) {
  const instance = createServer((request, response) => handler(response, Number(new URL(request.url!, 'http://localhost').searchParams.get('pid')))).listen(0, '127.0.0.1');
  await once(instance, 'listening'); const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('No coordinator');
  return { url: `http://127.0.0.1:${address.port}/`, async close() { instance.closeAllConnections(); const done = Promise.withResolvers<void>(); instance.close(() => done.resolve()); await done.promise; } };
}

test('orderly pause drains admitted repeats and resumption uses captured inputs without rerunning completed jobs', async () => {
  await fixture(async dir => {
    const stop = new AbortController(); let calls = 0;
    const coordinator = await server(response => { calls++; stop.abort(); response.end(); });
    try {
      const input = inputs(dir, coordinator.url), out = join(dir, 'session');
      const paused = await startDurableCampaign(input, out, stop.signal);
      if (!('phase' in paused)) throw new Error('No paused receipt');
      expect(paused.phase).toBe('paused'); expect(paused.verdict).toBe('insufficient_evidence');
      expect(paused.counts).toEqual({ complete: 1, pending: 2, running: 0 }); expect(calls).toBe(2);
      const initialReceipt = readFileSync(paused.reportPath, 'utf8');
      const completed = paused.jobs[0].receiptPath!; const bytes = readFileSync(completed, 'utf8');
      writeFileSync(join(dir, 'workflow.json'), 'original input was edited after capture');
      const resumed = await resumeDurableCampaign(out);
      if (!('phase' in resumed)) throw new Error('No resumed receipt');
      expect(resumed.phase).toBe('complete'); expect(resumed.verdict).toBe('passed');
      expect(calls).toBe(6); expect(resumed.counts).toEqual({ complete: 3, pending: 0, running: 0 });
      expect(readFileSync(completed, 'utf8')).toBe(bytes); expect(readFileSync(paused.reportPath, 'utf8')).toBe(initialReceipt);
      expect((await resumeDurableCampaign(out)).verdict).toBe('passed'); expect(calls).toBe(6);
      expect(statSync(join(out, 'queue.sqlite')).mode & 0o777).toBe(0o600);
      expect(JSON.stringify(resumed)).not.toContain('private-title'); expect(JSON.stringify(resumed)).not.toContain('private-check');
      await expect(startDurableCampaign(input, out)).rejects.toThrow(); expect(readFileSync(completed, 'utf8')).toBe(bytes);
    } finally { await coordinator.close(); }
  });
});

test('a live coordinator cannot be taken over by a second resume operation', async () => {
  await fixture(async dir => {
    const stop = new AbortController(), reached = Promise.withResolvers<void>(); let held: ServerResponse | undefined, calls = 0;
    const coordinator = await server(response => { calls++; stop.abort(); if (calls === 1) { held = response; reached.resolve(); } else response.end(); });
    const operation = startDurableCampaign(inputs(dir, coordinator.url), join(dir, 'session'), stop.signal);
    try {
      await Promise.race([reached.promise, operation.then(result => { throw new Error(`Coordinator exited before barrier: ${JSON.stringify(result)}`); })]);
      const refused = await resumeDurableCampaign(join(dir, 'session'));
      expect(refused.verdict).toBe('insufficient_evidence'); expect('reason' in refused && refused.reason).toBe('coordinator_active'); expect(calls).toBe(1);
      held!.end(); const paused = await operation;
      expect('phase' in paused && paused.phase).toBe('paused'); expect(calls).toBe(2);
    } finally { held?.end(); await operation; await coordinator.close(); }
  });
});

test('captured input or completed receipt edits block resume before any pending job runs', async () => {
  await fixture(async dir => {
    for (const target of ['input', 'receipt']) {
      const stop = new AbortController(); let calls = 0;
      const coordinator = await server(response => { calls++; stop.abort(); response.end(); });
      try {
        const out = join(dir, target), paused = await startDurableCampaign(inputs(dir, coordinator.url), out, stop.signal);
        if (!('phase' in paused)) throw new Error('No paused receipt');
        const file = target === 'input' ? join(out, 'case-0.json') : paused.jobs[0].receiptPath!;
        writeFileSync(file, '{}');
        const refused = await resumeDurableCampaign(out);
        expect(refused.verdict).toBe('insufficient_evidence'); expect(calls).toBe(2);
        expect('reason' in refused && refused.reason).toBe('input_or_storage_unavailable');
      } finally { await coordinator.close(); }
    }
  });
});

test('a hard coordinator crash preserves uncertain admission and never dispatches pending jobs on resume', async () => {
  await fixture(async dir => {
    const reached = Promise.withResolvers<void>(); let applicationPid: number | undefined, held: ServerResponse | undefined, calls = 0;
    const coordinator = await server((response, pid) => { calls++; applicationPid = pid; held = response; reached.resolve(); });
    const out = join(dir, 'session'), input = inputs(dir, coordinator.url);
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'workflow-campaign', input, '--durable', '-o', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr!.on('data', chunk => stderr += chunk);
    const closed = once(child, 'close');
    try {
      // The real app is held at an HTTP barrier; no sleep or guessed kill timing.
      await Promise.race([reached.promise, closed.then(() => { throw new Error(`Coordinator exited before barrier: ${stderr}`); })]);
      child.kill('SIGKILL'); await closed;
      const refused = await resumeDurableCampaign(out);
      if (!('phase' in refused)) throw new Error(`No recovery receipt: ${stderr}`);
      expect(refused.phase).toBe('recovery_required'); expect(refused.verdict).toBe('insufficient_evidence');
      expect(refused.counts).toEqual({ running: 1, pending: 2, complete: 0 }); expect(calls).toBe(1);
      expect((await resumeDurableCampaign(out)).verdict).toBe('insufficient_evidence'); expect(calls).toBe(1);
    } finally {
      // This fixture owns the held orphan app PID; product recovery deliberately did not adopt/kill it.
      if (applicationPid) { try { process.kill(applicationPid, 'SIGKILL'); } catch { /* already exited */ } }
      held?.end(); child.kill('SIGKILL'); await closed; await coordinator.close();
    }
  });
});

test('duration/stateful or invalid suites are rejected before any trusted application command', async () => {
  await fixture(async dir => {
    for (const [index, schedule] of [{ rounds: undefined, durationMs: 100, maxJobs: 10 }, { state: { kind: 'per-worker' } }, { cases: ['workflow.json', 'missing.json'] }].entries()) {
      const result = await startDurableCampaign(inputs(dir, 'http://127.0.0.1:1/', schedule), join(dir, `invalid-${index}`));
      expect(result.verdict).toBe('insufficient_evidence'); expect(existsSync(join(dir, `invalid-${index}`, 'job-0'))).toBe(false);
    }
  });
});

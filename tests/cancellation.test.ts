import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { interruptGraceMs, proveCommands } from '../src/eval/command.js';
import { replayWorkflow } from '../src/core/workflow.js';

// Spec verify-cancellation: an interrupted verification must stop every process it
// owns, start no further runs and never record a pass. The declared command starts a
// grandchild in its own process group, so the checks cover the whole owned group.
const root = fileURLToPath(new URL('..', import.meta.url));
const distCli = path.join(root, 'dist', 'cli.js');
const hasBuild = existsSync(distCli);

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'praman-cancel-')); });
afterEach(() => {
  for (const pid of startedPids()) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } }
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined, ms = 15000): Promise<T | undefined> {
  const end = Date.now() + ms;
  for (;;) { const value = read(); if (value !== undefined || Date.now() > end) return value; await sleep(25); }
}
function pidFile(index: number) { return path.join(dir, `pids-${index}.json`); }
function startedPids(): number[] {
  const pids: number[] = [];
  for (let i = 1; existsSync(pidFile(i)); i++) pids.push((JSON.parse(readFileSync(pidFile(i), 'utf8')) as number[])[0]);
  return pids;
}
function groupAlive(pid: number) { try { process.kill(-pid, 0); return true; } catch { return false; } }
async function groupsGone(pids: number[]) { return (await until(() => pids.every(pid => !groupAlive(pid)) ? true : undefined, 5000)) ?? false; }
/** Records [leader, grandchild] in the next free pids file, then sleeps well past any test. */
function sleeper(ignoreTerm = false) {
  const script = `${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ''}const fs=require('fs'),cp=require('child_process');let i=1;while(fs.existsSync(${JSON.stringify(dir)}+'/pids-'+i+'.json'))i++;`
    + `const c=cp.spawn(process.execPath,['-e',${JSON.stringify(ignoreTerm ? "process.on('SIGTERM',()=>{});setTimeout(()=>{},20000)" : 'setTimeout(()=>{},20000)')}],{stdio:'ignore'});`
    + `fs.writeFileSync(${JSON.stringify(dir)}+'/pids-'+i+'.json',JSON.stringify([process.pid,c.pid]));setTimeout(()=>{},20000)`;
  return { executable: process.execPath, args: ['-e', script], cwd: '.', deadlineMs: 30000 };
}
function commandDeclaration(repeats = 3, ignoreTerm = false) {
  const file = path.join(dir, 'cmd.json');
  writeFileSync(file, JSON.stringify({ mode: 'acceptance', title: 'Cancellation', requirement: 'Stop owned processes', current: sleeper(ignoreTerm),
    checks: [{ id: 'out', source: 'stdout', operator: 'equals', value: '' }], repeats }));
  return file;
}
function workflowDeclaration() {
  const file = path.join(dir, 'workflow.json');
  writeFileSync(file, JSON.stringify({ version: 1, dependency: { version: 1, service: { version: 1, initial: 'ready', states: { ready: [{ method: 'GET', path: '/w', next: 'ready', response: { status: 200, body: { ok: true } } }] } },
    start: { kind: 'initial' }, steps: [{ method: 'GET', path: '/w', expect: { status: 200, body: { kind: 'json', value: { ok: true } } } }], final: { state: 'ready', requests: 1 }, repeats: 3 },
  applicationState: { kind: 'stateless' },
  command: { mode: 'acceptance', title: 'Cancellation', requirement: 'Stop owned processes', current: sleeper(), checks: [{ id: 'out', source: 'stdout', operator: 'equals', value: '' }] } }));
  return file;
}
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { verdict: string; interrupted?: boolean; current?: unknown[]; runs?: unknown[] };
async function firstLeader() { return until(() => existsSync(pidFile(1)) ? (JSON.parse(readFileSync(pidFile(1), 'utf8')) as number[])[0] : undefined); }

describe('interrupted verification (in process)', () => {
  it('command verification stops the owned group, starts no further repeat and records interrupted insufficient evidence', async () => {
    const controller = new AbortController();
    const out = path.join(dir, 'out');
    const running = proveCommands(commandDeclaration(), out, controller.signal);
    expect(await firstLeader()).toBeTypeOf('number');
    controller.abort();
    const result = await running;
    expect(await groupsGone(startedPids())).toBe(true);
    expect(startedPids()).toHaveLength(1);
    expect(result.verdict).toBe('insufficient_evidence');
    const proof = readJson(path.join(out, 'proof.json'));
    expect(proof).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
    expect(proof.current).toHaveLength(1);
    expect(readJson(path.join(out, 'feedback.json'))).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
  });

  it('a group that ignores SIGTERM is killed after the bounded grace period', async () => {
    const controller = new AbortController();
    const running = proveCommands(commandDeclaration(3, true), path.join(dir, 'out'), controller.signal);
    expect(await firstLeader()).toBeTypeOf('number');
    const abortedAt = Date.now();
    controller.abort();
    const result = await running;
    const elapsed = Date.now() - abortedAt;
    expect(elapsed).toBeGreaterThanOrEqual(interruptGraceMs - 100);
    expect(elapsed).toBeLessThan(interruptGraceMs + 3000);
    expect(await groupsGone(startedPids())).toBe(true);
    expect(result.verdict).toBe('insufficient_evidence');
  });

  it('a signal aborted before verification starts runs nothing and never passes', async () => {
    const out = path.join(dir, 'out');
    const result = await proveCommands(commandDeclaration(), out, AbortSignal.abort());
    expect(startedPids()).toHaveLength(0);
    expect(result.verdict).toBe('insufficient_evidence');
    expect(readJson(path.join(out, 'proof.json'))).toMatchObject({ interrupted: true, current: [] });
  });

  it('a never-aborted signal leaves the verdict unchanged', async () => {
    const file = path.join(dir, 'ok.json');
    writeFileSync(file, JSON.stringify({ mode: 'acceptance', title: 'Unchanged', requirement: 'Print 5', current: { executable: process.execPath, args: ['-e', 'console.log(5)'], cwd: '.', deadlineMs: 5000 }, checks: [{ id: 'sum', source: 'stdout', operator: 'equals', value: '5\n' }] }));
    const withSignal = await proveCommands(file, path.join(dir, 'a'), new AbortController().signal);
    const without = await proveCommands(file, path.join(dir, 'b'));
    expect([withSignal.verdict, without.verdict]).toEqual(['passed', 'passed']);
    expect(readJson(withSignal.proofPath).interrupted).toBeUndefined();
  });

  it('workflow replay stops the owned group and the remaining repeats', async () => {
    const controller = new AbortController();
    const running = replayWorkflow(workflowDeclaration(), path.join(dir, 'out'), { signal: controller.signal });
    expect(await firstLeader()).toBeTypeOf('number');
    controller.abort();
    const result = await running;
    expect(await groupsGone(startedPids())).toBe(true);
    expect(startedPids()).toHaveLength(1);
    expect(result.verdict).toBe('insufficient_evidence');
    expect(readJson(result.proofPath)).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
  });
});

function startCli(args: string[]) {
  const child = spawn(process.execPath, [distCli, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.on('close', (code, signal) => resolve({ code, signal })));
  return { child, exit };
}

describe.skipIf(!hasBuild)('interrupted verification through compiled entry points (requires npm run build)', () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
    it(`command-verify on ${signal} stops the owned group, writes interrupted evidence and exits ${code}`, async () => {
      const out = path.join(dir, 'out');
      const { child, exit } = startCli(['command-verify', commandDeclaration(), '-o', out, '--summary']);
      expect(await firstLeader()).toBeTypeOf('number');
      child.kill(signal);
      expect(await exit).toEqual({ code, signal: null });
      expect(await groupsGone(startedPids())).toBe(true);
      expect(startedPids()).toHaveLength(1);
      expect(readJson(path.join(out, 'proof.json'))).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
    }, 30000);
  }

  it('workflow-replay on SIGINT stops the owned group and exits 130', async () => {
    const out = path.join(dir, 'out');
    const { child, exit } = startCli(['workflow-replay', workflowDeclaration(), '-o', out]);
    expect(await firstLeader()).toBeTypeOf('number');
    child.kill('SIGINT');
    expect(await exit).toEqual({ code: 130, signal: null });
    expect(await groupsGone(startedPids())).toBe(true);
    expect(readJson(path.join(out, 'workflow.json'))).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
  }, 30000);

  for (const how of ['request cancellation', 'transport close'] as const) {
    it(`MCP ${how} stops the owned group and records interrupted evidence`, async () => {
      const out = path.join(dir, 'out');
      const transport = new StdioClientTransport({ command: process.execPath, args: [distCli, 'mcp'], cwd: root, stderr: 'pipe' });
      const client = new Client({ name: 'praman-cancellation', version: '0.0.0' });
      await client.connect(transport);
      const controller = new AbortController();
      const call = client.callTool({ name: 'praman_command_verify', arguments: { specPath: commandDeclaration(), outDir: out } }, undefined, { signal: controller.signal, timeout: 60000 }).catch(() => undefined);
      try {
        expect(await firstLeader()).toBeTypeOf('number');
        if (how === 'request cancellation') controller.abort('test cancel');
        else await client.close();
        await call;
        expect(await groupsGone(startedPids())).toBe(true);
        expect(await until(() => existsSync(path.join(out, 'proof.json')) ? true : undefined, 5000)).toBe(true);
        expect(readJson(path.join(out, 'proof.json'))).toMatchObject({ verdict: 'insufficient_evidence', interrupted: true });
        expect(startedPids()).toHaveLength(1);
      } finally { await client.close().catch(() => {}); }
    }, 30000);
  }
});

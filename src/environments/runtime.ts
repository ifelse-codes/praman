import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { appendFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { EnvironmentState, OwnedProcess, SaveState } from './types.js';

export async function command(state: EnvironmentState, executable: string, args: string[], opts: { input?: string; timeoutMs?: number; cwd?: string; env?: Record<string, string>; withStderr?: boolean } = {}): Promise<string> {
  const started = new Date().toISOString();
  const proc = spawn(executable, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env, DOCKER_HOST: state.spec.dockerHost, KIND_EXPERIMENTAL_PROVIDER: 'docker' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', expired = false;
  const timer = setTimeout(() => { expired = true; proc.kill('SIGKILL'); }, opts.timeoutMs ?? 180_000);
  proc.stdout.on('data', chunk => { stdout += chunk; });
  proc.stderr.on('data', chunk => { stderr += chunk; });
  proc.stdin.on('error', () => {});
  proc.stdin.end(opts.input);
  try {
    const [code] = await once(proc, 'close');
    appendFileSync(join(state.directory, 'commands.jsonl'), JSON.stringify({ started, executable, args, cwd: opts.cwd, code, expired, stdout, stderr }) + '\n', { mode: 0o600 });
    if (code !== 0 || expired) throw new Error(`${executable} ${args.join(' ')}: ${expired ? 'deadline exceeded' : `exit ${code}`}\n${stderr || stdout}`);
    return opts.withStderr ? stdout + stderr : stdout;
  } finally { clearTimeout(timer); }
}

export async function ensureDockerRunner(state: EnvironmentState) {
  if (state.spec.colimaProfile) {
    const profiles = (await command(state, 'colima', ['list', '--json'])).trim().split('\n').filter(Boolean).map(line => z.object({ name: z.string(), status: z.string() }).parse(JSON.parse(line)));
    if (profiles.find(row => row.name === state.spec.colimaProfile)?.status !== 'Running') {
      await command(state, 'colima', ['start', state.spec.colimaProfile, '--activate=false'], { timeoutMs: 300_000 });
    }
  }
  await command(state, 'docker', ['info', '--format', '{{.ServerVersion}}']);
}

export async function freePort(host = '127.0.0.1') {
  const server = createServer();
  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local TCP port available');
  const port = address.port;
  server.close(); await once(server, 'close');
  return port;
}
export async function processIdentity(state: EnvironmentState, pid: number) {
  try { return (await command(state, 'ps', ['-p', String(pid), '-o', 'lstart='], { timeoutMs: 5_000 })).trim(); }
  catch (error) {
    try { process.kill(pid, 0); }
    catch (probe) { if (probe instanceof Error && 'code' in probe && probe.code === 'ESRCH') return ''; throw probe; }
    throw error;
  }
}
export async function startProcess(state: EnvironmentState, save: SaveState, executable: string, args: string[], cwd: string, env: Record<string, string>, name: string) {
  const log = join(state.directory, `${name}.log`);
  const fd = openSync(log, 'a', 0o600);
  const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  await once(child, 'spawn');
  if (!child.pid) throw new Error(`No PID for ${name}`);
  const ownedProcess: OwnedProcess = { pid: child.pid, command: executable, args, log, startedAt: '' };
  state.processes.push(ownedProcess); save();
  child.unref();
  ownedProcess.startedAt = await processIdentity(state, child.pid); save();
  if (!ownedProcess.startedAt) throw new Error(`${name} exited at startup; inspect ${log}`);
}
export async function stopProcesses(state: EnvironmentState, save: SaveState) {
  const errors: string[] = [];
  for (const proc of [...state.processes].reverse()) {
    const identity = await processIdentity(state, proc.pid);
    if (!identity) { state.processes = state.processes.filter(item => item.pid !== proc.pid); save(); continue; }
    if (!proc.startedAt || identity !== proc.startedAt) { errors.push(`PID ${proc.pid} identity changed; refusing termination`); continue; }
    try {
      process.kill(-proc.pid, 'SIGTERM');
      const deadline = Date.now() + 10_000;
      while (await processIdentity(state, proc.pid)) {
        if (Date.now() > deadline) {
          if (await processIdentity(state, proc.pid) !== proc.startedAt) throw new Error('Process identity changed during teardown');
          process.kill(-proc.pid, 'SIGKILL');
          await delay(200);
          if (await processIdentity(state, proc.pid)) throw new Error(`PID ${proc.pid} remains after kill`);
          break;
        }
        await delay(100);
      }
      state.processes = state.processes.filter(item => item.pid !== proc.pid); save();
    } catch (error) { errors.push(String(error)); }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

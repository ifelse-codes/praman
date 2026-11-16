import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Diagnostic } from '../review/diagnostics.js';

/**
 * The app under test, identified by a trusted command the caller declares (for example
 * `git rev-parse HEAD` or a script that prints a build hash). Optional: without it the
 * report says the app under test is not identified. Runs with the caller's environment,
 * like every declared command; not a sandbox.
 */
export const targetSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1),
  env: z.record(z.string(), z.string().nullable()).default({}),
  deadlineMs: z.number().int().min(1).max(60_000).default(10_000),
}).strict();
export type TargetDeclaration = z.infer<typeof targetSchema>;

/** `readingSha256` is the SHA-256 of the printed version text, not of any file or binary. */
export interface TargetReading { label: string; readingSha256?: string; error?: string }
export interface AppUnderTest {
  status: 'identified' | 'unavailable' | 'changed' | 'not_declared';
  /** The reading itself, only when it is short plain text (a commit, tag or build hash). */
  value?: string;
  readingSha256?: string;
  readings: TargetReading[];
  /** One plain line for summaries and reports. */
  summary: string;
}

const maxOutput = 64 * 1024;
const plainValue = /^[A-Za-z0-9._:+@/-]{1,128}$/;

/** Declaration-relative cwd and executable path, like the declared command itself. */
export function normalizeTarget(target: TargetDeclaration | undefined, directory: string): void {
  if (!target) return;
  target.cwd = path.resolve(directory, target.cwd);
  if (target.executable.includes(path.sep)) target.executable = path.resolve(directory, target.executable);
}

/** One reading: trimmed stdout of a zero exit within the deadline; anything else is unavailable. */
export async function readTarget(target: TargetDeclaration, label: string): Promise<TargetReading & { value?: string }> {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(target.env)) { if (value === null) delete env[key]; else env[key] = value; }
  return new Promise(resolve => {
    let output = Buffer.alloc(0), overflow = false, settled = false;
    const done = (reading: TargetReading & { value?: string }) => { if (!settled) { settled = true; clearTimeout(timer); resolve(reading); } };
    let child: ReturnType<typeof spawn>;
    try { child = spawn(target.executable, target.args, { cwd: target.cwd, env, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (error) { resolve({ label, error: `Target command could not start: ${error instanceof Error ? error.message : String(error)}` }); return; }
    const timer = setTimeout(() => { child.kill('SIGKILL'); done({ label, error: `Target command exceeded ${target.deadlineMs} ms.` }); }, target.deadlineMs);
    child.stdout!.on('data', (chunk: Buffer) => { if (output.length + chunk.length > maxOutput) { overflow = true; child.kill('SIGKILL'); } else output = Buffer.concat([output, chunk]); });
    child.on('error', error => done({ label, error: `Target command could not start: ${error.message}` }));
    child.on('close', code => {
      if (overflow) return done({ label, error: 'Target command printed more than 64 KiB.' });
      if (code !== 0) return done({ label, error: `Target command exited ${code}.` });
      const text = output.toString('utf8').trim();
      if (!text) return done({ label, error: 'Target command printed nothing.' });
      done({ label, readingSha256: createHash('sha256').update(text).digest('hex'), value: text });
    });
  });
}

/** Reads before every current run and once after the last; any failed or different reading is not an identified app. */
export class TargetTracker {
  private readings: Array<TargetReading & { value?: string }> = [];
  constructor(private readonly target: TargetDeclaration | undefined) {}
  async read(label: string): Promise<void> { if (this.target) this.readings.push(await readTarget(this.target, label)); }
  result(): AppUnderTest {
    if (!this.target) return { status: 'not_declared', readings: [], summary: 'App under test: not identified. Declare "target" (for example a command that prints the git commit) to record which version was tested.' };
    const readings = this.readings.map(({ label, readingSha256, error }) => ({ label, ...(readingSha256 ? { readingSha256 } : {}), ...(error ? { error } : {}) }));
    const first = this.readings[0];
    if (!this.readings.length || this.readings.some(row => !row.readingSha256)) return { status: 'unavailable', readings, summary: 'App under test: identity unavailable (the declared target command failed or printed nothing); not proven.' };
    if (this.readings.some(row => row.readingSha256 !== first.readingSha256)) return { status: 'changed', readingSha256: first.readingSha256, readings, summary: 'App under test: changed during verification (the declared target printed different values); not proven.' };
    const value = first.value && plainValue.test(first.value) ? first.value : undefined;
    return { status: 'identified', ...(value ? { value } : {}), readingSha256: first.readingSha256, readings,
      summary: `App under test: ${value ?? `reading sha256:${first.readingSha256!.slice(0, 12)}`} (same before every run and after the last).` };
  }
}

/** A declared target that could not be read, or changed, turns a would-be pass into not proven. */
export function applyTarget<V extends string>(verdict: V, reason: string, app: AppUnderTest): { verdict: V | 'insufficient_evidence'; reason: string } {
  if (verdict !== 'passed' || app.status === 'identified' || app.status === 'not_declared') return { verdict, reason };
  return { verdict: 'insufficient_evidence', reason: app.status === 'changed'
    ? 'Every declared check passed, but the declared target identity changed during verification; not proven.'
    : 'Every declared check passed, but the declared target identity could not be read; not proven.' };
}

/** One diagnostic when a declared target could not be read or changed. */
export function targetDiagnostics(app: AppUnderTest, proofPath: string): Diagnostic[] {
  if (app.status !== 'unavailable' && app.status !== 'changed') return [];
  return [{ category: 'target_unavailable', references: [{ path: path.resolve(proofPath), pointer: '/appUnderTest', private: true }],
    nextAction: app.status === 'changed'
      ? 'The app under test changed while PRAMAN verified it. Stop changing the app (or its build) during verification, then rerun in a fresh output folder.'
      : 'The declared target command failed, timed out or printed nothing. Fix the target command (it must exit 0 and print the version) and rerun in a fresh output folder.' }];
}

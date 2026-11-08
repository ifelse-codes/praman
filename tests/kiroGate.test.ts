import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Kiro Stop-hook gate drives the compiled CLI, so it needs a build (CI builds first).
const root = fileURLToPath(new URL('..', import.meta.url));
const gate = join(root, 'kiro-power', 'scripts', 'praman-gate.mjs');
const hasBuild = existsSync(join(root, 'dist', 'cli.js'));

const sumScript = 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).values.reduce((a,b)=>a+b,0)));';
const declaration = (expected: string, executable = 'node') => ({
  mode: 'acceptance', title: 'Gate fixture', requirement: 'Print the declared JSON total',
  current: { executable, args: ['-e', sumScript], cwd: '.', stdin: '{"values":[2,3,5]}', deadlineMs: 5000 },
  expectedExit: 0, checks: [{ id: 'total', source: 'stdout', operator: 'equals', value: expected }], repeats: 2,
});

interface GateRun { code: number | null; stdout: string; stderr: string }

function runGate(cwd: string, sessionId = 'sess-test', env: NodeJS.ProcessEnv = process.env): Promise<GateRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [gate], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ session_id: sessionId, hook_event_name: 'Stop', cwd }));
  });
}

async function workspace(files: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'praman-gate-'));
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return directory;
}

const gateFile = (declarations: unknown[], extra: Record<string, unknown> = {}) => ({ declarations, ...extra });

describe.skipIf(!hasBuild)('Kiro Stop-hook evidence gate', () => {
  it('does nothing without a gate file', async () => {
    const dir = await workspace({});
    try {
      const run = await runGate(dir);
      expect(run).toMatchObject({ code: 0, stdout: '', stderr: '' });
      expect(existsSync(join(dir, '.praman'))).toBe(false);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('releases the stop only when every declaration has passing evidence', async () => {
    const dir = await workspace({
      'pass.json': declaration('10\n'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'pass.json' }]),
    });
    try {
      const run = await runGate(dir);
      expect(run.code).toBe(0);
      expect(run.stdout).toContain('command pass.json: passed');
      expect(run.stdout).toContain('all 1 declaration(s) passed');
      expect(run.stderr).toBe('');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('requests another turn on an observed mismatch without printing raw values', async () => {
    const dir = await workspace({
      'pass.json': declaration('10\n'),
      'mismatch.json': declaration('sentinel-expected-4242\n'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'pass.json' }, { kind: 'command', path: 'mismatch.json' }]),
    });
    try {
      const run = await runGate(dir);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain('command mismatch.json: FAILED | failing check index(es) 0');
      expect(run.stderr).toMatch(/report \.praman\/gate\/[^ ]+\/2-command\/REPORT\.md/);
      expect(run.stderr).toContain('rejection 1 of 3');
      // Expected/observed values and the declared script stay in private evidence.
      expect(run.stderr).not.toContain('sentinel-expected');
      expect(run.stderr).not.toContain('reduce');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('treats unavailable execution and a missing declaration as not proven, never passed', async () => {
    const dir = await workspace({
      'unavailable.json': declaration('10\n', './intentionally-missing-executable'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'unavailable.json' }, { kind: 'command', path: 'missing.json' }]),
    });
    try {
      const run = await runGate(dir);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain('command unavailable.json: NOT PROVEN');
      expect(run.stderr).toContain('command missing.json: NOT PROVEN | declaration file not found');
      expect(run.stderr).not.toContain('passed |');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('rejects a malformed gate configuration without echoing its values', async () => {
    const dir = await workspace({
      'praman-gate.json': { declarations: [{ kind: 'command', path: 'x.json', secret: 'do-not-print' }] },
    });
    try {
      const run = await runGate(dir);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain('gate configuration invalid: declarations[0] has unknown key "secret"');
      expect(run.stderr).not.toContain('do-not-print');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('stops requesting turns at the bound, still reports not proven, then starts over', async () => {
    const dir = await workspace({
      'mismatch.json': declaration('sentinel-expected-4242\n'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'mismatch.json' }], { maxExtraTurns: 2 }),
    });
    try {
      const codes = [];
      let last: GateRun | undefined;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        last = await runGate(dir, 'sess-bound');
        codes.push(last.code);
        if (attempt === 2) expect(last.stdout).toContain('NOT PROVEN after 2 rejected stop(s)');
      }
      expect(codes).toEqual([1, 1, 0, 1]);
      // A different session keeps its own counter.
      expect((await runGate(dir, 'sess-other')).code).toBe(1);
      const state = JSON.parse(await readFile(join(dir, '.praman', 'gate-state.json'), 'utf8'));
      expect(state.sessions['sess-bound'].consecutiveNonPass).toBe(1);
      expect(state.sessions['sess-other'].consecutiveNonPass).toBe(1);
      expect(last?.stdout).toBe('');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('counts gate internal errors toward the bound and never reports them as passed', async () => {
    const dir = await workspace({
      'pass.json': declaration('10\n'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'pass.json' }], { maxExtraTurns: 2 }),
    });
    try {
      // A regular file where the run tree belongs makes the gate fail internally (ENOTDIR),
      // even though the declaration itself would pass.
      await mkdir(join(dir, '.praman'));
      await writeFile(join(dir, '.praman', 'gate'), 'not a directory');
      const runs = [];
      for (let attempt = 0; attempt < 3; attempt += 1) runs.push(await runGate(dir, 'sess-internal'));
      expect(runs.map(run => run.code)).toEqual([1, 1, 0]);
      expect(runs[0].stderr).toContain('PRAMAN gate: gate run: NOT PROVEN | internal error (ENOTDIR)');
      expect(runs[0].stderr).toContain('rejection 1 of 2');
      expect(runs[1].stderr).toContain('rejection 2 of 2');
      expect(runs[2].stdout).toContain('NOT PROVEN after 2 rejected stop(s)');
      for (const run of runs) expect(`${run.stdout}${run.stderr}`).not.toContain('passed');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('is not proven when the PRAMAN build cannot be found', async () => {
    const dir = await workspace({
      'pass.json': declaration('10\n'),
      'praman-gate.json': gateFile([{ kind: 'command', path: 'pass.json' }]),
    });
    try {
      const run = await runGate(dir, 'sess-test', { ...process.env, PRAMAN_HOME: join(dir, 'no-praman-here') });
      expect(run.code).toBe(1);
      expect(run.stderr).toContain('PRAMAN CLI: NOT PROVEN | dist/cli.js not found');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

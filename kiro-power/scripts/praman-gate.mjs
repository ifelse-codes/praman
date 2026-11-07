#!/usr/bin/env node
// PRAMAN evidence gate for a Kiro `Stop` hook (spec: .kiro/specs/kiro-evidence-gate).
//
// Opt-in: does nothing unless `praman-gate.json` exists in the workspace root.
// Runs each declared PRAMAN declaration through the public CLI into a fresh directory
// under `.praman/gate/`. A declaration counts as passed only when the CLI exits 0 AND
// both proof.json and feedback.json say "passed". Anything else is failed or
// "not proven" (insufficient evidence); missing evidence never passes.
//
// Exit 0: all passed, no gate file, or the consecutive-rejection bound was reached.
// Exit 1: at least one declaration did not pass; Kiro CLI V3 continues the agent turn
//         and delivers stderr to the agent (observed 2026-11-07, spike 1.1).
// Output is limited to verdicts, check indexes, PRAMAN's safe reason text and report
// paths; raw arguments, environment, output and expectations are never printed.
// Trusted local execution only: declarations run with the caller's authority.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_NAME = 'praman-gate.json';
const MAX_DECLARATIONS = 20;
const DEFAULT_MAX_EXTRA_TURNS = 3;
const DECLARATION_TIMEOUT_MS = Number(process.env.PRAMAN_GATE_DECLARATION_TIMEOUT_MS) || 300_000;
const TOTAL_BUDGET_MS = Number(process.env.PRAMAN_GATE_BUDGET_MS) || 780_000;

const started = Date.now();

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise(resolveRead => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolveRead(data));
    process.stdin.on('error', () => resolveRead(data));
  });
}

function parseHookInput(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

// Strict validation; error messages name keys, never echo values.
function parseConfig(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('top level must be an object');
  for (const key of Object.keys(value)) {
    if (key !== 'declarations' && key !== 'maxExtraTurns') throw new Error(`unknown key "${key}"`);
  }
  const { declarations, maxExtraTurns = DEFAULT_MAX_EXTRA_TURNS } = value;
  if (!Array.isArray(declarations) || declarations.length < 1 || declarations.length > MAX_DECLARATIONS) {
    throw new Error(`"declarations" must be an array of 1-${MAX_DECLARATIONS} entries`);
  }
  declarations.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`declarations[${index}] must be an object`);
    for (const key of Object.keys(entry)) {
      if (key !== 'kind' && key !== 'path') throw new Error(`declarations[${index}] has unknown key "${key}"`);
    }
    if (entry.kind !== 'command' && entry.kind !== 'browser') throw new Error(`declarations[${index}].kind must be "command" or "browser"`);
    if (typeof entry.path !== 'string' || entry.path.trim() === '') throw new Error(`declarations[${index}].path must be a non-empty string`);
  });
  if (!Number.isInteger(maxExtraTurns) || maxExtraTurns < 1 || maxExtraTurns > 10) {
    throw new Error('"maxExtraTurns" must be an integer from 1 to 10');
  }
  return { declarations, maxExtraTurns };
}

function locateCli() {
  const home = process.env.PRAMAN_HOME;
  const candidate = home
    ? join(resolve(home), 'dist', 'cli.js')
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli.js');
  return existsSync(candidate) ? candidate : null;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}

function runCli(cli, args, cwd, timeoutMs) {
  return new Promise(resolveRun => {
    // Output is discarded: the verdict comes from the evidence files, not from text.
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: 'ignore', detached: true });
    let timedOut = false;
    const kill = signal => { try { process.kill(-child.pid, signal); } catch { /* already gone */ } };
    const timer = setTimeout(() => {
      timedOut = true;
      kill('SIGTERM');
      setTimeout(() => kill('SIGKILL'), 2_000).unref();
    }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); resolveRun({ code: null, timedOut: false, spawnError: true }); });
    child.on('close', code => { clearTimeout(timer); resolveRun({ code, timedOut, spawnError: false }); });
  });
}

const EXPECTED_EXIT = { passed: 0, failed: 1, insufficient_evidence: 2 };

async function verifyDeclaration(cli, root, runDirectory, entry, index) {
  const declarationPath = resolve(root, entry.path);
  const label = `${entry.kind} ${entry.path}`;
  if (!existsSync(declarationPath)) {
    return { label, verdict: 'insufficient_evidence', reason: 'declaration file not found' };
  }
  const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
  if (remaining <= 0) return { label, verdict: 'insufficient_evidence', reason: 'gate time budget exhausted before this declaration ran' };
  const outDir = join(runDirectory, `${index + 1}-${entry.kind}`);
  const command = entry.kind === 'command' ? 'command-verify' : 'scenario-verify';
  const run = await runCli(cli, [command, declarationPath, '-o', outDir, '--summary'], root, Math.min(DECLARATION_TIMEOUT_MS, remaining));
  const report = relative(root, join(outDir, 'REPORT.md'));
  if (run.spawnError) return { label, verdict: 'insufficient_evidence', reason: 'could not start the PRAMAN CLI' };
  if (run.timedOut) return { label, verdict: 'insufficient_evidence', reason: 'verification timed out (see spec verify-cancellation for orphan-process limits)' };
  const proof = readJson(join(outDir, 'proof.json'));
  const feedback = readJson(join(outDir, 'feedback.json'));
  if (!proof || !feedback) return { label, verdict: 'insufficient_evidence', reason: `no complete evidence written (CLI exit ${run.code})` };
  if (proof.verdict !== feedback.verdict || !(proof.verdict in EXPECTED_EXIT)) {
    return { label, verdict: 'insufficient_evidence', reason: 'proof and feedback verdicts disagree', report };
  }
  if (EXPECTED_EXIT[proof.verdict] !== run.code) {
    return { label, verdict: 'insufficient_evidence', reason: `CLI exit ${run.code} disagrees with recorded verdict`, report };
  }
  const failingChecks = [...new Set((feedback.diagnostics ?? [])
    .filter(item => item?.category === 'check_mismatch' && Number.isInteger(item.checkIndex))
    .map(item => item.checkIndex))].sort((a, b) => a - b);
  return {
    label,
    verdict: proof.verdict,
    reason: typeof feedback.reason === 'string' ? feedback.reason : undefined,
    failingChecks,
    report,
  };
}

function describe(result) {
  const word = result.verdict === 'passed' ? 'passed' : result.verdict === 'failed' ? 'FAILED' : 'NOT PROVEN';
  const parts = [`PRAMAN gate: ${result.label}: ${word}`];
  if (result.failingChecks?.length) parts.push(`failing check index(es) ${result.failingChecks.join(', ')}`);
  if (result.reason && result.verdict !== 'passed') parts.push(result.reason);
  if (result.report) parts.push(`report ${result.report}`);
  return parts.join(' | ');
}

async function main() {
  const input = parseHookInput(await readStdin());
  const root = typeof input.cwd === 'string' && input.cwd ? resolve(input.cwd) : process.cwd();
  const configPath = join(root, CONFIG_NAME);
  if (!existsSync(configPath)) return 0; // Opt-in: silent without a gate file.

  const sessionKey = typeof input.session_id === 'string' && input.session_id ? input.session_id : 'unknown-session';
  const statePath = join(root, '.praman', 'gate', 'state.json');
  const state = readJson(statePath) ?? { version: 1, sessions: {} };
  if (!state.sessions || typeof state.sessions !== 'object') state.sessions = {};
  const previous = Number(state.sessions[sessionKey]?.consecutiveNonPass) || 0;

  let config;
  let results;
  try {
    config = parseConfig(readFileSync(configPath, 'utf8'));
  } catch (error) {
    results = [{ label: CONFIG_NAME, verdict: 'insufficient_evidence', reason: `gate configuration invalid: ${error.message}` }];
  }

  if (!results) {
    const cli = locateCli();
    if (!cli) {
      results = [{ label: 'PRAMAN CLI', verdict: 'insufficient_evidence', reason: 'dist/cli.js not found; run npm run build or set PRAMAN_HOME' }];
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const runDirectory = join(root, '.praman', 'gate', `${stamp}-${process.pid}`);
      mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
      results = [];
      // Sequential: declarations may share caller-owned state.
      for (const [index, entry] of config.declarations.entries()) {
        results.push(await verifyDeclaration(cli, root, runDirectory, entry, index));
      }
    }
  }

  const maxExtraTurns = config?.maxExtraTurns ?? DEFAULT_MAX_EXTRA_TURNS;
  const allPassed = results.every(result => result.verdict === 'passed');
  const lines = results.map(describe);

  if (allPassed) {
    state.sessions[sessionKey] = { consecutiveNonPass: 0, updatedAt: new Date().toISOString() };
    writeJsonAtomic(statePath, state);
    process.stdout.write(`${lines.join('\n')}\nPRAMAN gate: all ${results.length} declaration(s) passed.\n`);
    return 0;
  }

  const count = previous + 1;
  if (count > maxExtraTurns) {
    // Bound reached: stop asking for turns, but never report a pass.
    state.sessions[sessionKey] = { consecutiveNonPass: 0, updatedAt: new Date().toISOString() };
    writeJsonAtomic(statePath, state);
    const summary = `${lines.join('\n')}\nPRAMAN gate: NOT PROVEN after ${maxExtraTurns} rejected stop(s); no longer blocking this stop. The work is not verified.\n`;
    process.stdout.write(summary);
    process.stderr.write(summary);
    return 0;
  }

  state.sessions[sessionKey] = { consecutiveNonPass: count, updatedAt: new Date().toISOString() };
  writeJsonAtomic(statePath, state);
  process.stderr.write(`${lines.join('\n')}\n`
    + `PRAMAN gate: rejection ${count} of ${maxExtraTurns}. Do not report this work as done. `
    + 'Read the listed report(s), fix the implementation or the declared precondition, then finish again so the gate re-runs. '
    + 'Do not weaken, delete or edit the declarations or praman-gate.json to make the gate pass.\n');
  return 1;
}

main().then(code => { process.exitCode = code; }, error => {
  // An internal gate error is not a pass: request another turn with a safe message.
  process.stderr.write(`PRAMAN gate: internal error (${error?.code ?? error?.name ?? 'unknown'}); the work is NOT PROVEN.\n`);
  process.exitCode = 1;
});

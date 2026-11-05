import { afterEach, beforeEach, expect, it } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandProofSchema, executeCommand, loadCommandSpec, proveCommands } from '../src/eval/command.js';
import { commandReplayGate } from '../src/core/commandDemonstrate.js';
import { captureIdentity, sameIdentity } from '../src/eval/identity.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'praman-identity-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
async function prepare(name: string, role: 'script' | 'input' | 'interpreter' | 'browser' | 'tool' = 'script') {
  const file = path.join(root, `${name}.json`), script = path.join(root, `${name}.cjs`), declared = path.join(root, `${name}-declared`);
  writeFileSync(script, 'console.log("ready"); // original');
  writeFileSync(declared, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  mkdirSync(path.join(root, `${name}-cwd`));
  const identity = role === 'script' || role === 'input' ? { files: [{ role, path: role === 'script' ? path.basename(script) : path.basename(declared) }] }
    : { files: [{ role: 'script', path: path.basename(script) }], tools: [{ role, executable: './' + path.basename(declared) }] };
  writeFileSync(file, JSON.stringify({ mode: 'acceptance', title: 'Declared identity', requirement: 'Print ready',
    current: { executable: path.basename(process.execPath), args: [script], cwd: `${name}-cwd`, env: { PATH: path.dirname(process.execPath) }, deadlineMs: 2000, identity },
    checks: [{ id: 'ready', source: 'stdout', operator: 'equals', value: 'ready\n' }] }));
  const result = await proveCommands(file, path.join(root, name));
  return { result, spec: loadCommandSpec(file), script, declared, file };
}

it('replays an actual PATH interpreter with declaration-relative scripts and keeps private identities out of feedback', async () => {
  const { result, spec } = await prepare('stable', 'interpreter');
  expect(result.verdict).toBe('passed');
  const replay = await commandReplayGate(spec, result.proofPath, root)('current');
  expect(readFileSync(replay.run.stdout, 'utf8')).toBe('ready\n');
  expect(sameIdentity(replay.run.identityBefore, replay.reference.identityBefore)).toBe(true);
  expect(replay.run.identityBefore!.entries.find(row => row.role === 'command-executable')!.realPath).toBeDefined();
  expect(statSync(result.proofPath).mode & 0o777).toBe(0o600);
  expect(JSON.stringify(result.feedback)).not.toContain('stable.cjs');
  expect(JSON.stringify(result.feedback)).not.toContain('stable-declared');
});

it.each(['script', 'input', 'interpreter', 'browser', 'tool'] as const)('blocks a changed declared %s after proof even with unchanged output', async role => {
  const { result, spec, script, declared } = await prepare(role, role);
  expect(result.verdict).toBe('passed');
  const replay = commandReplayGate(spec, result.proofPath, root);
  appendFileSync(role === 'script' ? script : declared, '\n// same visible result');
  await expect(replay('current')).rejects.toThrow('changed');
  expect(existsSync(path.join(root, 'replay-current'))).toBe(false);
  expect(() => commandReplayGate(spec, result.proofPath, root)).toThrow('identit');
});

it('cannot pass verification if a declared script changes itself while producing passing output', async () => {
  const { file, script } = await prepare('self');
  writeFileSync(script, 'require("fs").appendFileSync(__filename,"\\n// changed");console.log("ready")');
  const result = await proveCommands(file, path.join(root, 'self-mutated'));
  const proof = JSON.parse(readFileSync(result.proofPath, 'utf8'));
  expect(result.verdict).toBe('insufficient_evidence');
  expect(proof.current.map((row: { verdict: string }) => row.verdict)).toEqual(['insufficient_evidence', 'insufficient_evidence']);
  expect(proof.current[0].checks.every((row: { verdict: string }) => row.verdict === 'passed')).toBe(true);
  expect(proof.identityStatus).toBe('unavailable_or_changed');
});

it('does not dispatch a command with a missing declared input', async () => {
  const marker = path.join(root, 'dispatched');
  const spec = commandProofSchema.parse({ mode: 'acceptance', title: 'Missing input', requirement: 'Print ready',
    current: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'yes');console.log('ready')`], cwd: root, deadlineMs: 2000,
      identity: { files: [{ role: 'input', path: path.join(root, 'absent-private-file') }] } },
    checks: [{ id: 'ready', source: 'stdout', operator: 'equals', value: 'ready\n' }] });
  const run = await executeCommand(spec, spec.current, path.join(root, 'missing'));
  expect(run.verdict).toBe('insufficient_evidence');
  expect(run.status).toBe('unavailable');
  expect(existsSync(marker)).toBe(false);
});

it('detects a new earlier PATH choice and symlink retargeting even when content matches', () => {
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  mkdirSync(first); mkdirSync(second);
  const tool = path.join(second, 'tool');
  writeFileSync(tool, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const options = { cwd: root, executable: 'tool', env: { PATH: `${first}:${second}` }, harness: import.meta.url };
  const reference = captureIdentity(undefined, options);
  writeFileSync(path.join(first, 'tool'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  expect(sameIdentity(reference, captureIdentity(undefined, options))).toBe(false);
  const link = path.join(root, 'link'); symlinkSync(tool, link);
  const linked = captureIdentity({ files: [{ role: 'script', path: link }], tools: [] }, options);
  unlinkSync(link); symlinkSync(path.join(first, 'tool'), link);
  expect(sameIdentity(linked, captureIdentity({ files: [{ role: 'script', path: link }], tools: [] }, options))).toBe(false);
});

it('refuses legacy proof without declared identity snapshots rather than upgrading it in place', async () => {
  const { result, spec } = await prepare('legacy');
  const proof = JSON.parse(readFileSync(result.proofPath, 'utf8'));
  for (const run of proof.current) { delete run.identityBefore; delete run.identityAfter; }
  writeFileSync(result.proofPath, JSON.stringify(proof));
  expect(() => commandReplayGate(spec, result.proofPath, root)).toThrow('identit');
});

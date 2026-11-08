// PRAMAN self-check for spec verify-cancellation (PRAMAN is the target).
// Usage: node harness.mjs <path-to-praman-dist/cli.js>
//
// Starts `command-verify` on a declared command that sleeps, sends SIGINT once that
// command runs, and prints exactly one line on stdout:
//   "orphan: yes"  the declared command's process group was still alive afterwards
//   "orphan: no"   the group was gone within 3 s after the CLI exited
// Any leftover group is killed before exit. Setup problems exit 2 with a message on
// stderr and print nothing on stdout, so they can never look like "orphan: no".
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cli = process.argv[2] && path.resolve(process.argv[2]);
if (!cli || !existsSync(cli)) { console.error('harness: PRAMAN cli.js not found'); process.exit(2); }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const groupAlive = pid => { try { process.kill(-pid, 0); return true; } catch { return false; } };
async function until(read, ms) {
  const end = Date.now() + ms;
  for (;;) { const value = read(); if (value || Date.now() > end) return value; await sleep(25); }
}

const dir = mkdtempSync(path.join(tmpdir(), 'praman-self-check-'));
const pidFile = path.join(dir, 'pid');
const declaration = path.join(dir, 'sleeper.json');
writeFileSync(declaration, JSON.stringify({
  mode: 'acceptance', title: 'Sleeping command', requirement: 'Runs until interrupted',
  current: { executable: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 20000)`], cwd: '.', deadlineMs: 30000 },
  checks: [{ id: 'out', source: 'stdout', operator: 'equals', value: '' }], repeats: 2,
}));

let leader;
try {
  const child = spawn(process.execPath, [cli, 'command-verify', declaration, '-o', path.join(dir, 'out'), '--summary'], { stdio: 'ignore' });
  const exited = new Promise(resolve => child.on('close', (code, signal) => resolve(code ?? signal)));
  leader = await until(() => existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8')), 15000);
  if (!leader) { child.kill('SIGKILL'); console.error('harness: declared command did not start'); process.exit(2); }
  child.kill('SIGINT');
  const exit = await Promise.race([exited, sleep(15000).then(() => 'still running')]);
  if (exit === 'still running') child.kill('SIGKILL');
  const gone = await until(() => !groupAlive(leader), 3000);
  console.error(`harness: cli exit ${exit}`);
  console.log(gone ? 'orphan: no' : 'orphan: yes');
} finally {
  if (leader && groupAlive(leader)) { try { process.kill(-leader, 'SIGKILL'); } catch { /* already gone */ } }
  rmSync(dir, { recursive: true, force: true });
}

import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { changeSpecSchema } from '../src/case/change.js';
import { assessProof, executeScenario, proveChange } from '../src/eval/change.js';
import { sameIdentity } from '../src/eval/identity.js';
import { recordChangeWalkthrough } from '../src/report/video.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

let root: string, origin: string, script: string, server: Server, visits: number;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'praman-browser-identity-')); script = join(root, 'private-script.cjs');
  writeFileSync(script, '// caller-declared script'); visits = 0;
  server = createServer((_req, res) => { visits++; res.setHeader('Content-Type', 'text/html'); res.end('<button onclick="document.querySelector(\'p\').textContent=\'ready\'">Open</button><p>waiting</p>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); rmSync(root, { recursive: true, force: true }); });
function scenario() {
  return changeSpecSchema.parse({ mode: 'acceptance', title: 'Current browser', change: 'Open ready', afterUrl: origin,
    steps: [{ action: 'click', selector: 'button', note: 'Open' }], checks: [{ id: 'ready', kind: 'text', selector: 'p', equals: 'ready' }],
    identity: { files: [{ role: 'script', path: script }], tools: [{ role: 'interpreter', executable: process.execPath }] } });
}

it('executes real browser proof and a non-recorded matching replay with the selected binary and private input scope', async () => {
  const spec = scenario(), result = await proveChange(spec, join(root, 'proof'));
  expect(result.verdict).toBe('passed');
  const reference = result.proof.after[0];
  expect(reference.identityBefore!.entries.find(row => row.role === 'browser')!.path).toBe(chromium.executablePath());
  const replay = await executeScenario(spec, origin, join(root, 'replay'), { expectedIdentity: reference.identityBefore });
  expect(replay.verdict).toBe('passed');
  expect(sameIdentity(reference.identityBefore, replay.identityAfter)).toBe(true);
  expect(replay.checks[0].observed).toBe('ready');
  expect(visits).toBeGreaterThanOrEqual(3);
  expect(JSON.stringify(safeFeedbackValue(result, spec))).not.toContain('private-script.cjs');
  expect(JSON.stringify(result.feedback)).not.toContain('private-script.cjs');
  expect(existsSync(join(root, 'proof/after-1/result.json'))).toBe(true);
}, 90000);

it('blocks changed same-output input before browser dispatch and before any recording or speech', async () => {
  const spec = scenario(), result = await proveChange(spec, join(root, 'proof'));
  expect(result.verdict).toBe('passed');
  const previousVisits = visits;
  appendFileSync(script, '\n// changed but same app output');
  const run = await executeScenario(spec, origin, join(root, 'blocked'), { expectedIdentity: result.proof.after[0].identityBefore });
  expect(run.verdict).toBe('insufficient_evidence');
  expect(visits).toBe(previousVisits);
  await expect(recordChangeWalkthrough(spec, result.proof, join(root, 'proof'))).rejects.toThrow('identity changed');
  expect(existsSync(join(root, 'proof/video'))).toBe(false);
  expect(existsSync(join(root, 'proof/demo.mp4'))).toBe(false);
}, 90000);

it('does not pass an otherwise correct browser observation when a declared input changes during actions', async () => {
  const spec = scenario();
  const run = await executeScenario(spec, origin, join(root, 'mutation'), {
    afterStep: async () => { appendFileSync(script, '\n// mutated'); },
  });
  expect(run.checks[0]).toMatchObject({ verdict: 'passed', observed: 'ready' });
  expect(run.verdict).toBe('insufficient_evidence');
  expect(sameIdentity(run.identityBefore, run.identityAfter)).toBe(false);
  const next = await executeScenario(spec, origin, join(root, 'next'));
  expect(next.verdict).toBe('passed');
  expect(assessProof(spec, undefined, [run, next]).verdict).toBe('insufficient_evidence');
}, 90000);

it('refuses a missing declared tool and missing automatic upload input without visiting the application', async () => {
  const spec = scenario();
  spec.identity!.tools.push({ role: 'tool', executable: join(root, 'missing-tool') });
  const result = await proveChange(spec, join(root, 'missing-tool'));
  expect(result.verdict).toBe('insufficient_evidence'); expect(visits).toBe(0);
  const upload = scenario();
  upload.steps = [{ action: 'upload', selector: 'input', path: join(root, 'missing-upload'), note: 'Upload declared file' }];
  const run = await executeScenario(upload, origin, join(root, 'missing-upload'));
  expect(run.verdict).toBe('insufficient_evidence'); expect(visits).toBe(0);
  const saved = JSON.parse(readFileSync(join(root, 'missing-upload/result.json'), 'utf8'));
  expect(saved.identityBefore.entries.some((entry: { role: string; error?: string }) => entry.role === 'input' && entry.error)).toBe(true);
});

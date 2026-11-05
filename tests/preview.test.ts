import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { changeSpecSchema } from '../src/case/change.js';
import { sceneFramingSchema } from '../src/case/framing.js';
import { previewChange, previewCommands } from '../src/core/preview.js';
import { commandReplayGate } from '../src/core/commandDemonstrate.js';
import { loadCommandSpec } from '../src/eval/command.js';
import { showWalkthroughOverlay } from '../src/report/spotlight.js';

let root: string, origin: string, server: Server;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'praman-preview-'));
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<button id="open" onclick="document.querySelector(\'#ready\').hidden=false;this.remove()">Open</button><div id="ready" hidden style="position:fixed;left:100px;top:500px;width:400px;height:180px">Observed result</div>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); rmSync(root, { recursive: true, force: true }); });
function scenario() {
  return changeSpecSchema.parse({ mode: 'acceptance', title: 'Private title', change: 'Private requirement', afterUrl: origin,
    steps: [{ action: 'click', selector: '#open', note: 'Reveal' }], checks: [{ id: 'private-check', kind: 'text', selector: '#ready', equals: 'Not the observed result' }],
    walkthrough: { startStep: 0, after: [{ step: 0, text: 'Private narration', selector: '#ready', framing: { caption: 'top', padding: 16 } }] } });
}
function commandPlan(mode = 'acceptance') {
  writeFileSync(join(root, 'run.cjs'), 'console.log("Observed result")');
  const command = { executable: process.execPath, args: ['run.cjs'], cwd: '.', deadlineMs: 2000, identity: { files: [{ role: 'script', path: './run.cjs' }] } };
  const commands = { mode, title: 'Private command', requirement: 'Private requirement', current: command, checks: [{ id: 'private-check', source: 'stdout', operator: 'equals', value: 'Different\n' }],
    ...(mode === 'comparison' ? { before: command, baselineKind: 'unattested' } : {}) };
  writeFileSync(join(root, 'commands.json'), JSON.stringify(commands));
  const beat = { text: 'Private terminal narration', stream: 'stdout', from: 1, to: 1, framing: { caption: 'bottom', padding: 0 } };
  const plan = { commandsPath: './commands.json', walkthrough: { after: [beat], ...(mode === 'comparison' ? { before: [beat] } : {}) } };
  const file = join(root, 'plan.json'); writeFileSync(file, JSON.stringify(plan));
  return { file, plan };
}

it('previews real browser geometry despite a requirement mismatch, without presenting it as proof', async () => {
  const output = join(root, 'browser');
  const result = await previewChange(scenario(), output);
  expect(result).toMatchObject({ kind: 'story-preflight', status: 'passed', proof: false });
  const receipt = JSON.parse(readFileSync(result.receiptPath, 'utf8'));
  expect(receipt.scenes[0].focus.framing).toMatchObject({ requested: { caption: 'top', padding: 16 }, caption: 'top', padding: 16 });
  expect(JSON.parse(readFileSync(join(output, 'preflight/current/result.json'), 'utf8')).verdict).toBe('failed');
  for (const value of ['Private title', 'Private narration', '#ready', 'private-check', 'Not the observed result']) expect(JSON.stringify(result)).not.toContain(value);
  expect(existsSync(join(output, 'proof.json'))).toBe(false);
  expect(statSync(output).mode & 0o777).toBe(0o700);
  expect(statSync(result.receiptPath).mode & 0o777).toBe(0o600);
}, 90000);

it('returns private indexed errors for explicit caption collisions and unavailable identity', async () => {
  const input = scenario(); input.walkthrough!.after[0].framing!.caption = 'bottom';
  const result = await previewChange(input, join(root, 'collision'));
  expect(result).toMatchObject({ status: 'blocked', proof: false, diagnostics: [{ category: 'story_preflight', stage: 'current', beat: 0, step: 0 }] });
  expect(JSON.stringify(result)).not.toContain('#ready');
  input.identity = { files: [{ role: 'input', path: join(root, 'missing') }], tools: [] };
  const missing = await previewChange(input, join(root, 'missing-identity'));
  expect(missing.status).toBe('blocked');
  expect(JSON.parse(readFileSync(join(root, 'missing-identity/preflight/current/result.json'), 'utf8')).completedSteps).toBe(0);
}, 90000);

it('resolves command paths and previews terminal/source framing while preserving non-proof authority', async () => {
  const { file, plan } = commandPlan('comparison');
  writeFileSync(join(root, 'change.diff'), '--- a/result.js\n+++ b/result.js\n@@ -1 +1 @@\n-oldResult\n+newResult\n');
  writeFileSync(file, JSON.stringify({ ...plan, diffPath: './change.diff', walkthrough: { ...plan.walkthrough,
    code: { text: 'Private source summary', excerpts: [{ file: 'result.js', side: 'after', from: 1, to: 1, label: 'Result' }],
      beats: [{ text: 'Private source narration', focus: { file: 'result.js', side: 'after', from: 1, to: 1 }, framing: { caption: 'bottom', padding: 20 } }] } } }));
  const result = await previewCommands(file, join(root, 'command'));
  expect(result).toMatchObject({ status: 'passed', proof: false });
  const receipt = z.object({ scenes: z.array(z.object({ focus: z.object({ framing: z.object({ caption: z.string(), padding: z.number() }) }) })) }).parse(JSON.parse(readFileSync(result.receiptPath, 'utf8')));
  expect(receipt.scenes.map(scene => [scene.focus.framing.caption, scene.focus.framing.padding])).toEqual([['bottom', 0], ['bottom', 20], ['bottom', 0]]);
  expect(JSON.parse(readFileSync(join(root, 'command/preflight/execution-current/result.json'), 'utf8')).verdict).toBe('failed');
  expect(() => commandReplayGate(loadCommandSpec(join(root, 'commands.json')), result.receiptPath, root)).toThrow();
  expect(existsSync(join(root, 'command/demo.mp4'))).toBe(false);
  for (const value of ['Private source', 'Private terminal', 'Observed result', 'Different']) expect(JSON.stringify(result)).not.toContain(value);
}, 90000);

it('blocks invalid mode stories before command dispatch and refuses existing output unchanged', async () => {
  const { file, plan } = commandPlan();
  writeFileSync(join(root, 'run.cjs'), 'require("fs").writeFileSync("executed", "yes");console.log("result")');
  writeFileSync(file, JSON.stringify({ ...plan, walkthrough: { ...plan.walkthrough, before: plan.walkthrough.after } }));
  expect((await previewCommands(file, join(root, 'invalid'))).status).toBe('blocked');
  expect(existsSync(join(root, 'executed'))).toBe(false);
  const existing = join(root, 'existing'); mkdirSync(existing); writeFileSync(join(existing, 'proof.json'), 'saved evidence');
  await expect(previewCommands(file, existing)).rejects.toThrow('fresh');
  expect(readFileSync(join(existing, 'proof.json'), 'utf8')).toBe('saved evidence');
  expect(existsSync(join(existing, 'preflight'))).toBe(false);
});

it('honors explicit caption placement and padding without changing the target or hiding collisions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent('<div id="target" style="position:fixed;left:100px;top:600px;width:300px;height:80px">Real target</div>');
    const automatic = await showWalkthroughOverlay(page, { stage: 'Current', text: 'See the result.', voice: true, selector: '#target' });
    expect(automatic!.framing.caption).toBe('top');
    await expect(showWalkthroughOverlay(page, { stage: 'Current', text: 'See the result.', voice: true, selector: '#target', framing: { caption: 'bottom' } })).rejects.toThrow('caption');
    const chosen = await showWalkthroughOverlay(page, { stage: 'Current', text: 'See the result.', voice: true, selector: '#target', framing: { caption: 'top', padding: 20 } });
    expect(chosen!.target).toEqual(automatic!.target);
    expect(chosen!.aperture).toEqual({ x: 80, y: 580, width: 340, height: 120 });
    expect(chosen!.framing.captionBox.y + chosen!.framing.captionBox.height).toBeLessThan(chosen!.aperture.y);
    await page.locator('#target').evaluate(el => { el.style.top = '180px'; });
    const bottom = await showWalkthroughOverlay(page, { stage: 'Current', text: 'See the result.', voice: true, selector: '#target', framing: { caption: 'bottom', padding: 0 } });
    expect(bottom!.aperture).toEqual(bottom!.target);
    expect(bottom!.framing.caption).toBe('bottom');
    await page.setContent('<div id="broad" style="position:fixed;left:80px;top:60px;width:1100px;height:600px">Result</div>');
    // The target itself is below 80%; padding must not bypass the broad-frame gate.
    await expect(showWalkthroughOverlay(page, { stage: 'Current', text: 'See the result.', voice: true, selector: '#broad', framing: { padding: 32 } })).rejects.toThrow('aperture covers at least 80%');
  } finally { await browser.close(); }
}, 90000);

it('rejects invalid framing without injecting presentation defaults into existing declarations', () => {
  for (const framing of [{ caption: 'left' }, { padding: -1 }, { padding: 33 }, { padding: 0.5 }, { crop: true }]) expect(sceneFramingSchema.safeParse(framing).success).toBe(false);
  const input = scenario(); delete input.walkthrough!.after[0].framing;
  expect(changeSpecSchema.parse(input)).toEqual(input);
  expect(Object.hasOwn(changeSpecSchema.parse(input).walkthrough!.after[0], 'framing')).toBe(false);
});

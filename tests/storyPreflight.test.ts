import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { changeSpecSchema } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';
import { preflightChangeWalkthrough, recordChangeWalkthrough } from '../src/report/video.js';
import { showWalkthroughOverlay } from '../src/report/spotlight.js';
import { demonstrateChange } from '../src/core/demonstrate.js';
import { codeStorySchema } from '../src/case/change.js';
import { commandVideoPlanSchema } from '../src/report/commandVideo.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let root: string, origin: string, server: Server;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'praman-story-'));
  server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<style>#ready{position:fixed;top:180px;left:100px;width:400px;height:100px}</style><button id="open" onclick="document.querySelector('#ready').hidden=false;this.remove()">Open</button><div id="ready" hidden>Ready</div>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); rmSync(root, { recursive: true, force: true }); });
function spec() {
  return changeSpecSchema.parse({ mode: 'acceptance', title: 'Reveal the result', change: 'Show the current result', afterUrl: origin,
    steps: [{ action: 'click', selector: '#open', note: 'Reveal' }], checks: [{ id: 'ready', kind: 'visible', selector: '#ready', equals: true }],
    walkthrough: { startStep: 0, after: [{ step: 0, at: 'before', text: 'Open the result.', selector: '#open' }, { step: 0, at: 'after', text: 'The result is ready.', selector: '#ready' }] } });
}

it('inspects each beat at its actual action position, not just the final DOM', async () => {
  const result = await preflightChangeWalkthrough(spec(), join(root, 'good'));
  expect(result).toMatchObject({ kind: 'story-preflight', proof: false, status: 'passed' });
  expect(result.scenes.map(scene => [scene.step, scene.at, scene.focus?.selector])).toEqual([[0, 'before', '#open'], [0, 'after', '#ready']]);
  const early = spec(); early.walkthrough!.after[0].selector = '#ready';
  await expect(preflightChangeWalkthrough(early, join(root, 'early'))).rejects.toThrow('preflight blocked');
  const receipt = JSON.parse(readFileSync(join(root, 'early/preflight.json'), 'utf8'));
  expect(receipt).toMatchObject({ status: 'blocked', proof: false, position: { stage: 'after', step: 0, at: 'before', beat: 0 } });
}, 90000);

it('does not silently replace a detached story target after the action', async () => {
  const input = spec(); input.walkthrough!.after[1].selector = '#open';
  await expect(preflightChangeWalkthrough(input, join(root, 'removed'))).rejects.toThrow('preflight blocked');
  expect(JSON.parse(readFileSync(join(root, 'removed/preflight.json'), 'utf8'))).toMatchObject({ status: 'blocked', position: { at: 'after', beat: 1 } });
});

it('blocks a bad story before invoking speech while keeping passed proof intact', async () => {
  const input = spec(); input.walkthrough!.after[1].selector = '#missing';
  const output = join(root, 'delivery');
  const { proof } = await proveChange(input, output);
  expect(proof.verdict).toBe('passed');
  const helper = join(root, 'speech-helper'); const marker = join(root, 'speech-called');
  writeFileSync(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o700 });
  const previous = process.env.PRAMAN_VATRA; process.env.PRAMAN_VATRA = helper;
  try {
    await expect(recordChangeWalkthrough(input, proof, output)).rejects.toThrow('preflight blocked');
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(output, 'demo.mp4'))).toBe(false);
    expect(JSON.parse(readFileSync(join(output, 'proof.json'), 'utf8')).verdict).toBe('passed');
  } finally {
    if (previous === undefined) delete process.env.PRAMAN_VATRA; else process.env.PRAMAN_VATRA = previous;
  }
}, 90000);

it('preflights source wrapping before narration and retains paired mode roles', async () => {
  const patch = join(root, 'change.diff');
  writeFileSync(patch, `--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+${'long source '.repeat(400)}\n`);
  const input = changeSpecSchema.parse({ ...spec(), mode: 'comparison', baselineKind: 'unattested', beforeUrl: origin, diffPath: patch,
    walkthrough: { ...spec().walkthrough, before: [{ step: 0, text: 'Baseline result.', selector: '#ready' }],
      code: { text: 'Supplied source.', excerpts: [{ file: 'file.ts', side: 'after', from: 1, to: 1, label: 'Current' }], beats: [{ text: 'Read this line.', focus: { file: 'file.ts', side: 'after', from: 1, to: 1 } }] } } });
  await expect(preflightChangeWalkthrough(input, join(root, 'source'))).rejects.toThrow('preflight blocked');
  const receipt = JSON.parse(readFileSync(join(root, 'source/preflight.json'), 'utf8'));
  expect(receipt).toMatchObject({ status: 'blocked', position: { stage: 'code', beat: 0 } });
  expect(receipt.error).toContain('does not fit');
}, 90000);

it('rejects overlapping captions and broad focus instead of substituting framing', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent('<div id="focus" style="position:fixed;left:50px;top:60px;width:1180px;height:600px">Result</div>');
    await expect(showWalkthroughOverlay(page, { stage: 'Current', text: 'Read the result.', voice: true, selector: '#focus' })).rejects.toThrow('caption');
    await page.locator('#focus').evaluate(el => { el.style.top = '0'; el.style.left = '0'; el.style.width = '1280px'; el.style.height = '720px'; });
    await expect(showWalkthroughOverlay(page, { stage: 'Current', text: 'Read the result.', voice: true, selector: '#focus' })).rejects.toThrow('80%');
    await expect(showWalkthroughOverlay(page, { stage: 'Current', text: 'Too much caption. '.repeat(1000), voice: true })).rejects.toThrow('caption');
  } finally { await browser.close(); }
});

it('places bottom-focus captions above the focus when they fit without overlap', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent('<div id="focus" style="position:fixed;left:100px;top:600px;width:300px;height:80px">Result</div>');
    const focus = await showWalkthroughOverlay(page, { stage: 'Current', text: 'Read the result.', voice: true, selector: '#focus' });
    const captionBottom = await page.evaluate(`window[Symbol.for('praman.walkthrough.overlay')].story.caption.getBoundingClientRect().bottom`);
    expect(captionBottom).toBeLessThan(focus!.aperture.y);
  } finally { await browser.close(); }
});

it.each([' ', '\t\n', '\u00a0'])('rejects blank narration %j before executing a story', async text => {
  const input = spec(); input.walkthrough!.after[0] = { ...input.walkthrough!.after[0], text, selector: '#missing' };
  const output = join(root, 'blank');
  await expect(preflightChangeWalkthrough(input, output)).rejects.toThrow();
  expect(existsSync(output)).toBe(false);
  expect(codeStorySchema.safeParse({ text }).success).toBe(false);
  expect(codeStorySchema.safeParse({ text: 'Summary', beats: [{ text }] }).success).toBe(false);
  expect(commandVideoPlanSchema.safeParse({ commandsPath: 'commands.json', walkthrough: { after: [{ text, stream: 'stdout', from: 1, to: 1 }] } }).success).toBe(false);
});

it('preserves existing proof and publication bytes when demonstration output is reused', async () => {
  const output = join(root, 'existing'); mkdirSync(join(output, 'video'), { recursive: true });
  const files = ['proof.json', 'scenario.json', 'demo.mp4', 'video/tour.json', 'video/captions.vtt', 'video/recording-failure.json'];
  for (const file of files) writeFileSync(join(output, file), `existing ${file}`);
  await expect(demonstrateChange(spec(), output)).rejects.toThrow();
  for (const file of files) expect(readFileSync(join(output, file), 'utf8')).toBe(`existing ${file}`);
});

it('does not overwrite movie-only output or a previous recorder attempt', async () => {
  const input = spec(), output = join(root, 'movie-only'); mkdirSync(output);
  writeFileSync(join(output, 'demo.mp4'), 'saved movie');
  await expect(demonstrateChange(input, output)).rejects.toThrow();
  expect(readFileSync(join(output, 'demo.mp4'), 'utf8')).toBe('saved movie');
  expect(existsSync(join(output, 'proof.json'))).toBe(false);
  const fresh = join(root, 'recording');
  const { proof } = await proveChange(input, fresh);
  mkdirSync(join(fresh, 'video'));
  writeFileSync(join(fresh, 'video/tour.json'), 'saved tour');
  writeFileSync(join(fresh, 'demo.mp4'), 'saved recording');
  await expect(recordChangeWalkthrough(input, proof, fresh)).rejects.toThrow();
  expect(readFileSync(join(fresh, 'demo.mp4'), 'utf8')).toBe('saved recording');
  expect(readFileSync(join(fresh, 'video/tour.json'), 'utf8')).toBe('saved tour');
});

it('includes indexed recording failures in default CLI output, not only summary output', async () => {
  const input = spec(); input.walkthrough!.after[0].selector = '#ready';
  const declaration = join(root, 'cli.json'), output = join(root, 'cli');
  writeFileSync(declaration, JSON.stringify(input));
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', cli, 'demonstrate', declaration, '-o', output],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PRAMAN_VATRA: join(root, 'missing-voice') } });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const [exit] = await once(child, 'close');
  expect(exit).toBe(2);
  const diagnostics = JSON.parse(stdout.split('\n').find(line => line.startsWith('Diagnostics: '))!.slice('Diagnostics: '.length));
  expect(diagnostics).toMatchObject([{ category: 'story_preflight', stage: 'current', beat: 0, step: 0 }]);
  for (const reference of diagnostics[0].references) expect(existsSync(reference.path)).toBe(true);
  expect(stdout + stderr).not.toContain(input.walkthrough!.after[0].selector!);
  expect(JSON.parse(readFileSync(join(output, 'proof.json'), 'utf8')).verdict).toBe('passed');
  expect(existsSync(join(output, 'demo.mp4'))).toBe(false);
}, 90000);

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema, type ChangeSpec } from '../src/case/change.js';
import { proveChange } from '../src/eval/change.js';
import { demonstrateChange } from '../src/core/demonstrate.js';
import { summarize } from '../src/eval/eval.js';

let server: Server;
let origin: string;
let dir: string;
beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url === '/image-old' || req.url === '/image-fixed') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<input id="upload" type="file" onchange="${req.url === '/image-fixed' ? "const reader=new FileReader();reader.onload=()=>document.querySelector('img').src=reader.result;reader.readAsDataURL(this.files[0])" : ''}"><img id="preview" width="80" height="80" src="/invalid-image">`);
      return;
    }
    if (req.url === '/missing-state') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{}'); return;
    }
    res.setHeader('Content-Type', 'text/html');
    const handler = req.url === '/crash' ? "throw new TypeError('getName is not a function')"
      : `document.querySelector('#tooltip').textContent='${req.url === '/fixed' ? 'Widget' : 'Unknown'}'`;
    res.end(`<title>Product details</title><button id="details" onmouseover="${handler}">Details</button><div id="tooltip"></div><button id="dismiss" onclick="document.querySelector('#tooltip').textContent=''">Close details</button>`);
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-proof-'));
});
afterEach(async () => {
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive:true, force:true });
});
function scenario(after = '/fixed'): ChangeSpec {
  return changeSpecSchema.parse({ mode: 'repair', baselineKind: 'historical', title:'Product tooltip', change:'Show the actual product name',
    beforeUrl:origin+'/old', afterUrl:origin+after,
    steps:[{action:'hover',selector:'#details',note:'Hover Details to reveal the product name.'}],
    checks:[{id:'details-present',kind:'visible',selector:'#details',equals:true},{id:'product-name',kind:'text',selector:'#tooltip',equals:'Widget'}],
    regressionCheck:'product-name',repeats:2 });
}

describe('evidence before demonstration', () => {
  it('establishes a named regression and repeated corrected outcomes without recording a demo', async () => {
    const tooltip = {id:'corrected-tooltip',kind:'visible' as const,selector:'#tooltip:text-is("Widget")',equals:true,beforeEquals:false};
    const versioned = scenario();
    versioned.checks.push(tooltip);
    const { proof } = await proveChange(versioned, dir);
    expect(proof.before!.checks.find(row=>row.id===tooltip.id)).toMatchObject({expected:false,observed:false,verdict:'passed'});
    expect(proof.after.map(run=>run.checks.find(row=>row.id===tooltip.id))).toEqual([
      expect.objectContaining({expected:true,observed:true,verdict:'passed'}),
      expect.objectContaining({expected:true,observed:true,verdict:'passed'}),
    ]);
    expect(proof.verdict).toBe('passed');
    expect(proof.before!.checks.find(row=>row.id==='product-name')).toMatchObject({verdict:'failed',observed:'Unknown',expected:'Widget'});
    expect(proof.after.map(run=>run.checks.find(row=>row.id==='product-name')?.observed)).toEqual(['Widget','Widget']);
    expect(readdirSync(dir,{recursive:true}).some(path=>String(path).endsWith('.webm'))).toBe(false);
  }, 90000);

  it('keeps valid acceptance proof but blocks video delivery without an authored story', async () => {
    const result = await demonstrateChange(scenario(), dir);
    expect(result.proof.verdict).toBe('passed');
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.demoVideo).toBeNull();
    expect(existsSync(join(dir, 'demo.mp4'))).toBe(false);
    expect(existsSync(join(dir, 'video', 'recording-failure.json'))).toBe(true);
  }, 90000);

  it('blocks an unfocused source video rather than narrating a whole patch', async () => {
    const spec = scenario();
    spec.diffPath = join(dir, 'change.diff');
    writeFileSync(spec.diffPath, '--- a/name.ts\n+++ b/name.ts\n@@ -1 +1 @@\n-return "Unknown";\n+return product.name;\n');
    spec.walkthrough = {
      startStep: 0,
      before: [{ step: 0, at: 'after', text: 'The tooltip shows a placeholder.' }],
      after: [{ step: 0, at: 'after', text: 'The tooltip now shows the product name.' }],
      code: { text: 'Read the product name rather than a constant.' },
    };
    const output = join(dir, 'delivery');
    const result = await demonstrateChange(spec, output);
    expect(result.proof.verdict).toBe('passed');
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.demoVideo).toBeNull();
    expect(existsSync(join(output, 'video', 'recording-failure.json'))).toBe(true);
    expect(existsSync(join(output, 'video', 'change.diff'))).toBe(false);
  }, 90000);

  it('blocks demonstration when the current version still fails', async () => {
    const versioned = scenario('/still-broken');
    versioned.checks.push({id:'corrected-tooltip',kind:'visible',selector:'#tooltip:text-is("Widget")',equals:true,beforeEquals:false});
    const result = await demonstrateChange(versioned, dir);
    expect(result.proof.verdict).toBe('failed');
    expect(result.demoVideo).toBeNull();
    expect(existsSync(join(dir,'demo.mp4'))).toBe(false);
    expect(existsSync(join(dir,'video'))).toBe(false);
  }, 90000);

  it('does not confuse a missing JSON field with an observed null', async () => {
    const spec = scenario();
    spec.checks.push({id:'payment-state',kind:'json',path:'/missing-state',field:['payment'],equals:null});
    const result = await demonstrateChange(spec, dir);
    expect(result.proof.verdict).toBe('insufficient_evidence');
    expect(result.proof.after.every(run=>run.checks.find(row=>row.id==='payment-state')?.verdict==='insufficient_evidence')).toBe(true);
    expect(result.demoVideo).toBeNull();
    expect(existsSync(join(dir,'video'))).toBe(false);
  }, 90000);

  it('reproduces an explicitly asserted old runtime crash, instead of treating an unavailable action as proof', async () => {
    const spec = scenario();
    spec.beforeUrl = origin+'/crash';
    spec.checks = [{id:'details-present',kind:'visible',selector:'#details',equals:true},{id:'no-crash',kind:'pageErrors',equals:0}];
    spec.regressionCheck = 'no-crash';
    const { proof } = await proveChange(spec, dir);
    expect(proof.verdict).toBe('passed');
    expect(proof.before!.checks.find(row=>row.id==='no-crash')).toMatchObject({verdict:'failed',observed:1});
    const unavailable = scenario();
    unavailable.steps[0] = {action:'hover',selector:'#not-present',note:'An unavailable action must not be counted as reproduced behavior.'};
    expect((await proveChange(unavailable, join(dir,'unavailable'))).proof.verdict).toBe('insufficient_evidence');
  }, 90000);

  it('proves decoded uploaded images, not a visible broken image icon', async () => {
    const file = join(dir, 'pixel.png');
    writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64'));
    const spec = changeSpecSchema.parse({
      mode: 'repair', baselineKind: 'historical',
      title: 'Uploaded preview', change: 'Decode the selected file',
      beforeUrl: origin + '/image-old', afterUrl: origin + '/image-fixed',
      steps: [{ action: 'upload', selector: '#upload', path: file, note: 'Choose a real PNG' }],
      checks: [{ id: 'decoded', kind: 'image', selector: '#preview', equals: true }], regressionCheck: 'decoded', repeats: 2,
    });
    const { proof } = await proveChange(spec, join(dir, 'images'));
    expect(proof.verdict).toBe('passed');
    expect(proof.before!.checks[0]).toMatchObject({ verdict: 'failed', observed: false });
    expect(proof.after.every(run => run.checks[0].observed === true)).toBe(true);
    spec.checks[0] = { id: 'decoded', kind: 'image', selector: '#absent', equals: true };
    expect((await proveChange(spec, join(dir, 'missing-image'))).proof.verdict).toBe('insufficient_evidence');
  }, 90000);
  it('checks transient user-visible results before the workflow dismisses them', async () => {
    const spec = scenario();
    spec.steps.push({ action: 'click', selector: '#dismiss', note: 'Close the details' });
    spec.checks[1] = { id: 'product-name', kind: 'text', selector: '#tooltip', equals: 'Widget', afterStep: 0 };
    spec.checks.push({ id: 'dismissed', kind: 'text', selector: '#tooltip', equals: '' });
    const { proof } = await proveChange(spec, join(dir, 'checkpoint'));
    expect(proof.verdict).toBe('passed');
    expect(proof.before!.checks.find(row => row.id === 'product-name')).toMatchObject({ afterStep: 0, observed: 'Unknown', verdict: 'failed' });
    for (const run of proof.after) {
      expect(run.checks.find(row => row.id === 'product-name')).toMatchObject({ afterStep: 0, observed: 'Widget', verdict: 'passed' });
      expect(run.checks.find(row => row.id === 'dismissed')).toMatchObject({ observed: '', verdict: 'passed' });
    }
  }, 90000);

  it('does not hide failed setup checks when presentation starts later', async () => {
    const spec = scenario();
    spec.steps.push({ action: 'click', selector: '#dismiss', note: 'Close the details' });
    spec.checks[1] = { id: 'product-name', kind: 'text', selector: '#tooltip', equals: 'Widget', afterStep: 0 };
    spec.checks.push({ id: 'required-setup', kind: 'text', selector: '#details', equals: 'Wrong product', afterStep: 0 });
    spec.walkthrough = { startStep: 1, before: [{ step: 1, at: 'after', text: 'Close the details.' }],
      after: [{ step: 1, at: 'after', text: 'Close the details.' }], code: { text: 'Show the product name.' } };
    const result = await demonstrateChange(spec, join(dir, 'hidden-setup'));
    expect(result.proof.verdict).toBe('failed');
    expect(result.proof.after.every(run => run.checks.find(row => row.id === 'required-setup')?.verdict === 'failed')).toBe(true);
    expect(result.demoVideo).toBeNull();
    expect(existsSync(join(dir, 'hidden-setup', 'video'))).toBe(false);
  }, 90000);

  it('never promotes absent evaluation or finding evidence to a pass', () => {
    expect(summarize([]).verdict).toBe('not_executed');
  });
});

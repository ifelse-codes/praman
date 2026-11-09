import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema, type ChangeSpec } from '../src/case/change.js';
import { hashSpec, proveChange } from '../src/eval/change.js';
import { formatSummary } from '../src/review/diagnostics.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

const typed = 'zq-private-typed';
const label = 'Private Beta Label';
const page = `<!doctype html><title>Actions</title>
<style>#scroller{height:80px;overflow:auto}#zone,#native-zone{width:120px;height:60px;background:#def}#item,#handle,#native{width:40px;height:20px;background:#fc9}</style>
<button id="cell" ondblclick="document.querySelector('#editing').textContent='yes'" onclick="document.querySelector('#clicks').textContent=String(Number(document.querySelector('#clicks').textContent)+1)">Cell</button>
<p id="editing">no</p><p id="clicks">0</p>
<select id="pick" onchange="document.querySelector('#pick-out').textContent=this.value"><option value="a">Alpha</option><option value="b">${label}</option></select><p id="pick-out">a</p>
<input id="keys" onkeydown="document.querySelector('#key-count').textContent=String(Number(document.querySelector('#key-count').textContent)+1)"><p id="key-count">0</p>
<div id="scroller" onscroll="document.querySelector('#scroll-pos').textContent=this.scrollTop+this.clientHeight>=this.scrollHeight-1?'bottom':'middle'"><div style="height:1000px">rows</div></div><p id="scroll-pos">top</p>
<div id="item"></div><div id="zone"></div><p id="dropped">no</p>
<div id="handle"></div><p id="handle-dx">0</p>
<div id="native" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','x')"></div>
<div id="native-zone" ondragover="event.preventDefault()" ondrop="event.preventDefault();document.querySelector('#native-out').textContent='dropped'"></div><p id="native-out">no</p>
<button class="dup">A</button><button class="dup">B</button>
<p id="spinner">loading</p><div id="list"></div><p id="win-pos">top</p>
<div style="height:2000px"></div>
<script>
let dragging = null;
for (const id of ['item', 'handle']) document.getElementById(id).addEventListener('pointerdown', e => { dragging = { id, x: e.clientX }; });
document.addEventListener('pointerup', e => {
  if (!dragging) return;
  if (dragging.id === 'handle') document.querySelector('#handle-dx').textContent = String(Math.round(e.clientX - dragging.x));
  const z = document.querySelector('#zone').getBoundingClientRect();
  if (dragging.id === 'item' && e.clientX >= z.left && e.clientX <= z.right && e.clientY >= z.top && e.clientY <= z.bottom) document.querySelector('#dropped').textContent = 'yes';
  dragging = null;
});
window.addEventListener('scroll', () => { document.querySelector('#win-pos').textContent = scrollY > 0 ? 'moved' : 'top'; });
setTimeout(() => {
  document.querySelector('#spinner').remove();
  for (let i = 0; i < 3; i++) { const row = document.createElement('div'); row.className = 'row'; row.textContent = 'row ' + i; document.querySelector('#list').append(row); }
}, 700);
</script>`;

let server: Server;
let origin: string;
let dir: string;
beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url !== '/') { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(page);
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-actions-'));
});
afterEach(async () => {
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive: true, force: true });
});

const base = { mode: 'acceptance', title: 'Actions fixture', change: 'Gestures and waits act on the page', afterUrl: 'http://127.0.0.1:1', repeats: 2 } as const;
const note = 'Act on the page';

describe('schema', () => {
  // Hash computed with the 8-action schema (commit fa9e18e) for this exact old-style declaration.
  const old = { ...base, steps: [{ action: 'waitFor', selector: '#a', note }, { action: 'fill', selector: '#a', value: 'x', note }, { action: 'click', selector: '#b', note }],
    checks: [{ id: 'a', kind: 'text', selector: '#a', equals: 'x' }, { id: 'v', kind: 'visible', selector: '#b', equals: true, afterStep: 1 }] };
  it('parses an old declaration unchanged and keeps its specHash', () => {
    const parsed = changeSpecSchema.parse(old);
    expect(parsed.steps).toEqual(old.steps);
    expect(hashSpec(parsed)).toBe('4a25a1e692a736d1db1aa8f3e216966e57b8477fdf357daa9401254c0537df17');
  });
  it.each([
    ['waitFor with state and count', { action: 'waitFor', selector: '#a', state: 'hidden', count: 2, note }],
    ['selectOption with neither value nor label', { action: 'selectOption', selector: '#a', note }],
    ['selectOption with value and label', { action: 'selectOption', selector: '#a', value: 'a', label: 'A', note }],
    ['type with delay over 200 ms', { action: 'type', selector: '#a', text: 'x', delayMs: 201, note }],
    ['type with empty text', { action: 'type', selector: '#a', text: '', note }],
    ['scroll to an unknown place', { action: 'scroll', selector: 'window', to: 'middle', note }],
    ['drag offset with a fraction', { action: 'drag', from: '#a', to: { dx: 1.5, dy: 0 }, note }],
    ['dblclick without a note', { action: 'dblclick', selector: '#a' }],
    ['waitFor with an unknown state', { action: 'waitFor', selector: '#a', state: 'stable', note }],
  ])('rejects %s', (_, step) => {
    expect(changeSpecSchema.safeParse({ ...base, steps: [step], checks: [{ id: 'a', kind: 'text', selector: '#a', equals: 'x' }] }).success).toBe(false);
  });
  it('rejects a count check with a negative or fractional count', () => {
    for (const equals of [-1, 1.5]) expect(changeSpecSchema.safeParse({ ...base, steps: old.steps, checks: [{ id: 'n', kind: 'count', selector: '.row', equals }] }).success).toBe(false);
  });
});

function scenario(body: Pick<ChangeSpec, 'steps' | 'checks'>): ChangeSpec {
  return changeSpecSchema.parse({ ...base, afterUrl: origin, ...body });
}

it('runs every new action and wait in real Chromium and keeps typed text and option labels private', async () => {
  const spec = scenario({
    steps: [
      { action: 'dblclick', selector: '#cell', note: 'Open the cell editor' },
      { action: 'selectOption', selector: '#pick', label, note: 'Pick the second option' },
      { action: 'type', selector: '#keys', text: typed, delayMs: 5, note: 'Type key by key' },
      { action: 'scroll', selector: '#scroller', to: 'bottom', note: 'Scroll the list to the bottom' },
      { action: 'scroll', selector: 'window', to: { x: 0, y: 300 }, note: 'Scroll the page down' },
      { action: 'scroll', selector: 'window', to: 'top', note: 'Scroll the page back up' },
      { action: 'drag', from: '#item', to: '#zone', note: 'Drag the item into the zone' },
      { action: 'drag', from: '#handle', to: { dx: 50, dy: 0 }, note: 'Drag the handle right' },
      { action: 'drag', from: '#native', to: '#native-zone', note: 'Drag a native draggable' },
      { action: 'waitFor', selector: '#spinner', state: 'detached', note: 'Wait for loading to finish' },
      { action: 'waitFor', selector: '.row', count: 3, note: 'Wait for all rows' },
    ],
    checks: [
      { id: 'editing', kind: 'text', selector: '#editing', equals: 'yes' },
      { id: 'clicks', kind: 'text', selector: '#clicks', equals: '2' },
      { id: 'pick', kind: 'text', selector: '#pick-out', equals: 'b' },
      { id: 'keys', kind: 'text', selector: '#key-count', equals: String(typed.length) },
      { id: 'value', kind: 'value', selector: '#keys', equals: typed },
      { id: 'scroller', kind: 'text', selector: '#scroll-pos', equals: 'bottom' },
      { id: 'window-moved', kind: 'text', selector: '#win-pos', equals: 'moved', afterStep: 4 },
      { id: 'window-top', kind: 'text', selector: '#win-pos', equals: 'top', afterStep: 5 },
      { id: 'dropped', kind: 'text', selector: '#dropped', equals: 'yes' },
      { id: 'dx', kind: 'text', selector: '#handle-dx', equals: '50' },
      { id: 'native', kind: 'text', selector: '#native-out', equals: 'dropped' },
      { id: 'rows', kind: 'count', selector: '.row', equals: 3 },
      { id: 'spinner-gone', kind: 'count', selector: '#spinner', equals: 0 },
    ],
  });
  const outDir = join(dir, 'pass');
  const result = await proveChange(spec, outDir);
  const rows = result.proof.after.flatMap(run => run.checks.map(row => `${row.id}=${row.verdict}:${JSON.stringify(row.observed)}`));
  expect(rows.filter(row => !row.includes('=passed'))).toEqual([]);
  expect(result.verdict).toBe('passed');
  const shown = JSON.stringify(safeFeedbackValue(result, spec)) + readFileSync(join(outDir, 'feedback.json'), 'utf8') + readFileSync(join(outDir, 'REPORT.md'), 'utf8');
  expect(shown).not.toContain(typed);
  expect(shown).not.toContain(label);
}, 90_000);

it('records a count mismatch as failed, not as unavailable', async () => {
  const spec = scenario({ steps: [{ action: 'waitFor', selector: '.row', count: 3, note: 'Wait for rows' }],
    checks: [{ id: 'rows', kind: 'count', selector: '.row', equals: 5 }] });
  const result = await proveChange(spec, join(dir, 'count-mismatch'));
  expect(result.verdict).toBe('failed');
  expect(result.proof.after.map(run => run.checks[0].observed)).toEqual([3, 3]);
}, 60_000);

it.each([
  ['dblclick', { action: 'dblclick', selector: '.dup', note }, 'locator_ambiguous'],
  ['selectOption', { action: 'selectOption', selector: '.dup', value: 'a', note }, 'locator_ambiguous'],
  ['type', { action: 'type', selector: '.dup', text: 'x', note }, 'locator_ambiguous'],
  ['scroll', { action: 'scroll', selector: '.dup', to: 'bottom', note }, 'locator_ambiguous'],
  ['drag source', { action: 'drag', from: '.dup', to: '#zone', note }, 'locator_ambiguous'],
  ['drag target', { action: 'drag', from: '#item', to: '.dup', note }, 'locator_ambiguous'],
  ['waitFor state', { action: 'waitFor', selector: '.dup', state: 'attached', note }, 'locator_ambiguous'],
  ['scroll on a non-scrollable element', { action: 'scroll', selector: '#cell', to: { x: 0, y: 10 }, note }, 'unknown'],
] as const)('a %s that cannot act is insufficient_evidence at its step', async (name, step, kind) => {
  const spec = scenario({ steps: [step as ChangeSpec['steps'][number]], checks: [{ id: 'editing', kind: 'text', selector: '#editing', equals: 'no' }] });
  const result = await proveChange(spec, join(dir, name.replace(/\W+/g, '-')));
  expect(result.verdict).toBe('insufficient_evidence');
  expect(result.diagnostics.map(row => [row.category, row.step, row.diagnosis?.kind])).toEqual([
    ['execution_unavailable', 0, kind], ['execution_unavailable', 0, kind]]);
  expect(formatSummary(safeFeedbackValue(result, spec))).not.toContain('.dup');
}, 60_000);

it('previews a walkthrough whose steps use the new actions (recording replays the same steps)', async () => {
  const { previewChange } = await import('../src/core/preview.js');
  const spec = scenario({
    steps: [
      { action: 'dblclick', selector: '#cell', note: 'Open the cell editor' },
      { action: 'drag', from: '#item', to: '#zone', note: 'Drag the item into the zone' },
      { action: 'waitFor', selector: '.row', count: 3, note: 'Wait for all rows' },
    ],
    checks: [{ id: 'dropped', kind: 'text', selector: '#dropped', equals: 'yes' }],
  });
  spec.walkthrough = { startStep: 0, after: [
    { step: 0, at: 'after', text: 'Double-clicking the cell opens its editor.', selector: '#editing' },
    { step: 1, at: 'after', text: 'Dragging the item drops it into the zone.', selector: '#dropped' },
    { step: 2, at: 'after', text: 'All three rows are rendered.', selector: '#list' },
  ] };
  const result = await previewChange(changeSpecSchema.parse(spec), join(dir, 'preview'));
  expect(result).toMatchObject({ status: 'passed', proof: false, diagnostics: [] });
  expect(result.scenes.map(scene => scene.step)).toEqual([0, 1, 2]);
}, 90_000);

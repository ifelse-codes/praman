import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { executeScenario } from '../src/eval/change.js';

// PRAMAN's evidence screenshot is not an app action, so the 3 s action limit must not
// decide it. Playwright waits for web fonts before a screenshot; this page starts loading
// a font only after the click, and the server answers that request after 4.5 s, the same
// kind of wait a loaded CI runner caused (tests/outsideCalls.test.ts on macOS).
const fontDelayMs = 4500;
let server: Server;
let origin: string;
let dir: string;
const timers = new Set<NodeJS.Timeout>();
beforeEach(async () => {
  server = createServer((req, res) => {
    if (req.url === '/slow.woff2') {
      const timer = setTimeout(() => { timers.delete(timer); res.statusCode = 404; res.end(); }, fontDelayMs);
      timers.add(timer);
      return;
    }
    if (req.url !== '/') { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<style>@font-face{font-family:Slow;src:url(/slow.woff2)} #late{font-family:Slow}</style>
<button id="show" onclick="document.getElementById('late').hidden=false">Show</button>
<p id="late" hidden>Shown in a slow font</p><p id="status">ready</p>`);
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-evidence-screenshot-'));
});
afterEach(async () => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  server.closeAllConnections();
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive: true, force: true });
});

it('takes the evidence screenshot even when it waits longer than the 3 s action limit', async () => {
  const spec = changeSpecSchema.parse({
    mode: 'acceptance', title: 'Slow font', change: 'The status stays ready', afterUrl: origin, repeats: 2,
    steps: [{ action: 'click', selector: '#show', note: 'Show the late text' }],
    checks: [{ id: 'status', kind: 'text', selector: '#status', equals: 'ready' }],
  });
  const started = Date.now();
  const run = await executeScenario(spec, origin, join(dir, 'run'));
  expect(run.error).toBeUndefined();
  expect(run.verdict).toBe('passed');
  expect(run.checks).toHaveLength(1);
  expect(run.checks[0]).toMatchObject({ verdict: 'passed', observed: 'ready' });
  expect(run.checks[0].screenshot && existsSync(run.checks[0].screenshot)).toBe(true);
  // The screenshot really waited for the font answer, past the 3 s action limit.
  expect(Date.now() - started).toBeGreaterThanOrEqual(3000);
}, 60_000);

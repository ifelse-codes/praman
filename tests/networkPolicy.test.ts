import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema } from '../src/case/change.js';
import { executeScenario } from '../src/eval/change.js';

it('counts request attempts, redirects and frame traffic only inside each explicit action window', async () => {
// Real Chromium and the host use separate clocks: these windows deliberately exercise
// actual request arrival/deadline behavior, which fake Node timers cannot advance.
  const dir = mkdtempSync(join(tmpdir(), 'praman-network-'));
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(`<button id="go">Go</button><script>
      fetch('/initial'); document.querySelector('#go').onclick=()=>{
        fetch('/ok',{method:'POST'}); fetch('/redirect'); fetch('/fail',{method:'POST'}).catch(()=>{});
        fetch('/slow').catch(()=>{}); setTimeout(()=>fetch('/late'),300);
        const frame=document.createElement('iframe');frame.src='/frame';document.body.append(frame);
      };</script>`); }
    else if (req.url === '/redirect') { res.writeHead(302, { location: '/target' }); res.end(); }
    else if (req.url === '/target') { res.writeHead(201); res.end('created'); }
    else if (req.url === '/fail') req.socket.destroy();
    else if (req.url === '/slow') setTimeout(() => res.end('slow'), 1200);
    else if (req.url === '/frame') { res.setHeader('content-type', 'text/html'); res.end('<script>fetch("/child")</script>'); }
    else res.end('ok');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP fixture');
    const port = address.port;
    const network = (id: string, urlPattern: string, equals: number, settleMs = 600, extra = {}) => ({ id, kind: 'network', match: { urlPattern, ...extra }, window: { fromStep: 0, throughStep: 0, settleMs }, equals });
    const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Request windows', change: 'Observe policy', afterUrl: `http://127.0.0.1:${port}`, steps: [{ action: 'click', selector: '#go', note: 'Request' }], checks: [
      network('expected', '/ok$', 1, 600, { method: 'POST' }), network('forbidden', '/ok$', 0),
      network('absent', '/never$', 0), network('initial-excluded', '/initial$', 0),
      network('redirect', '/redirect$', 1), network('redirect-target', '/target$', 1, 600, { status: 201 }),
      network('failed-attempt', '/fail$', 1), network('frame', '/child$', 1),
      // The page sends /late 300 ms after the click. On a loaded runner the request event can reach the host far later, so the
      // inside window is wide (2500 ms); a timing margin of 300 ms flipped this check once on macOS CI (2026-11-12). The outside window stays 50 ms.
      network('late-outside', '/late$', 0, 50), network('late-inside', '/late$', 1, 2500),
      network('pending-status', '/slow$', 0, 50, { status: 200 }),
    ] });
    const run = await executeScenario(spec, spec.afterUrl, dir);
    const verdicts = ['passed', 'failed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed', 'insufficient_evidence'];
    const observed = [1, 1, 0, 0, 1, 1, 1, 1, 0, 1];
    // Name the check, its observed value and the network rows of its window, so a slow-runner failure is diagnosable from CI output.
    const detail = (index: number) => `check ${index} "${run.checks[index]?.id}": verdict ${run.checks[index]?.verdict}, observed ${JSON.stringify(run.checks[index]?.observed)}, window and rows ${run.checks[index]?.evidence}`;
    expect(run.checks).toHaveLength(verdicts.length);
    verdicts.forEach((verdict, index) => expect(run.checks[index].verdict, detail(index)).toBe(verdict));
    observed.forEach((value, index) => expect(run.checks[index].observed, detail(index)).toBe(value));
    expect(run.checks[10].evidence).toContain('Status unavailable');
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); rmSync(dir, { recursive: true, force: true }); }
}, 90000);

it('does not turn a failed action into a passing negative network assertion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'praman-network-action-'));
  const server = createServer((_, res) => res.end('<button id="ready">Ready</button>'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP fixture');
    const port = address.port;
    const spec = changeSpecSchema.parse({ mode: 'acceptance', title: 'Unavailable', change: 'Observe action', afterUrl: `http://127.0.0.1:${port}`, steps: [{ action: 'click', selector: '#missing', note: 'Missing' }], checks: [
      { id: 'negative', kind: 'network', match: { urlPattern: '/forbidden' }, window: { fromStep: 0, throughStep: 0, settleMs: 10 }, equals: 0 },
    ] });
    const run = await executeScenario(spec, spec.afterUrl, dir);
    expect(run.verdict).toBe('insufficient_evidence'); expect(run.checks).toEqual([]); expect(run.failedStep).toBe(0);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); rmSync(dir, { recursive: true, force: true }); }
}, 90000);
it('rejects ambiguous windows, invalid URL regexes, invalid statuses and mixed checkpoint syntax', () => {
  const base = { mode: 'acceptance', title: 'Policy', change: 'Policy', afterUrl: 'http://127.0.0.1:12345', steps: [{ action: 'click', selector: '#go', note: 'go' }] };
  const check = { id: 'network', kind: 'network', match: { urlPattern: '/ok' }, window: { fromStep: 0, throughStep: 0, settleMs: 10 }, equals: 0 };
  for (const invalid of [
    { ...check, match: { urlPattern: '[' } }, { ...check, match: { urlPattern: '/', status: 600 } },
    { ...check, match: { urlPattern: '/', method: 'get' } }, { ...check, afterStep: 0 },
    { ...check, window: { fromStep: 1, throughStep: 0, settleMs: 0 } },
    { ...check, window: { fromStep: 0, throughStep: 1, settleMs: 0 } },
    { ...check, window: { fromStep: 0, throughStep: 0, settleMs: 10001 } },
  ]) expect(changeSpecSchema.safeParse({ ...base, checks: [invalid] }).success).toBe(false);
});

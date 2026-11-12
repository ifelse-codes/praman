import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { changeSpecSchema, type ChangeSpec } from '../src/case/change.js';
import { executeScenario, hashSpec } from '../src/eval/change.js';
import { executeUsers } from '../src/eval/users.js';
import { classifyError } from '../src/review/classify.js';

// Spec navigation-guard: the same-origin navigation guard must not disable the browser cache
// (Chromium then aborts CSS cross-document view transitions with a page error PRAMAN caused),
// and every top-level navigation to another origin is stopped before its request is sent.

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const cacheable = 'public, max-age=600';

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP fixture');
  return { server, base: `http://127.0.0.1:${address.port}` };
}
async function close(server: Server) { server.closeAllConnections(); server.close(); await once(server, 'close'); }

/** The other origin counts every request it receives; the browser's own favicon probe is not a navigation. */
let otherHits = 0;
let other: { server: Server; base: string };
let app: { server: Server; base: string };
const dirs: string[] = [];
const dir = () => { const path = mkdtempSync(join(tmpdir(), 'praman-guard-')); dirs.push(path); return path; };

beforeAll(async () => {
  other = await listen((req, res) => {
    if (req.url !== '/favicon.ico') otherHits++;
    if (req.url === '/cdn.png') { res.writeHead(200, { 'content-type': 'image/png', 'cache-control': cacheable }); res.end(png); return; }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1 id="outside">Outside</h1>');
  });
  const outside = `${other.base}/landing`;
  // Pages with a CSS cross-document view transition and subresources that are not render-blocking (image, SVG sprite, module script).
  const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="/app.css"><script type="module" src="/app.js"></script></head>`
    + `<body><h1 id="title">${title}</h1><svg width="10" height="10"><use href="/sprite.svg#i"/></svg><img src="/pic.png" alt="">${body}</body></html>`;
  app = await listen((req, res) => {
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
    switch (req.url) {
      case '/': html('<!doctype html><p id="home">Home</p>'); return;
      case '/plain.css': res.writeHead(200, { 'content-type': 'text/css', 'cache-control': cacheable }); res.end('body { margin: 8px; }'); return;
      case '/app.css': res.writeHead(200, { 'content-type': 'text/css', 'cache-control': cacheable }); res.end('@view-transition { navigation: auto; } body { font: 16px sans-serif; }'); return;
      case '/app.js': res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': cacheable }); res.end('document.documentElement.dataset.ready = "1";'); return;
      case '/sprite.svg': res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': cacheable }); res.end('<svg xmlns="http://www.w3.org/2000/svg"><symbol id="i" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></svg>'); return;
      case '/pic.png': res.writeHead(200, { 'content-type': 'image/png', 'cache-control': cacheable }); res.end(png); return;
      case '/one': html(page('One', '<a id="next" href="/two">Two</a>')); return;
      case '/two': html(page('Two', '<a id="next" href="/one">One</a>')); return;
      case '/throws': html('<!doctype html><p id="title">Broken</p><script>throw new Error("app failure on load")</script>'); return;
      case '/exits': html(`<!doctype html><a id="link" href="${outside}">Link</a><a id="tab" target="_blank" href="${outside}">Tab</a><a id="hop" href="/hop">Hop</a>`
        + `<form method="post" action="${outside}"><button id="post">Post</button></form><button id="script" onclick="location.href='${outside}'">Script</button>`
        + `<iframe id="frame" src="/frame"></iframe><a id="same" href="/two">Same</a>`); return;
      case '/frame': html(`<a id="top" target="_top" href="${outside}">Top</a>`); return;
      case '/hop': res.writeHead(302, { location: outside }); res.end(); return;
      // Network pin: same-origin navigation with a redirect, cached and uncached subresources, another origin's image and iframe, fetches.
      case '/start': html(`<!doctype html><link rel="stylesheet" href="/plain.css"><img src="/pic.png" alt=""><img src="${other.base}/cdn.png" alt=""><iframe src="${other.base}/embed"></iframe>`
        + `<a id="go" href="/moved">Go</a><script>fetch('/api')</script>`); return;
      case '/moved': res.writeHead(302, { location: '/landing' }); res.end(); return;
      case '/landing': html(`<!doctype html><link rel="stylesheet" href="/plain.css"><img src="/pic.png" alt=""><p id="landed">Landed</p><script>fetch('/api');fetch('/broken').catch(()=>{})</script>`); return;
      case '/api': res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return;
      case '/broken': req.socket.destroy(); return;
      default: res.writeHead(404); res.end();
    }
  });
});
afterAll(async () => {
  await close(app.server); await close(other.server);
  for (const path of dirs) rmSync(path, { recursive: true, force: true });
});

const declaration = (steps: unknown[], checks: unknown[], extra: object = {}) => changeSpecSchema.parse({
  mode: 'acceptance', title: 'Navigation guard', change: 'Guarded navigation', afterUrl: app.base, steps, checks, ...extra,
});
const noErrors = { id: 'no-runtime-errors', kind: 'pageErrors', equals: 0 };

describe.skipIf(!existsSync(chromium.executablePath()))('navigation guard in Chromium', () => {
  it('follows in-app links on a view-transition page with no runtime error', async () => {
    const spec = declaration([
      { action: 'goto', path: '/one', note: 'Open page one' },
      { action: 'click', selector: '#next', note: 'Go to page two' },
      { action: 'waitForURL', path: '/two', note: 'Page two' },
      { action: 'click', selector: '#next', note: 'Back to page one' },
      { id: 'back', action: 'waitForURL', path: '/one', note: 'Page one' },
    ], [{ id: 'title', kind: 'text', selector: '#title', equals: 'One', afterStep: 'back' }, noErrors]);
    const run = await executeScenario(spec, app.base, dir());
    expect(run.error, run.checks.map(check => check.evidence).join(' | ')).toBeUndefined();
    expect(run.checks.map(check => [check.id, check.verdict, check.observed])).toEqual([['title', 'passed', 'One'], ['no-runtime-errors', 'passed', 0]]);
    expect(run.verdict).toBe('passed');
  }, 90_000);

  it.each([
    ['a link', [{ action: 'click', selector: '#link', note: 'Follow the outside link' }], false],
    ['a form post', [{ action: 'click', selector: '#post', note: 'Post to the outside' }], false],
    ['a script navigation', [{ action: 'click', selector: '#script', note: 'Script leaves' }], false],
    ['a same-origin redirect', [{ action: 'click', selector: '#hop', note: 'Redirected outside' }], false],
    ['an iframe that navigates the top', [{ action: 'click', selector: '#frame >> internal:control=enter-frame >> #top', note: 'Frame leaves' }], false],
    ['a new tab', [{ action: 'click', selector: '#tab', note: 'Open the outside in a new tab' }, { action: 'waitFor', selector: '#same', note: 'Still here' }], true],
  ])('stops %s to another origin before the request leaves and reports navigation_failed', async (_name, steps, newTab) => {
    const spec = declaration([{ action: 'goto', path: '/exits', note: 'Open the page' }, ...steps], [{ id: 'still-here', kind: 'visible', selector: '#same', equals: true }]);
    const before = otherHits;
    const out = dir();
    const run = await executeScenario(spec, app.base, out);
    expect(otherHits - before).toBe(0);
    expect(run.verdict).toBe('insufficient_evidence');
    expect(run.error).toMatch(/^Navigation left the app origin: PRAMAN stopped /);
    expect(run.error).toContain(newTab ? 'a new tab or window' : _name === 'a same-origin redirect' ? 'a redirect' : 'the page');
    expect(classifyError(run.error!).kind).toBe('navigation_failed');
    const rows = JSON.parse(readFileSync(join(out, 'network.json'), 'utf8')) as Array<{ url: string; resource: string; status?: number }>;
    expect(rows.filter(row => row.url.startsWith(other.base))).toSatisfy((outside: Array<{ resource: string; status?: number }>) => outside.length > 0 && outside.every(row => row.resource === 'document' && row.status === undefined));
  }, 90_000);

  it('stops a link to another origin for every user of a many-users run', async () => {
    const spec = declaration([{ action: 'goto', path: '/exits', note: 'Open the page' }, { action: 'click', selector: '#link', note: 'Follow the outside link' }],
      [{ id: 'still-here', kind: 'visible', selector: '#same', equals: true }], { users: { count: 2 } });
    const before = otherHits;
    const run = await executeUsers(spec, app.base, dir(), executeScenario);
    expect(otherHits - before).toBe(0);
    expect(run.verdict).toBe('insufficient_evidence');
    expect(run.users?.map(row => classifyError(row.run.error ?? '').kind)).toEqual(['navigation_failed', 'navigation_failed']);
  }, 90_000);

  it('still fails a real app error, asserted or not', async () => {
    const open = [{ action: 'goto', path: '/throws', note: 'Open a page that throws' }];
    const asserted = await executeScenario(declaration(open, [{ id: 'title', kind: 'visible', selector: '#title', equals: true }, noErrors]), app.base, dir());
    expect(asserted.verdict).toBe('failed');
    expect(asserted.checks.find(check => check.id === 'no-runtime-errors')).toMatchObject({ verdict: 'failed', observed: 1 });
    const unasserted = await executeScenario(declaration(open, [{ id: 'title', kind: 'visible', selector: '#title', equals: true }]), app.base, dir());
    expect(unasserted.verdict).toBe('insufficient_evidence');
    expect(unasserted.error).toBe('Unasserted app runtime errors: app failure on load');
  }, 90_000);

  it('records same-origin navigations, redirects and subresources as before', async () => {
    const spec = declaration([
      { action: 'goto', path: '/start', note: 'Open the start page' },
      { action: 'click', selector: '#go', note: 'Follow a same-origin redirect' },
      { action: 'waitFor', selector: '#landed', note: 'Landed' },
    ], [{ id: 'api-calls', kind: 'network', match: { urlPattern: '/api$', method: 'GET', status: 200 }, window: { fromStep: 1, throughStep: 2, settleMs: 300 }, equals: 1 }]);
    const out = dir();
    const run = await executeScenario(spec, app.base, out);
    expect(run.verdict).toBe('passed');
    expect(run.checks[0]).toMatchObject({ verdict: 'passed', observed: 1 });
    const rows = JSON.parse(readFileSync(join(out, 'network.json'), 'utf8')) as Array<{ url: string; method: string; resource: string; status?: number; error?: string }>;
    const shown = rows.map(row => `${row.method} ${row.resource} ${row.url.replace(app.base, '').replace(other.base, 'OTHER')} ${row.status ?? '-'}${row.error ? ` ${row.error}` : ''}`).sort();
    // Pinned from the former page.route guard (main 04cc125) on this fixture: the same rows with the browser cache on.
    expect(shown).toEqual([
      'GET document / 200', 'GET document /landing 200', 'GET document /moved 302', 'GET document /start 200', 'GET document OTHER/embed 200',
      'GET fetch /api 200', 'GET fetch /api 200', 'GET fetch /broken - net::ERR_EMPTY_RESPONSE', 'GET image /pic.png 200', 'GET image /pic.png 200',
      'GET image OTHER/cdn.png 200', 'GET stylesheet /plain.css 200', 'GET stylesheet /plain.css 200',
    ]);
  }, 90_000);
});

it('keeps the meaning and hash of a declaration written before the change', () => {
  const old: ChangeSpec = changeSpecSchema.parse({
    mode: 'acceptance', title: 'Before navigation-guard', change: 'Unchanged declaration', afterUrl: 'http://127.0.0.1:4100',
    steps: [{ action: 'goto', path: '/one', note: 'Open' }, { id: 'next', action: 'click', selector: '#next', note: 'Next' }],
    checks: [{ id: 'title', kind: 'text', selector: '#title', equals: 'Two', afterStep: 'next' }, { id: 'errors', kind: 'pageErrors', equals: 0 }],
  });
  expect(old.checks[0]).toMatchObject({ afterStep: 1 });
  // Pinned on main 04cc125, before the change.
  expect(hashSpec(old)).toBe('acff363bdb398509c33d9d56f444ba3767a1cabe8dcbf9dbe5e12f7be39919ec');
});

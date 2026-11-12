import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { changeSpecSchema, type ChangeProof, type ScenarioRun } from '../src/case/change.js';
import type { Verdict } from '../src/eval/eval.js';
import { escapeHtml } from '../src/review/html.js';
import { saveFeedback } from '../src/review/feedback.js';

// A real 1x1 PNG, so the browser test can check that the images decode.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const evil = `<script>alert(1)</script> & "q" 's' </style>`;
const fillSecret = 'hunter2-fill-value';
const typeSecret = 'typed-secret-text';
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'praman-html-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const declaration = (extra: object = {}) => ({ mode: 'acceptance', title: `Title ${evil}`, change: 'Requirement text', afterUrl: 'http://127.0.0.1:1', repeats: 2,
  steps: [
    { id: 'open', action: 'goto', path: '/', note: 'Open the page' },
    { id: 'pass', action: 'fill', selector: 'input[name=password]', value: fillSecret, note: 'Enter the password' },
    { id: 'name', action: 'type', selector: '#name', text: typeSecret, note: 'Type the name' },
    { id: 'go', action: 'click', selector: '#go', note: 'Press go' },
    { id: 'done', action: 'waitFor', selector: '#done', note: 'Wait for done' },
  ],
  checks: [
    { id: 'shows-done', kind: 'text', selector: `#done[data-x="${evil}"]`, equals: evil, afterStep: 'done' },
    { id: 'count-rows', kind: 'count', selector: '#rows li', equals: 2, afterStep: 'done' },
    { id: 'no-errors', kind: 'pageErrors', equals: 0 },
  ], ...extra });
const spec = (extra: object = {}) => changeSpecSchema.parse(declaration(extra));

/** One run; `verdicts` gives each check's recorded verdict, and a check named in `missing` has no screenshot file. */
function run(folder: string, verdicts: Verdict[], options: { missing?: number[]; error?: string; failedStep?: number; observed?: unknown[] } = {}): ScenarioRun {
  rmSync(join(dir, folder), { recursive: true, force: true });
  mkdirSync(join(dir, folder), { recursive: true });
  const names = ['shows-done', 'count-rows', 'no-errors'];
  const expected = [evil, 2, 0];
  const checks = names.map((id, i) => {
    const screenshot = join(dir, folder, `check-${i + 1}.png`);
    if (!options.missing?.includes(i)) writeFileSync(screenshot, png);
    return { id, verdict: verdicts[i], expected: expected[i], observed: options.observed?.[i] ?? expected[i], evidence: 'private raw evidence', screenshot, afterStep: [4, 4, undefined][i] };
  });
  writeFileSync(join(dir, folder, 'result.json'), '{}');
  writeFileSync(join(dir, folder, 'network.json'), '[]');
  const verdict: Verdict = verdicts.every(item => item === 'passed') ? 'passed' : verdicts.includes('failed') ? 'failed' : 'insufficient_evidence';
  return { url: 'http://127.0.0.1:1', verdict, checks, screenshots: checks.map(row => row.screenshot), ...(options.error ? { error: options.error, failedStep: options.failedStep } : {}) };
}
function proofOf(after: ScenarioRun[], verdict: Verdict, extra: Partial<ChangeProof> = {}): ChangeProof {
  return { mode: 'acceptance', specHash: 'hash-1', verifiedAt: '2026-11-12T00:00:00.000Z', scope: 'Only the declared scenario; not whole-application correctness.', verdict, reason: 'Fixture reason', after, ...extra };
}
const html = () => readFileSync(join(dir, 'REPORT.html'), 'utf8');
const passRuns = () => [run('after-1', ['passed', 'passed', 'passed']), run('after-2', ['passed', 'passed', 'passed'])];

describe('REPORT.html', () => {
  it('shows each verdict as its own text label and never words missing evidence as a pass', () => {
    const cases: Array<[Verdict, ScenarioRun[]]> = [
      ['passed', passRuns()],
      ['failed', [run('after-1', ['failed', 'passed', 'passed'], { observed: ['other'] }), run('after-2', ['passed', 'passed', 'passed'])]],
      ['insufficient_evidence', [run('after-1', ['passed', 'passed', 'passed'], { missing: [0] }), run('after-2', ['passed', 'passed', 'passed'])]],
      ['not_executed', [run('after-1', ['passed', 'passed', 'passed'])]],
    ];
    for (const [verdict, after] of cases) {
      const result = saveFeedback(spec(), proofOf(after, verdict), dir);
      expect(result.reportHtml).toBe(join(dir, 'REPORT.html'));
      const page = html();
      expect(page).toContain(`<div class="banner v-${verdict}" role="status">`);
      expect(page).toMatch(new RegExp(`banner v-${verdict}[^]*?${verdict}`));
      if (verdict !== 'passed') expect(page).not.toMatch(/banner v-passed|Passed: every declared check/);
    }
    // The cell of a run with a missing screenshot is "insufficient_evidence", never "passed".
    saveFeedback(spec(), proofOf([run('after-1', ['passed', 'passed', 'passed'], { missing: [0] }), run('after-2', ['passed', 'passed', 'passed'])], 'insufficient_evidence'), dir);
    expect(html()).toMatch(/Not proven: some evidence is missing/);
    expect(html()).toContain('Screenshot missing');
    // A run that was never executed has its own label and the page says so.
    saveFeedback(spec(), proofOf([run('after-1', ['passed', 'passed', 'passed'])], 'insufficient_evidence'), dir);
    expect(html()).toContain('not_executed');
  });

  it('lists every declared check in the table and in a card, with every run column', () => {
    saveFeedback(spec(), proofOf(passRuns(), 'passed'), dir);
    const page = html();
    for (const [i, id] of ['shows-done', 'count-rows', 'no-errors'].entries()) {
      expect(page).toContain(`<a href="#check-${i}">Check ${i}</a>`);
      expect(page).toContain(`<article class="card" id="check-${i}">`);
      expect(page).toContain(`: ${id} (`);
    }
    expect(page).toContain('<th scope="col">Run 1</th>');
    expect(page).toContain('<th scope="col">Run 2</th>');
    expect(page).toContain('Root cause: unknown.');
    expect(page).toContain('This page is a private local view');
    expect(page).toContain('This page shows only what was declared and observed. It is not proof that the whole app is correct.');
    expect(page).toContain('alt="Check 1, run 2 screenshot"');
    expect(page).toContain('Private evidence: contains application data. Do not share.');
  });

  it('escapes script, quotes, ampersands and a closing style tag in text and attributes', () => {
    saveFeedback(spec(), proofOf([run('after-1', ['failed', 'passed', 'passed'], { observed: [evil] }), run('after-2', ['passed', 'passed', 'passed'])], 'failed'), dir);
    const page = html();
    expect(page).not.toContain('<script');
    expect(page).not.toContain(evil);
    expect(page).toContain(escapeHtml(evil));
    expect(page.match(/<\/style>/g)?.length).toBe(1);
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&#60;a href=&#34;x&#34; onclick=&#39;y&#39;&#62;&#38;');
    // The only element that carries the hostile selector text does so as escaped text.
    expect(page).toContain(escapeHtml(`#done[data-x="${evil}"]`));
  });

  it('uses only relative links to files that exist and makes a missing screenshot visible', () => {
    saveFeedback(spec(), proofOf([run('after-1', ['passed', 'passed', 'passed'], { missing: [1] }), run('after-2', ['passed', 'passed', 'passed'])], 'insufficient_evidence'), dir);
    const page = html();
    const links = [...page.matchAll(/\b(?:src|href)="([^"]*)"/g)].map(match => match[1]);
    expect(links.length).toBeGreaterThan(8);
    for (const link of links) {
      expect(link).not.toMatch(/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i);
      if (!link.startsWith('#')) expect(existsSync(join(dir, decodeURIComponent(link))), link).toBe(true);
    }
    expect(page).toContain('<img class="shot" src="after-1/check-1.png"');
    expect(page).toContain('Screenshot missing: Check 1, run 1 screenshot');
    expect(page).not.toContain('src="after-1/check-2.png"');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toMatch(/<script|<link|@import|url\(/i);
  });

  it('is written with mode 0600 and rewritten with the new verdict when the folder is saved again', () => {
    saveFeedback(spec(), proofOf(passRuns(), 'passed'), dir);
    expect(statSync(join(dir, 'REPORT.html')).mode & 0o777).toBe(0o600);
    expect(html()).toContain('class="banner v-passed"');
    saveFeedback(spec(), proofOf([run('after-1', ['failed', 'passed', 'passed']), run('after-2', ['passed', 'passed', 'passed'])], 'failed'), dir);
    expect(html()).toContain('class="banner v-failed"');
    expect(html()).not.toContain('class="banner v-passed"');
  });

  it('keeps feedback.json and REPORT.md bytes the same as the code before the HTML report', () => {
    const fixed = join(dir, 'pin'); mkdirSync(fixed);
    const base = spec();
    const after = [run('pin/after-1', ['failed', 'passed', 'passed'], { observed: ['other'] }), run('pin/after-2', ['passed', 'passed', 'passed'])];
    const result = saveFeedback(base, proofOf(after, 'failed'), fixed);
    const normal = (path: string) => readFileSync(path, 'utf8').replaceAll('&#95;', '_').split(pathToFileURL(fixed).href).join('<DIR>').split(fixed).join('<DIR>').split(dir).join('<ROOT>');
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');
    expect({ feedback: sha(normal(result.feedbackPath)), report: sha(normal(result.report)) }).toEqual(pinnedHashes);
  });

  it('marks the step where a run stopped and explains the diagnosis in plain words', () => {
    const stopped: ScenarioRun = { ...run('after-1', ['passed', 'passed', 'passed']), checks: [], verdict: 'insufficient_evidence', failedStep: 3,
      error: 'locator.click: Timeout 3000ms exceeded.\nCall log:\n  - waiting for locator(\'#go\') to be visible' };
    saveFeedback(spec(), proofOf([stopped, run('after-2', ['passed', 'passed', 'passed'])], 'insufficient_evidence'), dir);
    const page = html();
    expect(page).toMatch(/<li class="stop">Step 3: <code>click<\/code> <code>go<\/code>[^]*Stopped here: Run 1/);
    expect(page).not.toMatch(/<li class="stop">Step [^3]/);
    expect(page).toContain('locator_timeout (visible, 3000 ms)');
    expect(page).toContain('not_executed');
    expect(page).not.toContain('Timeout 3000ms exceeded');
  });

  it('shows the users table only when users are declared', () => {
    saveFeedback(spec(), proofOf(passRuns(), 'passed'), dir);
    expect(html()).not.toContain('Many users and invariants');
    const users = { count: 2, after: [{ id: 'relist', action: 'goto', path: '/', note: 'Open again' }], invariants: [{ id: 'two-rows', kind: 'count', selector: '#rows li', equals: { perUser: 1 } }] };
    const withUsers = spec({ users });
    const userRun = (n: number, invariant: Verdict): ScenarioRun => {
      const base = run(`after-${n}`, ['passed', 'passed', 'passed']);
      mkdirSync(join(dir, `after-${n}`, 'user-1'), { recursive: true });
      mkdirSync(join(dir, `after-${n}`, 'user-2'), { recursive: true });
      writeFileSync(join(dir, `after-${n}`, 'user-1', 'inv.png'), png);
      return { ...base, verdict: invariant === 'passed' ? 'passed' : 'failed', peakConcurrency: 2,
        users: [{ user: 0, endedAt: 2, run: base }, { user: 1, endedAt: 2, run: base }],
        invariants: [{ id: 'two-rows', kind: 'count', verdict: invariant, expected: 2, observed: invariant === 'passed' ? 2 : 1, evidence: 'raw', screenshot: join(dir, `after-${n}`, 'user-1', 'inv.png') }] };
    };
    saveFeedback(withUsers, proofOf([userRun(1, 'failed'), userRun(2, 'passed')], 'failed'), dir);
    const page = html();
    expect(page).toContain('Many users and invariants');
    expect(page).toContain('peak concurrency 2');
    expect(page).toContain('<a href="after-1/user-2/">open folder</a>');
    expect(page).toMatch(/Invariant 0: two-rows \(count\): <span class="v v-failed">/);
    expect(page).toContain('Expected: <code>2</code><br>Observed: <code>1</code>');
    expect(page).toContain('src="after-1/user-1/inv.png"');
    expect(page).toContain('<a href="#invariant-Run-1-0">Invariant 0 (two-rows), Run 1</a>');
    expect(page).toContain('id="invariant-Run-1-0"');
    expect(page).toContain('Users, repeat 1 failed: 2 users [passed, passed], peak 2, invariants [failed]');
  });

  it('shows application text but never a fill value, typed text or credential-like value', () => {
    const observed = [{ name: 'api_key', value: 'sk-live-0001' }, 'password: hunter-observed', `has ${fillSecret} and ${typeSecret}`];
    saveFeedback(spec(), proofOf([run('after-1', ['failed', 'failed', 'failed'], { observed }), run('after-2', ['passed', 'passed', 'passed'])], 'failed'), dir);
    const page = html();
    expect(page).toContain('Requirement text');
    expect(page).toContain('shows-done');
    expect(page).toContain('Open the page');
    for (const secret of [fillSecret, typeSecret, 'sk-live-0001', 'hunter-observed', 'hunter2']) expect(page, secret).not.toContain(secret);
    expect(page).toContain('[REDACTED]');
  });
});

describe.skipIf(!existsSync(chromium.executablePath()))('REPORT.html in Chromium', () => {
  it('loads every image from file:// and makes no request other than file:', async () => {
    saveFeedback(spec(), proofOf(passRuns(), 'passed'), dir);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const requests: string[] = [];
      const violations: string[] = [];
      page.on('request', request => requests.push(request.url()));
      page.on('console', message => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()); });
      await page.goto(pathToFileURL(join(dir, 'REPORT.html')).href);
      await page.waitForLoadState('load');
      const images = await page.evaluate("Array.from(document.images).map(node => ({ src: node.getAttribute('src'), width: node.naturalWidth }))") as Array<{ src: string | null; width: number }>;
      expect(images.length).toBe(6);
      for (const image of images) expect(image.width, image.src ?? '').toBeGreaterThan(0);
      expect(requests.length).toBeGreaterThan(0);
      for (const url of requests) expect(url.startsWith('file:'), url).toBe(true);
      expect(violations).toEqual([]);
      // The policy forbids network sources even if a value slipped through: a late remote image must not load.
      const blocked = await page.evaluate(`new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(false); image.onerror = () => resolve(true);
        image.src = 'http://127.0.0.1:9/x.png';
        document.body.append(image);
      })`);
      expect(blocked).toBe(true);
    } finally { await browser.close(); }
  });
});

// Hashes of feedback.json and REPORT.md for the fixture above, made with the code before REPORT.html existed.
const pinnedHashes = { feedback: 'db95a4b7d8833d49f9d75182f07f24270e292b1c745ab6683b50699674a72dae', report: 'a847193ebb03534e7c5eb4a4429b51749a00287f56358beb351e0798ca2472b8' };

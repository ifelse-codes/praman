import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeSpecSchema, type ChangeSpec, type ScenarioOptions, type ScenarioRun } from '../src/case/change.js';
import { hashSpec, proveChange } from '../src/eval/change.js';
import { executeUsers, peakOverlap, userSpec, type ExecuteScenario } from '../src/eval/users.js';
import { safeFeedbackValue } from '../src/review/feedback.js';

const note = 'Act on the page';
const base = { mode: 'acceptance', title: 'Shared list', change: 'Every user adds one entry', afterUrl: 'http://127.0.0.1:1', repeats: 2 } as const;
const steps = [
  { action: 'goto', path: '/', note },
  { id: 'type-title', action: 'fill', selector: '#title', value: 'User {user1}', note },
  { id: 'save', action: 'click', selector: '#add', note },
  { id: 'saved', action: 'waitFor', selector: '#status:text-is("saved")', note },
] as const;
const after = [{ action: 'goto', path: '/', note }, { id: 'listed', action: 'waitFor', selector: '#list', note }] as const;
const users = { count: 3, syncAtStep: 'save', after, invariants: [{ id: 'one-each', kind: 'count', selector: '#list li', equals: { perUser: 1 } }] } as const;
const checks = [
  { id: 'own-save', kind: 'text', selector: '#status', equals: 'saved', afterStep: 'saved' },
  { id: 'no-errors', kind: 'pageErrors', equals: 0 },
] as const;
const declaration = (extra: object = {}) => ({ ...base, steps, checks, users, ...extra });
const parse = (value: object) => changeSpecSchema.safeParse(value);
const messages = (value: object) => { const result = parse(value); return result.success ? [] : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`); };

describe('declaring many users', () => {
  it('parses users, resolves the sync step id and keeps the hash of a declaration without users', () => {
    const spec = changeSpecSchema.parse(declaration());
    expect(spec.users?.syncAtStep).toBe(2);
    expect(changeSpecSchema.parse(spec)).toEqual(spec);
    const single = changeSpecSchema.parse({ ...base, steps, checks });
    expect('users' in single).toBe(false);
    expect(hashSpec(single)).not.toBe(hashSpec(spec));
    expect(hashSpec(single)).toBe(hashSpec(changeSpecSchema.parse({ ...base, steps, checks })));
  });

  it('runs 5 users when count is omitted, and keeps an explicit count', () => {
    const { count: _omitted, ...withoutCount } = users;
    expect(changeSpecSchema.parse(declaration({ users: withoutCount })).users?.count).toBe(5);
    expect(changeSpecSchema.parse(declaration()).users?.count).toBe(3);
    const spec = changeSpecSchema.parse(declaration({ users: { ...withoutCount, invariants: users.invariants } }));
    expect(userSpec(spec, 0).checks.at(-1)).toMatchObject({ equals: 5 });
  });

  it.each([
    ['a single user', { users: { ...users, count: 1 } }, 'users.count'],
    ['more than ten users', { users: { ...users, count: 11 } }, 'users.count'],
    ['an unknown sync step id', { users: { ...users, syncAtStep: 'nope' } }, 'users.syncAtStep: users.syncAtStep refers to unknown step id "nope"'],
    ['a sync step past the last step', { users: { ...users, syncAtStep: 9 } }, 'users.syncAtStep: syncAtStep requires an existing step.'],
    ['invariants without observer steps', { users: { count: 2, invariants: users.invariants } }, 'users.after: Invariants are read after the observer steps; declare users.after.'],
    ['an observer upload', { users: { count: 2, after: [{ action: 'upload', selector: '#f', path: 'a.txt', note }] } }, 'users.after: Observer steps cannot upload files.'],
    ['a repair mode', { mode: 'repair', beforeUrl: 'http://127.0.0.1:2', baselineKind: 'historical', regressionCheck: 'own-save' }, 'users: Many users run in acceptance mode only.'],
    ['a network check', { checks: [...checks, { id: 'n', kind: 'network', match: { urlPattern: 'x' }, window: { fromStep: 0, throughStep: 1, settleMs: 0 }, equals: 0 }] }, 'users: Many users cannot be combined with network checks.'],
    ['faults', { faults: [{ name: 'db-down', fromStep: 0, throughStep: 1 }] }, 'users: Many users cannot be combined with faults, a walkthrough or a diff.'],
    ['an invariant with a checkpoint', { users: { ...users, invariants: [{ id: 'x', kind: 'text', selector: '#a', equals: 'b', afterStep: 0 }] } }, 'users.invariants.0: Invariants are read once after all users ended: no network kind and no afterStep.'],
    ['a duplicate invariant id', { users: { ...users, invariants: [users.invariants[0], users.invariants[0]] } }, 'users.invariants: Invariant ids must be unique'],
  ])('rejects %s before anything runs', (_, value, message) => {
    expect(messages(declaration(value)).some(line => line.startsWith(message))).toBe(true);
  });

  it('gives each user its own copy: {user} is zero-based, {user1} one-based; the first user also observes', () => {
    const spec = changeSpecSchema.parse(declaration());
    const [first, third] = [userSpec(spec, 0), userSpec(spec, 2)];
    expect(JSON.stringify(third.steps)).toContain('User 3');
    expect(JSON.stringify(first.steps)).toContain('User 1');
    expect('users' in first).toBe(false);
    expect(first.steps).toHaveLength(steps.length + after.length);
    expect(third.steps).toHaveLength(steps.length);
    const invariant = first.checks.at(-1)!;
    expect(invariant).toMatchObject({ id: '$invariant:one-each', kind: 'count', equals: 3, afterStep: steps.length + after.length - 1 });
    expect(third.checks).toHaveLength(checks.length);
    expect(spec.users?.invariants?.[0]).toMatchObject({ equals: { perUser: 1 } });
  });

  it('measures the largest overlap of the users', () => {
    expect(peakOverlap([{ startedAt: 0, endedAt: 10 }, { startedAt: 5, endedAt: 20 }, { startedAt: 8, endedAt: 9 }])).toBe(3);
    expect(peakOverlap([{ startedAt: 0, endedAt: 10 }, { startedAt: 10, endedAt: 20 }])).toBe(1);
    expect(peakOverlap([{ endedAt: 10 }, { startedAt: 0, endedAt: 5 }])).toBe(1);
  });
});

describe('combining users (no browser)', () => {
  const spec = changeSpecSchema.parse(declaration({ afterUrl: 'http://127.0.0.1:1' }));
  const row = (id: string, verdict: 'passed' | 'failed', observed: unknown) => ({ id, verdict, expected: observed, observed, evidence: 'e', screenshot: `${id}.png` });
  /** A fake engine that calls the hooks like the real one and returns passing checks, so only the coordination is under test. */
  const fake = (log: string[], options: { failUser?: number; slowMs?: number } = {}): ExecuteScenario => async (copy: ChangeSpec, url: string, dir: string, hooks: ScenarioOptions = {}): Promise<ScenarioRun> => {
    const user = Number(dir.slice(-1)) - 1;
    const name = `u${user + 1}`;
    for (const [index] of copy.steps.entries()) {
      if (user === options.failUser && index === 1) return { url, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: 'boom', failedStep: 1, completedSteps: 1 };
      log.push(`${name}:in:${index}`);
      await hooks.beforeStep?.({} as never, copy.steps[index]!, index);
      log.push(`${name}:${index}`);
      if (options.slowMs && user === 2) await new Promise(resolve => setTimeout(resolve, options.slowMs));
    }
    return { url, verdict: 'passed', screenshots: [], completedSteps: copy.steps.length,
      checks: copy.checks.map(check => row(check.id, 'passed', 'equals' in check ? check.equals : 0)) as ScenarioRun['checks'] };
  };

  it('holds every user at the sync step until all have arrived, then runs the observer last', async () => {
    const log: string[] = [];
    const result = await executeUsers(spec, 'http://127.0.0.1:1', '/tmp/praman-fake-users-1', async (copy, url, dir, hooks) => {
      const run = await fake(log, { slowMs: 150 })(copy, url, dir, hooks);
      log.push(`end:${dir.slice(-1)}`);
      return run;
    }, {});
    const arrivals = log.filter(line => line.endsWith(':in:2'));
    expect(arrivals).toHaveLength(3);
    // Nobody passes the sync step before the last user has arrived at it.
    expect(log.indexOf(arrivals.at(-1)!)).toBeLessThan(log.findIndex(line => /^u\d:2$/.test(line)));
    // The observer steps (index 4 and 5) of user 1 run after every other user ended.
    const observer = log.findIndex(line => line === 'u1:4');
    expect(['end:2', 'end:3'].every(line => log.indexOf(line) < observer)).toBe(true);
    expect(result.users).toHaveLength(3);
    expect(result.peakConcurrency).toBeGreaterThanOrEqual(2);
    rmSync('/tmp/praman-fake-users-1', { recursive: true, force: true });
  });

  it('does not wait for a user that ended early, and never turns the missing observation into a pass', async () => {
    const log: string[] = [];
    const result = await executeUsers(spec, 'http://127.0.0.1:1', '/tmp/praman-fake-users-2', fake(log, { failUser: 1 }), {});
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.error).toContain('User 2: boom');
    expect(result.users?.map(row => row.run.verdict)).toEqual(['passed', 'insufficient_evidence', 'passed']);
    // The first user ran its observer steps even though user 2 never reached the sync step.
    expect(log).toContain('u1:5');
    rmSync('/tmp/praman-fake-users-2', { recursive: true, force: true });
  });
});

let server: Server;
let origin: string;
let dir: string;
let lossy = false;
let items: string[] = [];
beforeEach(async () => {
  items = [];
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/items') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(items)); return; }
    if (req.method === 'POST' && url.pathname === '/add') {
      const title = url.searchParams.get('title') ?? '';
      if (!lossy) { items.push(title); res.end('ok'); return; }
      // Deliberate lost update: read, wait, write back the stale copy.
      const stale = [...items];
      setTimeout(() => { items = [...stale, title]; res.end('ok'); }, 150);
      return;
    }
    if (url.pathname !== '/') { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<input id="title"><button id="add" onclick="fetch('/add?title='+encodeURIComponent(document.querySelector('#title').value),{method:'POST'}).then(()=>document.querySelector('#status').textContent='saved')">Add</button>
<p id="status">idle</p><ul id="list"></ul><script>fetch('/items').then(r=>r.json()).then(list=>{document.querySelector('#list').innerHTML=list.map(t=>'<li>'+t.replace(/</g,'')+'</li>').join('')})</script>`);
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1'); await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server');
  origin = `http://127.0.0.1:${address.port}`;
  dir = mkdtempSync(join(tmpdir(), 'praman-many-users-'));
});
afterEach(async () => {
  lossy = false;
  const closed = once(server, 'close'); server.close(); await closed;
  rmSync(dir, { recursive: true, force: true });
});

describe('three users in real browsers', () => {
  // A repeat starts from an empty list: the managed environment restores its world; here the hook does the same.
  const hooks = { beforeRepeat: async () => { items = []; } };
  // Real browsers start together on a busy runner: wait for the input (15 s) before the 3 s fill, as a careful author would.
  const browserSteps = [steps[0], { id: 'ready', action: 'waitFor', selector: '#title', note }, ...steps.slice(1)];
  const run = (name: string, extra: object = {}) => proveChange(changeSpecSchema.parse(declaration({ afterUrl: origin, steps: browserSteps, ...extra })), join(dir, name), undefined, hooks);

  it('passes when the shared rule holds, with per-user evidence and a recorded peak concurrency', async () => {
    const result = await run('ok');
    // A timing-based failure on a loaded runner must say which user or invariant failed and why.
    expect(result.verdict, JSON.stringify({ reason: result.proof.reason, runs: result.proof.after.map(run => ({ error: run.error, peak: run.peakConcurrency,
      users: run.users?.map(row => ({ verdict: row.run.verdict, error: row.run.error, failedStep: row.run.failedStep })) })) })).toBe('passed');
    const [first] = result.proof.after;
    expect(first.users?.map(row => row.run.verdict)).toEqual(['passed', 'passed', 'passed']);
    expect(first.peakConcurrency).toBeGreaterThanOrEqual(2);
    expect(first.invariants?.map(row => [row.verdict, row.observed, row.expected])).toEqual([['passed', 3, 3]]);
    expect(first.checks.map(row => [row.id, row.verdict, row.observed])).toEqual([['own-save', 'passed', ['saved', 'saved', 'saved']], ['no-errors', 'passed', [0, 0, 0]]]);
    for (const k of [1, 2, 3]) expect(existsSync(join(dir, 'ok', 'after-1', `user-${k}`, 'result.json'))).toBe(true);
    const saved = JSON.parse(readFileSync(join(dir, 'ok', 'after-1', 'result.json'), 'utf8'));
    expect(saved.users).toHaveLength(3);
    expect(saved.peakConcurrency).toBe(first.peakConcurrency);
    // Each repeat has its own users and its own invariant reading.
    expect(result.proof.after[1].users).toHaveLength(3);
  }, 120_000);

  it('fails when an invariant is broken on purpose (lost update), though every user saw "saved"', async () => {
    lossy = true;
    const outDir = 'broken';
    const result = await run(outDir);
    expect(result.verdict).toBe('failed');
    expect(result.proof.reason).toContain('invariant');
    const [first] = result.proof.after;
    expect(first.users?.map(row => row.run.verdict)).toEqual(['passed', 'passed', 'passed']);
    expect(first.invariants?.[0]).toMatchObject({ verdict: 'failed', expected: 3 });
    expect(first.invariants?.[0]?.observed).toBeLessThan(3);
    const report = readFileSync(join(dir, outDir, 'REPORT.md'), 'utf8');
    expect(report).toContain('invariant_violation');
    expect(report).toContain('Users and invariants');
    const feedback = JSON.parse(readFileSync(join(dir, outDir, 'feedback.json'), 'utf8'));
    expect(feedback.concurrency[0]).toMatchObject({ run: 1, users: ['passed', 'passed', 'passed'] });
    expect(feedback.concurrency[0].invariants).toEqual([{ index: 0, kind: 'count', verdict: 'failed' }]);
    // No invariant id or application text in safe output.
    const shown = JSON.stringify(safeFeedbackValue(result, changeSpecSchema.parse(declaration({ afterUrl: origin }))));
    expect(shown).not.toContain('one-each');
    expect(shown).not.toContain('User 1');
  }, 120_000);

  it('is insufficient evidence when the observer cannot read the invariant', async () => {
    const result = await run('unreadable', { users: { ...users, after: [{ action: 'goto', path: '/', note }, { id: 'listed', action: 'waitFor', selector: '#absent', note }] } });
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.proof.after[0].invariants?.[0]?.verdict).toBe('insufficient_evidence');
  }, 120_000);

  it('is insufficient evidence when one user cannot finish its steps', async () => {
    const result = await run('one-bad', { steps: [...steps.slice(0, 3), { id: 'saved', action: 'waitFor', selector: '#status:text-is("{user}")', note }] });
    // User 1 ("0") ... only a user whose index text appears would pass; the others cannot finish.
    expect(result.verdict).toBe('insufficient_evidence');
    expect(result.proof.after[0].error).toMatch(/^User \d/);
  }, 120_000);
});

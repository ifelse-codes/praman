import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeSpec, CheckEvidence, InvariantEvidence, ScenarioOptions, ScenarioRun, UserRun } from '../case/change.js';
import type { Verdict } from './eval.js';
import { sameIdentity } from './identity.js';

export type ExecuteScenario = (spec: ChangeSpec, url: string, outDir: string, options?: ScenarioOptions) => Promise<ScenarioRun>;
export const invariantPrefix = '$invariant:';
const baseWaitMs = 60_000;

/** Waits until every user has arrived or has ended without arriving; a wait that lasts too long throws. */
class Barrier {
  private readonly arrived = new Set<number>();
  private readonly gone = new Set<number>();
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly total: number, private readonly limitMs: number) {}
  private release() { if (this.arrived.size + this.gone.size >= this.total) while (this.waiting.length) this.waiting.shift()!(); }
  leave(user: number) { if (!this.arrived.has(user)) { this.gone.add(user); this.release(); } }
  async arrive(user: number): Promise<void> {
    this.arrived.add(user);
    const complete = new Promise<void>(resolve => this.waiting.push(resolve));
    this.release();
    const timer = new AbortController();
    const expired = delay(this.limitMs, undefined, { signal: timer.signal }).then(() => { throw new Error(`Waited more than ${Math.round(this.limitMs / 1000)} s for the other users.`); }, () => undefined);
    try { await Promise.race([complete, expired]); } finally { timer.abort(); }
  }
}

/** One user's copy of the declaration: `{user}` is the zero-based index, `{user1}` the one-based index. */
export function userSpec(spec: ChangeSpec, user: number): ChangeSpec {
  const text = JSON.stringify(spec).replaceAll('{user1}', String(user + 1)).replaceAll('{user}', String(user));
  const copy = JSON.parse(text) as ChangeSpec;
  const declared = copy.users!;
  delete copy.users;
  if (user !== 0 || !declared.after) return copy;
  // The first user is also the observer: after every user ended it runs the observer steps, then reads the invariants.
  const steps = [...copy.steps, ...declared.after];
  const checks = (declared.invariants ?? []).map(invariant => {
    const { id, ...rest } = invariant;
    const equals = 'equals' in rest && typeof rest.equals === 'object' && rest.equals !== null
      ? (rest.equals as { perUser: number; plus?: number }).perUser * declared.count + ((rest.equals as { plus?: number }).plus ?? 0) : undefined;
    return { ...rest, ...(equals === undefined ? {} : { equals }), id: `${invariantPrefix}${id}`, afterStep: steps.length - 1 };
  }) as ChangeSpec['checks'];
  return { ...copy, steps, checks: [...copy.checks, ...checks] };
}

function verdictOf(checks: CheckEvidence[]): Verdict {
  return checks.some(check => check.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
    : checks.some(check => check.verdict === 'failed') ? 'failed' : checks.length ? 'passed' : 'not_executed';
}

/** The largest number of intervals that overlap at one moment. */
export function peakOverlap(intervals: Array<{ startedAt?: number; endedAt: number }>): number {
  const events = intervals.filter((row): row is { startedAt: number; endedAt: number } => row.startedAt !== undefined)
    .flatMap(row => [[row.startedAt, 1], [row.endedAt, -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0, peak = 0;
  for (const [, change] of events) { current += change; peak = Math.max(peak, current); }
  return peak;
}

/** Runs one repeat as N users at once and combines their evidence into one run (see the many-users spec). */
export async function executeUsers(spec: ChangeSpec, url: string, outDir: string, execute: ExecuteScenario, options: ScenarioOptions = {}): Promise<ScenarioRun> {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const declared = spec.users!;
  const count = declared.count;
  const stagger = declared.staggerMs ?? 0;
  const limit = baseWaitMs + stagger * (count - 1);
  const sync = declared.syncAtStep === undefined ? undefined : new Barrier(count, limit);
  const settled = Array.from({ length: count }, () => { let done!: () => void; const promise = new Promise<void>(resolve => { done = resolve; }); return { promise, done }; });
  const others = async () => {
    const timer = new AbortController();
    const expired = delay(limit, undefined, { signal: timer.signal }).then(() => false, () => true);
    try { if (!await Promise.race([Promise.all(settled.slice(1).map(row => row.promise)).then(() => true), expired])) throw new Error(`Waited more than ${Math.round(limit / 1000)} s for the other users to end.`); }
    finally { timer.abort(); }
  };
  const stepsBeforeObserver = spec.steps.length;
  const users: UserRun[] = await Promise.all(Array.from({ length: count }, async (_, user): Promise<UserRun> => {
    let startedAt: number | undefined;
    let run: ScenarioRun;
    try {
      if (stagger && user) await delay(stagger * user);
      run = await execute(userSpec(spec, user), url, join(outDir, `user-${user + 1}`), {
        ...options,
        beforeStep: async (_page, _step, index) => {
          startedAt ??= Date.now();
          if (sync && index === declared.syncAtStep) await sync.arrive(user);
          if (user === 0 && declared.after && index === stepsBeforeObserver) await others();
        },
      });
    } catch (error) {
      run = { url, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: error instanceof Error ? error.message : String(error) };
    } finally {
      sync?.leave(user);
      settled[user]!.done();
    }
    return { user, ...(startedAt === undefined ? {} : { startedAt }), endedAt: Date.now(), run };
  }));

  // The observer's invariant rows leave the first user's own checks; its verdict then covers only the declared checks.
  const first = users[0]!.run;
  const observed = first.checks.filter(check => check.id.startsWith(invariantPrefix));
  first.checks = first.checks.filter(check => !check.id.startsWith(invariantPrefix));
  if (!first.error) first.verdict = verdictOf(first.checks);
  const invariants: InvariantEvidence[] = (declared.invariants ?? []).map(invariant => {
    const row = observed.find(check => check.id === `${invariantPrefix}${invariant.id}`);
    return row ? { id: invariant.id, kind: invariant.kind, verdict: row.verdict, expected: row.expected, ...(Object.hasOwn(row, 'observed') ? { observed: row.observed } : {}),
      evidence: row.evidence, ...(row.screenshot ? { screenshot: row.screenshot } : {}) }
      : { id: invariant.id, kind: invariant.kind, verdict: 'insufficient_evidence', expected: 'equals' in invariant ? invariant.equals : undefined,
        evidence: 'Not observed: the first user did not reach the observer steps.' };
  });

  const runs = users.map(row => row.run);
  const peakConcurrency = peakOverlap(users);
  const merged: CheckEvidence[] = [];
  for (const check of spec.checks) {
    const rows = runs.map(run => run.checks.find(row => row.id === check.id));
    if (rows.some(row => row === undefined)) continue;
    const present = rows as CheckEvidence[];
    const worst = present.find(row => row.verdict === 'insufficient_evidence') ?? present.find(row => row.verdict === 'failed') ?? present[0]!;
    merged.push({ id: check.id, verdict: verdictOf(present), expected: present[0]!.expected, observed: present.map(row => row.observed),
      evidence: present.map((row, user) => `user ${user + 1}: ${row.evidence}`).join(' | '), ...(worst.screenshot ? { screenshot: worst.screenshot } : {}),
      ...(present[0]!.afterStep === undefined ? {} : { afterStep: present[0]!.afterStep }),
      ...(present[0]!.afterStepId ? { afterStepId: present[0]!.afterStepId } : {}) });
  }
  const broken = users.find(row => row.run.error);
  const concurrent = peakConcurrency >= 2;
  const verdict: Verdict = broken || !concurrent || runs.some(run => run.verdict === 'insufficient_evidence' || run.verdict === 'not_executed') || invariants.some(row => row.verdict === 'insufficient_evidence' || row.verdict === 'not_executed')
    ? 'insufficient_evidence'
    : runs.some(run => run.verdict === 'failed') || invariants.some(row => row.verdict === 'failed') ? 'failed' : 'passed';
  const differing = runs.find(run => !sameIdentity(run.identityBefore, run.identityAfter) || !sameIdentity(runs[0]!.identityBefore, run.identityBefore));
  const result: ScenarioRun = { url, verdict, checks: merged, screenshots: runs.flatMap(run => run.screenshots), users, invariants, peakConcurrency,
    completedSteps: Math.min(...runs.map(run => run.completedSteps ?? 0)),
    ...(broken ? { error: `User ${broken.user + 1}: ${broken.run.error}`, ...(broken.run.failedStep === undefined ? {} : { failedStep: broken.run.failedStep }) }
      : !concurrent ? { error: `The users did not run at the same time (peak concurrency ${peakConcurrency}).` } : {}),
    ...(runs[0]!.identityBefore ? { identityBefore: runs[0]!.identityBefore } : {}),
    ...(runs[0]!.identityAfter ? { identityAfter: differing?.identityAfter ?? runs[0]!.identityAfter } : {}) };
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  return result;
}

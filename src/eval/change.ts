import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type JSHandle, type Page, type Request } from 'playwright';
import { changeSpecSchema, type ChangeSpec, type ChangeProof, type ScenarioRun, type ScenarioOptions, type CheckEvidence, type OutsideRunEvidence } from '../case/change.js';
import type { Verdict } from './eval.js';
import { z } from 'zod';
import { saveFeedback, type FeedbackContext } from '../review/feedback.js';
import { executeUsers } from './users.js';
import { guardNavigation, leftOriginMessage } from './navigationGuard.js';
import { captureIdentity, identityComplete, identityScope, sameIdentity } from './identity.js';

const imageObservation = z.object({ src: z.string().nullable(), currentSrc: z.string(), complete: z.boolean(), width: z.number(), height: z.number() });

export function hashSpec(spec: ChangeSpec): string {
  return createHash('sha256').update(JSON.stringify(changeSpecSchema.parse(spec))).digest('hex');
}

/** Include actual runner/browser files and authored local scenario inputs, never inferred imports. */
export function captureScenarioIdentity(spec: ChangeSpec) {
  return captureIdentity({
    files: [...(spec.identity?.files ?? []), ...spec.steps.filter(step => step.action === 'upload').map(step => ({ role: 'input' as const, path: step.path })), ...(spec.diffPath ? [{ role: 'input' as const, path: spec.diffPath }] : [])],
    tools: spec.identity?.tools ?? [],
  }, { cwd: process.cwd(), browser: chromium.executablePath(), harness: import.meta.url });
}
export function assessProof(spec: ChangeSpec, before: ScenarioRun | undefined, after: ScenarioRun[]): { verdict: Verdict; reason: string } {
  const declared = new Set(spec.checks.map(check => check.id));
  // A many-users repeat is judged user by user: every user run needs the evidence a single run needs.
  const userRuns = (run: ScenarioRun) => run.users ? run.users.map(row => row.run) : [run];
  const runs = [...(before ? [before] : []), ...after.flatMap(userRuns)];
  const users = spec.users;
  if (users && after.some(run => run.users?.length !== users.count || run.users.some((row, index) => row.user !== index) || (run.peakConcurrency ?? 0) < 2
    || run.invariants?.length !== (users.invariants?.length ?? 0)
    || run.invariants.some(row => !['passed', 'failed'].includes(row.verdict) || !Object.hasOwn(row, 'observed') || !row.screenshot || !existsSync(row.screenshot)))) {
    return { verdict: 'insufficient_evidence', reason: 'A user did not run, the users did not run at the same time, or an invariant was not observed.' };
  }
  if (!declared.size || after.length !== spec.repeats || (spec.mode === 'acceptance' ? before !== undefined : !before || before.url !== spec.beforeUrl) || after.some(run => run.url !== spec.afterUrl)) {
    return { verdict: 'insufficient_evidence', reason: 'Missing acceptance checks, version evidence, or repeated current-version runs.' };
  }
  // Recorded outside calls are judged per run (all users of a run share one recorder); a many-users run's own error is read here too.
  const outsideBroken = [...(before ? [before] : []), ...after].find(run => (run.outside && !run.outside.ok) || (run.users && run.error));
  if (outsideBroken) {
    return { verdict: 'insufficient_evidence', reason: outsideBroken.outside?.reason ?? 'An outside call was refused or not recorded, the outside-call journal was unavailable, or a user did not run.' };
  }
  for (const run of runs) {
    if (!sameIdentity(run.identityBefore, run.identityAfter) || !sameIdentity(runs[0]?.identityBefore, run.identityBefore)) {
      return { verdict: 'insufficient_evidence', reason: 'Declared browser execution identity is unavailable or changed between verification boundaries.' };
    }
    if (run.error || run.checks.length !== declared.size || new Set(run.checks.map(check => check.id)).size !== declared.size
      || run.checks.some(check => !declared.has(check.id) || !['passed', 'failed'].includes(check.verdict)
        || !check.screenshot || !existsSync(check.screenshot) || !Object.hasOwn(check, 'observed')) || !['passed', 'failed'].includes(run.verdict)) {
      return { verdict: 'insufficient_evidence', reason: 'An action/check was unavailable, unexecuted, or lacks observed evidence.' };
    }
  }
  if (after.some(run => run.verdict !== 'passed' || userRuns(run).some(row => row.verdict !== 'passed' || row.checks.some(check => check.verdict !== 'passed')) || run.invariants?.some(row => row.verdict !== 'passed'))) {
    return { verdict: 'failed', reason: users && after.some(run => run.invariants?.some(row => row.verdict !== 'passed')) ? 'The current version breaks a declared invariant or requirement under concurrent users.' : 'The current version fails a declared requirement.' };
  }
  if (spec.mode === 'acceptance') return { verdict: 'passed', reason: users
    ? `Declared current requirements and ${users.invariants?.length ?? 0} invariants passed for ${users.count} concurrent users in ${spec.repeats} isolated runs. No baseline or repair claim.`
    : `Declared current requirements passed in ${spec.repeats} isolated runs. No baseline or repair claim.` };
  if (spec.mode === 'comparison') return { verdict: 'passed', reason: `Complete ${spec.baselineKind} baseline comparison; repeated current requirements passed. Baseline need not fail; no historical repair claim.` };
  if (!before || spec.baselineKind !== 'historical') return { verdict: 'insufficient_evidence', reason: 'Repair requires a caller-declared historical baseline.' };
  const regression = before.checks.find(check => check.id === spec.regressionCheck);
  if (regression?.verdict !== 'failed') return { verdict: 'insufficient_evidence', reason: 'The named regression was not reproduced on the previous version.' };
  if (before.checks.some(check => check.id !== spec.regressionCheck && check.verdict !== 'passed')) {
    return { verdict: 'insufficient_evidence', reason: 'Previous-version evidence contains failures beyond the named regression.' };
  }
  return { verdict: 'passed', reason: `Previous regression reproduced; all declared checks passed in ${spec.repeats} isolated current-version runs. Recording may now begin.` };
}

type Step = ChangeSpec['steps'][number];

/** Non-strict on purpose: counting is the requirement. The message keeps the classifier's timeout shape. */
async function waitForCount(page: Page, selector: string, expected: number, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  let observed = await page.locator(selector).count();
  while (observed !== expected) {
    if (Date.now() >= until) throw new Error(`locator.waitFor: Timeout ${timeoutMs}ms exceeded.\nwaiting for locator count ${expected}; last count ${observed}`);
    await page.waitForTimeout(50);
    observed = await page.locator(selector).count();
  }
}

/** Browser-side shape of a scroll container; the project compiles without DOM types. */
interface Scrollable {
  scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number; scrollLeft: number;
  scrollTo(options: { left: number; top: number; behavior: string }): void;
  scrollBy(options: { left: number; top: number; behavior: string }): void;
}

/** Programmatic, instant scroll of one strict container or the document; fires scroll events, not wheel events. */
async function scrollStep(page: Page, step: Extract<Step, { action: 'scroll' }>) {
  const scroll = (element: Scrollable, to: 'top' | 'bottom' | { x: number; y: number }) => {
    if (element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth) throw new Error('Scroll target is not scrollable');
    const behavior = 'instant';
    if (to === 'top') element.scrollTo({ left: element.scrollLeft, top: 0, behavior });
    else if (to === 'bottom') element.scrollTo({ left: element.scrollLeft, top: element.scrollHeight, behavior });
    else element.scrollBy({ left: to.x, top: to.y, behavior });
  };
  if (step.selector === 'window') {
    const root = await page.evaluateHandle('document.scrollingElement || document.documentElement') as unknown as JSHandle<Scrollable>;
    try { await root.evaluate(scroll, step.to); } finally { await root.dispose(); }
  } else await page.locator(step.selector).evaluate(scroll, step.to);
  // Let scroll listeners run before the next step or check observes the page.
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

/** Real pointer down, ten-step move and up, from the source centre to the target centre or by an offset. */
async function dragStep(page: Page, step: Extract<Step, { action: 'drag' }>) {
  const source = page.locator(step.from);
  await source.scrollIntoViewIfNeeded();
  const box = await source.boundingBox();
  if (!box) throw new Error('Drag source has no visible box');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let end = typeof step.to === 'string' ? undefined : { x: start.x + step.to.dx, y: start.y + step.to.dy };
  if (typeof step.to === 'string') {
    const target = await page.locator(step.to).boundingBox();
    if (!target) throw new Error('Drag target has no visible box');
    end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end!.x, end!.y, { steps: 10 });
  await page.mouse.up();
}

export async function executeScenario(spec: ChangeSpec, url: string, outDir: string, options: ScenarioOptions = {}): Promise<ScenarioRun> {
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const identityBefore = captureScenarioIdentity(spec);
  const result: ScenarioRun = { url, verdict: 'not_executed', checks: [], screenshots: [], completedSteps: 0, identityBefore };
  let browser: Browser | undefined;
  try {
    if (spec.faults?.length && !options.faultWindows) throw new Error('Fault windows need a managed environment verify that declares these faults; nothing was run.');
    if (!identityComplete(identityBefore) || options.expectedIdentity && !sameIdentity(options.expectedIdentity, identityBefore)) throw new Error('Declared browser execution identity is unavailable or changed before replay.');
    // Explicit launch selects the binary whose bytes are recorded, not Playwright's implicit headless-shell choice.
    browser = await chromium.launch({ headless: true, executablePath: identityBefore.entries.find(entry => entry.role === 'browser')!.path! });
    const origin = new URL(url).origin;
    // Installed before any page exists, so a page, a new tab or a redirect hop cannot leave the origin unseen.
    const guard = await guardNavigation(browser, origin);
    if (options.storageState) result.initialStorageState = { path: resolve(options.storageState), sha256: createHash('sha256').update(readFileSync(options.storageState)).digest('hex') };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: spec.checks.some(check => check.kind === 'network') ? 'block' : 'allow',
      ...(options.storageState ? { storageState: options.storageState } : {}),
      ...(options.record ? { recordVideo: { dir: outDir, size: { width: 1280, height: 720 } } } : {}) });
    if (options.record) result.recordingStartedAt = Date.now();
    const page = await ctx.newPage();
    await guard.attach(page);
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    type NetworkRow = { url: string; method: string; resource: string; started: number; status?: number; statusAt?: number; error?: string; failedAt?: number; body?: string };
    const network: NetworkRow[] = [];
    const requests = new Map<Request, NetworkRow>();
    const windows = new Map<string, { start: number; end?: number }>();
    let overflow = false;
    const responseBodies: Promise<void>[] = [];
    ctx.on('request', request => {
      if (network.length >= 10000) { overflow = true; return; }
      const row: NetworkRow = { url: request.url(), method: request.method(), resource: request.resourceType(), started: performance.now() };
      network.push(row);
      requests.set(request, row);
    });
    ctx.on('response', response => {
      const row = requests.get(response.request());
      if (!row) return;
      row.status = response.status();
      row.statusAt = performance.now();
      if (!response.ok() && new URL(response.url()).pathname === '/_next/image') {
        responseBodies.push(response.text().then(body => { row.body = body.slice(0, 2048); }, error => { row.body = `Unavailable: ${error}`; }));
      }
    });
    ctx.on('requestfailed', request => {
      const row = requests.get(request);
      if (row) { row.error = request.failure()?.errorText; row.failedAt = performance.now(); }
    });
    async function runChecks(checks: ChangeSpec['checks']) {
      for (const check of checks) {
        const expected = check.kind === 'visible' && options.version === 'before' && check.beforeEquals !== undefined ? check.beforeEquals : check.equals;
        const row: CheckEvidence = { id: check.id, verdict: 'not_executed', expected, evidence: '', ...(check.afterStep === undefined ? {} : { afterStep: check.afterStep }) };
        try {
          if (check.kind === 'network') {
            row.afterStep = check.window.throughStep;
            const window = windows.get(check.id);
            if (!window || window.end === undefined || overflow || page.isClosed()) throw new Error('Network observation window unavailable or capture exceeded 10000 requests.');
            const pattern = new RegExp(check.match.urlPattern);
            const candidates = network.filter(request => request.started >= window.start && request.started <= window.end!
              && pattern.test(request.url) && (check.match.method === undefined || request.method === check.match.method));
            const known = (request: NetworkRow) => request.statusAt !== undefined && request.statusAt <= window.end!;
            const matched = candidates.filter(request => check.match.status === undefined || known(request) && request.status === check.match.status);
            row.evidence = JSON.stringify({ window, match: check.match, requests: candidates.map(request => ({
              url: request.url, method: request.method, started: request.started,
              ...(known(request) ? { status: request.status } : {}),
              ...(request.failedAt !== undefined && request.failedAt <= window.end! ? { error: request.error } : {}),
            })) });
            if (check.match.status !== undefined && candidates.some(request => !known(request) && !(request.failedAt !== undefined && request.failedAt <= window.end!))) throw new Error(`Status unavailable at observation deadline; ${row.evidence}`);
            row.observed = matched.length;
          } else if (check.kind === 'pageErrors') {
            row.observed = errors.length;
          } else if (check.kind === 'json') {
            const target = new URL(check.path, url);
            if (target.origin !== origin) throw new Error('JSON check left the app origin');
            const response = await ctx.request.get(target.href, { timeout: 5000, maxRedirects: 0 });
            if (!response.ok()) throw new Error(`JSON endpoint returned HTTP ${response.status()}`);
            let value: unknown = await response.json();
            for (const part of check.field) {
              if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error(`Missing JSON field ${check.field.join('.')}`);
              value = Reflect.get(value, part);
            }
            row.observed = value;
          } else {
            const locator = page.locator(check.selector);
            if (check.kind === 'visible') {
              const until = Date.now() + 1500;
              do {
                row.observed = await locator.isVisible();
                if (row.observed === expected || Date.now() >= until) break;
                await page.waitForTimeout(50);
              } while (true);
            } else if (check.kind === 'count') {
              // Counts all matches on purpose (no strict mode); retries briefly for asynchronous rendering.
              const until = Date.now() + 1500;
              do {
                row.observed = await locator.count();
                if (row.observed === expected || Date.now() >= until) break;
                await page.waitForTimeout(50);
              } while (true);
            } else if (check.kind === 'image') {
              await locator.waitFor({ state: 'visible', timeout: 5000 });
              const until = Date.now() + 5000;
              let image;
              do {
                image = imageObservation.parse(await locator.evaluate(element => {
                  if (element.tagName !== 'IMG') throw new Error('Image check requires an actual img element');
                  return { src: element.getAttribute('src'), currentSrc: element.currentSrc, complete: element.complete, width: element.naturalWidth, height: element.naturalHeight };
                }));
                row.observed = image.complete && image.width > 0 && image.height > 0;
                if (row.observed || image.complete || Date.now() >= until) break;
                await page.waitForTimeout(100);
              } while (true);
              row.evidence = JSON.stringify(image);
            }
            else {
              await locator.waitFor({ state: 'attached', timeout: 1500 });
              // Wait for asynchronous UI updates, but retain an actual mismatch on the old version.
              const until = Date.now() + 1500;
              do {
                if (check.kind === 'attribute') row.observed = await locator.getAttribute(check.name);
                else if (check.kind === 'class') row.observed = await locator.evaluate((element, token) => element.classList.contains(token), check.token);
                else if (check.kind === 'state') row.observed = check.state === 'hidden' ? await locator.isHidden()
                  : check.state === 'enabled' ? await locator.isEnabled() : await locator.isChecked();
                else row.observed = check.kind === 'value' ? await locator.inputValue() : await locator.innerText();
                if (row.observed === check.equals || Date.now() >= until) break;
                await page.waitForTimeout(50);
              } while (true);
            }
          }
          row.verdict = row.observed === expected ? 'passed' : 'failed';
          row.evidence = `Expected ${JSON.stringify(expected)}; observed ${JSON.stringify(row.observed)}; ${row.evidence}`
            + (check.kind === 'pageErrors' ? `; runtime errors: ${JSON.stringify(errors)}` : '');
        } catch (error) {
          row.verdict = 'insufficient_evidence';
          row.evidence = error instanceof Error ? error.message : String(error);
        }
        const screenshot = join(outDir, `check-${result.checks.length + 1}.png`);
        await page.screenshot({ path: screenshot, animations: 'disabled' });
        row.screenshot = screenshot;
        const checkpointId = row.afterStep === undefined ? undefined : spec.steps[row.afterStep]?.id;
        if (checkpointId) row.afterStepId = checkpointId;
        result.screenshots.push(screenshot);
        result.checks.push(row);
      }
    }
    try {
      // A navigation the guard stopped ends the run as not proven: the scenario could not continue as a user would.
      const stayedOnOrigin = () => { if (guard.stopped.length) throw new Error(leftOriginMessage(guard.stopped)); };
      const initial = await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      if (!initial?.ok()) throw new Error(`App navigation returned ${initial?.status() ?? 'no response'}`);
      stayedOnOrigin();
      for (const [i, step] of spec.steps.entries()) {
        result.failedStep = i;
        if (step.id) result.failedStepId = step.id; else delete result.failedStepId;
        await options.beforeStep?.(page, step, i);
        for (const check of spec.checks) if (check.kind === 'network' && check.window.fromStep === i) windows.set(check.id, { start: performance.now() });
        if (step.action === 'goto') {
          const next = new URL(step.path, url);
          if (next.origin !== origin) throw new Error('Workflow navigation left the app origin');
          const response = await page.goto(next.href, { waitUntil: 'networkidle', timeout: 10000 });
          if (!response?.ok()) throw new Error(`Step ${i + 1} navigation failed`);
        } else if (step.action === 'waitForURL') {
          await page.waitForURL(new URL(step.path, url).href, { timeout: 15_000 });
        } else if (step.action === 'drag') {
          await dragStep(page, step);
        } else if (step.action === 'scroll') {
          await scrollStep(page, step);
        } else {
          const locator = page.locator(step.selector);
          if (step.action === 'click') await locator.click();
          else if (step.action === 'dblclick') await locator.dblclick();
          else if (step.action === 'hover') await locator.hover();
          else if (step.action === 'fill') await locator.fill(step.value);
          else if (step.action === 'type') {
            // The 3 s action limit covers finding the element; typing itself gets time for every key on top.
            const delay = step.delayMs ?? 0;
            await locator.pressSequentially(step.text, { delay, timeout: 3000 + step.text.length * (delay + 50) });
          }
          else if (step.action === 'selectOption') {
            const chosen = await locator.selectOption(step.value !== undefined ? { value: step.value } : { label: step.label! });
            if (!chosen.length) throw new Error('selectOption selected no option');
          }
          else if (step.action === 'upload') {
            await locator.setInputFiles(step.path);
            if (step.completionSelector) await page.locator(step.completionSelector).waitFor({ state: 'visible', timeout: 15_000 });
          }
          else if (step.action === 'waitFor') {
            if (step.count !== undefined) await waitForCount(page, step.selector, step.count, 15_000);
            else await locator.waitFor({ state: step.state ?? 'visible', timeout: 15_000 });
          }
          else await locator.press(step.key);
        }
        stayedOnOrigin();
        const actionEnded = performance.now();
        const closing = spec.checks.filter(check => check.kind === 'network' && check.window.throughStep === i);
        for (const check of closing) if (check.kind === 'network') windows.get(check.id)!.end = actionEnded + check.window.settleMs;
        const settleMs = Math.max(0, ...closing.map(check => check.kind === 'network' ? check.window.settleMs : 0));
        if (settleMs) await delay(settleMs);
        await runChecks(spec.checks.filter(check => check.kind === 'network' ? check.window.throughStep === i : check.afterStep === i));
        await options.afterStep?.(page, step, i);
        result.completedSteps = i + 1;
        delete result.failedStep;
        delete result.failedStepId;
      }
      await runChecks(spec.checks.filter(check => check.kind !== 'network' && check.afterStep === undefined));
      stayedOnOrigin();
      if (errors.length && !spec.checks.some(check => check.kind === 'pageErrors')) throw new Error(`Unasserted app runtime errors: ${errors.join('; ')}`);
      result.verdict = result.checks.some(check => check.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
        : result.checks.some(check => check.verdict === 'failed') ? 'failed' : result.checks.length ? 'passed' : 'not_executed';
      const errorCount = errors.length;
      await options.afterChecks?.(page, result.checks);
      if (errors.length !== errorCount) throw new Error(`Additional runtime errors during recording: ${errors.slice(errorCount).join('; ')}`);
      stayedOnOrigin();
    } catch (error) {
      result.verdict = 'insufficient_evidence';
      // A step that then timed out on the browser's error page was stopped by the guard, not by the app.
      result.error = guard.stopped.length ? leftOriginMessage(guard.stopped) : error instanceof Error ? error.message : String(error);
    }
    const videoHandle = page.video();
    if (options.record) result.recordingEndedAt = Date.now();
    await Promise.all(responseBodies);
    writeFileSync(join(outDir, 'network.json'), JSON.stringify(network, null, 2), { mode: 0o600 });
    await ctx.close();
    if (videoHandle) result.video = await videoHandle.path();
  } catch (error) {
    result.verdict = 'insufficient_evidence';
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close();
    result.identityAfter = captureScenarioIdentity(spec);
    if (!sameIdentity(identityBefore, result.identityAfter)) {
      result.verdict = 'insufficient_evidence';
      result.error ??= 'Declared browser execution identity changed or became unavailable during execution.';
    }
  }
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  return result;
}

/** Optional steps a managed environment runs around the proof; they are not part of the declaration. */
export interface ProofHooks {
  beforeRepeat?: (index: number) => Promise<void>;
  /** Applies and removes the scenario's named fault windows; each call observes its effect or throws. */
  faults?: { apply: (name: string) => Promise<unknown>; remove: (name: string) => Promise<unknown>; clear: () => Promise<unknown> };
  /** Brackets every run with the environment's outside-call recorder or replay: clear its journal, then judge the run's calls. */
  outside?: { begin: () => Promise<void>; end: (directory: string) => Promise<OutsideRunEvidence> };
}

export async function proveChange(input: ChangeSpec, outDir: string, context?: FeedbackContext, hooks: ProofHooks = {}) {
  const spec = changeSpecSchema.parse(input);
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  if (existsSync(join(outDir, 'scenario.json')) || existsSync(join(outDir, 'proof.json'))) throw new Error('Proof output directory already contains a run; choose a fresh directory.');
  writeFileSync(join(outDir, 'scenario.json'), JSON.stringify(spec, null, 2), { mode: 0o600 });
  async function run(url: string, directory: string, version: 'before' | 'current'): Promise<ScenarioRun> {
    const windows = spec.faults ?? [];
    const faults = hooks.faults;
    if (windows.length && !faults) {
      return { url, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: 'Fault windows need a managed environment verify that declares these faults; nothing was run.' };
    }
    const evidence: Array<Record<string, unknown>> = [];
    const step = async (index: number, edge: 'fromStep' | 'throughStep') => {
      for (const window of windows.filter(row => row[edge] === index)) {
        const row = edge === 'fromStep' ? { name: window.name, fromStep: window.fromStep, throughStep: window.throughStep } as Record<string, unknown> : evidence.at(-1)!;
        if (edge === 'fromStep') evidence.push(row);
        try { row[edge === 'fromStep' ? 'applied' : 'removed'] = await (edge === 'fromStep' ? faults!.apply(window.name) : faults!.remove(window.name)); }
        catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
      }
    };
    const options: ScenarioOptions = windows.length ? { version, faultWindows: true,
      beforeStep: async (_page, _step, index) => step(index, 'fromStep'), afterStep: async (_page, _step, index) => step(index, 'throughStep') } : { version };
    let result: ScenarioRun;
    let outsideError: string | undefined;
    try { await hooks.outside?.begin(); } catch (error) { outsideError = `Outside-call journal unavailable before the run: ${error instanceof Error ? error.message : String(error)}`; }
    if (outsideError) {
      result = { url, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: outsideError };
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
      return result;
    }
    try { result = spec.users ? await executeUsers(spec, url, directory, executeScenario, options) : await executeScenario(spec, url, directory, options); }
    catch (error) {
      result = { url, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: error instanceof Error ? error.message : String(error) };
    }
    if (windows.length) {
      // A fault left active by a failed step is removed before anything else runs.
      try { const cleared = await faults!.clear(); if (cleared) evidence.push({ clearedAfterRun: cleared }); }
      catch (error) { result.verdict = 'insufficient_evidence'; result.error = `${result.error ? `${result.error}; ` : ''}Fault cleanup failed: ${error instanceof Error ? error.message : String(error)}`; }
      result.faults = evidence;
      writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    }
    if (hooks.outside) {
      // An outside call that was refused, or a run whose calls did not go through the recorder, is never a pass.
      try { result.outside = await hooks.outside.end(directory); }
      catch (error) { result.outside = undefined; outsideError = `Outside-call journal unavailable after the run: ${error instanceof Error ? error.message : String(error)}`; }
      const reason = outsideError ?? (result.outside && !result.outside.ok ? result.outside.reason : undefined);
      if (reason) { result.verdict = 'insufficient_evidence'; result.error = `${result.error ? `${result.error}; ` : ''}${reason}`; }
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    }
    return result;
  }
  const before = spec.mode === 'acceptance' ? undefined : await run(spec.beforeUrl!, join(outDir, 'before'), 'before');
  const after: ScenarioRun[] = [];
  for (let i = 0; i < spec.repeats; i++) {
    try { await hooks.beforeRepeat?.(i); }
    catch (error) {
      // A repeat that did not get its fresh starting state is never counted as a pass.
      after.push({ url: spec.afterUrl, verdict: 'insufficient_evidence', checks: [], screenshots: [], error: `Fresh starting state unavailable: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    after.push(await run(spec.afterUrl, join(outDir, `after-${i + 1}`), 'current'));
  }
  const proof: ChangeProof = { mode: spec.mode, baselineKind: spec.baselineKind, specHash: hashSpec(spec), verifiedAt: new Date().toISOString(),
    scope: `Only the declared scenario and requirements; not whole-application correctness. URLs identify targets, not source/build provenance. Baseline kind is caller-declared, not independently authenticated history. ${identityScope}`,
    ...assessProof(spec, before, after), ...(before ? { before } : {}), after };
  writeFileSync(join(outDir, 'proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
  return { verdict: proof.verdict, proof, ...saveFeedback(spec, proof, outDir, context) };
}

import { z } from 'zod';
import type { Page } from 'playwright';
import type { Verdict } from '../eval/eval.js';
import { identityDeclarationSchema, type IdentitySnapshot } from '../eval/identity.js';
import { sceneFramingSchema } from './framing.js';
import { shortCompositionSchema, validateShortComposition } from './composition.js';

const selector = z.string().min(1);
const note = z.string().min(1);
/** Optional step name, unique per scenario; checks and stories may reference it instead of an index. */
const stepIdPattern = /^[A-Za-z0-9_-]+$/;
const stepId = z.string().regex(stepIdPattern, 'Step ids use letters, digits, "-" and "_"').optional();
/** A zero-based step index or a step id; ids resolve to indexes when the declaration is parsed. */
const stepRef = z.union([z.number().int().nonnegative(), z.string().regex(stepIdPattern, 'Step references are an index or a step id')]);
const stepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), id: stepId, path: z.string().startsWith('/'), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('waitForURL'), id: stepId, path: z.string().startsWith('/'), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('click'), id: stepId, selector: z.string().min(1), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('hover'), id: stepId, selector: z.string().min(1), note: z.string().min(1) }).strict(),
  // `state` and `count` are optional and mutually exclusive (checked below); absent means "visible".
  z.object({ action: z.literal('waitFor'), id: stepId, selector: z.string().min(1), state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional(),
    count: z.number().int().nonnegative().optional(), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('fill'), id: stepId, selector: z.string().min(1), value: z.string(), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('press'), id: stepId, selector: z.string().min(1), key: z.string().min(1), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('upload'), id: stepId, selector: z.string().min(1), path: z.string().min(1), completionSelector: z.string().min(1).optional(), note: z.string().min(1) }).strict(),
  z.object({ action: z.literal('dblclick'), id: stepId, selector, note }).strict(),
  z.object({ action: z.literal('selectOption'), id: stepId, selector, value: z.string().optional(), label: z.string().optional(), note }).strict(),
  z.object({ action: z.literal('type'), id: stepId, selector, text: z.string().min(1), delayMs: z.number().int().min(0).max(200).optional(), note }).strict(),
  z.object({ action: z.literal('scroll'), id: stepId, selector, to: z.union([z.enum(['top', 'bottom']), z.object({ x: z.number().int(), y: z.number().int() }).strict()]), note }).strict(),
  z.object({ action: z.literal('drag'), id: stepId, from: selector, to: z.union([selector, z.object({ dx: z.number().int(), dy: z.number().int() }).strict()]), note }).strict(),
]);
const checkpoint = stepRef.optional();
const urlPattern = z.string().min(1).refine(value => { try { new RegExp(value); return true; } catch { return false; } }, 'Invalid URL regular expression');
const checkSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1), kind: z.literal('text'), selector: z.string().min(1), equals: z.string(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('value'), selector: z.string().min(1), equals: z.string(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('visible'), selector: z.string().min(1), equals: z.boolean(), beforeEquals: z.boolean().optional(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('attribute'), selector: z.string().min(1), name: z.string().min(1), equals: z.string().nullable(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('class'), selector: z.string().min(1), token: z.string().min(1).regex(/^\S+$/), equals: z.boolean(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('state'), selector: z.string().min(1), state: z.enum(['hidden', 'enabled', 'checked']), equals: z.boolean(), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('json'), path: z.string().startsWith('/'), field: z.array(z.union([z.string(), z.number().int().nonnegative()])), equals: z.union([z.string(), z.number(), z.boolean(), z.null()]), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('pageErrors'), equals: z.literal(0), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('image'), selector: z.string().min(1), equals: z.literal(true), afterStep: checkpoint }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal('count'), selector: z.string().min(1), equals: z.number().int().nonnegative(), afterStep: checkpoint }).strict(),
  z.object({
    id: z.string().min(1), kind: z.literal('network'),
    match: z.object({ urlPattern, method: z.string().regex(/^[A-Z]+$/).optional(), status: z.number().int().min(100).max(599).optional() }).strict(),
    window: z.object({ fromStep: stepRef, throughStep: stepRef, settleMs: z.number().int().min(0).max(10000) }).strict(),
    equals: z.number().int().nonnegative(), afterStep: z.never().optional(),
  }).strict(),
]);
const httpUrl = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP(S) app URL');
const narrationText = z.string().min(1).refine(value => value.trim().length > 0, 'Narration must contain non-whitespace text');

const storyBeatSchema = z.object({
  step: stepRef, at: z.enum(['before', 'after']).default('after'),
  text: narrationText, selector: z.string().min(1).optional(),
  shortText: narrationText.optional(),
  framing: sceneFramingSchema.optional(),
}).strict();
const codeExcerptSchema = z.object({
  file: z.string().min(1), side: z.enum(['before', 'after']), from: z.number().int().positive(),
  to: z.number().int().positive(), label: z.string().min(1),
}).strict().refine(value => value.to >= value.from && value.to - value.from < 12, 'Choose at most twelve consecutive source lines');
const codeFocusSchema = z.object({
  file: z.string().min(1), side: z.enum(['before', 'after']),
  from: z.number().int().positive(), to: z.number().int().positive(),
}).strict().refine(value => value.to >= value.from, 'Code focus must be a consecutive source range');
export const codeStorySchema = z.object({
  title: z.string().min(1).optional(), text: narrationText, shortText: narrationText.optional(),
  excerpts: z.array(codeExcerptSchema).min(1).max(8).optional(),
  beats: z.array(z.object({ text: narrationText, shortText: narrationText.optional(), focus: codeFocusSchema.optional(), framing: sceneFramingSchema.optional() }).strict()).min(1).optional(),
}).strict();
export type CodeStory = z.infer<typeof codeStorySchema>;
const walkthroughSchema = z.object({
  startStep: stepRef,
  before: z.array(storyBeatSchema).min(1).optional(), after: z.array(storyBeatSchema).min(1),
  code: codeStorySchema.optional(),
  short: shortCompositionSchema.optional(),
}).strict();

const rawSpecSchema = z.object({
  title: z.string().min(1),
  mode: z.enum(['acceptance', 'repair', 'comparison']),
  baselineKind: z.enum(['historical', 'synthetic', 'unattested']).optional(),
  change: z.string().min(1),
  beforeUrl: httpUrl.optional(),
  afterUrl: httpUrl,
  steps: z.array(stepSchema).min(1),
  checks: z.array(checkSchema).min(1),
  regressionCheck: z.string().min(1).optional(),
  repeats: z.number().int().min(2).max(10).default(2),
  diffPath: z.string().min(1).optional(),
  walkthrough: walkthroughSchema.optional(),
  identity: identityDeclarationSchema.optional(),
  // Named faults of a managed environment, active from before `fromStep` until after the checks of `throughStep`.
  faults: z.array(z.object({ name: z.string().regex(/^[a-z][a-z0-9-]*$/), fromStep: stepRef, throughStep: stepRef }).strict()).min(1).optional(),
}).strict();

type RawSpec = z.output<typeof rawSpecSchema>;
/** Replace step-id references with indexes in the named keys, keeping optional modifiers. */
type Indexed<T, K extends PropertyKey> = T extends unknown ? { [P in keyof T]: P extends K ? Exclude<T[P], string> : T[P] } : never;
type ResolvedCheck<C> = C extends { kind: 'network'; window: infer W } ? { [P in keyof C]: P extends 'window' ? Indexed<W, 'fromStep' | 'throughStep'> : C[P] } : Indexed<C, 'afterStep'>;
type ResolvedBeats<A> = A extends Array<infer B> ? Array<Indexed<B, 'step'>> : A;
type ResolvedWalkthrough<W> = W extends undefined ? W : { [P in keyof W]: P extends 'startStep' ? number : P extends 'before' | 'after' ? ResolvedBeats<W[P]> : W[P] };
type ResolvedSpec = { [P in keyof RawSpec]: P extends 'checks' ? Array<ResolvedCheck<RawSpec['checks'][number]>>
  : P extends 'walkthrough' ? ResolvedWalkthrough<RawSpec['walkthrough']>
  : P extends 'faults' ? Array<{ name: string; fromStep: number; throughStep: number }> | undefined : RawSpec[P] };

/** Resolve step ids to indexes once, at parse time; indexes pass through unchanged and nothing is renumbered. */
function resolveStepRefs(spec: RawSpec, ctx: z.RefinementCtx): ResolvedSpec {
  const index = new Map<string, number>();
  let invalid = false;
  for (const [i, step] of spec.steps.entries()) {
    if (step.id === undefined) continue;
    if (index.has(step.id)) { invalid = true; ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: `Duplicate step id "${step.id}"; step ids must be unique` }); }
    else index.set(step.id, i);
  }
  const resolve = (value: number | string, path: Array<string | number>): number => {
    if (typeof value === 'number') return value;
    const found = index.get(value);
    if (found !== undefined) return found;
    invalid = true;
    ctx.addIssue({ code: 'custom', path, message: `${path.join('.')} refers to unknown step id "${value}"` });
    return -1;
  };
  const checks = spec.checks.map((check, i) => check.kind === 'network'
    ? { ...check, window: { ...check.window, fromStep: resolve(check.window.fromStep, ['checks', i, 'window', 'fromStep']), throughStep: resolve(check.window.throughStep, ['checks', i, 'window', 'throughStep']) } }
    : check.afterStep === undefined ? check : { ...check, afterStep: resolve(check.afterStep, ['checks', i, 'afterStep']) });
  const story = spec.walkthrough;
  const beats = (version: 'before' | 'after') => story?.[version]?.map((beat, i) => ({ ...beat, step: resolve(beat.step, ['walkthrough', version, i, 'step']) }));
  const walkthrough = story && { ...story, startStep: resolve(story.startStep, ['walkthrough', 'startStep']),
    ...(story.before ? { before: beats('before') } : {}), after: beats('after')! };
  const faults = spec.faults?.map((fault, i) => ({ ...fault, fromStep: resolve(fault.fromStep, ['faults', i, 'fromStep']), throughStep: resolve(fault.throughStep, ['faults', i, 'throughStep']) }));
  if (invalid) return z.NEVER;
  return { ...spec, checks, ...(walkthrough ? { walkthrough } : {}), ...(faults ? { faults } : {}) } as ResolvedSpec;
}

export const changeSpecSchema = rawSpecSchema.transform(resolveStepRefs).superRefine((spec, ctx) => {
  const ids = spec.checks.map(check => check.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Check ids must be unique', path: ['checks'] });
  if (spec.mode === 'acceptance') {
    if (spec.beforeUrl || spec.regressionCheck || spec.baselineKind || spec.checks.some(check => check.kind === 'visible' && check.beforeEquals !== undefined)) ctx.addIssue({ code: 'custom', message: 'Acceptance is current-only; omit baseline, regression and beforeEquals fields.' });
  } else {
    if (!spec.beforeUrl || !spec.baselineKind) ctx.addIssue({ code: 'custom', message: 'Paired modes require beforeUrl and an explicit baselineKind.' });
    if (spec.mode === 'repair' && (spec.baselineKind !== 'historical' || !spec.regressionCheck || !ids.includes(spec.regressionCheck))) ctx.addIssue({ code: 'custom', message: 'Repair requires a historical baseline and a declared regressionCheck.' });
    if (spec.mode === 'comparison' && spec.regressionCheck !== undefined) ctx.addIssue({ code: 'custom', message: 'Comparison does not claim a named regression repair; omit regressionCheck.' });
  }
  for (const [i, step] of spec.steps.entries()) {
    if ((step.action === 'goto' || step.action === 'waitForURL') && [spec.afterUrl, ...(spec.beforeUrl ? [spec.beforeUrl] : [])].some(url => new URL(step.path, url).origin !== new URL(url).origin)) ctx.addIssue({ code: 'custom', message: 'Navigation must remain on the app origin', path: ['steps', i] });
    if (step.action === 'waitFor' && step.state !== undefined && step.count !== undefined) ctx.addIssue({ code: 'custom', message: 'waitFor accepts state or count, not both', path: ['steps', i] });
    if (step.action === 'selectOption' && (step.value === undefined) === (step.label === undefined)) ctx.addIssue({ code: 'custom', message: 'selectOption requires exactly one of value or label', path: ['steps', i] });
  }
  for (const [i, check] of spec.checks.entries()) {
    if (check.kind === 'json' && [spec.afterUrl, ...(spec.beforeUrl ? [spec.beforeUrl] : [])].some(url => new URL(check.path, url).origin !== new URL(url).origin)) ctx.addIssue({ code: 'custom', message: 'JSON checks must remain on the app origin', path: ['checks', i] });
    if (check.kind === 'network' && (check.window.fromStep > check.window.throughStep || check.window.throughStep >= spec.steps.length)) ctx.addIssue({ code: 'custom', path: ['checks', i, 'window'], message: 'Network windows require ordered existing step indexes.' });
    if (check.afterStep !== undefined && (check.afterStep >= spec.steps.length || check.kind === 'pageErrors')) ctx.addIssue({ code: 'custom', path: ['checks', i, 'afterStep'], message: 'Checkpoints require an existing step; runtime errors must be checked at the end' });
  }
  for (const [i, fault] of (spec.faults ?? []).entries()) {
    const previous = spec.faults![i - 1];
    if (fault.fromStep > fault.throughStep || fault.throughStep >= spec.steps.length || (previous && fault.fromStep <= previous.throughStep)) {
      ctx.addIssue({ code: 'custom', path: ['faults', i], message: 'Fault windows need ordered existing steps and may not overlap the previous window' });
    }
  }
  if (spec.walkthrough) {
    try { validateShortComposition(spec.walkthrough, spec.mode); }
    catch (error) { ctx.addIssue({ code: 'custom', path: ['walkthrough', 'short'], message: error instanceof Error ? error.message : String(error) }); }
    if (spec.mode === 'acceptance' && (spec.walkthrough.before || spec.walkthrough.code || spec.diffPath)) ctx.addIssue({ code: 'custom', message: 'Acceptance stories show current requirements and outcomes, not baseline/fix narration.' });
    if (spec.mode !== 'acceptance' && !spec.walkthrough.before) ctx.addIssue({ code: 'custom', message: 'Paired stories require baseline beats.' });
    if (spec.mode === 'repair' && !spec.walkthrough.code) ctx.addIssue({ code: 'custom', message: 'Repair stories require a code explanation.' });
    if (spec.walkthrough.startStep >= spec.steps.length) ctx.addIssue({ code: 'custom', path: ['walkthrough', 'startStep'], message: 'Presentation must start at an existing workflow step' });
    for (const version of ['before', 'after'] as const) {
      for (const [i, beat] of (spec.walkthrough[version] ?? []).entries()) {
        if (beat.step < spec.walkthrough.startStep || beat.step >= spec.steps.length) ctx.addIssue({ code: 'custom', path: ['walkthrough', version, i, 'step'], message: 'A story beat must belong to the presented workflow' });
      }
    }
    if (spec.walkthrough.code?.excerpts && !spec.diffPath) ctx.addIssue({ code: 'custom', path: ['walkthrough', 'code'], message: 'Code excerpts require an actual supplied diff' });
    for (const [i, beat] of (spec.walkthrough.code?.beats ?? []).entries()) {
      if (beat.focus && !spec.walkthrough.code?.excerpts?.some(excerpt => excerpt.file === beat.focus!.file
        && excerpt.side === beat.focus!.side && excerpt.from <= beat.focus!.from && excerpt.to >= beat.focus!.to)) {
        ctx.addIssue({ code: 'custom', path: ['walkthrough', 'code', 'beats', i, 'focus'], message: 'Every focused code line must belong to one displayed source excerpt' });
      }
    }
  }
});

export type ChangeSpec = z.infer<typeof changeSpecSchema>;
export type WorkflowStep = ChangeSpec['steps'][number];
export interface CheckEvidence {
  id: string;
  verdict: Verdict;
  expected: unknown;
  observed?: unknown;
  evidence: string;
  screenshot?: string;
  afterStep?: number;
  /** Private: the id of the checkpoint step, when the declaration named it. */
  afterStepId?: string;
}
export interface ScenarioRun {
  url: string;
  verdict: Verdict;
  checks: CheckEvidence[];
  screenshots: string[];
  error?: string;
  failedStep?: number;
  /** Private: the id of the failed step, when the declaration named it. */
  failedStepId?: string;
  completedSteps?: number;
  video?: string;
  recordingStartedAt?: number;
  recordingEndedAt?: number;
  initialStorageState?: { path: string; sha256: string };
  identityBefore?: IdentitySnapshot;
  identityAfter?: IdentitySnapshot;
  /** Evidence of each fault window of a managed environment, in order. */
  faults?: unknown[];
}
export interface ChangeProof {
  mode: ChangeSpec['mode'];
  baselineKind?: ChangeSpec['baselineKind'];
  specHash: string;
  verifiedAt: string;
  scope: string;
  verdict: Verdict;
  reason: string;
  before?: ScenarioRun;
  after: ScenarioRun[];
}
export interface ScenarioOptions {
  record?: boolean;
  version?: 'before' | 'current';
  storageState?: string;
  expectedIdentity?: IdentitySnapshot;
  beforeStep?: (page: Page, step: WorkflowStep, index: number) => Promise<void>;
  afterStep?: (page: Page, step: WorkflowStep, index: number) => Promise<void>;
  afterChecks?: (page: Page, checks: CheckEvidence[]) => Promise<void>;
  /** Set only by a managed proof that applies the scenario's fault windows in `beforeStep`/`afterStep`. */
  faultWindows?: boolean;
}

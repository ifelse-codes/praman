import { createHash } from 'node:crypto';
import { z } from 'zod';

export const videoCutSchema = z.enum(['full', 'short']);
export type VideoCut = z.infer<typeof videoCutSchema>;
const referenceSchema = z.object({ stage: z.enum(['before', 'code', 'after']), beat: z.number().int().nonnegative() }).strict();
export const shortCompositionSchema = z.object({
  maxDurationSeconds: z.number().int().min(45).max(60).default(60),
  context: referenceSchema, baseline: referenceSchema.optional(), failure: referenceSchema.optional(),
  cause: referenceSchema.optional(), fix: referenceSchema.optional(), outcome: referenceSchema,
  attribution: referenceSchema, limits: referenceSchema,
}).strict();
type Mode = 'acceptance' | 'repair' | 'comparison';
type Reference = z.infer<typeof referenceSchema>;
interface Story {
  before?: Array<{ text: string; shortText?: string }>;
  after: Array<{ text: string; shortText?: string }>;
  code?: { text: string; shortText?: string; beats?: Array<{ text: string; shortText?: string }> };
  short?: z.infer<typeof shortCompositionSchema>;
}
const stages = ['before', 'code', 'after'] as const;
function beats(story: Story, stage: Reference['stage']) {
  return stage === 'code' ? story.code?.beats ?? (story.code ? [{ text: story.code.text, shortText: story.code.shortText }] : []) : story[stage] ?? [];
}
function roles(story: Story) {
  if (!story.short) throw new Error('Short composition requires walkthrough.short with essential story references.');
  const { maxDurationSeconds: _duration, ...references } = story.short;
  return references;
}

/** Role labels are author assertions, not automatic comprehension or historical provenance. */
export function validateShortComposition(story: Story, mode: Mode): void {
  if (!story.short) return;
  const refs = roles(story);
  for (const ref of Object.values(refs)) if (ref && !beats(story, ref.stage)[ref.beat]) throw new Error('Short composition references a missing authored beat.');
  if (refs.outcome.stage !== 'after') throw new Error('Short outcome must show the current action/result.');
  if (mode === 'repair') {
    if (refs.failure?.stage !== 'before' || refs.cause?.stage !== 'code' || refs.fix?.stage !== 'code' || refs.baseline) throw new Error('Short repair requires before failure, code cause/fix and current outcome.');
  } else {
    if (refs.failure || refs.cause || refs.fix) throw new Error('Only repair may select failure/cause/fix roles.');
    if (mode === 'comparison' && refs.baseline?.stage !== 'before') throw new Error('Short comparison requires a labeled baseline beat.');
    if (mode === 'acceptance' && (refs.baseline || Object.values(refs).some(ref => ref && ref.stage !== 'after'))) throw new Error('Short acceptance is current-only, without a baseline or repair claim.');
  }
}
function selected(story: Story, mode: Mode, cut: VideoCut): Reference[] {
  videoCutSchema.parse(cut);
  validateShortComposition(story, mode);
  const references = cut === 'short' ? Object.values(roles(story)).filter((ref): ref is Reference => Boolean(ref)) : undefined;
  return stages.flatMap(stage => beats(story, stage).flatMap((_, beat) =>
    !references || references.some(ref => ref.stage === stage && ref.beat === beat) ? [{ stage, beat }] : []));
}
export function composeWalkthrough<T extends Story>(story: T, mode: Mode, cut: VideoCut = 'full'): T {
  const refs = selected(story, mode, cut);
  if (cut === 'full') return story;
  const keep = (stage: Reference['stage']) => beats(story, stage).filter((_, beat) => refs.some(ref => ref.stage === stage && ref.beat === beat))
    .map(beat => ({ ...beat, text: beat.shortText ?? beat.text }));
  return { ...story, ...(story.before ? { before: keep('before') } : {}), after: keep('after'),
    code: story.code && refs.some(ref => ref.stage === 'code') ? { ...story.code, beats: keep('code') } : undefined } as T;
}
export function compositionManifest(story: Story, mode: Mode, cut: VideoCut = 'full') {
  return { cut, sourceStoryHash: createHash('sha256').update(JSON.stringify(story)).digest('hex'),
    selectedBeats: selected(story, mode, cut), ...(cut === 'short' ? { roles: roles(story), maxDurationSeconds: story.short!.maxDurationSeconds } : {}) };
}
export function enforceCompositionDuration(story: Story, mode: Mode, cut: VideoCut, duration: number): void {
  if (cut !== 'short') return;
  validateShortComposition(story, mode);
  if (!Number.isFinite(duration) || duration <= 0 || duration > (story.short?.maxDurationSeconds ?? 0)) throw new Error('Short composition exceeds its measured duration budget; select smaller authored beats. Speech and evidence are never accelerated or clipped.');
}

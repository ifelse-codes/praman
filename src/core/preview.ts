import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { changeSpecSchema, type ChangeSpec } from '../case/change.js';
import { loadChangeSpec } from '../case/loadChange.js';
import { preflightChangeWalkthrough } from '../report/video.js';
import { preflightCommandWalkthrough } from '../report/commandVideo.js';
import { loadCommandVideoPlan } from './commandDemonstrate.js';
import type { Diagnostic } from '../review/diagnostics.js';
import { videoCutSchema, type VideoCut } from '../case/composition.js';

const scope = 'Layout preview only, not behavior proof or permission to record. Real authored actions/commands execute and may mutate external state. No speech or movie is generated. Final delivery still requires fresh mode-specific proof and matching live replays; human review remains necessary.';
const positionSchema = z.object({
  stage: z.enum(['story', 'before', 'current', 'after', 'code']).optional(),
  beat: z.number().int().nonnegative().optional(), step: z.number().int().nonnegative().optional(),
  at: z.enum(['before', 'after']).optional(), chunk: z.number().int().nonnegative().optional(),
});
const receiptSchema = z.object({
  kind: z.literal('story-preflight'), proof: z.literal(false), status: z.enum(['passed', 'blocked']),
  position: positionSchema.optional(),
  scenes: z.array(positionSchema.extend({ screenshot: z.string().optional() })).optional(),
});

/** Only structural indexes and local evidence pointers leave the private preflight receipt. */
async function preview(outputDirectory: string, execute: (directory: string) => Promise<unknown>) {
  const outDir = path.resolve(outputDirectory);
  try {
    mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
    mkdirSync(outDir, { mode: 0o700 });
  } catch {
    throw new Error('Preview output must be a fresh writable directory; existing evidence is never adopted or overwritten.');
  }
  const directory = path.join(outDir, 'preflight'), receiptPath = path.join(directory, 'preflight.json');
  let status: 'passed' | 'blocked' = 'passed';
  try { await execute(directory); }
  catch (error) {
    status = 'blocked';
    if (!existsSync(receiptPath)) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(receiptPath, JSON.stringify({ kind: 'story-preflight', proof: false, status, error: error instanceof Error ? error.message : String(error) }, null, 2), { mode: 0o600 });
    }
  }
  const receipt = receiptSchema.parse(JSON.parse(readFileSync(receiptPath, 'utf8')));
  status = receipt.status;
  const position = receipt.position ?? {};
  const stage = position.stage === 'after' ? 'current' : position.stage;
  const diagnostics: Diagnostic[] = status === 'passed' ? [] : [{
    category: 'story_preflight',
    ...(['before', 'current', 'code'].includes(stage ?? '') ? { stage: stage as Diagnostic['stage'] } : {}),
    ...(Number.isInteger(position.beat) && position.beat! >= 0 ? { beat: position.beat } : {}),
    ...(Number.isInteger(position.step) && position.step! >= 0 ? { step: position.step } : {}),
    references: [{ path: receiptPath, private: true }],
    nextAction: 'Inspect the private preview receipt; correct the declaration, execution or framing and preview again in a fresh directory. Preview never authorizes recording.',
  }];
  const scenes = (receipt.scenes ?? []).filter(scene => scene.screenshot).map((scene, index) => ({
    index, stage: scene.stage === 'after' ? 'current' : scene.stage,
    ...(scene.beat === undefined ? {} : { beat: scene.beat }),
    ...(scene.step === undefined ? {} : { step: scene.step }),
    ...(scene.at === undefined ? {} : { at: scene.at }),
    ...(scene.chunk === undefined ? {} : { chunk: scene.chunk }),
    screenshot: scene.screenshot, private: true as const,
  }));
  const result = { kind: 'story-preflight' as const, proof: false as const, status,
    verdict: status === 'passed' ? 'passed' as const : 'insufficient_evidence' as const,
    diagnostics, receiptPath, scenes, scope };
  writeFileSync(path.join(outDir, 'feedback.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  return result;
}

export function previewChange(input: ChangeSpec | string, outputDirectory: string, cut: VideoCut = 'full') {
  videoCutSchema.parse(cut);
  return preview(outputDirectory, directory => preflightChangeWalkthrough(
    typeof input === 'string' ? loadChangeSpec(input) : changeSpecSchema.parse(input), directory, cut));
}

export function previewCommands(planPath: string, outputDirectory: string, cut: VideoCut = 'full') {
  videoCutSchema.parse(cut);
  return preview(outputDirectory, directory => {
    const { plan, spec } = loadCommandVideoPlan(planPath);
    return preflightCommandWalkthrough(plan, spec, directory, cut);
  });
}

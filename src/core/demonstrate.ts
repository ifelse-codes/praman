import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changeSpecSchema, type ChangeSpec } from '../case/change.js';
import { proveChange } from '../eval/change.js';
import { recordChangeWalkthrough } from '../report/video.js';
import { safeFeedbackValue, type FeedbackContext } from '../review/feedback.js';
import { recordingDiagnostic, formatSummary } from '../review/diagnostics.js';
import { composeWalkthrough, compositionManifest, videoCutSchema, type VideoCut } from '../case/composition.js';

export async function demonstrateChange(input: ChangeSpec, outDir: string, context?: FeedbackContext, cut: VideoCut = 'full') {
  const spec = changeSpecSchema.parse(input);
  videoCutSchema.parse(cut);
  if (cut === 'short' && !spec.walkthrough) throw new Error('Short composition requires an authored walkthrough.');
  if (spec.walkthrough) composeWalkthrough(spec.walkthrough, spec.mode, cut);
  const composition = spec.walkthrough ? compositionManifest(spec.walkthrough, spec.mode, cut) : undefined;
  const output = resolve(outDir);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (readdirSync(output).length) throw new Error('Demonstration output directory must be empty; choose a fresh directory.');
  // No demo recording occurs in proveChange: it executes checks and captures evidence only.
  const verification = await proveChange(spec, output, context);
  const { proof, report } = verification;
  let demoVideo: string | null = null;
  let recordingError: string | undefined;
  if (proof.verdict === 'passed') {
    try { demoVideo = await recordChangeWalkthrough(spec, proof, output, cut); }
    catch (error) {
      mkdirSync(join(output, 'video'), { recursive: true, mode: 0o700 });
      writeFileSync(join(output, 'video', 'delivery-failure.json'), JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2), { mode: 0o600 });
      recordingError = 'Recording blocked; inspect private recording evidence.';
    }
  }
  const verdict = recordingError ? 'insufficient_evidence' : proof.verdict;
  const diagnostics = [...verification.diagnostics, ...(recordingError ? [recordingDiagnostic(output, join(output, 'video', 'delivery-failure.json'))] : [])];
  const lines = ['', '## Demonstration delivery', '', `Outcome: ${verdict}. Acceptance proof at test time remains ${proof.verdict}.`, '',
    demoVideo ? '[Play live walkthrough](demo.mp4) · [Timed manifest](video/tour.json) · [Captions](video/captions.vtt)'
      : recordingError ? 'Recording unavailable after acceptance testing; inspect private video/delivery-failure.json and indexed evidence below. This is not a new application diagnosis.' : 'Not recorded: the acceptance proof did not authorize recording.', '',
    '[Machine-readable feedback](feedback.json) · Private raw evidence: proof.json and scenario.json.', ''];
  appendFileSync(report, lines.join('\n'));
  appendFileSync(report, `\nComposition: **${cut}** · authored story SHA-256: ${composition?.sourceStoryHash ?? 'unavailable'}. Full and short use the same scenario; each delivery requires fresh proof and matching replays.\n`);
  appendFileSync(report, '\n' + formatSummary({ verdict, diagnostics }, true) + '\n');
  return { ...verification, verdict, diagnostics, composition, demoVideo, ...safeFeedbackValue({ recordingError }, spec) };
}

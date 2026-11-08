import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { captureCommandIdentity, executeCommand, loadCommandSpec, proveCommands, type CommandSpec } from '../eval/command.js';
import { commandVideoPlanSchema, recordCommandWalkthrough, type CommandReplay } from '../report/commandVideo.js';
import { recordingDiagnostic, formatSummary } from '../review/diagnostics.js';
import { identitySnapshotSchema, identityScope, sameIdentity } from '../eval/identity.js';
import { composeWalkthrough, compositionManifest, validateShortComposition, videoCutSchema, type VideoCut } from '../case/composition.js';

const check = z.object({ id: z.string(), verdict: z.enum(['passed', 'failed', 'insufficient_evidence']), reason: z.string(), evidence: z.string() });
const run = z.object({ verdict: z.enum(['passed', 'failed', 'insufficient_evidence']), status: z.enum(['exited', 'timeout', 'unavailable']), code: z.number().nullable(), signal: z.string().nullable(), executableHash: z.string().optional(), executableHashAfter: z.string().optional(), identityBefore: identitySnapshotSchema.optional(), identityAfter: identitySnapshotSchema.optional(), startedAt: z.string(), endedAt: z.string(), checks: z.array(check), resultPath: z.string(), stdout: z.string(), stderr: z.string(), error: z.string().optional() });
const proofSchema = z.object({ mode: z.enum(['acceptance', 'repair', 'comparison']), baselineKind: z.enum(['historical', 'synthetic', 'unattested']).optional(), verdict: z.enum(['passed', 'failed', 'insufficient_evidence']), specHash: z.string(), verifiedAt: z.string(), scope: z.string(), before: run.optional(), current: z.array(run) });
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fileHash = (file: string) => hash(readFileSync(file));
function privateJson(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }

/** The replay closure executes only the exact fresh proof contract; it never accepts saved output as a replay. */
export function commandReplayGate(spec: CommandSpec, proofFile: string, outDir: string, signal?: AbortSignal): (stage: 'before' | 'current') => Promise<CommandReplay> {
  const proof = proofSchema.parse(JSON.parse(readFileSync(proofFile, 'utf8')));
  if (proof.mode !== spec.mode || proof.baselineKind !== spec.baselineKind || proof.verdict !== 'passed' || proof.specHash !== hash(JSON.stringify(spec)) || proof.current.length !== spec.repeats) throw new Error('Recording requires matching fresh mode-specific command proof.');
  const allChecks = ['$exit', ...spec.checks.map(c => c.id)];
  const complete = (item: z.infer<typeof run>) => item.status === 'exited' && item.code !== null && item.signal === null && item.checks.length === allChecks.length && allChecks.every(id => item.checks.filter(c => c.id === id).length === 1 && item.checks.find(c => c.id === id)!.verdict !== 'insufficient_evidence');
  if ((spec.mode === 'acceptance' ? proof.before !== undefined : !proof.before || !complete(proof.before))
    || proof.current.some(item => !complete(item) || item.code !== spec.expectedExit || item.verdict !== 'passed' || item.checks.some(c => c.verdict !== 'passed'))) throw new Error('Complete baseline and repeated current success are not established.');
  if (spec.mode === 'repair' && (!proof.before || spec.baselineKind !== 'historical' || proof.before.code !== spec.expectedExit || proof.before.checks.find(c => c.id === spec.regressionCheck)?.verdict !== 'failed' || proof.before.checks.some(c => c.id !== spec.regressionCheck && c.verdict !== 'passed'))) throw new Error('Strict historical repair evidence is not established.');
  for (const [stage, command] of [...(spec.before ? [['before', spec.before] as const] : []), ['current', spec.current] as const]) {
    const records = stage === 'before' ? [proof.before!] : proof.current;
    const identity = captureCommandIdentity(command);
    if (records.some(item => !sameIdentity(item.identityBefore, identity) || !sameIdentity(item.identityAfter, identity))) throw new Error('Replay requires unchanged complete declared execution identities throughout proof.');
  }
  // Retained proof bytes are pinned before recording; a local evidence edit cannot authorize a new movie.
  const proofHash = fileHash(proofFile);
  const referenceHashes = new Map([...(proof.before ? [proof.before] : []), ...proof.current].flatMap(item => [item.stdout, item.stderr, ...item.checks.map(c => c.evidence)]).map(file => [file, fileHash(file)]));
  const called = new Set<string>();
  return async stage => {
    if (stage === 'before' && spec.mode === 'acceptance') throw new Error('Acceptance has no baseline replay.');
    if (called.has(stage)) throw new Error('Each recording stage must execute exactly once.');
    called.add(stage);
    const reference = stage === 'before' ? proof.before! : proof.current[0];
    const command = spec[stage]!;
    if (proof.specHash !== hash(JSON.stringify(spec)) || fileHash(proofFile) !== proofHash || [...referenceHashes].some(([file, identity]) => fileHash(file) !== identity) || !sameIdentity(captureCommandIdentity(command), reference.identityBefore)) throw new Error('Proof or declared execution identity changed before replay.');
    const observed = await executeCommand(spec, command, path.join(outDir, `replay-${stage}`), undefined, signal);
    let matches = observed.status === 'exited' && observed.status === reference.status && observed.verdict === reference.verdict && observed.code === reference.code && observed.signal === reference.signal && sameIdentity(observed.identityBefore, reference.identityBefore) && sameIdentity(observed.identityAfter, reference.identityBefore);
    matches &&= fileHash(observed.stdout) === referenceHashes.get(reference.stdout) && fileHash(observed.stderr) === referenceHashes.get(reference.stderr);
    matches &&= observed.checks.length === reference.checks.length && observed.checks.every(c => {
      const prior = reference.checks.find(p => p.id === c.id);
      return prior && c.verdict === prior.verdict && (c.id === '$exit' || fileHash(c.evidence) === referenceHashes.get(prior.evidence));
    });
    matches &&= proof.specHash === hash(JSON.stringify(spec)) && fileHash(proofFile) === proofHash && [...referenceHashes].every(([file, identity]) => fileHash(file) === identity);
    privateJson(path.join(outDir, `replay-${stage}.json`), { matches, proofFile, proofHash, verifiedAt: proof.verifiedAt, specHash: proof.specHash, reference: reference.resultPath, run: observed });
    if (!matches) throw new Error('Recording replay diverged from command proof; no movie delivered.');
    return { stage, run: observed, reference, command };
  };
}

/** Shared declaration-relative loading and mode/story validation for preview and delivery. */
export function loadCommandVideoPlan(planPath: string) {
  planPath = path.resolve(planPath);
  const plan = commandVideoPlanSchema.parse(JSON.parse(readFileSync(planPath, 'utf8')));
  plan.commandsPath = path.resolve(path.dirname(planPath), plan.commandsPath);
  if (plan.diffPath) plan.diffPath = path.resolve(path.dirname(planPath), plan.diffPath);
  const spec = loadCommandSpec(plan.commandsPath);
  if (spec.mode === 'acceptance' ? Boolean(plan.walkthrough.before || plan.walkthrough.code || plan.diffPath)
    : !plan.walkthrough.before || (spec.mode === 'repair' && !plan.walkthrough.code)) throw new Error('Recording story must match mode: current-only acceptance, paired comparison, or before/code/after repair.');
  validateShortComposition(plan.walkthrough, spec.mode);
  return { plan, spec };
}

export async function demonstrateCommands(planPath: string, outputDirectory: string, cut: VideoCut = 'full', signal?: AbortSignal) {
  planPath = path.resolve(planPath);
  const { plan, spec } = loadCommandVideoPlan(planPath);
  videoCutSchema.parse(cut);
  composeWalkthrough(plan.walkthrough, spec.mode, cut);
  const composition = compositionManifest(plan.walkthrough, spec.mode, cut);
  const inputs = new Map([planPath, plan.commandsPath, ...(plan.diffPath ? [plan.diffPath] : [])].map(file => [file, fileHash(file)]));
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true });
  // Never overwrite an accepted movie, or adopt an old proof directory.
  mkdirSync(outDir, { mode: 0o700 });
  privateJson(path.join(outDir, 'video-plan.json'), plan);
  privateJson(path.join(outDir, 'input-identities.json'), Object.fromEntries(inputs));
  const result = await proveCommands(plan.commandsPath, path.join(outDir, 'proof'), signal);
  const report = path.join(outDir, 'REPORT.md');
  let demoVideo: string | undefined;
  let verdict = result.verdict;
  let recordingError: string | undefined;
  if (result.verdict === 'passed' && !signal?.aborted) {
    try {
      const replay = commandReplayGate(spec, result.proofPath, outDir, signal);
      const unchanged = () => { if ([...inputs].some(([file, identity]) => fileHash(file) !== identity)) throw new Error('Recording declaration or source changed since proof.'); };
      demoVideo = await recordCommandWalkthrough(plan, spec, outDir, async stage => { unchanged(); const replayed = await replay(stage); unchanged(); return replayed; }, cut, signal);
      unchanged();
    } catch (error) {
      demoVideo = undefined; verdict = 'insufficient_evidence';
      rmSync(path.join(outDir, 'demo.mp4'), { force: true });
      recordingError = 'Movie delivery blocked; inspect private recording-failure.json. Acceptance proof remains separate.';
      privateJson(path.join(outDir, 'recording-failure.json'), { error: error instanceof Error ? error.message : String(error) });
    }
  }
  const scope = `Only declared command checks. Browser-hosted xterm rendering of real pipe output, not native terminal/TTY capture. Recording renderer, speech and encoder dependencies are outside command verification identity scope unless explicitly declared as tools/inputs. ${identityScope}`;
  const diagnostics = [...result.diagnostics, ...(recordingError ? [recordingDiagnostic(outDir, path.join(outDir, 'recording-failure.json'))] : [])];
  const interrupted = Boolean(signal?.aborted);
  if (interrupted) { verdict = 'insufficient_evidence'; demoVideo = undefined; rmSync(path.join(outDir, 'demo.mp4'), { force: true }); }
  const delivery = { mode: spec.mode, baselineKind: spec.baselineKind, composition, verdict, ...(interrupted ? { interrupted: true } : {}), proofVerdict: result.verdict, diagnostics, demoVideo, report, proofPath: result.proofPath, feedbackPath: result.feedbackPath, recordingError, scope };
  privateJson(path.join(outDir, 'delivery.json'), delivery);
  writeFileSync(report, `# Command video delivery\n\nMode: ${spec.mode} · baseline: ${spec.baselineKind ?? 'none (current-only)'}\n\nProof: **${result.verdict}** · delivery: **${verdict}**\n\n${scope}\n\n${demoVideo ? '[Watch the narrated walkthrough](demo.mp4) · [Captions](video/captions.vtt) · [Measured narration and recording provenance](video/tour.json)\n\nMode-appropriate real commands executed again during capture; stdout, stderr, exit, checks, artifacts and executable identity matched fresh proof.' : recordingError ?? 'Recording blocked: mode-specific verification did not pass.'}\n\n## Evidence\n\n- [Verification report](proof/REPORT.md), [proof](proof/proof.json), [safe feedback](proof/feedback.json)\n- [Resolved private recording plan](video-plan.json), [input file identities](input-identities.json)\n${demoVideo ? `- [Current replay](replay-current.json)${spec.mode !== 'acceptance' ? ' · [Baseline replay](replay-before.json)' : ''}\n- Raw command streams and artifacts: proof/ and replay-current/${spec.mode !== 'acceptance' ? ', replay-before/' : ''}\n- Narration, supplied source patch, rendered text and scene PNGs: video/\n` : ''}\nRaw evidence, movie and authored narration are private and not sanitized exports. Review before sharing. Story is authored by the coding agent; structural gates do not certify human comprehension or root cause. Baseline attribution is caller-declared, not authenticated history.\n`, { mode: 0o600 });
  writeFileSync(report, '\n' + formatSummary({ verdict, diagnostics }, true) + '\n', { flag: 'a', mode: 0o600 });
  writeFileSync(report, `\nComposition: **${cut}** · authored story SHA-256: ${composition.sourceStoryHash}. Both cuts retain the same command verification contract; each delivery requires fresh proof and matching replays.\n`, { flag: 'a', mode: 0o600 });
  return delivery;
}

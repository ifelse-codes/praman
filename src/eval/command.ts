import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { safeFeedbackValue } from '../review/feedback.js';
import { checkDiagnostics, formatSummary } from '../review/diagnostics.js';
import { inspectMedia, mediaAssertion } from './media.js';
import { observeResources, resourceConfigSchema, type ResourceConfig, type ResourceObservation } from './resources.js';
import { captureIdentity, identityComplete, identityDeclarationSchema, identityScope, normalizeIdentity, sameIdentity, type IdentitySnapshot } from './identity.js';

export const commandInvocationSchema = z.object({ executable: z.string().min(1), args: z.array(z.string()).default([]), cwd: z.string().min(1), env: z.record(z.string(), z.string().nullable()).default({}), stdin: z.string().optional(), deadlineMs: z.number().int().min(1).max(300000), identity: identityDeclarationSchema.optional() }).strict();
const textAssertion = z.object({ id: z.string().min(1), source: z.enum(['stdout', 'stderr', 'artifact']), path: z.string().optional(), operator: z.enum(['equals', 'contains', 'notContains', 'matches']), value: z.string() }).strict().superRefine((row, ctx) => {
  if ((row.source === 'artifact') !== Boolean(row.path)) ctx.addIssue({ code: 'custom', message: 'Only artifact assertions require a path, relative to command cwd.' });
  if (row.operator === 'matches') { try { new RegExp(row.value); } catch { ctx.addIssue({ code: 'custom', message: 'Invalid assertion regular expression.' }); } }
});
const assertion = z.union([textAssertion, mediaAssertion]);
export const commandProofSchema = z.object({
  mode: z.enum(['acceptance', 'repair', 'comparison']), baselineKind: z.enum(['historical', 'synthetic', 'unattested']).optional(),
  title: z.string().min(1), requirement: z.string().min(1), before: commandInvocationSchema.optional(), current: commandInvocationSchema,
  expectedExit: z.number().int().min(0).max(255).default(0), checks: z.array(assertion).min(1),
  regressionCheck: z.string().min(1).optional(), repeats: z.number().int().min(2).max(10).default(2),
}).strict().superRefine((spec, ctx) => {
  if (spec.checks.some(row => row.id === '$exit') || new Set(spec.checks.map(row => row.id)).size !== spec.checks.length) ctx.addIssue({ code: 'custom', message: 'Checks require unique IDs and must not use reserved $exit.' });
  if (spec.mode === 'acceptance') {
    if (spec.before || spec.regressionCheck || spec.baselineKind) ctx.addIssue({ code: 'custom', message: 'Acceptance is current-only; omit baseline and regression fields.' });
  } else {
    if (!spec.before || !spec.baselineKind) ctx.addIssue({ code: 'custom', message: 'Paired modes require before and an explicit baselineKind.' });
    if (spec.mode === 'repair' && (spec.baselineKind !== 'historical' || !spec.checks.some(row => row.id === spec.regressionCheck))) ctx.addIssue({ code: 'custom', message: 'Repair requires a historical baseline and a declared regressionCheck.' });
    if (spec.mode === 'comparison' && spec.regressionCheck !== undefined) ctx.addIssue({ code: 'custom', message: 'Comparison does not claim a named repair; omit regressionCheck.' });
  }
});
export type CommandSpec = z.infer<typeof commandProofSchema>;
type Verdict = 'passed' | 'failed' | 'insufficient_evidence';
interface CheckResult { id: string; verdict: Verdict; reason: string; evidence: string; expected?: unknown; observed?: unknown; }
export interface CommandRun { verdict: Verdict; status: 'exited' | 'timeout' | 'unavailable' | 'interrupted'; code: number | null; signal: string | null; executableHash?: string; executableHashAfter?: string; identityBefore?: IdentitySnapshot; identityAfter?: IdentitySnapshot; startedAt: string; endedAt: string; checks: CheckResult[]; resultPath: string; stdout: string; stderr: string; error?: string; resources?: ResourceObservation; }
const maxEvidence = 8 * 1024 * 1024;
function privateJson(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
function stopGroup(pid?: number, signal: NodeJS.Signals = 'SIGKILL') { if (!pid) return; try { process.kill(-pid, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; } }
/** After an abort, the owned group gets SIGTERM and this long to exit before SIGKILL. */
export const interruptGraceMs = 2000;
export const interruptedReason = 'Verification was interrupted before all declared runs completed; no claim is established.';
/** Resolve with the same effective environment and evaluator in verification and replay. */
export function captureCommandIdentity(command: CommandSpec['current']) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(command.env)) { if (value === null) delete env[key]; else env[key] = value; }
  return captureIdentity(command.identity, { cwd: command.cwd, env, executable: command.executable, harness: import.meta.url });
}
export async function executeCommand(spec: CommandSpec, command: CommandSpec['current'], directory: string, resources?: ResourceConfig, abortSignal?: AbortSignal): Promise<CommandRun> {
  if (resources) resources = resourceConfigSchema.parse(resources);
  const startedAt = new Date().toISOString();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stdout = path.join(directory, 'stdout.txt'), stderr = path.join(directory, 'stderr.txt'), resultPath = path.join(directory, 'result.json');
  const out = openSync(stdout, 'wx', 0o600), err = openSync(stderr, 'wx', 0o600);
  const artifacts = new Map(spec.checks.filter(row => row.source === 'artifact').map(row => {
    const file = path.resolve(command.cwd, row.path!);
    return [file, existsSync(file) ? statSync(file, { bigint: true }).ctimeNs : undefined];
  }));
  const env = { ...process.env };
  for (const [key, value] of Object.entries(command.env)) { if (value === null) delete env[key]; else env[key] = value; }
  let expired = false, interrupted = false, error: string | undefined, code: number | null = null, signal: string | null = null;
  const identityBefore = captureCommandIdentity(command);
  const executableIdentity = identityBefore.entries.find(entry => entry.role === 'command-executable');
  const executableHash = executableIdentity?.sha256;
  let resourceObservation: ResourceObservation | undefined;
  if (abortSignal?.aborted) {
    interrupted = true;
    closeSync(out); closeSync(err);
  } else if (!identityComplete(identityBefore)) {
    error = 'Declared execution identity is unavailable; inspect private identityBefore entries.';
    closeSync(out); closeSync(err);
  } else {
    // Use the captured PATH choice rather than resolving it again inside spawn.
    const child = spawn(executableIdentity!.path!, command.args, { cwd: command.cwd, env, detached: true, stdio: ['pipe', out, err] });
    const observer = resources && child.pid ? observeResources(child.pid, resources) : undefined;
    const timer = setTimeout(() => { expired = true; stopGroup(child.pid); }, command.deadlineMs);
    // Interruption: ask the owned group to stop, then force it after a bounded grace.
    let grace: NodeJS.Timeout | undefined;
    const onAbort = () => {
      if (interrupted || expired) return;
      interrupted = true;
      stopGroup(child.pid, 'SIGTERM');
      grace = setTimeout(() => stopGroup(child.pid), interruptGraceMs);
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    child.stdin!.on('error', () => {});
    child.stdin!.end(command.stdin);
    try {
      [code, signal] = await once(child, 'close') as [number | null, string | null];
    } catch (e) { error = String(e); }
    finally {
      abortSignal?.removeEventListener('abort', onAbort);
      clearTimeout(timer); clearTimeout(grace); stopGroup(child.pid); closeSync(out); closeSync(err);
      resourceObservation = await observer?.stop();
    }
  }
  const status = expired ? 'timeout' : interrupted ? 'interrupted' : error ? 'unavailable' : 'exited';
  const checks: CheckResult[] = [{ id: '$exit', verdict: status !== 'exited' || code === null ? 'insufficient_evidence' : code === spec.expectedExit ? 'passed' : 'failed', reason: status === 'exited' ? `Expected exit ${spec.expectedExit}; observed ${code}, signal ${signal}.` : `Execution ${status}.`, evidence: resultPath }];
  for (const check of spec.checks) {
    const source = check.source === 'stdout' ? stdout : check.source === 'stderr' ? stderr : path.resolve(command.cwd, check.path!);
    let evidence = source;
    try {
      if (status !== 'exited' || code === null) throw new Error(`Execution ${status}; assertions cannot establish complete behavior.`);
      if (check.source === 'artifact' && artifacts.get(source) === statSync(source, { bigint: true }).ctimeNs) throw new Error('Artifact unchanged since before execution; fresh evidence required.');
      const info = statSync(source);
      if (!info.isFile() || info.size > maxEvidence) throw new Error('Evidence must be a regular file no larger than 8 MiB.');
      if (check.source === 'artifact') { evidence = path.join(directory, `artifact-${spec.checks.indexOf(check)}`); copyFileSync(source, evidence); chmodSync(evidence, 0o600); }
      if (check.operator === 'image' || check.operator === 'audio' || check.operator === 'video') {
        checks.push({ id: check.id, evidence, ...await inspectMedia(check, evidence) });
      } else {
        const text = readFileSync(evidence, 'utf8');
        const passed = check.operator === 'equals' ? text === check.value : check.operator === 'contains' ? text.includes(check.value) : check.operator === 'notContains' ? !text.includes(check.value) : new RegExp(check.value).test(text);
        checks.push({ id: check.id, verdict: passed ? 'passed' : 'failed', reason: passed ? 'Declared expectation satisfied.' : 'Observed output differs from declared expectation; inspect private evidence.', evidence });
      }
    } catch (e) { checks.push({ id: check.id, verdict: 'insufficient_evidence', reason: String(e), evidence }); }
  }
  const identityAfter = captureCommandIdentity(command);
  if (!sameIdentity(identityBefore, identityAfter)) error ??= 'Declared execution identity changed or became unavailable during execution.';
  const verdict = error || checks.some(row => row.verdict === 'insufficient_evidence') ? 'insufficient_evidence' : checks.some(row => row.verdict === 'failed') ? 'failed' : 'passed';
  const executableHashAfter = identityAfter.entries.find(entry => entry.role === 'command-executable')?.sha256;
  const result: CommandRun = { verdict, status, code, signal, executableHash, executableHashAfter, identityBefore, identityAfter, startedAt, endedAt: new Date().toISOString(), checks, resultPath, stdout, stderr, error, resources: resourceObservation };
  privateJson(resultPath, result);
  return result;
}

export function loadCommandSpec(specPath: string): CommandSpec {
  specPath = path.resolve(specPath);
  const spec = commandProofSchema.parse(JSON.parse(readFileSync(specPath, 'utf8')));
  for (const command of [...(spec.before ? [spec.before] : []), spec.current]) {
    command.cwd = path.resolve(path.dirname(specPath), command.cwd);
    if (command.executable.includes(path.sep)) command.executable = path.resolve(path.dirname(specPath), command.executable);
    normalizeIdentity(command.identity, path.dirname(specPath));
  }
  return spec;
}

/** Trusted local commands, not a sandbox. Raw declarations and output stay private. */
export async function proveCommands(specPath: string, outputDirectory: string, signal?: AbortSignal) {
  specPath = path.resolve(specPath);
  const spec = loadCommandSpec(specPath);
  const outDir = path.resolve(outputDirectory);
  // Exclusive run directories prevent accidental overwrite and stale retained proof.
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const proofPath = path.join(outDir, 'proof.json');
  if (existsSync(proofPath) || existsSync(path.join(outDir, 'declaration.json'))) throw new Error('Proof output directory already contains a run; choose a fresh directory.');
  privateJson(path.join(outDir, 'declaration.json'), spec);
  // An interruption stops the active run and starts no further run.
  const before = spec.mode === 'acceptance' || signal?.aborted ? undefined : await executeCommand(spec, spec.before!, path.join(outDir, 'before'), undefined, signal);
  const current: CommandRun[] = [];
  for (let i = 0; i < spec.repeats && !signal?.aborted; i++) current.push(await executeCommand(spec, spec.current, path.join(outDir, `current-${i + 1}`), undefined, signal));
  const interrupted = Boolean(signal?.aborted) || [before, ...current].some(run => run?.status === 'interrupted');
  const stable = (runs: CommandRun[]) => runs.every(run => sameIdentity(runs[0]?.identityBefore, run.identityBefore) && sameIdentity(run.identityBefore, run.identityAfter));
  const identitiesStable = stable(current) && (!before || stable([before]));
  const oldComplete = !before || before.status === 'exited' && before.signal === null && !before.checks.some(row => row.verdict === 'insufficient_evidence');
  const repairEstablished = before && before.code === spec.expectedExit && before.checks.find(row => row.id === spec.regressionCheck)?.verdict === 'failed'
    && before.checks.every(row => row.id === spec.regressionCheck || row.verdict === 'passed');
  const verdict: Verdict = interrupted || !identitiesStable || !oldComplete || current.some(run => run.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
    : current.some(run => run.verdict !== 'passed') ? 'failed'
    : spec.mode === 'repair' && !repairEstablished ? 'insufficient_evidence' : 'passed';
  const reason = interrupted ? interruptedReason
    : verdict === 'insufficient_evidence' ? spec.mode === 'acceptance'
    ? 'Current requirement execution or evidence is unavailable; no acceptance claim is established.'
    : 'Execution/evidence unavailable or strict historical repair gate not established.'
    : verdict === 'failed' ? 'A current declared requirement failed.'
    : spec.mode === 'acceptance' ? 'Declared current requirements passed in all repeated runs. No baseline or repair claim.'
    : spec.mode === 'comparison' ? `Complete ${spec.baselineKind} baseline comparison; repeated current requirements passed. No historical repair claim.`
    : 'Named historical regression reproduced, other baseline checks passed, and all repeated current checks passed.';
  const proof = { mode: spec.mode, baselineKind: spec.baselineKind, verdict, reason, ...(interrupted ? { interrupted: true } : {}), scope: `Only declared command checks; not whole-program correctness or sandboxing. Baseline attribution is caller-declared, not authenticated history. ${identityScope}`, identityStatus: identitiesStable ? 'stable' : 'unavailable_or_changed', verifiedAt: new Date().toISOString(), specHash: createHash('sha256').update(JSON.stringify(spec)).digest('hex'), ...(before ? { before } : {}), current };
  privateJson(proofPath, proof);
  const diagnostics = checkDiagnostics(outDir, { ...proof, regressionCheck: spec.regressionCheck }, spec.checks.map(check => check.id));
  // Deliberately do not present command arguments, environment, assertions, raw output or raw errors.
  const feedback = safeFeedbackValue({
    mode: spec.mode, baselineKind: spec.baselineKind, verdict, ...(interrupted ? { interrupted: true } : {}), scope: proof.scope, identityStatus: proof.identityStatus, identityEvidence: { path: proofPath, private: true }, verifiedAt: proof.verifiedAt, proofPath, reason,
    diagnostics,
    findings: ['$exit', ...spec.checks.map(check => check.id)].map(checkId => {
      const mismatch = current.some(run => run.checks.find(row => row.id === checkId)?.verdict === 'failed');
      const incomplete = interrupted || current.some(run => run.checks.find(row => row.id === checkId)?.verdict !== 'passed')
        || Boolean(before && before.checks.find(row => row.id === checkId)?.verdict === 'insufficient_evidence');
      const historical = before?.checks.find(row => row.id === checkId)?.verdict === 'failed';
      return {
        checkId,
        checkIndex: checkId === '$exit' ? -1 : spec.checks.findIndex(check => check.id === checkId),
        status: mismatch ? 'current_failure' : incomplete ? 'incomplete'
          : spec.mode === 'repair' && verdict === 'passed' && checkId === spec.regressionCheck ? 'resolved_regression'
          : historical ? spec.mode === 'repair' ? 'historical_failure' : 'baseline_mismatch' : 'passed',
        rootCause: 'unknown',
        nextAction: mismatch ? spec.mode === 'acceptance'
          ? 'Inspect the declared current requirement, private expectation and captured output/exit/artifact observation, and run preconditions; determine whether the requirement or implementation needs correction, then rerun all current checks. Root cause is not established.'
          : 'Compare the private declaration expectations with captured output/exit/artifact evidence, repair the observed behavior, then rerun all checks.'
          : incomplete ? 'Restore execution and fresh evidence before diagnosing a software defect.'
          : spec.mode === 'acceptance' ? 'The current requirement was satisfied. Preserve private evidence; rerun acceptance after relevant changes.'
          : 'No current repair requested.',
        occurrences: [...(before ? [{ version: 'before', run: 1, value: before }] : []), ...current.map((value, i) => ({ version: 'current', run: i + 1, value }))].map(({ version, run: number, value: run }) => ({
          version, run: number,
          verdict: run.checks.find(row => row.id === checkId)?.verdict,
          status: run.status, code: run.code, signal: run.signal,
          evidencePath: run.checks.find(row => row.id === checkId)?.evidence, resultPath: run.resultPath,
        })),
      };
    }),
    reproduction: 'Restore private command inputs and workload state; rerun command-verify with declaration.json and a fresh output directory. Raw output, arguments, environment and assertions remain private. Inspect proof/result files locally to diagnose; root cause is not established.',
  });
  const feedbackPath = path.join(outDir, 'feedback.json'), report = path.join(outDir, 'REPORT.md');
  privateJson(feedbackPath, feedback);
  writeFileSync(report, `# Command verification\n\nMode: ${spec.mode}\n\nBaseline: ${spec.baselineKind ?? 'none (current-only)'}\n\nVerdict: ${verdict}\n\n${feedback.reason}\n\n${feedback.scope}\n\nIdentity: ${proof.identityStatus}. Inspect private proof.json and per-run result.json identityBefore/identityAfter entries for declared coverage and hashes.\n\n${feedback.reproduction}\n\nPrivate evidence: proof.json; per-run result.json, stdout.txt, stderr.txt and captured artifacts.\n`, { mode: 0o600 });
  writeFileSync(report, '\n' + formatSummary({ verdict, diagnostics }, true) + '\n', { flag: 'a', mode: 0o600 });
  return { verdict, feedback, feedbackPath, report, proofPath, diagnostics };
}

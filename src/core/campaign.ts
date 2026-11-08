import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { workflowSchema } from '../case/workflow.js';
import { createServiceState, type ServiceState, type ServiceSnapshot } from '../gateway/service.js';
import { replayWorkflow, type WorkflowOccurrence } from './workflow.js';
import { resourceConfigSchema } from '../eval/resources.js';
import { interruptedReason } from '../eval/command.js';
import { WorkflowSession } from './workflowSession.js';
import { captureCampaignWorkflows } from './workflowInputs.js';

const campaignBase = {
  version: z.literal(1), cases: z.array(z.string().min(1)).min(1).max(20),
  concurrency: z.number().int().min(1).max(8),
  resources: resourceConfigSchema.optional(),
  state: z.object({ kind: z.enum(['per-worker', 'shared-service']) }).strict().optional(),
};
export const campaignSchema = z.union([
  z.object({ ...campaignBase, rounds: z.number().int().min(1).max(20) }).strict()
    .refine(spec => spec.cases.length * spec.rounds <= 100, 'Round campaigns support at most 100 jobs'),
  z.object({
    ...campaignBase, durationMs: z.number().int().min(1).max(86400000),
    maxJobs: z.number().int().min(1).max(1000),
  }).strict(),
]);
type Verdict = 'passed' | 'failed' | 'insufficient_evidence';
interface Job {
  jobIndex: number; caseIndex: number; round: number; verdict: Verdict;
  workerIndex: number;
  startedAt: string; endedAt: string; startedAfterMs: number; proofPath: string; runs: WorkflowOccurrence[];
}
interface CampaignSchedule {
  kind: 'rounds' | 'duration' | 'unavailable';
  rounds?: number; durationMs?: number; maxJobs?: number;
  startedAt?: string; endedAt?: string; elapsedMs?: number;
  admissionClosedAfterMs?: number; drainMs?: number;
  stopReason: 'input_error' | 'execution_error' | 'rounds_complete' | 'duration_elapsed' | 'job_limit' | 'interrupted';
  unstartedCases: number[];
}
function readJson(file: string): unknown {
  const info = statSync(file);
  if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Input must be a regular JSON file no larger than 1 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function privateJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
}

/** Bounded scheduling of trusted workflows; isolated local state is not a sandbox.
 * A `signal` interrupts: active commands stop, no job starts, nothing passes. Durable and
 * agent campaigns pass no signal here; they keep their own drain-on-stop behavior. */
export async function runCampaign(specPath: string, outputDirectory: string, signal?: AbortSignal) {
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  mkdirSync(outDir, { mode: 0o700 });
  const jobs: Job[] = [];
  let error: string | undefined, concurrency = 0, peakConcurrency = 0;
  const schedule: CampaignSchedule = { kind: 'unavailable', stopReason: 'input_error', unstartedCases: [] };
  let resourcesRequested = false;
  const workersState: { workerIndex: number; receiptPath: string; workspacePath: string }[] = [];
  let persistent = false;
  let sharedState: ServiceState | undefined, sharedInitial: ServiceSnapshot | undefined;
  let sharedExpectedState: string | undefined, sharedDelta = 0;
  let stateKind: 'per-worker' | 'shared-service' | 'isolated' = 'isolated';
  try {
    const manifest = campaignSchema.parse(readJson(path.resolve(specPath)));
    concurrency = manifest.concurrency;
    resourcesRequested = Boolean(manifest.resources);
    persistent = Boolean(manifest.state);
    stateKind = manifest.state?.kind ?? 'isolated';
    if (persistent && manifest.cases.length !== 1) throw new Error('Persistent workers currently require exactly one workflow');
    privateJson(path.join(outDir, 'declaration.json'), manifest);
    schedule.unstartedCases = manifest.cases.map((_, index) => index);
    if ('rounds' in manifest) { schedule.kind = 'rounds'; schedule.rounds = manifest.rounds; }
    else { schedule.kind = 'duration'; schedule.durationMs = manifest.durationMs; schedule.maxJobs = manifest.maxJobs; }
    // Capture and validate the entire input suite before any application/reset runs.
    const inputs = captureCampaignWorkflows(manifest.cases, specPath, outDir, persistent);
    const total = 'rounds' in manifest ? inputs.length * manifest.rounds : manifest.maxJobs;
    if (persistent) {
      const workflow = workflowSchema.parse(readJson(inputs[0]));
      const restore = workflow.dependency.start.kind === 'snapshot' ? readJson(workflow.dependency.start.path) : undefined;
      const initial = createServiceState(workflow.dependency.service, restore).snapshot();
      const delta = workflow.dependency.final.requests - initial.requests;
      if (!Number.isSafeInteger(initial.requests + delta * total * workflow.dependency.repeats)) throw new Error('Persistent request scope exceeds safe integer limit');
      if (stateKind === 'shared-service') {
        sharedState = createServiceState(workflow.dependency.service, restore);
        sharedInitial = initial; sharedDelta = delta; sharedExpectedState = workflow.dependency.final.state;
      }
    }
    const durationMs = 'durationMs' in manifest ? manifest.durationMs : undefined;
    const start = performance.now();
    schedule.startedAt = new Date().toISOString();
    let cursor = 0, active = 0, admissionClosedAfterMs: number | undefined;
    let stopReason: 'rounds_complete' | 'duration_elapsed' | 'job_limit' | 'interrupted' | undefined;
    async function worker(workerIndex: number) {
      let session: WorkflowSession | undefined;
      let receiptPath: string | undefined;
      try {
      while (stopReason === undefined) {
        if (signal?.aborted) { stopReason = 'interrupted'; admissionClosedAfterMs = performance.now() - start; break; }
        // A monotonic admission check never starts a new job at or after the cutoff.
        const startedAfterMs = performance.now() - start;
        const expired = durationMs !== undefined && startedAfterMs >= durationMs;
        if (expired || cursor >= total) {
          stopReason = expired ? 'duration_elapsed' : durationMs === undefined ? 'rounds_complete' : 'job_limit';
          admissionClosedAfterMs = expired ? durationMs : startedAfterMs;
          break;
        }
        const jobIndex = cursor++, caseIndex = jobIndex % inputs.length;
        const round = Math.floor(jobIndex / inputs.length) + 1;
        const jobDir = path.join(outDir, `job-${jobIndex}`);
        const startedAt = new Date().toISOString();
        active++;
        peakConcurrency = Math.max(peakConcurrency, active);
        let result: { verdict: Verdict; proofPath: string; runs: WorkflowOccurrence[] };
        try {
          if (persistent && !session) {
            const workflow = workflowSchema.parse(readJson(inputs[caseIndex]));
            const restore = workflow.dependency.start.kind === 'snapshot' ? readJson(workflow.dependency.start.path) : undefined;
            const workerDir = path.join(outDir, `worker-${workerIndex}`);
            mkdirSync(workerDir, { mode: 0o700 });
            session = new WorkflowSession(path.join(workerDir, 'workspace'), workflow.dependency.service, restore, sharedState);
            receiptPath = path.join(workerDir, 'final-state.json');
            workersState.push({ workerIndex, receiptPath, workspacePath: session.workspacePath });
          }
          result = await replayWorkflow(inputs[caseIndex], jobDir, { isolateApplication: true, resources: manifest.resources, session, signal });
        }
        catch (e) {
          // A failed job must not orphan siblings or turn a partial campaign green.
          const proofPath = path.join(outDir, `job-${jobIndex}-error.json`);
          privateJson(proofPath, { error: String(e) });
          result = { verdict: 'insufficient_evidence', proofPath, runs: [] };
        } finally { active--; }
        jobs[jobIndex] = { jobIndex, caseIndex, round, workerIndex, startedAt, startedAfterMs, endedAt: new Date().toISOString(),
          verdict: manifest.resources && (!result.runs.length || result.runs.some(run => run.resources?.status !== 'complete')) ? 'insufficient_evidence' : result.verdict, proofPath: result.proofPath, runs: result.runs };
      }
      } finally {
        if (session) {
          try { privateJson(receiptPath!, { workerIndex, workspacePath: session.workspacePath, final: session.service.snapshot(), resetComplete: session.resetComplete, resetFailed: session.resetFailed }); }
          finally { await session.close(); }
        }
      }
    }
    // Finish every admitted repeat under its existing command/reset deadlines.
    try {
      const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, total) }, (_, index) => worker(index)));
      for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
      schedule.stopReason = signal?.aborted ? 'interrupted' : stopReason!;
    } finally {
      schedule.endedAt = new Date().toISOString();
      schedule.elapsedMs = performance.now() - start;
      schedule.admissionClosedAfterMs = admissionClosedAfterMs ?? schedule.elapsedMs;
      schedule.drainMs = Math.max(0, schedule.elapsedMs - schedule.admissionClosedAfterMs);
      schedule.unstartedCases = schedule.unstartedCases.slice(Math.min(cursor, inputs.length));
    }
  } catch (e) {
    error = String(e);
    schedule.stopReason = schedule.startedAt ? 'execution_error' : 'input_error';
  }
  let shared: { verdict: Verdict; receiptPath: string } | undefined;
  if (sharedState && sharedInitial) {
    const final = sharedState.snapshot();
    const expectedRequests = sharedInitial.requests + sharedDelta * jobs.reduce((sum, job) => sum + job.runs.length, 0);
    const verdict: Verdict = !Number.isSafeInteger(final.requests) ? 'insufficient_evidence'
      : final.requests === expectedRequests && final.state === sharedExpectedState ? 'passed' : 'failed';
    shared = { verdict, receiptPath: path.join(outDir, 'shared-state.json') };
    privateJson(shared.receiptPath, { initial: sharedInitial, final, expected: { state: sharedExpectedState, requests: expectedRequests }, verdict });
  }
  const interrupted = Boolean(signal?.aborted);
  const verdict: Verdict = interrupted || error || !jobs.length || schedule.unstartedCases.length
    || schedule.kind === 'duration' && schedule.stopReason !== 'duration_elapsed'
    || shared?.verdict === 'insufficient_evidence'
    || jobs.some(job => job.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
    : shared?.verdict === 'failed' || jobs.some(job => job.verdict === 'failed') ? 'failed' : 'passed';
  const reportPath = path.join(outDir, 'campaign.json'), report = path.join(outDir, 'REPORT.md');
  const observations = resourcesRequested ? jobs.flatMap(job => job.runs.map(run => ({ jobIndex: job.jobIndex, caseIndex: job.caseIndex, run: run.run,
    status: run.resources?.status ?? 'insufficient_evidence', resultPath: run.resultPath,
    peakRssKiB: run.resources?.peakRssKiB, rssDeltaKiB: run.resources?.rssDeltaKiB,
    rssSlopeKiBPerSecond: run.resources?.rssSlopeKiBPerSecond, peakReportedCpuPercent: run.resources?.peakReportedCpuPercent }))) : [];
  const scope = 'Count- or duration-bounded command/HTTP campaigns. Default state is fresh per repeat; explicit per-worker state retains each workspace/model, while shared-service state gives worker listeners one atomic shared model with per-worker application workspaces. Duration closes admission then drains owned commands. Optional resources describe root-process observations only. Trusted execution, not external-world isolation, whole-system accounting, distributed workers, autonomous agents or historical repair proof.';
  const result = {
    verdict, proof: false, ...(interrupted ? { interrupted: true } : {}), scope, reportPath, report, concurrency, peakConcurrency, schedule, jobs,
    state: { kind: stateKind, workers: workersState, shared },
    resources: resourcesRequested ? { scope: 'Descriptive sampled root-process observations, not resource acceptance, leak diagnosis, descendants or whole-system trends.', observations } : undefined,
    counts: { jobs: jobs.length, passed: jobs.filter(job => job.verdict === 'passed').length,
      failed: jobs.filter(job => job.verdict === 'failed').length,
      insufficient_evidence: jobs.filter(job => job.verdict === 'insufficient_evidence').length,
      runs: jobs.reduce((sum, job) => sum + job.runs.length, 0) },
    nextAction: interrupted ? `${interruptedReason} Rerun in a fresh output directory.`
      : verdict === 'passed' ? 'The declared scheduling scope completed and all admitted workflow repeats passed; preserve private evidence.'
      : verdict === 'failed' ? 'Inspect indexed job/run expectations and private observations; a mismatch does not establish root cause.'
      : 'Inspect scheduling limits, unstarted cases and private input/execution receipts; restore complete execution before making duration or behavior claims.',
  };
  privateJson(reportPath, { version: 1, ...result, error });
  privateJson(path.join(outDir, 'feedback.json'), result);
  writeFileSync(report, `# Isolated command/HTTP campaign\n\nVerdict: ${verdict}\n\n${scope}\n\nSchedule: ${schedule.kind}; stop: ${schedule.stopReason}. Requested duration: ${schedule.durationMs ?? 'not applicable'} ms. Elapsed: ${schedule.elapsedMs ?? 'not started'} ms; drain: ${schedule.drainMs ?? 'not started'} ms. Unstarted case indexes: ${schedule.unstartedCases.join(', ') || 'none'}.\n\nConcurrency: ${concurrency}; peak active jobs: ${peakConcurrency}. Jobs: ${result.counts.jobs}; repeats: ${result.counts.runs}.\n\n| Job | Case | Round | Start offset (ms) | Verdict | Private workflow evidence |\n| --- | --- | --- | --- | --- | --- |\n${jobs.map(job => `| ${job.jobIndex} | ${job.caseIndex} | ${job.round} | ${job.startedAfterMs} | ${job.verdict} | [receipt](${path.relative(outDir, job.proofPath)}) |`).join('\n')}\n\n${jobs.flatMap(job => job.runs.map(run => `- Job ${job.jobIndex}, run ${run.run}: **${run.verdict}**; [result](job-${job.jobIndex}/run-${run.run}/result.json), [trace](job-${job.jobIndex}/run-${run.run}/trace.json).`)).join('\n')}\n\n${result.nextAction}\n\nPrivate input/execution errors, when present: campaign.json and indexed job receipts. Local paths may be sensitive.\n`, { mode: 0o600, flag: 'wx' });
  if (resourcesRequested) writeFileSync(report, `\n## Sampled application resources\n\nDescriptive root-process observations only; CPU percentage is ps/platform-defined. No leak or budget claim. Raw samples/errors are in private command results.\n\n| Job | Case | Run | Evidence status | Peak RSS (KiB) | RSS endpoint delta (KiB) | RSS endpoint slope (KiB/s) | Peak reported CPU (%) |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${observations.map(row => `| ${row.jobIndex} | ${row.caseIndex} | ${row.run} | ${row.status} | ${row.peakRssKiB ?? 'unavailable'} | ${row.rssDeltaKiB ?? 'unavailable'} | ${row.rssSlopeKiBPerSecond ?? 'unavailable'} | ${row.peakReportedCpuPercent ?? 'unavailable'} |`).join('\n')}\n`, { flag: 'a', mode: 0o600 });
  if (persistent) writeFileSync(report, `\n## Persistent worker state\n\nWorkspaces/home/temp and simulator persist within each worker only. Application processes restart. Reset is checked once per worker; failed reset blocks later application commands. Each declared request count is an iteration delta from its declared start; trace expectations use actual starting counts.\n\n${workersState.map(worker => `- Worker ${worker.workerIndex}: [final state](${path.relative(outDir, worker.receiptPath)}).`).join('\n')}\n`, { flag: 'a', mode: 0o600 });
  if (shared) writeFileSync(report, `\nShared-model final invariant: **${shared.verdict}**; [private receipt](${path.relative(outDir, shared.receiptPath)}). Each worker listener journals only its own requests against the same atomic model. Per-run counts are matched local request deltas; shared traces cannot be reconstructed as isolated workflow cases.\n`, { flag: 'a', mode: 0o600 });
  return result;
}

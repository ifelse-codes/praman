import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { workflowSchema, workflowTraceSchema } from '../case/workflow.js';
import { replayWorkflow } from '../core/workflow.js';
import { serviceSchema } from '../gateway/service.js';
import { serviceReplaySchema } from '../gateway/replay.js';
import { normalizeIdentity } from '../eval/identity.js';

const referenceSchema = z.object({ caseIndex: z.number().int().nonnegative(), checkIndex: z.number().int().min(-1) }).strict();
const reviewSchema = z.object({
  version: z.literal(1), service: serviceSchema,
  cases: z.array(z.string().min(1)).min(1).max(20),
  requirements: z.array(z.object({
    description: z.string().trim().min(1), checks: z.array(referenceSchema).max(100),
  }).strict()).min(1).max(100),
}).strict();
type Verdict = 'passed' | 'failed' | 'insufficient_evidence';
type Reference = z.infer<typeof referenceSchema>;
type Service = z.infer<typeof serviceSchema>;
type Edge = { state: string; transition: Service['states'][string][number]; stateIndex: number; routeIndex: number };
const maxBytes = 1024 * 1024;
function readJson(file: string, limit = maxBytes): unknown {
  const info = statSync(file);
  if (!info.isFile() || info.size > limit) throw new Error('Input must be a bounded regular JSON file');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function privateJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
}
function combine(values: Verdict[]): Verdict {
  return !values.length || values.includes('insufficient_evidence') ? 'insufficient_evidence' : values.includes('failed') ? 'failed' : 'passed';
}

/** Initial-state command/HTTP model review. Authored mappings are not independent requirement discovery. */
export async function reviewCoverage(specPath: string, outputDirectory: string) {
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  mkdirSync(outDir, { mode: 0o700 });
  type Occurrence = { caseIndex: number; run: number; interactionIndex: number; verdict: Verdict; tracePath: string };
  const transitions: { transitionIndex: number; stateIndex: number; routeIndex: number; reachable: boolean; status: 'untested' | 'exercised' | 'verified'; occurrences: Occurrence[]; candidatePath?: string }[] = [];
  const requirements: { requirementIndex: number; status: Verdict | 'untested'; checks: (Reference & { verdict: Verdict; evidence: { run: number; resultPath: string; pointer: string }[] })[] }[] = [];
  const cases: { caseIndex: number; verdict: Verdict; proofPath: string }[] = [];
  let error: string | undefined;
  try {
    const manifest = reviewSchema.parse(readJson(path.resolve(specPath)));
    privateJson(path.join(outDir, 'declaration.json'), manifest);
    const states = Object.keys(manifest.service.states);
    const edges: Edge[] = states.flatMap((state, stateIndex) => manifest.service.states[state].map((transition, routeIndex) => ({ state, transition, stateIndex, routeIndex })));
    if (states.length > 100 || edges.length > 100) throw new Error('Coverage scope is at most 100 states and 100 transitions');
    if (edges.some(edge => !/^\/[^\r\n\x00-\x20\x7f]*$/.test(edge.transition.path))) throw new Error('Model routes must be valid replay request paths');
    // Validate the entire suite before executing any trusted command. Capture normalized inputs once.
    const workflows = manifest.cases.map(file => {
      const inputPath = path.resolve(path.dirname(path.resolve(specPath)), file);
      const workflow = workflowSchema.parse(readJson(inputPath));
      if (!isDeepStrictEqual(workflow.dependency.service, manifest.service)) throw new Error('All cases must use exactly the review service model');
      if (workflow.dependency.start.kind !== 'initial') throw new Error('Coverage review supports initial-state workflows only');
      for (const command of [workflow.command, ...(workflow.applicationState.kind === 'reset' ? [workflow.applicationState.command] : [])]) {
        command.current.cwd = path.resolve(path.dirname(inputPath), command.current.cwd);
        if (command.current.executable.includes(path.sep)) command.current.executable = path.resolve(path.dirname(inputPath), command.current.executable);
        normalizeIdentity(command.current.identity, path.dirname(inputPath));
      }
      return workflow;
    });
    for (const requirement of manifest.requirements) for (const ref of requirement.checks) {
      const workflow = workflows[ref.caseIndex];
      if (!workflow || ref.checkIndex >= workflow.command.checks.length) throw new Error('Requirement references an absent case or command check');
    }
    // Breadth-first paths are shortest model stimuli, never invented application commands or oracles.
    const paths = new Map<string, number[]>([[manifest.service.initial, []]]);
    const byState = new Map(states.map(state => [state, [] as number[]]));
    edges.forEach((edge, index) => byState.get(edge.state)!.push(index));
    const queue = [manifest.service.initial];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const state = queue[cursor];
      for (const edgeIndex of byState.get(state)!) {
        const next = edges[edgeIndex].transition.next;
        if (!paths.has(next)) { paths.set(next, [...paths.get(state)!, edgeIndex]); queue.push(next); }
      }
    }
    edges.forEach((edge, transitionIndex) => transitions.push({ transitionIndex, stateIndex: edge.stateIndex, routeIndex: edge.routeIndex, reachable: paths.has(edge.state), status: 'untested', occurrences: [] }));
    const results: { runs: { verdict: Verdict; checks: Verdict[]; resultPath: string }[] }[] = [];
    for (const [caseIndex, workflow] of workflows.entries()) {
      const input = path.join(outDir, `case-${caseIndex}.json`);
      privateJson(input, workflow);
      const result = await replayWorkflow(input, path.join(outDir, `case-${caseIndex}`));
      const observations: { verdict: Verdict; checks: Verdict[]; resultPath: string }[] = [];
      results.push({ runs: observations });
      cases.push({ caseIndex, verdict: result.verdict, proofPath: result.proofPath });
      for (const [runIndex, run] of result.runs.entries()) {
        const resultPath = path.join(path.dirname(run.tracePath), 'result.json');
        // Read only receipts generated by this review; retain bounded assertion verdicts once.
        const raw = readJson(resultPath, 4 * maxBytes) as { command?: { checks: { verdict: Verdict }[] } };
        observations.push({ verdict: run.verdict, checks: raw.command?.checks.map(check => check.verdict) ?? [], resultPath });
        // Incomplete executions cannot establish absence or transition coverage.
        const parsed = workflowTraceSchema.safeParse(readJson(run.tracePath, 4 * maxBytes));
        if (!parsed.success || run.verdict === 'insufficient_evidence') continue;
        for (const [interactionIndex, actual] of parsed.data.interactions.entries()) {
          if (!actual.matched) continue;
          const edgeIndex = edges.findIndex(edge => edge.state === actual.before && edge.transition.method === actual.method && edge.transition.path === actual.path && edge.transition.next === actual.after && edge.transition.response.status === actual.status);
          if (edgeIndex < 0) throw new Error('Observed transition is outside the declared model');
          transitions[edgeIndex].occurrences.push({ caseIndex, run: runIndex + 1, interactionIndex, verdict: run.verdict, tracePath: run.tracePath });
        }
      }
    }
    for (const [requirementIndex, requirement] of manifest.requirements.entries()) {
      const checks = requirement.checks.map(ref => {
        const result = results[ref.caseIndex];
        const evidence = result.runs.map((run, index) => ({ run: index + 1, resultPath: run.resultPath,
          pointer: ref.checkIndex + 1 < run.checks.length ? `/command/checks/${ref.checkIndex + 1}` : '' }));
        const verdict = combine(result.runs.map(run => {
          if (run.verdict === 'insufficient_evidence') return 'insufficient_evidence';
          return run.checks[ref.checkIndex + 1] ?? 'insufficient_evidence';
        }));
        return { ...ref, verdict, evidence };
      });
      requirements.push({ requirementIndex, status: checks.length ? combine(checks.map(check => check.verdict)) : 'untested', checks });
    }
    for (const [index, row] of transitions.entries()) {
      row.status = row.occurrences.some(occurrence => occurrence.verdict === 'passed') ? 'verified' : row.occurrences.length ? 'exercised' : 'untested';
      if (!row.reachable || row.status === 'verified') continue;
      const sequence = [...paths.get(edges[index].state)!, index];
      const candidate = serviceReplaySchema.parse({
        version: 1, service: manifest.service, start: { kind: 'initial' }, repeats: 2,
        steps: sequence.map(edgeIndex => {
          const transition = edges[edgeIndex].transition;
          return { method: transition.method, path: transition.path, expect: { status: transition.response.status,
            body: transition.method === 'HEAD' || [204, 304].includes(transition.response.status) ? { kind: 'text', value: '' } : { kind: 'json', value: transition.response.body } } };
        }),
        final: { state: edges[index].transition.next, requests: sequence.length },
      });
      row.candidatePath = path.join(outDir, `candidate-${index}.json`);
      privateJson(row.candidatePath, candidate);
    }
  } catch (e) { error = String(e); }
  const verdict: Verdict = error || cases.some(row => row.verdict === 'insufficient_evidence') || requirements.some(row => row.status === 'insufficient_evidence') ? 'insufficient_evidence'
    : cases.some(row => row.verdict === 'failed') || requirements.some(row => row.status !== 'passed') || transitions.some(row => row.reachable && row.status !== 'verified') ? 'failed' : 'passed';
  const reportPath = path.join(outDir, 'coverage.json');
  const scope = 'Initial-state command workflows against one declared finite-state HTTP dependency. Coverage is model-transition exercise plus caller-mapped command assertions, not source coverage, independently discovered requirements, whole-app correctness or historical repair proof. Candidates test only the simulator and do not close application coverage gaps.';
  const result = {
    verdict, proof: false, scope, reportPath, cases, requirements, transitions,
    counts: { reachable: transitions.filter(row => row.reachable).length, unreachable: transitions.filter(row => !row.reachable).length,
      exercised: transitions.filter(row => row.reachable && row.occurrences.length).length, verified: transitions.filter(row => row.reachable && row.status === 'verified').length,
      untestedRequirements: requirements.filter(row => row.status === 'untested').length },
    nextAction: verdict === 'passed' ? 'All reachable model transitions and mapped assertions passed within this declared scope; preserve private evidence. This does not establish requirement completeness.'
      : verdict === 'failed' ? 'Inspect indexed gaps and private evidence. Adapt model-only candidates into authored application workflows and map missing requirements; rerun the review. A coverage gap is not an application defect.'
      : 'Inspect private input/execution errors and restore complete supported workflows before making coverage claims.',
  };
  privateJson(reportPath, { version: 1, ...result, error });
  privateJson(path.join(outDir, 'feedback.json'), result);
  return result;
}

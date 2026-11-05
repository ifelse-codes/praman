import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workflowSchema } from '../case/workflow.js';
import { executeCommand, type CommandRun, type CommandSpec } from '../eval/command.js';
import { startService, type ServiceInstance, type ServiceInteraction } from '../gateway/service.js';
import type { ResourceConfig, ResourceObservation } from '../eval/resources.js';
import type { WorkflowSession } from './workflowSession.js';
import { normalizeIdentity } from '../eval/identity.js';

const maxBytes = 1024 * 1024;
type Verdict = 'passed' | 'failed' | 'insufficient_evidence';
function readJson(file: string): unknown {
  const info = statSync(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('Input must be a regular file no larger than 1 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function privateJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
}
function normalizeCommand(spec: CommandSpec, directory: string) {
  spec.current.cwd = path.resolve(directory, spec.current.cwd);
  if (spec.current.executable.includes(path.sep)) spec.current.executable = path.resolve(directory, spec.current.executable);
  normalizeIdentity(spec.current.identity, directory);
}
interface WorkflowRun {
  verdict: Verdict; reset?: CommandRun; command?: CommandRun; dependencyVerdict?: Verdict;
  tracePath: string; workspacePath?: string; error?: string;
}
export interface WorkflowOccurrence {
  run: number; verdict: Verdict; tracePath: string; resultPath: string;
  workspacePath?: string; dependencyVerdict?: Verdict; commandVerdict?: Verdict;
  resources?: ResourceObservation;
}

/** Trusted commands; fresh simulator plus explicit caller-owned application state contract. */
export async function replayWorkflow(specPath: string, outputDirectory: string, options: { isolateApplication?: boolean; resources?: ResourceConfig; session?: WorkflowSession } = {}) {
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  mkdirSync(outDir, { mode: 0o700 });
  const runs: WorkflowRun[] = [];
  let error: string | undefined;
  try {
    const spec = workflowSchema.parse(readJson(path.resolve(specPath)));
    const directory = path.dirname(path.resolve(specPath));
    if (options.isolateApplication) {
      for (const command of [spec.command, ...(spec.applicationState.kind === 'reset' ? [spec.applicationState.command] : [])]) {
        if (command.current.cwd !== '{{runDir}}') throw new Error('Isolated application commands require cwd {{runDir}}');
      }
    }
    normalizeCommand(spec.command, directory);
    if (spec.applicationState.kind === 'reset') normalizeCommand(spec.applicationState.command, directory);
    const restore = spec.dependency.start.kind === 'snapshot' ? readJson(path.resolve(directory, spec.dependency.start.path)) : undefined;
    privateJson(path.join(outDir, 'declaration.json'), spec);
    if (restore !== undefined) privateJson(path.join(outDir, 'starting-snapshot.json'), restore);
    for (let repeat = 0; repeat < spec.dependency.repeats; repeat++) {
      const runDir = path.join(outDir, `run-${repeat + 1}`);
      mkdirSync(runDir, { mode: 0o700 });
      const run: WorkflowRun = { verdict: 'insufficient_evidence', tracePath: path.join(runDir, 'trace.json') };
      const interactions: ServiceInteraction[] = [];
      let bytes = 0, overflow = false;
      let service: ServiceInstance | undefined;
      let initial: unknown, final: unknown;
      const execution = options.isolateApplication ? structuredClone(spec) : spec;
      try {
        if (options.isolateApplication) {
          const workspace = options.session?.workspacePath ?? path.join(runDir, 'workspace');
          const home = path.join(workspace, 'home'), temporary = path.join(workspace, 'tmp');
          if (!options.session) for (const directory of [workspace, home, temporary]) mkdirSync(directory, { mode: 0o700 });
          run.workspacePath = workspace;
          const bind = (value: string) => value.replaceAll('{{runDir}}', workspace);
          for (const command of [execution.command, ...(execution.applicationState.kind === 'reset' ? [execution.applicationState.command] : [])]) {
            const invocation = command.current;
            invocation.cwd = workspace;
            invocation.args = invocation.args.map(bind);
            invocation.stdin = invocation.stdin === undefined ? undefined : bind(invocation.stdin);
            invocation.env = {
              ...Object.fromEntries(Object.entries(invocation.env).map(([key, value]) => [key, value === null ? null : bind(value)])),
              HOME: home, TMPDIR: temporary, TMP: temporary, TEMP: temporary,
            };
          }
        }
        if (options.session?.resetFailed) throw new Error('Worker reset preconditions previously failed');
        if (execution.applicationState.kind === 'reset' && !options.session?.resetComplete) {
          const resetSpec = execution.applicationState.command;
          if (options.session) options.session.resetFailed = true;
          run.reset = await executeCommand(resetSpec, resetSpec.current, path.join(runDir, 'reset'));
          if (run.reset.verdict !== 'passed') {
            throw new Error('Application reset preconditions not established');
          }
          if (options.session) { options.session.resetComplete = true; options.session.resetFailed = false; }
        }
        const observe = (interaction: ServiceInteraction) => {
          bytes += Buffer.byteLength(JSON.stringify(interaction));
          if (interactions.length >= 100 || bytes > maxBytes) overflow = true;
          else interactions.push(interaction);
        };
        if (options.session) {
          service = options.session.service;
          options.session.onRequest = observe;
          if (!options.session.sharedState) {
            execution.dependency.final.requests = service.snapshot().requests + spec.dependency.final.requests - options.session.startingRequests;
            if (!Number.isSafeInteger(execution.dependency.final.requests)) throw new Error('Request expectation exceeds safe integer scope');
          }
        } else service = startService({ port: 0, declaration: spec.dependency.service, restore, onRequest: observe });
        if (!service.server.listening) await once(service.server, 'listening');
        initial = service.snapshot();
        const address = service.server.address();
        if (!address || typeof address === 'string') throw new Error('Missing dependency address');
        const url = `http://127.0.0.1:${address.port}`;
        const invocation = execution.command.current;
        const bind = (value: string) => value.replaceAll('{{serviceUrl}}', url);
        run.command = await executeCommand(execution.command, {
          ...invocation, args: invocation.args.map(bind),
          env: Object.fromEntries(Object.entries(invocation.env).map(([key, value]) => [key, value === null ? null : bind(value)])),
          stdin: invocation.stdin === undefined ? undefined : bind(invocation.stdin),
        }, path.join(runDir, 'command'), options.resources);
        // executeCommand waits for exit and kills any remaining owned process group.
        final = service.snapshot();
        const complete = run.command.status === 'exited' && run.command.signal === null && !overflow;
        const expected = spec.dependency.steps;
        const sequenceMatches = interactions.length === expected.length && interactions.every((actual, index) => {
          const step = expected[index];
          let bodyMatches = actual.body === step.expect.body.value;
          if (step.expect.body.kind === 'json') {
            try { bodyMatches = isDeepStrictEqual(JSON.parse(actual.body), step.expect.body.value); } catch { bodyMatches = false; }
          }
          return actual.method === step.method && actual.path === step.path && actual.status === step.expect.status && bodyMatches;
        });
        const snapshot = service.snapshot();
        const shared = options.session?.sharedState;
        const positionMatches = shared
          ? interactions.filter(interaction => interaction.matched).length === spec.dependency.final.requests - options.session!.startingRequests
            && interactions.at(-1)?.after === spec.dependency.final.state
          : snapshot.state === execution.dependency.final.state && snapshot.requests === execution.dependency.final.requests;
        run.dependencyVerdict = !complete ? 'insufficient_evidence' : sequenceMatches && positionMatches ? 'passed' : 'failed';
        run.verdict = run.command.verdict === 'insufficient_evidence' || run.dependencyVerdict === 'insufficient_evidence' ? 'insufficient_evidence'
          : run.command.verdict === 'failed' || run.dependencyVerdict === 'failed' ? 'failed' : 'passed';
      } catch (e) { run.error = String(e); }
      finally {
        if (options.session) options.session.onRequest = undefined;
        if (service && !options.session) {
          service.server.closeAllConnections();
          await new Promise<void>(resolve => service!.server.close(() => resolve()));
        }
      }
      const command = run.command;
      privateJson(run.tracePath, {
        version: 1, kind: options.session?.sharedState ? 'praman-shared-workflow' : 'praman-workflow', declaration: execution, initial, interactions,
        complete: Boolean(command && command.status === 'exited' && command.signal === null && !overflow && !run.error),
        command: command ? { status: command.status, code: command.code, signal: command.signal, executableHash: command.executableHash, executableHashAfter: command.executableHashAfter } : undefined,
      });
      privateJson(path.join(runDir, 'result.json'), { ...run, final, overflow });
      runs.push(run);
    }
  } catch (e) { error = String(e); }
  const verdict: Verdict = error || !runs.length || runs.some(run => run.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
    : runs.some(run => run.verdict === 'failed') ? 'failed' : 'passed';
  const proofPath = path.join(outDir, 'workflow.json');
  privateJson(proofPath, { version: 1, verdict, runs, error, declarationHash: (() => {
    try { return createHash('sha256').update(readFileSync(path.join(outDir, 'declaration.json'))).digest('hex'); } catch { return undefined; }
  })() });
  const result = {
    verdict, proofPath,
    scope: 'Declared command workflow against a simulated dependency; application reset/stateless scope is caller-declared, not a whole-world snapshot or historical repair proof.',
    runs: runs.map((run, index): WorkflowOccurrence => ({ run: index + 1, verdict: run.verdict, tracePath: run.tracePath, resultPath: path.join(path.dirname(run.tracePath), 'result.json'), workspacePath: run.workspacePath, dependencyVerdict: run.dependencyVerdict, commandVerdict: run.command?.verdict, resources: run.command?.resources ? { ...run.command.resources, error: undefined } : undefined })),
    nextAction: verdict === 'passed' ? 'Declared workflow checks passed in fresh isolated repeats. Preserve private trace and inputs.'
      : verdict === 'failed' ? 'Inspect private command and dependency observations against declared expectations; root cause is not established.'
      : 'Restore valid input, application reset and complete execution before claiming behavior.',
  };
  privateJson(path.join(outDir, 'feedback.json'), result);
  return result;
}

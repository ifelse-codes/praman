import { randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { hashSpec, proveChange } from '../eval/change.js';
import { demonstrateChange } from '../core/demonstrate.js';
import { environmentSpecSchema, environmentStateSchema } from './schema.js';
import { provisionKind, observeKind, resetKind, workloadKind, faultKind, destroyKind, kubectl } from './kind.js';
import { loadApplication, type ApplicationIntegration } from './application.js';
import { provisionDocker, observeDocker, workloadDocker, faultDocker, destroyDocker, saveWorldDocker } from './docker.js';
import { applyFault, removeFault } from './proxy.js';
import { loadWorld, worldIdPattern, type WorldStart } from './world.js';
import { stopProcesses } from './runtime.js';
import type { EnvironmentState, OperationResult } from './types.js';
import { saveFeedback, safeFeedbackValue } from '../review/feedback.js';
import type { ChangeProof } from '../case/change.js';
import { changeSpecSchema } from '../case/change.js';
import { normalizeIdentity } from '../eval/identity.js';

export type EnvironmentAction = 'create' | 'observe' | 'workload' | 'fault' | 'recover' | 'reset' | 'world-save' | 'verify' | 'demonstrate' | 'destroy';
export interface EnvironmentRequest { baseDir?: string; id?: string; specPath?: string; workload?: string; world?: string; fault?: string; }

export async function manageEnvironment(action: EnvironmentAction, request: EnvironmentRequest) {
  const base = resolve(request.baseDir ?? '.praman/environments');
  let state: EnvironmentState;
  if (action === 'create') {
    if (!request.specPath) throw new Error('create requires specPath');
    const specPath = resolve(request.specPath);
    const spec = environmentSpecSchema.parse(JSON.parse(readFileSync(specPath, 'utf8')));
    const specDir = dirname(specPath);
    const socket = spec.dockerHost.slice('unix://'.length);
    spec.dockerHost = `unix://${resolve(socket.startsWith('~/') ? join(homedir(), socket.slice(2)) : resolve(specDir, socket))}`;
    if (spec.application) spec.application.module = resolve(specDir, spec.application.module);
    if (spec.scenario) spec.scenario = resolve(specDir, spec.scenario);
    if (request.world !== undefined && (!worldIdPattern.test(request.world) || spec.provider !== 'docker')) throw new Error('world must be a 12-character world id and needs a Docker environment');
    const id = randomBytes(6).toString('hex');
    const directory = join(base, id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    state = { version: 3, id, directory, spec, clusterName: `praman-${id}`, clusterOwned: false, kubeconfig: join(directory, 'kubeconfig'), phase: 'creating', fault: false, generation: 0, processes: [], urls: {},
      ...(request.world ? { world: { id: request.world, directory: join(base, 'worlds', request.world) } } : {}) };
  } else {
    if (!request.id || !/^[a-f0-9]{12}$/.test(request.id)) throw new Error('A managed environment ID (12 hexadecimal characters) is required');
    state = environmentStateSchema.parse(JSON.parse(readFileSync(join(base, request.id, 'state.json'), 'utf8')));
    if (state.id !== request.id || state.directory !== join(base, request.id) || state.kubeconfig !== join(state.directory, 'kubeconfig') || state.clusterName !== `praman-${state.id}`) throw new Error('Persisted ownership does not match the requested environment');
  }
  const lock = join(state.directory, 'operation.lock');
  const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, action, at: new Date().toISOString() }));
  closeSync(fd);
  const save = () => {
    const temporary = join(state.directory, 'state.json.tmp');
    writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(temporary, join(state.directory, 'state.json'));
  };
  const started = new Date().toISOString();
  const proxyToken = state.proxy?.token;
  const docker = state.spec.provider === 'docker';
  let application: ApplicationIntegration | undefined;
  const observe = async () => ({
    infrastructure: docker ? await observeDocker(state) : await observeKind(state),
    application: application ? await application.observe(state) : null,
  });
  const destroyInfrastructure = () => docker ? destroyDocker(state, save) : destroyKind(state, save);
  // Restores the declared starting state: the world when there is one, otherwise the seed alone.
  let lastStarts: WorldStart[] = [];
  const resetInfrastructure = async () => {
    if (docker) {
      await destroyDocker(state, save);
      lastStarts = await provisionDocker(state, save);
      for (const name of state.spec.readinessWorkloads ?? []) await workloadDocker(state, name);
    } else await resetKind(state, save);
  };
  const resetEnvironment = async () => {
    if (docker && state.activeFault) await removeFault(state, save);
    else if (docker && state.fault) await faultDocker(state, false, save);
    if (application) await application.reset(state, save, resetInfrastructure);
    else await resetInfrastructure();
  };
  const worldRuns: Array<{ repeat: number; worldId: string; services: WorldStart[] }> = [];
  let result: OperationResult;
  let error: string | undefined;
  // One line about the fault windows, placed last: some MCP clients show only the start and end of a long result.
  let faultSummary: string | undefined;
  let usersSummary: string | undefined;
  const verificationOutput = action === 'verify' || action === 'demonstrate'
    ? join(state.directory, 'runs', `${Date.now()}-${action}`) : undefined;
  const feedbackContext = { environmentId: state.id, generation: state.generation, sourceHashes: state.sourceHashes,
    declarationPath: join(verificationOutput ?? state.directory, 'declaration.json'), operationLog: join(state.directory, 'operations.jsonl') };
  // Private replay copies. The proof engines own the run directory and refuse one that already
  // holds a run, so these are written after the engine returns (or when it never started).
  const saveDeclaration = () => {
    if (!verificationOutput || !state.scenario) return;
    mkdirSync(verificationOutput, { recursive: true, mode: 0o700 });
    const scenarioPath = join(verificationOutput, 'scenario.json');
    if (!existsSync(scenarioPath)) writeFileSync(scenarioPath, JSON.stringify(state.scenario, null, 2), { mode: 0o600 });
    const declaration = { ...state.spec, scenario: scenarioPath };
    writeFileSync(feedbackContext.declarationPath, JSON.stringify(declaration, null, 2), { mode: 0o600 });
  };
  try {
    if (state.phase === 'destroyed' && action !== 'destroy') throw new Error('This environment was destroyed; create a new instance');
    if (state.spec.application && !['destroy', 'workload', 'fault', 'recover', 'world-save'].includes(action)) {
      application = await loadApplication(state.spec.application.module);
    }
    if (action === 'create') {
      save();
      if (application && state.spec.application) {
        state.spec.application.config = application.configure(state.spec.application.config, dirname(resolve(request.specPath!)), state.spec);
        state.privateInputs = application.secrets?.(state.spec.application.config) ?? [];
      }
      if (state.spec.scenario) {
        const scenario = changeSpecSchema.parse(JSON.parse(readFileSync(state.spec.scenario, 'utf8')));
        const scenarioDirectory = dirname(state.spec.scenario);
        normalizeIdentity(scenario.identity, scenarioDirectory);
        if (scenario.diffPath) scenario.diffPath = resolve(scenarioDirectory, scenario.diffPath);
        for (const step of scenario.steps) if (step.action === 'upload') step.path = resolve(scenarioDirectory, step.path);
        for (const window of scenario.faults ?? []) {
          if (!state.spec.faults?.[window.name]) throw new Error(`The scenario names fault "${window.name}", which this environment does not declare`);
        }
        state.scenario = scenario;
      }
      save();
      if (docker) lastStarts = await provisionDocker(state, save); else await provisionKind(state, save);
      if (application) await application.start(state, save);
      if (docker) for (const name of state.spec.readinessWorkloads ?? []) await workloadDocker(state, name);
      const evidence = { ...await observe(), urls: state.urls, sourceHashes: state.sourceHashes, ...(state.world ? { world: { id: state.world.id, services: lastStarts } } : {}) };
      state.phase = 'ready';
      if (state.scenario) writeFileSync(join(state.directory, 'scenario.json'), JSON.stringify(state.scenario, null, 2));
      result = { verdict: 'passed', evidence };
    } else if (action === 'observe') {
      result = { verdict: 'passed', evidence: await observe() };
    } else if (action === 'workload') {
      if (state.phase !== 'ready' || (!docker && state.fault)) throw new Error('Workloads require a ready environment and an available target dependency');
      if (!request.workload) throw new Error('workload requires a declared workload name');
      result = { verdict: 'passed', evidence: docker ? await workloadDocker(state, request.workload) : await workloadKind(state, request.workload) };
    } else if (action === 'fault' || action === 'recover') {
      let evidence: unknown;
      if (!docker && request.fault !== undefined) throw new Error('Named network faults need a Docker environment');
      if (!docker) evidence = await faultKind(state, action === 'fault', save);
      else if (action === 'fault' && request.fault !== undefined) {
        if (state.phase !== 'ready') throw new Error('Faults require a ready environment');
        evidence = await applyFault(state, request.fault, save);
      } else if (action === 'recover' && state.activeFault) evidence = await removeFault(state, save);
      else if (!state.spec.faultService) throw new Error('This environment declares no faultService; name one of its declared faults');
      else evidence = await faultDocker(state, action === 'fault', save);
      result = { verdict: 'passed', evidence };
    } else if (action === 'reset') {
      await resetEnvironment();
      const evidence = await observe();
      state.generation += 1; state.phase = 'ready';
      result = { verdict: 'passed', evidence };
    } else if (action === 'world-save') {
      if (!docker || state.phase !== 'ready' || state.fault) throw new Error('A world can only be saved from a ready, recovered Docker environment');
      const saved = await saveWorldDocker(state, join(base, 'worlds'));
      // Prove the saved world is readable and unchanged before reporting it.
      await loadWorld({ id: saved.id, directory: saved.directory }, { ...state, spec: state.spec });
      result = { verdict: 'passed', evidence: { world: { id: saved.id, services: saved.manifest.services }, observed: await observe() } };
    } else if (action === 'verify' || action === 'demonstrate') {
      if (state.phase !== 'ready' || state.fault || !state.scenario) throw new Error('Proof requires a ready, recovered environment with a declared application scenario');
      if (state.world && action === 'demonstrate') throw new Error('demonstrate is not supported for environments created from a world; its recording would start from a used copy');
      const observed = await observe();
      const beforeRepeat = state.world ? async (index: number) => {
        const address = state.scenario!.afterUrl;
        await resetEnvironment();
        if (state.scenario!.afterUrl !== address) throw new Error('The application address changed while restoring the world');
        if (!lastStarts.length || lastStarts.some(start => !start.matchesWorld)) throw new Error('The restored data does not match the world');
        worldRuns.push({ repeat: index + 1, worldId: state.world!.id, services: lastStarts });
      } : undefined;
      // Fault windows run inside this process: the operation lock keeps any other action out meanwhile.
      const faults = docker && state.scenario.faults ? {
        apply: (name: string) => applyFault(state, name, save),
        remove: async (name: string) => {
          if (state.activeFault?.name !== name) throw new Error(`Fault "${name}" is not the active fault`);
          return removeFault(state, save);
        },
        clear: async () => state.activeFault ? removeFault(state, save) : undefined,
      } : undefined;
      const hooks = beforeRepeat || faults ? { ...(beforeRepeat ? { beforeRepeat } : {}), ...(faults ? { faults } : {}) } : undefined;
      const verification = action === 'verify'
        ? await proveChange(state.scenario, verificationOutput!, feedbackContext, hooks)
        : await demonstrateChange(state.scenario, verificationOutput!, feedbackContext);
      saveDeclaration();
      if (state.world) writeFileSync(join(verificationOutput!, 'world-runs.json'), JSON.stringify({ world: state.world.id, runs: worldRuns }, null, 2), { mode: 0o600 });
      // A short per-run view of the fault windows, so an agent sees it even when the full proof is cut off.
      const windowsOf = (run: { verdict: string; faults?: unknown[] }) => ({ verdict: run.verdict, windows: (run.faults ?? []).filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && 'name' in row)
        .map(row => ({ name: row.name, applied: !!row.applied, removed: !!row.removed, ...(row.error ? { failed: true } : {}) })) });
      const faultWindows = state.scenario.faults && 'proof' in verification ? {
        ...(verification.proof.before ? { before: windowsOf(verification.proof.before) } : {}),
        repeats: verification.proof.after.map(windowsOf) } : undefined;
      if (faultWindows) {
        const line = (label: string, run: ReturnType<typeof windowsOf>) => `${label} ${run.verdict}: ${run.windows.length ? run.windows.map(window =>
          `${window.name} ${window.failed ? 'failed' : window.applied && window.removed ? 'applied and removed' : window.applied ? 'applied, not removed' : 'not applied'}`).join(', ') : 'no window ran'}`;
        faultSummary = [...(faultWindows.before ? [line('baseline', faultWindows.before)] : []), ...faultWindows.repeats.map((run, index) => line(`repeat ${index + 1}`, run))].join('; ');
      }
      if (state.scenario.users && 'proof' in verification) {
        usersSummary = verification.proof.after.map((run, index) => `repeat ${index + 1} ${run.verdict}: ${run.users?.length ?? 0} users [${(run.users ?? []).map(row => row.run.verdict).join(', ')}], peak ${run.peakConcurrency ?? 0}, invariants [${(run.invariants ?? []).map(row => row.verdict).join(', ')}]`).join('; ');
      }
      result = { verdict: verification.verdict, evidence: { output: verificationOutput, environmentId: state.id, generation: state.generation,
        sourceHashes: state.sourceHashes, observed, ...(state.world ? { world: { id: state.world.id, runs: worldRuns } } : {}), ...(faultWindows ? { faultWindows } : {}), ...verification } };
    } else {
      const errors: string[] = [];
      try { await stopProcesses(state, save); } catch (e) { errors.push(String(e)); }
      try { await destroyInfrastructure(); } catch (e) { errors.push(String(e)); }
      if (errors.length) throw new Error(errors.join('\n'));
      state.phase = 'destroyed';
      result = { verdict: 'passed', evidence: { ...(docker ? { containersAbsent: true } : { clusterAbsent: true }), ownedProcessesRemaining: state.processes.length } };
    }
    save();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (!docker && (action === 'create' || action === 'reset') && state.clusterOwned && !state.fault) {
      const diagnostics: Record<string, unknown> = {};
      for (const resource of ['nodes', 'pods', 'events']) {
        try { diagnostics[resource] = JSON.parse(await kubectl(state, ['get', resource, '--all-namespaces', '-o', 'json'], { timeoutMs: 8_000 })); }
        catch (diagnosticError) { diagnostics[resource] = { unavailable: String(diagnosticError) }; }
      }
      for (const app of ['kube-proxy', 'kube-dns']) {
        try { diagnostics[`${app}Logs`] = await kubectl(state, ['--namespace=kube-system', 'logs', '-l', `k8s-app=${app}`, '--tail=80', '--prefix=true'], { timeoutMs: 8_000 }); }
        catch (diagnosticError) { diagnostics[`${app}Logs`] = { unavailable: String(diagnosticError) }; }
      }
      writeFileSync(join(state.directory, `failure-${Date.now()}.json`), JSON.stringify(diagnostics, null, 2), { mode: 0o600 });
    }
    if (action === 'create') {
      try { await stopProcesses(state, save); } catch (cleanupError) { error += `\nProcess cleanup: ${cleanupError}`; }
      try { await destroyInfrastructure(); } catch (cleanupError) { error += `\nInfrastructure cleanup: ${cleanupError}`; }
    }
    if (action === 'create' || action === 'reset' || action === 'destroy') state.phase = 'failed';
    save();
    result = { verdict: 'insufficient_evidence', evidence: { error } };
    if (verificationOutput && state.scenario) {
      saveDeclaration();
      mkdirSync(verificationOutput, { recursive: true, mode: 0o700 });
      const proof: ChangeProof = { mode: state.scenario.mode, baselineKind: state.scenario.baselineKind, specHash: hashSpec(state.scenario), verifiedAt: new Date().toISOString(),
        scope: 'Only the declared scenario; managed preflight did not complete and no application defect is established.',
        verdict: 'insufficient_evidence', reason: 'Managed preflight unavailable; no scenario execution was authorized.',
        ...(state.scenario.mode === 'acceptance' ? {} : { before: { url: state.scenario.beforeUrl!, verdict: 'not_executed' as const, checks: [], screenshots: [], error } }),
        after: [] };
      writeFileSync(join(verificationOutput, 'proof.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
      result = { verdict: proof.verdict, evidence: { output: verificationOutput, proof,
        ...saveFeedback(state.scenario, proof, verificationOutput, feedbackContext) } };
    }
  } finally { unlinkSync(lock); }
  const record = { action, started, finished: new Date().toISOString(), id: state.id, directory: state.directory, phase: state.phase, generation: state.generation, ...result, ...(error ? { error } : {}), ...(faultSummary ? { faultSummary } : {}), ...(usersSummary ? { usersSummary } : {}) };
  appendFileSync(join(state.directory, 'operations.jsonl'), JSON.stringify(record) + '\n', { mode: 0o600 });
  const secrets = [state.ownershipToken, proxyToken, state.proxy?.token, ...(state.privateInputs ?? []),
    ...Object.values(state.spec.services ?? {}).flatMap(service => Object.entries(service.env ?? {})
      .filter(([key]) => /password|secret|token|key|credential/i.test(key)).map(([, value]) => value))]
    .filter((value): value is string => !!value);
  return safeFeedbackValue(record, state.scenario, secrets);
}

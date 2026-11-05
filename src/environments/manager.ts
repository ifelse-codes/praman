import { randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { hashSpec, proveChange } from '../eval/change.js';
import { demonstrateChange } from '../core/demonstrate.js';
import { environmentSpecSchema, environmentStateSchema } from './schema.js';
import { provisionKind, observeKind, resetKind, workloadKind, faultKind, destroyKind, kubectl } from './kind.js';
import { loadApplication, type ApplicationIntegration } from './application.js';
import { provisionDocker, observeDocker, workloadDocker, faultDocker, destroyDocker } from './docker.js';
import { stopProcesses } from './runtime.js';
import type { EnvironmentState, OperationResult } from './types.js';
import { saveFeedback, safeFeedbackValue } from '../review/feedback.js';
import type { ChangeProof } from '../case/change.js';
import { changeSpecSchema } from '../case/change.js';
import { normalizeIdentity } from '../eval/identity.js';

export type EnvironmentAction = 'create' | 'observe' | 'workload' | 'fault' | 'recover' | 'reset' | 'verify' | 'demonstrate' | 'destroy';
export interface EnvironmentRequest { baseDir?: string; id?: string; specPath?: string; workload?: string; }

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
    const id = randomBytes(6).toString('hex');
    const directory = join(base, id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    state = { version: 3, id, directory, spec, clusterName: `praman-${id}`, clusterOwned: false, kubeconfig: join(directory, 'kubeconfig'), phase: 'creating', fault: false, generation: 0, processes: [], urls: {} };
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
  const docker = state.spec.provider === 'docker';
  let application: ApplicationIntegration | undefined;
  const observe = async () => ({
    infrastructure: docker ? await observeDocker(state) : await observeKind(state),
    application: application ? await application.observe(state) : null,
  });
  const destroyInfrastructure = () => docker ? destroyDocker(state, save) : destroyKind(state, save);
  let result: OperationResult;
  let error: string | undefined;
  const verificationOutput = action === 'verify' || action === 'demonstrate'
    ? join(state.directory, 'runs', `${Date.now()}-${action}`) : undefined;
  const feedbackContext = { environmentId: state.id, generation: state.generation, sourceHashes: state.sourceHashes,
    declarationPath: join(verificationOutput ?? state.directory, 'declaration.json'), operationLog: join(state.directory, 'operations.jsonl') };
  const saveDeclaration = () => {
    if (!verificationOutput || !state.scenario) return;
    mkdirSync(verificationOutput, { recursive: true, mode: 0o700 });
    const scenarioPath = join(verificationOutput, 'scenario.json');
    writeFileSync(scenarioPath, JSON.stringify(state.scenario, null, 2), { mode: 0o600 });
    const declaration = { ...state.spec, scenario: scenarioPath };
    writeFileSync(feedbackContext.declarationPath, JSON.stringify(declaration, null, 2), { mode: 0o600 });
  };
  try {
    if (state.phase === 'destroyed' && action !== 'destroy') throw new Error('This environment was destroyed; create a new instance');
    if (state.spec.application && !['destroy', 'workload', 'fault', 'recover'].includes(action)) {
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
        state.scenario = scenario;
      }
      save();
      if (docker) await provisionDocker(state, save); else await provisionKind(state, save);
      if (application) await application.start(state, save);
      if (docker) for (const name of state.spec.readinessWorkloads ?? []) await workloadDocker(state, name);
      const evidence = { ...await observe(), urls: state.urls, sourceHashes: state.sourceHashes };
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
      result = { verdict: 'passed', evidence: docker ? await faultDocker(state, action === 'fault', save) : await faultKind(state, action === 'fault', save) };
    } else if (action === 'reset') {
      if (docker && state.fault) await faultDocker(state, false, save);
      const resetInfrastructure = async () => {
        if (docker) {
          await destroyDocker(state, save);
          await provisionDocker(state, save);
          for (const name of state.spec.readinessWorkloads ?? []) await workloadDocker(state, name);
        } else await resetKind(state, save);
      };
      if (application) await application.reset(state, save, resetInfrastructure);
      else await resetInfrastructure();
      const evidence = await observe();
      state.generation += 1; state.phase = 'ready';
      result = { verdict: 'passed', evidence };
    } else if (action === 'verify' || action === 'demonstrate') {
      saveDeclaration();
      if (state.phase !== 'ready' || state.fault || !state.scenario) throw new Error('Proof requires a ready, recovered environment with a declared application scenario');
      const observed = await observe();
      const verification = action === 'verify'
        ? await proveChange(state.scenario, verificationOutput!, feedbackContext)
        : await demonstrateChange(state.scenario, verificationOutput!, feedbackContext);
      result = { verdict: verification.verdict, evidence: { output: verificationOutput, environmentId: state.id, generation: state.generation,
        sourceHashes: state.sourceHashes, observed, ...verification } };
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
  const record = { action, started, finished: new Date().toISOString(), id: state.id, directory: state.directory, phase: state.phase, generation: state.generation, ...result, ...(error ? { error } : {}) };
  appendFileSync(join(state.directory, 'operations.jsonl'), JSON.stringify(record) + '\n', { mode: 0o600 });
  const secrets = [state.ownershipToken, ...(state.privateInputs ?? []),
    ...Object.values(state.spec.services ?? {}).flatMap(service => Object.entries(service.env ?? {})
      .filter(([key]) => /password|secret|token|key|credential/i.test(key)).map(([, value]) => value))]
    .filter((value): value is string => !!value);
  return safeFeedbackValue(record, state.scenario, secrets);
}

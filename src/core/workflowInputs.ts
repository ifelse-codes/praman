import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workflowSchema } from '../case/workflow.js';
import { createServiceState } from '../gateway/service.js';
import { normalizeIdentity } from '../eval/identity.js';

export function readWorkflowJson(file: string): unknown {
  const info = statSync(file);
  if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Input must be a regular JSON file no larger than 1 MiB');
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Validate and capture every workflow before commands; retain original path semantics. */
export function captureCampaignWorkflows(cases: string[], specPath: string, outDir: string, persistent = false) {
  const inputs: string[] = [];
  for (const [caseIndex, file] of cases.entries()) {
    const inputPath = path.resolve(path.dirname(path.resolve(specPath)), file);
    const workflow = workflowSchema.parse(readWorkflowJson(inputPath));
    for (const command of [workflow.command, ...(workflow.applicationState.kind === 'reset' ? [workflow.applicationState.command] : [])]) {
      if (command.current.cwd !== '{{runDir}}') throw new Error('Campaign command/reset cwd must be exactly {{runDir}}');
      if (command.current.executable.includes(path.sep)) command.current.executable = path.resolve(path.dirname(inputPath), command.current.executable);
      normalizeIdentity(command.current.identity, path.dirname(inputPath));
      for (const check of command.checks) if (check.source === 'artifact' && (path.isAbsolute(check.path!) || check.path!.split(/[\\/]/).includes('..'))) throw new Error('Campaign artifacts must stay relative to the workspace');
    }
    let declaredRequests = 0;
    if (workflow.dependency.start.kind === 'snapshot') {
      const snapshot = createServiceState(workflow.dependency.service, readWorkflowJson(path.resolve(path.dirname(inputPath), workflow.dependency.start.path))).snapshot();
      const snapshotPath = path.join(outDir, `snapshot-${caseIndex}.json`);
      writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: 'wx' });
      declaredRequests = snapshot.requests;
      workflow.dependency.start.path = snapshotPath;
    }
    if (persistent && workflow.dependency.final.requests < declaredRequests) throw new Error('Persistent request delta must be nonnegative');
    const input = path.join(outDir, `case-${caseIndex}.json`);
    writeFileSync(input, JSON.stringify(workflow, null, 2), { mode: 0o600, flag: 'wx' });
    inputs.push(input);
  }
  return inputs;
}

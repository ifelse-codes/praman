import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { workflowTraceSchema } from './workflow.js';

/** A complete captured workflow carries explicit expectations; arbitrary span names do not. */
export function reconstructWorkflow(tracePath: string, outputDirectory: string, name: string) {
  const outDir = path.resolve(outputDirectory);
  mkdirSync(path.dirname(outDir), { recursive: true, mode: 0o700 });
  mkdirSync(outDir, { mode: 0o700 });
  const save = (file: string, value: unknown) => writeFileSync(path.join(outDir, file), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  try {
    const info = statSync(tracePath);
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Trace must be a regular file no larger than 4 MiB');
    const bytes = readFileSync(tracePath);
    const raw: unknown = JSON.parse(bytes.toString('utf8'));
    save('source-trace.json', raw);
    const trace = workflowTraceSchema.parse(raw);
    const spec = trace.declaration;
    const hash = createHash('sha256').update(JSON.stringify(spec.dependency.service)).digest('hex');
    if (trace.initial.declarationHash !== hash || !Object.hasOwn(spec.dependency.service.states, trace.initial.state)
      || trace.initial.requests > Number.MAX_SAFE_INTEGER) throw new Error('Starting snapshot is incompatible');
    for (const command of [spec.command, ...(spec.applicationState.kind === 'reset' ? [spec.applicationState.command] : [])]) {
      if (!path.isAbsolute(command.current.cwd) || command.current.executable.includes(path.sep) && !path.isAbsolute(command.current.executable)) throw new Error('Captured command paths must be normalized');
    }
    // Preserve independent declared expectations, not the captured observed status/body as a new oracle.
    save('starting-snapshot.json', trace.initial);
    spec.dependency.start = { kind: 'snapshot', path: 'starting-snapshot.json' };
    save('workflow.json', spec);
    save('provenance.json', { name, traceHash: createHash('sha256').update(bytes).digest('hex'), attribution: 'Caller-supplied trace and expectations; not signed history or a diagnosed defect.' });
    return { verdict: 'passed' as const, casePath: path.join(outDir, 'workflow.json'), scope: 'Executable declared command/dependency workflow reconstructed. Replay is required; construction alone is not proof.' };
  } catch (e) {
    save('error.json', { error: String(e) });
    return { verdict: 'insufficient_evidence' as const, evidencePath: path.join(outDir, 'error.json'), scope: 'No executable case established. Legacy spans, missing inputs/expectations or incomplete capture cannot establish reconstruction.' };
  }
}

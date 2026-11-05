import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Diagnostic {
  category: 'check_mismatch' | 'execution_unavailable' | 'evidence_unavailable' | 'proof_gate' | 'story_preflight' | 'recording_unavailable';
  version?: 'before' | 'current';
  run?: number;
  /** Declaration check index, zero-based; -1 denotes the command exit check. */
  checkIndex?: number;
  stage?: 'before' | 'current' | 'code';
  beat?: number;
  step?: number;
  references: Array<{ path: string; pointer?: string; private: true }>;
  nextAction: string;
}

export function formatSummary(result: { verdict: string; diagnostics?: Diagnostic[]; report?: string; proofVerdict?: string; proof?: { verdict: string } }, markdown = false): string {
  const lines = [`Outcome: ${result.verdict}`];
  const proofVerdict = result.proofVerdict ?? result.proof?.verdict;
  if (proofVerdict && proofVerdict !== result.verdict) lines.push(`Proof: ${proofVerdict} (separate from delivery)`);
  const shown = markdown ? result.diagnostics ?? [] : (result.diagnostics ?? []).slice(0, 1);
  for (const diagnostic of shown) {
    const location = [diagnostic.version, diagnostic.run === undefined ? undefined : `run ${diagnostic.run}`,
      diagnostic.checkIndex === undefined ? undefined : diagnostic.checkIndex === -1 ? 'exit check' : `check[${diagnostic.checkIndex}]`,
      diagnostic.stage === undefined ? undefined : `stage ${diagnostic.stage}`,
      diagnostic.beat === undefined ? undefined : `beat[${diagnostic.beat}]`,
      diagnostic.step === undefined ? undefined : `step[${diagnostic.step}]`].filter(Boolean).join(' ');
    lines.push(`${diagnostic.category}${location ? `: ${location}` : ''}`,
      ...diagnostic.references.map(ref => {
        const label = `${ref.path}${ref.pointer ? `#${ref.pointer}` : ''}`;
        const url = pathToFileURL(ref.path); if (ref.pointer) url.hash = ref.pointer;
        return markdown ? `Private evidence: [open locally](${url.href})` : `Private evidence: ${label}`;
      }),
      `Next: ${diagnostic.nextAction}`);
  }
  if (!markdown && (result.diagnostics?.length ?? 0) > shown.length) lines.push(`Additional diagnostics: ${result.diagnostics!.length - shown.length}; inspect the private report or JSON output.`);
  if (!result.diagnostics?.length) lines.push(result.verdict === 'passed'
    ? 'Next: Preserve private evidence; rerun after relevant changes.'
    : 'Next: Inspect the private report and restore complete mode-specific evidence before rerunning.');
  if (result.report) lines.push(`Report: ${result.report}`);
  return lines.join('\n');
}

interface DiagnosticRun {
  verdict: string;
  error?: string;
  failedStep?: number;
  checks: Array<{ id: string; verdict: string; evidence?: string; screenshot?: string; observed?: unknown }>;
}

/** Indexes and JSON pointers identify private data without copying its contents. */
export function checkDiagnostics(outDir: string, proof: { verdict: string; mode?: string; regressionCheck?: string; before?: DiagnosticRun; after?: DiagnosticRun[]; current?: DiagnosticRun[] }, checkIds: string[]): Diagnostic[] {
  const command = proof.current !== undefined;
  const diagnostics: Diagnostic[] = [];
  const ref = (file: string, pointer?: string) => ({ path: resolve(outDir, file), ...(pointer ? { pointer } : {}), private: true as const });
  const runs = [...(proof.before ? [{ version: 'before' as const, run: 1, value: proof.before }] : []),
    ...(proof.current ?? proof.after ?? []).map((value, i) => ({ version: 'current' as const, run: i + 1, value }))];
  for (const { version, run, value } of runs) {
    const directory = version === 'before' ? 'before' : `${command ? 'current' : 'after'}-${run}`;
    const proofPointer = version === 'before' ? '/before' : `/${command ? 'current' : 'after'}/${run - 1}`;
    const result = `${directory}/result.json`;
    if (value.error || value.failedStep !== undefined) diagnostics.push({
      category: 'execution_unavailable', version, run, step: value.failedStep,
      references: [ref('proof.json', proofPointer), ...(existsSync(join(outDir, result)) ? [ref(result)] : [])],
      nextAction: 'Inspect the private execution failure; restore prerequisites and rerun in a fresh directory.',
    });
    for (const [index, row] of value.checks.entries()) {
      const unavailable = row.verdict !== 'passed' && row.verdict !== 'failed'
        || !command && (!row.screenshot || !existsSync(row.screenshot) || !Object.hasOwn(row, 'observed'));
      if (row.verdict === 'passed' && !unavailable) continue;
      // Expected baseline mismatches do not request a current repair.
      if (version === 'before' && row.verdict === 'failed' && !unavailable
        && !(proof.mode === 'repair' && proof.verdict !== 'passed' && row.id !== proof.regressionCheck)) continue;
      const checkIndex = row.id === '$exit' && command ? -1 : checkIds.indexOf(row.id);
      diagnostics.push({
        category: unavailable ? 'evidence_unavailable' : 'check_mismatch', version, run, checkIndex,
        references: [ref('proof.json', `${proofPointer}/checks/${index}`),
          ...(existsSync(join(outDir, result)) ? [ref(result, `/checks/${index}`)] : []),
          ...(command && row.evidence ? [ref(row.evidence)] : []),
          ref(command ? 'declaration.json' : 'scenario.json', checkIndex === -1 ? '/expectedExit' : `/checks/${checkIndex}`)],
        nextAction: row.verdict === 'failed'
          ? proof.mode === 'acceptance'
            ? 'Inspect the declared current requirement, private expectation and observation, and run preconditions before deciding whether the requirement or implementation needs correction; rerun all current checks. A mismatch alone does not establish an application defect.'
            : 'Compare the private expectation and observation; investigate the mismatch and rerun all declared checks.'
          : 'Restore the missing execution or evidence before diagnosing a defect; rerun all declared checks.',
      });
    }
  }
  if (proof.verdict !== 'passed' && !diagnostics.length) diagnostics.push({
    category: 'proof_gate', references: [ref('proof.json')],
    nextAction: 'Inspect the private mode-specific proof gate; restore complete evidence without weakening acceptance or replay requirements.',
  });
  return diagnostics;
}

/** Read only structural fields from a locally generated receipt; never forward its error/scenes. */
export function recordingDiagnostic(outDir: string, failureFile: string): Diagnostic {
  const receipt = join(outDir, 'video', 'preflight', 'preflight.json');
  const captureReceipt = join(outDir, 'video', 'recording-failure.json');
  let position: { stage?: unknown; beat?: unknown; step?: unknown } = {};
  let blocked = false;
  if (existsSync(receipt)) {
    try {
      const value = JSON.parse(readFileSync(receipt, 'utf8'));
      blocked = value.status === 'blocked';
      if (blocked) position = value.position ?? {};
    } catch { /* Malformed evidence is not authority for a position. */ }
  }
  if (!blocked && existsSync(captureReceipt)) {
    try { position = JSON.parse(readFileSync(captureReceipt, 'utf8')).position ?? {}; }
    catch { /* No position is safer than guessing from an exception. */ }
  }
  const stage = position.stage === 'after' ? 'current' : position.stage;
  return {
    category: blocked ? 'story_preflight' : 'recording_unavailable',
    ...(['before', 'current', 'code'].includes(String(stage)) ? { stage: stage as 'before' | 'current' | 'code' } : {}),
    ...(Number.isInteger(position.beat) && Number(position.beat) >= 0 ? { beat: Number(position.beat) } : {}),
    ...(Number.isInteger(position.step) && Number(position.step) >= 0 ? { step: Number(position.step) } : {}),
    references: [{ path: resolve(failureFile), private: true }, ...(blocked ? [{ path: resolve(receipt), private: true as const }] : existsSync(captureReceipt) ? [{ path: resolve(captureReceipt), private: true as const }] : [])],
    nextAction: blocked ? 'Inspect the private story receipt at the indexed beat/step; correct execution or framing and rerun with fresh proof.'
      : 'Inspect the private recording failure; restore recording prerequisites and rerun with fresh proof and matching replays.',
  };
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ChangeSpec, ChangeProof, ScenarioRun } from '../case/change.js';
import type { Verdict } from '../eval/eval.js';
import { checkDiagnostics, formatSummary, formatTable, type Diagnostic } from './diagnostics.js';
import { describeDiagnosis } from './classify.js';
import { renderEvidenceHtml, type EvidenceHtmlModel, type HtmlCheck, type HtmlImage, type HtmlRunCell, type HtmlUsersRun } from './html.js';
import { identityComplete, sameIdentity, type IdentitySnapshot } from '../eval/identity.js';

export interface FeedbackContext {
  environmentId?: string;
  generation?: number;
  sourceHashes?: Record<string, string>;
  declarationPath?: string;
  operationLog?: string;
}
const sensitive = /password|passwd|secret|token|cookie|authorization|credential|api[-_]?key|session|signature|headers|postData|formData/i;
const privateText = /^(evidence|error|recordingError|body)$/i;
// Fields that hold a file path PRAMAN made, or was given as its output location. A caller-chosen folder name may equal a private value.
const outputPathKeys = /^(report|reportHtml|feedbackPath|proofPath|output|directory|declarationPath|operationLog|screenshot|screenshots|demoVideo|video)$/;
export const pathNote = 'A known private value occurs in a returned path; the folder name was chosen by the caller.';

/** Safe presentation only. Raw browser/network artifacts remain private, not sanitized exports. */
export function safeFeedbackValue<T>(value: T, spec?: ChangeSpec, secrets: string[] = [], options: { reveal?: boolean } = {}): T {
  // `reveal` is the private local view: declaration text and expected/observed values stay, secrets and credential-like fields do not.
  const reveal = options.reveal === true;
  const hidden = new Set(secrets.filter(Boolean));
  for (const step of spec?.steps ?? []) {
    // Typed text is a private input like a fill value; select options are application text, already withheld by field.
    if (step.action === 'fill' && step.value) hidden.add(step.value);
    if (step.action === 'type') hidden.add(step.text);
  }
  function collect(item: unknown): void {
    if (!item || typeof item !== 'object') return;
    if ('name' in item && typeof item.name === 'string' && sensitive.test(item.name) && 'value' in item
      && (typeof item.value === 'string' || typeof item.value === 'number')) hidden.add(String(item.value));
    for (const [key, child] of Object.entries(item)) {
      if (sensitive.test(key) && (typeof child === 'string' || typeof child === 'number') && String(child)) hidden.add(String(child));
      else collect(child);
    }
  }
  collect(value);
  const variants = [...hidden].flatMap(text => [text, encodeURIComponent(text), encodeURIComponent(encodeURIComponent(text))]).sort((a, b) => b.length - a.length);
  const hiddenNumbers = new Set([...hidden].filter(value => value.trim() && Number.isFinite(Number(value))).map(Number));
  let pathMatched = false;
  /** An absolute file path, not a URL and not multi-line text. Anything else in a path field is redacted as usual. */
  const isPathValue = (value: string): boolean => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) ? !/[\r\n]|:\/\/|\b(?:authorization|cookie|password|passwd|secret|token|signature|credential|api[-_]?key)\s*[=:]/i.test(value) : false;
  function text(input: string): string {
    let result = input;
    for (const secret of variants) result = result.split(secret).join('[REDACTED]');
    // Drop the entire query/fragment: nested encoded optimizer URLs must not retain signed tokens.
    result = result.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`\\]+/gi, match => {
      try { const url = new URL(match); return `${url.protocol}//${url.host}${url.pathname}${url.search || url.hash ? '?[REDACTED]' : ''}`; }
      catch { return '[PRIVATE URL]'; }
    });
    result = result.replace(/(?:https?%3a%2f%2f|(?<![a-z0-9.:/])\/(?:_next\/image)?\?)[^\s<>"'`\\]+/gi, '[PRIVATE URL]');
    result = result.replace(/\b(?:authorization|cookie|set-cookie|password|passwd|secret|token|signature|credential|api[-_]?key)\s*[=:]\s*[^\r\n]+/gi, '[PRIVATE CREDENTIAL FIELD]');
    return result;
  }
  function keepPath(path: string): string {
    if (variants.some(secret => path.includes(secret))) pathMatched = true;
    return path;
  }
  function visit(item: unknown): unknown {
    if (typeof item === 'number' && hiddenNumbers.has(item)) return '[REDACTED]';
    if (typeof item === 'string') return text(item);
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    if ('name' in item && typeof item.name === 'string' && sensitive.test(item.name)) return { name: text(item.name), value: '[REDACTED]' };
    // Plain identifier keys are PRAMAN field names; redacting a short private value inside them broke the structure.
    const isReference = (item as { private?: unknown }).private === true;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [/^[A-Za-z_$][\w$]*$/.test(key) ? key : text(key),
      sensitive.test(key) ? '[REDACTED]'
        : typeof child === 'string' && (outputPathKeys.test(key) || (key === 'path' && isReference)) && isPathValue(child) ? keepPath(child)
        : Array.isArray(child) && outputPathKeys.test(key) ? child.map(entry => typeof entry === 'string' && isPathValue(entry) ? keepPath(entry) : visit(entry))
        : /^(identityBefore|identityAfter)$/.test(key) ? { status: identityComplete(child as IdentitySnapshot) ? 'recorded' : 'unavailable', details: 'Inspect private proof/result identity entries.' }
        : !reveal && /^(expected|observed)$/i.test(key) && child !== null && !['number', 'boolean', 'undefined'].includes(typeof child) ? '[Private value; inspect indexed evidence.]'
        : !reveal && ((/^(selector|target|title|scenario|requirement|change|note|text|url|checkId|afterStepId|failedStepId)$/i.test(key) && typeof child === 'string') || (key === 'id' && 'expected' in item)) ? '[Private declaration field; inspect indexed evidence.]'
        : !reveal && privateText.test(key) && typeof child === 'string' ? '[Private raw detail; inspect the referenced evidence locally.]' : visit(child)]));
  }
  const result = visit(value);
  // One note at the top of the result, never the value itself.
  if (pathMatched && result && typeof result === 'object' && !Array.isArray(result)) (result as Record<string, unknown>).pathNote = pathNote;
  return result as T;
}

export interface EvidenceReference { kind: 'proof' | 'result' | 'screenshot' | 'network'; path: string; exists: boolean; private: true; }
export interface FeedbackOccurrence {
  version: 'before' | 'current';
  run: number;
  afterStep?: number;
  failedStep?: number;
  completedSteps?: number;
  recordedVerdict: Verdict;
  verdict: Verdict;
  expected: unknown;
  observed?: unknown;
  gaps: string[];
  references: EvidenceReference[];
}
export interface CheckFeedback {
  checkId: string;
  checkIndex: number;
  kind: ChangeSpec['checks'][number]['kind'];
  target: string;
  status: 'current_failure' | 'resolved_regression' | 'historical_failure' | 'baseline_mismatch' | 'incomplete' | 'passed';
  category: 'behavior_mismatch' | 'missing_execution_or_evidence' | 'declared_expectation_satisfied' | 'historical_regression' | 'baseline_comparison';
  summary: string;
  rootCause: 'unknown';
  nextAction: string;
  occurrences: FeedbackOccurrence[];
}
export interface ChangeFeedback {
  mode: ChangeSpec['mode'];
  baselineKind?: ChangeSpec['baselineKind'];
  scenario: string;
  requirement: string;
  verdict: Verdict;
  verifiedAt: string;
  specHash: string;
  scope: string;
  context: FeedbackContext;
  provenanceLimit: string;
  privacyLimit: string;
  identityStatus: 'stable' | 'unavailable_or_changed';
  identityEvidence: { path: string; private: true };
  issues: string[];
  /** Many users: per repeat, the user verdicts, invariant kinds and verdicts and the peak concurrency (no application text). */
  concurrency?: Array<{ run: number; users: Verdict[]; peakConcurrency: number; invariants: Array<{ index: number; kind: string; verdict: Verdict }> }>;
  reproduction: { setup: string; steps: unknown[] };
  findings: CheckFeedback[];
}

/** Unredacted feedback for the private local view; every other caller uses `buildFeedback`. */
function rawFeedback(spec: ChangeSpec, proof: ChangeProof, outDir: string, context: FeedbackContext = {}): ChangeFeedback {
  const reference = (kind: EvidenceReference['kind'], path: string): EvidenceReference => ({ kind, path: resolve(path), exists: existsSync(path), private: true });
  const runs: Array<{ version: 'before' | 'current'; run: number; value?: ScenarioRun }> = [
    ...(spec.mode === 'acceptance' ? [] : [{ version: 'before' as const, run: 1, value: proof.before }]),
    ...Array.from({ length: Math.max(spec.repeats, proof.after.length) }, (_, i) => ({ version: 'current' as const, run: i + 1, value: proof.after[i] })),
  ];
  const issues: string[] = [];
  if (proof.after.length !== spec.repeats) issues.push(`Expected ${spec.repeats} current runs; retained ${proof.after.length}.`);
  if (proof.mode !== spec.mode || proof.baselineKind !== spec.baselineKind) issues.push('Proof mode or baseline attribution differs from the declaration.');
  for (const run of runs) {
    const label = `${run.version} run ${run.run}`;
    if (!run.value) { issues.push(`${label}: not executed.`); continue; }
    if (run.value.error) issues.push(`${label}: ${run.value.failedStep === undefined ? 'workflow execution unavailable' : `action at zero-based step ${run.value.failedStep} unavailable`}; inspect private result/proof.json.`);
    if (run.value.url !== (run.version === 'before' ? spec.beforeUrl : spec.afterUrl)) issues.push(`${label}: recorded target differs from the declaration.`);
    if (run.value.checks.length !== spec.checks.length || new Set(run.value.checks.map(row => row.id)).size !== spec.checks.length
      || run.value.checks.some(row => !spec.checks.some(check => check.id === row.id))) issues.push(`${label}: declared check coverage is incomplete or ambiguous.`);
    if (!['passed', 'failed'].includes(run.value.verdict)) issues.push(`${label}: run verdict is ${run.value.verdict}; no complete run claim.`);
  }
  const concurrency = spec.users ? proof.after.map((value, i) => ({ run: i + 1, users: (value.users ?? []).map(row => row.run.verdict), peakConcurrency: value.peakConcurrency ?? 0,
    invariants: (value.invariants ?? []).map((row, index) => ({ index, kind: row.kind, verdict: row.verdict })) })) : undefined;
  for (const row of concurrency ?? []) {
    if (row.peakConcurrency < 2) issues.push(`current run ${row.run}: the users did not run at the same time (peak concurrency ${row.peakConcurrency}).`);
    row.users.forEach((verdict, user) => { if (verdict !== 'passed') issues.push(`current run ${row.run}: user ${user + 1} ended ${verdict}.`); });
    for (const invariant of row.invariants) if (invariant.verdict !== 'passed') issues.push(`current run ${row.run}: invariant[${invariant.index}] (${invariant.kind}) is ${invariant.verdict}.`);
  }
  const findings = spec.checks.map((check): CheckFeedback => {
    const occurrences = runs.map(({ version, run, value }): FeedbackOccurrence => {
      const rows = value?.checks.filter(row => row.id === check.id) ?? [];
      const row = rows[0];
      const expected = row?.expected ?? (check.kind === 'visible' && version === 'before' ? check.beforeEquals ?? check.equals : check.equals);
      const gaps: string[] = [];
      if (!row) gaps.push('Declared check was not executed.');
      if (rows.length > 1) gaps.push('Duplicate check identity makes attribution ambiguous.');
      if (row && !Object.hasOwn(row, 'observed')) gaps.push('Observation unavailable.');
      if (row && (!row.screenshot || !existsSync(row.screenshot))) gaps.push('Screenshot evidence unavailable.');
      if (value?.error) gaps.push(value.failedStep === undefined ? 'Workflow did not complete; inspect private action error.' : `Workflow failed at zero-based step ${value.failedStep}.`);
      const references = [reference('proof', join(outDir, 'proof.json'))];
      references.push(reference('result', join(outDir, version === 'before' ? 'before' : `after-${run}`, 'result.json')));
      if (row?.screenshot) {
        references.push(reference('screenshot', row.screenshot));
        references.push(reference('network', join(dirname(row.screenshot), 'network.json')));
      }
      const verdict = !row ? 'not_executed' : gaps.length || !['passed', 'failed'].includes(row.verdict) ? 'insufficient_evidence' : row.verdict;
      return { version, run, afterStep: row?.afterStep ?? (check.kind === 'network' ? check.window.throughStep : check.afterStep), failedStep: value?.failedStep, completedSteps: value?.completedSteps,
        recordedVerdict: row?.verdict ?? 'not_executed', verdict, expected,
        ...(row && Object.hasOwn(row, 'observed') ? { observed: row.observed } : {}), gaps, references };
    });
    const current = occurrences.filter(row => row.version === 'current');
    // An actually observed mismatch remains actionable even when another run/action is incomplete.
    const failed = current.some(row => row.recordedVerdict === 'failed' && Object.hasOwn(row, 'observed'));
    const incomplete = current.some(row => row.verdict !== 'passed' && row.verdict !== 'failed');
    const baseline = occurrences.find(row => row.version === 'before');
    const historical = baseline?.verdict === 'failed' && spec.mode === 'repair' && spec.baselineKind === 'historical';
    const status = failed ? 'current_failure' : incomplete ? 'incomplete' : baseline?.verdict === 'failed'
      ? historical ? check.id === spec.regressionCheck && proof.verdict === 'passed' ? 'resolved_regression' : 'historical_failure' : 'baseline_mismatch'
      : baseline && baseline.verdict !== 'passed' ? 'incomplete' : 'passed';
    const target = 'selector' in check ? check.selector : check.kind === 'json' ? `${check.path} field ${check.field.join('.')}` : check.kind === 'network' ? 'browser network observation window' : 'browser runtime errors';
    const summary = status === 'current_failure' ? spec.mode === 'acceptance'
      ? 'The current requirement has an observed mismatch; this alone does not establish an application defect.'
      : 'The current version has an observed mismatch with this declared expectation.'
      : status === 'resolved_regression' ? 'The named historical failure was reproduced; all repeated current checks passed at test time.'
      : status === 'historical_failure' ? 'Previous-version mismatch retained; this is not a current repair request or proof of a resolved named regression.'
      : status === 'baseline_mismatch' ? `The ${spec.baselineKind} baseline differed from this expectation; no historical defect or resolved repair is claimed.`
      : status === 'incomplete' ? 'Execution or evidence is incomplete; no defect-free or resolved claim is justified.'
      : spec.mode === 'acceptance' ? 'The current requirement was satisfied in every repeated run, including any explicitly expected negative behavior.'
      : 'The declared expectation was satisfied, including any explicitly expected negative behavior.';
    const nextAction = status === 'current_failure' ? spec.mode === 'acceptance'
      ? 'Inspect the declared current requirement, private expectation and observation, and run preconditions; determine whether the requirement or implementation needs correction, then rerun all current checks. Root cause is not established.'
      : 'Compare private expected/observed evidence, investigate the declared behavior and rerun every current check. Root cause is not established.'
      : status === 'incomplete' ? 'Restore the missing action/observation/evidence and rerun the declared scenario; do not infer a business-rule violation from unavailable execution.'
      : status === 'historical_failure' ? 'Inspect the historical acceptance contract and proof-gate reason; do not request a current patch from historical evidence alone.'
      : status === 'baseline_mismatch' ? 'Inspect baseline/current evidence as a comparison, not a historical repair request.'
      : spec.mode === 'acceptance' ? 'Preserve this current-requirement evidence; rerun acceptance after relevant changes.'
      : 'No repair requested for this check. Preserve the evidence; rerun after relevant changes.';
    return { checkId: check.id, checkIndex: spec.checks.indexOf(check), kind: check.kind, target, status,
      category: status === 'current_failure' ? 'behavior_mismatch' : status === 'incomplete' ? 'missing_execution_or_evidence'
        : historical ? 'historical_regression' : status === 'baseline_mismatch' ? 'baseline_comparison' : 'declared_expectation_satisfied', summary, rootCause: 'unknown', nextAction, occurrences };
  });
  // Re-check retained evidence availability without rewriting the saved proof-at-test-time verdict.
  if (issues.length || findings.some(finding => finding.occurrences.some(row => row.version === 'current' && row.verdict !== 'passed'))) {
    for (const finding of findings) if (finding.status === 'resolved_regression') {
      finding.status = 'incomplete';
      finding.category = 'missing_execution_or_evidence';
      finding.summary = 'The recorded historical regression cannot be declared resolved with the currently available evidence.';
      finding.nextAction = 'Restore complete evidence and rerun all declared current checks before claiming resolution.';
    }
  }
  return ({ mode: spec.mode, baselineKind: spec.baselineKind, scenario: spec.title, requirement: spec.change, verdict: proof.verdict, verifiedAt: proof.verifiedAt, specHash: proof.specHash,
    scope: proof.scope, context, provenanceLimit: 'Source/build hashes and a supplied diff are context, not signed source-to-deployment provenance.',
    identityStatus: [...(proof.before ? [proof.before] : []), ...proof.after].every(run => sameIdentity(run.identityBefore, run.identityAfter) && sameIdentity(proof.after[0]?.identityBefore, run.identityBefore)) ? 'stable' : 'unavailable_or_changed',
    identityEvidence: { path: resolve(outDir, 'proof.json'), private: true as const },
    privacyLimit: 'Application text, identifiers, selectors, string/object expectations and observations, raw errors, known credentials and private fill inputs are withheld. Numeric scalars matching known private numeric values are also withheld, including equivalent leading-zero/exponent forms. Other numeric/boolean observations and caller-owned local evidence paths remain visible. Raw screenshots, scenarios, result/proof/network files remain private; no sanitized-export guarantee.',
    issues, ...(concurrency ? { concurrency } : {}), reproduction: { setup: context.environmentId
      ? `If the recorded instance is destroyed or unavailable, run praman environment create \"${context.declarationPath ?? '<original-private-declaration>'}\" --base <owned-base>, then praman environment verify <new-id> --base <owned-base>. Create a fresh managed instance, restore the failing run's state/preconditions from the private operation history (${context.operationLog ?? 'caller-owned history'}) and scenario before verifying; a fresh seed alone may not reproduce a stateful failure. Recorded localhost URLs are historical targets, not a live service guarantee. Workflow step indexes are zero-based.`
      : `Start caller-owned isolated ${spec.mode === 'acceptance' ? 'current application' : 'baseline/current applications'}, restore the declared seed and private inputs, and rerun this ${spec.mode} scenario. Recorded URLs may no longer be live. Verification does not require video.`,
      steps: spec.steps.map((step, index) => ({ step: index, action: step.action })) }, findings });
}
export function buildFeedback(spec: ChangeSpec, proof: ChangeProof, outDir: string, context: FeedbackContext = {}): ChangeFeedback {
  return safeFeedbackValue(rawFeedback(spec, proof, outDir, context), spec);
}

function markdown(value: unknown): string {
  return String(typeof value === 'string' ? value : JSON.stringify(value) ?? 'unavailable').replace(/[&<>`*_[\]\\]/g, char => `&#${char.charCodeAt(0)};`).replace(/\r?\n/g, '<br>');
}
export function formatFeedback(feedback: ChangeFeedback): string {
  const lines = [feedback.mode === 'acceptance' ? '# Current-requirement acceptance feedback' : '# Declared-scenario feedback', '', `**${feedback.mode} proof at test time: ${feedback.verdict}**`, '', markdown(feedback.scenario), '',
    feedback.mode === 'acceptance' ? 'Current-only acceptance: no baseline was evaluated.'
      : `Baseline: ${feedback.baselineKind}. Attribution is caller-declared, not independently authenticated history.`, '',
    `Requirement: ${markdown(feedback.requirement)}`, '', `Scope: ${markdown(feedback.scope)}`, '',
    `Context: ${markdown(feedback.context)}`, '', feedback.provenanceLimit, '', feedback.privacyLimit, '',
    `Identity: ${feedback.identityStatus}. [Private identity coverage and hashes](${pathToFileURL(feedback.identityEvidence.path).href}) are in per-run identityBefore/identityAfter entries.`, '',
    ...(feedback.concurrency ? ['## Users and invariants', '', ...formatTable(['Run', 'Users', 'Peak concurrency', 'Invariants'], feedback.concurrency.map(row =>
      [String(row.run), row.users.map((verdict, user) => `${user + 1}: ${verdict}`).join(', '), String(row.peakConcurrency), row.invariants.map(item => `[${item.index}] ${item.kind}: ${item.verdict}`).join(', ') || 'none'])), ''] : []),
    '## Reproduction', '', markdown(feedback.reproduction.setup), '',
    ...feedback.reproduction.steps.map(step => `- ${markdown(step)}`), '', '## Evidence and findings', '',
    ...feedback.issues.map(issue => `- ${markdown(issue)}`)];
  for (const finding of feedback.findings) {
    lines.push('', `### Check[${finding.checkIndex}] — ${finding.status}`, '', finding.summary, '', 'Root cause: unknown.', '', markdown(finding.nextAction));
    for (const row of finding.occurrences) lines.push('', `- ${row.version} run ${row.run}; ${row.afterStep === undefined ? 'end of workflow' : `after step ${row.afterStep}`} — **${row.verdict}** (recorded ${row.recordedVerdict}); expected ${markdown(row.expected)}; observed ${markdown(row.observed)}.`,
      ...row.gaps.map(gap => `  - ${gap}`), ...row.references.map(ref => `  - [Private ${ref.kind}](${pathToFileURL(ref.path).href}): ${markdown(ref.path)} (${ref.exists ? 'exists' : 'missing'}).`));
  }
  return lines.join('\n') + '\n';
}
/** One row per declared check: index, kind, checkpoint, verdict per run and safe diagnosis labels. */
export function formatCheckOverview(feedback: Pick<ChangeFeedback, 'findings'>, diagnostics: Diagnostic[]): string[] {
  const runs = feedback.findings[0]?.occurrences ?? [];
  const header = ['Check', 'Kind', 'After step', ...runs.map(row => row.version === 'before' ? 'Before' : `Run ${row.run}`), 'Diagnosis'];
  const rows = feedback.findings.map(finding => {
    const labels = diagnostics.filter(item => item.diagnosis && (item.category === 'evidence_unavailable' && item.checkIndex === finding.checkIndex
      // A stopped run explains the checks it never reached.
      || item.category === 'execution_unavailable' && finding.occurrences.some(row => row.version === item.version && row.run === item.run && row.verdict === 'not_executed')))
      .map(item => `${describeDiagnosis(item.diagnosis!)}${item.category === 'execution_unavailable' && item.step !== undefined ? ` at step ${item.step}` : ''}`);
    const step = finding.occurrences[0]?.afterStep;
    return [String(finding.checkIndex), finding.kind, step === undefined ? 'end' : String(step), ...finding.occurrences.map(row => row.verdict), [...new Set(labels)].join('; ')];
  });
  return ['## Checks', '', ...formatTable(header, rows)];
}
/** Relative, URL-encoded link from the run folder; `undefined` when the file is outside it. */
function relativeHref(outDir: string, path: string, directory = false): string | undefined {
  const rel = relative(resolve(outDir), resolve(path));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  return rel.split(sep).map(encodeURIComponent).join('/') + (directory ? '/' : '');
}

/** The one-page model: private values from the proof and spec, redacted with the same rules as feedback (except the withheld declaration text). */
function evidenceHtmlModel(spec: ChangeSpec, proof: ChangeProof, outDir: string, context: FeedbackContext, diagnostics: Diagnostic[]): EvidenceHtmlModel {
  const raw = rawFeedback(spec, proof, outDir, context);
  const runOf = (version: 'before' | 'current', run: number): ScenarioRun | undefined => version === 'before' ? proof.before : proof.after[run - 1];
  const label = (version: 'before' | 'current', run: number) => version === 'before' ? 'Before' : `Run ${run}`;
  const picture = (path: string | undefined, alt: string): HtmlImage => {
    const href = path ? relativeHref(outDir, path) : undefined;
    return { alt, ...(href ? { href } : {}), missing: !path || !href || !existsSync(path) };
  };
  const diagnosticsFor = (checkIndex: number, version: 'before' | 'current', run: number, notExecuted: boolean) => diagnostics.filter(item => item.version === version && item.run === run
    && (((item.category === 'evidence_unavailable' || item.category === 'check_mismatch') && item.checkIndex === checkIndex) || (item.category === 'execution_unavailable' && notExecuted)));
  const diagnosisLabel = (item: Diagnostic) => item.diagnosis ? `${describeDiagnosis(item.diagnosis)}${item.category === 'execution_unavailable' && item.step !== undefined ? ` at step ${item.step}` : ''}` : item.category;
  const checks = raw.findings.map((finding): HtmlCheck => {
    const runs = finding.occurrences.map((occurrence): HtmlRunCell => {
      const row = runOf(occurrence.version, occurrence.run)?.checks.find(item => item.id === finding.checkId);
      const found = diagnosticsFor(finding.checkIndex, occurrence.version, occurrence.run, occurrence.verdict === 'not_executed');
      return { label: label(occurrence.version, occurrence.run), verdict: occurrence.verdict, recorded: occurrence.recordedVerdict, ...(occurrence.afterStep === undefined ? {} : { afterStep: occurrence.afterStep }),
        expected: occurrence.expected, ...(Object.hasOwn(occurrence, 'observed') ? { observed: occurrence.observed } : {}), gaps: occurrence.gaps,
        diagnoses: found.map(item => ({ label: diagnosisLabel(item), nextAction: item.nextAction })),
        image: picture(row?.screenshot, `Check ${finding.checkIndex}, ${label(occurrence.version, occurrence.run).toLowerCase()} screenshot`) };
    });
    const tableLabels = finding.occurrences.flatMap(occurrence => diagnosticsFor(finding.checkIndex, occurrence.version, occurrence.run, occurrence.verdict === 'not_executed')
      .filter(item => item.diagnosis).map(diagnosisLabel));
    return { index: finding.checkIndex, id: finding.checkId, kind: finding.kind, target: finding.target, status: finding.status, summary: finding.summary, nextAction: finding.nextAction, runs, diagnosisLabels: [...new Set(tableLabels)] };
  });
  const stops = (index: number) => [
    ...(proof.before?.failedStep === index ? ['Before'] : []),
    ...proof.after.flatMap((run, i) => [...(run.failedStep === index ? [`Run ${i + 1}`] : []), ...(run.users ?? []).filter(user => user.run.failedStep === index).map(user => `Run ${i + 1}, user ${user.user + 1}`)])];
  const users: HtmlUsersRun[] | undefined = spec.users ? proof.after.map((run, i) => ({ label: `Run ${i + 1}`, peakConcurrency: run.peakConcurrency ?? 0,
    users: (run.users ?? []).map(user => { const folder = join(outDir, `after-${i + 1}`, `user-${user.user + 1}`); return { index: user.user, verdict: user.run.verdict, ...(existsSync(folder) ? { href: relativeHref(outDir, folder, true) } : {}) }; }),
    invariants: (run.invariants ?? []).map((item, index) => ({ index, id: item.id, kind: item.kind, verdict: item.verdict, expected: item.expected, ...(Object.hasOwn(item, 'observed') ? { observed: item.observed } : {}),
      image: picture(item.screenshot, `Invariant ${index}, run ${i + 1} screenshot`),
      ...(diagnostics.find(d => d.category === 'invariant_violation' && d.version === 'current' && d.run === i + 1 && d.invariantIndex === index) ? { nextAction: diagnostics.find(d => d.category === 'invariant_violation' && d.version === 'current' && d.run === i + 1 && d.invariantIndex === index)!.nextAction } : {}) })) })) : undefined;
  // Same data as the manager's faultSummary/outsideSummary/usersSummary, taken from the proof so the manager does not change.
  const gates = [...(proof.before ? [{ label: 'baseline', run: proof.before }] : []), ...proof.after.map((run, i) => ({ label: `repeat ${i + 1}`, run }))].flatMap(({ label: where, run }) => {
    const windows = (run.faults ?? []).filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && 'name' in row);
    return [
      ...(spec.faults ? [`Faults, ${where} ${run.verdict}: ${windows.length ? windows.map(window => `${window.name} ${window.error ? 'failed' : window.applied && window.removed ? 'applied and removed' : window.applied ? 'applied, not removed' : 'not applied'}`).join(', ') : 'no window ran'}`] : []),
      ...(run.outside ? [`Outside calls, ${where} ${run.verdict}: ${run.outside.mode === 'replay' ? `replay of ${run.outside.recordingId}` : 'recording'}, ${run.outside.served} served, ${run.outside.refused} refused, ${run.outside.tlsRefused} TLS refused`] : []),
      ...(spec.users && where !== 'baseline' ? [`Users, ${where} ${run.verdict}: ${run.users?.length ?? 0} users [${(run.users ?? []).map(row => row.run.verdict).join(', ')}], peak ${run.peakConcurrency ?? 0}, invariants [${(run.invariants ?? []).map(row => row.verdict).join(', ')}]`] : []),
    ];
  });
  const folders = [...(proof.before ? ['before'] : []), ...proof.after.map((_, i) => `after-${i + 1}`)].map(name => join(outDir, name));
  const networkFiles = new Set<string>();
  for (const run of [...(proof.before ? [proof.before] : []), ...proof.after]) for (const shot of [...run.screenshots, ...run.checks.map(row => row.screenshot ?? ''), ...(run.users ?? []).flatMap(user => user.run.screenshots)]) if (shot) networkFiles.add(join(dirname(shot), 'network.json'));
  const fileLinks = [['proof.json', join(outDir, 'proof.json')], ['feedback.json', join(outDir, 'feedback.json')], ['REPORT.md', join(outDir, 'REPORT.md')],
    ...folders.map(folder => [`${relative(resolve(outDir), folder)}/result.json`, join(folder, 'result.json')]),
    ...[...networkFiles].sort().map(file => [relative(resolve(outDir), file).split(sep).join('/'), file])]
    .flatMap(([name, path]) => { const href = existsSync(path) ? relativeHref(outDir, path) : undefined; return href ? [{ label: name, href }] : []; });
  const model: EvidenceHtmlModel = {
    title: spec.title, requirement: spec.change, verdict: proof.verdict,
    facts: [['Mode', spec.mode], ['Baseline kind', spec.baselineKind ?? 'none (current-only)'], ['Repeats', String(spec.repeats)], ...(spec.users ? [['Users', String(spec.users.count)] as [string, string]] : []),
      ['Verified at', proof.verifiedAt], ['Spec hash', proof.specHash], ['Identity status', raw.identityStatus], ['Proof reason', proof.reason],
      ...(context.environmentId ? [['Environment id', context.environmentId] as [string, string], ['Generation', String(context.generation ?? 0)] as [string, string]] : []),
      ...Object.entries(context.sourceHashes ?? {}).map(([key, value]): [string, string] => [`Source: ${key}`, value])],
    runLabels: checks[0]?.runs.map(run => run.label) ?? [], checks,
    steps: spec.steps.map((step, index) => ({ index, action: step.action, ...(step.id ? { id: step.id } : {}), ...(step.note ? { note: step.note } : {}), stoppedRuns: stops(index) })),
    attention: [
      ...checks.flatMap(check => check.runs.filter(cell => cell.verdict !== 'passed').map(cell => ({ text: `Check ${check.index} (${check.id}), ${cell.label}`, verdict: cell.verdict, anchor: `check-${check.index}` }))),
      ...(users ?? []).flatMap(run => run.invariants.filter(item => item.verdict !== 'passed').map(item => ({ text: `Invariant ${item.index} (${item.id}), ${run.label}`, verdict: item.verdict, anchor: `invariant-${run.label.replace(/\W+/g, '-')}-${item.index}` })))],
    ...(users ? { users } : {}), gates, issues: raw.issues,
    limits: [raw.scope, raw.provenanceLimit, 'This page is a private local view: it shows application text, selectors and expected and observed values. Fill values, typed text, credentials and known secrets are redacted. Do not share it; the linked screenshots and result files show application content too.', `Privacy rule of feedback.json and REPORT.md: ${raw.privacyLimit}`, 'This page shows only what was declared and observed. It is not proof that the whole app is correct.'], files: fileLinks };
  // Redact every text value; links are paths made by PRAMAN and must not be changed by a private value that happens to occur in them.
  const safe = <T,>(value: T): T => safeFeedbackValue(value, spec, [], { reveal: true });
  // Structure and PRAMAN-made text (verdicts, kinds, labels, links, run facts, file names) is not private; app text is.
  const plain = new Set(['href', 'alt', 'verdict', 'recorded', 'kind', 'status', 'label', 'runLabels', 'stoppedRuns', 'action', 'anchor', 'facts', 'files', 'index', 'afterStep', 'peakConcurrency']);
  const walk = (value: unknown, key?: string): unknown => key !== undefined && plain.has(key) ? value : Array.isArray(value) ? value.map(item => walk(item, key))
    : value && typeof value === 'object' && key !== 'expected' && key !== 'observed' ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, walk(child, name)])) : safe(value);
  return walk(model) as EvidenceHtmlModel;
}

export function saveFeedback(spec: ChangeSpec, proof: ChangeProof, outDir: string, context?: FeedbackContext) {
  mkdirSync(outDir, { recursive: true });
  const diagnostics = checkDiagnostics(outDir, { ...proof, regressionCheck: spec.regressionCheck }, spec.checks.map(check => check.id));
  const feedback = { ...buildFeedback(spec, proof, outDir, context), diagnostics };
  const feedbackPath = join(outDir, 'feedback.json'), report = join(outDir, 'REPORT.md');
  writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), { mode: 0o600 });
  writeFileSync(report, formatSummary({ verdict: proof.verdict, diagnostics }, true, formatCheckOverview(feedback, diagnostics)) + '\n\n' + formatFeedback(feedback), { mode: 0o600 });
  // Written last so its links to the files above exist; rewritten whenever the folder is saved again.
  const reportHtml = join(outDir, 'REPORT.html');
  writeFileSync(reportHtml, renderEvidenceHtml(evidenceHtmlModel(spec, proof, outDir, context ?? {}, diagnostics)), { mode: 0o600 });
  return { feedback, feedbackPath, report, reportHtml, diagnostics };
}

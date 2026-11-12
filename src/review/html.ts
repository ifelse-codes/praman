import { createHash } from 'node:crypto';

/**
 * One-page, offline HTML view of a browser run. Pure: the caller collects and redacts the model,
 * this module only escapes and lays it out. No script, no remote source, no application knowledge.
 */
export type HtmlVerdict = 'passed' | 'failed' | 'insufficient_evidence' | 'not_executed';

export interface HtmlImage { alt: string; href?: string; missing: boolean }
export interface HtmlDiagnosis { label: string; nextAction: string }
export interface HtmlRunCell {
  label: string;
  verdict: HtmlVerdict;
  recorded: HtmlVerdict;
  afterStep?: number;
  expected: unknown;
  observed?: unknown;
  gaps: string[];
  diagnoses: HtmlDiagnosis[];
  image: HtmlImage;
}
export interface HtmlCheck {
  index: number;
  id: string;
  kind: string;
  target: string;
  status: string;
  summary: string;
  nextAction: string;
  runs: HtmlRunCell[];
  diagnosisLabels: string[];
}
export interface HtmlStep { index: number; action: string; id?: string; note?: string; stoppedRuns: string[] }
export interface HtmlInvariant { index: number; id: string; kind: string; verdict: HtmlVerdict; expected: unknown; observed?: unknown; image: HtmlImage; nextAction?: string }
export interface HtmlUsersRun {
  label: string;
  peakConcurrency: number;
  users: Array<{ index: number; verdict: HtmlVerdict; href?: string }>;
  invariants: HtmlInvariant[];
}
export interface EvidenceHtmlModel {
  title: string;
  requirement: string;
  verdict: HtmlVerdict;
  facts: Array<[string, string]>;
  runLabels: string[];
  checks: HtmlCheck[];
  steps: HtmlStep[];
  users?: HtmlUsersRun[];
  /** Where to look first: every check run and invariant that is not `passed`, with an anchor in this page. */
  attention: Array<{ text: string; verdict: HtmlVerdict; anchor: string }>;
  gates: string[];
  issues: string[];
  limits: string[];
  files: Array<{ label: string; href: string }>;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, char => `&#${char.charCodeAt(0)};`);
}

const labels: Record<HtmlVerdict, { text: string; mark: string }> = {
  passed: { text: 'passed', mark: '✓' },
  failed: { text: 'failed', mark: '✗' },
  insufficient_evidence: { text: 'insufficient_evidence', mark: '?' },
  not_executed: { text: 'not_executed', mark: '–' },
};
const meanings: Record<HtmlVerdict, string> = {
  passed: 'Passed: every declared check held in every run. This covers only what was declared.',
  failed: 'Failed: at least one declared check or invariant was observed not to hold. A mismatch alone does not establish an application defect; read the cards below.',
  insufficient_evidence: 'Not proven: some evidence is missing or a step could not run (for example a screenshot or an action). This is not a pass and not an application defect.',
  not_executed: 'Not executed: nothing was run, so nothing is proven.',
};

const css = `
:root{color-scheme:light}
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1f24;background:#fff;margin:0}
main{max-width:1100px;margin:0 auto;padding:16px 24px 48px}
h1{font-size:1.5rem;margin:.4rem 0}h2{font-size:1.2rem;margin:1.8rem 0 .5rem;border-bottom:2px solid #d0d7de;padding-bottom:.2rem}h3{font-size:1.05rem;margin:1.2rem 0 .3rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0}th,td{border:1px solid #8c959f;padding:4px 8px;text-align:left;vertical-align:top}th{background:#eef1f4}
code,.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;word-break:break-all}
a{color:#0b4fc1}
.private{background:#fff4c2;border:2px solid #8a6a00;padding:8px 12px;font-weight:600}
.banner{border:4px solid;padding:12px 16px;margin:12px 0;font-size:1.3rem;font-weight:700}
.banner p{margin:.3rem 0 0;font-size:.95rem;font-weight:400}
.v{font-weight:700;white-space:nowrap}
.v-passed{color:#0f5e25}.v-failed{color:#a1160a}.v-insufficient_evidence{color:#7a4b00}.v-not_executed{color:#4a4f55}
.banner.v-passed{border-style:solid;background:#e6f6ea;border-color:#0f5e25}
.banner.v-failed{border-style:double;background:#fde9e7;border-color:#a1160a}
.banner.v-insufficient_evidence{border-style:dashed;background:#fff1d6;border-color:#7a4b00}
.banner.v-not_executed{border-style:dotted;background:#eceff1;border-color:#4a4f55}
.card{border:1px solid #8c959f;padding:4px 14px 10px;margin:14px 0;break-inside:avoid}
.run{border-top:1px solid #d0d7de;margin-top:10px;padding-top:6px}
.shot{max-width:100%;width:560px;border:1px solid #8c959f;display:block}
.missing{border:2px dashed #a1160a;padding:10px;max-width:560px;font-weight:600;color:#a1160a}
.stop{background:#fde9e7;border-left:4px solid #a1160a;padding:0 6px}
.limits li,.issues li{margin:.2rem 0}
details{margin:.4rem 0}summary{cursor:pointer}
@media print{.shot{width:420px}a{color:#000}body{font-size:12px}}
`;
const cssHash = createHash('sha256').update(css).digest('base64');

const text = (value: unknown): string => value === undefined ? 'not observed'
  : typeof value === 'string' ? value : JSON.stringify(value) ?? 'unavailable';
function verdict(value: HtmlVerdict): string {
  const label = labels[value] ?? labels.not_executed;
  return `<span class="v v-${value in labels ? value : 'not_executed'}"><span aria-hidden="true">${label.mark} </span>${escapeHtml(label.text)}</span>`;
}
function image(img: HtmlImage): string {
  if (img.missing || !img.href) return `<div class="missing" role="img" aria-label="${escapeHtml(img.alt)}: screenshot missing">Screenshot missing: ${escapeHtml(img.alt)}</div>`;
  return `<a href="${escapeHtml(img.href)}"><img class="shot" src="${escapeHtml(img.href)}" alt="${escapeHtml(img.alt)}"></a>`;
}
const list = (items: string[]): string => items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>None.</p>';

export function renderEvidenceHtml(model: EvidenceHtmlModel): string {
  const out: string[] = [];
  const stepOf = (run: HtmlRunCell) => run.afterStep === undefined ? 'end of workflow' : `after step ${run.afterStep}`;
  out.push(`<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'sha256-${cssHash}'; base-uri 'none'; form-action 'none'">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">`,
    `<title>${escapeHtml(`PRAMAN evidence report: ${model.verdict}`)}</title><style>${css}</style></head><body><main>`,
    `<p class="private" role="note">Private evidence: contains application data. Do not share.</p>`,
    `<h1>PRAMAN evidence report</h1><p>${escapeHtml(model.title)}</p><p>Requirement: ${escapeHtml(model.requirement)}</p>`,
    `<section aria-labelledby="verdict-h"><h2 id="verdict-h">Verdict</h2><div class="banner v-${model.verdict in labels ? model.verdict : 'not_executed'}" role="status">${verdict(model.verdict)}<p>${escapeHtml(meanings[model.verdict] ?? meanings.not_executed)}</p></div></section>`,
    ...(model.attention.length ? [`<section aria-labelledby="attention-h"><h2 id="attention-h">Look here first</h2><ul>${model.attention.map(item => `<li><a href="#${escapeHtml(item.anchor)}">${escapeHtml(item.text)}</a>: ${verdict(item.verdict)}</li>`).join('')}</ul></section>`] : []),
    `<section aria-labelledby="facts-h"><h2 id="facts-h">Run facts</h2><table><tbody>${model.facts.map(([key, value]) => `<tr><th scope="row">${escapeHtml(key)}</th><td class="mono">${escapeHtml(value)}</td></tr>`).join('')}</tbody></table></section>`);

  out.push(`<section aria-labelledby="checks-h"><h2 id="checks-h">Checks</h2><table><thead><tr><th scope="col">Check</th><th scope="col">Id</th><th scope="col">Kind</th><th scope="col">After step</th>`,
    ...model.runLabels.map(label => `<th scope="col">${escapeHtml(label)}</th>`), `<th scope="col">Diagnosis</th></tr></thead><tbody>`);
  for (const check of model.checks) {
    out.push(`<tr><th scope="row"><a href="#check-${check.index}">Check ${check.index}</a></th><td>${escapeHtml(check.id)}</td><td>${escapeHtml(check.kind)}</td><td>${check.runs[0]?.afterStep === undefined ? 'end' : check.runs[0].afterStep}</td>`,
      ...check.runs.map(run => `<td><a href="#check-${check.index}">${verdict(run.verdict)}</a></td>`), `<td>${escapeHtml(check.diagnosisLabels.join('; '))}</td></tr>`);
  }
  out.push(`</tbody></table></section><section aria-labelledby="cards-h"><h2 id="cards-h">Check details</h2>`);
  for (const check of model.checks) {
    out.push(`<article class="card" id="check-${check.index}"><h3>Check ${check.index}: ${escapeHtml(check.id)} (${escapeHtml(check.kind)}) &mdash; ${escapeHtml(check.status)}</h3>`,
      `<p>${escapeHtml(check.summary)}</p><p><strong>Root cause: unknown.</strong></p><p><strong>Next action:</strong> ${escapeHtml(check.nextAction)}</p><p>Target: <code>${escapeHtml(check.target)}</code></p>`);
    for (const run of check.runs) {
      out.push(`<div class="run"><h4>${escapeHtml(run.label)}, ${escapeHtml(stepOf(run))}: ${verdict(run.verdict)}${run.recorded !== run.verdict ? ` (recorded ${verdict(run.recorded)})` : ''}</h4>`,
        `<p>Expected: <code>${escapeHtml(text(run.expected))}</code><br>Observed: <code>${escapeHtml(text(run.observed))}</code></p>`,
        ...(run.gaps.length ? [`<p>Gaps:</p>${list(run.gaps)}`] : []),
        ...run.diagnoses.map(item => `<p><strong>Diagnosis:</strong> ${escapeHtml(item.label)}. ${escapeHtml(item.nextAction)}</p>`),
        image(run.image), `</div>`);
    }
    out.push(`</article>`);
  }
  out.push(`</section><section aria-labelledby="steps-h"><h2 id="steps-h">Steps</h2><ol start="0">`);
  for (const step of model.steps) {
    const stopped = step.stoppedRuns.length ? ` <strong class="stop">Stopped here: ${escapeHtml(step.stoppedRuns.join(', '))}</strong>` : '';
    out.push(`<li${step.stoppedRuns.length ? ' class="stop"' : ''}>Step ${step.index}: <code>${escapeHtml(step.action)}</code>${step.id ? ` <code>${escapeHtml(step.id)}</code>` : ''}${step.note ? ` &mdash; ${escapeHtml(step.note)}` : ''}${stopped}</li>`);
  }
  out.push(`</ol></section>`);

  if (model.users) {
    out.push(`<section aria-labelledby="users-h"><h2 id="users-h">Many users and invariants</h2>`);
    for (const run of model.users) {
      out.push(`<h3>${escapeHtml(run.label)}: peak concurrency ${run.peakConcurrency}</h3><table><thead><tr><th scope="col">User</th><th scope="col">Verdict</th><th scope="col">Evidence folder</th></tr></thead><tbody>`,
        ...run.users.map(user => `<tr><th scope="row">User ${user.index + 1}</th><td>${verdict(user.verdict)}</td><td>${user.href ? `<a href="${escapeHtml(user.href)}">open folder</a>` : 'none'}</td></tr>`), `</tbody></table>`);
      if (!run.invariants.length) out.push('<p>No invariant was observed in this run.</p>');
      for (const inv of run.invariants) {
        out.push(`<article class="card" id="invariant-${escapeHtml(run.label.replace(/\W+/g, '-'))}-${inv.index}"><h4>Invariant ${inv.index}: ${escapeHtml(inv.id)} (${escapeHtml(inv.kind)}): ${verdict(inv.verdict)}</h4>`,
          `<p>Expected: <code>${escapeHtml(text(inv.expected))}</code><br>Observed: <code>${escapeHtml(text(inv.observed))}</code></p>`,
          ...(inv.nextAction ? [`<p><strong>Next action:</strong> ${escapeHtml(inv.nextAction)}</p>`] : []), image(inv.image), `</article>`);
      }
    }
    out.push(`</section>`);
  }
  if (model.gates.length) out.push(`<section aria-labelledby="gates-h"><h2 id="gates-h">Environment gates</h2>${list(model.gates)}</section>`);
  out.push(`<section aria-labelledby="issues-h"><h2 id="issues-h">Issues</h2><div class="issues">${list(model.issues)}</div></section>`,
    `<section aria-labelledby="limits-h"><h2 id="limits-h">Limits</h2><div class="limits">${list(model.limits)}</div></section>`,
    `<section aria-labelledby="files-h"><h2 id="files-h">Evidence files</h2><ul>${model.files.map(file => `<li><a href="${escapeHtml(file.href)}">${escapeHtml(file.label)}</a></li>`).join('')}</ul></section>`,
    `</main></body></html>\n`);
  return out.join('\n');
}

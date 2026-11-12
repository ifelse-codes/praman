# Design: HTML evidence review report

- New module `src/review/html.ts`: `escapeHtml`, the `EvidenceHtmlModel` type and the pure
  `renderEvidenceHtml(model) → string`. No imports from `feedback.ts` at run time (no cycle).
- `src/review/feedback.ts`: `buildEvidenceHtmlModel(spec, proof, feedback, diagnostics,
  outDir)` collects the model from the already-built (safe) feedback plus the private
  values in the proof (expected, observed, ids, selectors, screenshots), then passes the
  model through `safeFeedbackValue(..., { reveal: true })`. `reveal` keeps text redaction
  (known fill/type values, credential-like names and `name=value` pairs, URL queries)
  and sensitive-key redaction, but skips the three rules that hide expected/observed,
  declaration fields and raw detail. Default behaviour (and so `feedback.json`) is unchanged.
- `saveFeedback` writes `REPORT.html` after `feedback.json` and `REPORT.md` (mode 0600) and
  returns `reportHtml`.
- Paths in the model are relative to the run folder, per segment URL-encoded.
- Environment gates are derived from the proof (`run.faults`, `run.outside`, `run.users`),
  so the manager needs no change; its three summaries stay the last result fields.
- CSP: `default-src 'none'; img-src 'self' file:; style-src 'sha256-<hash of the inline
  CSS>'; base-uri 'none'; form-action 'none'`. Checked in Chromium from `file://`.
- CLI: `formatSummary` prints `HTML report: <path>` after `Report:`.
- Limits: the world snapshot hash is written to `world-runs.json` after `saveFeedback`, so
  the page shows the source hashes only. Command reports are not covered.

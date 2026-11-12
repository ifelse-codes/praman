# Requirements: HTML evidence review report (plan step 4b)

Spec type: feature (requirements-first). Source: step 4b of the Hue-style environment plan in
`docs/ROADMAP.md` (added 2026-11-12 after an outside review of the product).

## Observed gap (2026-11-12, before any change)

See `.praman/real-apps/shiori/html-report/gap-before.md` (private). On Shiori, a failing
many-users run needs **4 files** to see one failing check: `REPORT.md` (a pointer),
`proof.json` (expected 7, observed 4), `scenario.json` (what the invariant is) and the
screenshot (a Markdown viewer does not show it). The failed step is not shown.

## Owner decision: privacy (2026-11-12)

Option **B, private local view**. `REPORT.html` also shows the scenario title, requirement,
step ids, check ids, selectors, and expected and observed values. Fill values, `type`
text, credential-like fields and known secrets stay redacted (the rules of
`safeFeedbackValue`). A banner at the top says: "Private evidence: contains application
data. Do not share." The file is mode 0600 in the private run folder. Only its **path**
reaches CLI and MCP output.

## Requirement 1: one page per browser run

1.1 `saveFeedback` SHALL write `REPORT.html` next to `REPORT.md` in the same folder and
return its path as `reportHtml` next to `report`.
1.2 It SHALL be rewritten whenever `saveFeedback` runs again for the same folder, and SHALL
always show the verdict of the proof it was given (the same value as `proof.json`).
1.3 `proof.json`, `feedback.json`, `REPORT.md`, verdicts, exit codes and declaration
schemas SHALL NOT change.

## Requirement 2: content

2.1 A verdict banner with a text label for `passed`, `failed`, `insufficient_evidence` and
`not_executed`, each with its own style, plus one plain sentence on what the verdict means.
Missing evidence SHALL never look like a pass.
2.2 Run facts: mode, baseline kind, repeats, verified time, spec hash, identity status;
for managed runs the environment id, generation and source hashes.
2.3 A checks table (check, kind, after step, one column per run, diagnosis) whose cells
link to the check cards.
2.4 One card per check: summary, next action, "Root cause: unknown", and per run the
verdict, step, expected, observed, gaps, diagnosis with next action, and the screenshot
inline and linked. A missing screenshot SHALL show a visible "Screenshot missing" box.
2.5 A numbered step list (index, action, id, note), marking the step where a run stopped.
Fill and `type` values SHALL never be shown.
2.6 When `users` is declared: per run, the user verdicts, peak concurrency and each
invariant (id, kind, verdict, expected, observed, screenshot, diagnosis), with links to
each user's folder.
2.7 An environment-gates section built from the proof (fault windows, outside-call
counts, users), one line each, when present. No invented data.
2.8 Every entry of `feedback.issues`; the limits (`scope`, `provenanceLimit`,
`privacyLimit` and the fixed note "This page shows only what was declared and observed. It
is not proof that the whole app is correct."); relative links to the evidence files.

## Requirement 3: file rules

3.1 Offline and self-contained: inline CSS, no JavaScript, no remote source, a
Content-Security-Policy `<meta>` that blocks every network source.
3.2 Relative links only. No base64 images.
3.3 Every value written into HTML SHALL be escaped.
3.4 Mode 0600. Accessible (semantic headings, `<th>`, alt text, status in text) and printable.
3.5 No new dependency; app-independent code (no app names, selectors, routes).

## Requirement 4: verification

4.1 Deterministic tests need no Docker, live app or private files; one guarded Chromium
test opens the page from `file://`.
4.2 Real proof on Kan and Shiori: `passed`, `failed`, `insufficient_evidence` pages whose
verdict equals `proof.json`; one scenario through `praman_environment` in headless Kiro.

## Out of scope / limits

Command-run reports (`REPORT.html` for `verify-command`) are a stretch; campaign, durable
and agent-campaign reports are frozen. No server, no JavaScript UI.

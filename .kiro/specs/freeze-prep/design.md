# Design: freeze prep (plan step 4d)

## Report paths (R1)

Cause, checked on the Shiori evidence: `safeFeedbackValue` (`src/review/feedback.ts`)
withholds every scenario `fill` value and `type` text, every value under a
credential-named key and the caller's secret list, inside every string. Shiori's scenario
fills the user name `shiori`, which is also a folder in the caller's output path. The
integration's `secrets()` (password, HTTP secret key) were not the cause.

Change, all in `safeFeedbackValue.visit`:

- `outputPathKeys`: `report`, `reportHtml`, `feedbackPath`, `proofPath`, `output`,
  `directory`, `declarationPath`, `operationLog`, `screenshot`, `screenshots`,
  `demoVideo`, `video`; plus `path` inside an object marked `private: true` (evidence
  references, identity evidence).
- A string (or array of strings) in such a field is kept only if it is a plain absolute
  path: starts with `/` or a drive letter, no line break, no `://`, no `key=`/`key:`
  credential text. Otherwise it is redacted as before.
- `keepPath` records whether a known private variant occurs in a kept path; after the
  walk, an object result gets `pathNote` (fixed text, no value).
- Credential-named keys are checked first and still return `[REDACTED]`.

Not changed: the HTML page's own link handling, `feedback.json`/`REPORT.md`
presentation, verdicts, schemas, exit codes. A path quoted inside prose (the reproduction
text) is still redacted.

## Flaky test (R2)

CI log: check 9 `late-inside` (`/late`, window 600 ms after the click) observed 0. The page
sends `/late` 300 ms after the click, a 300 ms margin. On a loaded runner the request event
reached the host after the window closed. Reproduced by moving `/late` past the window
(same check, `observed 0`). Fix in the test: `late-inside` window 2500 ms; per-check
assertions with a message naming the index, id, verdict, observed value and the window
evidence (window and rows).

## Wording (R3)

Small edits only, each in the document's own style.

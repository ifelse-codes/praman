# Browser scenario format — one-page cheat sheet

A compact reference for `scenario-verify`, `environment verify`, `preview` and
`demonstrate` browser declarations. This is a summary, not the full contract:
[README "Proof first, walkthrough second"](../README.md#proof-first-walkthrough-second)
and [static/browser acceptance](static-browser-acceptance.md) are authoritative.

## Minimal current-only scenario

```json
{
  "mode": "acceptance",
  "title": "Current task creation",
  "change": "Adding a task keeps its title and clears the composer.",
  "afterUrl": "http://127.0.0.1:8080",
  "repeats": 2,
  "steps": [
    {"action": "fill", "selector": "#taskInput", "value": "Review acceptance", "note": "Enter a task"},
    {"action": "press", "selector": "#taskInput", "key": "Enter", "note": "Add the task"}
  ],
  "checks": [
    {"id": "title", "kind": "text", "selector": "#taskList .task__title", "equals": "Review acceptance"},
    {"id": "composer-cleared", "kind": "value", "selector": "#taskInput", "equals": ""},
    {"id": "runtime", "kind": "pageErrors", "equals": 0}
  ]
}
```

```sh
node dist/cli.js scenario-verify scenario.json -o .praman/run --summary
```

## Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `mode` | yes | `acceptance` (current only), `repair` (historical baseline + named regression), `comparison` (declared baseline) |
| `title` | yes | Short requirement title |
| `change` | yes | The stated current requirement |
| `afterUrl` | yes | Current application URL (HTTP/HTTPS) |
| `beforeUrl` | paired modes | Baseline URL; omit for acceptance |
| `baselineKind` | paired modes | `historical`, `synthetic` or `unattested`; repair requires `historical` |
| `repeats` | no | Fresh sessions, `2`–`10`, default `2` |
| `steps` | yes | Ordered browser actions (min 1) |
| `checks` | yes | Declared requirements (min 1) |
| `regressionCheck` | repair | `id` of the check that must fail before and pass after |
| `diffPath` | no | Source diff used by code scenes |
| `identity` | no | Declared local files/tools to hash (execution identity, not target-app identity) |
| `walkthrough` | no | Authored narration plan for `preview`/`demonstrate` |

## Actions (8)

All actions require a `note`. Unknown fields are rejected (`.strict()`).

| Action | Fields | Behavior |
| --- | --- | --- |
| `goto` | `path`, `note` | Same-origin navigation; waits `networkidle`; requires a 2xx response |
| `waitForURL` | `path`, `note` | Waits for the URL (15 s) |
| `click` | `selector`, `note` | Clicks one element |
| `hover` | `selector`, `note` | Hovers one element |
| `waitFor` | `selector`, `note` | Waits for **visibility** (15 s) — this is the only `waitFor` state |
| `fill` | `selector`, `value`, `note` | Sets the value atomically (no per-key events) |
| `press` | `selector`, `key`, `note` | Sends one key or chord (`Enter`, `Shift+ArrowRight`, …) |
| `upload` | `selector`, `path`, `note`, optional `completionSelector` | Sets file input; optional completion wait |

Default Playwright action timeout is 3 s; `waitFor`/`waitForURL` get 15 s.

## Checks (10)

All checks require a unique `id`. `afterStep` is optional, zero-based, and not
allowed for `pageErrors`/`network` (`network` uses its own `window`).

| `kind` | Fields | Observes |
| --- | --- | --- |
| `text` | `selector`, `equals` | Rendered `innerText` (exact, including CSS casing) |
| `value` | `selector`, `equals` | Form `inputValue()` |
| `visible` | `selector`, `equals` (bool), optional `beforeEquals` (paired modes) | Visibility; absence reports `false` |
| `attribute` | `selector`, `name`, `equals` (string or `null`) | Exact attribute text; `null` means absent |
| `class` | `selector`, `token`, `equals` (bool) | One complete class token |
| `state` | `selector`, `state` (`hidden`/`enabled`/`checked`), `equals` (bool) | Playwright DOM state; element must be attached |
| `json` | `path`, `field[]`, `equals` (scalar) | Same-origin HTTP JSON field |
| `pageErrors` | `equals: 0` | Runtime errors; end of workflow only |
| `image` | `selector`, `equals: true` | An actual `<img>` decodes with natural dimensions |
| `network` | `match{urlPattern, method?, status?}`, `window{fromStep, throughStep, settleMs}`, `equals` | Counts matching requests in a zero-based action window; observes, does not enforce |

Checks with an element selector retry briefly for asynchronous UI (about 1.5 s;
`image` waits up to 5 s for visibility, then up to 5 s for decoding) and take a
screenshot each. Checks without `afterStep` run at the end of the workflow.

## Rules and common traps

- **One element per selector.** Playwright strict mode rejects selectors that
  match 0 or 2+ elements for actions and most checks. Ambiguity yields
  `insufficient_evidence` (not a pass and not a proven app defect); the exact
  cause lives in the private `after-<run>/result.json`. Target the single group
  container instead of loosening the requirement.
- **A visible container is not rendered content.** A `visible` check passes on
  the wrapper even when a chart, list or image is still empty. For asynchronous
  content, assert the actual `text`/`value`/`state` (or add a `waitFor` for the
  element that appears), not just the container.
- **Zero-based indexes shift when steps are inserted.** `afterStep`, network
  `window` steps and walkthrough `step`/`startStep` are zero-based. Validation
  rejects out-of-range values but cannot detect that an index now points at a
  different action — renumber after inserting steps.
- **Missing vs mismatched.** `visible: true` on a missing selector reports
  `failed` with observed `false`; missing elements for other element checks
  report `insufficient_evidence`. Pick the check whose meaning matches the
  requirement.
- **`fill` is atomic; `press` is one key/chord.** There is no per-key typing in
  the current DSL. `selectOption`, `dblclick`, `drag`, `scroll`/wheel and
  arbitrary JS evaluation are also absent — cover direct-manipulation behavior
  with unit/Playwright tests, or express the observable result as a declarative
  check.
- **Same origin only.** `goto`, `waitForURL` and `json` must stay on the app
  origin; off-origin navigation is rejected.
- **Acceptance is current-only.** Repair requires a historical baseline and a
  named regression that actually fails before. Comparison requires
  `baselineKind` and has no `regressionCheck`.
- **Fresh output directory.** A scenario edit changes the declaration hash;
  old proof cannot be reused. Use a new `-o` directory for each run.

## Debug a failed run (private evidence)

`--summary` and `REPORT.md` show category, zero-based step and private evidence
paths; they are redacted by design (application text, selectors, expected and
observed values, and raw errors are withheld). The unredacted details are in the
private run artifacts:

```sh
out=.praman/run
jq '{verdict, failedStep, completedSteps, url}' "$out/after-1/result.json"
jq '.checks[] | {id, verdict, expected, observed, evidence}' "$out/after-1/result.json"
jq '.after[] | {verdict, failedStep, completedSteps, error}' "$out/proof.json"
```

- `after-<n>/result.json` — per-repeat verdict, `error`, `failedStep`,
  `completedSteps`, checks with `evidence`, screenshots, network; also
  `before/` for paired modes.
- `proof.json` — the runs and identity snapshots behind the proof.
- `check-<n>.png` — per-check screenshot next to the result (private).

Private evidence can contain application text, selectors, values and URLs. Keep
it local and review it before sharing anything.

## Where to read more

- [README browser contract](../README.md#proof-first-walkthrough-second)
- [Static/browser acceptance guide](static-browser-acceptance.md)
- [Video guidelines](video-guidelines.md)

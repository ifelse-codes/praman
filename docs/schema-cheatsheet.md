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

## Actions (13)

All actions require a `note`. Unknown fields are rejected (`.strict()`).

| Action | Fields | Behavior |
| --- | --- | --- |
| `goto` | `path`, `note` | Same-origin navigation; waits `networkidle`; requires a 2xx response |
| `waitForURL` | `path`, `note` | Waits for the URL (15 s) |
| `click` | `selector`, `note` | Clicks one element |
| `dblclick` | `selector`, `note` | Double-clicks one element |
| `hover` | `selector`, `note` | Hovers one element |
| `waitFor` | `selector`, `note`, optional `state` **or** `count` | Waits (15 s) for `state`: `visible` (default), `hidden`, `attached`, `detached`; or until the selector matches exactly `count` elements (counts on purpose, no strict mode) |
| `fill` | `selector`, `value`, `note` | Sets the value atomically (no per-key events) |
| `type` | `selector`, `text`, `note`, optional `delayMs` (0–200) | Types key by key (real key events), unlike `fill` |
| `press` | `selector`, `key`, `note` | Sends one key or chord (`Enter`, `Shift+ArrowRight`, …) |
| `selectOption` | `selector`, exactly one of `value` or `label`, `note` | Selects one option of a `<select>` |
| `scroll` | `selector` (a scroll container, or `"window"`), `to`, `note` | `to`: `"top"`, `"bottom"` or `{ "x": int, "y": int }` pixel deltas. Instant programmatic scroll: fires `scroll` events, not `wheel` events; a target that cannot scroll fails |
| `drag` | `from`, `to` (selector or `{ "dx": int, "dy": int }`), `note` | Real pointer down, 10-step move and up from the source centre to the target centre or by the offset; also drives native HTML drag and drop in Chromium |
| `upload` | `selector`, `path`, `note`, optional `completionSelector` | Sets file input; optional completion wait |

Default Playwright action timeout is 3 s; `waitFor`/`waitForURL` get 15 s.

```json
{"action": "waitFor", "selector": "#chart .bar", "count": 5, "note": "Wait for all five bars"}
{"action": "dblclick", "selector": "#cell-B2", "note": "Open the cell editor"}
{"action": "type", "selector": "#cell-editor", "text": "=SUM(A1:A3)", "note": "Type the formula"}
{"action": "selectOption", "selector": "#currency", "label": "Euro", "note": "Choose euro"}
{"action": "scroll", "selector": "#grid", "to": "bottom", "note": "Scroll to the last row"}
{"action": "drag", "from": "#fill-handle", "to": {"dx": 0, "dy": 60}, "note": "Drag the fill handle down"}
```

## Checks (11)

All checks require a unique `id`. `afterStep` is optional, zero-based, and not
allowed for `pageErrors`/`network` (`network` uses its own `window`).

| `kind` | Fields | Observes |
| --- | --- | --- |
| `text` | `selector`, `equals` | Rendered `innerText` (exact, including CSS casing) |
| `value` | `selector`, `equals` | Form `inputValue()` |
| `visible` | `selector`, `equals` (bool), optional `beforeEquals` (paired modes) | Visibility; absence reports `false` |
| `count` | `selector`, `equals` (integer ≥ 0) | Number of matching elements (no strict mode; `0` asserts absence) |
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
  `insufficient_evidence` (not a pass and not a proven app defect). The summary
  names it, for example `diagnosis: locator_ambiguous (12 elements)`, and the raw
  message stays in the private `after-<run>/result.json`. Target the single group
  container instead of loosening the requirement.
- **A visible container is not rendered content.** A `visible` check passes on
  the wrapper even when a chart, list or image is still empty. For asynchronous
  content, wait for the real condition (`waitFor` with `count`, or with `state:
  "detached"` on a spinner) and assert the actual `count`/`text`/`value`/`state`,
  not just the container.
- **Zero-based indexes shift when steps are inserted.** `afterStep`, network
  `window` steps and walkthrough `step`/`startStep` are zero-based. Validation
  rejects out-of-range values but cannot detect that an index now points at a
  different action — renumber after inserting steps.
- **Missing vs mismatched.** `visible: true` on a missing selector reports
  `failed` with observed `false`; missing elements for other element checks
  report `insufficient_evidence`. Pick the check whose meaning matches the
  requirement.
- **`fill` is atomic; `type` is key by key; `press` is one key/chord.** Use
  `type` when the app reacts to each key (autocomplete, formula editors).
  Arbitrary JS evaluation, coordinate-only clicks, canvas painting, touch
  gestures and native file dialogs are absent — cover them with
  unit/Playwright tests, or express the observable result as a declarative
  check.
- **Same origin only.** `goto`, `waitForURL` and `json` must stay on the app
  origin; off-origin navigation is rejected.
- **Acceptance is current-only.** Repair requires a historical baseline and a
  named regression that actually fails before. Comparison requires
  `baselineKind` and has no `regressionCheck`.
- **Fresh output directory.** A scenario edit changes the declaration hash;
  old proof cannot be reused. Use a new `-o` directory for each run.

## Debug a failed run (private evidence)

`--summary` and `REPORT.md` show category, zero-based step or check index, a
diagnosis and private evidence paths. `REPORT.md` starts with a `## Checks` table of
every check and its verdict per run. Both are redacted by design: application text,
selectors, expected and observed values, URLs and raw errors are withheld.

| Diagnosis | Meaning | Usual fix |
| --- | --- | --- |
| `locator_ambiguous (N elements)` | The selector matched N elements | Make it match exactly one |
| `locator_timeout ([state, ]N ms)` | No matching element was ready in time | Check the selector and when the element appears |
| `navigation_failed` | Navigation failed, timed out, returned non-2xx or left the origin | Check the URL, the path and that the app runs |
| `browser_closed` | The page, context or browser closed or crashed | Check for app code that closes or crashes the tab |
| `unknown` | No known pattern | Read the private error below |

The unredacted details are in the private run artifacts:

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

# Design: agent diagnostics

## Classification

`src/review/classify.ts` (new, pure): `classifyError(message: string): { kind, facts }`.
Pattern table, first match wins:

| Kind | Pattern (Playwright message) | Safe facts kept |
| --- | --- | --- |
| `locator_ambiguous` | `strict mode violation` + `resolved to (\d+) elements` | matched count |
| `locator_timeout` | `Timeout (\d+)ms exceeded` + `waiting for … to be (visible\|hidden\|attached)` | state, timeout ms |
| `navigation_failed` | `page.goto`/`waitForURL` errors, `net::ERR_`, origin-policy errors from `src/eval/change.ts` | none |
| `browser_closed` | `Target page, context or browser has been closed`, `crashed` | none |
| `unknown` | anything else | none |

### Captured messages (task 1, 2026-11-09, Playwright in this checkout)

Real runs of `scenario-verify --summary` against a local three-button page (driver in
ignored `.praman/agent-diagnostics/`). Before the fix every case printed only
`execution_unavailable: current run 1 step[0]` or `evidence_unavailable: current run 1
check[1]` with the generic next action. The raw messages, with selectors replaced:

| Case | Where | Raw message (first lines) |
| --- | --- | --- |
| click on 3 matches | step error | `locator.click: Error: strict mode violation: locator('<sel>') resolved to 3 elements:` |
| text check on 3 matches | check evidence | `locator.waitFor: Error: strict mode violation: locator('<sel>') resolved to 3 elements:` |
| `waitFor` on a hidden element | step error | `locator.waitFor: Timeout 15000ms exceeded.` / `waiting for locator('<sel>') to be visible` |
| click on a missing element | step error | `locator.click: Timeout 3000ms exceeded.` / `waiting for locator('<sel>')` (no state named) |
| text check on a missing element | check evidence | `locator.waitFor: Timeout 1500ms exceeded.` / `waiting for locator('<sel>')` (no state named) |
| `goto` to a 404 path | step error | `Step 1 navigation failed` (PRAMAN's own message) |
| app URL refused | run error, no step | `page.goto: net::ERR_UNSAFE_PORT at <url>` |
| `waitForURL` never reached | step error | `page.waitForURL: Timeout 15000ms exceeded.` / `waiting for navigation to "<url>"` |
| page or browser closed | action error | `locator.click: Target page, context or browser has been closed` |
| tab crashed | action error | `locator.click: Target crashed` |

Call logs contain ANSI color codes; the classifier strips them. Playwright names the
awaited state only for explicit `waitFor` states, so `locator_timeout` carries the state
only when the message names it. A `waitForURL` or `page.goto` timeout is
`navigation_failed`, not `locator_timeout`, because no element was awaited. Checks first
on `closed`/`crashed`, so a closed page during navigation is `browser_closed`.

Only the kind and the listed numeric or enum facts leave private evidence. The raw message
stays in `result.json` as today.

`src/review/diagnostics.ts` adds `diagnosis?: { kind, facts }` to `execution_unavailable`
and `evidence_unavailable` entries and picks the next action per kind, for example
`locator_ambiguous`: "The selector matched N elements; make it match exactly one (scope it
to a container or use a unique attribute), then rerun."

## Report table

`src/review/feedback.ts` renders a Markdown table (`## Checks`) right after the
`Outcome:` line of `REPORT.md`, before the per-diagnostic list and the per-check sections,
so it is the first thing a reader sees even when there are many diagnostics:

```
| Check | Kind | After step | Run 1 | Run 2 | Diagnosis |
| --- | --- | --- | --- | --- | --- |
| 0 | text | 2 | passed | passed | |
| 11 | visible | 25 | not_executed | not_executed | locator_ambiguous (12 elements) at step 25 |
```

Verdict cells use the product's own words (`passed`, `failed`, `insufficient_evidence`,
`not_executed`); paired modes add a `Before` column. A check that never ran shows the
diagnosis of the step that stopped its run. The command report uses the same table without
the step column; kinds are `exit`, `stdout`, `stderr` or `artifact`, and the Diagnosis cell
names a run that did not exit (`run timeout`, `run interrupted`, `run unavailable`), since
command runs have no Playwright message to classify.

## Testing strategy

- Unit: `classifyError` against real Playwright messages captured from fixtures.
- Integration: a local fixture page with three identical buttons; a scenario that clicks
  the class selector → `insufficient_evidence`, summary contains `locator_ambiguous` and
  `3`, and does not contain the selector text.
- A timeout fixture and a navigation fixture; the report table rows for pass and fail.
- Privacy regression: existing redaction tests stay green.

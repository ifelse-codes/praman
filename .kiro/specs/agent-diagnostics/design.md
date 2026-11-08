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

Only the kind and the listed numeric or enum facts leave private evidence. The raw message
stays in `result.json` as today.

`src/review/diagnostics.ts` adds `diagnosis?: { kind, facts }` to `execution_unavailable`
and `evidence_unavailable` entries and picks the next action per kind, for example
`locator_ambiguous`: "The selector matched N elements; make it match exactly one (scope it
to a container or use a unique attribute), then rerun."

## Report table

`src/review/feedback.ts` renders a Markdown table before the per-check sections:

```
| Check | Kind | Step | Run 1 | Run 2 | Diagnosis |
| --- | --- | --- | --- | --- | --- |
| 0 | text | 2 | passed | passed | |
| 11 | visible | 25 | not run | not run | locator_ambiguous (12) |
```

## Testing strategy

- Unit: `classifyError` against real Playwright messages captured from fixtures.
- Integration: a local fixture page with three identical buttons; a scenario that clicks
  the class selector → `insufficient_evidence`, summary contains `locator_ambiguous` and
  `3`, and does not contain the selector text.
- A timeout fixture and a navigation fixture; the report table rows for pass and fail.
- Privacy regression: existing redaction tests stay green.

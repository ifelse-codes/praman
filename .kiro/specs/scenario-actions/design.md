# Design: scenario actions and waits

## Schema (`src/case/change.ts`)

Add strict zod variants to `stepSchema`: `dblclick`, `selectOption`, `type`, `scroll`,
`drag`; extend `waitFor` with `state` and `count` (refine: not both); add `count` to
`checkSchema`. Existing variants are unchanged, so old declarations parse and hash the same.

## Execution (`src/eval/change.ts`)

| Step | Playwright |
| --- | --- |
| `dblclick` | `locator.dblclick()` |
| `selectOption` | `locator.selectOption({ value } \| { label })` |
| `type` | `locator.pressSequentially(text, { delay })` |
| `scroll` | `window`: `page.mouse.wheel` or `scrollTo` for top/bottom; element: `locator.evaluate(el => el.scrollBy / scrollTop)` |
| `drag` | `from.boundingBox()` → `mouse.move/down` → move to target box centre or by offset in 10 steps → `mouse.up` |
| `waitFor` + `state` | `locator.waitFor({ state })` |
| `waitFor` + `count` | poll `locator.count()` until equal, 15 s timeout (non-strict) |
| `count` check | `locator.count()` compared to `equals` |

All element actions use the default 3 s action timeout (as `click` does); only `waitFor`
uses 15 s. Failures are classified by spec `agent-diagnostics`
(`locator_ambiguous`, `locator_timeout`, …).

### As built (2026-11-09)

- `scroll` is an instant programmatic scroll (`scrollTo`/`scrollBy` with
  `behavior: "instant"`) of the strict container or `document.scrollingElement`, not
  `page.mouse.wheel`: it is deterministic and fires `scroll` events, but not `wheel`
  events. A target that cannot scroll fails the step. Two animation frames pass before
  the next step, so scroll listeners have run.
- `drag` also drives native HTML drag and drop (`draggable`) in Chromium.
- `waitFor` `count` polls every 50 ms; on timeout its private message keeps the
  `Timeout …ms exceeded` / `waiting for locator` shape, so it is `locator_timeout`.
- `count` checks retry for about 1.5 s like other element checks.
- `type` text is withheld from feedback like `fill` values.
- Found while testing: redaction replaced short private inputs (a one-letter `fill`
  value) inside PRAMAN's own field names, which crashed report writing. Field names that
  are plain identifiers are now left as they are; values are still redacted.

## Recording and preview

Walkthrough recording replays the same steps, so the new actions work in `preview` and
`demonstrate` without extra code. Spotlight focus comes from each story beat's own
`selector`, not from the step.

## Testing strategy

One local fixture page per action (double-click counter, select element, key log, scroll
container with a sentinel, draggable item with a drop zone, list that renders N items
after a delay). Each test: pass case, wrong-target case (`insufficient_evidence`), and a
`specHash` stability test for an unchanged old scenario. Cheat sheet gets one example per
action.

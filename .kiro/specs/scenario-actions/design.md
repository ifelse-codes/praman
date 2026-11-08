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

All use the existing 15 s step timeout and failure classification from spec
`agent-diagnostics` when present.

## Recording and preview

Walkthrough recording replays the same steps, so the new actions work in `preview` and
`demonstrate` without extra code. Spotlight focus uses the step's primary selector (`drag`:
`from`).

## Testing strategy

One local fixture page per action (double-click counter, select element, key log, scroll
container with a sentinel, draggable item with a drop zone, list that renders N items
after a delay). Each test: pass case, wrong-target case (`insufficient_evidence`), and a
`specHash` stability test for an unchanged old scenario. Cheat sheet gets one example per
action.

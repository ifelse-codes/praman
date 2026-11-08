# Requirements: scenario actions and waits (gaps 2 and 4)

Spec type: feature (requirements-first). Source: the opencode/Lattice session of
2026-11-06. The agent had to leave PRAMAN and write raw Playwright scripts for double-click,
fill-handle drag and scrolling, so those flows have no PRAMAN evidence.

## Introduction

Browser scenarios support 8 actions (`goto`, `waitForURL`, `click`, `hover`, `waitFor`,
`fill`, `press`, `upload`). `waitFor` waits only for "visible". All additions are optional
and backward compatible: every existing scenario keeps the same meaning and `specHash`
rules.

## Requirement 1: New actions

**User story:** As a coding agent, I want common user gestures as steps, so the whole
workflow is verified by PRAMAN instead of side scripts.

1.1 THE SYSTEM SHALL support `dblclick` (`selector`).
1.2 THE SYSTEM SHALL support `selectOption` (`selector`, `value` or `label`, exactly one).
1.3 THE SYSTEM SHALL support `type` (`selector`, `text`, optional `delayMs` 0–200): key-by-key
input, unlike `fill`.
1.4 THE SYSTEM SHALL support `scroll` (`selector` of a scroll container or `"window"`,
and `to`: `top`, `bottom`, or `{ "x": int, "y": int }` pixel deltas).
1.5 THE SYSTEM SHALL support `drag` (`from` selector, and `to` selector or
`{ "dx": int, "dy": int }`), using real pointer down, move and up.
1.6 EVERY new action SHALL require a `note`, use strict locators, and fail as
`insufficient_evidence` when its target cannot be acted on.

## Requirement 2: Richer waits

**User story:** As an agent, I want to wait for the real condition, so a check does not pass
on a half-rendered page (Lattice: an empty chart passed a `visible` check).

2.1 `waitFor` SHALL accept an optional `state`: `visible` (default), `hidden`, `attached`,
`detached`.
2.2 `waitFor` SHALL accept an optional `count` (integer ≥ 0) to wait until the selector
matches exactly that many elements; `count` and `state` are mutually exclusive.
2.3 THE SYSTEM SHALL add a `count` check kind (`selector`, `equals` integer ≥ 0, optional
`afterStep`).
2.4 A `waitFor` with `count` SHALL NOT trigger strict mode (it counts on purpose).

## Non-goals

No free-form script step. No coordinate-only clicks. Native file dialogs, canvas
painting and touch gestures stay out of scope.

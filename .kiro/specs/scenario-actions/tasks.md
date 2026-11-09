# Tasks: scenario actions and waits

- [x] 1. Schema variants and validation tests (old scenarios unchanged, same `specHash`)
  - _Requirements: 1.1–1.6, 2.1–2.3_
  - The pinned old-style declaration hashes to the same value with the old schema (`fa9e18e`) and the new one
- [x] 2. Fixture pages for each action and wait
  - One page in `tests/scenarioActions.test.ts` (double-click cell, select, key counter, scroll container, long page, pointer drag item and handle, native draggable, spinner and delayed rows)
- [x] 3. Implement `dblclick`, `selectOption`, `type`
  - _Requirements: 1.1–1.3_
- [x] 4. Implement `scroll` and `drag`
  - _Requirements: 1.4, 1.5_
- [x] 5. `waitFor` `state`/`count` and the `count` check
  - _Requirements: 2.1–2.4_
- [x] 6. Preview/demonstrate smoke with one new action
  - `preview` of a walkthrough over `dblclick`, `drag` and `waitFor` `count`: `passed`, scenes at steps 0–2. `demonstrate` replays the same `executeScenario` steps; no separate movie was made
- [x] 7. Full suite; first-use 12/12; prove one new action through a Kiro session; log it
  - 2026-11-09: full suite 264 tests / 34 files before the docs; headless `sess_1cf21d4c…` (`praman-explorer`) verified a `dblclick` + `drag` scenario through MCP: `passed`, both checks `yes` in both runs
  - Real apps, 2026-11-09: Lattice (all five actions, `waitFor` `count`, `count` checks; 12/12 in both runs; also through MCP in `sess_8d9c7ba5…`) and Luma (`type`, `dblclick`, `waitFor` `count`/`detached`/`visible`/`hidden`, `count`; 8/8 in both runs), both from unmodified local checkouts; negative controls `failed` and `locator_ambiguous`
- [x] 8. Cheat sheet, README, CHANGELOG, STATUS

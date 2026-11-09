# Tasks: named steps

- [x] 1. `stepRef` schema, id table, reference validation and tests
  - _Requirements: 1.1–1.3, 1.5_
- [x] 2. Resolve refs before execution; show index (and private id) in evidence
  - _Requirements: 1.4, 1.6_
  - Private `result.json` keeps `afterStepId` and `failedStepId`; safe output and `REPORT.md` show indexes only (design default)
- [x] 3. Walkthrough and network window refs
  - _Requirements: 1.2_
- [x] 4. Full suite; first-use 12/12; one Kiro session using step ids; log it
  - 2026-11-09: full suite 276 tests / 35 files; 10 of 11 new tests fail on the old code; headless `sess_fc0aef1b…` (`praman-explorer`): id scenario with an inserted step `passed`, checks ran after steps 1 and 2, MCP response held no step ids
- [x] 5. Cheat sheet, README, CHANGELOG, STATUS

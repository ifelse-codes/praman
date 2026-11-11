# Tasks: Many users and invariants

- [x] 1. Gap record on Kan and Shiori (old code)
  - _Requirements: observed gap_
  - 2026-11-11: a declaration with `users` and invariants was rejected on both apps (`Unrecognized key: "users"`). Private: `.praman/real-apps/{kan,shiori}/users/gap-before.txt`
- [x] 2. Schema: `users`, `{user}` tokens, refusals
  - _Requirements: 1.x, 2.1, 2.2_
- [x] 3. Engine: per-user runs, barrier, observer, peak concurrency, aggregate and gate
  - _Requirements: 1.3, 1.4, 2.x, 3.x_
- [x] 4. Feedback, report and `usersSummary`
  - _Requirements: 3.3, 3.4_
- [x] 5. Deterministic tests (fixture server with a broken variant), failing on the old code
  - _Requirements: 4.1_
  - `tests/manyUsers.test.ts`: 20 tests; the file cannot load on the old code (schema rejects `users`)
- [x] 6. Real proof on Kan and Shiori (CLI) and through MCP in headless Kiro
  - _Requirements: 4.2_
  - Both apps `passed` 2/2 (3 users, peak 3); wrong count `failed`; MCP Shiori `sess_f1e93068…`, Kan `sess_0eb1fbfb…`
- [x] 7. Full checks; README, ROADMAP, STATUS, CHANGELOG, usage log; clean up; deliver
  - build, lint, lint:tests, 330 tests / 38 files, first-use 12/12

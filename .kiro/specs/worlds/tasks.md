# Tasks: Worlds

- [x] 1. Gap record on Kan and Shiori (mutating scenario, 2 repeats, old code)
  - _Requirements: observed gap_
  - 2026-11-10: Kan (create a board, expect two) and Shiori (delete the seed bookmark, expect none): repeat 1 `passed`, repeat 2 not (it saw repeat 1's data); verdict `insufficient_evidence`. Private: `.praman/real-apps/{kan,shiori}/gap-before.json`
- [x] 2. `dataPath`, world module, create `--world`, `world-save`, reset to world
  - _Requirements: 1.x, 2.x_
  - `src/environments/world.ts`, `docker.ts`, `manager.ts`, CLI, MCP. A `docker cp` round trip of a stopped Postgres was byte-identical, so the restored data is verified by hash
- [x] 3. Per-repeat restore hook in verify; `world-runs.json`
  - _Requirements: 3.x_
  - `ProofHooks.beforeRepeat` in `proveChange`; `demonstrate` is refused for copies
- [x] 4. Deterministic tests (fake `docker` on PATH), failing on the old code
  - _Requirements: 1–3_
  - `tests/worlds.test.ts`: 9 tests; all 9 fail with the old `src/`
- [x] 5. Real proof on Kan and Shiori (CLI) and through MCP in headless Kiro
  - _Requirements: 4.x_
  - Both apps: isolation, 2/2 `passed` with matching hashes, altered archive refused. MCP: Shiori `sess_70a0f435…`, Kan `sess_51bf6aa8…`
- [x] 6. Full checks; README, ROADMAP, STATUS, CHANGELOG, usage log; clean up; deliver
  - build, lint, lint:tests, 287 tests / 36 files, first-use 12/12

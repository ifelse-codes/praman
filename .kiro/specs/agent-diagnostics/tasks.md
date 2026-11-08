# Tasks: agent diagnostics

- [x] 1. Capture real Playwright error messages (strict mode, timeout, navigation, closed) from local fixtures
  - _Requirements: 1.1–1.5_
- [x] 2. `src/review/classify.ts` and unit tests
  - _Requirements: 1.1–1.5, 1.7_
- [x] 3. Wire the diagnosis into `diagnostics.ts`, summary, `feedback.json`, `REPORT.md`, MCP
  - _Requirements: 1.6–1.8_
- [x] 4. Report pass/fail table (browser and command)
  - _Requirements: 2.1–2.4_
- [x] 5. Integration and privacy tests; full suite; first-use 12/12
  - 2026-11-09: `tests/classify.test.ts` (17), `tests/agentDiagnostics.test.ts` (4), command table in `tests/diagnostics.test.ts`; the 5 changed/new integration tests fail on the old code. Full suite 242 tests / 33 files; first-use 12/12
- [ ] 6. Prove in a Kiro session: an ambiguous selector gives `locator_ambiguous (N)` in the agent's view; log in `docs/kiro-usage.md`
- [ ] 7. README and cheat sheet; CHANGELOG; STATUS

# Tasks: environment re-check

- [x] 1. Run the Docker route on Miniflux and Kan with the unchanged code; record the gap
  - _Requirements: 2.1_
  - 2026-11-10: create/workload/fault/recover/reset/destroy worked (Miniflux); verify gave `insufficient_evidence` on both apps with the hidden directory error
- [x] 2. Write the replay copies after the proof engine runs; regression test that fails before the fix
  - _Requirements: 1.1–1.4_
  - 2026-11-10: `tests/managedEnvironment.test.ts` managed-verify test failed on the old code (`insufficient_evidence`), passes now
- [x] 3. Real route on both apps: create, passing scenario, workload makes it fail, reset, passing again, destroy with no owned leftovers
  - _Requirements: 2.1_
  - Kan: done. Miniflux: blocked by a separate PRAMAN browser limit (Playwright request routing makes Chromium abort its CSS page transitions; PRAMAN reports an app runtime error). Owner decision: replace Miniflux. Shiori `v1.8.0`: same gap shown on the old code, then the full route passed
- [x] 4. The same route through `praman_environment` in a headless Kiro session; log it
  - _Requirements: 2.2_
  - Kan `sess_ec6f85f4…` (one run hit Kan's sign-in rate limit, HTTP 429: `insufficient_evidence`), Shiori `sess_50cf2e81…`
- [x] 5. Full checks; README contract, ROADMAP, STATUS, CHANGELOG, usage log; clean up; deliver

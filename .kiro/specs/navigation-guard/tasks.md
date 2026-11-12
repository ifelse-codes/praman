# Tasks: navigation guard without false failures

- [x] 1. Add plan step 4c to `docs/ROADMAP.md` (first commit)
- [x] 2. Find the trigger in a local fixture and on live Miniflux (private `trigger.md`)
- [x] 3. Gap on Miniflux with current `main`: `failed`, `pageErrors` 2 (`gap-before.json`); control on the old code
- [x] 4. Owner decision: stop the run with `navigation_failed`; also stop redirect hops and new tabs
- [x] 5. `src/eval/navigationGuard.ts` (browser-level Fetch, documents only, cache on) and its use in `executeScenario`
- [x] 6. `tests/navigationGuard.test.ts` (11 tests, 8 fail on the old code) and one classifier case
- [x] 7. Real proof: Miniflux `passed` 2/2 and the control `navigation_failed`; Kan and Shiori unchanged; headless Kiro; `REPORT.html`
- [x] 8. Full checks; README, ROADMAP, STATUS, CHANGELOG, kiro-usage; clean up; deliver

# Design: environment re-check

## Fix

`src/environments/manager.ts` wrote the replay copies (`scenario.json`,
`declaration.json`) into `runs/<ts>-verify/` before calling `proveChange` or
`demonstrateChange`. Both engines own that directory: `proveChange` refuses one that
already holds `scenario.json`, `demonstrateChange` refuses any non-empty one.

- The replay copies are written **after** the engine returns. `proveChange` already
  writes the parsed `scenario.json` there, so the manager writes only
  `declaration.json`, pointing at that file, and does not overwrite it.
- When preflight fails before the engine runs (not ready, active fault, observe error),
  the catch path writes both copies and the synthetic `insufficient_evidence` proof, as
  before.
- `feedbackContext.declarationPath` is unchanged, so feedback still names the replay
  declaration.

No schema, CLI or MCP change. Old declarations keep their meaning; scenario hashes are
untouched.

## Testing strategy

`tests/managedEnvironment.test.ts` gains a deterministic managed-verify test with no
Docker daemon: a fake `docker` executable on `PATH` answers `ps` and `inspect` for one
owned container, and a local HTTP server serves the page. The test persists a ready
Docker state with a scenario and asserts that `verify` returns `passed`, that the run
directory holds `proof.json`, `scenario.json` and a `declaration.json` that points at
it, and that `demonstrate` reaches a proof. It fails on the old code with the
directory error.

## Real-app proof

Private under `.praman/real-apps/<app>/` (integration module, declaration, scenario,
evidence). Kan runs from a `git archive` export of its checkout's HEAD because the
checkout holds unrelated uncommitted work. Shiori `v1.8.0` runs a binary built from its
unmodified checkout into `.praman/`. Miniflux `v2.3.5` was tried first and dropped
(owner decision, 2026-11-10): PRAMAN's Playwright request routing made Chromium abort
its CSS cross-document page transitions, which PRAMAN reports as an app runtime error.
That browser limit is recorded in the README and deferred to its own spec. Both apps
run on the host against owned containers on loopback ports; the Docker provider creates
no network, so containers cannot reach each other (a known limit, not changed here).

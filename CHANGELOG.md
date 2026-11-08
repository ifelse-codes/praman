# Changelog

## Unreleased

### Added

- Kiro integration (2026-11-08): workspace MCP wiring, `praman-explorer` agent, lint
  and `Stop`-hook finish gate, steering, and an installable Kiro Power (`kiro-power/`).

### Fixed

- Interruption (spec `verify-cancellation`): Ctrl-C or SIGTERM during `command-verify`,
  `workflow-replay`, `coverage-review`, `workflow-campaign` (not durable),
  `command-preview` or `command-demonstrate`, and MCP request cancellation, stdin close
  or SIGINT/SIGTERM for the matching tools, no longer leave the declared command
  running. PRAMAN stops the owned process group (SIGTERM, then SIGKILL after 2 s),
  starts no further runs, records `insufficient_evidence` with `"interrupted": true`,
  and the CLI exits 130 or 143. Owned groups are also killed if PRAMAN exits early.
  Uninterrupted runs and durable/agent campaign stop behavior are unchanged. Added the
  repair-mode self-check `examples/self-check/cancellation/`.
- MCP: `PRAMAN_RELATIVE_PATHS=reject` refuses relative path arguments with an
  `insufficient_evidence` result before anything runs or is written. The Kiro Power sets
  it, because its server runs from the installed Power's directory; relative paths had
  resolved there. In this mode `praman_environment` also requires `baseDir`, because its
  default is relative. Default behavior (resolve against the server's working directory)
  is unchanged. Known limit: the demonstrate tools' speech cache default stays relative.

## 0.1.0 — 2026-11-05

Submission snapshot. Same-host verified; not published.

### Added

- Authored browser verification (`scenario-verify`, MCP `praman_scenario_verify`):
  real Chromium, authored steps/checks, 2–10 fresh repeats, screenshots, network
  and page-error observations.
- Authored command verification (`command-verify`, MCP `praman_command_verify`):
  trusted executable, explicit exit/stream/artifact expectations, bounded fresh
  artifacts, media decode.
- Explicit verification modes: `acceptance`, `repair` (declared historical
  baseline + named regression) and `comparison` (explicit baseline attribution).
- Evidence-backed feedback, reports, indexed diagnostics and CLI exit codes 0/1/2;
  MCP `isError` on non-pass.
- Managed kind/Docker environment lifecycle, declared HTTP test service, workflow
  replay, trace-to-case reconstruction and coverage review.
- Bounded count/duration/durable/agent campaigns with isolated state.
- Optional proof-gated narrated walkthroughs (browser and command), with replay
  equality against the stored proof.
- Public first-use guide and `examples/first-use/run.mjs` negative-control runner:
  12 CLI/MCP outcomes.
- CI workflow (Ubuntu + macOS): typecheck source and tests, build, Chromium, tests.
- `.kiro` specs, steering, save hook and explorer agent aligned with the product.

### Changed

- MCP surface reduced to 14 tools; legacy `praman_verify`, `praman_experience`
  and `praman_stimulate` removed with the legacy pipeline.
- README, AGENTS.md and product docs rewritten to match the delivered product.
- Dependencies pruned; `npm audit` reports zero known vulnerabilities.

### Removed

- Legacy checkout demo pipeline (`verify`, `world`, `gateway`, `chaos`, `soak`,
  `trace-demo`, `dashboard`) and its target app.
- Target-specific Headlamp/Kan reference integrations and example directories.
- 5.7 GB private evidence tree (moved to an external, non-published archive).
- Process-log documentation (master, roadmap, history, research, session plans).

### Verified on the recorded host

- `tsc --noEmit` clean; clean build reproduces `dist`.
- 190 tests / 28 files pass in a single-worker run after hardening, including the
  dispatch smoke tests; `npm run lint:tests` typechecks the test suite.
- First-use route: 12/12 expected CLI and MCP outcomes.
- PII-free tracked files; MIT license; `npm audit`: 0 known vulnerabilities.
- Public repository published at github.com/ifelse-codes/praman (MIT; squashed public snapshot under the owner identity). CI green on Ubuntu and macOS
  (run 42018863948; 174 passed + 16 environment-guarded skips per runner) and the
  Linux job also runs the documented first-use judge route. Static project page
  deployed at ifelse-codes.github.io/praman/.
- Judge access for evaluation: TESTING.md, a Codespaces devcontainer and a Linux CI
  first-use step with the expected 12/12 outcomes.
- Final independent fresh-clone verification of public HEAD a84788e: npm ci, lint,
  lint:tests, build, 190/190 tests, 12/12 first-use outcomes; deterministic 101-member
  candidate identity recorded in private archive metadata.
- Submission assets: captured official Kiroween 2026 rules, truthful Kiro usage
  account, <=3 minute video script, submission-ready Devpost copy, blog/social drafts,
  static project page, platform matrix, push-ready repository script and npm pack
  allowlist.
- Independent fresh-clone verification of the release-hardening commit: `npm ci`,
  lint, test-typecheck, build, 190 tests / 28 files, 12/12 first-use outcomes,
  14 MCP tools, no personal data in tracked files.
- Limits: no sandbox, authored checks (not autonomous discovery), independent-human
  validation pending, optional surfaces frozen, raw historical evidence not in the
  repository.

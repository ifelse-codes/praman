# Changelog

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
- Public repository published at github.com/ifelse-codes/praman (MIT, single squashed
  commit under the owner identity); CI green on Ubuntu and macOS
  (run 42014191366; 174 passed + 16 environment-guarded skips per runner);
  static project page deployed at ifelse-codes.github.io/praman/.
- Submission assets: captured official Kiroween 2026 rules, truthful Kiro usage
  account, <=3 minute video script, submission-ready Devpost copy, blog/social drafts,
  static project page, platform matrix, push-ready repository script and npm pack
  allowlist.
- Independent fresh-clone verification of the release-hardening commit: `npm ci`,
  lint, test-typecheck, build, 190 tests / 28 files, 12/12 first-use outcomes,
  14 MCP tools, no personal data in tracked files.
- Limits: same host only, no sandbox, authored checks (not autonomous discovery),
  optional surfaces frozen, raw historical evidence not in the repository.

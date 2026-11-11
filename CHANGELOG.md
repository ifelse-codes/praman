# Changelog

## Unreleased

### Added

- Many users and invariants (spec `many-users`, plan step 3): an `acceptance` scenario
  may declare `users` (2 to 10): the same steps and checks run as N users at once, each
  in its own browser and context, with `{user}`/`{user1}` index tokens, an optional
  start stagger, an optional `syncAtStep` barrier and caller-declared `invariants`
  (existing check kinds; `count` may scale with the number of users) read once after
  every user ended by the first user's page. Evidence is kept per user
  (`after-<n>/user-<k>/`) with the peak concurrency; a repeat passes only when every
  user and invariant passes, a broken invariant is `failed`, and an unobserved one or
  a peak below 2 is `insufficient_evidence`. Reports and feedback list user and
  invariant verdicts by index; managed `verify` ends with `usersSummary`. Declarations
  without `users` keep their meaning and hash.
- Network faults (spec `network-faults`, plan step 2): a Docker service may declare
  `proxy`; PRAMAN then runs an owned Toxiproxy container on an owned network between
  the application and the service (`state.services[name].port` becomes the proxy port,
  `directPort` the service's own). Named `faults` (`delay`, `timeout`, `drop`, `down`)
  are applied with `environment fault <id> <name>` or `praman_environment` `fault`, and
  removed with `recover`; each effect and each recovery is observed through a probe
  over the proxy, or the result is `insufficient_evidence`. Scenarios may declare fault
  windows (`faults: [{ name, fromStep, throughStep }]`, step ids allowed) that managed
  `verify` applies in every run and records per run; results carry
  `evidence.faultWindows` and a last-field `faultSummary`. Windows are refused outside
  a managed verify. `faultService` is optional when `faults` is declared. Declarations
  and scenarios without these fields keep their meaning and hash.
- Worlds (spec `worlds`, plan step 1): a Docker service may declare `dataPath`;
  `environment world-save <id>` saves the declared data paths as a hashed world,
  `environment create --world <id>` starts a copy after verifying the hashes and the
  restored data, `reset` restores the world, and `verify` restores it before every
  repeat and records each repeat's starting hash (`world-runs.json`). Changed worlds are
  `insufficient_evidence`. MCP: `praman_environment` action `world-save` and argument
  `world`. Environments without a world behave as before.
- Failure diagnosis (spec `agent-diagnostics`): when a browser step or check cannot
  run, `--summary`, `feedback.json`, `REPORT.md` and MCP results name the kind
  (`locator_ambiguous` with the matched count, `locator_timeout` with the timeout and
  any named state, `navigation_failed`, `browser_closed`, `unknown`) and give a next
  action for that kind. Selectors, URLs, values and raw errors stay private. Verdicts
  and exit codes are unchanged.
- `REPORT.md` for browser and command verification starts with a `## Checks` pass/fail
  table: one row per check with its verdict in every run.
- Browser actions (spec `scenario-actions`): `dblclick`, `selectOption` (`value` or
  `label`), `type` (key by key, optional `delayMs`), `scroll` (container or `window`;
  `top`, `bottom` or pixel deltas) and `drag` (real pointer moves to a target or by an
  offset). `waitFor` accepts `state` (`visible`, `hidden`, `attached`, `detached`) or
  an exact element `count`; new `count` check. Existing declarations parse and hash
  the same.
- Step ids (spec `named-steps`): any step may have an `id`; `afterStep`, network
  `window.fromStep`/`throughStep`, walkthrough `startStep` and beat `step` accept the id
  instead of an index, so inserting a step no longer moves checks. Ids resolve to
  indexes at parse time; unknown or duplicate ids are rejected before execution with
  the field path. Safe output shows indexes; ids stay in private evidence. Index-only
  declarations keep their meaning and hash.
- Kiro integration (2026-11-08): workspace MCP wiring, `praman-explorer` agent, lint
  and `Stop`-hook finish gate, steering, and an installable Kiro Power (`kiro-power/`).

### Fixed

- Managed `environment verify` always returned `insufficient_evidence` without running
  the scenario ("Managed preflight unavailable"): the manager wrote its replay copies
  (`scenario.json`, `declaration.json`) into the run directory before the proof engine
  ran, and the engine refuses a directory that already holds a run. The copies are now
  written after the engine returns, so `verify` gives the scenario's real verdict;
  `environment demonstrate` no longer refuses its own directory either. Found and
  re-checked on real Kan and Shiori (plan step 0).
- `type` steps no longer time out while typing: the 3 s action limit applied to the whole
  key sequence, so 20 keys at the allowed 200 ms delay always failed as
  `insufficient_evidence`. Typing now gets time for every key on top of the 3 s.
- Feedback redaction no longer rewrites PRAMAN's own field names. A short private input
  (for example a one-letter `fill` value) used to be replaced inside keys such as
  `path`, so `scenario-verify` crashed while writing `REPORT.md` instead of recording the
  run.
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

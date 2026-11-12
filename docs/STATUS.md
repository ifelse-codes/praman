# PRAMAN — current project status (2026-11-11, Hue-style environment plan, step 4 done)

PRAMAN (प्रमाण, "evidence") is an evidence-driven verification toolkit for AI coding
agents. An agent supplies an authored browser scenario or command declaration through
the CLI or MCP; PRAMAN executes it against real software, checks the declared
requirements, and returns evidence-backed feedback. It is not a coding agent, not a
general simulator and not a sandbox.

## Current state

- **Plan (2026-11-10):** the owner lifted the feature freeze. Work follows the
  Hue-style environment plan in [ROADMAP.md](ROADMAP.md): step 0 environment re-check
  (**done 2026-11-10**), 1 Worlds (**done 2026-11-10**), 2 real network faults (**done
  2026-11-10**), 3 many users and invariants (**done
  2026-11-11**), 4 recorded outside APIs (**done 2026-11-11**), 4b the HTML evidence report (**done
  2026-11-12**), then the video and blog. One step per Kiro
  session; each session ends with a green PR fast-forwarded to `main`. Real-app proof uses
  Kan and Shiori (Shiori replaced Miniflux on 2026-11-10, owner decision; see below).
  Next: step 5, the video and blog (spec `submission-story` tasks 4 to 6); the handoff is
  in ROADMAP.md ("Handoff for the next session") and the private
  `.praman/real-apps/HANDOFF.md`.
- **HTML evidence report (2026-11-12, plan step 4b, spec `html-evidence-report`):** an
  outside review found no single review screen. Before: on Shiori a failing invariant
  needed 4 files to see its screenshot, expected and observed values and next action. Now
  every browser run writes `REPORT.html` (private local view, owner option B: application
  text and expected/observed values shown; fill values, typed text and credentials
  redacted; mode 0600; offline, no script, CSP blocks network sources; relative links).
  Verdicts, `proof.json`, `feedback.json`, exit codes and schemas are unchanged
  (`feedback.json` and `REPORT.md` bytes pinned by a test). Results carry `reportHtml`
  (managed `verify` puts it before the summaries); `scenario-verify` prints `HTML report:`.
  Real proof on Kan and Shiori (managed `verify`): `passed`, `failed`,
  `insufficient_evidence` pages, each banner equal to `proof.json`, opened from `file://`
  in Chromium: every image loaded, only `file:` requests, no CSP violation; the failing
  run needs 1 file. Headless Kiro: Shiori `sess_154d90ca…` (path seen but not usable as
  given, see the limits; no HTML or seeded secret in the result; first run `sess_67513873…` could not see the path in the cut
  middle of a 44 000-character result, fixed; Kan `sess_88dac836…` saw the path, no HTML or seeded credential in the saved result). Follow-up checks: all six pages pass a script check at 1280 px (no horizontal overflow, one h1, alt text on every image, table headers with scope, no duplicate ids, every in-page link resolves, no script, worst text contrast 6.38:1) and print to PDF; WebKit loads every image with only `file:` requests and blocks a remote image; Firefox did not launch in this environment (not tested). 10 new tests, 9 fail on the old code; full
  suite 357 tests / 40 files; first-use 12/12. Limits: no HTML for command runs; the
  world hash is written after the page; invariants are not tied to a step; the page is
  private; Chromium only. Found in review (2026-11-12): CLI and MCP output hide every
  known secret value, also inside file paths. Shiori's database user is `shiori`, which is
  also a folder name in the run path, so on Shiori the `reportHtml` path (and the older
  `report` and `feedbackPath` paths) shows `[REDACTED]` for that folder and cannot be
  opened as given. The file itself exists and is correct; Kan was not affected. Not
  fixed (deferred in ROADMAP.md).
- **Recorded outside calls (2026-11-11, plan step 4, spec `recorded-apis`):** before the
  change, Shiori's page download (`http://example.com/`) and Kan's server call to
  `https://formbricks.com/api/oss-friends` reached the internet in every managed `verify`
  (`passed` 2/2, unseen); with the outside network cut the same scenarios `failed`
  (Shiori) or stopped (Kan); `outsideCalls` was rejected by the schema. Now a Docker
  declaration may declare `outsideCalls`: PRAMAN runs an owned Hoverfly container
  (Apache-2.0, `spectolabs/hoverfly:v1.12.17`, per-environment password and CA) that
  records; `recording-save` stores a hashed recording; `create --recording` re-hashes it
  and replays it on a network with no outbound route after observing that an unrecorded
  call is refused. Every `verify` run is checked: a refused call, a failed recorded call,
  a rejected TLS handshake or fewer served calls than `minPerRun` (default 1) give
  `insufficient_evidence`. The integration points the app at `state.outside.proxyUrl` and
  `caCert` through the app's own settings. Shiori (HTTP) and Kan (HTTPS) recorded and
  replayed `passed` 2/2; controls: an unrecorded page (1 refused), an app not pointed at
  the replay (all checks passed, 0 served), an untrusted CA (1 TLS refused) were each
  `insufficient_evidence`; an appended byte stopped `create` with no container started; a
  container on the replay network could not reach `example.com` or `1.1.1.1`. Through
  `praman_environment` in headless Kiro both replays `passed` (`sess_8a40cfeb…` Shiori,
  `sess_a6b1afe5…` Kan; no seeded secret or recorder password in the output). 17 new
  tests (fake `docker` and a fake recorder), 13 fail on the old code. Limits: only calls
  through the app's proxy settings are seen; Go on macOS cannot trust an added CA, so
  Shiori was proven over HTTP only; Hoverfly's default matching (no headers), no timing
  replay or stateful sequences; browser-side outside calls are not recorded (no real-app
  scenario had one). Private inputs and evidence: `.praman/real-apps/{shiori,kan}/outside/`
  and `kiro-mcp-outside/`.
- **Many users and invariants (2026-11-11, plan step 3, spec `many-users`):** before the
  change, a declaration with `users` and invariants was rejected by the schema on both
  Kan and Shiori, and a scenario ran one user per run. Now an `acceptance` scenario may
  declare `users` (2 to 10): each user gets its own browser and context and runs every
  step and check (`{user}`/`{user1}` tokens, `staggerMs`, a `syncAtStep` barrier), and
  caller-declared `invariants` (existing check kinds; `count` may use
  `{ perUser, plus }`) are read once by the first user's page after all others ended.
  Evidence is per user (`after-<n>/user-<k>/`) plus the peak concurrency; a repeat passes
  only when every user and invariant passes; a broken invariant is `failed`; an
  unobserved invariant or a peak below 2 is `insufficient_evidence`. On Kan (Postgres +
  RustFS) and Shiori (Postgres), from saved worlds: three users at once (peak 3), the
  invariant "seed plus one each" `passed` 2/2 (Shiori also "no duplicate title"); a wrong
  count (`perUser: 2`) `failed` with every user `passed`; through `praman_environment` in
  headless Kiro both apps `passed` (`sess_f1e93068…` Shiori, `sess_0eb1fbfb…` Kan; no
  seeded secret in the files; the 36 to 38 KB verify result is cut by Kiro, so the
  agent read the last-field `usersSummary`). 20 new tests (a fixture with a deliberate
  lost update gives `failed`; the file cannot load on the old code). Limits: one machine
  and one environment copy; shared credentials; the barrier aligns step starts, not
  server arrival; only `count` scales; no faults, recording or baseline modes with
  users; neither real app showed a race. Stress run on this Mac (M5, 10 cores, 16 GB):
  Shiori `passed` up to 27 users, failed at 28; Kan `passed` up to 18, failed at 20 (see
  README for the causes); the default is 5 users (owner decision 2026-11-11) and the cap stays 10. Private inputs and evidence:
  `.praman/real-apps/{kan,shiori}/users/` and `kiro-mcp-users/`.
- **Network faults (2026-11-10, plan step 2, spec `network-faults`):** before the fix, a
  declaration naming a slow database was rejected by the schema, and `environment fault
  <id> db-slow` passed but ignored the name and stopped the whole database, on both Kan
  and Shiori. Now a Docker service may declare `proxy`: PRAMAN runs an owned Toxiproxy
  container (MIT, `ghcr.io/shopify/toxiproxy:2.13.0`) on an owned network between the
  application and the service, and the application's `state.services[name].port` is the
  proxy port. Named `faults` (`delay`, `timeout`, `drop`, `down`) are applied by
  `fault <id> <name>` or by scenario windows at step ids during managed `verify`; each
  effect and recovery is observed through a probe over the proxy, or the result is
  `insufficient_evidence`. On Kan (Postgres; `delay` and `down` also on RustFS storage)
  and Shiori (Postgres): every kind observed and removed with recovery observed; fault
  scenarios authored from real behavior `passed` 2/2; through `praman_environment` in
  headless Kiro (`sess_8d627916…` Shiori, `sess_808c8533…` Kan; no seeded secret in the
  output). Controls: a probe that bypassed the proxy gave `insufficient_evidence`; a
  wrong expectation under `down` `failed`; `reset` recreated the proxy and network;
  `destroy` left no labelled container or network. 22 new deterministic tests (fake
  `docker` and a fake proxy API); 15 fail on the old code (the other 7 are rejections
  and the unchanged no-proxy path). Found on the way: Kiro shows only the first and last
  500 characters of an MCP result over 30,000 characters, so the verify result now ends
  with a one-line `faultSummary`. Limits: the probe measures the proxy path, not the
  application; Toxiproxy counts bytes only when a connection closes, so per-window
  application traffic is not reported; one fault at a time; no container-to-container
  or kind faults. Private inputs and evidence: `.praman/real-apps/{kan,shiori}/`
  (`faults-gap/`, `faults/`, `kiro-mcp-faults/`).
- **Worlds (2026-11-10, plan step 1, spec `worlds`):** before the fix, a scenario that
  changes data passed repeat 1 and failed repeat 2 of one managed `verify` on both Kan
  (create a board, expect two) and Shiori (delete the seed bookmark, expect none),
  because repeats shared one database. Now a Docker service may declare `dataPath`;
  `environment world-save` stores a hashed world, `create --world` starts a copy,
  `reset` restores it and `verify` restores it before every repeat, recording each
  repeat's starting hashes. On Kan (Postgres + RustFS) and Shiori (Postgres): copy A's
  change was absent in copy B and in the source; the same scenarios `passed` 2/2 with
  every hash equal to the world; an altered archive gave `insufficient_evidence` at
  `create`; through `praman_environment` in headless Kiro both apps passed
  (`sess_70a0f435…` Shiori, `sess_51bf6aa8…` Kan; no seeded secret in the output).
  Nine new deterministic tests (fake `docker` on `PATH`) fail on the old code. Limits:
  Kan's address is fixed at build time, so one Kan application runs at a time (data
  copies are independent); `demonstrate` is refused for copies; baseline URLs are not
  isolated; no kind worlds or live snapshots. Private inputs and evidence:
  `.praman/real-apps/{kan,shiori}/` (`gap-before.json`, `world-*.json`, `kiro-mcp-worlds/`).
- **Environment re-check (2026-11-10, plan step 0, spec `environment-recheck`):**
  before the fix, managed `environment verify` returned `insufficient_evidence`
  ("Managed preflight unavailable") on real Miniflux, Kan and Shiori and no browser
  ran. The hidden cause: the manager wrote `scenario.json` and `declaration.json`
  into the run folder before the proof engine, which refuses a used folder.
  `demonstrate` had the same problem. The copies are now written after the engine
  runs; a new test (fake `docker` on `PATH`, no daemon) fails on the old code. With
  the fix, on Kan `927bf2fe` (clean export of the checkout's HEAD; Postgres and RustFS
  containers; app on the host) and Shiori `v1.8.0` (Postgres container; binary built
  from the unmodified checkout): `create`, seed scenario `passed`, a data-changing
  workload made it `failed`, `reset` (new containers and ports), `passed` again,
  `destroy` with no container carrying the ownership label and no owned process
  left. The same order ran through `praman_environment` in headless Kiro
  (`sess_ec6f85f4…` Kan, `sess_50cf2e81…` Shiori) with the same results, except one
  Kan run that was `insufficient_evidence` because Kan's sign-in rate limit answered
  HTTP 429 (not counted as a failure; the CLI run waits 12 s between verifies). MCP
  output held no seeded password or secret. Colima profile `praman-headlamp` was
  started by PRAMAN and stopped again afterwards. Limits: no Docker network (apps
  run on the host); `readinessWorkloads` run before the app restarts on reset;
  `destroy` does not sweep other labelled containers or remove images; kind not
  re-checked. Found, not fixed: on Miniflux v2.3.5, PRAMAN's Playwright request
  routing (its same-origin navigation guard) makes Chromium abort the CSS page
  transition after each in-app navigation and report `InvalidStateError`; PRAMAN
  counts it as an app runtime error, so no Miniflux scenario can pass (2 of 2 probes
  with routing, 0 of 2 without). Miniflux was dropped; the fix is deferred to its own
  spec. Private inputs and evidence: `.praman/real-apps/{kan,shiori,miniflux}/`.
- **History:** the private working history ends at `cc83be3`; the **public repository**
  is a squashed public snapshot under the owner identity (see the repository history),
  with CI green and judge access enabled.
- **Checks:** `npm run build` and `npm run lint` pass; `npm run lint:tests` passes;
  the **full suite passes 347 tests / 39 files** on the recorded host (2026-11-11,
  `--maxWorkers=2`), including the 17 outside-call tests, the 21 many-users tests, the 22 network-fault tests, the 8 Kiro finish-gate tests, the 15 cancellation
  tests, the 21 diagnosis tests, the 22 browser-action tests, the 11 step-id tests and
  the managed-verify test. Parallel local runs
  are resource-sensitive while macOS Spotlight/MediaAnalysis indexing saturates the
  CPU; CI uses a bounded worker count. Earlier, an independent fresh-clone verification
  of the release-hardening commit reproduced the then-current results (npm ci, lint,
  lint:tests, build, 190 tests, 12/12 first use, 14 MCP tools, PII-free).
- **First use:** `node examples/first-use/run.mjs` → **12/12** expected CLI/MCP
  outcomes (pass / mismatch / unavailable for command and browser), exit codes 0/1/2.
- **Kiro integration (2026-11-07/08, merged to public `main` in PR #1, merge commit
  `619a76e`):**
  spec `kiro-evidence-gate` closed. Workspace MCP wiring (`.kiro/settings/mcp.json`,
  owner-created because Kiro blocks agent writes there), `praman-explorer` agent with a
  `praman/*`-only permission rule, a v1 `PostFileSave` lint hook, an opt-in `Stop`-hook
  finish gate (`kiro-power/scripts/praman-gate.mjs` + 8 tests), two new steering files,
  and an installable Kiro Power (`kiro-power/`). Observed in Kiro: MCP calls returned
  `passed`/`failed` (CLI interactive + headless; IDE listed 14 tools); the gate rejected a
  failing stop and released it after the agent's fix (interactive CLI, owner-approved
  edits); the Power ran a `passed` check from a separate project. Full suite **198 tests /
  29 files**. Limits (Kiro CLI is the target; the Kiro IDE is not, owner decision
  2026-11-08): save-hook results never reach the
  agent; the agent never sees a passing gate verdict; the Power needs explicit
  `power`/`mcp` `praman*` allow rules for headless use and absolute paths. Session IDs:
  `docs/kiro-usage.md` usage log. `kiro-crew/` stub removed.
- **Power path fix (2026-11-08, on public `main` since `762cee6`):** the Kiro
  Power's MCP server runs from the installed Power's directory, so relative paths
  resolved there. The Power now sets `PRAMAN_RELATIVE_PATHS=reject`; relative path
  arguments, and `praman_environment` without `baseDir`, are refused as
  `insufficient_evidence` before anything runs or is written. Proven in Kiro
  (`sess_055fb96f…`). Known limit: the demonstrate tools' speech cache stays relative.
  Full suite **206 tests / 30 files** locally.
- **Cancellation fix (2026-11-08):** spec `verify-cancellation` closed. On public `main`: first fix `59090bf` (PR #4) and the follow-up
  `7d2f4a7` plus a macOS cleanup fix `454c4ba` (PR #5), both by fast-forward; CI green
  on Ubuntu and macOS (205 passed / 16 skipped of 221). The follow-up covers the
  remaining paths. Ctrl-C/SIGTERM on `command-verify`,
  `workflow-replay`, `coverage-review`, `workflow-campaign` (not durable),
  `command-preview` and `command-demonstrate`, and MCP cancel, stdin close or
  SIGINT/SIGTERM for the matching tools, now stop the declared command's process group
  (SIGTERM, SIGKILL after 2 s), start no further runs, record `insufficient_evidence`
  with `"interrupted": true`, and the CLI exits 130/143. Owned groups are also killed
  if PRAMAN exits early. Reproduced before the fix on every listed path;
  `scenario-verify` and durable campaigns were not affected. Self-check
  (`examples/self-check/cancellation/`, repair mode): baseline `643fbe0` `orphan: yes`,
  current `orphan: no` 3/3, `passed`; also `passed` through the Kiro `Stop` gate
  (`sess_c6010529…`). Full suite **221 tests / 31 files**; first-use 12/12. Properties
  P1–P5 are covered by deterministic tests (owner decision: no Kiro IDE step, no
  `fast-check`); abort timing is tested at fixed points, not randomized.
- **Failure diagnosis (2026-11-09, spec `agent-diagnostics`, PR #9, public `main`
  `fa9e18e` by fast-forward):** before the fix, a real run with a selector matching 3
  buttons printed only `execution_unavailable: current run 1 step[0]` and a generic next
  action. Browser step and check failures now carry a fixed `diagnosis`
  (`locator_ambiguous` + matched count, `locator_timeout` + ms and any named state,
  `navigation_failed`, `browser_closed`, `unknown`) in `--summary`, `feedback.json`,
  `REPORT.md` and MCP results, with a next action for each kind. `REPORT.md` (browser
  and command) starts with a `## Checks` pass/fail table. Verdicts and exit codes are
  unchanged; only kinds and numbers leave private evidence. Proven in a headless Kiro
  session (`sess_0db97c0c…`, `praman-explorer`): the agent's MCP result held
  `locator_ambiguous`, `matched: 3`, and no selector, raw error or URL. Limits: the
  timeout state appears only when Playwright names it; `browser_closed` is tested with
  captured messages, not a real closing run; command runs are not classified; the finish
  gate still prints only the verdict and report path.
- **Browser actions and waits (2026-11-09, spec `scenario-actions`):** before the fix a
  real run passed a `visible` check on a chart container whose five bars had not
  rendered (screenshot: no bars), and a scenario with `dblclick`/`drag` steps was
  rejected by the schema. New steps `dblclick`, `selectOption`, `type`, `scroll`,
  `drag`; `waitFor` with `state` or an exact `count`; a `count` check. The same
  scenarios now pass with all five bars counted. Old declarations parse and hash the
  same (pinned test). Proven through MCP in a headless Kiro session (`sess_1cf21d4c…`):
  `dblclick` + `drag` scenario `passed`. Also fixed: redaction rewrote PRAMAN's own field
  names when a private input was very short (a one-letter `fill` value), which crashed
  report writing on public `main`. Limits: `scroll` is programmatic (no `wheel`
  events); no coordinate-only clicks, canvas painting, touch gestures or JS evaluation.
- **Step ids (2026-11-09, spec `named-steps`):** before the fix, inserting a help step at
  the start of a real two-click counter scenario made both index checkpoints run one step
  early (observed `0` and `1` instead of `1` and `2`, verdict `failed`), and step ids were
  rejected by the schema. Steps now take an optional `id`; `afterStep`, network windows,
  `walkthrough.startStep` and beat `step` accept it. The same inserted-step scenario with
  ids passes (checks after steps 1 and 2). Unknown or duplicate ids are rejected before
  execution with the field path. Ids stay in private evidence; safe output shows indexes.
  Index-only declarations keep their meaning and hash. Proven through MCP in a headless
  Kiro session (`sess_fc0aef1b…`). Limit: no automatic renumbering of existing index
  references.
- **Real-app check of the new browser features (2026-11-09):** run against two real
  apps used before, served locally from their unmodified checkouts. **Lattice**
  (spreadsheet, where the gaps were first found): one scenario with `dblclick` to edit a
  cell, `type` of a formula, a fill-handle `drag` to J5, `selectOption` of font size 18,
  `scroll` of the grid to the bottom and back, and `waitFor` with `count` for 12 chart
  bars; 12 checks, all with step-id checkpoints: `passed`, 12/12 in both runs. Controls:
  a zero-distance drag gave `failed` (J4, J5 not filled) and an ambiguous double-click
  selector gave `locator_ambiguous (312 elements)`. **Luma** (todo app): tasks added with
  `type`, `waitFor` `count` 3, `dblclick` rename, `waitFor` `detached`/`visible`/`hidden`
  for the editor and quick-actions palette, `count` checks; 8 checks `passed` in both
  runs; an ambiguous control gave `locator_ambiguous (3 elements)`. The same Lattice
  scenario also `passed` 12/12 through MCP in a headless Kiro session
  (`sess_8d9c7ba5…`). Scenarios and evidence are private under `.praman/real-apps/`.
  Not covered: Kan and Headlamp (need their databases or clusters); `selectOption`,
  `drag` and `scroll` were exercised on Lattice only, since Luma has none of them.
- **Docs clarification (2026-11-06):** added a one-page
  [browser scenario cheat sheet](schema-cheatsheet.md) plus explicit
  selector/zero-based/private-evidence guidance in the README and browser guide;
  product behavior and test counts are unchanged.
- **CI:** PR #26 (plan step 4) was green on Ubuntu and macOS (first on commit `cf5a2d6`,
  runs 43062385840 and 43062395264, then on its final commit) and `main` is fast-forwarded
  to it. Before that, every
  Ubuntu job failed for about 2.5 hours before any test ran: the GitHub runner (image
  `ubuntu-26.04` 20261101.186.1, the same as the last green `main` run) could not resolve
  the Ubuntu package mirrors, so `playwright install --with-deps` stopped. The Linux
  install step now falls back to installing Chromium without system packages (the image
  already has its libraries; the tests still fail if one is missing); the next Ubuntu run
  used the fallback and passed. On macOS, `tests/manyUsers.test.ts` ("passes when the
  shared rule holds") failed in 2 of 6 runs on loaded runners while the other run of the
  same code passed: user 1's `fill` of the input hit the 3 s action limit while three
  browsers started together (it passed 3 of 3 locally). The real-browser many-users tests
  now wait for the input first (`waitFor`, 15 s) and print which user failed and why;
  the product's 3 s action limit is unchanged. On macOS the lost-update fixture test also
  failed once (the users' saves did not overlap within its 150 ms window on a loaded
  runner, so no update was lost); the window is now 1500 ms. Once, on macOS only, the new
  `tests/outsideCalls.test.ts` record test gave `insufficient_evidence` (run 43069576808);
  the cause was not printed and it did not recur (passed locally under CPU load and in the
  next four CI jobs). Its verify assertions now print each run's error and outside-call
  evidence, so a recurrence will name the cause. The first push run on `main`
  (43087269880) then failed on macOS in `tests/cancellation.test.ts` ("Unexpected end of
  JSON input"): the test read a pids file that its child process had created but not yet
  written. The test now treats an empty or partial pids file as not written yet.
- **CI (step 3):** PR #22 (plan step 3) was green on Ubuntu and macOS (runs 42970668040 and
  42970675509) and fast-forwarded to `main` `f604355`. The push run on `main`
  (42972408874) failed once on macOS in `tests/networkFaults.test.ts` ("applies each
  window in every repeat": `insufficient_evidence`, 22 s on a loaded runner) while Ubuntu
  passed; the same code had passed twice in the PR. The failure could not be reproduced
  locally (six runs under CPU load). Likely cause, not proven: `applyFault` compared the
  delayed probe with one healthy sample, so a single slow healthy sample (cold start,
  busy host) can hide a real delay. Fix: the baseline is now the fastest of three healthy
  probes, and the test prints the failing window. The earlier step 2 run (`ce383e9`, run
  42809966916) and step 0 run (`1832643`, run 42786511955) were green on both runners;
  the skips are the environment-guarded media/speech suites (no ffmpeg/ffprobe on the
  runners). The Ubuntu job also runs the judge route. `tests/networkPolicy.test.ts`
  failed once on macOS CI (PR #8) and passed on rerun; it has passed since.
- **Final verification (2026-11-05, historical):** an independent fresh clone of public
  HEAD `a84788e` passed `npm ci`, lint, lint:tests, build, the then-current full suite
  (190/190) and the judge route (12/12). A deterministic candidate (101 members) built
  three times with identical SHA-256; the identity record is private archive metadata,
  not part of the repository.
- **Interfaces:** 16 CLI commands, 14 `praman_*` MCP tools over stdio.
- **Official rules:** captured from the live Kiroween 2026 rules page on 2026-11-05
  ([rules digest](kiroween-rules.md)). Submission deadline Dec 4, 2026 2:00 pm PT.
  Required: public repo + visible OSS license, `/.kiro` at root, text description,
  demo video under 3 minutes on public YouTube, Kiro usage write-up, and **judge access**
  (a link to a website, functioning demo or test build; failure may disqualify). PRAMAN
  provides the public repository as the test build, Codespaces and [testing instructions](../TESTING.md).
- **Submission copy:** truthful Kiro account (`docs/kiro-usage.md`, current through
  2026-11-11), ≤3-minute storyboard built only from recorded Kiro work
  (`docs/video-script.md`, rewritten 2026-11-09; the non-Kiro Headlamp clip is dropped)
  and a submission-ready Devpost draft with the public repository URL filled in and a
  `<DEMO_VIDEO_URL>` placeholder (`docs/devpost-draft.md`). Blog and social drafts match
  the same account. Rehearsal 2026-11-09: a fresh clone of public `main` `3c37ec3`
  passed `npm ci`, build and the judge route 12/12.
- **Release candidate:** rebuilt and sanitized. Packaging is deterministic and the
  procedure is in [release validation](release-validation.md);
  [release-identity.json](../release-identity.json) documents the per-build procedure
  and is excluded from the archive itself.
- **Submission assets:** captured official rules ([kiroween-rules.md](kiroween-rules.md)),
  truthful Kiro account ([kiro-usage.md](kiro-usage.md)), ≤3-minute video script
  ([video-script.md](video-script.md)), submission-ready Devpost copy
  ([devpost-draft.md](devpost-draft.md)), blog and social drafts
  ([blog-post.md](blog-post.md), [social-post.md](social-post.md)), static project page
  (`site/`) and a push-ready publishing checklist ([PUBLISHING.md](PUBLISHING.md)).
- **Public repository:** https://github.com/ifelse-codes/praman (public, MIT,
  squashed snapshot of three commits under the owner GitHub identity with a masked noreply email).
- **Project page:** https://ifelse-codes.github.io/praman/ (static, no hosted execution).
- Not submitted: no demo video, no Devpost submission, no independent-human validation.

## Removed in the 2026-11-05 cleanup

Under explicit owner authorization the repository was reduced to the product:
source, tests, product docs and the first-use example.

- Deleted: the legacy checkout demo pipeline (`verify`, `world`, `gateway`,
  `chaos`, `trace-demo`, `dashboard`), its unused dependencies, the
  target-specific Headlamp/Kan reference integrations and example directories,
  the 5.7 GB private evidence tree, and the process-log/handoff documentation.
- Preserved outside the repository: selected proof movies (Headlamp, Kan, Stern,
  jq), proof/receipt JSON, the 12-outcome first-use matrix, the release candidate
  receipts, the removed source and target examples, and the historical documents.
  Raw historical evidence contains private paths, sessions and credentials; it is
  deliberately not part of this repository or any release. See
  [the cleanup note](ARCHIVE.md).

The shipped/frozen/deferred view is in [ROADMAP.md](ROADMAP.md).

## Remaining before release / submission

1. **Build plan:** done. Steps 0 to 4 of the Hue-style environment plan in
   [ROADMAP.md](ROADMAP.md) are done (steps 0, 1, 2 on 2026-11-10; steps 3 and 4 on 2026-11-11).
2. **Video and submission (owner):** record the takes in `docs/video-script.md`, edit to
   under 3 minutes, upload publicly to YouTube; replace `<DEMO_VIDEO_URL>` in the Devpost
   draft and social post; save and submit. Target Nov 25–27, deadline Dec 4, 2026.
3. **Kiro:** done: specs `kiro-evidence-gate`, `power-path-resolution`,
   `verify-cancellation`, `agent-diagnostics`, `scenario-actions`, `named-steps`,
   `environment-recheck`, `worlds`, `network-faults`, `many-users` and `recorded-apis`.
   Spec `submission-story`: documents, Kiro write-up, storyboard and submission copy are
   done (tasks 1–3, 5.2 copy); recording, upload, submission and the final fresh-clone
   check are left (tasks 4, 5, 6).
4. **Independent-human validation:** a person other than the owner following the
   first-use guide (CI already covers two operating systems).
5. **Post-submission backlog:** npm publish pipeline, Windows support, deferred
   capabilities, archive retention decision.

## Boundaries

Do not host public PRAMAN execution (trusted commands, inherited environment, no
sandbox/auth). Do not publish raw evidence or the external archive. New features only
through the 2026-11-10 plan, each proven on real apps before it is claimed. Do not
commit, push or submit without authorization; the plan's rules state the push, PR and
fast-forward each plan session may do.

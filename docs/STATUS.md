# PRAMAN — current project status (2026-11-09, agent-facing fixes)

PRAMAN (प्रमाण, "evidence") is an evidence-driven verification toolkit for AI coding
agents. An agent supplies an authored browser scenario or command declaration through
the CLI or MCP; PRAMAN executes it against real software, checks the declared
requirements, and returns evidence-backed feedback. It is not a coding agent, not a
general simulator and not a sandbox.

## Current state

- **History:** the private working history ends at `cc83be3`; the **public repository**
  is a squashed public snapshot under the owner identity (see the repository history),
  with CI green and judge access enabled.
- **Checks:** `npm run build` and `npm run lint` pass; `npm run lint:tests` passes;
  the **full suite passes 265 tests / 34 files** on the recorded host (2026-11-09,
  `--maxWorkers=2`), including the 8 Kiro finish-gate tests, the 15 cancellation
  tests, the 21 diagnosis tests and the 22 browser-action tests. Parallel local runs
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
- **Docs clarification (2026-11-06):** added a one-page
  [browser scenario cheat sheet](schema-cheatsheet.md) plus explicit
  selector/zero-based/private-evidence guidance in the README and browser guide;
  product behavior and test counts are unchanged.
- **CI:** green on **Ubuntu and macOS** (Node 22) for public `main` `fa9e18e` — run
  https://github.com/ifelse-codes/praman/actions/runs/42566057306. Each runner reports
  226 passed / 16 skipped of 242 tests; the skips are the environment-guarded
  media/speech suites (no ffmpeg/ffprobe on the runners). The
  Ubuntu job also runs the judge route. `tests/networkPolicy.test.ts` failed once on
  macOS CI (PR #8) and passed on rerun; it has passed since, locally and in CI.
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
- **Submission copy:** truthful Kiro account (`docs/kiro-usage.md`), ≤3-minute video
  script (`docs/video-script.md`) and submission-ready Devpost draft with the public
  repository URL filled in and a `<DEMO_VIDEO_URL>` placeholder (`docs/devpost-draft.md`).
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

1. **Video and submission (owner):** record and upload the ≤3-minute video; replace
   the remaining `<DEMO_VIDEO_URL>` in the Devpost draft; save and submit. Target
   Nov 26–27, deadline Dec 4, 2026.
2. **Kiro:** spec `kiro-evidence-gate` is closed and merged to public `main` (PR #1).
   Done: the Power path bugfix and specs `verify-cancellation`, `agent-diagnostics` and
   `scenario-actions`. Next: spec `named-steps`,
   then `submission-story` (video from this work only; the non-Kiro Headlamp clip is dropped).
3. **Independent-human validation:** a person other than the owner following the
   first-use guide (CI already covers two operating systems).
4. **Post-submission backlog:** npm publish pipeline, Windows support, deferred
   capabilities, archive retention decision.

## Boundaries

Do not host public PRAMAN execution (trusted commands, inherited environment, no
sandbox/auth). Do not publish raw evidence or the external archive. Do not add
features before the submission. Do not commit, push or submit without authorization.

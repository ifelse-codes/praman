# PRAMAN — current roadmap (2026-11-10)

**Status: shipped and verified; the Hue-style environment plan below is in progress
(owner decision 2026-11-10; steps 0 to 4d done; step 5, the video and blog: script and dry run done 2026-11-13, recording is the owner's).** Public repository
https://github.com/ifelse-codes/praman (MIT), CI green on Ubuntu and macOS, judge
access via [TESTING.md](../TESTING.md) and Codespaces, project page
https://ifelse-codes.github.io/praman/. Not submitted: the demo video and the Devpost
form are the remaining release blockers. New on 2026-11-15: an OpenCode run showed
PRAMAN saying `passed` on a broken app; findings and the fix plan are in
["Found 2026-11-15"](#found-2026-11-15-praman-said-passed-on-a-broken-app-opencode-run).
Items 1 to 5 of that plan were done on 2026-11-16 (requirement coverage in the verdict,
check ids in reports, the repeat note, the app-under-test line and the skill rules);
items 6 and 7 are open.

## Shipped (verified)

- Authored browser and command verification with acceptance/repair/comparison modes and
  2–10 fresh repeats.
- Strict proof gates, evidence-backed feedback, reports and diagnostics; missing evidence
  never passes.
- CLI (16 commands) and stdio MCP (14 tools).
- Optional proof-gated narrated walkthroughs (browser and command); verification works
  independently of video.
- Managed kind/Docker lifecycle, declared HTTP service, workflow replay, coverage review
  and bounded count/duration/durable/agent campaigns.
- Public first-use runner (12/12 CLI and MCP outcomes) and the judge test-build route.
- Cleanup: 5.7 GB of private evidence archived outside the repository; legacy demo
  pipeline and target-specific integrations removed.
- Public MIT repository with .kiro tracked; CI (Ubuntu and macOS) runs the full suite and
  the documented first-use route on Linux; static project page deployed.
- Deterministic source packaging; per-build candidate identity recorded privately, not
  published.
- Kiro integration (2026-11-08): workspace MCP wiring, a verification agent, an opt-in
  finish gate that re-runs declared checks when an agent stops, and an installable Kiro
  Power. The finish-gate script itself is agent-neutral; only its hook file is
  Kiro-specific.
- MCP path fix (2026-11-08): a server started outside the caller's project
  (`PRAMAN_RELATIVE_PATHS=reject`) refuses relative paths instead of reading or writing
  in its own folder.
- Ctrl-C fix (2026-11-08, spec `verify-cancellation`, PR #4 and #5): Ctrl-C, SIGTERM or
  an MCP cancel stops every program PRAMAN started, starts no further runs, and records
  the run as not proven (CLI exit 130/143). PRAMAN checks this fix on itself in repair
  mode (`examples/self-check/cancellation/`).
- Failure diagnosis (2026-11-09, spec `agent-diagnostics`, PR #9): a failed browser step
  or check names its kind and safe counts (for example `locator_ambiguous (3 elements)`)
  with a matching next action; `REPORT.md` starts with a pass/fail table of all checks.
- Browser actions and waits (2026-11-09, spec `scenario-actions`): `dblclick`,
  `selectOption`, `type`, `scroll` and `drag` steps; `waitFor` with a `state` or an
  exact element `count`; a `count` check. Old declarations keep their meaning and hash.
- Step ids (2026-11-09, spec `named-steps`): checks and story beats can point at a step
  by `id`, so inserting a step no longer moves them; unknown ids are rejected before
  anything runs.
- Navigation guard (2026-11-12, spec `navigation-guard`, plan step 4c): apps with CSS
  page transitions (Miniflux v2.3.5) no longer get a false failure; every top-level
  navigation to another origin is stopped before it is sent and reported as
  `navigation_failed`.
- Honest coverage (2026-11-16, spec `honest-coverage`): optional `requirements` (a
  requirement with no check is not proven) and `target` (the app under test, read
  around every run) in command and browser declarations; a repeat note; check ids and a
  plain line per check in reports; skill rules against thin tests.

## Plan: Hue-style environments and stimulation (decided 2026-11-10)

**Why.** PRAMAN was inspired by Hue.run: give software a real place to run, with real
state, real dependencies and controlled failures, then judge the result on evidence.
Today PRAMAN can start Docker/kind environments, stop one dependency and replay a
declared HTTP state machine. It cannot fork a saved starting state per run, slow or
break live network traffic, run many users at once, or replay recorded outside APIs.
The owner lifted the feature freeze for this plan on 2026-11-10. The video and blog
need about one day, so building continues until Nov 24.

**What we reuse and what we do not.** We reuse small, proven tools behind PRAMAN's
existing proof and evidence rules: Docker volumes, Toxiproxy, parallel Playwright
contexts, Playwright HAR replay and Hoverfly or WireMock. We copy ideas from Hue, not
code (its backend is closed). Harbor stays paused: the 2026-11-02 Kan trial matched
PRAMAN's runner but removed no custom code. AgentEnv is not needed, because PRAMAN's
application integration module already has the same reset/observe shape. ZOO and
AppWorld are benchmark worlds, not homes for a user's app. Gym-Anything is only
relevant for desktop or Android testing, which stays deferred. Check each tool's
license at the start of its session; run AGPL tools only as separate programs.

**Real apps for proof.** A shared capability needs evidence from two different real
apps (see AGENTS.md). Both run from their own unmodified checkouts (Kan from a clean
`git archive` export of its checkout's HEAD, because that checkout holds unrelated
uncommitted work):

| App | Why it fits | Where |
| --- | --- | --- |
| Kan (kanban board) | Real Postgres and S3-style file storage; used before | `../kan` (existing checkout) |
| Shiori (bookmark manager) | Go, Postgres, MIT; it downloads the pages it saves, so it has a real outside dependency for network faults and recorded APIs. Replaced Miniflux on 2026-11-10 (owner decision): PRAMAN's request routing made Chromium abort Miniflux's page transitions, so no Miniflux scenario could pass (fixed in step 4c; Miniflux now passes) | Cloned at `v1.8.0` into `../shiori` in session 0 |

Integration modules, scenarios and evidence for these apps stay private under ignored
`.praman/real-apps/<app>/`. No app name, selector, route, credential or seed goes into
core, schemas, CLI or MCP dispatch.

### The steps: one per session

| Step | Session goal | Reuse | Done when | Target date |
| --- | --- | --- | --- | --- |
| 0 | **Done 2026-11-10.** **Environment re-check.** Unfreeze the Docker `environment` route (create, verify, reset, destroy) and run it end to end on Kan and Shiori. Fix only what broke since the 2026-11-05 cleanup, each with a regression test. kind stays frozen and is not claimed. | Existing code | Both apps: create, a passing scenario, reset to seed, destroy with no owned leftovers | Nov 11 |
| 1 | **Done 2026-11-10.** **Worlds.** Save a declared starting state (the data volumes of declared services) as a hashed snapshot; give every repeat or campaign run its own fresh copy. Two versions can start from the same world. Generic: core copies volumes and never knows the database type. | Docker volumes | Both apps: a change in copy A is absent in copy B; each run's starting hash matches the world; an altered snapshot gives `insufficient_evidence` | Nov 12–14 |
| 2 | **Done 2026-11-10.** **Real network faults.** Put a proxy between the app and a declared dependency and apply named faults: added delay, timeout, dropped connection, down. Like today's stop fault, the effect must be observed, or the run is `insufficient_evidence`. Faults can start and stop at step ids. | Toxiproxy | Both apps: each fault kind observed on live traffic; checks authored from the app's real behavior; fault removed and recovery observed | Nov 15–17 |
| 3 | **Done 2026-11-11.** **Many users and invariants.** Run one scenario as N users at once (fresh browser contexts, a per-user index for inputs) against one environment copy. After the run, check caller-declared invariants (rules that must always hold), for example "card count equals N" or "no duplicate entries". | Parallel Playwright contexts | Both apps: N users run at the same time (peak concurrency recorded); per-user verdicts; an invariant that is broken on purpose in a fixture gives `failed` | Nov 18–20 |
| 4 | **Done 2026-11-11.** **Recorded outside APIs.** Record an app's real outside HTTP calls once, then replay them in later runs. A call that is not in the recording fails closed (`insufficient_evidence`), so a test never reaches the real service by accident. The app is pointed at the replay through its own configuration. | Playwright HAR replay (browser side); Hoverfly or WireMock (server side) | Shiori replays a recorded real page download with no network; an unrecorded call is refused. A second real app is required for a cross-app claim; if none of Kan, Lattice or Luma makes outside calls, that limit is written down instead | Nov 21–24 |
| 4b | **Done 2026-11-12.** **HTML evidence report.** One offline `REPORT.html` next to `REPORT.md` for every browser scenario run: verdict, checks, per-run screenshots inline, expected and observed, diagnosis, steps, many users, issues and limits. No verdict, schema or exit-code change. Added 2026-11-12 after an outside review found no single review screen (spec `html-evidence-report`). | `saveFeedback` data; plain HTML and CSS | Kan and Shiori: passed, failed and `insufficient_evidence` runs each give a report whose verdict equals `proof.json`, opened from `file://` in Chromium with every image loaded and no network request | Nov 12–15 |
| 4c | **Done 2026-11-12.** **Navigation guard without false failures.** PRAMAN's same-origin navigation guard (Playwright request routing) makes Chromium abort CSS cross-document view transitions, and PRAMAN then reports the app's `InvalidStateError` as an app runtime error: a false `failed` it caused itself (found on Miniflux v2.3.5 in step 0). Find the exact trigger in a local fixture, then the smallest fix that keeps the guard: a main-frame navigation to another origin is stopped before the request leaves the browser and is reported as `navigation_failed`, for every user context. No page error is filtered. Added 2026-11-12 (owner decision, spec `navigation-guard`). | Playwright 1.64.1, Chromium | A view-transition fixture and Miniflux pass with `pageErrors: 0` observed; a cross-origin link is still stopped (the other server receives no request) and gives `navigation_failed`; a real page error still fails; Kan and Shiori keep the same verdicts and network counts | Nov 13–15 |
| 4d | **Done 2026-11-13.** **Freeze prep** (spec and branch `freeze-prep`, owner decision 2026-11-12). Three small jobs before the Nov 19 freeze, no new features: (1) returned output paths are no longer rewritten by secret redaction; (2) find and fix the cause of the flaky `tests/networkPolicy.test.ts` failure of 2026-11-12; (3) make the trust and privacy wording agree across the README, first-use guide, TESTING, Devpost draft, blog and social post. | Existing code | Shiori managed `verify` returns a `reportHtml` path that exists, also through headless Kiro, with no seeded password in the result; the flaky test's cause is found and recorded; the docs say the same true things | Nov 13–14 |
| 5 | **Agent part done 2026-11-13** (script updated, every take dry-run, submission copy updated); recording is the owner's. **Video and blog** (existing `submission-story` tasks 4–6). Update the storyboard for steps 0–4d, then record, edit to under 3 minutes and upload; add new footage only from recorded Kiro work in steps 0–4d. | — | Video URL in the Devpost draft; owner submits | Nov 25–27 |

**Step 0 result (2026-11-10, spec `environment-recheck`).** Fixed: managed `verify`
never ran the scenario (the manager filled the run folder before the proof engine,
which refuses a used folder); regression test added. On Kan and Shiori, through the CLI
and through `praman_environment` in headless Kiro: create, seed scenario `passed`, a
data-changing workload made it `failed`, reset, `passed` again, destroy with no
labelled container or owned process left. One Kan MCP run was `insufficient_evidence`
because Kan's sign-in rate limit answered HTTP 429; PRAMAN did not count it as a
failure. Found, not fixed then: on Miniflux, PRAMAN's request routing made Chromium abort
page transitions and PRAMAN blamed the app (fixed in step 4c); Miniflux was replaced
by Shiori.

If a step misses its date, it is cut, not claimed. Step 4 is cut first. Hard deadline:
Dec 4, 2026, 2:00 pm PT.

### Rules for every session in this plan

1. **Start clean.** Local `main` equals public `main`, the working tree is clean, and
   CI on `main` is green. If not, stop and tell the owner.
2. **One step per session.** Branch from `main`, named after the step's spec.
3. **Spec first.** Write `.kiro/specs/<name>/` (requirements, design, tasks) in Kiro.
4. **Show the gap before the fix.** Record a real failing or refused run before
   building, as earlier specs did.
5. **Tests.** Deterministic regression tests in `tests/` that need no live app,
   Docker daemon or private files (guard them like the media suites if a tool is
   required). Old declarations keep their meaning and hash.
6. **Real proof.** Prove the step on Kan and Shiori, and through MCP in a headless
   Kiro session where it applies. Evidence stays private under `.praman/`.
7. **Checks.** `npm run build`, `npm run lint`, `npm run lint:tests`, the full suite
   (`--maxWorkers=2`) and `node examples/first-use/run.mjs` (12/12) all pass.
8. **Docs.** Update this table, `docs/STATUS.md`, the README contract, `CHANGELOG.md`
   and the `docs/kiro-usage.md` usage log with what was observed and its limits.
9. **Clean up.** Destroy owned containers and networks, remove throwaway scripts, and
   return Colima to the state it was in at the start.
10. **Deliver.** Check the identity of every new commit
    (`Suman Patra <ifelse-codes@users.noreply.github.com>`) and the diff for private
    paths, push the branch, open a PR, wait until every CI job is green, then
    fast-forward public `main` (no GitHub-made commit) and local `main`. End with local
    `main` equal to public `main` and a clean tree. Owner decision 2026-11-10: sessions
    in this plan may do this push, PR and fast-forward without asking again. A
    force-push, a GitHub-made merge, or any push outside this flow still needs the
    owner's yes.

**Step 1 result (2026-11-10, spec `worlds`).** Gap shown first on both apps: a scenario
that changes data (Kan: create one board and expect two; Shiori: delete the seed bookmark
and expect none) passed repeat 1 and failed repeat 2 of one `environment verify`, because
the repeats shared one database. Built: `dataPath` on a Docker service, `environment
world-save`, `environment create --world`, reset to the world, and a restore before every
repeat of `verify` with the starting hashes recorded. Proven on Kan (Postgres + RustFS) and
Shiori (Postgres): a change in copy A was absent in copy B and in the source; `verify`
`passed` 2/2 with every repeat's hashes equal to the world; an appended byte in an archive
gave `insufficient_evidence` at `create`; the same flow ran through `praman_environment`
in headless Kiro (Shiori `sess_70a0f435…`, Kan `sess_51bf6aa8…`). Limits: Kan's address is
fixed at build time, so only one Kan application can run at a time (data copies are still
independent); `demonstrate` is refused for copies; baseline URLs are not isolated; no kind
worlds. A Kan integration problem found on the way (a second instance's health check
answered by the first instance's server) was fixed in the private integration.

**Step 2 result (2026-11-10, spec `network-faults`).** Gap shown first on both apps: a
declaration naming a slow database was rejected by the schema, and `environment fault
<id> db-slow` passed but ignored the name and stopped the whole database (Shiori's login
then failed in 1 ms; Kan's health showed `database: error`). Built: `proxy` on a Docker
service (an owned Toxiproxy container and network between the application and the
service), named `faults` (`delay`, `timeout`, `drop`, `down`) applied and removed with
`fault`/`recover`, and scenario fault windows at step ids applied by managed `verify` in
every run. Each effect and each recovery is observed through a probe over the proxy, or
the result is `insufficient_evidence`. Proven on Kan (Postgres, plus `delay` and `down` on
RustFS through the HTTP probe) and Shiori (Postgres): every kind observed, removal and
recovery observed, fault scenarios authored from the apps' real behavior `passed` 2/2;
through `praman_environment` in headless Kiro (Shiori `sess_8d627916…`, Kan
`sess_808c8533…`). Controls: a probe that bypassed the proxy gave `insufficient_evidence`;
a wrong expectation under `down` `failed`. Real behavior found: with its database down or
resetting, Shiori says "username or password do not match" at login and "Unknown error
occurred" with "No saved bookmarks yet" on the list; Kan shows no boards and offers
"Create workspace", and its health API answers HTTP 500 to a signed-in browser. Limits:
the probe measures the proxy path, not the application (Toxiproxy counts bytes only when
a connection closes, so per-window application traffic is not reported); one fault at a
time; no container-to-container or kind faults. MCP clients may cut long verify results,
so the result ends with a one-line `faultSummary`.

**Step 3 result (2026-11-11, spec `many-users`).** Gap shown first on both apps: a
declaration with `users` and invariants was rejected by the schema (`Unrecognized key:
"users"`); a scenario had one user per run and repeats ran one after another. Built:
`users` (2 to 10) in `acceptance` mode: one browser and context per user, `{user}` and
`{user1}` index tokens, `staggerMs`, a `syncAtStep` barrier, caller-declared `invariants`
(existing check kinds; `count` may use `equals: { perUser, plus }`) read once by the first
user's page after the others ended, per-user evidence under `after-<n>/user-<k>/`, the peak
concurrency measured from recorded times, and a gate that needs every user and invariant
to pass. Proven on Kan and Shiori (each from a saved world): three users at the same time,
peak 3, invariants `passed` 2/2; the same declaration with a wrong count `failed` with
every user `passed`; through `praman_environment` in headless Kiro (Shiori
`sess_f1e93068…`, Kan `sess_0eb1fbfb…`) both `passed`. A fixture with a deliberate lost
update gives `failed` in the deterministic tests. Limits: one machine, one environment
copy, shared credentials; the barrier aligns step starts, not server arrival; only `count`
scales; no faults, recording or baseline modes with users; neither real app showed a race.

**Step 4 result (2026-11-11, spec `recorded-apis`).** Gap shown first: with the old code,
Shiori's page download (`http://example.com/`) and Kan's server call to
`https://formbricks.com/api/oss-friends` reached the internet in every managed `verify`
(both `passed` 2/2, unseen by PRAMAN); with the app's outside network cut, the same
scenarios `failed` (Shiori kept the address as the title) or stopped (Kan's list never
appeared); `outsideCalls` was rejected by the schema. Built: `outsideCalls` on a Docker
declaration, an owned Hoverfly recorder (Apache-2.0, `spectolabs/hoverfly:v1.12.17`,
per-environment password and CA, ports on `127.0.0.1`), `environment recording-save`,
`create --recording` (re-hashed before any container starts; replay on a network with no
outbound route; an unrecorded call observed to be refused before the app starts), and a
gate in every `verify` run: a refused call, a failed recorded call, an HTTPS call whose TLS
the app rejected, or fewer served calls than `minPerRun` make the run
`insufficient_evidence`. The integration points the app at the recorder through the app's
own settings (Go `HTTP_PROXY`; Node `NODE_USE_ENV_PROXY`, `HTTPS_PROXY`,
`NODE_EXTRA_CA_CERTS`). Proven on Shiori (HTTP) and Kan (HTTPS): recorded once, replayed
`passed` 2/2; controls: a page not in the recording, an app not pointed at the replay
(every check passed, 0 served), an untrusted CA (1 TLS refused) were each
`insufficient_evidence`; an appended byte stopped `create`; a container on the replay
network could not reach `example.com` or `1.1.1.1`. Through `praman_environment` in
headless Kiro both replays `passed` (Shiori `sess_8a40cfeb…`, Kan `sess_a6b1afe5…`).
Limits: only calls through the app's proxy settings are seen (`minPerRun` catches a full
bypass, not a partial one); Go on macOS cannot trust an added CA, so Shiori was proven
over HTTP only; Hoverfly's default matching (no headers), no timing replay, no stateful
sequences; browser-side outside calls are not recorded (no real-app scenario had one, so
HAR replay was not built).

**Step 4b result (2026-11-12, spec `html-evidence-report`).** Gap shown first on Shiori:
to see one failing invariant (expected 7, observed 4) a person had to open 4 files
(`REPORT.md`, `proof.json` by pointer, `scenario.json` by pointer, a screenshot that
Markdown does not show). Owner decision: option B, a private local view. Built:
`REPORT.html` next to `REPORT.md` for every browser run (written inside `saveFeedback`,
mode 0600, offline, no script, a Content-Security-Policy that blocks every network source,
relative links, escaped values): verdict banner in text, "Look here first", run facts,
checks table, a card per check with inline screenshots, steps (a stopped run is marked),
many users and invariants, environment gates, issues, limits and evidence links. Fill
values, typed text and credential-like values stay redacted. Verdicts, `proof.json`,
`feedback.json`, exit codes and schemas are unchanged. Proven on Kan and Shiori through
managed `verify`: `passed`, `failed` and `insufficient_evidence` pages whose banner equals
`proof.json`, opened from `file://` in Chromium with every image loaded and no request other
than `file:`; the same failing run now needs 1 file. Through `praman_environment` in
headless Kiro the result carries the `reportHtml` path and no HTML (Shiori
`sess_154d90ca…`; a first run `sess_67513873…` showed MCP clients cut the middle of the
44 000-character result, so the path is now also a top-level field before the summaries).
Limits: command-run reports have no HTML page; the world snapshot hash is written after the
page, so the page shows source hashes only; an invariant is read after all users ended, so
no step is marked for it; the page is private (screenshots and text show application
content); one machine, Chromium only. Found in review: on Shiori the returned path shows
`[REDACTED]` for one folder, because the login user name `shiori` is a scenario `fill`
value (withheld) and output redaction also rewrote paths (fixed in step 4d).

**Step 4c result (2026-11-12, spec `navigation-guard`).** Trigger found first in a local
fixture and on Miniflux v2.3.5: any Playwright route (even one that matches nothing)
turns off Chromium's HTTP cache, and with the cache off Chromium aborts a CSS
cross-document view transition on a page that also loads an image, SVG sprite or module
script (5/5 runs with a route, 0/5 without; request interception with the cache on 0/5).
Gap on Miniflux with the old code: managed `verify` `failed`, `pageErrors` observed 2 in
both runs. Also found in the old guard: a same-origin URL that redirects to another
origin, and a link that opens a new tab, reached the other server; a stopped link ended
as `failed` or a locator timeout on Chromium's error page, not `navigation_failed`.
Owner decision: do the correct fix. Built: `src/eval/navigationGuard.ts`, a browser-level
Chromium Fetch guard for document requests only (cache left on), installed before any
page exists. Every top-level navigation to another origin (page, new tab, redirect hop,
form post, script, iframe navigating the top) is failed before its request is sent, and
the run ends `insufficient_evidence` with `navigation_failed`. No page error is filtered.
Proven: Miniflux `passed` 2/2 with `pageErrors: 0` observed; the control (the About page's
license link to another origin) was stopped (`net::ERR_FAILED`, no response) and gave
`navigation_failed` in both runs; `REPORT.html` showed `passed` with all 6 images loaded
from `file://`. Kan and Shiori, from saved worlds, kept `passed` 2/2 with the same checks
and observed values, and their network-check (faults) scenarios kept every verdict and
observed count (Kan 6, Shiori 5 network checks). Through `praman_environment` in headless
Kiro (`sess_f1f02f98…`) Miniflux `passed` with no seeded secret in any tool result.
Limits: with the cache on, the same file loaded twice in one run can be recorded as `304`
(Kan: 3 of 258 rows, `__ENV.js`), and the app's server sees fewer requests for cacheable
files; each run still starts a new browser. A start URL that redirects to another origin
is now stopped (Kan's `/` goes to `localhost`, so its private integration now starts at
`/login`). Chromium only.

**Step 4d result (2026-11-13, spec and branch `freeze-prep`).** (1) Report paths. Cause
checked first: on Shiori the redacted value `shiori` is the scenario's `fill` value for the
login user name (every fill value is withheld), not the database user and not an
integration `secrets()` value (those are the password and the HTTP secret key). Gap with
the old code: managed `verify` from world `27110d95efc6` returned a `reportHtml` with
`[REDACTED]` for the `shiori` folder, and the path did not exist. Fix: fields that hold a
file path PRAMAN made or was given as its output location (`report`, `reportHtml`,
`feedbackPath`, `proofPath`, `output`, `directory`, `declarationPath`, `operationLog`,
screenshots, videos, evidence `references[].path`) keep their value; every other string is
redacted as before; a result whose path contains a known private value gets one `pathNote`
without the value. Proof: the same verify `passed` with all 29 returned paths openable and
no seeded password, secret key or database password in the result; headless Kiro
`sess_64dfb259…` got an openable `reportHtml` with no seeded secret in any tool result, and
`sess_693aca20…` read the file. 5 new tests (3 fail on the old code). Limit: a path inside
prose (the reproduction text) is still redacted. (2) Flaky test: the CI log of run
43219321324 shows check 9 (`late-inside`) flipped: the page sends `/late` 300 ms after the
click and the window closed 600 ms after the click, so a request event that reached the
host more than 300 ms late fell outside it (reproduced by delaying `/late` past the window:
the same check fails with `observed 0`). Test-timing cause, not a product bug: the window
is now 2500 ms and the assertion prints the check index, its observed value and its window
rows. 10/10 under CPU load (10 CPUs saturated) and 10/10 while the full suite ran. (3) Trust
and privacy wording now agrees in the README, first-use guide, TESTING, Devpost draft and
blog (the social post makes no trust claim).

**Step 5 result, agent part (2026-11-13, spec and branch `submission-story`).** The
storyboard `docs/video-script.md` now covers steps 0 to 4d: a new one-page report scene
(`REPORT.html` of a failed three-user Shiori run from a saved world, the rule wrong on
purpose and labeled), the old code before the fix, and corrected take instructions.
Narration measured at 150 words per minute: 386 words, about 152 s, a cut of about 2:49.
Every take was dry-run and works as written (results table in the script; Kiro sessions
`sess_da6546e1…`, `sess_788cd3e1…`, `sess_2aa3f753…`), and a fresh clone of public `main`
`3c7a4e0` passed the judge route 12/12. The Devpost draft, blog, Kiro write-up and project
page now include steps 0 to 4d. Left for the owner: decide whether the `REPORT.html` frames
may be public, record, edit, upload, set `<DEMO_VIDEO_URL>`, submit, and repeat the
fresh-clone check on the day.

### Handoff for the next session (step 5, recording; rewritten 2026-11-13, after the agent part)

- **State:** steps 0 to 4d are merged, and the agent part of step 5 is merged with PR
  #33 (branch `submission-story`). PRAMAN's Colima profile `praman-headlamp` is stopped
  and the docker context is `default`. Colima `default` may be running for another project
  of the owner: do not stop it, and touch only PRAMAN-labelled containers. Feature freeze
  from Nov 19.
- **Done: `docs/video-script.md` updated and every take dry-run** (2026-11-13). Next is
  the owner's recording. First decide whether the `REPORT.html` frames may be public (the
  page marks itself private; the take holds only sample data).
- **Step 5 is the existing spec `submission-story`, tasks 4 to 6:** record the takes in
  `docs/video-script.md`, edit to under 3 minutes, upload publicly to YouTube, put the URL
  in `docs/devpost-draft.md` and `docs/social-post.md`, then the final fresh-clone check.
  Read `docs/video-guidelines.md` first. Recording and upload are the owner's; an agent
  may review the cut against the guidelines.
- **New footage** only from recorded Kiro work in steps 0 to 4d. The usage log in
  `docs/kiro-usage.md` lists each session id and what it showed. Private inputs for every
  step are under `.praman/real-apps/{kan,shiori}/` (see `HANDOFF.md` there).
- **Report screen:** planned as the scene at 1:56–2:17 of `docs/video-script.md` (take 7,
  dry-run 2026-11-13 on Shiori). It is private evidence: film only seeded demo data.
- **Possible new footage (step 4c):** the Miniflux gap and fix are recorded in the usage
  log (`sess_9b9feb5a…`, `sess_f1f02f98…`): the old run `failed` with 2 page errors PRAMAN
  caused, the new run `passed`. Private evidence: `.praman/real-apps/miniflux/navigation-guard/`.
  Miniflux has no saved world; re-running it needs a clone and binary again. Not in the
  current script.
- **Headless Kiro takes:** the workspace MCP server connects about 3 s after the first
  prompt, so a prompt that calls a PRAMAN tool at once sees no tool; ask for a short pause
  first (the `sleep` call itself is refused, but the server is connected by the next turn).
  On 2026-11-13 the `praman-explorer` agent's file reads were refused even with
  `--trust-tools=read`, so show files from a terminal. Do not pass `--require-mcp-startup`.
- **CI flake fixed (2026-11-14):** `tests/outsideCalls.test.ts` hit the 3 s limit with
  PRAMAN's own evidence screenshot on a loaded macOS runner; the screenshot now has a
  15 s limit. If a CI job still fails, read the log before re-running.
- **Do not** start infrastructure just to refresh historical state; no new features.

### Kick-off prompt for the next session

```
Continue PRAMAN. Read AGENTS.md, docs/STATUS.md and docs/ROADMAP.md
("Plan: Hue-style environments and stimulation", including "Handoff for the
next session"), then the private .praman/real-apps/HANDOFF.md. Step 5's agent
part is done (script updated, every take dry-run). Help the owner record:
re-run a take on request, review the cut against docs/video-guidelines.md,
set <DEMO_VIDEO_URL> once the owner gives the URL, and run the fresh-clone
judge check on the day of submission. Recording, upload and submission are
the owner's.
```

## Real-world use so far

PRAMAN has been used on real software by more than one agent: Headlamp (Kubernetes UI),
Kan (kanban app), Stern (Go CLI), jq (C CLI), Luma (todo app) and Lattice (a spreadsheet
built and verified by a different agent, opencode, using only the public docs). The
evidence is private and held outside this repository (see [ARCHIVE.md](ARCHIVE.md)).

## Found 2026-11-15: PRAMAN said "passed" on a broken app (OpenCode run)

**What happened.** The owner had OpenCode (free model `beam-free`) build an incident
war-room web app (a private project of the owner) over 13 numbered build sessions, from
2026-11-13 to 2026-11-15, using PRAMAN's agent skill and the CLI. PRAMAN said `passed`
34 times. The owner rated the result 1/10: broken, incomplete and half-done. An audit of
the OpenCode session and the project's private `.praman/` folder found:

| Finding | Evidence (private, in the target project and the OpenCode session) |
| --- | --- |
| One declaration, written once and never changed, was re-run as proof after every change | all 34 `declaration.json` files are byte-identical |
| The check could not fail on the work being done: a helper script counted items in three JSON replies over SSH (`chapters=7`, `specialists=5`, scorecard numeric fields ≥ 1) | identical `stdout.txt` in all 34 runs |
| It covered 2 of the project's 19 written requirements, each only partly. The project's 15 contract rules and its end-to-end gate had no check | the project's requirements and contract files |
| The changes were to a web page, but the browser route (`scenario-verify`) was never used | no scenario call in 1241 shell calls |
| The owner hit three page crashes, each after a `passed`: `TypeError` (pass 11-14 21:52, crash 21:54), `ReferenceError: Cannot access 'S' before initialization` (pass 11-14 22:55, reported the next morning) and `SyntaxError: Identifier 'msgs' has already been declared` (pass 11-15 10:23, crash 10:24). The last one stopped the whole page | run times and the owner's messages |
| To make incidents finish, the agent added an "auto-approver" that signs fixes with no human. This breaks the project's own rules ("the model cannot approve itself", "two people sign one decision"). PRAMAN stayed green, and the agent listed the auto-approver as a delivered feature | the agent's commits and final summary |
| The agent reported "PRAMAN ✅ Passed" and "fully complete". The skill says to report "Passed, for the declared checks only" | the agent's replies |

**Why: partly by design, partly gaps.**

- *By design:* PRAMAN checks only what the agent declares, and the agent writes the
  declaration. The agent that built the app also chose the test, and it chose one that
  could not fail.
- *Gap: the verdict.* A run that checks 2 of 19 requirements still prints a plain
  `Outcome: passed`. Missing coverage is not visible in the verdict, which goes against
  PRAMAN's rule "never turn missing evidence into a green tick".
- *Gap: the report.* `REPORT.md` shows checks as `0`–`3` and findings as "[Private
  declaration field]", so a person cannot see how thin the test is.
- *Gap: identity.* "Identity: stable" covered only the helper script, which never
  changed. The app under test changed every session. This limit is documented, but a
  person reads the line as "the thing I tested".
- *Gap: repeats.* PRAMAN does not notice that a run repeats the previous declaration
  exactly against the same declared inputs, so the run proves nothing new.
- *Gap: login.* The app sits behind HTTP Basic Auth. `scenario-verify` has no way to
  send HTTP credentials, so a browser check needed an SSH tunnel.
- *Already there, not used:* `scenario-verify` fails on any page runtime error that is
  not asserted. One step that only opens the page would have failed all three crashes.

**Plan: "honest coverage" (proposed 2026-11-15; items 1 to 5 done 2026-11-16 on the
owner's request, spec and branch `honest-coverage`; items 6 and 7 open).** Every item is
application-independent. Old declarations keep their meaning and hash unless an item says
otherwise.

| Order | Problem | Fix | Done when | Size |
| --- | --- | --- | --- | --- |
| 1 | **Done 2026-11-16.** The skill lets an agent pick a thin test and call the work done | Update `skills/praman/SKILL.md` and the Power's `praman-verify` skill: map every requirement to a check and name the unmapped ones; a web page change needs a `scenario-verify` that loads the page; each new change needs a check that exercises it; re-running an unchanged declaration is not proof of a new fix; report "passed N checks covering X of Y requirements" and never "complete"; never weaken a stated rule of the project to make a flow finish (stop and ask) | A headless agent run on a fixture app with a deliberately broken page and a thin declaration is refused or extended by the agent, not reported as done | S |
| 2 | **Done 2026-11-16.** `passed` says nothing about coverage | Optional requirement list in command and browser declarations (reuse the `coverage-review` mapping: requirement → check ids; an empty mapping is a visible untested requirement). The verdict and `REPORT.md` show "X of Y requirements checked". Any declared requirement with no check gives `insufficient_evidence`, not `passed` | Unit tests for full, partial and empty mapping; a declaration without the list behaves as today | M |
| 3 | **Done 2026-11-16.** The report hides what was checked | `REPORT.md`/`REPORT.html` show authored check ids and one plain line per check (kind, source, operator); expected values stay private | Report test shows ids; no value or secret appears | S |
| 4 | **Done 2026-11-16.** A repeat of the last run looks like new proof | When the declaration hash and every declared input hash match the previous run under the same `.praman/` parent, add a visible note "same declaration and inputs as `<run>`: this run proves nothing new" to the summary, report and MCP result (no verdict change) | Test with two identical runs and one changed run | S |
| 5 | **Done 2026-11-16.** Identity follows the helper, not the app | Optional declared target identity (for example a git commit or a build hash read by a declared command) is recorded per run and printed next to "Identity"; without it, the report says "app under test: not identified" | Test for both cases; wording reviewed against the README contract | M |
| 6 | Browser checks cannot pass HTTP Basic Auth | `httpCredentials` from named environment variables for scenario runs; never written to evidence | Fixture server behind Basic Auth passes; the secret is absent from every artifact | S–M |
| 7 | The finish gate is documented only for Kiro | Document wiring the agent-neutral `kiro-power/scripts/praman-gate.mjs` into OpenCode and Claude Code; checks are written or approved by the owner before the build and are locked (the builder may add checks, not edit them) | Docs plus one real OpenCode or Claude Code run where the gate blocks "done" | S |

Real proof for items 1, 2 and 6 needs two different real apps (AGENTS.md). The target
project's own defects (the page crashes and the auto-approver) are the owner's to fix in
that project, not in PRAMAN.

**Result of items 1 to 5 (2026-11-16, spec and branch `honest-coverage`).**

- *Item 1, the skill.* Gap run first, with the old skill, on a private `/tmp` fixture: an
  incident board whose page crashes on load (`Cannot access 'state' before
  initialization`), five written requirements and one thin earlier declaration that
  counts API items (that declaration still says `passed`). Claude Code (headless) and
  OpenCode with the free `beam-free` model (the model of the 2026-11-15 run) both wrote a
  browser scenario, got the page error and said "not complete": **the gap did not
  reproduce on this fixture**. With the new skill, OpenCode `beam-free` wrote a
  scenario with a `requirements` list, listed R5 (two-person sign-off) with no check,
  got `insufficient_evidence` with `Requirements: 4 of 5 have a check ... No check: R5.`
  and said the work was not complete. Limit: one fixture, one non-Kiro agent with the
  new skill; the long build-and-verify loop of 2026-11-15 was not re-run.
- *Items 2 to 5, on real apps* (Luma and Lattice, both served from their unmodified
  folders, browser route; jq 1.7.1, command route). Gap with the old code (`main`
  `b4dc644`): the thin declarations `passed` with no coverage line, check indexes only
  and "Identity: stable"; a declaration with `requirements` or `target` was rejected
  (`Unrecognized keys`, exit 2). New code: the same thin declarations `passed` with
  `Requirements: not declared.` and `App under test: not identified.`; with one requirement
  listed and no check, Luma `4 of 5 ... No check: persist`, Lattice `6 of 7 ... No check:
  undo`, jq `2 of 3 ... No check: empty`, each `insufficient_evidence` (exit 2) while
  every check passed; with that requirement left out, each `passed` with the app version
  (`bcb9be82e00c`, `3986df146a29`, `jq-1.7.1-apple`, read 3 times); the same declaration
  run again got the `Repeat:` line pointing at the first run. `REPORT.md` shows ids and
  "What it checks" (for example `| 0 | task-count | count | element count equals |`); no
  typed text, selector or expected value appeared in `REPORT.md` or `feedback.json`.
  Through MCP in headless Kiro (`sess_421cdf77…`): `praman_command_verify` on jq returned
  the requirement and app lines; two `praman_scenario_verify` calls on Luma both
  `passed` and the second result's last field `coverageSummary` carried the repeat note.
  A first attempt showed the summary fields were cut out of the middle of the 48 000
  character result, so every verify result now ends with `coverageSummary`.
- *Tests:* 21 new tests (`requirements`, `checkIds`, `repeatRuns`, `targetIdentity`); 19
  fail or cannot load on the old code. Updated on purpose: the pinned `feedback.json`
  and `REPORT.md` hashes, report-table assertions, and two tests that asserted check and
  invariant ids were hidden. Full suite 397 tests / 47 files; first-use 12/12.
- *Limits:* a requirement list is authored by the same agent, so it is only as honest as
  that agent (the skill and the visible "No check" line are the guard); a repeat is
  found only among sibling folders of the same parent; without `target` a changed app
  that PRAMAN cannot see still counts as a repeat; `target` reads the current version
  only; check ids are now shown, so an id must not hold a secret PRAMAN does not know.

## Done: fixes every agent hit (planned 2026-11-08, done 2026-11-09)

Found by the opencode/Lattice session and our own testing. Each fix is app-independent,
works the same for every agent and the CLI, and keeps existing declarations unchanged.

| Order | Problem today | Planned fix | Spec | Size |
| --- | --- | --- | --- | --- |
| 1 | ~~Ctrl-C stops PRAMAN but leaves the tested program running~~ **Done 2026-11-08** | Stop every owned process on Ctrl-C or MCP cancel; record the run as not proven | `verify-cancellation` | M |
| 2 | ~~When a step fails, the summary does not say why (for example a selector that matched 12 elements)~~ **Done 2026-11-09** | Name the failure kind and safe counts in the summary, report and MCP result; selectors and values stay private | `agent-diagnostics` | S |
| 2 | ~~The report has no overview of all checks~~ **Done 2026-11-09** | One pass/fail table at the top of `REPORT.md` | `agent-diagnostics` | S |
| 3 | ~~Only 8 browser actions; agents write side scripts for double-click, select, typing, scroll and drag~~ **Done 2026-11-09** | Add `dblclick`, `selectOption`, `type`, `scroll`, `drag` | `scenario-actions` | S–M |
| 3 | ~~`waitFor` only waits for "visible"; a half-rendered page can pass~~ **Done 2026-11-09** | `waitFor` state (`hidden`, `attached`, `detached`) or exact element count; a `count` check | `scenario-actions` | S |
| 4 | ~~Checks point at steps by number, so inserting a step shifts them~~ **Done 2026-11-09** | Optional step names that checks can reference | `named-steps` | M |
| 5 | No demo video yet (storyboard and submission copy done 2026-11-09, updated with a dry run of every take 2026-11-13; recording is the owner's) | A video of under 3 minutes made only from this Kiro work (the earlier non-Kiro Headlamp clip is dropped) | `submission-story` | M |

Order 5 moved to step 5 of the 2026-11-10 plan above. The owner records the takes in
`docs/video-script.md` (spec `submission-story` task 4); the agent can dry-run every take
first and review the cut against `docs/video-guidelines.md`.

### Carried over from the 2026-11-08 session (resolved 2026-11-09)

- Local `main` moved to public `main` with the owner's yes; the old private commit
  `b7f11d0` stays reachable from branch `kiro-evidence-gate`.
- `docs/kiro-usage.md` has the PR #8 row.
- `tests/networkPolicy.test.ts` has passed since (local full suite and PR #9 CI on
  Ubuntu and macOS). It failed once more on macOS CI on 2026-11-12; the cause (a 300 ms
  timing margin in the test's `late-inside` window) was found and fixed in step 4d.
- `tests/scenarioActions.test.ts` (all-actions test, macOS CI failure on 2026-11-09):
  CI on `main` `682f0ed` passed on Ubuntu and macOS (run 42664656908). Still watched; its
  assertion now prints the stopped step if it fails again.

## Frozen

- The feature freeze was lifted on 2026-11-10 for the plan above. The `environment`
  route (Docker provider) was re-checked and unfrozen by step 0 on 2026-11-10; each
  later step unfreezes only what it re-verifies.
- Still frozen (implemented and unit-tested, no new end-to-end claims): kind
  environments, preview, command preview, demonstrate/recording, workflow replay,
  coverage review and campaigns, unless a plan step re-verifies them.

## Deferred

- Stateful dependency simulation beyond the declared service and the recorded APIs of
  step 4; world restore beyond the declared service volumes of step 1.
- Recorded outside calls: browser-side recording (Playwright HAR), header matching,
  stateful sequences, timing replay, HTTPS for clients that cannot trust an added CA
  (Go on macOS), calls that bypass the application's proxy settings.
- Network faults: proof that the application's own traffic met a fault window (Toxiproxy
  counts bytes only when a connection closes); several faults at once; faults between
  containers or in kind.
- Autonomous discovery and semantic requirement review.
- Native desktop automation.
- Cross-host or distributed campaigns; machine-level Kubernetes campaigns.
- Cached-audio movie review; Harbor adoption (paused until hundreds of parallel or cloud
  runs are a real need).
- MCP project-folder discovery (`PRAMAN_WORKSPACE` or client roots); the speech-cache
  default stays relative.
- npm publishing, Windows support, and the final archive-retention decision.

## Next (owner)

1. Steps 0 to 4d of the plan: done (2026-11-10 to 2026-11-13). Step 5 script update and
   dry run: done (2026-11-13); decide whether the `REPORT.html` frames may be public.
2. Record and upload the <=3 minute demo video; set `<DEMO_VIDEO_URL>` in
   [the Devpost draft](devpost-draft.md) (Nov 25–26).
3. Paste the [TESTING.md](../TESTING.md) judge instructions, save and submit the Devpost
   form (target Nov 27; deadline Dec 4, 2026 2:00 pm PT).
4. Publish the blog/social bonus posts during the submission window; decide archive
   retention and npm publishing.

Optional: run independent-human validation.

### Still open, on purpose (2026-11-14 closeout)

Update 2026-11-15: the OpenCode run above found product gaps (the verdict, report,
identity and repeat gaps, and the skill wording). Update 2026-11-16: items 1 to 5 of the
"honest coverage" plan are done; items 6 and 7 remain. These remain by choice:

| Item | Why it is open |
| --- | --- |
| "Honest coverage" items 6 (Basic Auth for browser runs) and 7 (finish gate for other agents) | Not started; the owner decides when, given the Nov 19 freeze and the Dec 4 deadline. |
| Video, blog, submission | Owner's work. Deadline Dec 4, 2026, 2:00 pm PT. The video script predates the honest-coverage lines in the summary. |
| Agent skill on Codex, omp, pi | Codex and omp stopped on account or usage limits before the agent started; the `pi` command was not available on the host. Claude Code (2026-11-14 and 2026-11-16) and OpenCode `beam-free` (2026-11-16, one fixture) are tested (see [skills/README.md](../skills/README.md)). |
| Deferred items (section above) | Future features, not bugs: for example npm publishing, Windows support, autonomous discovery. |
| `REPORT.html` frames in the video | Owner decision: may frames of the private report page appear publicly? The take holds only sample data. |

## Guardrails

- No hosted public execution (trusted commands, inherited environment, no sandbox).
- Do not publish raw evidence or the private archive.
- No claims without observed evidence; limits are stated in
  [STATUS.md](STATUS.md) and [release-validation.md](release-validation.md).

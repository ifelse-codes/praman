# PRAMAN — current roadmap (2026-11-10)

**Status: shipped and verified; the Hue-style environment plan below is in progress
(owner decision 2026-11-10; steps 0 to 4 done, step 5 is the video and blog).** Public repository
https://github.com/ifelse-codes/praman (MIT), CI green on Ubuntu and macOS, judge
access via [TESTING.md](../TESTING.md) and Codespaces, project page
https://ifelse-codes.github.io/praman/. Not submitted: the demo video and the Devpost
form are the remaining release blockers.

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
| Shiori (bookmark manager) | Go, Postgres, MIT; it downloads the pages it saves, so it has a real outside dependency for network faults and recorded APIs. Replaced Miniflux on 2026-11-10 (owner decision): PRAMAN's request routing made Chromium abort Miniflux's page transitions, so no Miniflux scenario could pass (see README known limit) | Cloned at `v1.8.0` into `../shiori` in session 0 |

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
| 4b | **HTML evidence report.** One offline `REPORT.html` next to `REPORT.md` for every browser scenario run: verdict, checks, per-run screenshots inline, expected and observed, diagnosis, steps, many users, issues and limits. No verdict, schema or exit-code change. Added 2026-11-12 after an outside review found no single review screen (spec `html-evidence-report`). | `saveFeedback` data; plain HTML and CSS | Kan and Shiori: passed, failed and `insufficient_evidence` runs each give a report whose verdict equals `proof.json`, opened from `file://` in Chromium with every image loaded and no network request | Nov 12–15 |
| 5 | **Video and blog** (existing `submission-story` tasks 4–6). Record, edit to under 3 minutes and upload; add new footage only from recorded Kiro work in steps 0–4. | — | Video URL in the Devpost draft; owner submits | Nov 25–27 |

**Step 0 result (2026-11-10, spec `environment-recheck`).** Fixed: managed `verify`
never ran the scenario (the manager filled the run folder before the proof engine,
which refuses a used folder); regression test added. On Kan and Shiori, through the CLI
and through `praman_environment` in headless Kiro: create, seed scenario `passed`, a
data-changing workload made it `failed`, reset, `passed` again, destroy with no
labelled container or owned process left. One Kan MCP run was `insufficient_evidence`
because Kan's sign-in rate limit answered HTTP 429; PRAMAN did not count it as a
failure. Found, not fixed: on Miniflux, PRAMAN's request routing makes Chromium abort
page transitions and PRAMAN blames the app (README known limit); Miniflux was replaced
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

### Handoff for the next session (step 5, video and blog; written 2026-11-11)

- **State:** steps 0 to 4 are merged (see STATUS.md for the commit and CI run). Colima
  profiles are all stopped; docker context is `default`.
- **Step 5 is the existing spec `submission-story`, tasks 4 to 6:** record the takes in
  `docs/video-script.md`, edit to under 3 minutes, upload publicly to YouTube, put the URL
  in `docs/devpost-draft.md` and `docs/social-post.md`, then the final fresh-clone check.
  Read `docs/video-guidelines.md` first. Recording and upload are the owner's; an agent
  may dry-run every take and review the cut against the guidelines.
- **New footage** only from recorded Kiro work in steps 0 to 4. The usage log in
  `docs/kiro-usage.md` lists each session id and what it showed. Private inputs for every
  step are under `.praman/real-apps/{kan,shiori}/` (see `HANDOFF.md` there).
- **Do not** start infrastructure just to refresh historical state; no new features.

### Kick-off prompt for the next session

```
Continue PRAMAN. Read AGENTS.md, docs/STATUS.md and docs/ROADMAP.md
("Plan: Hue-style environments and stimulation", including "Handoff for the
next session"), then the private .praman/real-apps/HANDOFF.md. Do the next
step in the table that is not marked done (step 5, video and blog), and only that
step. Follow "Rules for every session in this plan" where they apply. Recording,
upload and submission are the owner's; prepare and check them.
```

## Real-world use so far

PRAMAN has been used on real software by more than one agent: Headlamp (Kubernetes UI),
Kan (kanban app), Stern (Go CLI), jq (C CLI), Luma (todo app) and Lattice (a spreadsheet
built and verified by a different agent, opencode, using only the public docs). The
evidence is private and held outside this repository (see [ARCHIVE.md](ARCHIVE.md)).

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
| 5 | No demo video yet (storyboard and submission copy done 2026-11-09; recording is the owner's) | A video of under 3 minutes made only from this Kiro work (the earlier non-Kiro Headlamp clip is dropped) | `submission-story` | M |

Order 5 moved to step 5 of the 2026-11-10 plan above. The owner records the takes in
`docs/video-script.md` (spec `submission-story` task 4); the agent can dry-run every take
first and review the cut against `docs/video-guidelines.md`.

### Carried over from the 2026-11-08 session (resolved 2026-11-09)

- Local `main` moved to public `main` with the owner's yes; the old private commit
  `b7f11d0` stays reachable from branch `kiro-evidence-gate`.
- `docs/kiro-usage.md` has the PR #8 row.
- `tests/networkPolicy.test.ts` has passed since (local full suite and PR #9 CI on
  Ubuntu and macOS). Still treated as flaky; if it fails again, investigate and fix it.
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

- Browser engine: a navigation guard that does not use Playwright request routing, so
  apps with CSS cross-document page transitions (Miniflux v2.3.5) can pass. Found in
  plan step 0; needs its own spec.

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

1. Step 4 of the plan: done 2026-11-11 (recorded outside APIs).
2. Record and upload the <=3 minute demo video; set `<DEMO_VIDEO_URL>` in
   [the Devpost draft](devpost-draft.md) (Nov 25–26).
3. Paste the [TESTING.md](../TESTING.md) judge instructions, save and submit the Devpost
   form (target Nov 27; deadline Dec 4, 2026 2:00 pm PT).
4. Publish the blog/social bonus posts during the submission window; decide archive
   retention and npm publishing.

Optional: run independent-human validation.

## Guardrails

- No hosted public execution (trusted commands, inherited environment, no sandbox).
- Do not publish raw evidence or the private archive.
- No claims without observed evidence; limits are stated in
  [STATUS.md](STATUS.md) and [release-validation.md](release-validation.md).

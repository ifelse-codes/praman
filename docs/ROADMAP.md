# PRAMAN — current roadmap (2026-11-09)

**Status: shipped and verified; next work is agent-facing fixes.** Public repository
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

## Real-world use so far

PRAMAN has been used on real software by more than one agent: Headlamp (Kubernetes UI),
Kan (kanban app), Stern (Go CLI), jq (C CLI), Luma (todo app) and Lattice (a spreadsheet
built and verified by a different agent, opencode, using only the public docs). The
evidence is private and held outside this repository (see [ARCHIVE.md](ARCHIVE.md)).

## Next: fix what every agent hits (planned 2026-11-08)

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

Next session starts with order 5: the owner records the takes listed in
`docs/video-script.md` (spec `submission-story` task 4); the agent can dry-run every take
first and review the cut against `docs/video-guidelines.md`.

### Carried over from the 2026-11-08 session (resolved 2026-11-09)

- Local `main` moved to public `main` with the owner's yes; the old private commit
  `b7f11d0` stays reachable from branch `kiro-evidence-gate`.
- `docs/kiro-usage.md` has the PR #8 row.
- `tests/networkPolicy.test.ts` has passed since (local full suite and PR #9 CI on
  Ubuntu and macOS). Still treated as flaky; if it fails again, investigate and fix it.

This replaces the earlier "no new features" freeze for these items only. Other optional
surfaces stay frozen.

## Frozen for this release window

- Optional surfaces (preview, campaigns, managed environments, recording) are
  implemented and unit-tested, but frozen: no expansion and no new end-to-end claims
  before submission.

## Deferred

- Stateful dependency simulation beyond the declared service; arbitrary world or
  database restore.
- Autonomous discovery and semantic requirement review.
- Native desktop automation.
- Cross-host or distributed campaigns; machine-level Kubernetes campaigns.
- Cached-audio movie review; Harbor adoption.
- MCP project-folder discovery (`PRAMAN_WORKSPACE` or client roots); the speech-cache
  default stays relative.
- npm publishing, Windows support, and the final archive-retention decision.

## Next (owner)

1. Record and upload the <=3 minute demo video; set `<DEMO_VIDEO_URL>` in
   [the Devpost draft](devpost-draft.md).
2. Paste the [TESTING.md](../TESTING.md) judge instructions, save and submit the Devpost
   form (target Nov 26–27; deadline Dec 4, 2026 2:00 pm PT).
3. Publish the blog/social bonus posts during the submission window; decide archive
   retention and npm publishing.

Optional: run independent-human validation.

## Guardrails

- No hosted public execution (trusted commands, inherited environment, no sandbox).
- Do not publish raw evidence or the private archive.
- No claims without observed evidence; limits are stated in
  [STATUS.md](STATUS.md) and [release-validation.md](release-validation.md).

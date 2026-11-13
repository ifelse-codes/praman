# Devpost submission — Praman

**Status:** final copy for the Kiroween submission. No Devpost submission has been
made; the assistant never operated the Devpost form, so verify the saved form state
before publishing. The repository URL is filled in. One placeholder remains:
`<DEMO_VIDEO_URL>`.

Repo references for maintainers: [Kiro usage write-up](kiro-usage.md),
[video storyboard](video-script.md), [project status](STATUS.md),
[archive note](ARCHIVE.md). Do not paste repo-relative links into Devpost; use the
public URL placeholder for anything readers must open.

## Submission fields

| Field | Value |
| --- | --- |
| Project name | Praman |
| Full product name | PRAMAN (प्रमाण) — "evidence" |
| Elevator pitch | AI writes the code. Praman checks that it actually works — testing it in realistic environments, finding what breaks, and showing you the evidence before you ship. |
| Category | **Frankenstein** — stitches browser automation, trusted command execution, authored HTTP/state checks, a stdio MCP server, a CLI, a static project page and an evidence report into one verification platform. |
| Built with | TypeScript, Node.js, Playwright, Zod, Model Context Protocol SDK, Commander, Sharp, node:sqlite, Chromium, FFmpeg, Docker, Toxiproxy, Hoverfly, Kiro |
| Public repository | https://github.com/ifelse-codes/praman (MIT license) |
| Judge access / testing | https://github.com/ifelse-codes/praman/blob/main/TESTING.md (test build, Codespaces, expected 12/12) |
| Project page | https://ifelse-codes.github.io/praman/ (static, no hosted execution) |
| Demo video (≤3:00, public) | <DEMO_VIDEO_URL> |
| Kiro usage write-up | `docs/kiro-usage.md` in the public repository |

## Official rules alignment (captured 2026-11-05)

Checked against the live Kiroween 2026 rules page; see
[the rules digest](kiroween-rules.md). Required: public GitHub repository with a
visible open-source license, `/.kiro` at the root and not ignored, this text
description, a demonstration video **under 3 minutes** uploaded publicly to YouTube,
and the Kiro usage write-up. **Judging access:** the public repository is the test
build; [TESTING.md](../TESTING.md) gives one-click Codespaces and local instructions with
the expected 12/12 outcomes. Paste the same instructions into the Devpost testing field.
Category: Frankenstein.
Judging is 20% each for Potential Impact, Technological Implementation (Kiro depth),
Design, Innovation/Idea and Presentation.

## Project story — paste-ready Markdown

### Inspiration

AI got good at writing code. I still had to figure out whether it worked.

I could ask an agent to build a feature, watch it finish, and get a confident explanation of why everything was correct. But a successful build and a few passing tests didn’t answer the question I actually cared about: **did it build what I asked for, and does that behavior hold up when the software is used?**

The faster we generate software, the bigger that gap becomes.

That’s why I started building Praman. The name means evidence. That’s also the idea behind the product: trust what the software does, not what the agent says it did.

### What Praman does

Praman gives existing coding agents a way to exercise the software they build, collect evidence, and use the results to improve it.

The coding agent still writes and fixes the code. Praman runs the verification and returns observations the agent can act on.

Its core verification routes are authored browser scenarios that drive a real headless Chromium, and authored command checks with explicit exit, stdout and artifact expectations. Each declaration runs in repeated fresh sessions and returns one of three honest verdicts — **passed, failed, or insufficient evidence**. Missing evidence never becomes a green check.

Once enough evidence shows a change works, Praman can generate an optional narrated walkthrough: previous behavior, the code change, and the working result. **The demo comes after verification. It is not a substitute for it, and it is not required to verify anything.**

### How I built it

I built the engine in TypeScript and Node.js, using Playwright to interact with real browser applications. A CLI and a stdio MCP server let coding agents invoke its capabilities. FFmpeg combines live recordings with narration, captions, highlights, and a Git-style view of the source changes.

Declarations describe the actions to perform and the results to expect. Depending on the declared mode, Praman executes only the current version, or a declared baseline plus the current version; for a repair it repeats verification in fresh browser contexts and checks the behavior again while recording.

To move beyond a toy example, I used Headlamp, an open-source Kubernetes dashboard. I ran its frontend and Go backend against an isolated Kubernetes cluster. A small reproduction plugin exercised Headlamp’s actual link component using a namespace fetched from the real cluster.

The submitted repository is the product, not that campaign. Target-specific integrations and raw dogfooding evidence were removed after the runs, under a rule that application-specific logic does not belong in Praman’s core; the proof trees and recordings are preserved in a separate private archive because they contain local paths and infrastructure data.

### How Kiro was used

Kiro did not build Praman's original engine. It built Praman's Kiro integration, and then it fixed and extended Praman itself, spec first, in recorded Kiro CLI sessions.

**The integration (spec `kiro-evidence-gate`).** A Kiro CLI agent wrote a custom agent, `praman-explorer`, that may call only Praman's tools. It also wrote a save hook, steering files and an installable Kiro Power that brings Praman's MCP server to any project. The most useful piece is an opt-in finish gate on Kiro's `Stop` hook. When the agent says it is done, the gate runs the declared checks again. If a check fails, the agent is sent back to work. In a recorded session the gate refused to let the agent stop on an off-by-one bug and released it only after the fix.

**Praman, improved with Praman.** Each later change started the same way: show the problem on a real run, write a Kiro spec, fix it, then prove the fix with Praman in a Kiro session (through its MCP tools, or through the finish gate).

- *Bugfix `verify-cancellation`:* pressing Ctrl-C during a check left the tested program running. The agent fixed it and Praman proved the fix in repair mode against the old build (`orphan: yes` before, `orphan: no` in 3 of 3 runs after).
- *Bugfix `power-path-resolution`:* the Power's server resolved relative paths in its own folder; it now refuses them.
- *Feature `agent-diagnostics`:* a failed step now says why, for example `locator_ambiguous (3 elements)`, without leaking selectors or values. Reports start with a pass/fail table.
- *Feature `scenario-actions`:* double-click, select, typing, scrolling, dragging, and waits for an exact element count, so a half-rendered chart can no longer pass.
- *Feature `named-steps`:* checks can point at a step by name, so inserting a step no longer moves them.

Then a second round, from 10 to 13 November, gave apps a realistic place to run, one step per Kiro session. Each step was shown first on a real failing or refused run, then built and proven on two real open-source apps (Kan, a kanban board, and Shiori, a bookmark manager) and through Praman's MCP tools in a headless Kiro session:

- *Worlds:* save an app's starting data once as a hashed copy; every repeat starts from a fresh copy, so one run's changes cannot leak into the next.
- *Network faults:* slow, hang, drop or stop a real dependency, such as the database, through a proxy; the fault only counts if its effect is observed.
- *Many users:* run one scenario as 2 to 10 users at the same time, then check rules that must hold for all of them, such as "the list holds the seed plus one per user".
- *Recorded outside calls:* record an app's real outside HTTP calls once and replay them with no internet; a call that is not in the recording makes the run not proven.
- *One-page report:* every browser run writes an offline `REPORT.html` with the verdict, each check's expected and observed values and the screenshots.
- *Two fixes found on the way:* the managed Docker route never ran the scenario (Praman filled the run folder before its own proof engine, which refuses a used folder), and Praman's own navigation guard caused a false failure on a third app (Miniflux).

Work that was conversation rather than spec (onboarding, CI fixes, delivery) is marked as such in the write-up. The Kiro IDE was used only for checks, and property-based testing was not used (owner decision). The owner created Kiro's MCP configuration by hand, chose every scope and approved every push.

Kiro's earlier history with this project is also disclosed: one 86-minute IDE session on 1 November 2026 on a Headlamp feature, which ended at the monthly usage limit.

The full account, with a session ID for every claim, is in `docs/kiro-usage.md` in the repository.

### Challenges I ran into

The first fix stopped a crash. It did not make the feature work.

Headlamp was calling `getName()` on the wrong object. Correcting that removed the exception, but verification still showed no tooltip. The link wrappers also needed to forward the DOM reference that the tooltip depended on.

That was exactly the kind of incomplete fix I wanted Praman to expose.

Recording brought another challenge: making the walkthrough reflect verified behavior rather than just look convincing. I added replay checks and corrected narration timing when browser recording padding caused the audio to drift.

### What I learned

“No error” and “works correctly” are different outcomes.

So are “the page loaded,” “the test passed,” and “we have enough evidence to accept this change.”

Praman needs to preserve those distinctions. Missing evidence should never become a green checkmark.

The Headlamp run now passes five acceptance checks across three fresh sessions, plus the recording replay. It also verifies that the corrected link still opens the real namespace details.

### What was verified — and what wasn’t

Verified on the recorded host and in Ubuntu/macOS CI:

- Authored browser verification with real headless Chromium, repeated fresh sessions, screenshots, network and page-error observations.
- Authored command verification with trusted executables, explicit exit/stdout/artifact expectations, bounded repeats and resolved executable/input identities.
- Three declared modes: `acceptance` (current only), `repair` (declared historical baseline with a named regression) and `comparison` (explicit baseline attribution).
- Honest verdicts and exits: `passed` / `failed` / `insufficient_evidence`; CLI exits 0/1/2; MCP sets `isError` on non-pass.
- A public first-use runner that exercises **12 expected CLI and MCP outcomes** — pass, intentional mismatch and unavailable execution for both the browser and command routes — with matching proof verdicts. All twelve behaved as documented; the deliberate negative controls stayed red.
- The Kiro integration, also usable by any MCP client: a custom agent, an installable Kiro Power and an opt-in `Stop`-hook finish gate that re-runs declared checks when the agent says it is done.
- Failure diagnosis that names what went wrong (for example `locator_ambiguous (3 elements)`) with a next action, while keeping selectors and values private; a pass/fail table at the top of every report.
- Thirteen browser actions (including double-click, select, typing, scroll and drag), waits for a state or an exact element count, a `count` check, and step ids that checks can reference.
- A 14-tool stdio MCP server; a CLI; optional proof-gated narrated walkthroughs that require live replays to match the stored proof.
- Managed Docker environments, proven on Kan and Shiori on the recorded host (each also through MCP in a headless Kiro session): hashed starting worlds with a fresh copy per repeat, named network faults through Toxiproxy whose effect is observed, 2 to 10 concurrent users with declared invariants, and recorded outside HTTP calls replayed with no outbound network (Hoverfly). The app integrations for those runs are private, so this route is not part of the public first-use route.
- An offline `REPORT.html` for every browser run, checked on Kan and Shiori for passed, failed and not-proven runs.
- Kind environments, the declared HTTP service, workflow replay, coverage review and campaign tooling are implemented, documented and unit-tested, but have no new end-to-end claim.

Explicit limits:

- **Not a sandbox.** Commands and browser actions run with your user’s authority, child processes inherit your environment, and both can mutate external systems.
- **Authored checks, not autonomous testing.** Praman verifies declared requirements; it does not discover requirements, prove whole-application correctness or guarantee security.
- **Same-host validation plus CI.** The evidenced environment is macOS arm64 with Node 26, and CI runs the full suite on Ubuntu and macOS. An independent person has not yet run the guide.
- **No published package.** The source is at https://github.com/ifelse-codes/praman; no npm install route is claimed.
- **Raw evidence is private.** Screenshots, `result.json`, `network.json`, `proof.json`, stdout and reports stay under the output folder and may contain application data, secrets or local paths; they are for local review, not a sanitized public export.
- **`REPORT.html` is a private local view** (mode 0600). It shows application text and expected and observed values, so do not share it; fill values, typed text and credential fields are redacted. CLI and MCP output redact known secrets and private declaration text but are not a sanitized export, and returned file paths are not redacted.
- **No hosted execution.** The project page is static; everything runs on your machine from source.
- **Same-origin browser runs.** A navigation to another origin, including a start URL that redirects to a single sign-on page, is stopped and reported as `navigation_failed`.
- **The caller owns state.** Fresh browser contexts do not reset backend data or side effects; seeding, reset and teardown are the caller’s job.
- **Local hashes are not provenance.** Recorded identities are sampled local hashes, not signed build/deployment attestation.
- Optional narration needs host media tools and fresh matching proof; the video is never verification.
- Historical dogfooding evidence is preserved in an external archive, not in the repository.

### What’s next

The environment layer is now part of the product and proven on two real apps: saved starting worlds, network faults, many users at once and recorded outside calls, each with its observed limits written down (for example, one machine and one environment copy for many users, and only calls that use the app's proxy settings are recorded). It is not part of the public first-use route, and independent-human validation is still pending.

The next steps are hardening and independent validation: have someone who did not build it follow the first-use guide, publish a package, and keep widening real-target evidence without letting a demo dictate the product’s architecture.

The goal is simple: **give coding agents somewhere to test their work — and evidence strong enough to know what to fix next.**

## Maintainer checklist (do not paste into Devpost)

- [x] Repository URL is the real public repository (`https://github.com/ifelse-codes/praman`); confirm it still opens without authentication.
- [ ] Replace `<DEMO_VIDEO_URL>` with the public YouTube URL; confirm the video is ≤3:00 and public.
- [ ] Confirm `docs/kiro-usage.md` and `docs/video-script.md` are committed in the public repository and their internal links resolve.
- [ ] Re-check this copy against [STATUS.md](STATUS.md): verified capabilities, limits and “no submission made” status.
- [ ] Confirm no personal email, home path, session ID, credential or private infrastructure detail is visible in the repository, video or screenshots.
- [ ] Confirm the Devpost form fields match the table above (name, category, built with, links) and that no placeholder text is submitted.
- [ ] When pasting the story, convert its `###` section headings to `##` for the Devpost About field.

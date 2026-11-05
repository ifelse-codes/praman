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
| Built with | TypeScript, Node.js, Playwright, Zod, Model Context Protocol SDK, Commander, Sharp, node:sqlite, Chromium, FFmpeg, Kiro |
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

Kiro was used for one bounded, real engineering session — not as the builder of Praman itself.

On 1 November 2026 I gave Kiro one task: implement a single useful, bounded Headlamp improvement, then prove it with Praman against a real Kubernetes environment. Kiro worked in its IDE; a recorded Kiro spec session named “editor-dryrun-preview” maps to that session, with requirements, design and task notes for the feature. The session ran for 86 minutes (16:07–17:33 UTC) and made 189 recorded tool calls — file reads, searches, shell commands and edits — plus 34 workspace snapshots, touching Headlamp’s editor dialog and test and the Praman example and environment wiring that connected the feature to the Kubernetes-backed check.

The session ended when Kiro hit its monthly usage limit (session status: failed, quota exhausted). I completed the remaining work with an AI coding assistant, so authorship of that feature is mixed and is disclosed here. Praman’s core engine, CLI, MCP server, reports and verification logic were not written by Kiro. Praman’s own `.kiro` specs, steering, save hook and custom agent were created by the assistant on 31 October 2026 and refreshed on 5 November 2026 to match the delivered product; they are configuration, not evidence of Kiro development.

The full observed-evidence account — session facts, tool-call counts, changed paths, attribution and limits — is in `docs/kiro-usage.md` in the repository.

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
- A 14-tool stdio MCP server; a CLI; optional proof-gated narrated walkthroughs that require live replays to match the stored proof.
- Managed kind/Docker environment lifecycle plus declared HTTP service, workflow, coverage and campaign tooling, implemented and documented. These paths are not part of the validated public first-use route in this submission.

Explicit limits:

- **Not a sandbox.** Commands and browser actions run with your user’s authority and can mutate external systems.
- **Authored checks, not autonomous testing.** Praman verifies declared requirements; it does not discover requirements, prove whole-application correctness or guarantee security.
- **Same-host validation only.** The evidenced environment is macOS arm64 with Node 26. Another machine, OS, browser matrix or independent user has not been validated.
- **No published package.** The source is at https://github.com/ifelse-codes/praman; no npm install route is claimed.
- **Raw evidence is private.** Reports, screenshots, stdout and network observations can contain local paths; they are for local review, not a sanitized public export.
- **The caller owns state.** Fresh browser contexts do not reset backend data or side effects; seeding, reset and teardown are the caller’s job.
- **Local hashes are not provenance.** Recorded identities are sampled local hashes, not signed build/deployment attestation.
- Optional narration needs host media tools and fresh matching proof; the video is never verification.
- Historical dogfooding evidence is preserved in an external archive, not in the repository.

### What’s next

The environment layer is now part of the product: declaration-selected Docker/kind lifecycles can provision real dependencies, exercise workloads, inject controlled failures, reset and tear down owned resources. That is the direction I described, and it is documented, and it is not part of the verified public first-use route; independent-human validation is still pending.

The next steps are hardening and independent validation: repeat the verified flow on another machine and OS with someone who did not build it, publish a clean source candidate, and keep widening real-target evidence without letting a demo dictate the product’s architecture.

The goal is simple: **give coding agents somewhere to test their work — and evidence strong enough to know what to fix next.**

## Maintainer checklist (do not paste into Devpost)

- [ ] Replace `https://github.com/ifelse-codes/praman` everywhere with the real public repository URL; confirm it is public, MIT-licensed and opens without authentication.
- [ ] Replace `<DEMO_VIDEO_URL>` with the public YouTube URL; confirm the video is ≤3:00 and public.
- [ ] Confirm `docs/kiro-usage.md` and `docs/video-script.md` are committed in the public repository and their internal links resolve.
- [ ] Re-check this copy against [STATUS.md](STATUS.md): verified capabilities, limits and “no submission made” status.
- [ ] Confirm no personal email, home path, session ID, credential or private infrastructure detail is visible in the repository, video or screenshots.
- [ ] Confirm the Devpost form fields match the table above (name, category, built with, links) and that no placeholder text is submitted.
- [ ] When pasting the story, convert its `###` section headings to `##` for the Devpost About field.

# How Kiro was used — PRAMAN / Kiroween 2026

This is the truthful usage account for the Kiroween submission. It separates what
Kiro actually did from what an AI coding assistant and the submitter did.

**Short version: Kiro was genuinely used, but narrowly — one substantive IDE session
on one bounded Headlamp feature. Kiro did not build PRAMAN's core.**

## Short version

- **Installed:** the Kiro IDE app (1.4.62) and `kiro-cli` 2.37.1 are installed on the
  recording machine (observed 2026-11-05). Installation is not usage.
- **Used:** one substantive Kiro IDE session, 2026-11-01 16:07:29Z to 17:33:29Z
  (86 minutes), title *PRAMAN + Headlamp improvement cycle*, agent mode `vibe`,
  autopilot enabled, model Auto, with a recorded Kiro spec session for the feature.
- **Ended by quota:** the session status is `failed`; Kiro reported that the monthly
  usage limit was reached at 17:33:29Z. The AI coding assistant completed the
  remaining work afterwards. **Attribution is mixed and disclosed below.**
- **Not Kiro:** PRAMAN's core engine, CLI, MCP server, report/verification modules,
  tests and product documentation were not built in the Kiro session.

## What the session was asked to do

The submitter asked Kiro to continue PRAMAN with Headlamp as the next
development-and-verification cycle: **implement one useful, bounded Headlamp
improvement, then use PRAMAN to prove it against a real Kubernetes environment.**
The instructions required repository evidence for the chosen feature, verification
before demonstration, and the rule that missing or unavailable evidence must never
become a passing result. The recorded work centered on an editor dry-run preview
feature for Headlamp, recorded under the Kiro spec name `editor-dryrun-preview`.

## Additional CLI attempt (2026-11-05)

One more logged Kiro session was attempted on 2026-11-05 to strengthen this account.
`kiro-cli` 2.37.1 was installed and authenticated on the same machine (Google sign-in).
A non-interactive session (`kiro-cli chat --no-interactive --trust-all-tools
--trust-workspace`) was started in the PRAMAN repository with a bounded request to run
the public first-use verification. It exited with code 1 **before any tool call** with
`UsageLimitReachedError` ("You've reached your monthly usage limit"). No additional
usage was produced: the monthly limit that ended the 2026-11-01 session still applied
on 2026-11-05. The attempt is recorded so the submission does not imply more Kiro
usage than actually occurred.

## Observed evidence

Values below were read directly from Kiro's local session store for the
`kiroween` workspace on 2026-11-05. The raw session data is private (local paths,
session state and transcript) and is not part of this repository.

| Observation | Recorded value | Basis |
| --- | --- | --- |
| Substantive work sessions in this workspace | 1 | Kiro session index for the workspace; a second record titled *New Session* was created and closed empty 60 ms later, with no transcript, and is not counted |
| Session title / mode | *PRAMAN + Headlamp improvement cycle*; `agentMode: vibe`; autopilot; model Auto | Session record |
| Session window | 2026-11-01 16:07:29Z – 17:33:29Z (86 minutes) | Session record |
| Session outcome | Status `failed`; monthly usage limit reached at 17:33:29Z (`UsageLimitReachedError`) | Session record; displayed-error metadata |
| Transcript size | 852 recorded entries | Session transcript |
| Tool activity | 189 tool calls in total: 80 `execute_bash`, 51 `read_file`, 19 `str_replace`, 11 `fs_write`, 15 `list_directory`, 9 `grep_search`, plus 4 session-metadata updates (the six action types total 185) | Session transcript |
| Workspace snapshots | 34 snapshots; 12 unique file paths across the Headlamp and PRAMAN checkouts | Kiro snapshot store |
| Kiro spec session | Spec session `editor-dryrun-preview` maps to this session; requirements, design and tasks files exist for that spec | Kiro spec-session mapping; snapshots |
| Headlamp files in Kiro's snapshots (in that checkout) | `frontend/src/components/common/Resource/EditorDialog.tsx`, `EditorDialog.test.tsx`, and `.kiro/specs/editor-dryrun-preview/{requirements,design,tasks}.md` | Kiro snapshots |
| PRAMAN files in Kiro's snapshots (in this repository, before the cleanup) | `src/environments/{schema,types,headlamp}.ts` (the then-existing target adapter) and `examples/headlamp-dryrun-preview/` (`environment.json`, `scenario.json`, plugin files) | Kiro snapshots |
| Continuation after quota | The assistant completed the remaining work; the feature's later proof and a 1:30 walkthrough were preserved in the external archive described in [ARCHIVE.md](ARCHIVE.md), not in this repository | Task record; archive note |

Snapshot counts show which files Kiro touched; they do not by themselves prove
authorship of every line, correctness, or acceptance.

## What Kiro did and did not do

**Kiro's recorded work** was the bounded Headlamp editor dry-run preview feature:
its spec notes, edits to the Headlamp editor dialog and its test, and the PRAMAN
example/environment wiring used to reach that feature from PRAMAN's Kubernetes-backed
check. The `src/environments/headlamp.ts` adapter and the
`examples/headlamp-dryrun-preview/` assets visible in Kiro's snapshots were removed
from the product in the 2026-11-05 cleanup, under the repository rule that
target-specific integrations do not live in PRAMAN core.

**Kiro did not build PRAMAN.** Its changed-path set contains no PRAMAN core modules:
not the verification engines, CLI, MCP server, report generation, evidence model,
tests or documentation. Those were produced by an AI coding assistant under the
submitter's direction; the repository history and later cleanup commits show that
work.

**PRAMAN's own `/.kiro` assets are not Kiro output.** The specs, steering, save hook
and custom agent were created by the assistant on 2026-10-31 (initial commit) and
the specs, steering and agent were refreshed on 2026-11-05 to match the delivered
product; the hook file is unchanged since creation. They are configuration and
guidance for whichever agent runs in this workspace, not evidence of Kiro
development. See [the specs](../.kiro/specs/praman-core/requirements.md),
[steering](../.kiro/steering/product.md) and [agent](../.kiro/agents/praman-explorer.md).

## Attribution summary

| Area | Author of record | Basis |
| --- | --- | --- |
| PRAMAN product core (verification engines, CLI, MCP, reports, evidence model, tests, docs) | AI coding assistant, directed by the submitter | Not in Kiro's changed-path set; continued after the Kiro session ended |
| PRAMAN `/.kiro` specs, steering, hook, agent | Assistant (created 2026-10-31; refreshed 2026-11-05) | Git history |
| Headlamp editor dry-run preview (the Kiro session's task) | Mixed: Kiro started the spec and the edits shown in its snapshots; the assistant completed the remaining work after quota | Kiro snapshots and session end; continuation evidence in the external archive |
| Headlamp tooltip repair shown in the 2:49 walkthrough | Earlier PRAMAN Headlamp cycle; **not** part of Kiro's recorded session | Kiro's snapshots do not touch Headlamp's `frontend/src/components/common/Link.tsx`; the clip predates this session |
| `kiro-crew/` stub | Assistant scaffold; not a working Kiro Crew app and not used for the submission | Two files in the repository; no run evidence |

## Limits and non-claims

- This is **not** substantial Kiro-authored development. One 86-minute session
  started one bounded feature; it did not complete a Kiro-driven build cycle.
- The session failed on the provider's monthly usage limit. Kiro did not finish its
  assigned task; the completion is mixed authorship.
- Exact per-line attribution between Kiro and the assistant is not established. The
  recorded boundary (session window, changed paths, quota end) is what we can show.
- Tool-call and snapshot counts describe the local session record. They prove
  activity, not correctness, acceptance or good design.
- The work session is an IDE session. No `kiro-cli` session was recorded for this
  work; the installed CLI was not part of it.
- The Kiro app and CLI versions above were observed on 2026-11-05, after the session.
  The exact builds in use during the session were not recorded.
- The 2:49 Headlamp walkthrough used in the submission video is from an earlier
  PRAMAN cycle, not from Kiro's session. See [the video storyboard](video-script.md).
- Raw Kiro session data is private and deliberately not published; this write-up is
  the reviewed summary.

## Where to look

- [ARCHIVE.md](ARCHIVE.md) — external archive holding the continuation's proof and
  walkthrough recordings.
- [video-script.md](video-script.md) — submission video storyboard and the clip
  attribution notes.
- [devpost-draft.md](devpost-draft.md) — submission copy, including the short Kiro
  section.
- [STATUS.md](STATUS.md) — current product status and remaining submission work.

# How Kiro was used — PRAMAN / Kiroween 2026

This is the truthful usage account for the Kiroween submission. It separates what
Kiro actually did from what an AI coding assistant and the submitter did.

## Current state (2026-11-07 onward)

**Short version: from 2026-11-07, Kiro built and proved PRAMAN's Kiro integration in
recorded Kiro CLI sessions, with the owner running the interactive CLI and IDE checks.
Kiro did not build PRAMAN's original verification core.**

- **Where:** Kiro CLI 2.37.1 with the V3 agent, in this repository. The main working
  session is `sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60`; headless proof runs and
  owner-run interactive CLI and IDE sessions are listed in the
  [usage log](#usage-log-2026-11-07-onward), each with what it showed.
- **What Kiro built (spec `kiro-evidence-gate`, closed 2026-11-08):**
  - the `praman-explorer` custom agent with a permission rule allowing only `praman/*`;
  - a v1 `PostFileSave` lint hook, replacing an invalid hook file;
  - the opt-in `Stop`-hook finish gate (`kiro-power/scripts/praman-gate.mjs`) and its
    8 tests;
  - two steering files (`fileMatch` and `auto`);
  - the installable Kiro Power in `kiro-power/` (manifest, MCP config, skill, README);
  - the three specs `kiro-evidence-gate`, `verify-cancellation` (bugfix) and
    `submission-story`, plus the documentation updates.
- **What the owner did:** created `.kiro/settings/mcp.json` by hand (Kiro does not let
  the agent change its own MCP configuration), ran the interactive CLI and IDE
  sessions, approved each edit in the recorded gate demo, and made every scope
  decision.
- **Observed in Kiro:** MCP calls returned `passed` and `failed` verdicts in the CLI
  (interactive and headless); the IDE listed all 14 `praman_*` tools; the finish gate
  rejected a stop on a failing check and released it after the agent's fix
  (interactive CLI, owner-approved edits); the Power ran a `passed` check from a
  separate project.

| Kiro feature | Status | Evidence |
| --- | --- | --- |
| Kiro CLI (V3, interactive and headless) | Used | Usage log, every row |
| Kiro IDE | Used for checks only (MCP tool listing, lint hook). Not a target: PRAMAN is built for agents through the CLI and MCP (owner decision 2026-11-08) | `sess_7732334c…`; one earlier run invalid (Restricted Mode) |
| Specs | Used: 2 feature specs, 1 bugfix spec. Written as files by the agent, not through `/spec new` | `.kiro/specs/` |
| Steering | Used: always-on files, plus new `fileMatch` and `auto` files | `sess_1266542d…` |
| Agent hooks | Used: `PostFileSave` (fires, result not shown to the agent) and `Stop` (finish gate) | `sess_2bee93f1…`, `sess_d3717c15…` |
| Custom agents | Used: `praman-explorer` with capability permissions | `sess_cf1d826d…` |
| MCP | Used: workspace server, 14 tools | `sess_289994fb…`, `sess_cf1d826d…` |
| Kiro Powers | Used: authored, installed, exercised from another project | `sess_ccfd7c6f…` |
| Built-in subagent (`introspect`) | Used to look up current `.kiro` formats | Main session |
| Property-based testing | Not used. Owner decision 2026-11-08: no Kiro IDE step; deterministic tests cover the planned properties of spec `verify-cancellation` | — |
| Kiro Web, Kiro Crew | Not used; the old `kiro-crew/` stub was removed | — |

**Non-claims and limits:**

- Kiro did not build PRAMAN's original verification core: the browser and command
  engines, CLI, MCP server, reports, evidence model and the tests that existed by
  2026-11-05. That work was done by an AI coding assistant under the submitter's
  direction (see the history below).
- Not tested in the Kiro IDE, which is not a target: the finish gate's `Stop` behavior.
- Save-hook results never reach the agent, in the CLI or the IDE.
- The agent never sees a passing gate verdict, only failing ones.
- Headless use of the Power needs explicit allow rules and absolute paths.
- Session records and counts show activity, not correctness. Raw session data stays
  private; this document is the reviewed summary.

## History (2026-11-05)

The account below was written on 2026-11-05 and is kept unchanged except that its
headings moved one level down. It describes Kiro use up to that date. Its statements
about the quota block and about the `/.kiro` assets not being Kiro output were true then
and are superseded by the current state above.

**Short version: Kiro was genuinely used, but narrowly — one substantive IDE session
on one bounded Headlamp feature. Kiro did not build PRAMAN's core.**

### Short version

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

### What the session was asked to do

The submitter asked Kiro to continue PRAMAN with Headlamp as the next
development-and-verification cycle: **implement one useful, bounded Headlamp
improvement, then use PRAMAN to prove it against a real Kubernetes environment.**
The instructions required repository evidence for the chosen feature, verification
before demonstration, and the rule that missing or unavailable evidence must never
become a passing result. The recorded work centered on an editor dry-run preview
feature for Headlamp, recorded under the Kiro spec name `editor-dryrun-preview`.

### Additional CLI attempt (2026-11-05)

One more logged Kiro session was attempted on 2026-11-05 to strengthen this account.
`kiro-cli` 2.37.1 was installed and authenticated on the same machine (Google sign-in).
A non-interactive session (`kiro-cli chat --no-interactive --trust-all-tools
--trust-workspace`) was started in the PRAMAN repository with a bounded request to run
the public first-use verification. It exited with code 1 **before any tool call** with
`UsageLimitReachedError` ("You've reached your monthly usage limit"). No additional
usage was produced: the monthly limit that ended the 2026-11-01 session still applied
on 2026-11-05. The attempt is recorded so the submission does not imply more Kiro
usage than actually occurred.

### Observed evidence

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

### What Kiro did and did not do

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

### Attribution summary

| Area | Author of record | Basis |
| --- | --- | --- |
| PRAMAN product core (verification engines, CLI, MCP, reports, evidence model, tests, docs) | AI coding assistant, directed by the submitter | Not in Kiro's changed-path set; continued after the Kiro session ended |
| PRAMAN `/.kiro` specs, steering, hook, agent | Assistant (created 2026-10-31; refreshed 2026-11-05) | Git history |
| Headlamp editor dry-run preview (the Kiro session's task) | Mixed: Kiro started the spec and the edits shown in its snapshots; the assistant completed the remaining work after quota | Kiro snapshots and session end; continuation evidence in the external archive |
| Headlamp tooltip repair shown in the 2:49 walkthrough | Earlier PRAMAN Headlamp cycle; **not** part of Kiro's recorded session | Kiro's snapshots do not touch Headlamp's `frontend/src/components/common/Link.tsx`; the clip predates this session |
| `kiro-crew/` stub | Assistant scaffold; not a working Kiro Crew app and not used for the submission. Removed 2026-11-08 (owner decision) | Two files in the repository until removal; no run evidence |

### Limits and non-claims

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

### Where to look

- [ARCHIVE.md](ARCHIVE.md) — external archive holding the continuation's proof and
  walkthrough recordings.
- [video-script.md](video-script.md) — submission video storyboard and the clip
  attribution notes.
- [devpost-draft.md](devpost-draft.md) — submission copy, including the short Kiro
  section.
- [STATUS.md](STATUS.md) — current product status and remaining submission work.

## Usage log (2026-11-07 onward)

One line per Kiro feature use. Session IDs come from `kiro-cli chat --list-sessions`
in this workspace. "Kiro CLI agent" means the Kiro CLI V3 agent did the work in that
session.

| Date | Session ID | Feature | What it did |
| --- | --- | --- | --- |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Kiro CLI V3 (local session) | Onboarding session: read the repository, ran the judge route from a fresh public clone (12/12, exit 0) and the full suite (190/190) |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Steering | Workspace steering (`product.md`, `structure.md`, `tech.md`) and `AGENTS.md` were loaded automatically into the session and constrained the work |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Built-in subagent (`introspect`) | Looked up the current kiro.dev formats for hooks, agents, specs, steering, MCP and Powers; found the existing hook file invalid |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Specs | Kiro CLI agent wrote three specs: `kiro-evidence-gate` (feature), `verify-cancellation` (bugfix, after reproducing the SIGINT orphan-process bug), `submission-story` (feature). Written as files by the agent, not through `/spec new` |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | `kiro-cli mcp list` / `mcp status` | Before wiring: Kiro listed no `praman` MCP server (`No MCP server named 'praman' found`) |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Security guard (Kiro-scope permissions) | Kiro's built-in, non-configurable rule refused the agent's write to `.kiro/settings/mcp.json`: the agent cannot change its own MCP configuration. The owner created the file by hand with the agent's proposed content (`node dist/cli.js mcp`, no auto-approved tools) |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | MCP (workspace config) | After wiring: `kiro-cli mcp list` shows `praman` (`node`) under the default agent; `kiro-cli mcp status --name praman` reports command `node`, timeout 120000 ms, not disabled |
| 2026-11-07 | sess_0fac57ad-4345-4767-b400-bab0aae37775 | Headless V3 + MCP (`--require-mcp-startup --trust-tools=@praman`) | PRAMAN MCP server started from the relative `dist/cli.js` path (run exit 0; agent loaded `praman::praman_command_verify`). Both verify calls were denied by Kiro's permission layer (`approval is not supported in non-interactive mode`); the selector did not grant trust. No PRAMAN verdict produced |
| 2026-11-07 | sess_a4a453a9-1a27-47cd-95e3-30e2fc832190 | Headless V3 + MCP (`--trust-tools=@praman/praman_command_verify`) | Same result: server started, tool loaded, calls denied by permission layer. No verdict |
| 2026-11-07 | sess_ef1d8c5e-9312-45e6-9a31-76825a29448d | Headless V3 + MCP (`--trust-tools=praman::praman_command_verify`) | Same result. The agent reaches MCP tools through Kiro's deferred `tool_call` wrapper, so no tested PRAMAN-only ID granted trust. No verdict; awaiting an owner-approved PRAMAN-only permission rule |
| 2026-11-07 | sess_289994fb-1403-44ea-b0e8-1c68ff7e9a6e | Interactive CLI V3 + MCP + per-call approval | Owner-run session; owner approved each `@praman/praman_command_verify` call with "Allow" (not "Always allow"). PRAMAN wrote evidence to `.praman/kiro-mcp-verify-2026-11-07/{pass,mismatch}/`: pass `proof.json`/`feedback.json` = `passed` (2/2 repeats, stdout `10\n`); mismatch = `failed` (2/2 repeats observed `10\n` against declared `11\n`). Kiro's stored session record has no raw `isError` field: it records the pass call `completed` and the mismatch call `failed` with an `MCP tool error:` result prefix. Run timestamps overlap (pass 15:49:25.195–.312Z, mismatch .207–.314Z), so the agent ran the two calls concurrently despite the "one at a time" prompt; verdicts are unaffected (separate output directories) |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | MCP (corroboration outside Kiro) | Same two declarations through a plain MCP SDK client against the same `dist/cli.js mcp` server: raw `isError` = `false` for pass, `true` for mismatch. Confirms the flag Kiro rendered as `failed` / `MCP tool error:`; this check is not itself Kiro usage |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Custom agent + capability permissions | Kiro CLI agent updated `.kiro/agents/praman-explorer.md`: tools `["read","write","shell","@praman"]` (replacing the undocumented `bash`), `includeMcpJson: true`, and one rule `mcp` / `praman/*` / `allow`. Observed limits: `kiro-cli agent list` does not list this Markdown agent, and `kiro-cli agent validate` rejects it as invalid JSON; the V3 harness loads it (next line) |
| 2026-11-07 | sess_cf1d826d-1798-4a81-849a-aa3588326333 | Headless V3 + custom agent (`--agent praman-explorer`, no trust flags) | Agent-scoped rule granted only PRAMAN tools: zero permission denials. Calls ran in sequence (pass 15:55:31Z, mismatch 15:55:33Z). Evidence: `.praman/kiro-mcp-proof/agent-pass` = `passed` (2/2, stdout `10\n`), `agent-mismatch` = `failed` (2/2 observed `10\n` vs declared `11\n`); Kiro marked the second call `failed`. Step 1 of spec `kiro-evidence-gate` (MCP wiring) proven in Kiro |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Agent hook (`PostFileSave`, CLI V3) | Kiro CLI agent wrote `.kiro/hooks/praman-lint-on-save.json` (v1 schema, matcher `(^\|/)src/.*\.ts$`, `npm run lint`). Kiro reloaded hooks on the write and logged the old `on-save-review.json` as not matching its hook schema. After a trivial temporary comment edit to `src/review/coverage.ts` and its revert, the session record shows `ContextualHookInvoked` / `praman-lint-on-save` / `runCommand` / `completed` about 0.9 s after each write (lint takes 0.77 s standalone). Limit: Kiro CLI stores no exit code or output for this hook and does not show its output to the agent, so a lint failure would not reach the agent. A type-error probe was inconclusive (the edit and revert ran together) |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Hook cleanup | Deleted the invalid `.kiro/hooks/on-save-review.json` (owner-approved) after the replacement was proven to fire |
| 2026-11-07 | sess_2bee93f1-dd5d-49eb-8fe0-9673427faf8b | Agent hook (`Stop`, CLI V3 headless), spike 1.1 | Temporary `spike-stop-continue` hook recorded its stdin (`session_id`, `hook_event_name: "Stop"`, `cwd` = workspace root) and exited 1 once with an instruction on stderr. Session record: assistant `FIRST` → `ContextualHookInvoked spike-stop-continue completed` → assistant `CONTINUED` (a word only present in the hook's stderr) → one `turn_end`; `finalText` = `FIRSTCONTINUED`. Exit 1 continued the turn. The hook was not invoked again after the continued response. Temporary hook removed afterwards |
| 2026-11-07 | sess_18c6d45e-8575-42f8-917b-f4ed2b34b04e | Kiro IDE (Restricted Mode), **invalid run** | Owner's first IDE attempt ran with the workspace untrusted: hooks disabled, MCP not loaded. Session record confirms no `ContextualHookInvoked` entry after the probe edit and revert, and the agent read source files instead of listing MCP tools. Not counted as evidence for hooks or MCP |
| 2026-11-07 | sess_7732334c-b3cb-4fb7-b41a-e9e824b54dc8 | Kiro IDE (trusted folder) + MCP | Owner-run, new chat. Owner reports that the IDE MCP log shows `praman` connected with `listTools` OK; the agent listed the 14 `praman_*` tools from its catalog without calling any (no tool call in the session record). The relative `dist/cli.js` path starts in the IDE too (task 1.2) |
| 2026-11-07 | sess_7732334c-b3cb-4fb7-b41a-e9e824b54dc8 | Agent hook (`PostFileSave`, IDE) | IDE agent appended a deliberate type error (`TS2322` probe) to `src/review/coverage.ts`: `ContextualHookInvoked praman-lint-on-save completed` at 18:05:00.499Z, 0.94 s after the write; again at 18:05:42.604Z after the revert. The agent then said it had not run a type check: the hook's failing output did not reach it. Same as CLI V3: save hooks fire but do not feed results back (requirement 2.3 not met on either surface). Owner confirmed the probe removed; `src/` matches HEAD |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Spec-driven implementation (`kiro-evidence-gate` task 4) | Kiro CLI agent wrote the gate script `kiro-power/scripts/praman-gate.mjs`, the `Stop` hook `.kiro/hooks/praman-evidence-gate.json` and `tests/kiroGate.test.ts` (7 tests: no gate file, pass, mismatch, unavailable/missing declaration, malformed config, bound, missing build). Lint, test typecheck and the full suite pass: 197 tests / 29 files |
| 2026-11-07 | sess_1654a697-a525-4e8a-8bce-29ce588d1b68 | Agent hook (`Stop` finish gate, CLI V3 headless) | Temporary `praman-gate.json` pointed at a deliberately buggy demo command (off-by-one sum). Turn 1: agent said "I am finished." → `ContextualHookInvoked praman-evidence-gate completed` (18:23:35Z) → gate evidence `failed` (2/2 runs printed `11\n`, declared `10\n`) → agent read the gate report, identified the bug and tried to fix it; its edits were denied (no write trust in headless). The fix (seed 1 → 0) was then made by the Kiro CLI agent in session `sess_bdb9debc…`, not by this session. Turn 2 (`--resume-id`): agent finished again → gate invoked (18:24:10Z) → evidence `passed` (2/2 runs printed `10\n`), stop released, rejection counter reset to 0. Temporary gate file removed afterwards |
| 2026-11-07 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Spec-driven change (`kiro-evidence-gate` task 4.2) | Owner decision: gate internal errors now count toward the rejection bound and are never reported as passed. Counter moved to `.praman/gate-state.json` so a damaged run tree is still counted; only an unwritable counter stays uncounted. New test forces `ENOTDIR`: exits `1, 1, 0` with `NOT PROVEN` and no pass. Full suite 198 tests / 29 files |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Kiro Power (authoring, `kiro-evidence-gate` tasks 5.1–5.2) | Kiro CLI agent wrote `kiro-power/plugin.json` (Agent Plugins schema), `kiro-power/mcp.json` (stdio `node ${PRAMAN_HOME}/dist/cli.js mcp`) and the skill `kiro-power/skills/praman-verify/SKILL.md`. Files only: not yet installed or exercised in Kiro (task 5.3 waits until after the owner's gate demo) |
| 2026-11-08 | sess_d3717c15-a0de-46ee-9f10-104798730f87 | Agent hook (`Stop` finish gate, interactive CLI V3), video demo | Owner-run; owner approved each edit (no trust flags). Prompt: add a one-line comment to `.praman/gate-demo/sum.mjs` and say when finished. The agent noticed the off-by-one (sum starts at 1) at 05:45:13Z but stayed in scope and only added the comment, then said it was finished. 05:45:27.9Z `ContextualHookInvoked praman-evidence-gate` → gate run `05-45-27` = `failed` (2/2 printed `11\n`, declared `10\n`). The agent read the gate report, changed the reduce start from 1 to 0 (owner-approved), ran the script, and ended the turn saying it had not seen the gate re-run. Owner: "Check again and finish." 05:46:40.4Z gate invoked again → run `05-46-40` = `passed` (2/2 printed `10\n`), stop released, rejection counter 0 |
| 2026-11-08 | sess_d3717c15-a0de-46ee-9f10-104798730f87 | Known limit (finish gate) | The agent never sees a passing verdict: the gate runs after the agent's final message, and Kiro does not show a passing (exit 0) Stop hook's output to it. Only failing verdicts reach the agent (as stderr that continues the turn). In this run the agent's last message correctly said it could not confirm the pass |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Kiro Power install (`kiro-cli powers install ./kiro-power`, task 5.3) | Owner-approved write to `~/.kiro/powers/`. Kiro printed `Installed power "praman"`; `installed.json` lists it; the installed copy is byte-identical to `kiro-power/`. Before the test `installedPowers` was empty |
| 2026-11-08 | sess_147d3c09-e161-447e-ae1b-0f3316cd9748 | Kiro Power in a scratch project (headless, default agent) | Scratch git project in a temp directory outside the repo, `PRAMAN_HOME` set to this checkout. Prompt mentioning "PRAMAN"/"verify" made the agent call `Kiro Powers activate praman`; both activations were denied (no permission rule in headless). No verdict |
| 2026-11-08 | sess_875deeac-1bc5-45f3-882b-2e65f55568e5 | Kiro Power + throwaway scratch agent permissions | Scratch-only agent with `power`/`praman` and `mcp`/`praman/*` allow rules: activation allowed, but the power's `use` call (title `@praman/praman/praman_command_verify`) was still denied (`effect: ask`). No verdict |
| 2026-11-08 | sess_ccfd7c6f-68ac-4da3-8694-8e499b47b797 | Kiro Power end to end (headless, scratch agent) | With rules `power` / `["praman","praman*"]` and `mcp` / `["praman*","power-praman*"]`: zero denials. The agent activated the power and called `praman_command_verify`. First call failed because relative paths resolved against the installed power's directory; the agent retried with absolute paths. Evidence in the scratch project: `proof.json` and `feedback.json` = `passed`, 2/2 runs printed `10\n`. Installed power directory unchanged by the run |
| 2026-11-08 | sess_307a37d7-cbe4-43c6-b95d-843e34705c3c | Kiro Power re-test after skill fix | Kiro CLI agent added "pass absolute paths" to `SKILL.md` and reinstalled (`Updated power "praman"`). The agent still tried relative paths first, then retried with absolute paths: `passed`. Known limit: the skill text did not change the first attempt; the power's MCP server runs from the installed power directory, so relative paths fail |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Custom agent + steering (`kiro-evidence-gate` task 6) | Kiro CLI agent added steering resources to `praman-explorer`, wrote `.kiro/steering/video.md` (`fileMatch`, includes `docs/video-guidelines.md`) and `.kiro/steering/declarations.md` (`auto`, includes `docs/schema-cheatsheet.md`), and removed the stale `kiro-crew/` stub (owner decision 4-B). Kiro loaded the new `auto` steering into this session's available context as `praman-declarations` as soon as it was written |
| 2026-11-08 | sess_1266542d-6e5f-474a-9bba-ace1d8805048 | Custom agent resources + steering (headless, `--agent praman-explorer`) | Asked which mode to use for a new check and what exit 2 means, with no tool calls. The agent answered from `declarations.md` ("`acceptance`"; exit 2 = `insufficient_evidence`, "not proven") and listed `praman-declarations`, the video steering and both referenced docs among its context. The session record's `steering_inclusion` entry lists only the always-on files; the two new files reached the agent through the agent's `resources` glob |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Kiro Power docs | Kiro CLI agent added the required permission rules (`power` `praman*`, `mcp` `praman*`) with copy-paste examples to the README, a new `kiro-power/README.md` and the skill; reinstalled the Power (`Updated power "praman"`, installed copy identical to the repo) |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Git/GitHub delivery from Kiro (PR #1) | Kiro CLI agent replayed the 14 spec commits onto public `main`, pushed `kiro-evidence-gate`, opened PR #1 and watched CI (Ubuntu and macOS: 182 passed / 16 skipped of 198). After owner approval it merged PR #1 with a merge commit (`619a76e`) and confirmed CI green on `main` (run 42457432307). The GitHub-made merge commit carries the account's primary email; owner chose to leave it and change account settings |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Steering (always-on) | Owner rule recorded as `.kiro/steering/publishing.md`: check the identity of every commit before a push or merge, including merges GitHub makes itself |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Git/GitHub delivery (PR #2) | Docs-only PR for the public test counts; CI green on Ubuntu and macOS. Per the publishing steering, the agent checked the merge identity: the account's primary email was still public, so it merged by fast-forwarding `main` to the tested commit `b1d9018` (no GitHub-made commit). CI green on `main` (run 42459187815) |
| 2026-11-08 | sess_092bb144-5f93-4aca-a37f-3a8b95f95833 | Headless run, **invalid** | Probe started from the wrong directory; `--agent power-test` not found (exit 4). No result |
| 2026-11-08 | sess_bf2efd93-3cf8-4feb-81cd-bb1bdb1af5fa | Kiro Power MCP probe (spec `power-path-resolution` task 1.1) | A throwaway MCP server installed in place of PRAMAN's `dist/cli.js` (temp `PRAMAN_HOME`) recorded what Kiro gives a Power server: `cwd` = the installed Power directory; client capabilities only `elicitation`; `roots/list` → `Method not found`; `PWD` inherited from the launching shell. Confirms the root cause in the bugfix spec |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Specs (bugfix) | Kiro CLI agent wrote `.kiro/specs/power-path-resolution/` (`bugfix.md`, `design.md`, `tasks.md`) from the probe and the earlier `ENOENT` in `~/.kiro/powers/installed/praman/total.json` |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Bugfix spec implementation (`power-path-resolution`) | Owner trimmed the spec to `PRAMAN_RELATIVE_PATHS=reject` only (`PRAMAN_WORKSPACE` and client roots deferred; unit tests, no property tests). Kiro CLI agent updated the spec, added `src/mcp/paths.ts`, routed all 14 MCP tools through a policy wrapper in `src/mcp/server.ts`, set the variable in `kiro-power/mcp.json`, added `tests/mcpPaths.test.ts` (6 tests) and updated the docs. Full suite 204 tests / 30 files; first-use 12/12. Power reinstalled (`Updated power "praman"`) |
| 2026-11-08 | sess_055fb96f-64d8-47df-b60e-6582d86a24ad | Kiro Power proof (headless, scratch project) | Agent called the Power's `praman_command_verify` with relative paths: refused (`insufficient_evidence`, arguments `specPath`, `outDir`, "Nothing was executed or written"). Then absolute paths: `passed` (2/2 printed `10\n`). The installed Power's file list and contents were unchanged after the run, and no relative output directory was created |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Bugfix review follow-up (`power-path-resolution` task 7) | Owner review found that an omitted `baseDir` falls back to a relative default. The Kiro CLI agent reproduced it through the compiled MCP server in reject mode (`ENOENT … <server-dir>/.praman/environments/abcdefabcdef/state.json`), then made reject mode require `baseDir` for `praman_environment` (2 new tests). It confirmed from the code path that the demonstrate tools' speech cache default is also relative and documented it as a Power limit without building more. Power reinstalled; lint, full suite (206 tests / 30 files) and first-use 12/12 pass |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Steering update (`publishing.md`) | Owner made the GitHub primary email private (`gh api user/emails`: `visibility=private`). Steering updated: GitHub-made commits would now use the account's no-reply address; identity is still checked before every push or merge, and fast-forward stays preferred |
| 2026-11-08 | sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60 | Specs (planning the "vital gaps") | After the owner pointed to earlier real-app use (Headlamp, Kan, Stern, jq, Luma, and Lattice built and verified by opencode, a different agent), the Kiro CLI agent checked the six agent-facing gaps from the opencode/Lattice review against current code (all six still present) and wrote three new feature specs: `agent-diagnostics` (gaps 1, 5), `scenario-actions` (gaps 2, 4) and `named-steps` (gap 3). Gap 6 stays in bugfix spec `verify-cancellation`, with its property-test step moved to the owner in the Kiro IDE |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Steering (always-on) | Kiro loaded `AGENTS.md`, the workspace steering (`product`, `publishing`, `structure`, `tech`) and the owner's global `reply-style.md` into the session (`steering_inclusion` entry) |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Skills (global `2lines`, `darshan`) | Activated at session start because the global reply-style steering requires them; they change only how replies are written |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Bugfix spec (`verify-cancellation` task 1) | Kiro CLI agent reproduced the bug with a private probe (`.praman/cancel-probe/`) on `643fbe0`: the declared command survived on `command-verify` SIGINT/SIGTERM, `workflow-replay` SIGINT, MCP request cancel and MCP stdin close; `scenario-verify` was not affected (Playwright closes the browser). It wrote `tests/cancellation.test.ts` first: 8 of 9 tests failed before the fix |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Bugfix spec (`verify-cancellation` tasks 3–4) | Kiro CLI agent added abort support to `executeCommand` (SIGTERM, SIGKILL after 2 s, status `interrupted`), `proveCommands` and `replayWorkflow` (no further runs, `insufficient_evidence`, `"interrupted": true`), a CLI `withStop` helper (exit 130/143) and MCP cancel/stdin-close/signal handling. Added a SIGTERM-ignoring case (10 tests). After the fix: 10/10, probe shows no orphan on all 6 paths, full suite 216 tests / 31 files, first-use 12/12. Property tests (task 2) left for the owner in the IDE |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Agent hook (`PostFileSave`) | The session record has 26 `ContextualHookInvoked praman-lint-on-save completed` entries, one per `src/*.ts` edit. As before, the hook's output did not reach the agent; the agent ran `npm run lint` itself |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #4) | After owner approval, the Kiro CLI agent checked all three commits carry the public no-reply identity and the primary email is private, pushed `plan-agent-gaps` (the checkout has no remote; pushed by URL), opened PR #4 and waited for CI (Ubuntu and macOS: 200 passed / 16 skipped of 216). It fast-forwarded `main` from `762cee6` to `59090bf` (no GitHub-made commit); GitHub marked PR #4 merged; CI green on `main` (run 42490279163) |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Steering (global, owner-approved) | Added rule 4 to `~/.kiro/steering/reply-style.md`: boxes and tables must line up (pad every row, check line lengths, else use a markdown table), after a misaligned box in this session |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Bugfix spec follow-up (`verify-cancellation`, owner asked to close it fully) | Kiro CLI agent reproduced the bug on four more commands on `59090bf` (`coverage-review`, plain `workflow-campaign`, `command-preview`, `command-demonstrate`: all left the declared command running) and confirmed durable campaigns drain and exit cleanly. It wired the same abort into those paths, their MCP tools and the CLI, and added an exit guard that kills still-owned groups if PRAMAN exits early. 5 new tests failed on `59090bf` and pass now (15/15); full suite 221 tests / 31 files; first-use 12/12 |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Bugfix spec task 5.2 (repair-mode self-check) | Kiro CLI agent wrote `examples/self-check/cancellation/` (harness, repair declaration, baseline build script). PRAMAN checked its own fix: baseline `643fbe0` printed `orphan: yes`, current `orphan: no` 3/3, verdict `passed`, identity `stable` |
| 2026-11-08 | sess_c6010529-cf81-4337-9812-2ff7a1c61285 | Agent hook (`Stop` finish gate, headless), task 5.3 | With a temporary `praman-gate.json` naming the self-check, a headless session replied and stopped; the session record shows `ContextualHookInvoked praman-evidence-gate completed`; gate run `2026-11-08T15-12-07` proof and feedback `passed` (baseline `orphan: yes`, current `orphan: no` 3/3). Gate file removed afterwards |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Agent hooks (count) | Session record so far: 64 `praman-lint-on-save` runs (one per `src/*.ts` edit) and 5 `praman-evidence-gate` runs at turn ends; those gate runs did nothing because no gate file existed |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #5) | After owner approval the Kiro CLI agent pushed the follow-up and opened PR #5. CI failed on macOS only (1 of 221: `kill EPERM` while cleaning up an already-exited process group in the command-demonstrate cancellation test). The agent did not merge; it made group cleanup treat `EPERM` like `ESRCH` (nothing left to stop), re-ran the cancellation tests 3 times (15/15 each) and the full suite (221/221), and pushed the fix for a new CI run |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #5, merged) | Second CI run green on Ubuntu and macOS; `main` fast-forwarded from `59090bf` to `454c4ba` (no GitHub-made commit); PR #5 marked merged; CI green on `main` (run 42495927884, 205 passed / 16 skipped of 221) |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Kiro Power reinstall (owner-approved) | `kiro-cli powers install ./kiro-power` after the gate's timeout message changed; the installed copy in `~/.kiro/powers/installed/praman` is identical to `kiro-power/` |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Specs and docs (owner decision) | Owner: PRAMAN is not built for the Kiro IDE, so no IDE step. Kiro CLI agent closed `verify-cancellation` task 2 by mapping properties P1–P5 to the existing deterministic tests (no `fast-check`; gap kept: abort timing at fixed points, not randomized) and removed pending IDE items from the spec, STATUS, ROADMAP, README, this account and spec `submission-story` |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #6, docs only) | After owner approval the Kiro CLI agent checked both commits carry the public no-reply identity, the primary email is private and the diff has no private paths, pushed `plan-agent-gaps`, opened PR #6 and waited for CI (Ubuntu and macOS green). It fast-forwarded `main` from `454c4ba` to `40ad775` (no GitHub-made commit); PR #6 marked merged; CI green on `main` (run 42500133439) |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #7, docs only) | After owner approval the Kiro CLI agent checked the commit's public no-reply identity, the private primary email and the diff for private paths, pushed `plan-agent-gaps`, opened PR #7 and waited for CI (Ubuntu and macOS green). It fast-forwarded `main` from `40ad775` to `ee53f9f` only after CI passed (no GitHub-made commit); PR #7 marked merged; CI green on `main` (run 42502177544) |
| 2026-11-08 | sess_90d45003-fc3a-45b8-88cb-dc94739e0f80 | Git/GitHub delivery (PR #8, docs only) | After owner approval the Kiro CLI agent pushed `af9aa1e` (usage log for PR #7) and opened PR #8. The first branch CI attempt failed on macOS only (`tests/networkPolicy.test.ts`, unrelated to the docs-only change); the agent reran the failed job and it passed (run 42505717462, attempt 2); the pull-request run 42505722529 was green. `main` fast-forwarded from `ee53f9f` to `af9aa1e` (no GitHub-made commit); PR #8 marked merged; CI green on `main` (run 42507953014). The test is treated as flaky and watched |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Specs (`agent-diagnostics` task 1) | Kiro CLI agent started the spec by reproducing the problem: real `scenario-verify --summary` runs against a local three-button page printed only `execution_unavailable: current run 1 step[0]` (or `evidence_unavailable … check[1]`) and the generic next action, while the private `result.json` held `strict mode violation … resolved to 3 elements`. It captured the raw Playwright messages for ambiguous, timeout, navigation, closed and crashed cases into the spec design |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Spec-driven implementation (`agent-diagnostics` tasks 2–5) | Kiro CLI agent added `src/review/classify.ts` (fixed kinds `locator_ambiguous`, `locator_timeout`, `navigation_failed`, `browser_closed`, `unknown`; only counts, timeouts and an enum state leave private evidence) and wired it into diagnostics, `--summary`, `feedback.json`, `REPORT.md` and MCP results, plus a `## Checks` pass/fail table at the top of browser and command reports. The same repro now prints `diagnosis: locator_ambiguous (3 elements)` with a class-specific next action; verdicts and exit codes unchanged. 5 new or changed integration tests fail on the old code and pass now; full suite 242 tests / 33 files (`tests/networkPolicy.test.ts` passed); first-use 12/12 |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Agent hook (`PostFileSave`, CLI V3) | Session record shows 16 `praman-lint-on-save` runs during the source edits; as before, their results did not reach the agent, which ran `npm run lint` itself |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Git/GitHub delivery (PR #9) | After owner approval the Kiro CLI agent checked all three commits carry the public no-reply identity and the primary email is private, pushed `plan-agent-gaps`, opened PR #9 and waited for CI (Ubuntu and macOS green). It fast-forwarded `main` from `af9aa1e` to `fa9e18e` (no GitHub-made commit); PR #9 marked merged; CI green on `main` (run 42566057306, 226 passed / 16 skipped of 242). With the owner's yes it then moved local `main` to `fa9e18e` (old `b7f11d0` stays on branch `kiro-evidence-gate`) |
| 2026-11-09 | sess_3fb8dc22-6898-4879-bc7c-f5df1b4fe6eb | Headless V3 + custom agent (`--agent praman-explorer`, `--require-mcp-startup`), invalid run | Stopped at start: the installed Power's MCP server (`power-praman-praman`) failed because `PRAMAN_HOME` was not set. No tool call. Later runs set `PRAMAN_HOME` to this checkout |
| 2026-11-09 | sess_cc38cc09-517c-42b7-b5aa-e86e96722c04 | Headless V3 + custom agent, read denied | The agent tried to read the scenario file four ways; each permission request failed in headless mode. It ran no verification, said so and did not invent a scenario |
| 2026-11-09 | sess_0db97c0c-068b-4df2-9371-788abe59481c | Headless V3 + custom agent + MCP (`agent-diagnostics` task 6) | Scenario given inline; local page with three `button.action` buttons. One `@praman/praman_scenario_verify` call: `insufficient_evidence`, both diagnostics `execution_unavailable` step 0 with `diagnosis: locator_ambiguous`, `matched: 3`, and the class-specific next action. The MCP response contained no selector, raw Playwright message or app URL; the agent quoted the selector from its own prompt. `REPORT.md` opens with the `## Checks` table |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Specs and docs (`agent-diagnostics` task 7) | Kiro CLI agent documented the diagnosis kinds and the check table in README, the cheat sheet, the browser acceptance guide and CHANGELOG, closed the spec, updated STATUS and ROADMAP (order 2 done; carry-overs resolved) and deleted the two local note files with the owner's yes |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Git/GitHub delivery (PR #10, docs only) | After owner approval the Kiro CLI agent checked the commit's public no-reply identity, the private primary email and the diff for private paths, pushed `plan-agent-gaps`, opened PR #10 and waited for CI (Ubuntu and macOS green). It fast-forwarded `main` and local `main` from `fa9e18e` to `d62f645` (no GitHub-made commit); PR #10 marked merged; both jobs green on `main` (run 42592108598) |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Spec-driven implementation (`scenario-actions` tasks 1–8) | Kiro CLI agent first reproduced both problems on real runs: a `visible` check passed on a chart container whose bars had not rendered (screenshot shows no bars), and `dblclick`/`drag` steps were rejected by the schema. It added `dblclick`, `selectOption`, `type`, `scroll`, `drag`, `waitFor` `state`/`count` and a `count` check; the same scenarios now pass with all five bars counted. While testing it found and fixed a crash on public `main`: redaction rewrote PRAMAN's own field names when a private `fill` value was one letter. 12 new tests fail on the old code; full suite 265 tests / 34 files; first-use 12/12 |
| 2026-11-09 | sess_1cf21d4c-ce2d-4324-8154-7cee5ef682ef | Headless V3 + custom agent + MCP (`scenario-actions` task 7) | `--agent praman-explorer`, scenario inline, local page. One `@praman/praman_scenario_verify` call with a `dblclick` step and a `drag` step: `passed`, both checks observed `yes` in both runs; the agent reported the verdict and per-check outcome by index |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Git/GitHub delivery (PR #11) | Kiro CLI agent checked the commit's public no-reply identity and the private primary email, pushed `plan-agent-gaps`, opened PR #11 and waited for CI (Ubuntu and macOS green). It fast-forwarded `main` and local `main` from `d62f645` to `e559992` (no GitHub-made commit); PR #11 marked merged; CI green on `main` (run 42594982427, 249 passed / 16 skipped of 265) |
| 2026-11-09 | sess_c1fcf2e4-6dba-4de9-8370-e464f14df771 | Spec-driven implementation (`named-steps` tasks 1–5) | Kiro CLI agent first reproduced the problem on real runs: after inserting a help step into a two-click counter scenario, both index checkpoints ran one step early (observed `0` and `1`, verdict `failed`), and step ids were rejected by the schema. It added optional step ids and id references for `afterStep`, network windows and walkthrough steps, resolved at parse time with field-named errors for unknown or duplicate ids. The same inserted-step scenario with ids passes. 10 of 11 new tests fail on the old code; full suite 276 tests / 35 files; first-use 12/12; MCP still lists 14 tools |
| 2026-11-09 | sess_fc0aef1b-ee8e-49fd-8802-299bf14010ce | Headless V3 + custom agent + MCP (`named-steps` task 4) | `--agent praman-explorer`, inline scenario with step ids and an inserted step. One `@praman/praman_scenario_verify` call: `passed`; the agent reported the checks ran after steps 1 and 2. The MCP response contained no step ids (indexes only) |

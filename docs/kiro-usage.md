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
| Kiro IDE | Used for checks only (MCP tool listing, lint hook) | `sess_7732334c…`; one earlier run invalid (Restricted Mode) |
| Specs | Used: 2 feature specs, 1 bugfix spec. Written as files by the agent, not through `/spec new` | `.kiro/specs/` |
| Steering | Used: always-on files, plus new `fileMatch` and `auto` files | `sess_1266542d…` |
| Agent hooks | Used: `PostFileSave` (fires, result not shown to the agent) and `Stop` (finish gate) | `sess_2bee93f1…`, `sess_d3717c15…` |
| Custom agents | Used: `praman-explorer` with capability permissions | `sess_cf1d826d…` |
| MCP | Used: workspace server, 14 tools | `sess_289994fb…`, `sess_cf1d826d…` |
| Kiro Powers | Used: authored, installed, exercised from another project | `sess_ccfd7c6f…` |
| Built-in subagent (`introspect`) | Used to look up current `.kiro` formats | Main session |
| Property-based testing | Not yet used; planned for spec `verify-cancellation` in the IDE | — |
| Kiro Web, Kiro Crew | Not used; the old `kiro-crew/` stub was removed | — |

**Non-claims and limits:**

- Kiro did not build PRAMAN's original verification core: the browser and command
  engines, CLI, MCP server, reports, evidence model and the tests that existed by
  2026-11-05. That work was done by an AI coding assistant under the submitter's
  direction (see the history below).
- Not yet tested in the IDE: the finish gate's `Stop` behavior.
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

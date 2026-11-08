# Tasks: verification cancellation

Target: week 2 (Nov 16–22, 2026). Implement in a recorded Kiro bugfix-spec session.
Owner decision 2026-11-08: no Kiro IDE step and no `fast-check` dependency. PRAMAN is not
built for the IDE, and the deterministic tests in `tests/cancellation.test.ts` already
cover properties P1–P5 (see task 2). Part of the "vital gaps" plan (gap 6).

Implemented 2026-11-08 in Kiro CLI session `sess_90d45003-fc3a-45b8-88cb-dc94739e0f80`.
First fix `59090bf` (PR #4); remaining entry points, exit guard and self-check `7d2f4a7`
plus macOS cleanup fix `454c4ba` (PR #5). Spec closed.

- [x] 1. Reproduce and scope
  - [x] 1.1 Add the reproduction as a failing test (command-verify SIGINT leaves the group alive)
    - `tests/cancellation.test.ts`: before the first fix 8 of 9 tests failed (the
      never-aborted case passed, as it should). The 5 tests added in the follow-up
      all failed on `59090bf`.
  - [x] 1.2 Check scenario-verify, workflow-replay, MCP request cancellation and MCP transport close; record which are affected
    - Probe on `643fbe0` (macOS arm64, Node 26.0.0), declared command sleeping 20 s:

      | Entry point | Before the fix |
      | --- | --- |
      | `command-verify` SIGINT | affected: group alive, process ended by the signal, no proof |
      | `command-verify` SIGTERM | affected: same |
      | `workflow-replay` SIGINT | affected: same |
      | `scenario-verify` SIGINT | not affected: Playwright closes the browser and exits 130; no proof written (never green) |
      | MCP `praman_command_verify` request cancel | affected: group alive, server ignores `extra.signal` |
      | MCP stdin close (SDK client `close()`) | affected: server ignores stdin end, is SIGTERMed by the client after 2 s and dies; group alive |
      | MCP SIGTERM during `praman_scenario_verify` | not affected: browser closed (same before and after the fix) |

    - Follow-up check on `59090bf` (same executor, not wired by the first fix):

      | Entry point | Before the follow-up |
      | --- | --- |
      | `coverage-review` SIGINT | affected |
      | `workflow-campaign` (not durable) SIGINT | affected |
      | `command-preview` SIGINT | affected |
      | `command-demonstrate` SIGINT (during proof) | affected |
      | `workflow-campaign --durable` SIGINT | not affected: drains the admitted job, then exits; nothing left (unchanged by design) |
  - _Bugfix: Current 1–3_

- [x] 2. Cover properties P1–P5 (replaced: deterministic tests, no `fast-check`, owner decision 2026-11-08)
  - P1 no orphan: every abort test checks the whole owned group is gone (abort before
    start, during a run, SIGTERM ignored, early process exit; CLI, MCP and in process)
  - P2 never green when interrupted: every abort test asserts `insufficient_evidence`
  - P3 no repeat after abort: abort tests assert exactly one started run or job
  - P4 unchanged when not aborted: the never-aborted case, plus the full suite unchanged
  - P5 missing evidence never passes: existing `tests/commandProof.test.ts` cases
    (missing executable, missing artifact, deadline)
  - Gap kept: abort timing is tested at fixed points, not randomized
  - Fail-before evidence: 8 of 9 failed on `643fbe0`, the 5 follow-up tests failed on `59090bf`
  - _Design: correctness properties_

- [x] 3. Implement abort support
  - [x] 3.1 `executeCommand` signal handling with SIGTERM → grace → SIGKILL (`interruptGraceMs` = 2000; run status `interrupted`). Exit guard: owned groups still running are SIGKILLed if the PRAMAN process exits early (for example Playwright's SIGINT handler calls `process.exit(130)`)
  - [x] 3.2 `proveCommands` stops repeats and records `insufficient_evidence` / `interrupted` (also `replayWorkflow`, `reviewCoverage`, `runCampaign`, `previewCommands`, `demonstrateCommands`)
  - [x] 3.3 Browser path, if task 1.2 found it affected — not affected; unchanged
  - _Bugfix: Expected 1–3, 6_

- [x] 4. Wire entry points
  - [x] 4.1 CLI `withStop` helper for affected commands; exit 130/143 (`command-verify`, `workflow-replay`, `coverage-review`, `workflow-campaign`, `command-preview`, `command-demonstrate`; durable and agent campaigns keep their drain behavior and verdict exit codes)
  - [x] 4.2 MCP `extra.signal` and transport-close abort for the same six tools (stdin end and SIGINT/SIGTERM abort in-flight runs; the server exits 130/143 after they settle)
  - _Bugfix: Expected 4, 5_

- [x] 5. Verify
  - [x] 5.1 Full suite passes; first-use 12/12 unchanged — full suite 221 tests / 31 files, first-use 12/12; probe shows no orphan on every affected path; P1–P5 covered (task 2)
  - [x] 5.2 Run the self-check repair declaration: old build reproduces `orphan: yes`, fixed build passes 3/3
    - `examples/self-check/cancellation/`: baseline `643fbe0` printed `orphan: yes`
      (CLI ended by SIGINT); current printed `orphan: no` 3/3 (CLI exit 130);
      verdict `passed`, identity `stable`
  - [x] 5.3 Through the Kiro evidence gate (spec `kiro-evidence-gate`) if it is ready
    - Temporary `praman-gate.json` with the self-check; headless session
      `sess_c6010529-cf81-4337-9812-2ff7a1c61285`: `ContextualHookInvoked
      praman-evidence-gate completed`, gate run `2026-11-08T15-12-07` proof and
      feedback `passed`. Gate file removed afterwards
  - _Bugfix: Unchanged 1–5_

- [x] 6. Document
  - [x] 6.1 README command contract: interruption behavior and exit codes
  - [x] 6.2 CHANGELOG, STATUS (observed results), kiro-usage (session IDs, what Kiro wrote)

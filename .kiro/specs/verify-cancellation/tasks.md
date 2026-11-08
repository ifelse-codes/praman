# Tasks: verification cancellation

Target: week 2 (Nov 16–22, 2026). Implement in a recorded Kiro bugfix-spec session.
Owner decision 2026-11-08: the property-based test step (task 2) runs in the Kiro IDE,
by the owner (kiro.dev lists PBT as IDE-only). Part of the "vital gaps" plan (gap 6).

Implemented 2026-11-08 in Kiro CLI session `sess_90d45003-fc3a-45b8-88cb-dc94739e0f80`.
First fix `59090bf` (public `main`, PR #4); remaining entry points, exit guard and
self-check in the follow-up commit. Only task 2 is left, for the owner.

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

- [ ] 2. Write property tests P1–P5 with fast-check (after owner approves the dev dependency); confirm P1–P3 fail before the fix
  - Owner, in the Kiro IDE. Old behavior for the "fail before" check: commit `643fbe0`.
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
  - [x] 5.1 Full suite passes; first-use 12/12 unchanged — full suite 221 tests / 31 files, first-use 12/12; probe shows no orphan on every affected path. P1–P5 are task 2 (owner)
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

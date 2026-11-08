# Tasks: verification cancellation

Target: week 2 (Nov 16–22, 2026). Implement in a recorded Kiro bugfix-spec session.
Owner decision 2026-11-08: the property-based test step (task 2) runs in the Kiro IDE,
by the owner (kiro.dev lists PBT as IDE-only). Part of the "vital gaps" plan (gap 6).

Implemented 2026-11-08 in Kiro CLI session `sess_90d45003-fc3a-45b8-88cb-dc94739e0f80`,
branch `plan-agent-gaps` (local). Task 2 is left for the owner.

- [x] 1. Reproduce and scope
  - [x] 1.1 Add the reproduction as a failing test (command-verify SIGINT leaves the group alive)
    - `tests/cancellation.test.ts`: before the fix 8 of 9 tests failed (the
      never-aborted case passed, as it should).
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

    - Not checked, same executor, not wired in this fix: `coverage-review`,
      `command-demonstrate`, `command-preview`, non-durable `workflow-campaign`
      and their MCP tools. Campaign stop keeps its drain behavior.
  - _Bugfix: Current 1–3_

- [ ] 2. Write property tests P1–P5 with fast-check (after owner approves the dev dependency); confirm P1–P3 fail before the fix
  - Owner, in the Kiro IDE. Old behavior for the "fail before" check: commit `643fbe0`.
  - _Design: correctness properties_

- [x] 3. Implement abort support
  - [x] 3.1 `executeCommand` signal handling with SIGTERM → grace → SIGKILL (`interruptGraceMs` = 2000; run status `interrupted`)
  - [x] 3.2 `proveCommands` stops repeats and records `insufficient_evidence` / `interrupted` (also `replayWorkflow`)
  - [x] 3.3 Browser path, if task 1.2 found it affected — not affected; unchanged
  - _Bugfix: Expected 1–3, 6_

- [x] 4. Wire entry points
  - [x] 4.1 CLI `withStop` helper for affected commands; exit 130/143 (`command-verify`, `workflow-replay`; campaigns use the same helper with unchanged behavior)
  - [x] 4.2 MCP `extra.signal` and transport-close abort (stdin end and SIGINT/SIGTERM abort in-flight runs; the server exits 130/143 after they settle)
  - _Bugfix: Expected 4, 5_

- [ ] 5. Verify
  - [ ] 5.1 P1–P5 pass; full suite passes; first-use 12/12 unchanged
    - Done: full suite 216 tests / 31 files; first-use 12/12; probe after the fix shows
      no orphan on all six paths. Waiting: P1–P5 (task 2).
  - [ ] 5.2 Run the self-check repair declaration: old build reproduces `orphan: yes`, fixed build passes 3/3
  - [ ] 5.3 Through the Kiro evidence gate (spec `kiro-evidence-gate`) if it is ready
  - _Bugfix: Unchanged 1–5_

- [ ] 6. Document
  - [x] 6.1 README command contract: interruption behavior and exit codes
  - [ ] 6.2 CHANGELOG, STATUS (observed results), kiro-usage (session IDs, what Kiro wrote) — written for tasks 1, 3, 4; update after task 2 and 5.2

# Tasks: verification cancellation

Target: week 2 (Nov 16–22, 2026). Implement in a recorded Kiro bugfix-spec session.
Owner decision 2026-11-08: the property-based test step (task 2) runs in the Kiro IDE,
by the owner (kiro.dev lists PBT as IDE-only). Part of the "vital gaps" plan (gap 6).

- [ ] 1. Reproduce and scope
  - [ ] 1.1 Add the reproduction as a failing test (command-verify SIGINT leaves the group alive)
  - [ ] 1.2 Check scenario-verify, workflow-replay, MCP request cancellation and MCP transport close; record which are affected
  - _Bugfix: Current 1–3_

- [ ] 2. Write property tests P1–P5 with fast-check (after owner approves the dev dependency); confirm P1–P3 fail before the fix
  - _Design: correctness properties_

- [ ] 3. Implement abort support
  - [ ] 3.1 `executeCommand` signal handling with SIGTERM → grace → SIGKILL
  - [ ] 3.2 `proveCommands` stops repeats and records `insufficient_evidence` / `interrupted`
  - [ ] 3.3 Browser path, if task 1.2 found it affected
  - _Bugfix: Expected 1–3, 6_

- [ ] 4. Wire entry points
  - [ ] 4.1 CLI `withStop` helper for affected commands; exit 130/143
  - [ ] 4.2 MCP `extra.signal` and transport-close abort
  - _Bugfix: Expected 4, 5_

- [ ] 5. Verify
  - [ ] 5.1 P1–P5 pass; full suite passes; first-use 12/12 unchanged
  - [ ] 5.2 Run the self-check repair declaration: old build reproduces `orphan: yes`, fixed build passes 3/3
  - [ ] 5.3 Through the Kiro evidence gate (spec `kiro-evidence-gate`) if it is ready
  - _Bugfix: Unchanged 1–5_

- [ ] 6. Document
  - [ ] 6.1 README command contract: interruption behavior and exit codes
  - [ ] 6.2 CHANGELOG, STATUS (observed results), kiro-usage (session IDs, what Kiro wrote)

# Tasks: Kiro evidence gate

Target: week 1 (Nov 9–15, 2026). Run every task in a recorded Kiro session.

Status: closed 2026-11-08. Open limits: save-hook results never reach the agent (req
2.3); Power needs explicit permission rules and absolute paths (follow-up bugfix spec
for path resolution, owner decision 2-A). IDE `Stop` behavior is untested and out of
scope: the Kiro IDE is not a target (owner decision 2026-11-08).

- [x] 1. Spike: confirm Kiro hook and MCP behavior on both surfaces
  - [x] 1.1 Record the Stop-hook stdin JSON fields and which exit code continues a turn (CLI V3 done 2026-11-07: exit 1 continues once. IDE Stop behavior not tested; carried as an open limit)
  - [x] 1.2 Confirm the MCP server working directory for `.kiro/settings/mcp.json` in CLI V3 and IDE (CLI V3 and IDE done 2026-11-07: relative `dist/cli.js` starts from the workspace root on both)
  - [x] 1.3 Confirm whether the `PostFileSave` matcher sees relative or absolute paths (matcher `(^|/)src/.*\.ts$` fires in CLI V3, so either form works)
  - _Requirements: 1.1, 2.3, 3.4, 3.6_

- [x] 2. Wire PRAMAN MCP into the workspace
  - [x] 2.1 Add `.kiro/settings/mcp.json` with no auto-approved tools (owner-created: Kiro blocks agent writes to `.kiro/settings/`)
  - [x] 2.2 Verify the tools in a Kiro session (CLI `sess_289994fb…`, `sess_cf1d826d…`; IDE `sess_7732334c…` listed 14). Visible failure with `dist/` removed: not tested
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Replace the invalid save hook
  - [x] 3.1 Write `.kiro/hooks/praman-lint-on-save.json` (v1 schema); remove `on-save-review.json` (owner approval)
  - [x] 3.2 Show the hook firing after an agent edit under `src/` (CLI and IDE). Requirement 2.3 not met: the result never reaches the agent
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Build the Stop-hook gate
  - [x] 4.1 Write `kiro-power/scripts/praman-gate.mjs` (strict config parse, CLI spawn, safe summary)
  - [x] 4.2 Implement the bounded turn counter in `.praman/gate-state.json` (gate internal errors count toward the bound)
  - [x] 4.3 Add `.kiro/hooks/praman-evidence-gate.json`
  - [x] 4.4 Add `tests/kiroGate.test.ts` for the six error-handling rows (7 tests; full suite 197/29 files)
  - [x] 4.5 Proven in Kiro CLI V3 (session `sess_1654a697-a525-4e8a-8bce-29ce588d1b68`): rejected a stop on a failing declaration, released it after the fix. IDE Stop behavior still untested
  - _Requirements: 3.1–3.8_

- [x] 5. Package the Power
  - [x] 5.1 Write `kiro-power/plugin.json`, `kiro-power/mcp.json` (`${PRAMAN_HOME}`)
  - [x] 5.2 Write `kiro-power/skills/praman-verify/SKILL.md`
  - [x] 5.3 Install with `kiro-cli powers install ./kiro-power` in a different scratch project and run one acceptance check through it (2026-11-08, `sess_ccfd7c6f…`: `passed`). Limits: needs `power`/`praman*` allow rules for headless; relative paths resolve against the installed power directory
  - _Requirements: 4.1–4.4_

- [x] 6. Refresh agent and steering
  - [x] 6.1 Update `praman-explorer.md` frontmatter (selectors, resources, MCP)
  - [x] 6.2 Add `video.md` (fileMatch) and `declarations.md` (auto) steering
  - [x] 6.3 Apply the owner decision on `kiro-crew/` (removed)
  - _Requirements: 5.1–5.4_

- [x] 7. Record evidence
  - [x] 7.1 One CLI V3 session showing the gate blocking on a mismatch and releasing after a fix (interactive, owner-approved edits: `sess_d3717c15-a0de-46ee-9f10-104798730f87`; IDE still pending)
  - [x] 7.2 Update `docs/kiro-usage.md`, `.kiro/specs/praman-core/tasks.md` and `docs/STATUS.md` with observed results and limits
  - _Requirements: 6.1, 6.2_

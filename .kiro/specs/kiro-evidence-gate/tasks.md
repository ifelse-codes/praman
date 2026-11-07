# Tasks: Kiro evidence gate

Target: week 1 (Nov 9–15, 2026). Run every task in a recorded Kiro session.

- [ ] 1. Spike: confirm Kiro hook and MCP behavior on both surfaces
  - [ ] 1.1 Record the Stop-hook stdin JSON fields and which exit code continues a turn in CLI V3 and in the IDE (CLI V3 done 2026-11-07: exit 1 continues once; IDE pending)
  - [x] 1.2 Confirm the MCP server working directory for `.kiro/settings/mcp.json` in CLI V3 and IDE (CLI V3 and IDE done 2026-11-07: relative `dist/cli.js` starts from the workspace root on both)
  - [x] 1.3 Confirm whether the `PostFileSave` matcher sees relative or absolute paths (matcher `(^|/)src/.*\.ts$` fires in CLI V3, so either form works)
  - _Requirements: 1.1, 2.3, 3.4, 3.6_

- [ ] 2. Wire PRAMAN MCP into the workspace
  - [ ] 2.1 Add `.kiro/settings/mcp.json` with no auto-approved tools
  - [ ] 2.2 Verify 14 tools listed in a Kiro session; verify visible failure with `dist/` removed in a temp clone
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Replace the invalid save hook
  - [ ] 3.1 Write `.kiro/hooks/praman-lint-on-save.json` (v1 schema); remove `on-save-review.json` (owner approval)
  - [ ] 3.2 Show the hook firing after an agent edit under `src/`
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Build the Stop-hook gate
  - [x] 4.1 Write `kiro-power/scripts/praman-gate.mjs` (strict config parse, CLI spawn, safe summary)
  - [x] 4.2 Implement the bounded turn counter in `.praman/gate/state.json`
  - [x] 4.3 Add `.kiro/hooks/praman-evidence-gate.json`
  - [x] 4.4 Add `tests/kiroGate.test.ts` for the six error-handling rows (7 tests; full suite 197/29 files)
  - [x] 4.5 Proven in Kiro CLI V3 (session `sess_1654a697-a525-4e8a-8bce-29ce588d1b68`): rejected a stop on a failing declaration, released it after the fix. IDE Stop behavior still untested
  - _Requirements: 3.1–3.8_

- [ ] 5. Package the Power
  - [ ] 5.1 Write `kiro-power/plugin.json`, `kiro-power/mcp.json` (`${PRAMAN_HOME}`)
  - [ ] 5.2 Write `kiro-power/skills/praman-verify/SKILL.md`
  - [ ] 5.3 Install with `kiro-cli powers install ./kiro-power` in a different scratch project and run one acceptance check through it
  - _Requirements: 4.1–4.4_

- [ ] 6. Refresh agent and steering
  - [ ] 6.1 Update `praman-explorer.md` frontmatter (selectors, resources, MCP)
  - [ ] 6.2 Add `video.md` (fileMatch) and `declarations.md` (auto) steering
  - [ ] 6.3 Apply the owner decision on `kiro-crew/`
  - _Requirements: 5.1–5.4_

- [ ] 7. Record evidence
  - [ ] 7.1 One CLI V3 and one IDE session showing the gate blocking on a mismatch and releasing after a fix
  - [ ] 7.2 Update `docs/kiro-usage.md`, `.kiro/specs/praman-core/tasks.md` and `docs/STATUS.md` with observed results and limits
  - _Requirements: 6.1, 6.2_

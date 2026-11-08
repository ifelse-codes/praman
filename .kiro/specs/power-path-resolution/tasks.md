# Tasks: Power path resolution

Scope trimmed 2026-11-08 (owner): only `PRAMAN_RELATIVE_PATHS=reject` in the Power;
`PRAMAN_WORKSPACE` and client roots deferred; ordinary unit tests, no property tests.

- [x] 1. Reproduce and scope
  - [x] 1.1 Probe what Kiro gives a Power MCP server (2026-11-08, `sess_bf2efd93…`: cwd = installed Power, no `roots`, `PWD` inherited)
  - [x] 1.2 Test showing that, without the variable, a relative `outDir` writes evidence under the server's cwd (`tests/mcpPaths.test.ts`, unchanged-default case)
  - _Bugfix: Current 1–3_

- [x] 2. Implement `src/mcp/paths.ts` and the `server.tool` wrapper; startup validation
  - _Bugfix: Expected 1, 2, 4_

- [x] 3. Unit tests `tests/mcpPaths.test.ts` (see design)
  - _Bugfix: Expected 1, 2, 4; Unchanged 1, 2_

- [x] 4. Power: `env.PRAMAN_RELATIVE_PATHS=reject` in `kiro-power/mcp.json`; skill and READMEs; reinstall
  - _Bugfix: Expected 3_

- [x] 5. Verify
  - [x] 5.1 Lint, test typecheck, full suite (206 tests / 30 files after task 7), first-use 12/12
  - [x] 5.2 Kiro (`sess_055fb96f…`): relative paths refused naming `specPath`, `outDir`; no new files in the installed Power; absolute paths → `passed`
  - _Bugfix: Unchanged 1–5_

- [x] 7. Review follow-up (owner, 2026-11-08): reproduced the `praman_environment` default `baseDir` inside the server directory; reject mode now requires `baseDir` (2 tests). Speech-cache default documented as a known limit

- [ ] 6. Document: README, CHANGELOG, STATUS, kiro-usage (done locally). PR only after owner yes (identity check per `.kiro/steering/publishing.md`)

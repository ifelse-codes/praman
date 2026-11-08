# Tasks: Power path resolution

- [ ] 1. Reproduce and scope
  - [x] 1.1 Probe what Kiro gives a Power MCP server (2026-11-08, `sess_bf2efd93…`: cwd = installed Power, no `roots`, `PWD` inherited)
  - [ ] 1.2 Failing tests: relative `specPath` resolves into the server cwd; absolute spec + relative `outDir` writes evidence under the server cwd; inline-scenario relative identity path
  - _Bugfix: Current 1–3_

- [ ] 2. Property tests P1–P4 (fast-check, dev dependency needs owner approval); confirm P1/P2 fail first
  - _Design: correctness properties_

- [ ] 3. Implement `src/mcp/paths.ts` and route every MCP path argument through it
  - [ ] 3.1 `resolvePathBase` with precedence reject > workspace > single root > cwd
  - [ ] 3.2 `resolveArg` and the `insufficient_evidence` tool error
  - [ ] 3.3 Startup validation of both variables
  - _Bugfix: Expected 1–4, 6_

- [ ] 4. Power: `env.PRAMAN_RELATIVE_PATHS=reject` in `kiro-power/mcp.json`; update skill and READMEs; reinstall
  - _Bugfix: Expected 5_

- [ ] 5. Verify
  - [ ] 5.1 Full suite, lint, first-use 12/12
  - [ ] 5.2 Kiro: Power relative path → one clear error, then `passed`; nothing written into the installed Power
  - [ ] 5.3 Kiro: workspace MCP relative paths still `passed`
  - _Bugfix: Unchanged 1–5_

- [ ] 6. Document: README MCP section, CHANGELOG, STATUS, kiro-usage; small PR (identity check per `.kiro/steering/publishing.md`)

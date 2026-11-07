# Design: Kiro evidence gate

## Overview

Kiro supplies the agent loop, specs and hooks; PRAMAN supplies the verdict. The gate
connects them without changing PRAMAN core: hooks and the Power call the compiled CLI
and stdio MCP server that already pass the 12-outcome judge route.

```
Kiro agent turn ──► edits files ──► PostFileSave hook ──► npm run lint
      │
      ├──► praman_* MCP tools (.kiro/settings/mcp.json or Power mcp.json)
      │
      └──► Stop hook ──► kiro-power/scripts/praman-gate.mjs
                              │ reads praman-gate.json (opt-in)
                              ├─► node dist/cli.js command-verify  … -o .praman/gate/<run>/<i>
                              ├─► node dist/cli.js scenario-verify … -o .praman/gate/<run>/<i>
                              └─► all passed → exit 0
                                  any non-pass → stderr safe feedback, "continue" exit
                                  bound reached → exit 0 + "not proven" summary
```

## Components

| Asset | Path | Notes |
| --- | --- | --- |
| Workspace MCP config | `.kiro/settings/mcp.json` | `{"mcpServers":{"praman":{"command":"node","args":["dist/cli.js","mcp"],"autoApprove":[]}}}`. Spike: confirm the server's working directory is the workspace root in CLI V3 and IDE; otherwise use `${PWD}`-style interpolation or an absolute path documented per user. |
| Lint hook | `.kiro/hooks/praman-lint-on-save.json` | `{"version":"v1","hooks":[{"name":"praman-lint-on-save","trigger":"PostFileSave","matcher":"^(.*/)?src/.*\\.ts$","action":{"type":"command","command":"npm run lint"},"timeout":120}]}`. Replaces `on-save-review.json`. |
| Gate hook | `.kiro/hooks/praman-evidence-gate.json` | Trigger `Stop`, command `node kiro-power/scripts/praman-gate.mjs`, timeout sized to the declared deadlines. |
| Gate script | `kiro-power/scripts/praman-gate.mjs` | Plain Node ESM, no dependencies beyond Node; spawns the CLI; never imports `src/`. Shipped with the Power so other projects can copy the hook. |
| Gate config | `praman-gate.json` (caller-owned, optional) | `{"declarations":[{"kind":"command","path":"…"},{"kind":"browser","path":"…"}],"maxExtraTurns":3}`. Strict validation; unknown keys rejected. |
| Power | `kiro-power/plugin.json`, `kiro-power/mcp.json`, `kiro-power/skills/praman-verify/SKILL.md` | `mcp.json` runs `node ${PRAMAN_HOME}/dist/cli.js mcp`. Powers bundle skills and MCP only, so hooks are documented copy-in assets, not part of the Power. |
| Agent | `.kiro/agents/praman-explorer.md` | Frontmatter: `tools: ["read","write","shell","@praman"]`, `resources: ["file://.kiro/steering/**/*.md","file://docs/schema-cheatsheet.md"]`, `mcpServers` → praman. |
| Steering | `.kiro/steering/video.md` (`fileMatch`), `.kiro/steering/declarations.md` (`auto`) | File references only; no duplicated rule text. |

## Exit-code contract (to confirm in the spike)

kiro.dev documents that in CLI V3 a `Stop` command hook exiting 1 (or exit 0 with
`{"decision":"block"}`) starts another agent turn. IDE Stop-hook semantics may differ
(`confirm` exists for Stop command hooks). Task 1 records the observed behavior on both
surfaces before the script hard-codes a code. If the IDE cannot continue a turn, the
gate still prints the safe summary there and the write-up says so.

## Turn bound

The script stores `{sessionId, consecutiveNonPass}` in `.praman/gate/state.json`. The
session identifier comes from the hook's stdin JSON if present (spike confirms the
field); otherwise the counter is keyed by the hook process's parent session marker and
resets after an all-pass run. When `consecutiveNonPass >= maxExtraTurns` the script
exits 0 with a "not proven after N attempts" summary, so Kiro stops instead of looping.

## Error handling

| Condition | Gate behavior |
| --- | --- |
| No gate file | exit 0, no output |
| Malformed gate file / unknown keys | non-pass ("gate configuration invalid"), counts toward bound |
| Declaration path missing | `insufficient_evidence` ("not proven"), never passed |
| CLI exit 1 | `failed`, failing check indexes from `feedback.json` |
| CLI exit 2 / signal / timeout | `insufficient_evidence`, "not proven" |
| `dist/cli.js` missing | non-pass with "run npm run build" |

## Boundaries

- No change to `src/`, schemas, CLI or MCP dispatch. If the spike shows a core change is
  needed, stop and write a separate spec.
- No application names, selectors or credentials in any asset.
- Evidence stays under ignored `.praman/`.
- Trusted execution only; the gate runs whatever the caller declared.

## Testing strategy

- Vitest suite `tests/kiroGate.test.ts` spawns the gate script against isolated
  fixtures: no gate file, all pass, one mismatch, one unavailable, malformed config,
  bound reached. Deterministic; uses the same Node one-liner fixtures as first use.
- JSON validation test for every `.kiro/hooks/*.json`, `.kiro/settings/mcp.json` and
  `kiro-power/plugin.json` against the documented shapes.
- Manual, recorded: a Kiro CLI V3 session where the gate blocks a stop on a deliberate
  mismatch and releases after the fix; the same in the IDE. Session IDs go into
  `docs/kiro-usage.md`.

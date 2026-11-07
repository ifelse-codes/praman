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

**Spike 1.1 result, CLI V3 headless (2026-11-07, session
`sess_2bee93f1-dd5d-49eb-8fe0-9673427faf8b`):**

- Stop-hook stdin is `{"session_id", "hook_event_name": "Stop", "cwd"}`; `cwd` is the
  workspace root, so relative paths work.
- Exit 1 continued the turn: the agent answered `FIRST`, the hook exited 1 with an
  instruction on stderr, and the agent then answered `CONTINUED`, a word that appeared
  only in that stderr. `runFinished.finalText` was `FIRSTCONTINUED`.
- The continuation stays inside the same turn (one `turn_start`/`turn_end`).
- The hook was **not** invoked again when the continued response stopped (one
  invocation recorded, counter file = 1). So after one rejection the agent can end the
  turn without a re-check. The gate must therefore re-verify on the next turn's Stop
  and must not treat "no second invocation" as a pass.
- Kiro records the invocation as `completed` regardless of exit code and stores
  neither stderr nor exit code.
- IDE behavior: not yet tested.

**Feedback channel finding (CLI V3 and IDE, 2026-11-07):** `PostFileSave` hooks fire on
agent writes on both surfaces (`ContextualHookInvoked … completed` about 0.9 s after the
write), but their output and exit code never reach the agent; after a deliberate type
error the IDE agent said it had not run a type check. The Stop hook is the channel
that does feed back: its stderr reached the agent and exit 1 continued the turn. So the
gate is a Stop hook, and requirement 2.3 ("show its result in the session") is recorded
as not achievable with save hooks; the lint hook stays as a background check only.

**CLI exit codes are not proof.** `command-verify` on a missing declaration crashes with
an uncaught `ENOENT` and exits 1, the same code as an observed mismatch. The gate
therefore reads `proof.json` and `feedback.json` and treats the declaration as passed
only when the CLI exits 0 **and** both files say `passed`. Any disagreement or missing
file is `insufficient_evidence`. (The crash exit code is a small CLI defect to fix in a
separate bugfix spec, not here.)

## Turn bound

The script stores `{sessionId, consecutiveNonPass}` in `.praman/gate-state.json` (beside
the run tree, so a damaged `.praman/gate/` is still counted). The
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

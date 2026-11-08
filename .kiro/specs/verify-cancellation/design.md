# Design: cancellation for verification entry points

## Root cause

Cancellation exists only for campaigns. The shared command executor owns each declared
command's process group but has no way to learn that its caller is going away, so a
signal ends the Node process while the detached group survives.

## Fix

1. `executeCommand(…, signal?: AbortSignal)`: on abort, send SIGTERM to `-pid`, wait up to
   a fixed grace (proposed 2 s), then SIGKILL; mark the run `interrupted`; remove the abort
   listener when the child closes. Reuse `stopGroup`.
2. `proveCommands(specPath, out, signal?)`: check `signal.aborted` before each repeat and
   baseline run; on abort, write proof/feedback with `insufficient_evidence` and reason
   `interrupted`, then return.
3. Browser path (`src/eval/change.ts`): if task 1 shows the browser or a page survives,
   close the context/browser on abort and apply rule 2–3.
4. CLI: generalize `withCampaignStop` into one `withStop` helper; wrap `command-verify`,
   `scenario-verify` and other affected commands; after the operation returns, exit 130 or
   143 depending on the received signal.
5. MCP: pass `extra.signal` into the same functions; on transport close, abort all
   in-flight operations before the server exits.

No schema change and no new CLI/MCP tool. The `interrupted` reason is an evidence
classification string, not a new verdict.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Make spawned commands non-detached so they die with the parent | Loses the process-group kill used for descendants and deadlines; SIGKILL of the parent still orphans grandchildren |
| A watchdog process per run | Extra moving part; same result as an abort signal for in-process callers |
| Exit 2 on interrupt | Conflates "verification completed without evidence" with "user stopped it"; shells expect 130/143 |

## Correctness properties

Owner decision 2026-11-08: covered by deterministic tests, not `fast-check` and not the
Kiro IDE. The mapping to tests is in `tasks.md` task 2.

- **P1 No orphan:** for any abort delay in [0, run duration] and any repeats in [2, 10],
  after the verification promise settles no process in any owned group is alive.
  _Expected 1, 5_
- **P2 Never green when interrupted:** for any abort point, the recorded verdict is not
  `passed`. _Expected 3_
- **P3 No repeat after abort:** for any abort point, the number of started runs is at most
  the index of the run active at abort + 1. _Expected 2_
- **P4 Unchanged when not aborted:** for generated declarations (exit code, stdout value,
  check operator, repeats), the verdict with a never-aborted signal equals the verdict
  with no signal. _Unchanged 1_
- **P5 Missing evidence never passes:** for any generated declaration whose executable is
  missing or whose declared identity input is missing, the verdict is
  `insufficient_evidence`. _Unchanged 1, product principle_

Properties use short real `node -e` commands; process checks use `process.kill(-pid, 0)`
on the owned process group.

## PRAMAN proves its own fix (repair mode)

`examples/self-check/cancellation/commands.json` (app-independent, PRAMAN is the target):

- `before`: a probe harness run against a build of historical commit `39c0fa2` in a temp
  worktree; `current`: the same harness against the fixed build.
- The harness starts `command-verify` on a sleeping command, sends SIGINT, waits, and
  prints `orphan: yes` or `orphan: no`.
- `mode: "repair"`, `baselineKind: "historical"`, `regressionCheck: "no-orphan"`,
  check `stdout equals "orphan: no\n"`, `repeats: 3`.
- Evidence under ignored `.praman/self-check/`. A video may later use this proof only
  with owner authorization.

## Testing strategy

- Unit/integration: `tests/cancellation.test.ts` with P1–P5 plus one deterministic case per
  entry point found affected in task 1.
- Full suite and `node examples/first-use/run.mjs` must still pass unchanged.
- CI: unchanged worker settings; no randomized runs, so results stay deterministic on
  loaded runners.

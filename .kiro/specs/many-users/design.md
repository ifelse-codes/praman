# Design: Many users and invariants

- Reuse: Playwright. Each user is one ordinary `executeScenario` call (own browser, own
  context), all started together with `Promise.all`. No new engine.
- Schema (`src/case/change.ts`): optional `users` object `{ count, staggerMs?, syncAtStep?,
  after?, invariants? }`. `syncAtStep` is resolved in `resolveStepRefs`; refinements apply
  the refusals of requirement 1.5 and 2.2. `count` invariants take
  `equals: int | { perUser, plus? }`; other kinds reuse `checkSchema` unchanged.
- Per-user spec (`src/eval/users.ts`): replace `{user}`/`{user1}` in the parsed
  declaration's JSON, drop `users`, and for user 0 append `users.after` as extra steps and
  the invariants as checks with ids `$invariant:<id>` and `afterStep` = the last extra step
  (`count` scale resolved to a number).
- Coordination: a small barrier object. `ScenarioOptions.beforeStep` waits at the barrier
  at `syncAtStep`, and user 0 waits at the first extra step until all other users have
  ended. A user that ends (any reason) leaves every barrier, so no one waits for a dead
  user; a wait over 60 s throws (that user is `insufficient_evidence`). Active time of
  user k = from its first `beforeStep` to the end of `executeScenario`; peak concurrency
  is the maximum overlap of those intervals.
- Aggregation: `proveChange` runs `executeUsers` for each repeat. The repeat's
  `ScenarioRun` has `users: UserRun[]`, `invariants`, `peakConcurrency`; its `checks` are
  the merged rows (requirement 3.3) and its verdict follows 3.2. `assessProof` validates
  each user run exactly like a single run (identity, coverage, screenshots) plus the
  invariants and the concurrency floor, so an incomplete user or observation never passes.
- Feedback (`src/review/feedback.ts`): when a run has `users`, add issue lines with the
  per-user verdicts and invariant verdicts (ids are private declaration fields, so the
  lines use indexes).
- Manager: `verify` adds `usersSummary` (last field) from the proof.
- CLI/MCP: no new commands; `scenario-verify`, `environment verify` and the MCP tools
  accept the new field through the existing schema.
- Limits: all users share one machine and one environment copy; users are separate
  browsers, not separate network hosts; `syncAtStep` aligns step starts, it does not make
  server arrival simultaneous; invariants observe through the first user's session; `count`
  is the only scalable invariant.

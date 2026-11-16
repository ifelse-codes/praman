# Requirements: honest coverage

Owner request 2026-11-16: do items 1 to 5 of the "honest coverage" plan in
`docs/ROADMAP.md` ("Found 2026-11-15"), one by one. Cause: an OpenCode run got 34
`passed` verdicts from one thin, unchanged command declaration while the app it built
crashed three times. Every item is application-independent. A declaration that does not
use a new field keeps its meaning, verdict and hash.

## R1. The agent skill does not let a thin test stand for "done"

- R1.1 `skills/praman/SKILL.md` and the Power's `praman-verify` skill tell the agent to:
  list the user's requirements and map each to a check, naming the ones with no check;
  load the page with `scenario-verify` after a web page change; add a check that
  exercises each new change; treat a re-run of an unchanged declaration as no proof of
  a new fix; report "passed N checks covering X of Y requirements", never "complete";
  never weaken a stated project rule to make a flow finish (stop and ask).
- R1.2 Proof: a headless non-Kiro agent, given a fixture app with a broken page and a
  thin declaration, does not report the work as done.

## R2. The verdict shows requirement coverage

- R2.1 Command and browser declarations accept an optional `requirements` list: each
  entry has an `id`, a `text` and the `checks` (check ids) that exercise it. Command
  declarations may name `$exit`; browser declarations may name invariant ids.
- R2.2 An unknown or ambiguous check id, or a duplicate requirement id, is rejected
  before anything runs.
- R2.3 A requirement with no check makes a run that would pass `insufficient_evidence`;
  a failed run stays `failed`.
- R2.4 The result, `proof.json`, `feedback.json`, `REPORT.md`, `REPORT.html`, the
  `--summary` text and MCP results show "X of Y requirements have a check" and each
  requirement's status (`passed`, `failed`, `insufficient_evidence`, `untested`).
- R2.5 Without the list, the verdict is unchanged and the summary and reports say that
  requirements were not declared.

## R3. The report shows what was checked

- R3.1 `REPORT.md`, `REPORT.html`, `feedback.json`, diagnostics and MCP results show the
  authored check ids and one plain line per check (its kind, and for command checks the
  source and operator).
- R3.2 Expected values, selectors, paths, application text and secrets stay private as
  before.

## R4. A repeat of an earlier run is marked

- R4.1 `proof.json` records an `inputsHash` over the declaration hash, the declared
  identity hashes, the target identity (R5) and managed source hashes.
- R4.2 When an earlier run in a sibling folder of the same parent has the same
  `inputsHash`, the result, summary, `feedback.json`, `REPORT.md`, `REPORT.html` and MCP
  result carry a note that the run proves nothing new, and the earlier run's folder.
- R4.3 The note never changes the verdict.

## R5. The app under test can be identified

- R5.1 Command and browser declarations accept an optional `target`: a trusted command
  (for example `git rev-parse HEAD`) whose output identifies the version under test.
- R5.2 PRAMAN runs it before every current run and once after the last; a failed or
  empty reading, or a value that changes, makes the run `insufficient_evidence`.
- R5.3 The summary and reports print "App under test: <short value>" next to
  "Identity", or "App under test: not identified" when no `target` is declared; the
  existing identity line says it covers the runner, browser and declared files.

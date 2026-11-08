# Requirements: agent diagnostics (gaps 1 and 5)

Spec type: feature (requirements-first). Source: the opencode/Lattice session of
2026-11-06 (`.praman-brainstorm/session-findings.md`, outside this repository). Applies to
every agent and the CLI; no client-specific behavior.

## Introduction

When a browser step fails before a check runs, the summary and `REPORT.md` say only
`execution_unavailable: current run 1 step[25]` and point to a private file. In the
Lattice session the real cause, a Playwright strict-mode violation (the selector matched
12 elements), was in `after-1/result.json`, but the agent did not find it and spent two
full runs and a manual reproduction on it. `REPORT.md` also lists each check in its own
section with no overview table, so an agent must read 17 sections to see which failed.

Privacy rule (unchanged): selectors, expected values, observed values, URLs and raw error
text stay in private evidence. A diagnosis may print a fixed category and counts only.

## Requirement 1: Classified execution failures

**User story:** As a coding agent, I want the summary to say what kind of failure stopped a
run, so I can fix the declaration without opening private files.

1.1 WHEN a step or check fails with a Playwright strict-mode violation, THE SYSTEM SHALL
classify it as `locator_ambiguous` and include the number of matched elements.
1.2 WHEN a step or check times out waiting for an element, THE SYSTEM SHALL classify it as
`locator_timeout` and include the awaited state and the timeout in milliseconds.
1.3 WHEN navigation fails or ends on another origin, THE SYSTEM SHALL classify it as
`navigation_failed`.
1.4 WHEN the browser or page closes or crashes, THE SYSTEM SHALL classify it as
`browser_closed`.
1.5 IF an error matches no known pattern, THEN THE SYSTEM SHALL classify it as `unknown`
and keep today's generic next action.
1.6 THE SYSTEM SHALL show the class, the step or check index, and a class-specific next
action in `--summary` output, `feedback.json`, `REPORT.md` and MCP results.
1.7 THE SYSTEM SHALL NOT print selector text, URLs, expected or observed values, or the raw
error message in any of those outputs.
1.8 THE classification SHALL NOT change any verdict or exit code.

## Requirement 2: Pass/fail table in the report

**User story:** As an agent or developer, I want one table of all checks, so I can see the
result in one look.

2.1 THE `REPORT.md` SHALL start its findings with a table: check index, check kind,
checkpoint (step), verdict per repeat, and diagnosis class when one exists.
2.2 THE table SHALL use check indexes, not check IDs (IDs are private today).
2.3 THE existing per-check sections SHALL remain after the table.
2.4 THE command report SHALL get the same table (exit, stdout, stderr, artifact checks).

## Non-goals

No raw-output or "verbose" disclosure mode. No change to proof gates or verdicts.

# Requirements: PRAMAN Core

Rewritten in EARS form on 2026-11-09 (spec `submission-story` task 1.3). Scope is the
current release; it describes delivered behavior, not plans.

## Introduction

AI agents generate large amounts of code that humans no longer inspect line by line.
A successful build and passing unit tests do not prove that the software does what was
asked. PRAMAN gives existing coding agents a way to run declared checks against the real
software, observe what actually happens, and receive evidence-backed feedback they can
act on. PRAMAN does not generate or repair application code.

## Requirement 1: Browser verification

**User story:** As a coding agent, I want to run an authored browser scenario against the
real application, so I can see whether the declared requirements hold.

1.1 WHEN a valid scenario is submitted, THE SYSTEM SHALL execute its steps in real
headless Chromium in 2–10 fresh browser sessions and evaluate every declared check in
each session.
1.2 THE SYSTEM SHALL record a screenshot per check, network requests and page errors as
private evidence.
1.3 THE SYSTEM SHALL support the actions `goto`, `waitForURL`, `click`, `dblclick`,
`hover`, `waitFor` (state or exact count), `fill`, `type`, `press`, `selectOption`,
`scroll`, `drag` and `upload`, and the check kinds `text`, `value`, `visible`, `count`,
`attribute`, `class`, `state`, `json`, `pageErrors`, `image` and `network`.
1.4 WHERE a step has an `id`, THE SYSTEM SHALL let checks and story beats reference it
instead of an index, and SHALL reject unknown or duplicate ids before execution.
1.5 IF a scenario is invalid, THEN THE SYSTEM SHALL reject it before any action runs.

## Requirement 2: Command verification

**User story:** As a coding agent, I want to run a trusted local command with explicit
expectations, so I can verify CLI and build behavior.

2.1 WHEN a command declaration is submitted, THE SYSTEM SHALL run the declared executable
in fresh repeats and compare the exit code, stdout, stderr and bounded artifacts with the
declared expectations.
2.2 THE SYSTEM SHALL record the resolved executable and declared input identities, and
SHALL NOT pass a run whose identities are unavailable or change during execution.
2.3 WHEN verification is interrupted (Ctrl-C, SIGTERM, MCP cancel), THE SYSTEM SHALL stop
the process group it started, start no further runs and record the run as not proven.

## Requirement 3: Verification modes

3.1 THE SYSTEM SHALL support `acceptance` (current version only), `repair` (declared
historical baseline plus a named regression) and `comparison` (explicitly attributed
baseline).
3.2 WHEN mode is `repair`, THE SYSTEM SHALL pass only if the named check fails on the
baseline, all other baseline checks pass and every repeated current check passes.

## Requirement 4: Honest verdicts

4.1 THE SYSTEM SHALL return exactly one of `passed`, `failed` or `insufficient_evidence`.
4.2 IF execution or evidence is missing or incomplete, THEN THE SYSTEM SHALL return
`insufficient_evidence` and SHALL NOT return `passed`.
4.3 THE CLI SHALL exit 0, 1 or 2 for those verdicts, and the MCP server SHALL set
`isError` on any verdict other than `passed`.

## Requirement 5: Evidence and feedback

5.1 THE SYSTEM SHALL write a private run directory with the declaration, `proof.json`,
`feedback.json`, `REPORT.md`, per-run results and captured evidence.
5.2 THE `REPORT.md` SHALL start with a pass/fail table of all checks.
5.3 WHEN a browser step or check cannot run, THE SYSTEM SHALL name the failure kind and
safe counts (for example `locator_ambiguous (3 elements)`) and a matching next action.
5.4 THE safe outputs (CLI summary, `feedback.json`, `REPORT.md`, MCP results) SHALL NOT
contain selectors, URLs, expected or observed text values, step ids, typed inputs or raw
error text.

## Requirement 6: Interfaces

6.1 THE SYSTEM SHALL expose its capabilities through a CLI (16 commands) and a stdio MCP
server (14 `praman_*` tools).
6.2 WHERE `PRAMAN_RELATIVE_PATHS=reject` is set, THE MCP server SHALL refuse relative
path arguments before anything runs.

## Requirement 7: Managed environments and presentation (frozen surfaces)

7.1 THE SYSTEM SHALL provide a declaration-selected kind/Docker lifecycle (create,
observe, workload, fault, recover, reset, verify, demonstrate, destroy).
7.2 THE SYSTEM SHALL record a narrated walkthrough only after fresh proof and matching
live replays; a walkthrough SHALL NOT be required for, or substitute for, verification.

## Requirement 8: Kiro integration

8.1 THE repository SHALL ship `/.kiro` specs, steering, hooks, a custom agent, workspace
MCP wiring and an installable Kiro Power (`kiro-power/`), each exercised in a recorded
Kiro session (see `docs/kiro-usage.md`).
8.2 WHERE the owner opts in with `praman-gate.json`, THE `Stop` hook SHALL re-run the
declared checks when the agent finishes and SHALL send the agent back on a failing or
unproven verdict.

## Non-functional requirements

- No false green: unavailable execution and incomplete evidence stay explicit.
- Raw evidence is private and not publication-safe.
- Trusted local execution only: PRAMAN is not a sandbox and does not discover
  requirements on its own.
- Same-host setup is reproducible; validation on other platforms is documented, not
  assumed.

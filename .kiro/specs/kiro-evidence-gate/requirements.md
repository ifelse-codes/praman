# Requirements: Kiro evidence gate (PRAMAN as a Kiro-native capability)

Spec type: feature (requirements-first). Ranked #1 for score impact (Technological
Implementation: depth and variety of Kiro use; removes the "insufficient use of Kiro"
disqualification risk).

## Introduction

PRAMAN is an MCP server for coding agents, yet the repository does not connect it to
Kiro. Observed on 2026-11-07:

- No `.kiro/settings/mcp.json` exists, so Kiro cannot call any `praman_*` tool.
- `.kiro/hooks/on-save-review.json` uses an object `trigger` with a glob `pattern`
  and no `version`/`hooks` array. Per the kiro.dev hooks reference it is not a valid
  hook file for the IDE or CLI V3, so it never runs.
- `.kiro/agents/praman-explorer.md` declares `tools: ["bash", ...]`; `bash` is not a
  documented tool selector (`shell` is) and the agent has no steering resources.
- `kiro-crew/` references `praman verify` / `praman_verify`, which were removed on
  2026-11-05.

This feature makes PRAMAN the evidence gate for Kiro work: Kiro agents call PRAMAN
over MCP, a Stop hook refuses to end a turn while declared evidence is failing, and
PRAMAN ships as an installable Kiro Power. All assets stay application-independent:
no target names, selectors, routes or credentials.

## Requirement 1: MCP wiring

**User story:** As a Kiro user in a PRAMAN checkout, I want the PRAMAN tools available
in my Kiro session, so the agent can verify its work without leaving Kiro.

1.1 WHEN the workspace is opened in Kiro CLI V3 or Kiro IDE after `npm run build`,
THE SYSTEM SHALL expose all 14 `praman_*` tools through `.kiro/settings/mcp.json`.
1.2 WHEN `dist/cli.js` is missing, THE SYSTEM SHALL make the startup failure visible
(`kiro-cli chat --require-mcp-startup` exits non-zero) rather than silently omit tools.
1.3 THE SYSTEM SHALL NOT auto-approve any `praman_*` tool, because every tool executes
trusted local commands or browsers with the user's authority.

## Requirement 2: Valid hooks

**User story:** As a contributor, I want the repository's hooks to actually load, so the
`.kiro` directory is working configuration rather than decoration.

2.1 THE SYSTEM SHALL replace `on-save-review.json` with a `version: "v1"` hook file
using trigger `PostFileSave`, a regex `matcher` for `src/**/*.ts`, and `npm run lint`.
2.2 WHEN Kiro CLI V3 and Kiro IDE load the workspace, THE SYSTEM SHALL load every file
in `.kiro/hooks/` without a schema error.
2.3 WHEN the agent edits a file under `src/`, THE SYSTEM SHALL run the lint hook and
show its result in the session.

## Requirement 3: Stop-hook evidence gate

**User story:** As a developer using a Kiro agent, I want the agent unable to declare a
turn finished while my declared PRAMAN checks fail, so "done" means "proven".

3.1 IF no gate file (`praman-gate.json`) exists in the workspace root, THEN THE SYSTEM
SHALL exit 0 without output (the gate is opt-in).
3.2 WHEN the agent turn stops AND the gate file lists declarations, THE SYSTEM SHALL run
each declaration through the existing `command-verify` or `scenario-verify` CLI into a
fresh directory under `.praman/gate/`.
3.3 IF every verdict is `passed`, THEN THE SYSTEM SHALL exit 0 and print one line per
declaration with its verdict and `REPORT.md` path.
3.4 IF any verdict is `failed` or `insufficient_evidence`, THEN THE SYSTEM SHALL exit
with the code that makes Kiro start another agent turn, and SHALL write safe feedback
(verdict, failing check indexes, report path) to stderr.
3.5 THE SYSTEM SHALL label `insufficient_evidence` as "not proven" and SHALL NEVER
report it, a malformed declaration, or a missing gate target as passed.
3.6 WHEN the gate has requested the configured maximum of consecutive extra turns
(default 3, allowed 1–10) in one session, THE SYSTEM SHALL stop requesting turns and
print a final "not proven" summary, so the loop is bounded.
3.7 THE SYSTEM SHALL NOT print raw arguments, environment, stdout, stderr or assertion
values; it reuses PRAMAN's safe feedback.
3.8 THE SYSTEM SHALL invoke PRAMAN only through its public CLI; it SHALL NOT import or
modify core modules or add an application-specific branch.

## Requirement 4: Installable Kiro Power

**User story:** As a Kiro user in any project, I want to install PRAMAN as a Power, so
Kiro loads PRAMAN's tools and authoring guidance only when I ask for verification.

4.1 THE SYSTEM SHALL ship a Power in `kiro-power/` with `plugin.json` (`$schema`,
`name`, `version`, `description`, `author.name`, `keywords`), `mcp.json` and
`skills/praman-verify/SKILL.md`.
4.2 WHEN installed with `kiro-cli powers install ./kiro-power`, THE SYSTEM SHALL
activate on verification keywords and expose the `praman_*` tools.
4.3 THE SYSTEM SHALL locate the PRAMAN build through a `PRAMAN_HOME` environment
variable, and IF it is unset or invalid, THEN MCP startup SHALL fail visibly.
4.4 THE skill SHALL teach the three modes, the 0/1/2 outcomes, fresh output
directories and the missing-evidence rule, linking `docs/schema-cheatsheet.md`.

## Requirement 5: Agent and steering refresh

**User story:** As a Kiro user, I want a selectable PRAMAN agent and focused steering,
so verification work follows the product rules without me restating them.

5.1 THE `praman-explorer` agent SHALL use documented tool selectors, include the
steering files as resources, attach the PRAMAN MCP server, and be selectable with
`kiro-cli --agent praman-explorer`.
5.2 THE SYSTEM SHALL add a `fileMatch` steering file for `docs/video-*.md` and
`src/report/**` that includes `#[[file:docs/video-guidelines.md]]`.
5.3 THE SYSTEM SHALL add an `auto` steering file for authoring PRAMAN declarations that
includes `#[[file:docs/schema-cheatsheet.md]]`.
5.4 THE `kiro-crew/` stub SHALL either be corrected to current tool names or removed,
per the owner's decision; it SHALL NOT reference removed tools.

## Requirement 6: Usage evidence

6.1 THE SYSTEM SHALL implement every task in this spec inside a recorded Kiro session
and record the session ID, date and task numbers in `docs/kiro-usage.md`.
6.2 THE SYSTEM SHALL record which assets were verified in the CLI, which in the IDE, and
which were not exercised.

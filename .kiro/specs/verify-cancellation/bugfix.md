# Bugfix: interrupted verification leaves the declared command running

Spec type: bugfix. Ranked #2 for score impact. It gives the submission a real,
application-independent PRAMAN defect that Kiro fixes through its bugfix-spec workflow,
with property-based tests, and that PRAMAN proves fixed in `repair` mode. It is also the
"real failure → fix → same workflow working" story the video standard requires.

## Reproduction (observed 2026-11-07)

Public HEAD `39c0fa2`, fresh clone, macOS arm64, Node 26.0.0. Declaration: acceptance,
`current` = `node -e` script that writes its PID and sleeps 20 s, `deadlineMs` 30000.

1. `node dist/cli.js command-verify cmd.json -o out --summary &`
2. After 2 s, send SIGINT to the CLI process.
3. Result: the CLI exited with code 130; the declared command (its own process group)
   was still alive 1 s later and had to be killed by hand.

Code path: `withCampaignStop` in `src/cli.ts` wraps only campaign commands.
`executeCommand` in `src/eval/command.ts` spawns `detached: true` and kills the group on
deadline or completion, but takes no abort signal, and the deadline timer dies with the
parent. `praman_command_verify` in `src/mcp/server.ts` ignores `extra.signal`.
Not yet observed: the same behavior for `scenario-verify`, `workflow-replay`, MCP request
cancellation, or MCP transport close. Task 1 checks each one.

## Current behavior

1. WHEN `command-verify` receives SIGINT or SIGTERM while a declared command runs, THEN
   the CLI exits and the declared command's process group keeps running.
2. WHEN the CLI exits early, THEN the declared `deadlineMs` is no longer enforced for the
   orphaned command.
3. WHEN an MCP client cancels a `praman_command_verify` request, THEN the server does not
   stop the declared command (to be confirmed in task 1).

## Expected behavior

1. WHEN `command-verify` receives SIGINT or SIGTERM, THEN the system SHALL terminate every
   owned process group (SIGTERM, then SIGKILL after a bounded grace period) before exit.
2. WHEN verification is interrupted, THEN the system SHALL start no further repeats.
3. WHEN verification is interrupted, THEN the system SHALL record `insufficient_evidence`
   with an "interrupted" reason in `proof.json`/`feedback.json` and SHALL NEVER record
   `passed`.
4. WHEN interrupted by a signal, THEN the CLI SHALL exit 130 (SIGINT) or 143 (SIGTERM)
   after cleanup and evidence writing.
5. WHEN an MCP client cancels a verification request or the stdio transport closes, THEN
   the server SHALL apply the same termination and evidence rules.
6. THE same rules SHALL apply to every other entry point that runs declared commands or
   browsers and is found affected in task 1.

## Unchanged behavior

1. WHEN verification is not interrupted, THEN the system SHALL CONTINUE TO produce the
   same verdicts, exit codes 0/1/2, MCP `isError` values and evidence layout.
2. WHEN a deadline expires, THEN the system SHALL CONTINUE TO kill the group and return
   `insufficient_evidence`.
3. WHEN a campaign is stopped, THEN the system SHALL CONTINUE TO use the existing campaign
   stop behavior.
4. THE system SHALL CONTINUE TO pass the full suite (190 tests / 28 files) and the
   12/12 first-use route.
5. THE system SHALL CONTINUE TO treat processes that escape their process group as
   outside its ownership boundary (documented limit, not fixed here).

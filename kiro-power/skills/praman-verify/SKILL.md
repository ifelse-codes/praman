---
name: praman-verify
description: Verify AI-generated software with PRAMAN by authoring a command or browser declaration, running it through the praman MCP tools, and reporting evidence-backed verdicts
---

# Verify with PRAMAN

PRAMAN runs checks you declare against the real software and returns one of three
verdicts. It does not write or fix code, and it is not a sandbox: declared commands
and browser actions run with the user's authority.

## Prerequisites

- A PRAMAN checkout built with `npm ci && npm run build`, and `PRAMAN_HOME` set to
  that checkout before Kiro starts. If the `praman` MCP server fails to start, say so;
  do not fall back to claiming success.
- Browser checks also need `npx playwright install chromium` in that checkout and a
  running target the user started. PRAMAN does not reset backend state.
- If Power activation or a `praman_*` call is denied with "approval is not supported in
  non-interactive mode", the session has no allow rule. Tell the user to add these to
  their agent's `permissions.rules` (see the Power's README); do not work around it:

  ```yaml
  - capability: power
    match: ["praman", "praman*"]
    effect: allow
  - capability: mcp
    match: ["praman*", "power-praman*"]
    effect: allow
  ```

## Step 1: Pick the surface

- Command-line program or script: `praman_command_verify` with a declaration file.
- Web UI that is already running: `praman_scenario_verify` with a scenario object.

## Step 2: Write the declaration

Every declaration needs an explicit `mode`:

- `acceptance`: current behavior only. Use this unless the user names a historical
  failure. Omit every baseline field.
- `repair`: a declared historical baseline (`before`), `baselineKind: "historical"`
  and the `regressionCheck` that must fail before and pass now.
- `comparison`: a baseline with an explicit `baselineKind`; no `regressionCheck`.

Command example (acceptance):

```json
{
  "mode": "acceptance",
  "title": "Total is printed",
  "requirement": "Print the sum of the values",
  "current": { "executable": "node", "args": ["sum.mjs"], "cwd": ".", "stdin": "{\"values\":[2,3,5]}", "deadlineMs": 5000 },
  "expectedExit": 0,
  "checks": [{ "id": "total", "source": "stdout", "operator": "equals", "value": "10\n" }],
  "repeats": 2
}
```

Checks come from the user's requirement, not from what the software currently prints.
Never copy an observed value into an expectation to make a run pass. Browser scenario
fields are listed in the
[scenario cheat sheet](https://github.com/ifelse-codes/praman/blob/main/docs/schema-cheatsheet.md).

## Step 3: Run it

Pass **absolute paths** for `specPath` and `outDir`. The power's MCP server runs from
the installed power's own directory, not the user's project, so relative paths resolve
to the wrong place. Use a **fresh, unused** output directory under the project's
`.praman/` for every run, for example `<project>/.praman/verify-<short-name>-<n>`.
PRAMAN refuses a directory that already exists.

## Step 4: Report the verdict

| Verdict | MCP `isError` | Meaning | What to say |
| --- | --- | --- | --- |
| `passed` | false | Every declared check passed in every repeat | Passed, for the declared checks only |
| `failed` | true | A declared check was observed to fail | Failed; give the failing check indexes and report path |
| `insufficient_evidence` | true | Execution was unavailable or evidence incomplete | **Not proven**; never call it passed |

Point the user to `REPORT.md`, `feedback.json` and `proof.json` in the output
directory. Raw output and expectations stay in private evidence files; do not paste
secrets from them.

## Step 5: After a fix

A finding is resolved only after a fresh run with a new output directory passes. Do
not weaken, delete or edit checks to make a run pass.

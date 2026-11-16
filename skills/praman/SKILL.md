---
name: praman
description: Check that software you just built or fixed really works, using PRAMAN. Use before you tell the user a change is done, when the user asks you to verify, prove or check a command-line program or a running web app, or when they mention PRAMAN. You write the checks from the user's requirement, PRAMAN runs them against the real software, and you report its verdict (passed, failed or not proven) with the evidence path. Works in any coding agent that can run shell commands; MCP is optional.
---

# Verify with PRAMAN

You wrote the code, so you are not the judge of it. PRAMAN is. You declare what must be
true, PRAMAN runs the real software, and its verdict is what you report.

PRAMAN does not write or fix code. It is **not a sandbox**: declared commands and
browser actions run with the user's own permissions and can change real files or data.

## 0. Find PRAMAN

1. Use `$PRAMAN_HOME` if it is set. It must point to a PRAMAN checkout that has
   `dist/cli.js`.
2. If it is not set or `dist/cli.js` is missing, stop and tell the user:

   ```sh
   git clone https://github.com/ifelse-codes/praman && cd praman
   npm ci && npm run build
   npx playwright install chromium   # only for browser checks
   export PRAMAN_HOME="$PWD"
   ```

   Do not guess a path, install PRAMAN yourself without asking, or report the work as
   verified without it.

In the steps below, `praman` means `node "$PRAMAN_HOME/dist/cli.js"`.

## 1. Pick the route

| What you changed | Command | Declaration |
| --- | --- | --- |
| A command-line program, script or build step | `praman command-verify <file.json>` | command declaration |
| A web app that is already running (the user started it) | `praman scenario-verify <file.json>` | browser scenario |

Browser checks need Chromium (see step 0) and a running app. PRAMAN does not start
the app or reset its data; that is the user's job.

**A change to a web page needs `scenario-verify`, even when a command check exists.**
A command or API check never opens the page, so it cannot see a page that crashes.
A scenario that only opens the page already fails on any page error you did not
assert. Use both routes when the change touches both.

## 2. Decide what to check

A pass means only "the checks you wrote held". So the checks must cover the work.

1. List the requirements: the user's request plus the project's own requirement,
   spec or contract files. Give each one a short id (`R1`, `R2`, ...).
2. Map every requirement to at least one check. Write down each requirement that has
   **no** check and why (for example "needs a second user account").
3. Each new change needs a check that **exercises that change**. A check that cannot
   fail on the work you just did proves nothing about it.
4. Re-running a declaration you did not change is **not proof of a new fix**. If the
   last session's declaration still passes, add checks for this session's change.
5. Never weaken a stated rule of the project to make a flow finish or a check pass
   (for example an "auto-approver" where the project says a person must approve).
   Stop and ask the user.

## 3. Write the declaration

Write it from **the user's requirement**, not from what the software prints today.
Never copy an observed value into an expectation to make a run pass.

Every declaration needs a `mode`:

- `acceptance`: checks the current version only. Use this by default.
- `repair`: the user names an old version that had the bug. Needs `before`,
  `baselineKind: "historical"` and a `regressionCheck` that must fail on the old
  version and pass now.
- `comparison`: an old and a new version, with an explicit `baselineKind`; no
  `regressionCheck`.

Command example (acceptance). Save it in the project, for example `checks/total.json`;
`cwd` is relative to this file:

```json
{
  "mode": "acceptance",
  "title": "Total is printed",
  "requirement": "Print the sum of the values",
  "current": { "executable": "node", "args": ["sum.mjs"], "cwd": "..", "stdin": "{\"values\":[2,3,5]}", "deadlineMs": 5000 },
  "expectedExit": 0,
  "checks": [{ "id": "total", "source": "stdout", "operator": "equals", "value": "10\n" }],
  "requirements": [
    { "id": "R1", "text": "Print the sum of the values", "checks": ["total", "$exit"] }
  ],
  "repeats": 2
}
```

- `requirements` (browser scenarios too) is your step-2 map: each requirement with the
  check ids that exercise it (`$exit` is the exit-code check). List the requirements you
  could not check too, with `"checks": []`: such a run is **not proven**, and the summary
  names them (`No check: R2`). Do not delete a requirement to get a pass.
- `target` (optional) is a command that prints the version of the app under test, for
  example `"target": { "executable": "git", "args": ["rev-parse", "--short", "HEAD"], "cwd": ".." }`
  in a git repository, or a script that prints a build hash. PRAMAN reads it before
  every run and after the last; if it fails or changes, the run is not proven. Without
  it the report says "App under test: not identified".

Browser scenario fields (steps, selectors, checks) are in the
[scenario cheat sheet](https://github.com/ifelse-codes/praman/blob/main/docs/schema-cheatsheet.md).
Text checks compare the rendered text exactly, including CSS upper-casing.

## 4. Run it

```sh
praman command-verify checks/total.json -o .praman/verify-total-1 --summary
```

- Use a **new, unused** output folder under the project's `.praman/` every run
  (`verify-<name>-1`, `-2`, ...). PRAMAN refuses a folder that already has a run.
- Read the `Outcome:` line. Exit codes: `0` passed, `1` failed, `2` not proven.
- Read the lines under it: `Requirements:` (how many requirements have a check),
  `App under test:` (which version was tested) and, if present, `Repeat:` (this run had
  the same declaration and inputs as an earlier one, so it proves nothing new).
- A line starting with `PRAMAN error:` and **no `Outcome:` line** means the run stopped
  before a verdict (exit 2). Fix the cause (for example, a used output folder or a bad
  declaration) and run again into a new folder. Never report that as passed or failed.

## 5. Report the verdict

| Outcome | Meaning | Say |
| --- | --- | --- |
| `passed` | Every declared check passed in every repeat | "Passed N checks covering X of Y requirements" (from the `Requirements:` line), and the `App under test:` line. If there is a `Repeat:` line, say the run proves nothing new. |
| `failed` | A declared check was seen to fail | "Failed." Give the check id, the `Next:` line and the report path. |
| `insufficient_evidence` | It could not run, evidence is missing, a requirement has no check, or the app under test changed | "**Not proven.**" Say which. Never call it passed. |

Never call the work "complete", "fully working" or "done" because PRAMAN passed. Say
what was checked and what was not; the user decides when it is done.

Point the user to `REPORT.md` (browser runs also write `REPORT.html`), `feedback.json`
and `proof.json` in the output folder. These are private: they can hold app data,
secrets and local paths. Do not paste raw contents or secrets from them into chat.

## 6. After a fix

A failure is resolved only when a **fresh** run, in a new output folder, passes. Do not
weaken, delete or edit checks to make a run pass. If the requirement itself was wrong,
say so and ask the user before you change the check.

## Optional: MCP instead of the CLI

If your agent has PRAMAN's MCP server configured (`node "$PRAMAN_HOME/dist/cli.js" mcp`
over stdio), use `praman_command_verify` (`specPath`, `outDir`) or
`praman_scenario_verify` (`scenario`, `outDir`) instead. Pass **absolute** paths. A
non-pass result has `isError: true`. The result ends with a `coverageSummary` line
(requirements, app under test, repeat note); quote it. Do not use the `*_demonstrate` tools unless the
user asks for a video.

## Limits to keep in mind

- PRAMAN checks only what you declared. A pass is not proof the whole app is correct.
- Browser runs stay on the app's own origin; a jump to another site is stopped and
  reported as `navigation_failed`.
- Managed Docker environments (saved worlds, network faults, many users, recorded
  outside calls) need an integration in the target project; see PRAMAN's README.

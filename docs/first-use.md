# First use: setup → CLI/MCP → evidence

The scoped command/browser CLI/MCP MVP is complete on the tested host. This guide
is the supported first-use route for the current source, not a published npm package.
Another machine, OS and independent user have not been validated. Optional video
and managed infrastructure are not required to complete this guide.

## Trust before execution

Use only reviewed, trusted declarations and programs. **PRAMAN is not a sandbox**:
commands and integration modules run with your user's authority, inherit its environment,
and can change files or external systems. Deadlines do not bound disk usage or escaped
processes. Browser actions can mutate services. Fresh contexts clear browser state,
**not backend state**; you own provisioning, seed/reset between repeats and teardown.

Use fresh output directories. Keep raw inputs, proof/results, screenshots, stdout/stderr
and network evidence private under ignored `.praman/`; they may contain application data
or secrets. `REPORT.html` is a private local view (mode 0600): it shows application text
and expected and observed values, so do not share it; fill values, typed text and
credential fields are redacted. Feedback/report and CLI/MCP output redaction (known secret
values and private declaration text) is bounded presentation, **not safe universal
sanitization**. Returned file paths are not redacted (a result whose path contains a known
private value carries `pathNote`), and even local paths can disclose information. Review
everything before sharing. Do not supply real credentials here.

A browser navigation to another origin, including a start URL that redirects to another
origin (for example a single sign-on login page), is stopped before its request is sent and
the run ends `insufficient_evidence` with `navigation_failed`.

## 1. Setup once

Use the current reviewed source tree, or extract the latest remediated source
candidate described in [release validation](release-validation.md#choose-the-current-source).
The source root contains `package.json`, `package-lock.json`, `src/` and this guide.
Open a terminal there and follow [tested source setup](../README.md#tested-source-setup).
Node/npm, registry/download access and writable storage are required.

```sh
npm ci
npm run build
node dist/cli.js --help
npx playwright install chromium
```

To check known dependency advisories after installation, run `npm audit`.
The remediated lockfile was verified with zero known findings; this is not a
general security guarantee. Use `npm ci`, not a blind forced dependency update.

The evidenced runtime is macOS 27.0.1 arm64, Node 26.0.0/npm 11.12.1. This is not
a cross-platform support claim. Chromium is required for this combined route, not for
command-only verification. No Docker, kind, target checkout, hidden service, video,
FFmpeg, speech provider or model credentials are needed for the public examples.
Existing full tests have additional prerequisites documented in README.

## 2. Run the public example

```sh
node examples/first-use/run.mjs
```

The runner reuses README's JSON-total command and the
[static-browser release recipe](static-browser-acceptance.md#runnable-delayed-navigation-example),
without its simulated loading delay or optional story. It starts its own loopback HTTP
listener on an allocated port, uses actual compiled CLI children and an SDK client
connected to `node dist/cli.js mcp` over real stdio. It discovers the tools, then
executes each case separately through each surface. It closes the MCP transport,
server child and owned listener in `finally`. No movie is created.

A new `.praman/session2-*` directory holds generated declarations and all evidence.
The printed absolute path is `RUN` below. Optionally pass an absolute, nonexistent
output path as the runner's first argument; existing directories are refused.

| Case (for both command and browser) | CLI exit | Proof verdict | MCP `isError` |
| --- | --- | --- | --- |
| Pass | 0 | `passed` | false |
| Intentional expectation mismatch | 1 | `failed` | true |
| Unavailable execution/evidence | 2 | `insufficient_evidence` | true |

Expect **12 outcome lines**, followed by `Private evidence: ...`. Runner exit 0 means
all controls behaved as documented, not that its negative requirements passed.
`verification.json` records all 12 outcomes and cleanup. Missing prerequisites make
the runner fail rather than invent a pass; fix the prerequisite and use a fresh run.

The command observes `10\n` from public stdin `{"values":[2,3,5]}` in both repeats.
Its mismatch expects `11\n`; unavailable selects a nonexistent executable. The browser
clicks release details, waits for navigation and visible readiness, and observes rendered
`RELEASED` in both repeats. Its mismatch expects `NOT RELEASED`; unavailable declares
a nonexistent identity input and blocks before browser execution. These are explicitly
**negative controls**, not discovered historical defects or repairs.

## 3. Inspect and rerun through the CLI

```sh
RUN=/absolute/path/printed/by/the/runner
cat "$RUN/cli-command-mismatch/REPORT.md"
cat "$RUN/cli-command-mismatch/feedback.json"
cat "$RUN/cli-command-mismatch/proof.json"
cat "$RUN/cli-browser-mismatch/REPORT.md"
cat "$RUN/cli-browser-mismatch/after-1/result.json"
node dist/cli.js command-verify "$RUN/command-pass.json" -o "$RUN/manual-command" --summary
```

`REPORT.md` groups check indexes, verdicts, missing evidence and next actions.
`feedback.json` is bounded feedback with indexed references, not raw observed strings.
For command expected/observed comparison, inspect private `declaration.json`,
`proof.json` → `current[]`, and `current-1/result.json` plus `stdout.txt`/`stderr.txt`.
For browser comparison, inspect `scenario.json`, `proof.json` → `after[]`, and
`after-1/result.json`, `check-1.png` and `network.json` (also repeat 2). Follow the
report's actual evidence paths; unavailable controls intentionally lack some files.
Check index 0 maps to declaration check 0; command execution also includes `$exit`.
A mismatch alone does not establish root cause. Do not edit expectations just to get green.

The fixture URL is deliberately dead after the runner exits. To repeat browser checks,
rerun the whole runner for a new live fixture and fresh outputs. Saved URLs are historical
observations, not persistent services. For a real project, start and reset your own target,
then use `scenario-verify scenario.json -o .praman/fresh-browser --summary`.

## 4. Configure an MCP client

For clients accepting the common `mcpServers` configuration shape, replace both paths:

```json
{
  "mcpServers": {
    "praman": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/praman/dist/cli.js", "mcp"]
    }
  }
}
```

Use the executable Node path from your installation, not a shell alias. Keep installed
`node_modules/` beside the built source tree. This source entrypoint is exercised; no
published package/install path is claimed. The client starts a long-lived stdio server:
stdout is protocol traffic, not an interactive terminal. Stop/disconnect the client when
done. Client-specific config location/UI is outside this generic configuration contract;
the public runner demonstrates a working SDK client, not every vendor's settings UI.

If Chromium was installed with `PLAYWRIGHT_BROWSERS_PATH`, add an `env` object
inside the `praman` configuration with the same absolute `PLAYWRIGHT_BROWSERS_PATH`.
The SDK does not inherit that variable by default; the public runner forwards it explicitly.

To find the exact Node executable for `command`, run:

```sh
node -p 'process.execPath'
```

When using a custom browser directory, the `env` member goes alongside `command`
and `args`, for example:

```json
"env": { "PLAYWRIGHT_BROWSERS_PATH": "/absolute/path/to/browser-downloads" }
```

This is a configuration fragment, not a standalone JSON file. Use the same directory
used by `npx playwright install chromium`; do not copy credentials into client config.

Call the discovered tools with these argument shapes:

```json
{"name":"praman_command_verify","arguments":{"specPath":"/absolute/RUN/command-pass.json","outDir":"/absolute/RUN/manual-mcp-command"}}
```

```json
{"name":"praman_scenario_verify","arguments":{"scenario":{"mode":"acceptance","title":"Current release details","change":"Release is available","afterUrl":"http://127.0.0.1:YOUR_OWNED_PORT","repeats":2,"steps":[],"checks":[{"id":"status","kind":"text","selector":"#release-status","equals":"RELEASED"}]},"outDir":"/absolute/fresh-output"}}
```

The second call requires your live target serving that selector at the supplied URL;
for the runnable owned fixture use the runner, which sends its complete parsed scenario.
MCP browser verification accepts a **scenario object**, not `specPath`. Command takes
a declaration path. Results are JSON text content with report/feedback pointers;
non-pass verdicts set `isError: true`. Tool/validation errors can instead return an error
content or protocol rejection: inspect the error, never treat absent proof as success.
CLI malformed declarations likewise fail before execution; exit 1 for such an error
is not proof of a completed expectation mismatch.

Use absolute `specPath`/`outDir` in clients: relative values resolve against the MCP
server process working directory, which the client controls. The compiled entrypoint
being absolute does not change that cwd. Command `cwd` and executable paths containing
a separator resolve relative to the declaration file; bare executables use effective
PATH. CLI scenario upload/diff paths resolve relative to its declaration; for object-based
MCP supply absolute upload/diff/identity paths. This example explicitly pins Node and
command cwd, so it does not depend on an undocumented client working directory.

## 5. Use PRAMAN on your own project

Keep declarations, target startup and reset logic in your project, not PRAMAN core.
Use `mode: "acceptance"` for current-only checks: no invented before version is needed.
Declare independently meaningful expectations; a passing result covers only those checks.

| Target | What to prepare | CLI from the target project |
| --- | --- | --- |
| CLI or backend command | `commands.json` with executable, cwd, deadline, expected exit and checks; start from [the public JSON-total declaration](../README.md#tested-source-setup) | `node /absolute/path/to/praman/dist/cli.js command-verify commands.json -o .praman/command-001 --summary` |
| Running browser app | Start/reset an owned target and author `scenario.json` with its live URL, actions and checks; follow [the browser recipe](static-browser-acceptance.md) | `node /absolute/path/to/praman/dist/cli.js scenario-verify scenario.json -o .praman/browser-001 --summary` |

Use a new output path each time. Ignore `.praman/` in your target project's version
control. Inspect the report and private observations as in section 3, fix the target
when warranted, reset its state and rerun with unchanged meaningful requirements.
For MCP, use section 4's same tools and absolute paths. Stop only services you own.

## Troubleshooting

| Observed problem | What to check |
| --- | --- |
| No `dist/cli.js` | Run `npm ci` then `npm run build` in the PRAMAN source root. |
| Chromium unavailable, or CLI browser works but MCP browser does not | Install Chromium with the same user/browser directory; forward custom `PLAYWRIGHT_BROWSERS_PATH` in the MCP configuration. |
| Output directory already exists | Choose a fresh path; do not overwrite prior evidence. |
| Browser fixture URL no longer responds | The public runner stops its server on exit. Rerun it; do not reuse its saved URL. |
| `failed` or `insufficient_evidence` | Inspect indexed private observations/errors. Do not relabel unavailable evidence as success or change a meaningful expectation merely to get green. |
| MCP cannot find a declaration or input | Use absolute paths and check the client-controlled server cwd and declaration-relative path rules above. |

## Session 3 repeat contract

Required public files: `README.md`, this guide, `docs/static-browser-acceptance.md`,
`examples/first-use/run.mjs`, `package.json`, `package-lock.json`, `tsconfig.json` and
all `src/` files; build produces `dist/`, installation produces `node_modules/`.
The exact repeat commands are the setup block and `node examples/first-use/run.mjs`.
Do not ship `.praman/`. [Source candidate procedure and limits](release-validation.md)
records Session 3's clean-directory repeat and the completed dependency/license remediation.
Same-host validation does not authorize publication or establish independent-human acceptance.

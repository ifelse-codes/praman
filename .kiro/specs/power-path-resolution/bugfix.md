# Bugfix: relative paths through the Kiro Power resolve inside the installed Power

Spec type: bugfix. Owner decision 2026-11-08 (answer 2-A after spec `kiro-evidence-gate`).

## Reproduction (observed 2026-11-08)

Kiro CLI 2.37.1 (V3), macOS arm64, PRAMAN Power installed from `kiro-power/`, run from a
scratch project with `PRAMAN_HOME` set.

1. Agent calls `praman_command_verify` with `specPath: "total.json"`,
   `outDir: ".praman/verify-total-1"` (sessions `sess_ccfd7c6f…`, `sess_307a37d7…`).
2. PRAMAN fails with `ENOENT … open '~/.kiro/powers/installed/praman/total.json'`.
3. The agent retries with absolute paths and gets `passed`.

Probe (session `sess_bf2efd93-3cf8-4feb-81cd-bb1bdb1af5fa`): a throwaway MCP server
started through the same Power recorded what Kiro gives it:

- process `cwd` = `~/.kiro/powers/installed/praman` (the installed Power directory);
- the client advertises only `elicitation`; `roots/list` returns
  `MCP error -32601: Method not found`, so the server cannot ask Kiro for the workspace;
- `PWD` = the shell directory `kiro-cli` was started from. That matched the project here,
  but it is inherited shell state, not a workspace contract (the IDE is untested).

Root cause: every MCP tool passes caller paths to code that calls `path.resolve()` against
the server's `cwd` (for example `loadCommandSpec` in `src/eval/command.ts`). Under the
workspace `.kiro/settings/mcp.json`, `cwd` is the project root, so relative paths work.
Under the Power, `cwd` is the installed Power, so they resolve to the wrong directory.

## Current behavior

1. WHEN the Power's server receives a relative `specPath`, `planPath` or `tracePath`, THEN
   the system resolves it inside the installed Power directory and fails with a raw
   `ENOENT` naming that directory.
2. WHEN the Power's server receives an absolute declaration path and a relative `outDir`
   or `baseDir`, THEN the system would write private evidence inside the installed Power
   directory (inferred from the same resolution rule; not yet observed — task 1.2).
3. WHEN a browser scenario passed through the Power declares relative identity or upload
   paths, THEN they resolve against the installed Power directory (README documents
   server-`cwd` resolution for inline MCP scenarios; not yet observed — task 1.2).

4. WHEN the Power's server receives `praman_environment` without `baseDir`, THEN the
   system resolves its default `.praman/environments` inside the installed Power directory
   (reproduced 2026-11-08: `ENOENT … <server-dir>/.praman/environments/abcdefabcdef/state.json`).
5. WHEN the demonstrate tools generate speech through the Power, THEN the default speech
   cache `.praman/speech-cache/v1` (`src/report/speech.ts`) resolves inside the installed
   Power directory (confirmed from the code path; not executed).

## Expected behavior

1. WHEN the server is started with `PRAMAN_RELATIVE_PATHS=reject` AND a tool receives any
   relative path argument (`specPath`, `planPath`, `tracePath`, `outDir`, `baseDir`, or an
   inline scenario's upload path, `diffPath`, identity file path, or identity tool
   executable containing a path separator), THEN the system SHALL return a tool error
   (`isError: true`, verdict `insufficient_evidence`) naming the argument(s) and saying
   absolute paths are required, before executing anything or creating any file or
   directory.
2. IF `PRAMAN_RELATIVE_PATHS` is set to any value other than `reject` (or empty), THEN MCP
   startup SHALL fail visibly with a clear message.
3. THE Power's `mcp.json` SHALL set `PRAMAN_RELATIVE_PATHS=reject`, and the Power skill and
   READMEs SHALL state that absolute paths are required.
4. WHEN reject mode is set AND `praman_environment` is called without `baseDir`, THEN the
   system SHALL refuse it the same way, naming `baseDir` as missing.
5. THE error text SHALL name arguments only and SHALL NOT include their values, raw
   declaration contents or environment values.

## Deferred (owner decision 2026-11-08)

Not part of this bug fix:

- The speech-cache default (Current 5): it is not a tool argument, so it is documented as a
  known limit of the Power instead of fixed.
- `PRAMAN_WORKSPACE=<dir>` to resolve relative paths against a declared project folder.
- Resolving against a single project root reported by the MCP client (`roots/list`).
  Kiro does not support `roots` (probe `sess_bf2efd93…`), so this cannot be proven in Kiro.

## Unchanged behavior

1. WHEN `PRAMAN_RELATIVE_PATHS` is unset, THEN the system SHALL CONTINUE TO resolve
   relative paths against the server's `cwd` (workspace
   `.kiro/settings/mcp.json`, other MCP clients).
2. WHEN all path arguments are absolute, THEN every tool SHALL CONTINUE TO produce the same
   verdicts, `isError` values and evidence layout.
3. THE CLI SHALL CONTINUE TO resolve paths against the shell's working directory.
4. Paths inside a declaration file (`cwd`, executables, identity files) SHALL CONTINUE TO
   resolve relative to that declaration file.
5. THE full suite and the 12/12 first-use route SHALL CONTINUE TO pass.

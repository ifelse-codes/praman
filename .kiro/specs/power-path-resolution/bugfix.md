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

## Expected behavior

1. WHEN the server is started with `PRAMAN_RELATIVE_PATHS=reject` AND a tool receives any
   relative path argument (including inline-scenario file paths), THEN the system SHALL
   return a tool error (`isError: true`) naming the argument and saying absolute paths are
   required, before executing anything or creating any file or directory.
2. WHEN the server is started with `PRAMAN_WORKSPACE=<absolute dir>`, THEN the system SHALL
   resolve every relative path argument against that directory.
3. IF `PRAMAN_WORKSPACE` is set but is not an existing absolute directory, THEN MCP startup
   SHALL fail visibly with a clear message.
4. WHEN the connected client supports `roots` and lists exactly one `file://` root, AND
   neither variable is set, THEN the system SHALL resolve relative paths against that root.
5. THE Power's `mcp.json` SHALL set `PRAMAN_RELATIVE_PATHS=reject`, and the Power skill and
   README SHALL state that absolute paths are required.
6. THE error text SHALL NOT include raw declaration contents or environment values.

## Unchanged behavior

1. WHEN neither variable is set and the client lists no single root, THEN the system SHALL
   CONTINUE TO resolve relative paths against the server's `cwd` (workspace
   `.kiro/settings/mcp.json`, other MCP clients).
2. WHEN all path arguments are absolute, THEN every tool SHALL CONTINUE TO produce the same
   verdicts, `isError` values and evidence layout.
3. THE CLI SHALL CONTINUE TO resolve paths against the shell's working directory.
4. Paths inside a declaration file (`cwd`, executables, identity files) SHALL CONTINUE TO
   resolve relative to that declaration file.
5. THE full suite and the 12/12 first-use route SHALL CONTINUE TO pass.

# Design: refuse relative MCP paths when the server runs outside the project

## Fix

One small module, `src/mcp/paths.ts`, used only by `src/mcp/server.ts`:

- `relativePathPolicy(env)` returns `'cwd'` (unset or empty) or `'reject'`; any other value
  throws, so `praman mcp` exits non-zero at startup with a clear message.
- `relativePathArguments(input)` returns the **names** of relative path arguments in a
  tool's parsed input: `specPath`, `planPath`, `tracePath`, `outDir`, `baseDir`, and for an
  inline `scenario`: `steps[i].path` of `upload` steps, `diffPath`,
  `identity.files[i].path`, and `identity.tools[i].executable` when it contains a path
  separator (bare names still use `PATH`).
- `relativePathRefusal(names)` builds `{ isError: true, content: [text JSON
  {verdict: "insufficient_evidence", reason, arguments: names}] }`. Nothing has run, so
  `insufficient_evidence` is the honest verdict, not `failed`.

`startMcp()` reads the policy once and registers every tool through a thin wrapper around
`server.tool` that checks the input before calling the existing handler. Core functions,
schemas and the CLI are unchanged. With the policy unset the wrapper is a pass-through.

`kiro-power/mcp.json` adds `"env": { "PRAMAN_RELATIVE_PATHS": "reject" }`. The workspace
`.kiro/settings/mcp.json` does not set it, so relative paths keep working there.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Resolve against `$PWD` in the Power | Inherited shell state, not a workspace contract; wrong for IDE launches. Guessing a base can write evidence to the wrong place |
| Reject relative paths everywhere | Breaks the working workspace MCP route and other clients that start the server in the project |
| `PRAMAN_WORKSPACE`, client roots | Deferred (see bugfix.md); roots are unsupported by Kiro |

## Testing strategy

Ordinary unit tests (owner decision: no property-based tests in this fix; they move to
spec `verify-cancellation`), in `tests/mcpPaths.test.ts`:

- policy parsing: unset, empty, `reject`, invalid value;
- argument detection for every listed path field, absolute paths and bare tool names;
- compiled server, started from a temporary "installed Power" directory with
  `PRAMAN_RELATIVE_PATHS=reject`: relative `specPath` → `isError`, `insufficient_evidence`,
  argument named, nothing new in the server directory; relative `outDir` with an absolute
  spec → refused, directory not created; absolute paths → `passed`;
- compiled server without the variable: relative paths still resolve against its `cwd`;
- invalid value: the server process exits non-zero.

## Verification in Kiro

1. Reinstall the Power; in a scratch project ask for verification with relative paths:
   expect the refusal naming the argument, then `passed` with absolute paths, and no new
   files under `~/.kiro/powers/installed/praman`.
2. Log the session in `docs/kiro-usage.md`.

# Design: MCP path base for the PRAMAN server

## Fix

One small module, `src/mcp/paths.ts`, used only by `src/mcp/server.ts`:

```ts
type PathBase =
  | { kind: 'reject' }                       // PRAMAN_RELATIVE_PATHS=reject
  | { kind: 'workspace'; dir: string }       // PRAMAN_WORKSPACE=<abs dir>
  | { kind: 'root'; dir: string }            // single file:// root from the client
  | { kind: 'cwd' };                         // unchanged default

resolvePathBase(env, client): Promise<PathBase>   // once per tool call (roots may change)
resolveArg(base, name, value): string             // throws PathArgumentError for reject
```

- Each tool handler maps its path arguments (`specPath`, `planPath`, `tracePath`,
  `outDir`, `baseDir`, and inline-scenario `identity.files[].path`, `identity.tools[]`
  executables containing a separator, and upload paths) through `resolveArg` before
  calling the existing core function. Core functions are unchanged.
- `PathArgumentError` becomes `{ isError: true, content: [{ type: 'text', text:
  '{"verdict":"insufficient_evidence","reason":"<arg> must be an absolute path …"}' }] }`.
  Nothing has run, so `insufficient_evidence` (not `failed`) is the honest verdict.
- Startup validates `PRAMAN_WORKSPACE` (absolute, existing directory) and an unknown
  `PRAMAN_RELATIVE_PATHS` value, and exits non-zero with a message on stderr.
- Precedence: `reject` > `PRAMAN_WORKSPACE` > single client root > `cwd`.
- Roots are requested only if the client advertised the capability; any roots error falls
  through to the next rule (never to a guess).

`kiro-power/mcp.json` adds `"env": { "PRAMAN_RELATIVE_PATHS": "reject" }`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Resolve against `$PWD` in the Power | Inherited shell state, not a workspace contract; wrong for IDE launches and for agents that change directory. Guessing a base can write evidence to the wrong place |
| Reject relative paths everywhere | Breaks the working workspace MCP route (`.kiro/settings/mcp.json`) and other clients that start the server in the project |
| Set the Power server's `cwd` | Not documented for Kiro Power `mcp.json`; untestable contract |
| Use Kiro's `PLUGIN_ROOT` | Kiro-specific, and points at the Power, not the project; core must stay client-independent |

## Correctness properties (fast-check)

- **P1 Reject is total:** for any generated relative path in any path argument of any
  tool, with `reject` set, the result is an `isError` tool result and the output
  directory (and its parent) is not created. _Expected 1_
- **P2 Workspace resolution:** for any relative path `p` and workspace `w`, the core
  function receives `path.resolve(w, p)`. _Expected 2_
- **P3 Absolute paths unchanged:** for any absolute path, every base produces the same
  argument as today. _Unchanged 2_
- **P4 Default unchanged:** with no variables and no roots, resolution equals
  `path.resolve(process.cwd(), p)`. _Unchanged 1_

Properties test `resolveArg`/`resolvePathBase` directly plus one end-to-end MCP case per
mode through the compiled server (same pattern as `tests/dispatch.test.ts`).

## Verification in Kiro

1. Reinstall the Power; in a scratch project ask for verification with relative paths:
   expect one `isError` result naming the argument, then a `passed` run with absolute paths,
   and no new files under `~/.kiro/powers/installed/praman`.
2. Workspace MCP in this repo with relative paths still returns `passed` (unchanged route).
3. Log both sessions in `docs/kiro-usage.md`.

## Boundaries

No client names in core: the variables are PRAMAN's own and work for any MCP client.
No change to the CLI, schemas or proof gates.

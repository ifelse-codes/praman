# PRAMAN Kiro Power

Installs PRAMAN's 14 `praman_*` MCP tools and the `praman-verify` skill into Kiro, so a
Kiro agent in any project can run PRAMAN checks when you ask it to verify something.
The Power also carries the opt-in finish-gate script (`scripts/praman-gate.mjs`).

Tested on 2026-11-08 with Kiro CLI 2.37.1 (V3 agent) on macOS arm64: installed from
this folder and run from a separate scratch project, with a `passed` verdict. Not yet
tested by installing through the Kiro IDE's Powers panel.

## 1. Build PRAMAN and point the Power at it

```sh
git clone https://github.com/ifelse-codes/praman
cd praman
npm ci && npm run build
export PRAMAN_HOME="$PWD"          # must be set in the shell that starts Kiro
kiro-cli powers install ./kiro-power
```

`PRAMAN_HOME` must be set every time you start Kiro; the Power's MCP server runs
`node ${PRAMAN_HOME}/dist/cli.js mcp`. Reinstall with the same command after
`kiro-power/` changes.

## 2. Allow the Power's tools

Interactive sessions ask you to approve each Power activation and tool call; choose
**Allow**. Headless runs (`--no-interactive`) cannot ask, so Kiro **denies** those
calls unless a rule allows them. A rule for `praman` alone was not enough in testing;
these two rules worked. Put them in your own agent (example
`.kiro/agents/praman-user.md` in your project):

```markdown
---
name: praman-user
description: Verify this project with the PRAMAN Power
tools: ["@builtin", "@mcp"]
includePowers: true
permissions:
  rules:
    - capability: power
      match: ["praman", "praman*"]
      effect: allow
    - capability: mcp
      match: ["praman*", "power-praman*"]
      effect: allow
---

Verify software only through the praman power. Use absolute paths.
```

Then run, for example:

```sh
kiro-cli chat --v3 --no-interactive --agent praman-user \
  "Use the praman power to verify $PWD/total.json with output directory $PWD/.praman/verify-1"
```

The same two rules should also work in your user file
`~/.kiro/settings/permissions.yaml` under `rules:`. That placement was not tested.
These rules let the agent run any `praman_*` tool, and those tools execute the commands
and browser actions you declare with your authority. PRAMAN is not a sandbox.

## 3. Use absolute paths

The Power's MCP server runs from the installed Power's directory, not your project, so
relative `specPath`/`outDir` values resolve to the wrong place and fail. Give the agent
absolute paths (as above). In testing the agent tried relative paths first and then
retried with absolute ones.

## Known limits

- Only `command-verify` was exercised through the Power; browser scenarios need
  `npx playwright install chromium` in the PRAMAN checkout and a running target.
- The finish gate is a workspace hook, not part of the Power. To use it, copy
  `.kiro/hooks/praman-evidence-gate.json` from the PRAMAN repository and add a
  `praman-gate.json` (see the main README).

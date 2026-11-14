# PRAMAN agent skill

`skills/praman/SKILL.md` teaches any coding agent to check its own work with PRAMAN
before it says "done": write the checks from the user's requirement, run them through
the PRAMAN CLI, and report the verdict (`passed`, `failed` or not proven) with the
evidence path. It follows the open Agent Skills format (a folder with a `SKILL.md`
that has `name` and `description`), so agents that read that format can load it.

Kiro users can install the [Kiro Power](../kiro-power/README.md) instead; it brings
the same rules plus PRAMAN's MCP tools and the finish gate.

## Install

1. Build PRAMAN and set `PRAMAN_HOME` in the shell that starts your agent:

   ```sh
   git clone https://github.com/ifelse-codes/praman && cd praman
   npm ci && npm run build
   npx playwright install chromium   # only for browser checks
   export PRAMAN_HOME="$PWD"
   ```

2. Link (or copy) `skills/praman` into your agent's skill folder. A link keeps the
   skill up to date when you pull PRAMAN.

   ```sh
   ln -s "$PRAMAN_HOME/skills/praman" <skill-folder>/praman
   ```

   | Agent | User skill folder used on the recorded host |
   | --- | --- |
   | Claude Code | `~/.claude/skills` |
   | Codex | `~/.codex/skills` (also `~/.agents/skills`) |
   | OpenCode | `~/.config/opencode/skills` |
   | pi | `~/.pi/agent/skills` |
   | omp | `~/.omp/agent/skills` |
   | GitHub Copilot CLI | `~/.copilot/skills` |

   Check your agent's own docs if the folder differs on your version.

3. Ask your agent to verify something, for example: "sum.mjs must print the sum of the
   values. Verify it with PRAMAN."

## Tested

| Agent | Result (2026-11-14, macOS arm64, Node 26) |
| --- | --- |
| Claude Code (headless `-p`) | Loaded the skill on its own, wrote an acceptance declaration from the requirement, ran `command-verify`, and reported **failed** with the report path on a deliberately wrong `sum.mjs`. |
| Codex, OpenCode, omp | Not tested: each run stopped on an account or usage limit before the agent started. |
| pi, Copilot CLI | Not tested: the pi command was not available on the host; Copilot CLI was not tried. |

## Limits

- The skill drives the CLI. It does not install PRAMAN, start your app or reset its data.
- PRAMAN is not a sandbox: declared commands and browser actions run with your permissions.
- A pass covers the declared checks only.
- The Kiro finish gate (`kiro-power/scripts/praman-gate.mjs`) is tested only as a Kiro
  `Stop` hook; other agents' stop hooks are not supported yet.

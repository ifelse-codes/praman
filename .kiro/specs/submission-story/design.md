# Design: submission story

## Storyboard (target 2:45)

| Time | Scene | Source (must be real) |
| --- | --- | --- |
| 0:00–0:20 | Problem: an agent says "done"; nothing proved it. A verification run that is stopped leaves a process running. | Narration + the recorded reproduction from `verify-cancellation` task 1 |
| 0:20–0:45 | Kiro bugfix spec: current / expected / unchanged behavior | Kiro session (spec view) |
| 0:45–1:10 | Kiro agent calls `praman_command_verify`; repair proof fails on the old build (`orphan: yes`) | Kiro session + PRAMAN `REPORT.md` |
| 1:10–1:40 | One code focus: the abort signal reaching the process group | Spotlight on the real diff, one small excerpt |
| 1:40–2:05 | Stop-hook gate: agent tries to finish while a check fails, gate sends it back; after the fix the gate releases | Kiro session |
| 2:05–2:25 | Same action after the fix: `orphan: no`, 3/3 repeats, `passed` | PRAMAN proof |
| 2:25–2:45 | Judge route 12/12, the Power install, limits (trusted execution, authored checks, no sandbox) | Terminal recording |

Optional: produce the 0:45–2:25 segment with PRAMAN's own `command-demonstrate`
(proof-gated) to show the product generating its walkthrough. That surface is frozen and
unverified since the 2026-11-05 cleanup, so it needs a dry run first and owner approval.

## Evidence capture

- Kiro CLI: `kiro-cli chat --list-sessions`, `/chat save` archives, and headless runs
  with `--output-format stream-json` where useful. Archives stay private; the write-up
  cites session IDs and counts only.
- PRAMAN evidence under ignored `.praman/`; nothing raw is published.

## Write-up structure (`docs/kiro-usage.md`)

1. Short version (what Kiro did across sessions, what it did not).
2. Feature table: feature, used/tried/not used, evidence (session ID, file, task).
3. Spec-driven versus vibe: which work used specs (`kiro-evidence-gate`,
   `verify-cancellation`, `submission-story`) and which was vibe.
4. Limits and attribution (retain the existing Headlamp-session section).

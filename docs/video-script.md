# PRAMAN submission video — storyboard (≤3:00)

**Status:** recording plan, not a recording. No video has been recorded or uploaded;
`<DEMO_VIDEO_URL>` is a placeholder for the Devpost field. Recording and upload need
the owner's explicit yes (spec `submission-story`, requirement 1.6).

Rewritten 2026-11-09 (spec `submission-story` task 3). The earlier plan reused an
archived Headlamp clip that Kiro did not produce; it is dropped. Every scene below is a
fresh take of work that was done and proven in recorded Kiro CLI sessions (session IDs in
[kiro-usage.md](kiro-usage.md)). Follow the [video standard](video-guidelines.md):
the real failure first, one small code focus, the same action after the fix, evidence
and limits at the end, in plain conversational speech.

**Mode:** repair. The story is spec `verify-cancellation`: PRAMAN's own Ctrl-C bug,
fixed by a Kiro CLI agent and proven by PRAMAN in `repair` mode against the historical
baseline `643fbe0` (the parent of the fix). That baseline is caller-declared history,
not signed provenance; say so on screen.

**Format:** public YouTube video, under 3:00 (target 2:45), 16:9, 1920×1080, 30 fps,
H.264/AAC, one conversational speaker, captions on. Terminal font ≥18 pt. No music
with third-party rights, no trademarks beyond names used to describe the tools.

**Honesty rules:** every terminal frame is a real run of the command shown. Kiro scenes
are fresh Kiro CLI takes recorded for the video; label them *Kiro CLI, recorded
<date>*. Never show home directories, usernames, emails, credentials or full session
IDs on screen (use `$PRAMAN` and `/tmp`). Never say Kiro built PRAMAN.

## Summary timeline

| Time | Segment | What the viewer must understand | Words |
| --- | --- | --- | --- |
| 0:00–0:20 | The problem | Agents say "done"; nothing checked it | 45 |
| 0:20–0:45 | The real bug | Stopping a check left the tested program running | 55 |
| 0:45–1:05 | The Kiro spec | The bugfix spec names current, expected and unchanged behavior | 45 |
| 1:05–1:30 | PRAMAN proves the old build is broken | Repair proof on the baseline prints `orphan: yes` | 50 |
| 1:30–1:55 | The code fix, one focus | Stop the whole process group, then force it after 2 s | 55 |
| 1:55–2:15 | Same action after the fix | `orphan: no` in 3 of 3 runs, verdict `passed` | 40 |
| 2:15–2:35 | The finish gate | The `Stop` hook sends the agent back while a check fails | 45 |
| 2:35–2:50 | Limits and where to try it | Judge route 12/12; not a sandbox; authored checks | 40 |

**Narration total ≈ 375 words ≈ 2:25–2:40 at 140–155 words per minute.** The rest is
scene holds. If a take runs long, cut setup footage, never an explanation or a check.

## Segment detail

### 0:00–0:20 — The problem

**On screen:** a Kiro CLI session where the agent ends with a confident "done"
message (fresh take of any small task). Title overlay: *The agent says it's done. Is it?*

**Narration:** "Coding agents are fast, and they sound sure of themselves. But a
finished message is not evidence. PRAMAN is a tool the agent calls to run real checks
against the software it changed, and to bring back what actually happened."

### 0:20–0:45 — The real bug

**On screen:** terminal. Build commit `643fbe0` (the self-check's
`prepare-baseline.sh` does this), start `command-verify` on a declaration whose command
sleeps, press Ctrl-C, then `ps` shows the declared command still running.

**Narration:** "Here's a real bug from PRAMAN itself. I start a check, then press
Ctrl-C. PRAMAN exits, but look: the program it was testing is still running. Left
alone, that program keeps using the machine, and the next run can trip over it. A
verification tool must clean up after itself."

**Lower-third:** *Old build 643fbe0 — before the fix.*

### 0:45–1:05 — The Kiro spec

**On screen:** Kiro CLI with `.kiro/specs/verify-cancellation/bugfix.md` open; focus
in turn on *current behavior*, *expected behavior* and *unchanged behavior*.

**Narration:** "I asked a Kiro agent to fix it, spec first. The bugfix spec says what
happens now, what should happen, and what must not change: a run that is not
interrupted behaves exactly as before."

### 1:05–1:30 — PRAMAN proves the old build is broken

**On screen:** the Kiro agent runs the repair check through PRAMAN's MCP tool
`praman_command_verify` on `examples/self-check/cancellation/commands.json`. Show the
baseline line `orphan: yes` from that run's report, not a raw JSON dump.

**Narration:** "Before touching code, the agent asks PRAMAN to prove the bug. This is
repair mode: PRAMAN runs the old build and the new one with the same check. The old
build prints 'orphan: yes'. The bug is real, and the check can see it."

### 1:30–1:55 — The code fix, one focus

**On screen:** `src/eval/command.ts`, the `onAbort` handler (current `main`, lines
94–99), one focus only, readable font, file name and line numbers visible.

**Narration:** "Here's the fix. When a stop is requested, PRAMAN sends a polite stop
signal to the whole group of processes it started, not just the first one. If anything
is still alive two seconds later, it forces it to stop. The run is then marked
'not proven', because it never finished."

### 1:55–2:15 — Same action after the fix

**On screen:** the same check, same declaration. Current build: `orphan: no` in all
3 repeats, `Outcome: passed`, exit 0; then the `## Checks` table in `REPORT.md`
(dry run 2026-11-09: `stdout` check `failed` on the baseline, `passed` in runs 1–3).

**Narration:** "Same action, after the fix. Three fresh runs, and nothing is left
behind. PRAMAN only says 'passed' because the old build failed this exact check and
every new run passed it."

### 2:15–2:35 — The finish gate

**On screen:** Kiro CLI with the opt-in `Stop`-hook gate (`praman-gate.json`) naming a
small failing check (the off-by-one sum demo). The agent says it's finished, the gate
answers *FAILED*, the agent fixes the sum, and the gate lets it stop.

**Narration:** "Kiro hooks close the loop. With the finish gate on, when the agent says
'done', PRAMAN runs the declared checks again. A failing check sends the agent back to
work. Here it fixes an off-by-one, and only then may it stop."

**Lower-third:** *Separate small demo of the gate (sum script), not the Ctrl-C fix.*

### 2:35–2:50 — Limits and where to try it

**On screen:** the judge route `node examples/first-use/run.mjs` finishing with its 12
outcome lines (shortened playback labeled as such), then a closing card:
*github.com/ifelse-codes/praman · MIT · Kiro usage: docs/kiro-usage.md*.

**Narration:** "You can run the same twelve checks from the repository. To be clear
about limits: PRAMAN is not a sandbox, and it checks only what you declare, not the
whole app. Evidence before you ship."

## Takes to record (owner)

Run everything from a clean checkout of public `main`. Use fresh output directories
under `/tmp`. Stop any server you start.

1. Bug take: `sh examples/self-check/cancellation/prepare-baseline.sh`, then the
   baseline build's `command-verify` on a sleeping command, Ctrl-C, `ps`.
2. Spec take: Kiro CLI, open the three sections of
   `.kiro/specs/verify-cancellation/bugfix.md`.
3. Proof take: Kiro CLI with `--agent praman-explorer`; ask it to run
   `praman_command_verify` on `examples/self-check/cancellation/commands.json` with an
   absolute `outDir`. Show the baseline and current lines from `REPORT.md`.
4. Code take: `src/eval/command.ts` lines 94–99 in a large font.
5. Gate take: a temporary `praman-gate.json` naming the sum demo declaration (private
   `.praman/gate-demo/`, an off-by-one `sum.mjs` and its `sum.json`; recreate it from
   the `kiro-evidence-gate` usage-log rows if missing); the agent finishes, is sent
   back, fixes, finishes. Remove the gate file afterwards.
6. Judge take: `node examples/first-use/run.mjs /tmp/first-use` → 12 lines, exit 0.

Dry run on 2026-11-09 (current `main` plus this branch): takes 3, 4 and 6 work as
written (self-check `passed`, baseline `orphan: yes`, current `orphan: no` 3/3; judge
route 12/12). Take 1 is what the self-check harness does automatically; it was not
rehearsed by hand. Take 5 was not dry-run, because a gate file in this checkout would
also gate the working session; it was shown in `sess_d3717c15…`.

Optional: produce segments 1:05–2:15 with PRAMAN's own proof-gated
`command-demonstrate`. That surface is frozen since the 2026-11-05 cleanup, so it needs
a dry run with `command-preview` first and the owner's approval.

## Recording checklist

### Before recording

- [ ] Read [video-guidelines.md](video-guidelines.md) and this storyboard end to end.
- [ ] `npm ci && npm run build`; Chromium installed; dry-run every take into `/tmp`.
- [ ] Rehearse the narration with a timer; target 2:40–2:50 with pauses.
- [ ] Clean desktop: no notifications, personal tabs, usernames, home paths, emails
  or credentials on screen; generic prompt.

### While recording

- [ ] Real output only; if a run fails, show it or retry into a fresh directory and
  say so. Never splice another run's output under a command.
- [ ] Keep each verdict line readable for at least 3 seconds.
- [ ] Label the baseline as caller-declared history and the gate demo as separate.

### After recording

- [ ] Watch the whole video with sound. Can a new viewer answer: what was broken, why
  does this code fix it, what was delivered? If not, rewrite and re-record.
- [ ] Check every claim against [STATUS.md](STATUS.md) and
  [kiro-usage.md](kiro-usage.md). No "Kiro built PRAMAN", no sandbox claim, no
  whole-application claim.
- [ ] Encoded duration under 180 s, audio present, captions accurate, 1080p, no
  private data in any frame.
- [ ] Upload as public on YouTube, then set `<DEMO_VIDEO_URL>` in
  [the Devpost copy](devpost-draft.md) and [the social post](social-post.md).

## Claims: keep, label, avoid

**Keep:** a Kiro CLI agent fixed this PRAMAN bug, spec first; PRAMAN proved it in
repair mode (baseline `orphan: yes`, current `orphan: no` 3/3); the finish gate sends
an agent back on a failing check.

**Label:** the baseline is caller-declared history; the gate scene is a separate small
demo; any sped-up playback.

**Avoid:** "Kiro built PRAMAN", "sandbox", "autonomous testing", "proves the app is
correct", "zero-config", or a link that does not resolve.

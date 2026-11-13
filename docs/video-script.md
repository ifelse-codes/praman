# PRAMAN submission video — storyboard (≤3:00)

**Status:** recording plan, not a recording. No video has been recorded or uploaded;
`<DEMO_VIDEO_URL>` is a placeholder for the Devpost field. Recording and upload need
the owner's explicit yes (spec `submission-story`, requirement 1.6).

Rewritten 2026-11-09 (spec `submission-story` task 3) and updated 2026-11-13 (plan step
5) for the work since then: a new one-page report scene (`REPORT.html`, plan steps 1, 3
and 4b), the old code shown before the fix, and corrected take instructions. The earlier
plan reused an archived Headlamp clip that Kiro did not produce; it is dropped. Every
scene below is a fresh take of work that was done and proven in recorded Kiro CLI
sessions (session IDs in [kiro-usage.md](kiro-usage.md)). Follow the
[video standard](video-guidelines.md): the real failure first, one small code focus at a
time, the same action after the fix, evidence and limits at the end, in plain
conversational speech.

**Mode:** repair. The main story is spec `verify-cancellation`: PRAMAN's own Ctrl-C bug,
fixed by a Kiro CLI agent and proven by PRAMAN in `repair` mode against the historical
baseline `643fbe0` (the parent of the fix). That baseline is caller-declared history,
not signed provenance; say so on screen. Two short scenes are labeled as separate: the
one-page report (an `acceptance` run with a rule set wrong on purpose) and the finish
gate (a small sum demo).

**Format:** public YouTube video, under 3:00 (target 2:50), 16:9, 1920×1080, 30 fps,
H.264/AAC, one conversational speaker, captions on. Terminal font ≥18 pt. No music
with third-party rights, no trademarks beyond names used to describe the tools.

**Honesty rules:** every terminal frame is a real run of the command shown. Kiro scenes
are fresh Kiro CLI takes recorded for the video; label them *Kiro CLI, recorded
<date>*. Never show home directories, usernames, emails, credentials or full session
IDs on screen (use `$PRAMAN` and `/tmp`). Never say Kiro built PRAMAN.

## Summary timeline

Times use the narration measured on 2026-11-13 (macOS `say` at 150 words per minute,
a timer only, not the final voice) plus about 1.5 s of hold per scene.

| Time | Segment | What the viewer must understand | Words | Speech |
| --- | --- | --- | --- | --- |
| 0:00–0:17 | The problem | Agents say "done"; nothing checked it | 39 | 15.9 s |
| 0:17–0:36 | The real bug | Stopping a check left the tested program running | 44 | 17.6 s |
| 0:36–0:51 | The Kiro spec | The bugfix spec names current, expected and unchanged behavior | 35 | 13.7 s |
| 0:51–1:10 | PRAMAN proves the old build is broken | Repair proof on the baseline prints `orphan: yes` | 45 | 17.1 s |
| 1:10–1:25 | The old code | The program runs in its own group, so Ctrl-C never reaches it | 34 | 13.4 s |
| 1:25–1:41 | The fix | Stop the whole group, then force it after 2 s | 37 | 14.3 s |
| 1:41–1:56 | Same action after the fix | `orphan: no` in 3 of 3 runs, verdict `passed` | 31 | 12.9 s |
| 1:56–2:17 | One page to review (separate scene) | A failed many-users run on a real app: verdict, broken rule, expected and observed, screenshot | 46 | 18.8 s |
| 2:17–2:34 | The finish gate (separate demo) | The `Stop` hook sends the agent back while a check fails | 41 | 15.4 s |
| 2:34–2:49 | Limits and where to try it | Judge route 12/12; not a sandbox; authored checks | 35 | 13.1 s |

**Narration total: 386 words, about 152 s of speech; the cut is about 2:49.** A slower
human voice has about 11 s of room. If a take runs long, cut setup footage, never an
explanation or a check.

## Segment detail

### 0:00–0:17 — The problem

**On screen:** a Kiro CLI session where the agent ends with a confident "done"
message (fresh take of any small task). Title overlay: *The agent says it's done. Is it?*

**Narration:** "Coding agents are fast, and they sound sure of themselves. But a
finished message is not evidence. PRAMAN is a tool the agent calls to run real checks
against the software it changed, and bring back what actually happened."

### 0:17–0:36 — The real bug

**On screen:** terminal (take 1). The old build `643fbe0` runs `command-verify` on a
declaration whose command is `sleep 30`; press Ctrl-C; `pgrep -fl "sleep 30"` still lists
the command.

**Narration:** "Here's a real bug from PRAMAN itself. I start a check on a program that
just waits, then press Ctrl-C. PRAMAN exits, but look: the program is still running.
Left alone, it keeps using the machine, and the next run can trip over it."

**Lower-third:** *Old build 643fbe0 — before the fix.*

### 0:36–0:51 — The Kiro spec

**On screen:** Kiro CLI with `.kiro/specs/verify-cancellation/bugfix.md` open; focus
in turn on *Current behavior*, *Expected behavior* and *Unchanged behavior*.

**Narration:** "I asked a Kiro agent to fix it, spec first. The bugfix spec says what
happens now, what should happen, and what must not change: a run that is not
interrupted behaves exactly as before."

### 0:51–1:10 — PRAMAN proves the old build is broken

**On screen:** the Kiro agent runs the repair check through PRAMAN's MCP tool
`praman_command_verify` on `examples/self-check/cancellation/commands.json`. Show the
baseline line `orphan: yes` (the run's `before/stdout.txt`) and the `Before` column of
the `## Checks` table in `REPORT.md`, not a raw JSON dump.

**Narration:** "Before touching code, the agent asks PRAMAN to prove the bug. This is
repair mode: PRAMAN runs the old build and the new one with the same check. The old
build prints 'orphan: yes'. The program was left behind, and the check can see it."

### 1:10–1:25 — The old code, one focus

**On screen:** `git show 643fbe0:src/eval/command.ts`, lines 69–71 only, readable font,
file name, version `643fbe0` and line numbers visible.

```ts
69  const child = spawn(executableIdentity!.path!, command.args, { cwd: command.cwd, env, detached: true, stdio: ['pipe', out, err] });
70  const observer = resources && child.pid ? observeResources(child.pid, resources) : undefined;
71  const timer = setTimeout(() => { expired = true; stopGroup(child.pid); }, command.deadlineMs);
```

**Narration:** "Here's the old code. PRAMAN starts the program in its own process
group, so Ctrl-C in the terminal never reaches it. Only the time limit could stop it,
and PRAMAN quit long before that."

**Why this is true (for the reviewer, not spoken):** `detached: true` (line 69) gives the
command its own process group, so the terminal's Ctrl-C reaches only PRAMAN; the old
`command-verify` had no SIGINT handler, so Node exited at once and the cleanup in the
`finally` block (line 78) never ran. Observed in the 2026-11-13 dry run: after Ctrl-C the
old build exited and `sleep 30` was still running.

### 1:25–1:41 — The fix, one focus

**On screen:** `src/eval/command.ts` on `main` `3c7a4e0`, lines 93–100 only.
Lower-third: *interruptGraceMs = 2000 (line 56).*

```ts
93      // Interruption: ask the owned group to stop, then force it after a bounded grace.
94      let grace: NodeJS.Timeout | undefined;
95      const onAbort = () => {
96        if (interrupted || expired) return;
97        interrupted = true;
98        stopGroup(child.pid, 'SIGTERM');
99        grace = setTimeout(() => stopGroup(child.pid), interruptGraceMs);
100     };
```

**Narration:** "The fix listens for the stop request. It asks the whole group to stop,
and if anything is still alive two seconds later, it forces it. The run is then marked
'not proven', because it never finished."

### 1:41–1:56 — Same action after the fix

**On screen:** the same check, same declaration. Current build: `orphan: no` in all
3 repeats, `Outcome: passed`, exit 0; then the `## Checks` table in `REPORT.md`
(dry run 2026-11-13: `stdout` check `failed` on the baseline, `passed` in runs 1–3).

**Narration:** "Same action, after the fix. Three fresh runs, and nothing is left
behind. PRAMAN only says 'passed' because the old build failed this exact check, and
every new run passed it."

### 1:56–2:17 — One page to review (separate scene)

**On screen:** Kiro CLI (take 7): the agent calls `praman_environment` to create Shiori
(an open-source bookmark app, v1.8.0) from a saved world (a hashed copy of its sample
data), verify with three users at once, and destroy. Hold on its answer: `failed`, 3 users,
peak 3, and the `reportHtml` path under `/tmp`. Then open that `REPORT.html` in Chromium:
the red *failed* banner, *Look here first*, click the first link, and hold on the card
*Invariant 0: seed-plus-one-each*: *Expected: 7*, *Observed: 4*, with the screenshot of
the four bookmarks (the seed and one per user).

**Narration:** "PRAMAN also tests whole apps. Here a Kiro agent starts a bookmark app
from saved data, and three users add a bookmark at once. I set one rule wrong on
purpose. One page shows the verdict, the broken rule, expected seven, saw four, and the
screenshot."

**Lower-third:** *Shiori v1.8.0, sample data. The rule asks for 2 bookmarks per user on
purpose (a control), not a Shiori bug. Kiro CLI, recorded <date>.*

**Owner decision before upload:** the page's top line says *Private evidence: contains
application data. Do not share.* In this take it holds only seeded sample data (bookmarks
named *Seed bookmark* and *User 0–2 bookmark* on `127.0.0.1`), and the 2026-11-13 dry run
found no seeded password, secret key, database password or home path in it. Confirm that
this frame may be public, or film only the banner and the card.

### 2:17–2:34 — The finish gate (separate demo)

**On screen:** Kiro CLI in a separate small project with the opt-in `Stop`-hook gate
(`praman-gate.json`) naming a failing check (the off-by-one sum demo). The agent says
it's finished, the gate answers *failed*, the agent fixes the sum, and the gate lets it
stop.

**Narration:** "Kiro hooks close the loop. With the finish gate on, when the agent says
'done', PRAMAN runs the declared checks again. A failing check sends the agent back to
work. Here it fixes an off-by-one, and only then may it stop."

**Lower-third:** *Separate small demo of the gate (sum script), not the Ctrl-C fix.*

### 2:34–2:49 — Limits and where to try it

**On screen:** the judge route `node examples/first-use/run.mjs` finishing with its 12
outcome lines (about 17 s real time; shortened playback labeled as such), then a
closing card: *github.com/ifelse-codes/praman · MIT · Kiro usage: docs/kiro-usage.md*.

**Narration:** "You can run the same twelve checks from the repository. To be clear
about limits: PRAMAN is not a sandbox, and it checks only what you declare, not the
whole app. Evidence before you ship."

## Takes to record (owner)

Run everything from a clean checkout of public `main` with `npm ci && npm run build`.
Use fresh output directories under `/tmp`. Stop any server you start. `$PRAMAN` is the
checkout folder.

1. **Bug take.** Build the baseline once: `sh examples/self-check/cancellation/prepare-baseline.sh`
   (it refuses if `.praman/self-check/baseline` exists; then it is already built). Save
   this declaration as `/tmp/praman-take/sleeper.json`:

   ```json
   {
     "mode": "acceptance",
     "title": "A command that runs until stopped",
     "requirement": "Runs until interrupted",
     "current": { "executable": "sleep", "args": ["30"], "cwd": ".", "deadlineMs": 60000 },
     "checks": [{ "id": "out", "source": "stdout", "operator": "equals", "value": "" }],
     "repeats": 2
   }
   ```

   In `/tmp/praman-take`, run
   `node $PRAMAN/.praman/self-check/baseline/dist/cli.js command-verify sleeper.json -o old-1 --summary`,
   wait two seconds, press Ctrl-C, then `pgrep -fl "sleep 30"` (one line is left). Clean
   up with `pkill -f "bin/sleep 30"`. For a second take use a new `-o` folder.
2. **Spec take.** Kiro CLI, open the three sections of
   `.kiro/specs/verify-cancellation/bugfix.md`.
3. **Proof take.** Kiro CLI with `--agent praman-explorer`; ask it to call
   `praman_command_verify` with `specPath` set to the absolute path of
   `examples/self-check/cancellation/commands.json` and a fresh absolute `outDir` under
   `/tmp`. The tool's argument is `specPath`, not `declarationPath`. Show the baseline and
   current lines with `cat <outDir>/before/stdout.txt <outDir>/current-1/stdout.txt` and
   the `## Checks` table of `<outDir>/REPORT.md` in a terminal (in the dry run the
   headless agent's own file reads were refused).
4. **Code takes.** `git show 643fbe0:src/eval/command.ts` lines 69–71, then
   `src/eval/command.ts` lines 93–100, each alone in a large font.
5. **Gate take.** In a separate folder (not this checkout: a gate file here would also
   gate the working session), create:
   - `sum.mjs`: a copy of the sum demo whose `reduce` starts at `1`, so `{"values":[2,3,5]}`
     prints `11`; `sum.json`: the command declaration that expects `10\n` (both in the
     private `.praman/gate-demo/`; that copy of `sum.mjs` is already fixed, so change its
     `0` to `1`);
   - `praman-gate.json`: `{ "declarations": [{ "kind": "command", "path": "sum.json" }] }`
     (each entry is an object with `kind` and `path`; a plain string is rejected);
   - `.kiro/hooks/praman-evidence-gate.json`: a copy of this repository's hook with the
     command `node $PRAMAN/kiro-power/scripts/praman-gate.mjs` (absolute path).

   Interactive Kiro CLI (as in `sess_d3717c15…`, the owner approves each edit): ask for a
   one-line comment at the top of `sum.mjs` and to say when finished. The gate answers
   *failed*, the agent fixes the start value and finishes, and the gate passes. In headless
   mode the gate runs once per run, so the passing check needs a second turn with
   `--resume-id`. Delete the folder afterwards.
6. **Judge take.** `node examples/first-use/run.mjs /tmp/first-use` → 12 lines, exit 0.
7. **Report take.** Needs the private Shiori assets under `.praman/real-apps/shiori/`
   (binary, integration, world `27110d95efc6`) and the Colima profile `praman-headlamp`
   (PRAMAN starts it and stops it again). Copy the world to `/tmp/praman-take/envs/worlds/`
   so every returned path is under `/tmp`. Headless Kiro with `--agent praman-explorer`:
   pause first (the MCP server connects about 3 s after the first prompt), then
   `praman_environment` `create` with `specPath`
   `.praman/real-apps/shiori/users/environment-wrong.json` (absolute), `baseDir`
   `/tmp/praman-take/envs` and `world` `27110d95efc6`; then `verify`; then `destroy`.
   Start the frame after the prompt (it holds a home path), and do not film the agent's
   line about its saved tool output (it names a home path). Open the returned
   `reportHtml` from `file://` in Chromium at 1280 px and follow *Look here first*.

**Dry run 2026-11-13** (branch `submission-story`, the code of `main` `3c7a4e0`): every
take works as written.

| Take | Observed |
| --- | --- |
| 1 Bug | Old build: Ctrl-C ended PRAMAN and `/bin/sleep 30` was still running; current build: exit 130, `insufficient_evidence`, nothing left |
| 3 Proof (CLI) | `Outcome: passed`, exit 0; `before` `orphan: yes`, `current-1..3` `orphan: no` |
| 3 Proof (Kiro MCP) | headless `praman-explorer`, `sess_da6546e1…`: `passed`, named check failed on the baseline, 3/3 current |
| 4 Code | old lines 69–71 and new lines 93–100 match the excerpts above |
| 5 Gate | headless, separate `/tmp` project, `sess_788cd3e1…`: turn 1 gate `failed` (prints `11`), agent read the gate report and fixed the start value; turn 2 (`--resume-id`) gate `passed`, rejection counter back to 0 |
| 6 Judge | 12/12 expected outcomes, exit 0, about 17 s |
| 7 Report | headless `praman-explorer`, `sess_2aa3f753…`: create from the world, verify `failed` (3 users `passed`, peak 3, invariant 0 failed in both repeats), destroy `passed`; `REPORT.html` from `file://`: 8/8 images loaded, 0 non-`file:` requests, card *Expected 7, Observed 4*; no seeded secret or home path in the page; Colima stopped again, no owned container or process left |

Earlier dry run 2026-11-09: takes 3, 4 and 6 worked; takes 1 and 5 were not rehearsed
then.

Optional: produce segments 0:51–1:56 with PRAMAN's own proof-gated
`command-demonstrate`. That surface is frozen since the 2026-11-05 cleanup, so it needs
a dry run with `command-preview` first and the owner's approval.

## Recording checklist

### Before recording

- [ ] Read [video-guidelines.md](video-guidelines.md) and this storyboard end to end.
- [ ] `npm ci && npm run build`; Chromium installed; dry-run every take into `/tmp`.
- [ ] Rehearse the narration with a timer; target 2:45–2:55 with pauses.
- [ ] Clean desktop: no notifications, personal tabs, usernames, home paths, emails
  or credentials on screen; generic prompt.
- [ ] Decide whether the `REPORT.html` frames may be public (see the report scene).

### While recording

- [ ] Real output only; if a run fails, show it or retry into a fresh directory and
  say so. Never splice another run's output under a command.
- [ ] Keep each verdict line readable for at least 3 seconds.
- [ ] Label the baseline as caller-declared history, the report scene's rule as wrong on
  purpose, and the gate demo as separate.

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
repair mode (baseline `orphan: yes`, current `orphan: no` 3/3); one offline page shows a
failed run's verdict, broken rule, expected and observed values and screenshot; the finish
gate sends an agent back on a failing check.

**Label:** the baseline is caller-declared history; the report scene's rule is wrong on
purpose and the app data is sample data; the gate scene is a separate small demo; any
sped-up playback.

**Avoid:** "Kiro built PRAMAN", "sandbox", "autonomous testing", "proves the app is
correct", "found a bug in Shiori", "zero-config", or a link that does not resolve.

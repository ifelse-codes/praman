# PRAMAN submission video — storyboard (≤3:00)

**Status:** recording plan, not a recording. No video has been recorded or uploaded;
`<DEMO_VIDEO_URL>` is a placeholder for the Devpost field. Nothing here authorizes
publishing — record only when the submission work is approved.

**Format:** public YouTube video, hard limit 3:00 (target 2:55), 16:9,
1920×1080 or 2560×1440, 30 fps, H.264/AAC, one conversational speaker, captions
optional (burned-in or YouTube). Follow the [video standard](video-guidelines.md):
explain what is wrong, what changed and what was delivered in plain language; no
action-note narration, no raw logs, no full diff, no green-check montage.

**Honesty rules:** every frame of live software is a real run. The repair segment
uses the archived 2:49 Headlamp walkthrough (real PRAMAN recording) with a new
voice-over. On-screen paths use `$PRAMAN` and `/tmp`; never show home directories,
usernames, session IDs, email addresses, credentials or private infrastructure.

## Summary timeline

| Time | Segment | Spoken words (guide) |
| --- | --- | --- |
| 0:00–0:25 | Problem: AI code, trust gap | 57 |
| 0:25–0:50 | What PRAMAN is: agent writes, PRAMAN verifies | 60 |
| 0:50–1:35 | Live demo: `scenario-verify` + `command-verify` and evidence | 77 |
| 1:35–2:05 | Real repair excerpt: archived Headlamp walkthrough | 69 |
| 2:05–2:30 | MCP + evidence model: 12 expected outcomes | 53 |
| 2:30–2:50 | Honest limits | 45 |
| 2:50–3:00 | Closing card | 19 |

**Narration total: 380 words ≈ 2:27–2:43 at 140–155 words per minute.** The
remaining time is scene holds and live execution; do not pad with filler. If a
take runs long, cut setup, never explanations and never checks.

## Segment detail

### 0:00–0:25 — Problem: AI code and the trust gap

**On screen:** quiet montage. A real build log line (`build passed`) over dimmed
code; cut to the release page from the demo; title overlay: *AI wrote it. Does it
work?* No fabricated incident, no fake dashboard.

**Narration:** "AI can write a lot of code now. The hard part is knowing whether it
actually works. A clean build and a few passing tests can still hide a broken
screen or a wrong value. So we end up trusting the agent's summary instead of the
software. That trust gap is what PRAMAN is built to close."

**Edit notes:** no music sting or marketing tone; leave 0.5 s of silence before
the next line.

### 0:25–0:50 — What PRAMAN is

**On screen:** animated loop diagram — *coding agent → PRAMAN → passed / failed /
insufficient_evidence* — then a readable excerpt of a real `REPORT.md` verdict line.
Text overlay: *Agent writes. PRAMAN verifies.*

**Narration:** "PRAMAN is an evidence-first verification layer for AI coding
agents. The agent still writes and fixes the code. PRAMAN runs declared browser or
command checks against the real software, repeats them in fresh sessions, and
returns a verdict you can inspect: passed, failed, or insufficient evidence. It
shows what it observed — and missing evidence never becomes a green check."

### 0:50–1:35 — Live demo: browser and command verification

**On screen (real terminal, font ≥18 pt):**

```sh
export PRAMAN=/path/to/praman
node "$PRAMAN/dist/cli.js" scenario-verify \
  /tmp/praman-demo/site/release-acceptance.json -o /tmp/praman-demo/browser-01 --summary
# Outcome: passed      (exit 0)

node "$PRAMAN/dist/cli.js" command-verify \
  /tmp/praman-demo/command-pass.json -o /tmp/praman-demo/command-01 --summary
# Outcome: passed      (exit 0)
```

Then cut to the same runs' artifacts in an editor: `REPORT.md` (*Verdict: passed*,
declared checks, scope line), `feedback.json` (`"verdict": "passed"`) and the
`verdict` field in the run's private `proof.json` (show the verdict/check lines
locally; do not present private proof as a sanitized public export). Add one real
evidence screenshot from `browser-01/after-1/check-1.png`, labeled as evidence from
this run. Optionally flash the target page briefly before the run.

**Narration:** "Here's the browser route. I declare a small release page and what it
should show, then run scenario-verify. Two fresh Chromium sessions run the same
steps and checks. The verdict is passed, exit zero. Next, command-verify. Same
contract: explicit executable, expected exit, stdout and artifact checks, two
repeats. Passed again. The REPORT and feedback files hold the verdict, the observed
checks, and the next action. I'm not trusting a summary; I'm looking at what the
run recorded."

**Edit notes:** jump-cut between invocation and result is allowed; the shown output
must be from that same invocation. Keep each verdict line on screen ≥3 s. If a run
unexpectedly fails, show it and say so — do not splice a different output.

### 1:35–2:05 — Real repair evidence from the archived Headlamp walkthrough

**On screen:** a 30–45 s excerpt of the archived 2:49 narrated Headlamp walkthrough
(real PRAMAN recording, 1280×720 — pad/scale to 16:9, keep text uncropped). Order:
the real failure, one focused code scene, the fixed tooltip. Mute the clip's
original narration and play this segment's voice-over instead.

**Narration:** "This clip comes from an earlier PRAMAN Headlamp cycle, not from
Kiro's recorded session. Headlamp's link crashed when a tooltip was used — the
error says getName is not a function. The fix called getName on the right object
and forwarded the DOM reference the tooltip needed. Same action afterwards: the
tooltip opens, no crash. Before, code, after — the walkthrough is generated only
after the repair passes verification."

**Required lower-third (full duration of the clip):**
*Earlier PRAMAN Headlamp cycle — not Kiro's recorded session. Source: archived
2:49 narrated walkthrough.*

See [the clip map](#archived-headlamp-clip-map) below for candidate in/out points.

### 2:05–2:30 — MCP and the evidence model

**On screen:** split screen. Left: a real MCP client config fragment
(`mcpServers → praman → command/args: node …/dist/cli.js mcp`) and a short,
readable list of the 14 tools. Right: a real run of
the public first-use runner showing its 12 outcome lines (pass / mismatch /
unavailable, browser and command). If the run is shown sped up or jump-cut, label
it *shortened playback*; never edit the outcome lines.

**Narration:** "The same engines run over MCP. I add PRAMAN as a stdio server and
the agent calls the tools directly. PRAMAN's public first-use runner exercises
twelve expected outcomes across CLI and MCP — pass, mismatch, and unavailable.
All twelve behave as documented, and the negative controls stay red. Missing
evidence never becomes green."

**On-screen note to keep visible:** *12 expected outcomes — the red lines are
deliberate negative controls, not bugs. Exit codes 0/1/2.*

### 2:30–2:50 — Honest limits

**On screen:** three plain text cards over a dimmed real PRAMAN screen:
*Not a sandbox — commands run with your authority* · *Authored checks, not
autonomous discovery* · *Same-host validation · no published package yet*.

**Narration:** "Limits, honestly. PRAMAN is not a sandbox — commands run with your
user's authority. The checks are authored, not discovered automatically.
Validation is same-host only, and there's no published package yet. The demo is
evidence of the checks it shows, not proof of whole-application correctness."

### 2:50–3:00 — Closing

**On screen:** closing card: *PRAMAN (प्रमाण) — evidence*; **Source:
`https://github.com/ifelse-codes/praman`**; *Kiro usage write-up in `docs/kiro-usage.md`*; *Thanks for
watching.* Fade out. Do not put `<DEMO_VIDEO_URL>` on the video itself; that
placeholder belongs in the Devpost field.

**Narration:** "PRAMAN — evidence before you ship. Source and the full Kiro usage
write-up are linked below. Thanks for watching."

## Demo setup (plan once, before recording)

Run everything outside the repository; do not create `.praman/` in the PRAMAN
checkout.

1. Build PRAMAN and install Chromium (see [first use](first-use.md#1-setup-once)):
   `npm ci && npm run build`, `npx playwright install chromium`.
2. Create a disposable fixture under `/tmp/praman-demo/site` from the runnable
   delayed-navigation example in
   [static browser acceptance](static-browser-acceptance.md#runnable-delayed-navigation-example):
   `index.html`, `release.html` and `release-acceptance.json` with
   `afterUrl: "http://127.0.0.1:8080"`.
3. Create `/tmp/praman-demo/command-pass.json` from the public JSON-total
   declaration in [README's tested source setup](../README.md#tested-source-setup).
4. Start the owned loopback server from the fixture directory:
   `python3 -m http.server 8080 --bind 127.0.0.1`. Stop it afterwards; never adopt
   or kill someone else's server.
5. Dry-run both commands into throwaway output directories and confirm
   `Outcome: passed` with exit 0. For the recorded take use fresh directories
   (existing output directories are refused).

## Archived Headlamp clip map

Planning anchors only — confirm exact in/out points on the archived 2:49 encode
and trim on real scene boundaries. Previously inspected frames: 0:12 (failure),
0:50, 1:40, 2:30.

| Clip intent | Approx. range in 2:49 movie | What must be visible |
| --- | --- | --- |
| Failure | ≈0:08–0:22 | Real Headlamp UI with the red error text `props.getName is not a function`; start on the visible symptom, not a stack dump |
| Code | ≈0:50–1:20, one of the movie's five code scenes | One focused source beat: the wrong receiver and the DOM-reference plumbing, readable lines, one idea |
| Fixed | ≈2:30–2:45 | Same action showing the link and the working tooltip (`praman-proof`); no re-created UI |

Total excerpt target 30–45 s. The movie's own narration and captions may be kept
only if the narration still matches this script; otherwise mute it and re-record.
Do not imply this clip is a fresh run made for the submission video or that Kiro
performed this repair.

## Optional alternative: archived jq 0:52 short cut

The external archive also holds an accepted **0:52 short command walkthrough for a
jq repair** (a real recorded command verification) and a longer jq cut.

- Use it only if a live CLI capture for 0:50–1:35 is blocked.
- Trim it to ≈45 s to keep the timeline, or extend that segment by ≤7 s and trim
  the closing/limits time; total must stay ≤3:00.
- Required lower-third: *Archived command walkthrough — recorded earlier, not a
  fresh run for this video.*
- It demonstrates the command route only, not browser verification; keep the
  MCP/12-outcome segment so the evidence model is still shown.
- The archive is external (see [ARCHIVE.md](ARCHIVE.md)); do not claim a public
  link until the clip is actually uploaded.

## Recording checklist

### Before recording

- [ ] Read [video-guidelines.md](video-guidelines.md) and this storyboard end to end.
- [ ] Build, install Chromium, and finish a clean dry run of both demo commands.
- [ ] Create fresh `/tmp` output directories for the recorded take; no `.praman/` in the repo.
- [ ] Rehearse the 380-word narration with a timer; target 2:45–2:55 including pauses.
- [ ] Confirm the archived 2:49 Headlamp movie and the 0:52 jq short cut are available; write down the exact trims you will use.
- [ ] Clean the desktop: no notifications, chat windows, bookmarks, tabs or personal files visible; terminal prompt generic (no username/hostname); no home paths, session IDs, emails or credentials on screen.
- [ ] Set 16:9 resolution, 30 fps, terminal font ≥18 pt, browser zoom 100 %, consistent light/dark theme.
- [ ] Test the microphone and screen-capture levels; no music needed.

### While recording

- [ ] Record each segment as a separate take; real output only, no fabricated success.
- [ ] If a demo run fails, show it or retry into a fresh directory and say so in narration; never splice a different run's output under the command.
- [ ] Keep verdict lines and the report's `Verdict: passed` readable for ≥3 s.
- [ ] Show `REPORT.md`, `feedback.json` and the `proof.json` verdict from the same run as the command on screen.
- [ ] Add the required lower-third on the archived repair clip and on any shortened playback; label archived material.
- [ ] Keep narration conversational and matched to what is on screen; do not read test IDs or dump logs.

### After recording

- [ ] Watch the full video with sound; check every claim against
  [STATUS.md](STATUS.md) and [kiro-usage.md](kiro-usage.md). No "Kiro built PRAMAN",
  no sandbox claim, no whole-application correctness, no invented links.
- [ ] Verify encoded duration ≤180.0 s (target ≈2:55), audio present, captions
  accurate, 1080p, no private data in any frame.
- [ ] Replace `https://github.com/ifelse-codes/praman` on the closing card with the real public URL and
  confirm it opens.
- [ ] Upload as a public YouTube video, then set `<DEMO_VIDEO_URL>` in
  [the Devpost copy](devpost-draft.md); do not claim an upload before the URL exists.
- [ ] Stop the owned server and clean up `/tmp` demo directories as desired;
  preserve the archived source clips.

## Claims: keep, label, avoid

**Keep:** one real Kiro IDE session on one bounded Headlamp feature, disclosed in
[kiro-usage.md](kiro-usage.md); PRAMAN verifies with authored checks and repeated
runs; missing evidence never becomes green.

**Label:** the repair clip is an earlier PRAMAN cycle, not Kiro's session; the jq
clip is archived, not fresh; the 12-outcome matrix includes deliberate negative
controls.

**Avoid:** "Kiro built PRAMAN", "sandbox", "autonomous testing", "proves the app is
correct", "zero-config", or any link that does not resolve. The submission's
verified-capability and limit lists live in [devpost-draft.md](devpost-draft.md).

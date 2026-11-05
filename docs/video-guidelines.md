# PRAMAN video standard: explain the repair, not the test machinery

The approved **repair** standard explains what was wrong, why it mattered, what changed and what was delivered. It remains the default storytelling reference, not a requirement to manufacture a broken past for acceptance.

Technical proof and viewer understanding are separate requirements. A movie that decodes correctly or shows green checks can still fail this standard.
## Match the declared verification mode

Verification does not require a movie. Only record when the user authorizes
presentation work; fresh proof is necessary, not authorization by itself.

- **Acceptance:** purpose/stakes → current workflow and declared requirements →
  visible outcome → scope/limits. Browser `walkthrough` contains `startStep` and
  `after` beats only; command plans contain `walkthrough.after` only. Omit `before`,
  `code` and recording `diffPath`. No old failure, repaired-code scene or synthetic
  history is required or permitted by this story structure.
- **Repair:** retain the full before/code/after standard below. The declaration
  requires `mode: "repair"`, `baselineKind: "historical"`, a genuine baseline and a
  named regression. The named old check must fail, all other old checks and every
  repeated current check must pass. For commands the baseline exit must match too.
- **Comparison:** authored baseline/current beats (`before` and `after`), optional
  `code`; browser stories also need `startStep`. The baseline need not fail.
  Explain observed differences without asserting a historical repair. Use explicit
  `baselineKind: "synthetic"` for manufactured negative controls, `unattested` for
  baselines without a historical claim, or `historical` for a caller-attributed
  historical baseline. A synthetic control can validate a declared check, not prove
  that an actual past release contained the defect.

Recorders use mode-specific stage labels and retain mode/baseline attribution in
delivery/provenance. All required current/baseline live replays must match fresh
proof. Missing voice/evidence or replay drift blocks movie delivery without
rewriting the verification result. Local URLs/hashes and caller-attributed history
are not signed source/build/historical provenance.

The remaining failure/cause/fix authoring instructions apply to **repair**. For
acceptance/comparison, substitute the corresponding honest story above; preserve
the same conversational voice, readable focus, actual evidence and limits.


## Browser readiness and rendered text

Author workflow readiness before presentation timing. After a navigation click
or `goto`, add `waitFor` on a visible application-owned ready state; a
`waitForURL` only confirms navigation. Put result narration on that ready step
with `at: "after"` (all step indexes are zero-based). `startStep` trims footage,
not setup execution. Do not attach a result beat to the click/URL wait and rely
on its speech duration to let content arrive; proof runs without those holds.
Avoid arbitrary sleeps and selectors already visible during loading.

Text checks observe rendered `innerText`, including CSS `text-transform`; source
`Released` rendered uppercase needs `equals: "RELEASED"`. Equality remains exact,
not normalized; form `value` checks observe the input value instead.
The [runnable browser authoring example](static-browser-acceptance.md#authoring-text-checks-and-navigation-ready-story-beats)
includes a delayed page, explicit readiness, rendered-casing assertions and
current-only story beats. It can be verified without speech or movie generation.

## Story order

1. **Purpose and stakes.** Explain the tool/workflow and what the person is trying to do. Use concrete, readable inputs. Label simulated business data as sample data; do not manufacture a production incident.
2. **Visible failure.** Perform the smallest real action that exposes the problem. Say what should have happened and point to what actually happened. Show the user-facing surface before raw diagnostics.
3. **Cause, with a boundary.** Explain the mechanism in ordinary language, then connect it to source evidence. Distinguish a verified observation from a proposed root cause. Clarify what is *not* being repaired when a sample message could be mistaken for the actual defect.
4. **Relevant code, one idea at a time.** Show the actual file and numbered old/new lines. Explain the original mistake, then the replacement rule and why it changes behavior. Usually 3–8 lines per beat; split long expressions/explanations into smaller views. Never shrink a full diff until it fits or speak a wall of identifiers. Before/after refers to versions, not “the left/right column”.
5. **Same action, corrected result.** Run the same workflow with the same declared checks and relevant inputs. Explain what now works and what intentionally remains unchanged. Do not hide the symptom by disabling the feature being tested.
6. **Delivered outcome and limits.** Briefly connect the repeated proof to the visible result, say what was delivered, and link the movie from the evidence report. Do not narrate every test ID, operation, setup command or assertion. Do not imply whole-application assurance.

Include an additional readable baseline only when it helps explain the failure. Keep it distinct from the acceptance comparison and record which command/settings differ.

## Language and pacing

- Speak like a teammate walking another person through a repair: short sentences, concrete nouns, ordinary verbs. Useful detail, not ceremony or marketing.
- Explain a necessary technical term at first use. Say what an expression *does*, not just its spelling. Do not assume the viewer knows the application, protocol or bug history.
- Each spoken beat answers one question and points at one visible thing. Narration must match what is on screen at that moment. Avoid introducing a mechanism while unrelated output is displayed.
- Give the person time to see the failure and the fix. Run the no-speech story preflight first; then generate speech, measure it, and hold the actual scene for its duration. Trim setup footage, not setup execution or acceptance checks.
- Default to the approved conversational voice style. When Vatra is used, the reference voice is `af_heart`; configure `PRAMAN_VATRA` explicitly. Other engines must be identified. Do not describe a silent captions-only result as an equivalent narrated delivery without approval.
- Do not enforce an arbitrary runtime at the cost of clarity. Remove repetition before removing the explanation. Prefer a small useful source focus to a longer inventory of changed files.

## Visual rules

- Use the real surface: browser workflow for UI behavior; a real terminal renderer for terminal control/color behavior. A browser-hosted terminal renderer is not native desktop capture—label it accurately.
- Raw output dumps, byte escapes and network traces are secondary evidence, not the main story. If essential, introduce a tiny explanatory excerpt after the visible problem. Label diagrams/illustrations separately from observed execution.
- Show one source focus at a time, in a readable font with filename, version and line numbers. Keep the complete unmodified diff in evidence. Never reconstruct missing lines or imply a supplied diff proves deployment identity.
- Use a sharp focus aperture with dimmed/blurred surroundings to guide attention. Do not clone/replace the target widget or conceal relevant contradictory results. Keep captions away from the focused region.
- Preview the actual failure, code and fixed scenes before the long capture. Inspect encoded frames afterward; a successful encoder exit is not a visual review.

## Authoring prompt for any coding agent

Use this prompt with actual observed evidence and the current scenario schema. It is a reusable authoring instruction, not a claim that PRAMAN automatically diagnoses software or writes a good story.

> Prepare a PRAMAN walkthrough for a person unfamiliar with this application.
> Read `AGENTS.md`, this video standard, and the declared acceptance/proof evidence.
> Explain: what the person is trying to do; the expected behavior and visible failure;
> why that failure matters; the source-backed mechanism; the original code mistake;
> the smallest relevant repair and why it works; the same action after repair;
> what is delivered, preserved and not verified.
>
> Output a scenario `walkthrough` using the existing `startStep`, `before`, `code`
> and `after` fields. Write conversational speech, not test instructions. Anchor
> before/after beats to real actions and selectors. For a source change, supply
> real `code.excerpts` and `code.beats` with exact file/version/line `focus` ranges.
> Explain one idea per beat, usually 3–8 source lines. The renderer displays one
> focused range at a time; never refer to a left/right column. Add an opening beat
> for context/impact and a closing beat for the observed delivered outcome/limits.
> Use meaningful inputs; label samples. Do not invent a root cause, missing source,
> deployed version, business incident, output or successful check. If required
> evidence is missing, identify it rather than filling the gap with a claim.
>
> Before recording, review the spoken story against the actual surface. Can a new
> viewer answer “what is broken?”, “why does this code fix it?”, and “what did we
> deliver?” If not, rewrite the story. A syntactically valid plan is not approval.

For CLI/system campaigns, apply the same story and review criteria through
`command-demonstrate <plan> -o <fresh-directory>` or MCP
`praman_command_demonstrate({ planPath, outDir })`. The plan references
`commandsPath` and optional `diffPath`; its `walkthrough.before`/`after` beats use
`text`, `stream` (`stdout` or `stderr`) and inclusive one-based rendered terminal
row `from`/`to`, not browser steps/selectors. `walkthrough.code` uses the same exact
source excerpts/focused beats described above. There is no CLI `startStep`.
See README's [command-video contract](../README.md#proof-gated-command-video-delivery).

This recorder runs both real commands again during capture and requires exact
output/artifact/exit/executable agreement with fresh command proof. Its xterm.js
surface renders pipe output in a browser: **not native terminal/TTY capture**,
not an interactive shell and not browser acceptance of the CLI tool. Preserve
this label in the movie/report. Narration is required; a silent fallback, changed
acceptance contract or saved-only output must not become successful delivery.

## Runtime contract and migration

Acceptance scenarios may omit `walkthrough` when used only for verification. **Video recording requires an authored walkthrough**; action notes are no longer silently narrated as a substitute. Missing story blocks movie delivery without changing acceptance proof.

If `diffPath` is present, recording also requires explicit `code.excerpts` and non-empty `code.beats`, each with a valid focus. Up to eight excerpts may be declared, at most twelve consecutive lines each, entirely present on the requested side of the diff. Each beat shows only its focus—not all excerpts in columns. Split a focus that does not fit; overflow blocks delivery instead of reducing readability. Schema-valid acceptance alone does not authorize recording.

A no-diff walkthrough may present an explicitly author-supplied explanation, but must not claim to show independently verified source. Historical evidence stays unchanged; author a current plan before recording it again. Shipped examples use the current contract. Missing narration engine, source, focus, execution or replay evidence must not become a fabricated success.

### No-speech story preflight

Browser and command recorders now preflight the authored story automatically
before invoking speech. Browser steps execute in order, including setup, with
focus inspected at each beat's actual `before`/`after` position. Source and
terminal scenes use the capture renderers. Browser caption chunks use the same
splitting as the eventual speech. No audio/video is generated in this pass.

The shared spotlight checks visibility, complete viewport fit and caption
viewport/focus separation. Targets or padded apertures covering at least 80% of
viewport area are rejected as too broad. Each browser, terminal or source beat
may specify `framing: {caption: "auto"|"top"|"bottom", padding: 0..32}`.
Padding is an integer viewport-pixel margin around the full target; the default
is 8. It clips only at viewport edges, never crops/retargets the selected content.
Omitted/`auto` caption placement retains existing bottom/top selection. Explicit
top/bottom placement is honored or blocked, never silently changed. Caption fit,
readable source/terminal bounds and focus separation remain mandatory; shorten
the beat, split the source focus or explicitly choose a narrower selector when
needed. These checks detect geometry errors, not whether the widget is meaningful.

Private `video/preflight/preflight.json` and scene PNGs describe a
`kind: "story-preflight"`, `proof: false` pass/block result. Failed receipts identify
the stage/beat and browser step/position when reached; raw details remain private.
Preflight executes real actions/commands and can mutate external state. Use the
same caller-owned isolation/reset discipline as proof/replay; no saved evidence
is a substitute for executing the declared workflow.

Run `preview <scenario.json> -o <fresh-directory>` or
`command-preview <plan.json> -o <fresh-directory>` before recording. MCP exposes
`praman_preview({scenario,outDir})` and `praman_command_preview({planPath,outDir})`.
Both reuse these preflights without speech or movies; the output must not exist.
The safe result/`feedback.json` contains explicit non-proof status, scene indexes,
private PNG/receipt paths and indexed blocked diagnostics, not application text.
Private `preflight/preflight.json` retains geometry and errors. CLI exits 0/2 for
passed/blocked previews; MCP `isError` reflects blocked status. Complete requirement
mismatches can still pass layout preview; missing execution/evidence cannot.

Programmatic wrappers are `previewChange(specOrPath, freshDirectory)` and
`previewCommands(planPath, freshDirectory)` in `src/core/preview.ts`.
Lower-level `preflightChangeWalkthrough` / `preflightCommandWalkthrough` remain
available for resolved declarations, returning a receipt object/private receipt
path respectively. Their destination must be fresh (browser parent must exist).
Narration text must contain a non-whitespace character; invalid/blank stories
are rejected before actions or speech. Command preview and delivery share the
same declaration-relative plan loader and mode/story validation.

A passing preview does not establish a later run, narration timing, deployed
source identity or human understanding. Final fresh proof, matching capture
replays, narration and encoded playback review are unchanged requirements.
Group 10 speech reuse runs only after this preflight; it never replaces it.
Short composition uses these same preflight and recording paths.

Recording CLI/MCP results and reports expose safe indexed `diagnostics`, not raw
exceptions or application text. Use `demonstrate --summary` or
`command-demonstrate --summary` for outcome, first failed beat/step when known,
direct private evidence and next action. Inspect the private receipt locally;
unknown positions are omitted and successful preflight positions are never
reused as later failure locations. Diagnosis does not relax any final proof gate.

Browser demonstrations require absent or empty output directories; keep inputs
elsewhere. Reuse is rejected without deleting existing proof or publication files.
Direct browser recording requires no existing movie/video directory. Both default
and summary browser CLI output include indexed recording diagnostics.


## Short composition (Group 9 / F08)

Keep one authored story and verification declaration. Standalone browser/command
`demonstrate` and `preview` commands accept `--cut full|short` (default `full`);
the four corresponding MCP tools accept optional `cut: "full" | "short"`.
Use fresh destinations for each cut. Both deliveries verify freshly and replay
the complete original workflow; a full movie, preview or cached media cannot
authorize a short movie.

Add `walkthrough.short` once, referencing zero-based beat indexes in the original
`before`, `code.beats` and `after` arrays:

```json
{
  "maxDurationSeconds": 60,
  "context":     {"stage":"before","beat":0},
  "failure":     {"stage":"before","beat":1},
  "cause":       {"stage":"code","beat":1},
  "fix":         {"stage":"code","beat":2},
  "outcome":     {"stage":"after","beat":0},
  "attribution": {"stage":"code","beat":2},
  "limits":      {"stage":"after","beat":1}
}
```

This repair example assumes those beats already exist; indexes are not defaults.
All references must exist. `context`, `outcome`, `attribution` and `limits` are
required. Repair also requires a `before` failure and `code` cause/fix.
Comparison instead requires `baseline` pointing to `before`; it forbids repair
roles and keeps its original historical/synthetic/unattested label. Acceptance
permits only `after` references and no baseline/repair roles. `outcome` must
always point to `after`. Multiple roles may share one beat; it is presented once,
in original story order. A code explanation without `beats` has one beat, index 0.
When a diff is supplied, selected source scenes must still satisfy the ordinary
exact-excerpt/focus requirements.

Selected beats retain their real selectors, step/position, terminal rows, source
focus and framing. Full/short selection chooses the spoken **text** first;
only identical effective speech inputs may share cached audio. An optional
per-beat `shortText` supplies a concise spoken/caption variant
without copying the workflow or reauthoring its source focus. `code.shortText`
serves the single explanation when there are no code beats. Full cuts still use
the original `text`. Author both variants from the same evidence: never omit a
contradiction, change authorship, invent a failure, or broaden the coverage claim.
Role labels are author assertions; PRAMAN does not infer their meaning or certify
that a viewer understands the story.

`maxDurationSeconds` is an integer budget from 45 to 60, default 60. The recorder
checks measured speech holds and final encoded duration. Overflow blocks delivery
without changing acceptance proof; shorten/split the authored speech or choose
better essential beats. No faster speech, clipping, cropped evidence, smaller
fonts, deleted acceptance actions/checks, or silent fallback. A useful shorter
story is not padded to 45 seconds. The final workflow can exceed its budget even
when speech alone fits; it is never cut into false matching evidence.

Private preflight and `video/tour.json` record `composition.cut`,
`sourceStoryHash`, original `selectedBeats`, role references and short budget.
Full and short share the SHA-256 of the **entire original authored story** and
the original verification spec hash; command plans additionally retain their
input-file identities. Different fresh proof timestamps are expected. These local
hashes establish traceability within the recorded boundary, not signed history or
deployed-build identity. Reports identify the cut and story hash.

Review both cuts for the mode-appropriate story, readable essential evidence,
credit and limits. Check measured duration, captions, narration, seek/playback,
full decode and representative encoded frames. Preserve prior movies and raw
proof. Human listening, comprehension and preference approval remain separate
from structural/media checks.

## Speech reuse (Group 10 / F02)

Both recorders use the shared [speech asset contract](../README.md#speech-asset-reuse-group-10--f02).
Changing framing alone can reuse unchanged narration, not prior proof or replay
authority. Each per-run audio copy is integrity-checked, remeasured and fully
decoded; caption holds and short budgets still use those measured seconds.
Missing/damaged/unreadable entries explicitly block delivery. Private speech
receipts are `proof:false`; provider/key/privacy boundaries are in the contract.
No new movie was authorized for Group 10 verification, so cached-audio encoding,
final captions/playback and human speech/story review were not revalidated.


## Delivery review

Before publishing a movie as complete:

- Mode-specific proof exists: current-only acceptance, complete labeled comparison,
  or named old failure and repeated fixed passes for repair. Recording replays agree.
  Explicitly separate extra baselines, synthetic controls and diagrams.
- A viewer can answer the three comprehension questions above from the movie itself. Review language and causal claims, not keyword counts. Human preference/approval is separate from technical verification.
- Actual source, actions and results are readable. Verify playback/seek, complete audio/video decode, narration presence, and representative encoded frames (failure, code, fix). Record limitations honestly.
- Save video, report link, captions, measured narration timeline, replay provenance and relevant source/output evidence. Report what checks were exercised and what remains outside scope.
- Remove temporary drivers, tear down only owned resources, restore changed runner state, and protect raw secrets. Preserve prior accepted cuts, rejected-cut history and truthful authorship.

The approved private reference cut is indexed in the master handoff. Its target-specific log examples and implementation are not product dependencies. Reuse its clarity and pacing, not its target names, lines, credentials or business story.

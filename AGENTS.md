# PRAMAN — repository rules for coding agents

## Read before work

Read this file, then [current project status](docs/STATUS.md) and [README](README.md). The status file owns current state and remaining release work; raw proof/evidence and process documents live in an external archive outside this repository (see [the cleanup note](docs/ARCHIVE.md)). Update the status file in place rather than appending repeated session logs. Read README's application integration contract before changing managed environments.

## Standing user decision: keep the product clean

PRAMAN augments existing coding agents with realistic environments, execution, stimulation, verification, evidence and actionable feedback. The coding agent implements/fixes target software. PRAMAN is not a Kan/Headlamp development project and must not become a collection of application-specific demonstrations.

**Dogfooding validates PRAMAN; it must not dictate PRAMAN's core architecture.** This is an explicit user requirement, not an optional refactoring recommendation.

- No target names, selectors, routes, credentials, seed data, framework config patches or application business rules in core lifecycle, schemas, proof/feedback, CLI or MCP dispatch.
- New applications use the declaration-selected integration contract. Do not add an app-name registry, special-case branch or bespoke core tool to make a dogfooding run pass.
- Keep application-specific integration code/config/scenarios in the target project or clearly separated `examples/<target>/` assets. Do not add another compiled product integration merely for a trial or demo. Target-specific reference integrations were removed from the product in the 2026-11-05 cleanup under explicit owner authorization and are preserved in the external archive; do not re-add compiled target integrations to the product.
- Promote code into shared production modules only when it implements a genuinely application-independent PRAMAN capability. Name the product contract and its behavior; merely renaming target-specific logic “generic” is not decoupling. Prefer the existing integration boundary over a speculative framework.
- Third-party fixes belong in their own checkout. Never copy patched application implementation into PRAMAN core or silently modify a target as part of verification. Preserve source/proof identity and truthful authorship.

## Tests, fixtures and evidence

Legitimate PRAMAN regression tests are required engineering work, not “testing pollution.” Keep tests about consumer-visible product behavior and invariants, using isolated deterministic fixtures. The normal test suite must not depend on private campaign directories, running Kan/Headlamp instances, personal credentials or a developer's live infrastructure.

- Target-specific dogfooding scenarios/seeds/plugins belong in examples or the target project, not production core or generic default checks.
- Put new private runtime evidence and campaign outputs under ignored `.praman/`, not new top-level proof/demo directories. Never commit raw credentials, sessions, signed URLs or network captures.
- Throwaway smoke/audit drivers are temporary: remove them after verification; retain necessary private inputs/results and summarize the actual evidence in the current project status.
- Accepted proof/movie history and source snapshots were moved to the external archive on 2026-11-05 under explicit owner authorization; the repository itself no longer stores raw evidence.
- A target's expected outage, missing evidence or setup failure is not an application defect and must never become green proof. Do not weaken checks, add fake responses, disable auth limits or hardcode a result to complete a demonstration.

## Standing video standard

Read `docs/video-guidelines.md` before authoring or changing any video/prompt.
This is a product-wide user requirement, not a dogfooding-target preference:
the viewer must understand what was wrong, why it mattered, what code changed,
why that fixes it, and what was delivered—in easy, conversational language.

- Show a meaningful real failure before diagnostics; explain one small source
  focus at a time; repeat the same action after repair; finish with evidence and limits.
- Preserve the approved conversational narration and sharp-focus/dimmed-surroundings
  style. Do not substitute action-note narration, raw escape dumps, a full diff,
  unexplained jargon or green checks for a story. Use the reusable authoring
  prompt and comprehension/delivery checklist in the guidelines.
- Coding agents author evidence-backed stories; PRAMAN enforces recording/proof
  structure. Structural validation is not a guarantee of human understanding.
- Those failure/fix story requirements apply to `mode: "repair"`. Current-only
  acceptance uses an authored current `after` story; comparison uses explicitly
  labeled baseline/current evidence. Follow `docs/video-guidelines.md` for the
  mode-specific contract; never invent a failure or weaken historical repair gates.
- Keep this standard application-independent. Reference movies, runtime inputs,
  target code and particular scenarios are evidence/examples, never core defaults.


## Required review before delivery

1. Identify the reusable PRAMAN capability separately from the chosen dogfooding target.
2. Check that core imports/schema/dispatch have not acquired target-specific knowledge; verify the declaration/integration boundary and all affected callers.
3. Exercise the changed real path. Shared integration changes need a non-target-specific regression and evidence from a different real target when claiming cross-application support. A fixture alone does not prove real-app support.
4. Remove temporary scaffolding; keep private evidence separate; tear down only owned resources and restore any runner state changed for the work.
5. Update affected contracts and the current project status with observed verification and remaining limits. Do not claim zero-config or arbitrary CLI/native-UI proof from browser scenarios.

Keep Harbor paused unless the user changes that decision. Do not commit, push, publish, make another movie or submit forms without authorization for that work. Do not start infrastructure just to refresh historical state during a documentation-only session.

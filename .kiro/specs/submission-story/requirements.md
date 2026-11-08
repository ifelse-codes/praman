# Requirements: submission story (video, Kiro write-up, Devpost)

Spec type: feature (requirements-first). Ranked #3 by score impact, but it is a hard
requirement: no video means no valid submission. Presentation is 20% of the score and
the Kiro write-up feeds Technological Implementation.

## Introduction

The current video plan (`docs/video-script.md`) reuses a 2:49 Headlamp clip from an
earlier cycle that Kiro did not produce, and `docs/kiro-usage.md` describes one
86-minute IDE session plus a quota-blocked CLI attempt. Both were accurate on 2026-11-05.
Since then Kiro CLI V3 sessions run in this workspace (session
`sess_bdb9debc-8d36-4e92-bbd9-095eeb828b60`, 2026-11-07, listed by
`kiro-cli chat --list-sessions`), so the quota statement in `docs/STATUS.md` is stale.

This spec turns the work from `kiro-evidence-gate` and `verify-cancellation` into the
submission: one real failure, fixed by Kiro, proven by PRAMAN, shown in under 3 minutes.

## Requirement 1: Demo video

**User story:** As a judge, I want to see in under 3 minutes what problem PRAMAN solves,
how Kiro and PRAMAN work together, and that it works, so I can score impact,
implementation and presentation.

1.1 THE video SHALL be shorter than 3:00, public on YouTube, with no third-party
copyrighted music or trademarks used without permission.
1.2 THE video SHALL follow `docs/video-guidelines.md`: the real failure first, one small
code focus at a time, the same action repeated after the fix, and evidence plus limits
at the end, in conversational narration.
1.3 THE video SHALL show, from recorded sessions: a Kiro spec, the Kiro agent calling
PRAMAN over MCP, the Stop-hook gate refusing to finish on a failing check, the fix,
and PRAMAN's passing repair proof.
1.4 THE video SHALL show the judge route (`node examples/first-use/run.mjs`) producing
12/12 on screen.
1.5 IF a clip was not produced in a recorded Kiro session, THEN the video SHALL not
imply Kiro produced it.
1.6 Recording and upload SHALL happen only after explicit owner authorization.

## Requirement 2: Kiro usage write-up

**User story:** As a judge scoring Technological Implementation, I want a precise account
of each Kiro feature used, so I can assess depth and variety.

2.1 THE write-up SHALL cover each item the rules list: IDE/CLI/Web/Crew, custom agents,
agent hooks, spec-driven versus vibe coding, steering, MCP, property-based testing and
Powers, marking each as used (with evidence), tried, or not used. Owner decision
2026-11-08: the Kiro IDE and property-based testing are not used for new work; the
write-up says so plainly.
2.2 THE write-up SHALL cite session IDs, dates and spec/task numbers for each claim.
2.3 THE write-up SHALL keep the existing disclosure that Kiro did not build PRAMAN's
original core.

## Requirement 3: Submission copy and stale-document fixes

3.1 THE Devpost draft SHALL describe the Kiro + PRAMAN loop and contain the real video URL.
3.2 THE system SHALL correct observed stale statements: README's
`dist/integrations/{kan,headlamp}.js` line, `kiro-crew/` tool names, the STATUS quota
line, and `.kiro/specs/praman-core` (rewrite in EARS form; its "hook kept current" item
is false while the hook file is invalid).
3.3 THE blog and social drafts SHALL match the evidence; the social post SHALL start
with `#KiroweenHackathon26`; publication only with owner authorization.
3.4 THE submission SHALL be saved by Nov 27, 2026, leaving a week before the
Dec 4, 2026 2:00 pm PT deadline.

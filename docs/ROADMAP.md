# PRAMAN — current roadmap (2026-11-05)

**Status: shipped and verified.** Public repository
https://github.com/ifelse-codes/praman (MIT), CI green on Ubuntu and macOS, judge
access via [TESTING.md](../TESTING.md) and Codespaces, project page
https://ifelse-codes.github.io/praman/. Not submitted: the demo video and the Devpost
form are the remaining release blockers.

## Shipped (verified)

- Authored browser and command verification with acceptance/repair/comparison modes and
  2–10 fresh repeats.
- Strict proof gates, evidence-backed feedback, reports and diagnostics; missing evidence
  never passes.
- CLI (16 commands) and stdio MCP (14 tools).
- Optional proof-gated narrated walkthroughs (browser and command); verification works
  independently of video.
- Managed kind/Docker lifecycle, declared HTTP service, workflow replay, coverage review
  and bounded count/duration/durable/agent campaigns.
- Public first-use runner (12/12 CLI and MCP outcomes) and the judge test-build route.
- Cleanup: 5.7 GB of private evidence archived outside the repository; legacy demo
  pipeline and target-specific integrations removed.
- Public MIT repository with .kiro tracked; CI (Ubuntu and macOS) runs the full suite and
  the documented first-use route on Linux; static project page deployed.
- Deterministic source packaging; per-build candidate identity recorded privately, not
  published.

## Frozen for this release window

- Optional surfaces (preview, campaigns, managed environments, recording) are
  implemented and unit-tested, but frozen: no expansion and no new end-to-end claims
  before submission.
- The product surface is frozen; no new features.

## Deferred

- Stateful dependency simulation beyond the declared service; arbitrary world or
  database restore.
- Autonomous discovery and semantic requirement review.
- Native desktop automation.
- Cross-host or distributed campaigns; machine-level Kubernetes campaigns.
- Cached-audio movie review; Harbor adoption.
- npm publishing, Windows support, and the final archive-retention decision.

## Next (owner)

1. Record and upload the <=3 minute demo video; set `<DEMO_VIDEO_URL>` in
   [the Devpost draft](devpost-draft.md).
2. Paste the [TESTING.md](../TESTING.md) judge instructions, save and submit the Devpost
   form (target Nov 26–27; deadline Dec 4, 2026 2:00 pm PT).
3. Publish the blog/social bonus posts during the submission window; decide archive
   retention and npm publishing.

Optional: resolve Kiro credits/quota for one more logged session; run independent-human
validation.

## Guardrails

- No hosted public execution (trusted commands, inherited environment, no sandbox).
- Do not publish raw evidence or the private archive.
- No claims without observed evidence; limits are stated in
  [STATUS.md](STATUS.md) and [release-validation.md](release-validation.md).

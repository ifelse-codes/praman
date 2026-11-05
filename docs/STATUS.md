# PRAMAN — current project status (2026-11-05, release hardening)

PRAMAN (प्रमाण, "evidence") is an evidence-driven verification toolkit for AI coding
agents. An agent supplies an authored browser scenario or command declaration through
the CLI or MCP; PRAMAN executes it against real software, checks the declared
requirements, and returns evidence-backed feedback. It is not a coding agent, not a
general simulator and not a sandbox.

## Current state

- **Committed baseline:** `b0814cd` — "Product: evidence-driven verification toolkit
  after 2026-11-05 cleanup", followed by release-hardening commits (CI, tests, Kiro
  account, video script, Devpost copy, publishing checklist and a reproducible
  candidate identity). The tree is clean at the latest release commit.
- **Checks:** `npm run build` and `npm run lint` pass; `npm run lint:tests` passes;
  the **full suite passes 190 tests / 28 files** in a single-worker run on the
  recorded (loaded) host, including the new dispatch smoke tests. Parallel local runs
  are resource-sensitive while macOS Spotlight/MediaAnalysis indexing saturates the
  CPU; CI uses a bounded worker count. An independent fresh-clone verification of the
  release-hardening commit reproduced the same results (npm ci, lint, lint:tests,
  build, 190 tests, 12/12 first use, 14 MCP tools, PII-free).
- **First use:** `node examples/first-use/run.mjs` → **12/12** expected CLI/MCP
  outcomes (pass / mismatch / unavailable for command and browser), exit codes 0/1/2.
- **CI:** green on **Ubuntu and macOS** (Node 22) — run
  https://github.com/ifelse-codes/praman/actions/runs/42016072422. Each runner
  reports 27/28 files and 174 passed / 16 skipped of 190 tests; the skips are the
  environment-guarded media/speech suites (no ffmpeg/ffprobe on the runners).
- **Interfaces:** 16 CLI commands, 14 `praman_*` MCP tools over stdio.
- **Official rules:** captured from the live Kiroween 2026 rules page on 2026-11-05
  ([rules digest](kiroween-rules.md)). Submission deadline Dec 4, 2026 2:00 pm PT.
  Required: public repo + visible OSS license, `/.kiro` at root, text description,
  demo video under 3 minutes on public YouTube, Kiro usage write-up. **No hosted app
  URL is required**; the repo must contain run instructions.
- **Submission copy:** truthful Kiro account (`docs/kiro-usage.md`), ≤3-minute video
  script (`docs/video-script.md`) and submission-ready Devpost draft with the public
  repository URL filled in and a `<DEMO_VIDEO_URL>` placeholder (`docs/devpost-draft.md`).
- **Release candidate:** rebuilt and sanitized. Packaging is deterministic and the
  procedure is in [release validation](release-validation.md);
  [release-identity.json](../release-identity.json) documents the per-build procedure
  and is excluded from the archive itself.
- **Submission assets:** captured official rules ([kiroween-rules.md](kiroween-rules.md)),
  truthful Kiro account ([kiro-usage.md](kiro-usage.md)), ≤3-minute video script
  ([video-script.md](video-script.md)), submission-ready Devpost copy
  ([devpost-draft.md](devpost-draft.md)), blog and social drafts
  ([blog-post.md](blog-post.md), [social-post.md](social-post.md)), static project page
  (`site/`) and a push-ready publishing checklist ([PUBLISHING.md](PUBLISHING.md)).
- **Public repository:** https://github.com/ifelse-codes/praman (public, MIT,
  single squashed commit under the owner GitHub identity with a masked noreply email).
- **Project page:** https://ifelse-codes.github.io/praman/ (static, no hosted execution).
- Not submitted: no demo video, no Devpost submission, no independent-human validation.

## Removed in the 2026-11-05 cleanup

Under explicit owner authorization the repository was reduced to the product:
source, tests, product docs and the first-use example.

- Deleted: the legacy checkout demo pipeline (`verify`, `world`, `gateway`,
  `chaos`, `trace-demo`, `dashboard`), its unused dependencies, the
  target-specific Headlamp/Kan reference integrations and example directories,
  the 5.7 GB private evidence tree, and the process-log/handoff documentation.
- Preserved outside the repository: selected proof movies (Headlamp, Kan, Stern,
  jq), proof/receipt JSON, the 12-outcome first-use matrix, the release candidate
  receipts, the removed source and target examples, and the historical documents.
  Raw historical evidence contains private paths, sessions and credentials; it is
  deliberately not part of this repository or any release. See
  [the cleanup note](ARCHIVE.md).

## Remaining before release / submission

1. **Video and submission (owner):** record and upload the ≤3-minute video; replace
   the remaining `<DEMO_VIDEO_URL>` in the Devpost draft; save and submit. Target
   Nov 26–27, deadline Dec 4, 2026.
2. **Kiro (optional):** the truthful write-up is ready. Additional Kiro usage is
   currently blocked by the monthly usage limit (authenticated CLI attempt on
   2026-11-05 failed with `UsageLimitReachedError` before any tool call). Resolve the
   plan/credits first if a stronger usage story is wanted; do not invent one.
3. **Independent-human validation:** a person other than the owner following the
   first-use guide (CI already covers two operating systems).
4. **Post-submission backlog:** npm publish pipeline, Windows support, deferred
   capabilities, archive retention decision.

## Boundaries

Do not host public PRAMAN execution (trusted commands, inherited environment, no
sandbox/auth). Do not publish raw evidence or the external archive. Do not add
features before the submission. Do not commit, push or submit without authorization.

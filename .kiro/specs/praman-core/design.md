# Design

## Entry points
- `src/cli.ts` (commander) — 16 commands; `src/mcp/server.ts` — 14 `praman_*` tools
  over stdio.
- Both dispatch into the same modules; no target-specific branches in core.

## Modules
- `src/case/` — declaration schemas (`change.ts`), workflow (`workflow.ts`),
  trace reconstruction (`reconstruct.ts`), composition/framing for stories.
- `src/eval/` — browser proof engine (`change.ts`), command proof engine
  (`command.ts`), execution identity (`identity.ts`), media assertions (`media.ts`),
  shared verdict type.
- `src/core/` — orchestration: demonstrate, command-demonstrate, preview, workflow,
  campaigns (bounded/durable/agent) and shared inputs/session helpers.
- `src/environments/` — kind/Docker providers, ownership, readiness, runtime,
  declaration schema; `application.module` is a trusted project-local integration.
- `src/gateway/` — declared finite-state HTTP test service and authored replay.
- `src/report/` — proof-gated recording: video, command video, speech cache,
  spotlight, code excerpts.
- `src/review/` — feedback, diagnostics, coverage review.
- `src/observation/` — intentionally small; observations live in run evidence.

## Proof gates
Browser: declared checks only, required fresh repeats, stable recorded identity,
per-check screenshot + observed value, mode-specific baseline rules.
Command: executable/declared identity hashes, exit, fresh bounded artifacts, full
media decode, strict repair gate.
Recording: proof hash + evidence pins + live replay equality before delivery.

## Evidence layout
Run directory under the caller's fresh output path (by convention `.praman/`):
`scenario.json`/`declaration.json`, `before/`, `after-N/`/`current-N/`,
`proof.json`, `feedback.json`, `REPORT.md`, optional `video/`.
Private evidence is ignored by Git and must not be published raw.

## Limits
No signed/hermetic provenance, no sandbox, no backend reset, no autonomous test
discovery, no whole-application correctness. These limits are printed in proof scope
strings and the README.

# Requirements: PRAMAN Core

## Problem
AI agents generate large amounts of code that humans no longer manually inspect.
Build success and passing unit tests do not prove the software works. Verification is
the bottleneck.

## Goal
Give existing coding agents a way to run declared checks against real software,
observe what actually happens, and receive evidence-backed feedback they can act on.
PRAMAN does not generate or repair application code.

## Functional requirements (current release scope)
1. **Browser verification:** execute an authored scenario (steps + declared checks)
   in a real headless Chromium, with 2-10 fresh repeats, screenshots, network and
   page-error observations.
2. **Command verification:** execute a trusted local command with explicit
   expectations for exit code, stdout/stderr and bounded artifacts.
3. **Verification modes:** `acceptance` (current only), `repair` (declared historical
   baseline + named regression) and `comparison` (explicit baseline attribution).
4. **Honest verdicts:** `passed`, `failed`, `insufficient_evidence`; missing
   evidence is never a pass; CLI exits 0/1/2; MCP sets `isError` on non-pass.
5. **Evidence:** private per-run directory with declaration, proof, feedback, report,
   screenshots/stdout and indexed diagnostics.
6. **Interfaces:** CLI and a stdio MCP server for existing coding agents.
7. **Managed environments:** declaration-selected kind/Docker lifecycle
   (create/observe/workload/fault/recover/reset/verify/demonstrate/destroy).
8. **Optional presentation:** proof-gated narrated walkthroughs; never a prerequisite
   for verification and never a substitute for it.
9. **Kiro integration:** `/.kiro` specs, steering, hooks, a custom agent, workspace MCP
   wiring and an installable Kiro Power (`kiro-power/`), each exercised in recorded Kiro
   sessions (see spec `kiro-evidence-gate` and `docs/kiro-usage.md`).

## Non-functional
- No false green: unavailable execution and incomplete evidence stay explicit.
- Evidence persisted to disk; raw evidence is private and not publication-safe.
- Trusted local execution; not a sandbox, not autonomous test discovery.
- Reproducible same-host setup; cross-platform/independent validation documented,
  not assumed.

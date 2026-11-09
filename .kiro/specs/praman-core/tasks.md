# Tasks

## Delivered
- [x] Authored browser verification (scenario-verify + MCP)
- [x] Authored command verification (command-verify + MCP)
- [x] Acceptance/repair/comparison modes with isolated repeats
- [x] Proof-gated narrated recordings (browser + command)
- [x] Evidence reports, feedback and indexed diagnostics
- [x] Managed kind/Docker environment lifecycle
- [x] Declared HTTP service, workflow replay and coverage review
- [x] Bounded count/duration/durable/agent campaigns
- [x] CLI + stdio MCP server (16 commands, 14 tools)
- [x] First-use guide and public negative-control runner (12 outcomes)
- [x] Source candidate packaging, MIT license, zero known audit findings
- [x] `/.kiro` specs, steering, hooks, agent and Power: valid and exercised in Kiro (spec `kiro-evidence-gate`, closed 2026-11-08)
- [x] Cleanup completed and committed; public repository published with MIT license
- [x] CI green on Ubuntu and macOS; CI also runs the documented first-use route on Linux
- [x] Judge access: TESTING.md, one-click Codespaces devcontainer, expected 12/12 outcomes
- [x] Official Kiroween 2026 rules captured, including the judge-access (testing) clause
- [x] Truthful Kiro usage account with a per-session usage log
- [x] Submission video script, Devpost draft, blog/social drafts, static project page
- [x] Platform matrix and explicit deferred-capability list
- [x] Node floor aligned with the locked toolchain (>=22.13 within 22.x, or >=24) and documented
- [x] Release identity is procedural and excluded from the candidate (no stale hash)
- [x] Bugfix: Power relative paths resolve against the installed Power directory (`PRAMAN_RELATIVE_PATHS=reject`, 2026-11-08)
- [x] Spec `verify-cancellation`: interrupted verification no longer leaves the declared command running (PR #4, #5)
- [x] Spec `agent-diagnostics`: failure kinds and safe counts; pass/fail table in reports (PR #9, #10)
- [x] Spec `scenario-actions`: dblclick, selectOption, type, scroll, drag; waitFor state/count; count check (PR #11)
- [x] Spec `named-steps`: step ids that checks and stories can reference (PR #12)

## Remaining (owner-executed)
- [ ] Spec `submission-story`: record and upload the <=3 min demo video; replace <DEMO_VIDEO_URL> in the Devpost draft
- [ ] Save and submit the Devpost form (target Nov 26-27; deadline Dec 4, 2026 2:00 pm PT)
- [ ] Independent-human first-use validation (CI covers two operating systems)
- [ ] Private-archive retention decision after the submission is final

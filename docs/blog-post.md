# PRAMAN: evidence before you ship

*A blog post written for the Kiroween 2026 hackathon. Category: Frankenstein.*

## The trust gap

AI coding agents are good at writing software — and at sounding certain about it. A clean build, a passing test suite, or a confident summary can still hide a broken screen, a wrong value, or a "fix" that only removes the symptom. As more code ships without line-by-line review, the bottleneck moves from writing it to proving it works. That is the gap PRAMAN (प्रमाण — "evidence") is built to close.

## What PRAMAN does

PRAMAN is an evidence-driven verification toolkit for AI coding agents. The agent still writes and fixes the code. PRAMAN takes an authored browser scenario or command declaration, runs it against the real software in fresh sessions, checks the declared requirements, and returns evidence-backed feedback.

Every run ends in one of three honest verdicts: passed, failed, or insufficient evidence. Missing screenshots, unreachable pages and checks that never executed are never turned into a green result. A CLI and a stdio MCP server (14 tools) expose the same engines, so an agent can call verification instead of trusting a summary. Proof comes before video: a narrated walkthrough is recorded only after fresh proof and matching live replays.

## A real example: the tooltip that crashed

To move beyond a toy, I ran PRAMAN against Headlamp, an open-source Kubernetes dashboard, with its real frontend and Go backend on an isolated Kubernetes cluster. Headlamp's link component crashed when its tooltip was used: `props.getName is not a function`. The repair took two parts: call `getName()` on the Kubernetes object rather than the props wrapper, then forward the DOM reference the tooltip depended on. The first part alone removed the exception and still showed no tooltip — exactly the incomplete fix PRAMAN exists to catch. The final run passed five acceptance checks across three fresh browser sessions, plus a recording replay, and verified the corrected link opened the real namespace details. At the time, the bug was still live in upstream Headlamp; this was a local checkout repair, not an upstream submission.

## What was verified

- **375 tests / 42 files** on the recorded host (2026-11-14), with build, lint and test-typecheck passing; CI runs the suite on Ubuntu and macOS.
- The public first-use runner exercises **12 expected CLI and MCP outcomes** — pass, deliberate mismatch and unavailable execution on both routes — and all twelve behave as documented; the negative controls stay red.
- **14 MCP tools** and **16 CLI commands**.
- **Six narrated walkthroughs** from earlier development (Headlamp, Kan, Stern and jq campaigns) are preserved in a private external archive, not the repository, because they contain local paths and infrastructure data.

## How Kiro was used

Kiro did not build PRAMAN's original engine; an AI coding assistant did, under my direction, before 5 November 2026. What Kiro did is the part I care about most: from 7 November, Kiro CLI agents built PRAMAN's Kiro integration and then used PRAMAN to fix and extend PRAMAN itself, spec first, in recorded sessions.

The integration is a custom agent that may call only PRAMAN's tools, an installable Kiro Power, steering, and an opt-in finish gate on Kiro's `Stop` hook. When the agent says "done", the gate runs the declared checks again and sends the agent back if one fails. In a recorded session it refused to let the agent stop on an off-by-one bug and released it after the fix.

Then came five changes to PRAMAN, each shown first on a real failing run: Ctrl-C no longer leaves the tested program running (proven in repair mode against the old build), the Power refuses relative paths, failed steps name their cause (`locator_ambiguous (3 elements)`), scenarios gained double-click, select, typing, scroll and drag plus element-count waits, and checks can point at steps by name. My earlier, narrower Kiro use (one 86-minute IDE session on 1 November that ended at the monthly usage limit) is disclosed too. The full account, with session IDs, is in the [Kiro usage write-up](kiro-usage.md).

From 10 to 13 November, one Kiro session per step gave apps a realistic place to run, and each step was proven on two real open-source apps (Kan and Shiori) and through MCP in a headless Kiro session: saved starting worlds with a fresh copy for every repeat, network faults on a real dependency whose effect must be observed, 2 to 10 users at once with rules that must hold for all of them, outside HTTP calls recorded once and replayed with no internet, and one offline `REPORT.html` page per browser run. Two fixes were found on the way, one of them a false failure that PRAMAN itself caused on a third app.

## Limits

PRAMAN is **not a sandbox**: trusted commands and browser actions run with your user's authority, and child processes inherit your environment. Checks are **authored, not discovered automatically** — PRAMAN verifies declared requirements, not whole-application correctness. Validation covers the recorded macOS arm64 host and Ubuntu/macOS CI; an independent person has not yet run the guide. There is **no hosted execution service and no published package** — you run it from source, and raw evidence stays private: screenshots, `result.json`, `network.json` and `proof.json` may contain application data or secrets. `REPORT.html` is a private local view (it shows application text and expected and observed values; fill values, typed text and credential fields are redacted), so do not share it. CLI and MCP output redact known secrets but are not a sanitized export, and returned file paths are not redacted. A browser navigation to another origin, even a start URL that redirects to a single sign-on page, is stopped and reported as `navigation_failed`.

## Try it

Source and run instructions are at https://github.com/ifelse-codes/praman (MIT):

```sh
npm ci
npm run build
npx playwright install chromium
node examples/first-use/run.mjs
```

It walks the same verdicts over CLI and MCP and leaves inspectable evidence. Evidence before you ship.

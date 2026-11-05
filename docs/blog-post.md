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

- **190 tests / 28 files**, with build, lint and test-typecheck passing.
- The public first-use runner exercises **12 expected CLI and MCP outcomes** — pass, deliberate mismatch and unavailable execution on both routes — and all twelve behave as documented; the negative controls stay red.
- **14 MCP tools** and **16 CLI commands**.
- **Six narrated walkthroughs** from development (Headlamp, Kan, Stern and jq campaigns) are preserved in a private external archive, not the repository, because they contain local paths and infrastructure data.

## How Kiro was used

Kiro was genuinely used, but narrowly — said plainly rather than inflated. On 1 November 2026 I gave Kiro one bounded task in its IDE: implement a useful Headlamp improvement, then prove it with PRAMAN against a real Kubernetes environment. Kiro ran for 86 minutes with a recorded spec session and made real edits and tool calls; the session ended when Kiro hit the monthly usage limit.

An AI coding assistant completed the remaining work. PRAMAN's core engine, CLI, MCP server, reports, tests and documentation were built by the assistant under my direction — not by Kiro. PRAMAN's own `/.kiro` specs, steering, save hook and custom agent are configuration created by the assistant, not evidence of Kiro development. Kiro CLI was installed and authenticated, but the same monthly limit blocked a second real session. The full account is in the [Kiro usage write-up](kiro-usage.md).

## Limits

PRAMAN is **not a sandbox**: trusted commands and browser actions run with your user's authority. Checks are **authored, not discovered automatically** — PRAMAN verifies declared requirements, not whole-application correctness. Validation covers the recorded macOS arm64 host and Ubuntu/macOS CI; an independent person has not yet run the guide. There is **no hosted execution service and no published package** — you run it from source, and raw evidence stays private.

## Try it

Source and run instructions are at https://github.com/ifelse-codes/praman (MIT):

```sh
npm ci
npm run build
npx playwright install chromium
node examples/first-use/run.mjs
```

It walks the same verdicts over CLI and MCP and leaves inspectable evidence. Evidence before you ship.

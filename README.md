# PRAMAN (प्रमाण) — Evidence-Driven AI Development

[![CI](https://github.com/ifelse-codes/praman/actions/workflows/ci.yml/badge.svg)](https://github.com/ifelse-codes/praman/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Public repository: <https://github.com/ifelse-codes/praman> · Project page: <https://ifelse-codes.github.io/praman/>

PRAMAN is a testing, simulation, demonstration and feedback toolkit that augments AI coding agents (Claude Code, Codex, OpenCode, Cursor, Kiro). It does not generate code; it experiences, stimulates, observes and reviews the software an agent produced, then returns actionable, evidence-backed findings.

Loop: **Build → Experience → Stimulate → Test → Observe → Review → Improve → Repeat.**

Confirmed boundary: the coding agent owns implementation and fixes; PRAMAN must own
the realistic test environment, stimulation, verification, evidence and feedback.
Proof-first verification/video generation works for declared scenarios. Core
environment ownership and proof/feedback are application-independent. Kind and Docker
are infrastructure providers. Target-specific reference integrations and dogfooding
examples were removed from the product in the 2026-11-05 cleanup; selected proof
movies, receipts and historical documents are preserved in an external archive
outside this repository, described in [the cleanup note](docs/ARCHIVE.md).
This is not general-purpose simulation or exhaustive test design.

### Judge access and testing

The public repository is the **test build** for judging. [TESTING.md](TESTING.md) gives
one-click GitHub Codespaces and local instructions; the expected result is exit code 0
with **12/12** CLI and MCP outcomes (about 25 seconds after setup). CI runs the same
route on Linux. No private credentials are required.

### Platform support

| Platform | Node | Status |
| --- | --- | --- |
| macOS arm64 | 26 (recorded) | Tested: full suite, first-use 12/12 |
| Ubuntu (CI) | 22 | Tested in CI: full suite and first-use route |
| macOS (CI) | 22 | Tested in CI: full suite |
| Windows | any | Untested / unsupported (manual build workflow only) |

Node **>= 22.13 within 22.x, or >= 24** is required (`node:sqlite` is unflagged from
22.13; the locked Vite/Rolldown toolchain requires >=22.12 and Vitest does not support
Node 23). See [docs/PLATFORMS.md](docs/PLATFORMS.md).

### Deferred capabilities

Stateful dependency simulation, autonomous discovery, native desktop automation,
cross-host/distributed campaigns and machine-level Kubernetes campaigns are explicitly
deferred and not claimed. Optional product surfaces (previews, campaigns, managed
environments) are implemented and tested but frozen for this release window; the
verified core is authored browser/command verification with evidence.

**Current state: scoped MVP complete and published.** Authored command/browser
verification, CLI/MCP feedback and source installation are verified on the recorded
host and in CI (Ubuntu + macOS); judges can run the documented test-build route from a
public clone ([TESTING.md](TESTING.md)). See [current project status](docs/STATUS.md)
and [release evidence and limits](docs/release-validation.md). Independent-human
validation has not been performed; raw historical evidence is not part of this
repository.

Future contributors and coding agents: read [AGENTS.md](AGENTS.md) for the standing
requirement to keep dogfooding fixtures, target-specific logic and temporary campaign
code out of PRAMAN's core.

## Choose a verification surface

| What you have | Route | Prerequisites / limits |
| --- | --- | --- |
| Static app or already-running browser UI | `scenario-verify scenario.json -o .praman/run` · MCP `praman_scenario_verify` | Running HTTP(S) app + installed Chromium. [Project-local static recipe](docs/static-browser-acceptance.md). No Docker or video required. |
| Backend app with a UI | Same browser scenario route; provision/reset owned services first | Browser checks include same-origin JSON fields. Fresh contexts do not reset backend state. |
| CLI or bounded local program | `command-verify commands.json -o .praman/run` · MCP `praman_command_verify` | Trusted executable, cwd, explicit expectations and deadline. [Command contract](#trusted-command-verification). Not a shell or sandbox. |
| Command/HTTP workflow suite | `coverage-review review.json -o .praman/coverage` · MCP `praman_coverage_review` | [Initial-state model transition gaps and caller-mapped assertions](#workflow-coverage-gap-review-group-3-bounded-scope). Not autonomous requirements discovery. |
| Managed dependencies / application lifecycle | `environment create` → `verify` → `destroy` · MCP `praman_environment` | [Docker/kind and trusted project-local integration](#application-integration-contract). Setup is declared, not discovered. |
| Story framing before recording | `preview scenario.json -o .praman/preview` / `command-preview plan.json -o .praman/command-preview` · MCP `praman_preview` / `praman_command_preview` | Real browser/command execution and scene PNGs, without speech or movies. Explicitly non-proof; final verification/replay gates stay separate. |
| Optional narrated delivery | `demonstrate` / `command-demonstrate` and matching MCP tools | Authored mode-appropriate story, voice/media prerequisites and fresh matching proof/replays. [Video standard](docs/video-guidelines.md). Verification works independently. |

Native desktop UI is not supported. The legacy checkout demo (`verify`, `world`,
`gateway`, `chaos`, `trace-demo`, `dashboard`) was removed on 2026-11-05;
it was a checkout-specific demo path, never the generic recommendation for new apps.

### Release surface: verified core vs frozen extras

The submission release treats two surfaces differently:

- **Verified core:** `scenario-verify`, `command-verify`, the three explicit modes,
  evidence/feedback, first-use onboarding and the stdio MCP entry point. These are
  exercised end-to-end and covered by the public 12-outcome example.
- **Optional / experimental, frozen for the submission window:** `preview`,
  `command-preview`, `demonstrate`, `command-demonstrate`, `environment`,
  `service`, `service-replay`, `workflow-replay`, `coverage-review`,
  `workflow-campaign`, `campaign-resume` and `agent-campaign`. They are implemented
  and unit-tested but not re-verified end-to-end after the 2026-11-05 cleanup;
  do not treat their README contracts as newly demonstrated claims.

## Explicit verification modes

Every current browser/command declaration requires `mode`; there is no implicit
repair/acceptance fallback. All modes run 2–10 sequential current repeats (default 2).

| Mode | Baseline contract | A passing proof means |
| --- | --- | --- |
| `acceptance` | None. Omit before target, `baselineKind`, `regressionCheck` and browser `beforeEquals`. | All declared current requirements passed. No invented history or repair claim. |
| `repair` | Before target + `baselineKind: "historical"` + named `regressionCheck`. | Named old failure reproduced, every other old check passed, all current checks passed. Command baseline also needs the expected exit. |
| `comparison` | Before target + explicit `baselineKind`: `historical`, `synthetic` or `unattested`. No `regressionCheck`. | Complete baseline evidence and passing current checks. Two passing versions are valid; baseline mismatches are not resolved historical regressions. |

Browser targets use `afterUrl` and optional `beforeUrl`; command targets use
`current` and optional `before`. Synthetic negative controls are explicitly
`comparison` + `baselineKind: "synthetic"`, never historical repair proof. Baseline
attribution is caller-declared, not independently authenticated by local hashes.
Reports/feedback record mode and baseline kind; synthetic mismatches are
`baseline_mismatch`, not `resolved_regression`.

Complete current mismatches return `failed`; unavailable execution, incomplete
evidence or an unestablished repair gate return `insufficient_evidence`. CLI exits
0/1/2 for passed/failed/insufficient; MCP sets `isError` for non-passes. An observed
mismatch remains actionable in feedback even if missing evidence elsewhere keeps
the aggregate verdict insufficient.

**Migration:** add explicit mode/baseline attribution to existing paired declarations.
Do not relabel a manufactured fixture as historical. Current-only acceptance uses
no baseline fields. Historical private proofs/movies are not rewritten or accepted
as fresh proof. Managed state is now version 3; destroy any live version-1/2 instance
using its original runner **before upgrading**, then recreate from a migrated
declaration. Do not hand-edit ownership state to adopt old resources.

## Category
Frankenstein — stitches browser automation (Playwright), trusted command execution, a stdio MCP server, a CLI, a static project page and an evidence report into one coherent verification platform.

## Quick start

**Start here:** [First use: setup → CLI/MCP → evidence](docs/first-use.md).
The public `node examples/first-use/run.mjs` route exercises command and browser
pass/mismatch/unavailable controls through compiled CLI and real stdio MCP.
**Trusted execution, no sandbox; caller-owned backend reset; fresh output directories;
private evidence, not universally sanitized exports.** No managed infrastructure or video.

Use the guide in order: [install and build](docs/first-use.md#1-setup-once),
[run the owned example](docs/first-use.md#2-run-the-public-example),
[inspect results](docs/first-use.md#3-inspect-and-rerun-through-the-cli),
[configure MCP](docs/first-use.md#4-configure-an-mcp-client), then
[use your own project](docs/first-use.md#5-use-praman-on-your-own-project).
No published `npm install praman` or `npx praman` route is claimed.

### Tested source setup

Session 1 verified macOS **27.0.1 (26A434), arm64**, Node **26.0.0**, npm
**11.12.1**. This is the evidenced runtime, not a minimum-version or multi-platform
support claim. Linux, Windows, other Node versions and another machine were not
tested. Use the supplied current lockfile; do not replace `npm ci` with a dependency update.

From the source root:

```sh
npm ci
npm run build
node dist/cli.js --help
```

No Chromium download, Docker, kind, SQLite CLI, FFmpeg or speech setup is needed
for ordinary command exit/text/artifact verification. Dependencies (including
Sharp's platform package) are still installed by `npm ci`; registry/network access
and a writable local filesystem are required.

This public-input fixture runs Node itself, without a target checkout or service:

```sh
cat > commands.json <<'JSON'
{
  "mode": "acceptance",
  "title": "Public JSON input",
  "requirement": "Print the declared JSON total",
  "current": {
    "executable": "node",
    "args": ["-e", "let s=\"\";process.stdin.setEncoding(\"utf8\");process.stdin.on(\"data\",c=>s+=c);process.stdin.on(\"end\",()=>console.log(JSON.parse(s).values.reduce((a,b)=>a+b,0)));"],
    "cwd": ".",
    "stdin": "{\"values\":[2,3,5]}",
    "deadlineMs": 5000
  },
  "expectedExit": 0,
  "checks": [{"id":"total","source":"stdout","operator":"equals","value":"10\n"}],
  "repeats": 2
}
JSON
node dist/cli.js command-verify commands.json -o .praman/first-command --summary
```

Expected: `Outcome: passed`, exit 0; inspect `.praman/first-command/REPORT.md`
and private `proof.json`/`feedback.json`. Use a fresh output directory on each run.
Session 1 also changed the expectation to `11\n` (failed, exit 1) and selected
an intentionally missing executable (insufficient evidence, exit 2). Commands are
trusted code, **not sandboxed**; keep evidence private under ignored `.praman/`.

### Prerequisites by route

| Route | Additional requirements | Session 1 boundary |
| --- | --- | --- |
| Command exit/text/file checks | Declared executable, inputs, cwd and permissions; restore caller-owned state between repeats | Actual compiled CLI pass/mismatch/unavailable outcomes, with only Node on command PATH |
| Image artifact checks | Installed Sharp dependency/platform binary | Existing regression suite passed; no separate platform matrix |
| Browser verification and browser/command scene previews | `npx playwright install chromium`; reachable target for browser scenarios; any target-specific startup/reset | Isolated Chromium download and existing browser regressions passed; contexts do not reset backend state |
| Docker integration | Docker CLI and reachable daemon, declared images/resources and trusted application integration prerequisites | Not started or inspected |
| kind integration | Docker daemon/CLI, kind, kubectl, declared resources and integration prerequisites; Chromium when checking UI | Not started or inspected; no private Colima profile is a generic prerequisite |
| Durable local campaigns | Runtime providing native `node:sqlite` `DatabaseSync`, writable local filesystem, same-host coordinator | Node 26.0.0 existing durable regressions passed; no SQLite CLI needed; no network filesystem/cross-host guarantee |
| Audio/video artifact assertions | `ffprobe` and `ffmpeg` on PRAMAN's PATH | Existing decoder regressions passed; not needed for ordinary text checks |
| Optional narrated movies | Chromium, `ffprobe`, `ffmpeg`, authored story and fresh matching proof/replay; `PRAMAN_VATRA` pointing to an installed compatible helper, or macOS `say` / available `espeak-ng` or `espeak` | No new movie or real speech generation; no provider/model/credential changes |

Preview alone needs no speech/encoder unless an authored check requires media
decoding. Playwright's downloaded FFmpeg is not a substitute for the `ffmpeg`
and `ffprobe` PATH executables used by media checks.

### Clean-copy procedure and release limits

Session 1 copied the **current filesystem bytes**, including local uncommitted
work, rather than exporting HEAD. Reproduce the tested build input copy from the
source root:

```sh
copy="$(mktemp -d "${TMPDIR:-/tmp}/praman-clean.XXXXXX")"
cp package.json package-lock.json tsconfig.json "$copy/"
cp -R src tests "$copy/"
home="$(mktemp -d "${TMPDIR:-/tmp}/praman-home.XXXXXX")"
runtime_tmp="$(mktemp -d "${TMPDIR:-/tmp}/praman-runtime.XXXXXX")"
cd "$copy"
export HOME="$home" TMPDIR="$runtime_tmp"
export npm_config_cache="$home/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="$home/browsers"
unset NODE_PATH NODE_OPTIONS PRAMAN_VATRA
npm ci
npm run build
node dist/cli.js --help
# Run the public commands.json recipe above before installing optional Chromium.
# Optional existing full regression suite:
npx playwright install chromium
npm test
```

Keep runtime temp **outside the source package**: extensionless CommonJS test
helpers otherwise inherit the root `"type":"module"` and fail. The first
Session 1 test run exposed this harness placement issue; moving only TMPDIR
outside the package yielded **188 passing tests / 27 files** in that historical
Session 1 run (the current suite is **190 tests / 28 files** after the 2026-11-05
cleanup and release hardening). Full tests also
use installed FFmpeg/ffprobe; that does not make them core command prerequisites.
The core smoke used a separate PATH containing only a Node symlink, a fresh HOME,
empty browser directory and no inherited provider settings.

No node_modules, dist, private `.praman/`, target checkout, historical evidence
or Git metadata was copied. This proves same-host workspace independence only,
not a hermetic toolchain, release artifact safety, another machine or external
human onboarding. Session 3 separately reviewed a source candidate and exercised
its advertised CLI/MCP entrypoints; see [release validation](docs/release-validation.md).

**Dependency/license follow-up:** the historical Session 3 lockfile reported ten
affected packages. The current lockfile upgrades Zod/Vitest and scopes Autocannon's
Hyperid override to a version without the vulnerable UUID chain; `npm audit --json`
reports zero known vulnerabilities. LICENSE contains the complete MIT grant.
This is not a general security certification. Use `npm ci` and the latest candidate,
not the historical archive; see [remediation and limits](docs/release-validation.md#dependency-and-license-remediation).

The source candidate includes only the first-use example. Historical dogfooding
examples (Headlamp, Kan, Harbor) and their evidence moved to the external archive on
2026-11-05 and are not needed by the [first-use route](docs/first-use.md).

Choose a route above. Static/browser-only acceptance needs a running target and a
project-local scenario, not managed infrastructure.

## Managed real environments

The declaration selects `kind` (default) or `docker`. PRAMAN provisions dependencies,
starts the application, exercises declared workflows and removes owned resources.
It does not implement or fix the target software. The following cluster commands
and resource semantics describe kind; see Docker below for the second provider.

### Application integration contract

Declarations select infrastructure independently from application code:

```json
{
  "application": {
    "module": "./my-application-integration.mjs",
    "config": { "source": "../my-project" }
  },
  "scenario": "./acceptance.json"
}
```

This fragment accompanies the provider, dependency/resource and workload fields.
`application.module` and `scenario` resolve relative to the declaration. The module
default-exports the `ApplicationIntegration` interface from
`src/environments/application.ts`:

- `configure(config, declarationDirectory, environment)` validates its own config
  and provider prerequisites and returns normalized, serializable config.
- `start(state, save)` deploys the target, records owned processes/URLs/source
  identities and binds current `state.scenario.afterUrl` (plus `beforeUrl` only for
  paired modes). The core loads the common scenario and resolves diff/upload paths first.
- `observe(state)` returns live readiness/identity evidence or throws. A missing
  integration or failed observation cannot authorize proof.
- `reset(state, save, resetInfrastructure)` restores the application's real seed.
  Call the supplied provider reset when appropriate; an application with a shared
  database may instead restore its owned data while keeping immutable deployments.
- Optional `secrets(config)` supplies private values withheld from returned
  feedback. Core stores these privately so teardown does not depend on importing
  the module again. This supplements, not replaces, known-shape redaction.

Use managed `startProcess`, `command` and ownership helpers in integrations; core
teardown owns process termination and provider cleanup. Teardown works even if
the integration module becomes unavailable. Integration modules are **trusted
local executable code**, not a sandbox or safe format for untrusted downloads.
They must not acquire untracked resources; core cannot safely clean up resources
an integration hid from ownership state.

Reusable source snapshots, dependency-link handling, hashes and shared-root
calculation live in `src/environments/source.ts`; application-specific build
commands/config overlays stay in integrations. Checks, evidence classification,
safe feedback and recording gates stay shared. Browser scenarios and the command
verification contract below are distinct proof surfaces; native-UI checks remain unsupported.

The bundled modules compile to `dist/integrations/{kan,headlamp}.js`. Other modules
can live in the caller's project; no app-name registry, core schema change or new
CLI/MCP tool is required. Without `application`, an environment manages only its
declared infrastructure (and may exercise an explicitly supplied running scenario).

**Clean cutover:** use `application` plus top-level `scenario`, not the old
top-level `kan` / `headlamp` fields. Public examples use explicit proof modes.
Managed state is version 3; older evidence stays historical, not silently reopened.
Destroy live older instances with their original runner before upgrading, then recreate.

### Trusted command verification

`command-verify` extends acceptance proof to bounded local commands without an
application-name registry or browser. Provision infrastructure with managed
`environment create` when needed, then supply explicit commands using its private
connection inputs; finally use `environment destroy`. Command proof does not
implicitly provision, reset or adopt resources.

```json
{
  "mode": "repair",
  "baselineKind": "historical",
  "title": "Parser repair",
  "requirement": "Print the declared result",
  "before": {
    "executable": "./old-parser", "args": ["input.txt"],
    "cwd": "./fixture", "deadlineMs": 5000
  },
  "current": {
    "executable": "./fixed-parser", "args": ["input.txt"],
    "cwd": "./fixture", "deadlineMs": 5000
  },
  "expectedExit": 0,
  "checks": [
    {"id": "result", "source": "stdout", "operator": "equals", "value": "correct\n"}
  ],
  "regressionCheck": "result",
  "repeats": 2
}
```

```sh
node dist/cli.js command-verify ./commands.json -o .praman/command-run
```

MCP: `praman_command_verify({ specPath, outDir })` executes the same function,
returns the same safe feedback/report references and sets `isError` unless proof
passes. CLI exits 0 for proof, 1 for a current assertion failure, 2 for insufficient
execution/evidence or an unestablished repair gate. Malformed declarations are rejected before execution.

- Commands declare `executable`, `args` (default `[]`), `cwd`, `deadlineMs`
  (1–300000), optional string `stdin`, and optional `env`. Environment inherits the
  runner's environment; a string overrides a variable and `null` removes it.
  Executable paths containing a separator and working directories resolve relative
  to the declaration. Bare executable names use PATH. No shell is implicit.
- Every run uses the same expected exit code and checks. `source` is `stdout`,
  `stderr`, or `artifact`; only artifacts require `path`, resolved against that
  run's cwd. Operators: `equals`, `contains`, `notContains`, `matches` (JavaScript
  regular expression). IDs are unique; `$exit` is reserved. Artifact evidence must
  be newly created or rewritten during the command; stale/missing/non-file evidence
  cannot pass. Assertions read at most 8 MiB per file. Raw output is streamed to
  private files, not truncated into a false pass.
- Binary image artifacts use `"source": "artifact", "path": "output.png",
  "operator": "image", "value": {"format": "png", "width": 640, "height": 480}`.
  Required format: `png`, `jpeg`, `webp`, `gif`, `tiff` or `avif`; positive integer
  `width`, `height` and `frames` are optional. Sharp strictly decodes **all**
  frames/pages, not just a header or first frame. Dimensions are per frame/page.
  AVIF requires AV1 compression, not merely a HEIF container. Decode errors and
  wrong properties fail; missing/stale/unreadable, over-8-MiB, over-40-million-total-
  pixel or timed-out evidence is insufficient. Image processing has a 15-second
  decoder timeout. Private results retain actual format/dimensions and frame count
  when requested or multipage. No color-fidelity or animation-timing assertion.
- Audio/video artifacts use the same `source`/`path` contract:
  - `"operator": "audio", "value": {"format": "wav", "sampleRate": 16000,
    "channels": 1, "durationMs": {"min": 900, "max": 1100}}`.
    Formats: `wav`, `mp3`, `flac`, `ogg`; sample rate and channel count are optional
    positive integers.
  - `"operator": "video", "value": {"format": "mp4", "width": 640,
    "height": 480, "frames": 30, "durationMs": {"min": 900, "max": 1100}}`.
    Formats: `mp4`, `webm`; dimensions and frame count are optional positive integers.
  - Optional duration bounds are inclusive milliseconds, with `0 <= min <= max`
    and `max > 0`. The required stream must exist; attached cover art is not video.
    Properties describe the first relevant stream. Container identity is read
    from content, including MP4 brand and WebM DocType, never the extension.
  - `ffprobe` and `ffmpeg` must be installed on PRAMAN's PATH (separate from the
    declared command's `env`). Metadata is followed by full audio/video decoding;
    emitted samples/frames and duration consistency are required. Decode-detected
    corruption, malformed media and wrong properties fail. This cannot identify
    every truncation that itself forms a valid shorter stream.
  - Evidence limits: 8 MiB per artifact, known positive duration up to 60 seconds,
    at most 16 streams, aggregate estimated video decode up to 40 million pixels
    and audio up to 100 million channel-samples. Each subprocess has a 15-second
    deadline and 1-MiB output cap, one codec thread and file/pipe protocols only.
    Decoder absence, timeout or resource limits are insufficient evidence.
    Captured media and observations stay private; raw decoder errors are not
    printed by CLI/MCP. No codec compatibility, perceptual quality or arbitrary
    document/archive-format assurance.
- Acceptance runs only `current`; it requires no before executable or named old
  failure. Repair requires the named old check to fail, other old checks to pass,
  and completed execution with the expected exit. Comparison permits a passing or
  failing baseline if its execution/evidence is complete. Every mode requires all
  current checks and exit expectations to pass in 2–10 repeats.
  Repeats are sequential; commands/caller must restore any required state.
- A timeout or unavailable executable is insufficient evidence, not a diagnosed
  application defect. Each owned POSIX process group is killed on deadline and
  command completion, including remaining same-group descendants. Detached/escaped
  processes and external resources are outside this process-group boundary.
- Output directory must be fresh. Private `declaration.json`, `proof.json`,
  per-run `result.json`, stdout/stderr and captured artifact files preserve actual
  observations. Executables are resolved with the effective command PATH and get
  sampled SHA-256 identities, including PATH-only names. These and supplied source
  descriptions are not signed build provenance. `feedback.json`,
  `REPORT.md`, CLI and MCP omit raw arguments, environment, assertions, output and
  errors, pointing to private evidence for expected/observed comparison instead.
  Check IDs are withheld; declaration indexes identify checks. Local paths remain private context; review before sharing.
- Commands, inputs, artifact paths and regular expressions are **trusted local
  code/configuration**, not a hostile-code sandbox. They run with the current user's
  authority and can change files or external systems. Deadlines bound execution,
  not disk usage; raw output can fill disk. Keep inputs private and use owned
  resources. Command proof does not authorize a browser video or imply whole-app,
  arbitrary native-UI, streaming-recovery or universal zero-config coverage.

### Declared execution identities (Group 7 / F04)

Command invocations (`current`, `before`, workflow/reset commands and agent
producers) and browser scenarios accept an optional `identity` declaration:

```json
{
  "identity": {
    "files": [
      { "role": "script", "path": "./harness.cjs" },
      { "role": "input", "path": "./fixture.json" }
    ],
    "tools": [
      { "role": "interpreter", "executable": "node" },
      { "role": "browser", "executable": "/absolute/path/to/browser" },
      { "role": "tool", "executable": "/usr/bin/curl" }
    ]
  }
}
```

- Each list allows 0–32 entries. File roles are `script`/`input`; executable
  roles are `interpreter`/`browser`/`tool`. The roles are caller declarations,
  not discovery of which programs actually ran. Declare relevant harness files,
  imported helpers, configuration and external tools yourself.
- File declarations and executable names containing `/` resolve relative to
  the command/workflow/scenario JSON file. Captured campaign/review inputs retain
  those absolute references, not copies or hermetic dependencies. MCP browser
  scenarios are inline objects: relative identities resolve from the MCP server's
  working directory; absolute paths are recommended. Direct core API callers use
  command cwd or browser runner cwd. Tool PATH lookup uses the command's effective
  environment; browser scenario tools use PRAMAN's environment. No shell, version
  probe, package lookup or argument/shebang inference is performed.
- Automatic identities cover the running PRAMAN interpreter and evaluator module,
  the command's actual selected executable, and the browser scenario's explicitly
  selected Chromium executable. Browser uploads and supplied diff files are
  automatic local inputs. Parsed declarations are pinned by `specHash` and retained
  privately; this identifies the executed declaration, not its original JSON
  formatting. A command harness that starts its own browser must declare that
  browser binary; command verification does not discover it.
- Private `proof.json` and per-run `result.json` retain `identityBefore` and
  `identityAfter`: requested names, resolved paths, real paths, SHA-256 values
  or unavailable-file errors. Safe CLI/MCP feedback and `REPORT.md` expose
  structural identity status and private evidence links, not raw identity entries.
  Missing/nonregular/unreadable/nonexecutable declared inputs block dispatch;
  changes during execution or between proof repeats make evidence insufficient,
  even when all behavior checks pass. Regular input files need not be executable.
- Live recording replay requires complete identities matching fresh proof before
  dispatch and after execution, in addition to existing mode and output/check
  gates. Same-output script/tool changes and PATH/symlink retargeting block replay.
  Old proof without identity snapshots cannot authorize recording; rerun verification,
  never rewrite historical proof. Boundary checks cannot exclude a change restored
  before the next observation.

**Outside this scope:** undeclared/transitive imports and packages (including
other PRAMAN modules), shared libraries, browser resources/profiles, undeclared
subprocesses, inherited environment/credentials, remote page/API content,
application/database state and source-to-build/deployment/history attribution.
Recording-only renderer, speech and encoder dependencies are not automatically
covered by command/browser verification. Declare their executable/input files if
they belong to your chosen identity scope; this still does not attest their
transitive runtime dependencies or sandbox them. Local sampled hashes are neither
signed nor hermetic provenance and never establish whole-application correctness.

### Proof-gated command video delivery

`command-demonstrate` adds a reusable narrated terminal/source walkthrough to the
same trusted command proof contract. No application registry or campaign recorder
is required. Read the [video authoring standard](docs/video-guidelines.md) first.

Keep the acceptance declaration separate from presentation. A recording plan
references it; paths below resolve relative to the plan file:

```json
{
  "commandsPath": "./commands.json",
  "walkthrough": {
    "before": [
      {"text":"The original parser loses the value we need. Here is the observed result.", "stream":"stdout", "from":1, "to":1}
    ],
    "code": {
      "text":"Author-supplied explanation only. Without a diff this scene does not claim independently verified source."
    },
    "after": [
      {"text":"The same declared input now keeps the value. The report contains the original failure, repeated fixed checks and matching recording replays.", "stream":"stdout", "from":1, "to":1}
    ]
  }
}
```

For a source repair, add `diffPath` and the same `code.excerpts` and focused
`code.beats` structure documented below for browser walkthroughs. Every numbered
line must exist on the requested side of the real unified diff. One focused range
is shown per beat; missing source, overflow or overlapping captions blocks delivery.

```sh
PRAMAN_VATRA="$HOME/tts-lab/tts" node dist/cli.js command-demonstrate ./video-plan.json \
  -o .praman/command-video
```

MCP: `praman_command_demonstrate({ planPath, outDir })` runs the same lifecycle.
The output directory must not already exist. It contains fresh `proof/` evidence,
`demo.mp4`, `REPORT.md`, `video/captions.vtt`, measured narration and renderer
provenance in `video/tour.json`, source/scene evidence and `replay-current.json`.
Paired modes also retain `replay-before.json`.
Optional `cut: "short"` (CLI `--cut short`) selects essential beats from the same
authored story; `full` remains the default. Preview supports the same selection.
See [short composition](docs/video-guidelines.md#short-composition-group-9--f08)
for required role references, optional per-beat `shortText` and measured 45–60
second budgets. Full/short retain the same verification spec/story hashes, but
each delivery requires fresh proof and exact live replays. Over-budget speech or
encoded duration blocks delivery without rewriting acceptance proof.


Before any speech is generated, a no-speech story preflight executes the declared
commands and renders every terminal/source beat with the same framing checks as
capture. Private `video/preflight/preflight.json` and scene PNGs are explicitly
**not proof**. It does not consume the final one-shot replay: commands still run
again during capture and must match fresh proof exactly. Preflight adds real
executions; declarations must own/isolate their state and side effects.

- Recording starts only after mode-specific proof and 2–10 current passes.
  Acceptance plans have only `walkthrough.after`; omit `before`, `code` and `diffPath`.
  Comparison plans require before/after beats, with optional code; repair plans
  require before/code/after. Only declared versions execute again during capture.
  Replays must match proof **byte for byte** for stdout, stderr and captured artifacts, plus exit/check verdicts.
  Nondeterministic output can block a movie even if broad assertions still pass;
  do not rewrite acceptance or fabricate stable output to evade that gate.
- Recording requires complete, unchanged resolved execution identities across
  proof and replay. PATH-only commands are pinned to their selected executable;
  relevant scripts, inputs, interpreters and tools must be explicitly declared.
  Declaration/source/evidence edits block delivery. See the declared identity
  scope above: no transitive, signed or hermetic provenance is implied.
- The surface is **xterm.js in a browser**, rendering actual command pipe output,
  not a native terminal/PTY capture, browser acceptance or an interactive shell.
  Terminal focus `from`/`to` selects inclusive one-based **rendered screen rows**.
  The complete displayed stream must fit 14 rows at 96 columns; presentation reads
  at most 1 MiB. Invocation display is bounded to 220 characters and inline stdin
  to 260. Larger/scrolling/interactive workflows are not supported by this recorder;
  the full private command evidence is not truncated into a false pass.
- Narration is required. `PRAMAN_VATRA` selects the installed Vatra helper with
  `af_heart`; otherwise the identified system engine (`say` on macOS, or available
  `espeak-ng`/`espeak`) is used. Missing/failed speech, FFmpeg, Chromium or replay
  evidence produces no successful movie or silent fallback.
- Delivery returns `proofVerdict` separately from `verdict`. CLI exits 0 only for
  delivered proof plus movie, 1 for failed acceptance, 2 for unavailable proof or
  delivery. MCP sets `isError` unless both succeed. A recording failure does not
  rewrite passed acceptance proof; inspect private `recording-failure.json`.
- Commands and authored story remain trusted local inputs, not a sandbox.
  Movies display real output/arguments/input and are **private**, not sanitized
  exports. CLI/MCP return safe delivery references rather than raw evidence.
  Review all media and evidence before sharing; good structure is not human approval.

### Speech asset reuse (Group 10 / F02)

Browser and command delivery share `src/report/speech.ts`; CLI/MCP flags, exit
codes and proof/delivery results are unchanged. After fresh verification and the
no-speech preflight, unchanged narration can reuse audio from private
`.praman/speech-cache/v1/` under the runner's working directory.

The versioned SHA-256 key includes the **exact text sent to speech**, selected
engine/voice/rate and effective generation arguments, resolved helper path and
bytes, working directory and a sorted fingerprint of the inherited environment.
Environment values are not stored in cache receipts. Vatra still uses the
configured `PRAMAN_VATRA` helper with MLX, `af_heart` and joined audio; system
engines retain their existing defaults and rate 175. No model or credentials
are changed. Environment/cwd changes conservatively miss, even if unrelated to
speech. Opaque helper/model/runtime dependencies are not transitively attested;
operators must clear affected cache entries when changing hidden provider defaults
outside the keyed helper/arguments/environment boundary.

Keys do not include selectors, framing, cut names or beat positions. Browser
chunks are keyed after the existing caption splitting; command beats keep their
whole spoken text. Identical selected speech can cross full/short cuts and the
two delivery surfaces; different `shortText` cannot receive the full variant's
audio. Original indexes and composition/proof/story identities stay independent.

Every request creates a private per-run audio copy, validates its SHA-256 on a
hit, probes duration and fully decodes audio before computing existing scene
holds and caption timing. Short speech/encoded-duration budgets remain enforced.
Private `video/note-NNN.speech.json` receipts report `generated`, `reused` or
`blocked`, the key and newly measured seconds, always `proof:false`; tours link
those receipts. A corrupt, missing or unreadable existing cache asset blocks
delivery explicitly; it is not silently regenerated, accepted as timing alone or
replaced by silence. Repair/remove only the affected speech entry and retry into
a fresh delivery directory. A miss is published atomically only after validation;
concurrent misses may both generate, but never publish a partial entry.

This cache carries **audio only**, never verification, execution, declared
identities or replay authority. A framing edit may reuse speech but still needs
fresh proof/preflight and matching live replays. Missing requested helpers or
media tools still block delivery even with warm audio. Cache files are private
0700 directories/0600 files, not a shared/untrusted or authenticated artifact store.




Kind prerequisites: Node.js, Docker, kind, kubectl, installed Playwright Chromium, and
enough runner capacity for each declared cluster. A declared application integration
requires whatever build artifacts and dependencies its own module needs; install those
in the project, not in PRAMAN. No hand-provisioned cluster, kubeconfig, backend or
frontend server is required.
A dedicated `colimaProfile` is required before PRAMAN changes a runner-level kernel
setting; the socket is declared explicitly. PRAMAN starts that profile with
`--activate=false` if stopped; it never switches the user's Docker or Kubernetes
context. Other Docker runners can omit `colimaProfile` and declare their own local
Unix socket.
The example also declares `inotifyMaxUserInstances: 1024`: PRAMAN reads, raises
only if necessary, and verifies that kernel limit inside the named dedicated VM.
The observed previous/effective values are saved in `runner.json`. This avoids
real kube-proxy startup failures when several kind clusters exhaust the VM's
default file-watcher quota. It never changes the macOS host's kernel settings.
The setting belongs to the shared runner, is not lowered on instance teardown,
and is rechecked on subsequent provisioning. Without an explicit dedicated
Colima profile, this optional tuning is refused.

```sh
node dist/cli.js environment create ./your-environment.json
# Use the returned id in subsequent commands:
node dist/cli.js environment observe <id>
node dist/cli.js environment workload <id> read
node dist/cli.js environment workload <id> mutate
node dist/cli.js environment workload <id> requests
node dist/cli.js environment workload <id> scale
node dist/cli.js environment workload <id> ready
node dist/cli.js environment fault <id>
node dist/cli.js environment recover <id>
node dist/cli.js environment reset <id>
node dist/cli.js environment verify <id>
node dist/cli.js environment demonstrate <id>
node dist/cli.js environment destroy <id>
```

Reference Headlamp/Kan declarations were archived on 2026-11-05; use a
project-local declaration (see the application integration contract below).

All commands accept `--base <directory>`; default `.praman/environments`. Creation
returns an operation verdict, unique id and evidence directory. Paths in a
declaration resolve relative to that declaration, not the shell directory.

- **Provision/readiness:** one named kind cluster and private kubeconfig per
  instance. Live namespace, ConfigMap, Deployment and Service; system network/DNS
  and application rollouts are awaited. `readinessWorkloads` names read-only
  workload probes that must succeed against the live service, with bounded
  readiness polling and saved command observations. A ready Pod alone does not
  prove service routing works. A declared application integration must retrieve the
  actual live resource; its frontends must load the real control backed by it.
- **Starting state/workloads:** the declared Deployment serves an actual writable
  pod volume behind a Kubernetes Service. `mutate` changes that live volume;
  `read` and `requests` perform real HTTP requests through the service. `scale`
  changes the real Deployment; `ready` waits for its rollout. The revision page
  is a small infrastructure probe, not an inventory/business-process simulator.
  Kubernetes resources are real, not fixed gateway responses.
- **Isolation:** separate clusters and application processes between instances.
  Before/current frontends within one instance deliberately share its cluster.
  Snapshot directories and Vite caches are separate; installed dependencies are
  shared. This is trusted local development infrastructure, not a hostile-code
  sandbox or production-authentication setup.
- **Controlled failure:** `fault` pauses only the instance's control-plane
  container and verifies the Kubernetes API stops responding. `recover` unpauses
  it and awaits API readiness. A runner sleep is not counted as an injected fault.
- **Reset/reproduction:** recover an active pause, delete/recreate the owned
  namespace, reapply the declaration, await rollouts and the declared live-service probes. Namespace identity
  changes; live pod state and scaled replicas return to their declared baseline.
  This is destructive to the test namespace, not a database snapshot mechanism.
- **Teardown:** terminate owned application process groups only after checking their
  recorded start identity; delete only the owned kind cluster. Repeated destroy
  is supported and absence is checked. Evidence and source snapshots are retained.
  The configured runner VM is shared infrastructure and is not deleted/stopped by
  instance destruction. Existing manually provisioned clusters are not adopted.
- **Evidence/agent loop:** `state.json`, `commands.jsonl`, `operations.jsonl`,
  generated `scenario.json`, process logs and per-operation proof outputs correlate
  instance id, reset generation, source hashes and observations. `verify` produces
  acceptance evidence plus shared declared-scenario feedback (`feedback.json`,
  `REPORT.md`). `demonstrate` uses the same feedback and invokes the proof-first
  gate again; failures/unavailable evidence never authorize a video. No whole-app
  pass follows from a successful lifecycle operation.

Application-specific reference adapters (Headlamp, Kan) and their example
declarations were removed from the product on 2026-11-05 and are preserved in the
external archive. New applications use the declaration-selected `application.module`
contract below or a project-local integration; no built-in target adapter is bundled.
Other applications need their own startup/state integration. A kind declaration
without `application` manages Kubernetes workloads. Snapshots are fixed at creation:
after the coding agent changes source/builds the backend, create a new instance to
deploy that change and update its declared scenario/diff when appropriate. `reset`
restores live environment state; it does not replace a running instance's tested
source with newer worktree contents.

Declare trusted namespaced Kubernetes resources and named kubectl workloads; the
schema rejects cluster-scoped seed resources, foreign seed namespaces and workload
connection overrides. Operations are serialized per instance. If a CLI is killed,
inspect its `operation.lock` PID before removing a stale lock and invoking
recover/reset/destroy; never remove a lock for a running operation. Failed create
attempts retain evidence and attempt owned-resource cleanup.
Creation/reset failures preserve node/pod/event diagnostics and DNS/proxy logs
before cleanup when the API is reachable. Kubeconfig files contain private
credentials: keep runtime directories private and exclude them from publication.
`npm test` scopes discovery to PRAMAN's `tests/`, not target-source snapshots
retained inside an evidence directory.

The legacy file-fixture `world`, fixed-response `gateway` and checkout-specific
`verify` paths were removed on 2026-11-05; this managed runtime provider is unrelated
to them.

### Declared stateful test services (Group 2, saved-state stage)

`praman service service.json --port 9000 --save .praman/service-state.json`
runs an isolated, loopback-only finite-state HTTP simulator. SIGINT/SIGTERM saves
its current state and matched-request count before closing. Restart with
`--restore .praman/service-state.json` to resume; add `--save` to save again.
The parent output directory must already exist. State files are private runtime
inputs, not acceptance proof; save errors produce a nonzero exit.

```json
{
  "version": 1,
  "initial": "ready",
  "states": {
    "ready": [
      {"method": "POST", "path": "/job", "next": "retry", "response": {"status": 503, "body": {"retry": true}}}
    ],
    "retry": [
      {"method": "POST", "path": "/job", "next": "ready", "response": {"status": 201, "body": {"accepted": true}}}
    ]
  }
}
```

Each matched request atomically selects a declared response and changes state,
including declared failures. Methods and request URLs match exactly; query
strings, unknown paths and unmatched methods return 404 without changing state.
Bodies are drained, not matched or stored. No delays, body-dependent behavior,
external side effects or domain database model are implied. JSON responses use
HTTP's normal HEAD/204/304 body semantics.

The programmatic `startService` in `src/gateway/service.ts` returns `server`,
`snapshot()`, `restore(snapshot)`, `reset()`, `save(file)` and `load(file)`.
Snapshots carry a version and SHA-256 identity of the parsed declaration;
incompatible or invalid snapshots are rejected before mutating state.
Identity is serialization-sensitive: reordering state keys requires a fresh
snapshot. Files are written with private permissions through same-directory
rename; there is no automatic crash-time persistence. Keep one writer per file.

This restores only the simulator, not the application's database, browser,
clock, network or workflow. Saving state alone is not trace reconstruction,
MCP service lifecycle support, or proof that an application handles retries.
No legacy `gateway` or checkout-specific `verify` command remains; the declared
service runtime above is the only simulator.

### Authored HTTP service replay (Group 2)

Run `praman service-replay replay.json -o .praman/replay-fresh`, or call
MCP `praman_service_replay({ specPath, outDir })`. The output directory must not
already exist. Each repeat owns a fresh ephemeral loopback service and closes
it afterward; no infrastructure or persistent MCP service is started.

```json
{
  "version": 1,
  "service": {
    "version": 1,
    "initial": "ready",
    "states": {
      "ready": [
        {"method": "POST", "path": "/job", "next": "retry", "response": {"status": 503, "body": {"retry": true}}}
      ],
      "retry": [
        {"method": "POST", "path": "/job", "next": "ready", "response": {"status": 201, "body": {"accepted": true}}}
      ]
    }
  },
  "start": {"kind": "initial"},
  "steps": [
    {"method": "POST", "path": "/job", "expect": {"status": 503, "body": {"kind": "json", "value": {"retry": true}}}},
    {"method": "POST", "path": "/job", "expect": {"status": 201, "body": {"kind": "json", "value": {"accepted": true}}}}
  ],
  "final": {"state": "ready", "requests": 2},
  "repeats": 2,
  "deadlineMs": 2000
}
```

`start` is required: choose `{"kind":"initial"}` or
`{"kind":"snapshot","path":"service-state.json"}`. Snapshot paths resolve relative
to the replay declaration; the existing version/declaration/state validation applies.
The snapshot is read once, copied privately, restored for every repeat and never
modified. Final `requests` is the absolute matched-request count, including any
restored count; unmatched requests do not increment it.

Steps use exact request methods and raw paths, including query strings. They send
no body or custom headers. HTTP redirects are observed, never followed; callers
cannot select another destination. Each step asserts status and either exact
UTF-8 text (`{"kind":"text","value":""}` for HEAD/204/304) or structural JSON
equality (object key order ignored, array order retained; no subset matching).
A complete but non-JSON body fails a JSON expectation. All steps continue after
observed mismatches; uncertain execution stops that repeat's remaining steps.
The final state and count are also checked, not inferred from HTTP status.

Bounds: 1–100 steps, 2–10 sequential repeats (default 2), 1–10000 ms per request
(default 2000), 1 MiB per declaration/snapshot/response. Input/execution failure,
timeout or unavailable/oversized evidence produces `insufficient_evidence`;
observed response/final-state mismatches produce `failed`. Missing evidence takes
precedence. CLI exits are 0/1/2 for passed/failed/insufficient; MCP sets `isError`
for either non-pass. Existing output is refused without modification.

Private `declaration.json`, optional `starting-snapshot.json`, `run-N.json` and
`replay.json` retain expectations, observations and errors (directories 0700,
files 0600). CLI/MCP and saved `feedback.json` expose verdicts, structural
step/run indexes and private evidence paths, not response bodies, states or raw
errors. Local paths can still be sensitive. Replay receipts explicitly say
`simulated: true`, `proof: false`: this verifies only an authored simulator
sequence, not application retry handling, target/browser/database restoration,
trace reconstruction, autonomous or historical failure discovery, or any repair
proof. Existing acceptance/repair/comparison and recording gates are unchanged.

### Real command workflows and trace → executable case (Group 2)

`workflow-replay` runs the **application**, rather than sending the expected
dependency requests itself. It starts an owned finite-state dependency, binds
`{{serviceUrl}}` in the application's arguments/environment/stdin, executes the
trusted command, checks its exit/output/artifacts through the existing command
evaluator, and checks the dependency's actual ordered method/path/status/body
interactions plus final state/count. No application-specific behavior lives in core.

Example for a real installed curl client (adjust its executable path if needed):

```json
{
  "version": 1,
  "dependency": {
    "version": 1,
    "service": {
      "version": 1,
      "initial": "ready",
      "states": {
        "ready": [{"method": "GET", "path": "/work", "next": "retry", "response": {"status": 503, "body": {"retry": true}}}],
        "retry": [{"method": "GET", "path": "/work", "next": "ready", "response": {"status": 200, "body": {"ok": true}}}]
      }
    },
    "start": {"kind": "initial"},
    "steps": [
      {"method": "GET", "path": "/work", "expect": {"status": 503, "body": {"kind": "json", "value": {"retry": true}}}},
      {"method": "GET", "path": "/work", "expect": {"status": 200, "body": {"kind": "json", "value": {"ok": true}}}}
    ],
    "final": {"state": "ready", "requests": 2},
    "repeats": 2
  },
  "applicationState": {"kind": "stateless"},
  "command": {
    "mode": "acceptance",
    "title": "HTTP retry and recovery",
    "requirement": "Recover from one transient dependency failure",
    "current": {
      "executable": "/usr/bin/curl",
      "args": ["--silent", "--show-error", "--fail", "--retry", "1", "--max-time", "4", "{{serviceUrl}}/work"],
      "cwd": ".",
      "deadlineMs": 10000
    },
    "checks": [{"id": "response", "source": "stdout", "operator": "equals", "value": "{\"ok\":true}"}]
  }
}
```

Save as `workflow.json`, then:

```sh
praman workflow-replay workflow.json -o .praman/workflow-fresh
praman case-from-trace .praman/workflow-fresh/run-1/trace.json retry-case -o .praman/reconstructed-fresh
praman workflow-replay .praman/reconstructed-fresh/workflow.json -o .praman/replayed-fresh
```

MCP equivalents are `praman_workflow_replay({specPath,outDir})` and
`praman_case_from_trace({tracePath,name,outDir})`. Existing output directories are
refused. CLI exits and MCP `isError` use the same pass/fail/insufficient convention.
Reconstruction success means an executable case was built, **not** that it passed;
replay it to establish behavior. A complete failing capture remains reproducibly
failing: observed results are never promoted into new expected results.

Application state is explicit: choose `{"kind":"stateless"}` only when the command
does not retain relevant state, or `{"kind":"reset","command":{...}}` with a trusted
current-only command-verification declaration. PRAMAN executes and checks reset
once **before each repeat**, then starts/restores the dependency and runs the
application once. A failed/unavailable reset blocks application execution and is
insufficient evidence, not an application defect. Reset must restore all relevant
project-owned state; its checks and completeness are the caller's responsibility.
`dependency.repeats` controls the outer repeats; nested command `repeats` do not
create extra executions. The application's `current.deadlineMs` controls execution;
`dependency.deadlineMs` belongs to direct service replay and is not a client timeout.
Command cwd and executable paths containing a separator resolve relative to the
workflow declaration. Other command/artifact/path semantics remain unchanged.

Each private `run-N/trace.json` carries the normalized declaration, exact starting
simulator snapshot, actual ordered dependency interactions, and command completion/
executable hashes. `run-N/result.json` retains final state and reset/command results;
command streams/artifacts are private subdirectories. A maximum of 100 interactions/
1 MiB journal is retained; overflow or incomplete command execution is insufficient,
not a passing partial sequence. Input bounds remain 1 MiB and command deadlines/
artifact bounds remain those of command verification. All owned child process groups
and dependency servers are closed before return. No shell, sandbox or persistent
application server lifecycle is implied.

`case-from-trace` accepts only complete version-1 `praman-workflow` captures up to
4 MiB with explicit actions, independent expectations, compatible starting state
and normalized command paths. It copies the source trace, writes a validated
`starting-snapshot.json`, executable `workflow.json` and local trace-hash provenance.
Arbitrary/legacy spans, absent state/expectations, timeout or unavailable command
captures are rejected as insufficient. The old span-name-only `caseFromTrace()`
placeholder was removed; legacy `verify` saves diagnostic spans but no fake case.

This delivered scope covers declared CLI/command workflows against finite-state
HTTP dependencies, including real curl retry/recovery. It does not reconstruct
arbitrary browser/database/clock/network state, discover expectations from traces,
attest external dependencies, or prove authenticated historical defects. Reset,
statelessness and provenance are caller-declared; local hashes are not signed
history. Browser and repair/comparison proof/recording gates are unchanged.

### Workflow coverage-gap review (Group 3, bounded scope)

`coverage-review <declaration> -o <fresh-directory>` / MCP
`praman_coverage_review({specPath,outDir})` execute a suite of trusted command
workflows against **one declared finite-state HTTP dependency**. The review
finds reachable model transitions not verified by a passing workflow and declared
requirements without mapped command assertions. This is not source-code coverage,
autonomous discovery of intended behavior, or whole-application assurance.

Using the runnable curl `workflow.json` above, create a review declaration without
copying or changing its service model:

```sh
node --input-type=module -e '
import {readFileSync, writeFileSync} from "node:fs";
const workflow = JSON.parse(readFileSync("workflow.json", "utf8"));
writeFileSync("coverage-review.json", JSON.stringify({
  version: 1,
  service: workflow.dependency.service,
  cases: ["workflow.json"],
  requirements: [{
    description: "Recover from one transient dependency failure",
    checks: [{caseIndex: 0, checkIndex: 0}]
  }]
}, null, 2));
'
praman coverage-review coverage-review.json -o .praman/coverage-fresh
```

The declaration requires `version: 1`, `service`, 1–20 workflow file paths and
1–100 requirements. Each requirement has a nonblank `description` and `checks`:
up to 100 `{caseIndex,checkIndex}` mappings, both zero-based. `checkIndex: -1`
maps the expected command exit; other indexes select `command.checks`. Multiple
mappings are conjunctive: every mapped assertion must pass in every repeat.
An empty `checks: []` is a visible **untested requirement**, not a pass.
Mapping an assertion is a caller's statement of relevance; PRAMAN does not prove
that assertion fully expresses the requirement.

Workflow paths resolve relative to the review declaration; command paths retain
their workflow-relative semantics. Every case must use exactly the same service
model and `dependency.start.kind: "initial"`. Review is bounded to 100 states /
100 transitions and 1 MiB per declaration/workflow. Invalid references, mixed
models, unsupported snapshots and missing inputs are rejected **before any
application command runs**. Existing checked reset/stateless preconditions,
command deadlines, interaction limits and 2–10 isolated repeats still apply.
Commands/reset commands are trusted execution, not sandboxed code.

Reachability is computed from the model's initial state. Unreachable transitions
are listed separately and excluded from the reachable denominator; this is not
proof that a real application state is impossible. Counts are unique transitions,
not request totals, and do not grow merely because a repeat runs again.
Transitions distinguish `untested`, `exercised` (only complete failing workflows)
and `verified` (observed in at least one fully passing workflow run). Incomplete
or timed-out runs do not count; unmatched routes do not count as model transitions.
The entire review still requires **every case and every repeat to pass**.
Requirement statuses evaluate their mapped assertions; a failed dependency or
another command check still blocks the overall review even when that mapping passes.

For each reachable unverified transition, private `candidate-N.json` contains a
shortest initial-state HTTP path ending at that transition, with response/final-state
expectations taken from the declared model. It can be run with `service-replay`;
HEAD/204/304 responses use empty-body expectations. These are **simulator-only
stimuli**, not generated application commands or discovered requirement oracles.
Running a candidate never closes an application coverage gap. Author a real
application workflow and rerun the review to do that.

For returned review receipts, CLI exits: `0` when all scoped transitions, cases and mapped assertions pass;
`1` for coverage gaps, unmapped requirements or observed case/assertion failures;
`2` for invalid/unavailable/incomplete evidence. MCP `isError` matches. A coverage
gap is not an application defect. All receipts have `proof: false`; no repair,
recording or existing acceptance gates change.

Private `coverage.json` retains input errors; `declaration.json`, normalized
`case-N.json`, per-case workflow traces/results/streams and candidate files retain
raw inputs and observations. Public feedback contains structural requirement/case/
check/transition indexes and direct evidence paths/JSON pointers, not descriptions,
state names, routes, command strings or raw errors. A blocked reset has no command
assertion; its evidence pointer is `""` (the whole run result). Transition
`stateIndex` refers to `Object.keys(service.states)` order and `routeIndex` to that
state's transition array in the private declaration. Directories are 0700, files 0600; local paths can
still be sensitive. Existing output is refused without mutation. Broader browser,
saved-world, domain/adversarial application discovery and semantic requirements
review remain outside this bounded Group 3 stage.

### Isolated concurrent command/HTTP campaigns (Group 4, bounded stage)

`workflow-campaign <declaration> -o <fresh-directory>` / MCP
`praman_workflow_campaign({specPath,outDir})` schedule trusted workflow replays
with independent services, local application state and evidence per repeat,
then return one combined report. Execution can be bounded by rounds or by a
duration window; this is not resource-trend analysis or orchestration of coding/tester agents.

Using the runnable curl `workflow.json` above:

```sh
node --input-type=module -e '
import {readFileSync, writeFileSync} from "node:fs";
const workflow = JSON.parse(readFileSync("workflow.json", "utf8"));
workflow.command.current.cwd = "{{runDir}}";
writeFileSync("campaign-workflow.json", JSON.stringify(workflow, null, 2));
writeFileSync("campaign.json", JSON.stringify({
  version: 1,
  cases: ["campaign-workflow.json", "campaign-workflow.json"],
  rounds: 2,
  concurrency: 2
}, null, 2));
'
praman workflow-campaign campaign.json -o .praman/campaign-fresh
```

The strict declaration requires `version: 1`, 1–20 workflow file paths and
`concurrency: 1..8`. Choose exactly one schedule: `rounds: 1..20` (at most 100
jobs, `cases.length * rounds`), or `durationMs` plus `maxJobs` as described below.
Paths resolve relative to the campaign declaration.
Each job executes one workflow, including its 2–10 sequential dependency repeats.
Jobs enter the queue in round-major order; up to `concurrency` jobs run at once.
Rounds are queue ordering, not synchronization barriers: a free worker can start
the next round while a slower job from the previous round is still running.
There is no automatic retry, fail-fast, resumable queue, distributed scheduler
or process-crash recovery.

**By default, every repeat**, including repeats within a job, receives the
following fresh state. Explicit `state` modes below change only the stated lifetime:
- A fresh 0700 workspace as cwd, plus separate `home/` and `tmp/` directories.
  Both application and optional reset command must declare
  `current.cwd: "{{runDir}}"`; another cwd is rejected, not silently adopted.
- `{{runDir}}` substitution in application/reset arguments, environment and stdin.
  `HOME`, `TMPDIR`, `TMP` and `TEMP` are runner-owned and override declared values.
  Scripts/executables should be absolute or explicitly authored for this cwd;
  there is no automatic source/dependency copy. Executable paths containing a
  separator resolve relative to the original workflow declaration; other
  argument paths are not rewritten. Artifact assertion paths must be relative,
  without `..`, and remain workspace-relative; assertion paths are not templated.
- A checked reset when declared, followed by its own ephemeral loopback HTTP
  service from initial or validated saved simulator state. `{{serviceUrl}}`
  binds the application invocation as in standalone workflow replay. Saved
  snapshots are validated and privately captured before application/reset
  commands start; repeats restore independent copies, never update the source.
- Separate traces, command/reset results, streams and captured artifacts under
  `job-N/run-R/`. Workspace files remain private runtime evidence.

All workflow declarations, isolation requirements and snapshot inputs are
validated before any application/reset command runs. Missing executables,
timeouts or blocked resets produce insufficient evidence for that job; observed
complete mismatches fail. Neither stops the other scheduled jobs. The aggregate
is insufficient if any job is insufficient, otherwise failed if any fails, and
passed only when every scheduled repeat passes and the declared scheduling scope
completes. Duration mode also requires every case to have been admitted at least once.
Existing command deadlines, interaction/evidence limits and reset/stateless
responsibilities still apply. All owned command groups and dependency servers
close before return.

Returned CLI receipts exit `0`/`1`/`2` for passed/failed/insufficient; MCP `isError`
matches. `proof: false` never authorizes historical repair or recording.
`campaign.json` is the private combined machine receipt (including raw input
errors), `feedback.json` is its safe presentation, and `REPORT.md` combines
indexed job/run verdicts and evidence links. Job/case indexes are zero-based;
round/run numbers are one-based. Per-job start/end times, monotonic start offsets
(`startedAfterMs`) and `peakConcurrency` describe workflow scheduling, not an
assertion that requests overlapped.
Each run exposes direct trace/result/workspace paths; these local paths may be
sensitive. Directories are 0700 and runner-written evidence files 0600.
Existing output directories are refused without mutation.

Commands remain **trusted, not sandboxed**. Workspace/home/temp separation does
not isolate absolute paths, inherited environment beyond the four reserved
variables, external databases, credentials, ports or escaped processes. Declare
statelessness only within an honest state scope; reset commands must target
run-owned state and cannot safely reset a shared external system concurrently.
Caller-created workspace files retain the command's own permissions within the
private parent. No browser/native UI, whole-world snapshot, domain-invariant
discovery, arbitrary cross-application isolation or whole-app assurance is implied.

#### Duration-based soak window

After creating `campaign-workflow.json` with the curl recipe above:

```sh
node --input-type=module -e '
import {writeFileSync} from "node:fs";
writeFileSync("soak.json", JSON.stringify({
  version: 1,
  cases: ["campaign-workflow.json", "campaign-workflow.json"],
  durationMs: 10000,
  maxJobs: 100,
  concurrency: 2
}, null, 2));
'
praman workflow-campaign soak.json -o .praman/soak-fresh
```

MCP uses the same `praman_workflow_campaign({specPath,outDir})` tool.
`durationMs` is an integer from 1 to 86,400,000 (24 hours); `maxJobs` is a
required safety cap from 1 to 1,000. Omit `rounds`; mixing the two schedules,
missing the cap, or out-of-bounds input is insufficient evidence before any
application/reset command starts. The job cap bounds execution/evidence counts,
not total disk bytes, memory usage or request rate.

The monotonic duration clock starts **after** all input/snapshot prevalidation.
Workers cycle through the cases in the same round-major order, starting a new
job only while its start offset is strictly less than `durationMs`. At or after
the cutoff, no new job starts. Already admitted jobs finish **all** their repeats,
including repeats/reset commands that begin after the cutoff; their ordinary
command/evidence deadlines and owned-resource cleanup still apply.

**Duration is an admission window, not a hard return/kill deadline.** Draining
can span all remaining workflow command/reset deadlines plus evidence evaluation.
Choose suitable per-command deadlines and allow the MCP client's request timeout
to cover the window **and** drain. Graceful deadline completion is not signal-aware
cancellation: forcibly terminating the CLI/server or disconnecting its owner is
not a supported partial-receipt/crash-recovery workflow.

The combined receipt/report identifies the schedule and stop condition:
- `duration_elapsed`: admission reached the cutoff, then active jobs drained.
- `job_limit`: a worker needed another job before the cutoff but the cap was
  exhausted. This is **insufficient evidence**, even if all observed checks passed;
  it cannot claim completion of the requested soak.
- `input_error` / `execution_error`: scope validation or execution could not
  complete. Round mode instead ends with `rounds_complete`.

`schedule` includes the requested bounds, scheduling start/end timestamps,
monotonic `elapsedMs`, `admissionClosedAfterMs`, `drainMs` and `unstartedCases`
(zero-based case indexes). Preflight time is excluded; drain time is included in
elapsed time. A duration run that never admitted one of the declared cases is
insufficient, not a passing partial suite. Every admitted job/repeat still contributes
its own verdict; duration expiry never erases earlier failures or missing evidence.

Duration mode itself repeatedly exercises isolated workflows; it does not retain
application/simulator state across jobs or prove long-lived-session correctness.
Optional root-process resource observations are described below. No domain-invariant
discovery, distributed execution, autonomous testers or whole-world isolation is implied.
A short successful soak does not establish day-long reliability.

#### Optional sampled process-resource trends

Add `"resources": {"intervalMs": 100, "maxSamples": 100}` to either campaign
schedule; the existing CLI/MCP command remains unchanged. This opts into root
application-process sampling through `/bin/ps` (macOS/Linux-compatible output).
Intervals are 100–10000 ms and each invocation retains at most 2–1000 samples.
Sampling is serial, has a one-second/4-KiB bound per probe, uses the C locale,
and closes/awaits its outstanding probe before returning.

Each application command's private result records elapsed sample times, RSS in
KiB and ps-reported CPU percentage. The campaign exposes per-case/job/run peak
sampled RSS, first-to-last RSS delta, endpoint delta divided by measured elapsed
seconds, and peak reported CPU percentage; `REPORT.md` adds an indexed table.
The public projection withholds raw probe errors. CPU percentage semantics are
platform-defined; these are observations, not CPU-time accounting, a leak detector
or a resource-budget assertion. A positive endpoint slope can be ordinary warmup/GC.

This first resource chunk observes **only the root application process**:
not descendants, resets, PRAMAN, HTTP simulator, system totals, external services,
post-exit usage or a true unsampled peak. Short-lived commands with fewer than
two distinct-time samples, unavailable probes, errors and sample-cap truncation
produce insufficient resource evidence. When sampling was requested, such a job
and the overall campaign become insufficient even if behavior passed; individual
command/dependency verdicts remain available. Without `resources`, existing
behavior is unchanged. Choose a cap large enough for the command deadlines;
sampling overhead can affect measured workloads. Raw resource evidence is private.

#### Persistent and shared campaign state

State is opt-in. Omit `state` to preserve fresh-per-repeat behavior. The bounded
stateful stage accepts **exactly one workflow input**, in either schedule.
Existing cwd/artifact safety rules, checked declarations, journal limits,
resource observations, private permissions and fresh output requirements apply.
Unsupported multi-input stateful campaigns fail before application/reset commands.

For the `campaign-workflow.json` curl declaration authored above:

```sh
node --input-type=module -e '
import {writeFileSync} from "node:fs";
writeFileSync("worker-soak.json", JSON.stringify({
  version: 1, cases: ["campaign-workflow.json"], rounds: 4, concurrency: 2,
  state: {kind: "per-worker"}
}, null, 2));
'
praman workflow-campaign worker-soak.json -o .praman/worker-soak-fresh
```

`per-worker` retains each worker's **own** workspace, home/temp directories and
HTTP model across all its jobs/repeats. Workers never share those local files
or model instances. Each application invocation is still a new bounded process,
not a long-lived application server. A declared application reset is checked
**once before that worker's first application invocation**, not every repeat.
A failed or thrown reset poisons that worker's preconditions: no later application
invocation executes and no destructive automatic reset retry occurs. Without a
reset, callers remain responsible for honest starting application preconditions.

In either persistent mode, `dependency.final.requests` declares an **iteration
delta from the declared initial/snapshot request count**: final 6 from saved
count 4 requires two matched requests each invocation. Negative deltas and unsafe
integer ranges are rejected before commands. For per-worker traces, the runner
adds that independent delta to the *actual* starting count and retains the
normalized expected absolute final count; it does not replace an expectation
with the observed result. Ordered requests and final state must still match.
Author cyclic/repeatable workflows or expect failures as retained state changes.

`shared-service` retains independent application workspaces per worker, but their
owned loopback listeners use **one atomic finite-state model** in this PRAMAN
process. Different URLs/ports do not mean different model state. Each listener
attributes requests to its worker's current invocation; journals do not accidentally
include a peer's traffic. This is real concurrent HTTP-client contention against
shared simulator state, not distributed workers, a shared application filesystem,
an external database or whole-world isolation.

A repeatable shared-model example, using the same real curl workflow:

```sh
node --input-type=module -e '
import {readFileSync, writeFileSync} from "node:fs";
const workflow = JSON.parse(readFileSync("campaign-workflow.json", "utf8"));
workflow.dependency.service = {version: 1, initial: "ready", states: {
  ready: [{method: "GET", path: "/work", next: "ready",
    response: {status: 200, body: {ok: true}}}]
}};
workflow.dependency.steps = [{method: "GET", path: "/work",
  expect: {status: 200, body: {kind: "json", value: {ok: true}}}}];
workflow.dependency.final = {state: "ready", requests: 1};
writeFileSync("shared-workflow.json", JSON.stringify(workflow, null, 2));
writeFileSync("shared-soak.json", JSON.stringify({
  version: 1, cases: ["shared-workflow.json"], rounds: 4, concurrency: 2,
  state: {kind: "shared-service"}
}, null, 2));
'
praman workflow-campaign shared-soak.json -o .praman/shared-soak-fresh
```

Shared runs check their own ordered observations, matched-request delta and
last owned transition's final state. The campaign separately checks the global
final state and request count against the declared delta times all admitted
iterations plus the original starting count. Conflicts never disappear into a
reset: an irreversible "claim once" model can have a passing global count/state
yet failed per-invocation requirements after the first claim. Passing a global
invariant alone is not a passing campaign; incomplete jobs remain insufficient.

Jobs expose `workerIndex`; `state.workers` links private workspace/final-state
receipts, and shared mode adds `state.shared` with verdict and `shared-state.json`.
The shared receipt is authoritative for the final global snapshot; a worker's
snapshot at its own exit can precede other workers' completion. All owned
listeners close even on blocked/failed jobs; evidence and workspaces remain.

Shared captures use `kind: "praman-shared-workflow"` and are deliberately refused
by isolated `case-from-trace`: peer interleavings and world state cannot honestly
be recreated from one worker's journal. Per-worker captures retain ordinary
workflow traces and actual model starting snapshots; neither mode restores
application filesystem/database state from a trace. These modes persist state
**within this campaign only**, not across crash/restart or reused output folders.
General domain invariants, arbitrary database transactions, agent autonomy and
deployment/history attestation are not provided. Local durable isolated scheduling
is a separate mode below, not restoration of these live stateful sessions.

#### Local durable count campaigns

Start a fresh local durable session using an authored round-based campaign:

```sh
praman workflow-campaign campaign.json --durable -o .praman/durable-fresh
```

After an orderly interruption, resume from its saved queue without rereading the
original declaration:

```sh
praman campaign-resume .praman/durable-fresh
```

MCP: `praman_workflow_campaign({specPath,outDir,durable:true})`, then
`praman_campaign_resume({outDir})`. Default non-durable behavior is unchanged.
This first durable stage supports **round-based, isolated campaigns only**:
omit `state`; duration and persistent/shared-state durable sessions are rejected
before commands rather than pretending to restore a live world. Existing
1–20 cases, 1–20 rounds, maximum 100 jobs and 1–8 concurrency bounds apply;
each job still executes its workflow's 2–10 fresh repeats and optional resources.

SQLite stores the captured plan, atomic job admissions/completions, coordinator
ownership and attempt counter in private `queue.sqlite`. It requires a Node
runtime providing `node:sqlite` (verified here on Node 26). The optional native
module loads only for durable operations, so its absence does not break ordinary
commands; unavailable runtime/input/storage is insufficient, never an app defect.
No external database, Docker, Harbor or model configuration is required.

**Orderly pause:** CLI SIGINT/SIGTERM or MCP request cancellation stops *new*
admissions. Already admitted jobs finish all their repeats under ordinary
deadlines and close their command groups/services. Remaining jobs stay `pending`.
An incomplete/paused campaign is insufficient (CLI exit 2). A cancelled MCP
request can return an abort instead of a receipt; the server still records the
drained attempt while it remains alive. Allow drain time and do not terminate
the server to simulate an orderly cancellation. If all jobs were already admitted
and finish, the completed scope can still pass.

**Resume:** only pending jobs execute. Complete jobs—including failed or
insufficient ones—are never silently retried. Repeated resume of a completed
session performs no application work and preserves its original verdicts.
Workflow/snapshot inputs are captured once, and their hashes plus completed
machine-receipt hashes are checked before pending work. Editing the original
declaration does not change the captured plan. Editing captured inputs/receipts
blocks resumption; restoration of raw artifacts, external programs/dependencies
and authenticated provenance is not provided by these local hash checks.

**Ownership/recovery:** one live coordinator may own a session. A simultaneous
resume is refused without taking over or killing it. A reused live PID is
conservatively refused too. If an owner dies with a `running` job, the next
attempt becomes `recovery_required`: no pending jobs start and uncertain jobs
are not retried or declared complete. An application process may remain after
such an ungraceful crash; this bounded stage does not automatically adopt or
reclaim it. Inspect/recover owned execution externally before starting a new
session. Do not hand-edit queue state to manufacture completion. This is not
general crash recovery, exactly-once application side effects or a world snapshot.

Successfully reported coordination attempts append `attempt-N/durable.json`,
safe `feedback.json` and `REPORT.md`; old receipts are not overwritten. Rejected
concurrent operations do not create an attempt; input/storage errors can have
only a private error receipt. Executed `job-N/` directories retain normal full
workflow/campaign evidence, or startup failures have an indexed private error.
The combined report links global job/case/round indexes to receipts; a nested
single-job campaign has its own local indexes. Metadata and runner evidence are
0600 under 0700 directories. SQLite coordination state is mutable private runtime
data, not itself acceptance proof; every presentation remains `proof: false`.
Terminal campaigns use normal CLI 0/1/2 and MCP `isError` outcomes. Fresh start
still refuses an existing output directory.

Use the exact captured session path on the **same host and local filesystem**.
Moving/copying sessions, network-filesystem multi-host leases, distributed
execution, automatic retries and resuming persistent application/model memory
are unsupported. Resource and reset scope remains caller-declared; this is
trusted command execution, not sandboxing or whole-application assurance.

#### Bounded autonomous workflow selection

`agent-campaign <manifest> -o <fresh-directory>` / MCP
`praman_agent_campaign({specPath,outDir})` run **1–8 local testers**, each with its
own objective and **1–10 selection rounds**. Each round starts a fresh invocation
of a caller-selected agent command. The agent chooses **one zero-based index
from a catalog of 1–20 existing workflows**, using its goal, descriptions and completed
structural outcomes. PRAMAN—not the model—executes that unchanged workflow with
its normal **2–10 fresh command/HTTP repeats**, private workspace/home/temp/service
and independent authored checks. Testers run concurrently; rounds within one
tester are sequential. This is closed-set selection, not generated tests or fixes.

Example using an already authenticated, compatible Codex CLI and two existing
authored workflows:

```json
{
  "version": 1,
  "cases": ["healthy.json", "retry.json"],
  "requiredCases": [0, 1],
  "objectives": [
    "In round 1 select the immediate healthy-response workflow. In round 2, after your own completed observation is present, select the transient-outage recovery workflow. Use only the supplied catalog; do not use tools.",
    "In round 1 select the transient-outage recovery workflow. In round 2, after your own completed observation is present, select the immediate healthy-response workflow. Use only the supplied catalog; do not use tools."
  ],
  "rounds": 2,
  "agent": {
    "executable": "codex",
    "args": [
      "exec", "--ignore-user-config", "--skip-git-repo-check",
      "--sandbox", "read-only", "--ephemeral", "--json", "--color", "never",
      "--config", "project_doc_max_bytes=0",
      "--output-schema", "{{schemaPath}}",
      "--output-last-message", "{{proposalPath}}", "-"
    ],
    "cwd": "{{testerDir}}",
    "stdin": "{{prompt}}",
    "deadlineMs": 180000
  }
}
```

Save this as `agents.json` beside `healthy.json` and `retry.json`, then:

```sh
praman agent-campaign agents.json -o .praman/agents-fresh
```

The workflow catalog must describe the intended cases; these names/goals are
example data, not built-in target knowledge. Core has no Codex/provider registry
or fallback model. Supply a trusted compatible producer for another runtime.
The reference uses existing CLI authentication, ignored user configuration,
read-only model-tool sandbox and ephemeral local sessions; it does not copy
credentials or reconfigure an account. Flags depend on the installed runtime.
See [Codex non-interactive execution](https://developers.openai.com/codex/non-interactive-mode).

**Producer protocol:** `agent` uses the normal command invocation fields
(`executable`, `args`, `cwd`, optional `env`/`stdin`, required `deadlineMs: 1..300000`).
Its cwd must be exactly `{{testerDir}}`: a fresh private directory for this
tester/round, not a persistent model session. Executable paths containing a
separator resolve relative to the manifest. Args, stdin and non-null env values
support one-pass `{{prompt}}`, `{{promptPath}}`, `{{schemaPath}}`,
`{{proposalPath}}` and `{{testerDir}}` expansion; inserted authored text is not
expanded again. The declaration must deliver the prompt through an argument,
stdin or env value. Write a fresh JSON proposal at `{{proposalPath}}` and exit 0:

```json
{"caseIndex": 0, "reason": "Why this existing workflow is the next useful choice"}
```

Only these two fields are accepted: a valid catalog integer and a non-empty
reason up to 4000 characters, in a regular captured artifact up to 64 KiB.
Nonzero/timeout/unavailable producer, missing/malformed/extra-field/out-of-range
proposal or changed captured workflow/snapshot is insufficient—not a target
defect or permission to execute a generated command. No retry/fabricated choice
fills a missing proposal. All catalog inputs are captured/validated before any
possibly metered producer starts; selected input/snapshot hashes are checked
before and after application execution. These hashes are not authenticated
attestation of the external agent, programs, dependencies or filesystem.

**Scope and feedback:** `requiredCases` is a mandatory non-empty unique list of
catalog indexes. A passing subset cannot close missing required coverage.
Passing requires every bounded tester round and required case to complete, with
every selected workflow passing its independent checks. A later passing choice
never erases an earlier mismatch. Insufficient execution/interruption takes
precedence while failed rows remain visible. A pass does **not** prove the
semantic objective, model reasoning, unstated requirements or whole application.
The next prompt receives completed `{testerIndex,round,caseIndex,verdict}` rows
and remaining required indexes; concurrent in-flight work is not observed as
complete. No target commands/env, check values/IDs, raw errors, stdout or traces
are placed into that prompt. Authored objective/title/requirement text **is sent
to the chosen producer/provider**: review it and never include credentials.
Catalog descriptions are bounded to 64 KiB; complete prompts to 128 KiB.

**Evidence and ownership:** `agent-campaign.json`, safe `feedback.json` and
`REPORT.md` combine indexed outcomes and private links. Each
`tester-N/round-N/` retains its prompt/context/schema, captured proposal,
producer exit/hash/output receipts, selection receipt and normal isolated child
campaign evidence. Model reasons and raw errors stay private, not public feedback.
PRAMAN writes metadata/output/captured artifact copies as 0600 under 0700
directories; a trusted producer's original files have its chosen modes inside
the private workspace. Original declarations are preserved; existing output is
refused. CLI uses 0/1/2 and MCP `isError` as usual; aggregate `proof` stays false.

CLI SIGINT/SIGTERM and MCP cancellation stop new proposer/workflow admission,
then drain already running producer commands and admitted workflow repeats under
their ordinary deadlines. Cancellation can return an MCP abort before the saved
report is ready; keep the server alive to drain. This surface is not resumable:
do not reuse its output as a durable queue. No shared/persistent target state,
cross-host agents, input synthesis, arbitrary generated shell, oracle mutation,
automatic repair or native/browser discovery is provided by this chunk.
PRAMAN executes explicitly trusted producer/workflow programs and is **not a
security sandbox**; provider tool access, inherited environment, credential
handling and sandbox permissions remain caller-owned.







The Headlamp dry-run preview and Kan attachment examples were part of the historical
dogfooding work; their declarations and evidence were archived outside the repository
on 2026-11-05. The product no longer bundles target-specific example declarations.

### Docker environments

The Docker provider remains implemented for project-local declarations: `services`
declare image, environment, command arguments, a loopback-published port and an
exec or HTTP readiness check; Docker workloads name a declared service and run
`args` inside that owned container; `faultService` is physically stopped by `fault`
and must fail its own readiness check; `recover` starts it and awaits readiness.
Unique container names and random ownership labels prevent adopting or deleting
foreign containers. There are no user host mounts or shared persistent volumes.
Reset restores the declared seed; Docker state isolation is not hostile-code or
network isolation.

The Kan-specific adapter, its PostgreSQL/RustFS declarations, historical issue
reproduction, credentials and evidence were archived on 2026-11-05 and are not part
of the product. Use a project-local `application.module` integration for new apps.

## Declared-scenario Review/Feedback

Standalone `scenario-verify`, managed `environment verify`, managed/standalone
`demonstrate` and their MCP consumers share `src/review/feedback.ts`. Managed CLI/MCP
results include `evidence.feedback`, `feedbackPath` and `report`; standalone paths
return the same fields directly. Programmatic `proveChange` returns
`{ verdict, proof, feedback, feedbackPath, report, diagnostics }`, not a bare `ChangeProof`.

- Findings group a declared check's before/current occurrences without losing
  repeated-run observations, checkpoints, missing evidence or unaffected checks.
- Current mismatches, baseline comparison mismatches, historical failures, resolved
  named repairs, incomplete execution and satisfied expectations stay distinct.
  Acceptance findings contain current occurrences only. An expected negative
  assertion is not automatically a defect. The proof verdict is the mode-specific
  acceptance verdict at test time, not a new whole-app review verdict; retained
  evidence gaps are explicit and prevent a resolved classification.
  Passing acceptance findings describe satisfied current requirements, not
  “No repair requested.” A mismatch asks the consumer to inspect the requirement,
  private expectation/observation and preconditions before deciding whether the
  requirement or implementation needs correction. Command feedback and shared
  CLI/MCP/report diagnostics use the same acceptance interpretation. Failed
  requirements are not automatically established application defects; repair and
  comparison retain their separate historical/baseline meaning.
- Each record includes safe structural check/run attribution, private proof/result/
  screenshot/network references, available environment/generation/source/build
  context and a bounded next investigation goal. String/object expectations and
  observations stay in private evidence. Root causes remain unknown; supplied
  hashes/diffs are not signed deployment provenance.
- Each managed run saves a private declaration pointing to its exact scenario.
  Reproduction requires a fresh instance after teardown and restoration of the
  observed state/preconditions from private operation history; a fresh seed alone
  may not reproduce a stateful failure. Saved localhost URLs are not live targets.
- Safe feedback/report and CLI/MCP presentation withhold arbitrary application
  text, check IDs, selectors, string/object expectations/observations, workflow
  fill values, recognized credential fields and raw error/evidence text.
  Numeric scalars matching known private numeric values are also withheld,
  including leading-zero/exponent equivalents; unrelated numeric/boolean
  observations and caller-owned local paths remain visible. Matching structural
  numbers can also be withheld conservatively; use private evidence for originals.
  Raw declarations, scenarios, proof/results, network captures and screenshots
  remain **private**, not sanitized exports. Local paths can themselves be
  sensitive; review before sharing. No bounded excerpt/disclosure mode is enabled.
- Recording delivery is reported separately: a later recording failure does not
  rewrite acceptance proof or create a new application diagnosis. CLI exit codes
  and MCP error semantics are unchanged.

### Indexed private diagnosis and concise CLI output

`scenario-verify`, `command-verify`, `demonstrate` and `command-demonstrate` accept
`--summary`. It prints the outcome, the first actionable diagnostic, direct
private evidence paths and next action; a count points to additional diagnostics.
Default JSON and corresponding MCP results retain the full `diagnostics` array.
The default browser `demonstrate` output includes a separate `Diagnostics:` JSON
array for delivery failures, not just the verification-only feedback.
Reports include locally clickable evidence links. Exit codes remain 0 for
success, 1 for failed requirements and 2 for unavailable/insufficient evidence.

Diagnostics use fixed categories (`check_mismatch`, `execution_unavailable`,
`evidence_unavailable`, `proof_gate`, `story_preflight`, `recording_unavailable`).
`version`/`run` identify execution; runs are one-based. `checkIndex`, `beat` and
browser `step` are zero-based declaration/story indexes; `checkIndex: -1` denotes
the implicit command exit check. `references` contain an absolute private local
`path` and, where applicable, a JSON `pointer`. Browser result/proof check rows
hold expected/observed values. Command expectations live in `declaration.json`;
result rows link directly to captured stdout/stderr/artifacts.

Recording failures expose only structurally reached positions, never selectors,
DOM text or exception excerpts. Unknown positions are omitted. Successful
preflight positions are not reused as later failure locations. Recording outcome
is separate from the unchanged proof verdict; fresh proof and matching final
replays remain mandatory. This is evidence navigation, not root-cause inference
or permission to record/publish.

```bash
praman scenario-verify ./scenario.json -o ./.praman/fresh-proof --summary
praman command-verify ./commands.json -o ./.praman/fresh-command-proof --summary
```


This does not generalize the separate legacy checkout verifier's two-invariant
review, discover requirements, repair code automatically or adopt Harbor.


## Proof first, walkthrough second

PRAMAN verifies the declared mode before recording. Current-only acceptance does
not require a failure, baseline or source repair. Comparison shows actual baseline/
current behavior without turning synthetic evidence into history. Repair retains
the approved before/code/after story and strict old-failure/current-success gate.

The following **repair** example requires genuine old/current deployments:

```json
{
  "mode": "repair",
  "baselineKind": "historical",
  "title": "Correct product tooltip",
  "change": "Read product.name instead of returning a constant placeholder.",
  "beforeUrl": "http://127.0.0.1:3211",
  "afterUrl": "http://127.0.0.1:3212",
  "steps": [
    {
      "action": "hover",
      "selector": "#details",
      "note": "Hover Details and inspect the product name in the tooltip."
    }
  ],
  "checks": [
    {"id": "product-name", "kind": "text", "selector": "#tooltip", "equals": "Widget"}
  ],
  "regressionCheck": "product-name",
  "repeats": 2,
  "walkthrough": {
    "startStep": 0,
    "before": [
      {"step":0,"at":"before","text":"You need the product name to identify what you are inspecting. Let's open its details."},
      {"step":0,"at":"after","text":"The tooltip shows a placeholder instead of the product name.","selector":"#tooltip"}
    ],
    "code": {
      "title":"Use the product's name, not a placeholder",
      "text":"The declared repair reads product.name rather than returning a constant. No source diff is supplied in this minimal example."
    },
    "after": [
      {"step":0,"at":"after","text":"The same action now shows Widget. This verifies the name in this tooltip, not every product workflow.","selector":"#tooltip"}
    ]
  }
}
```

```sh
node dist/cli.js demonstrate ./scenario.json -o ./.praman/change-report
```

- Testing records expected/observed outcomes and screenshots, **not video**.
  In repair mode, the named regression must actually fail on the old version;
  other old checks must pass. Every mode requires passing current checks in at
  least two fresh browser sessions.
- Visibility checks may declare `beforeEquals` when the old and corrected UI must
  intentionally differ—for example, an error panel present before and absent after.
  `equals` remains the current-version requirement. Visibility checks wait briefly
  for real asynchronous UI updates; absent tooltips are not treated as success.
- Missing checks, unavailable actions/endpoints, missing JSON fields, or unrelated
  runtime errors are insufficient evidence—not a pass. Checks include text equality,
  form `value`, visibility, decoded `image` dimensions, JSON fields and `pageErrors: 0`.
  A screen rendering or HTTP 200 alone does not prove the acceptance criteria.
- Additional native browser checks use the same `id`, `selector`, `equals` and
  optional `afterStep` fields:
  - `kind: "attribute", name: "aria-expanded", equals: "true"` checks exact
    attribute text; `equals: null` requires absence of that attribute.
  - `kind: "class", token: "selected", equals: true` checks one complete class token,
    not a substring; `false` asserts that token is absent.
  - `kind: "state", state: "hidden" | "enabled" | "checked", equals: true | false`
    observes Playwright DOM state. `checked` requires a supported checkable element.
    Continue using `kind: "visible"` for visibility.
  These observations require one attached element, including hidden-state checks:
  missing/ambiguous selectors and unsupported operations are insufficient evidence,
  not attribute absence or a passing negative assertion. They retry for up to
  1.5 seconds for asynchronous updates and retain actual expected/observed values
  and screenshots in private proof. ARIA attributes are not an accessibility audit.
- Network-policy checks count observed browser HTTP(S) request attempts in an
  explicit zero-based action window; they **observe**, not enforce, policy:
  ```json
  {
    "id": "no-tracking",
    "kind": "network",
    "match": {"urlPattern": "^https://tracking\\.example/", "method": "POST"},
    "window": {"fromStep": 0, "throughStep": 2, "settleMs": 250},
    "equals": 0
  }
  ```
  `urlPattern` is a JavaScript regular expression over the absolute URL; optional
  `method` is uppercase and optional `status` is an integer HTTP status (100–599).
  `equals` is a nonnegative exact count. Use a positive count to require traffic
  or zero to forbid matching traffic. `fromStep <= throughStep` must name existing
  steps; `settleMs` is required, 0–10000. Do not supply `afterStep`.
  The window opens immediately before its first action (after any before-action
  narration) and closes after its last action plus the declared settling time.
  Initial automatic navigation is outside these windows. Windows closing at the
  same step share a wait but keep independent deadlines; later requests/responses
  cannot retroactively satisfy an earlier deadline. Each redirect request is a
  separate attempt. Failed requests count without a status filter; with a status
  filter, matching in-flight requests lacking a response/failure at the deadline
  make evidence insufficient, never a passing zero.
  Context listeners include frame/popup requests; service workers are blocked only
  for scenarios declaring network checks. Non-HTTP traffic, WebSocket messages,
  service-worker/offline behavior and API requests made by JSON checks are not
  covered. A failed action, closed page or capture over 10000 requests cannot
  establish a passing policy. Private evidence includes counts, window bounds,
  matching request details, network capture and screenshots. Shared proof,
  feedback, checkpoints and replay count comparisons apply unchanged.
- After the gate passes, PRAMAN records **live browser replays** with highlights,
  captions, and timed narration. It rechecks the actual result while recording;
  replay drift blocks publication instead of producing a misleading success demo.
- Repair video order: **problem and impact → visible previous failure → why the
  code change fixes it → same action working → delivered outcome and limits**.
  Acceptance uses current `after` beats only; comparison uses neutral baseline/current
  beats, with optional code. Neither claims a historical failure/fix.
  Follow the application-independent [video standard and authoring prompt](docs/video-guidelines.md).
  An authored `walkthrough` is required for recording; action notes are not a
  substitute. Verification-only scenarios can still omit the story.
  Narration text must contain a non-whitespace character; blank browser,
  terminal and source beats are rejected before execution rather than skipped.
  Optional `diffPath` supplies actual source; when present, explicit excerpts
  and focused code beats are required. The recorder shows one focus at a time
  with readable source, filename, version and line numbers. Full diffs stay in
  private evidence. A supplied diff is not proof of deployed source identity.
- Before speech generation, the recorder executes a **no-speech story preflight**:
  all setup/actions run in order; each narration focus is checked at its authored
  `before`/`after` step position, and source scenes use the actual capture renderer.
  Private `video/preflight/preflight.json` records `proof: false`, pass/block status,
  failing position and scene PNGs. Hidden/missing/offscreen focus, unreadable source
  fit, a target covering at least 80% of the viewport, or caption overflow/focus
  overlap blocks speech. Choose an explicit narrower selector or shorter/smaller
  source beat; no target is silently replaced. This adds real actions and is not
  a sandbox: preserve caller-owned isolation/reset conditions.
  Preflight is neither final replay proof nor human review; fresh proof and
  matching live recording replays remain mandatory. It generates no audio/video.
  Use standalone `preview` to inspect the same browser scenes before requesting delivery;
  see [standalone scene preview](#standalone-scene-preview-group-8).
- Browser demonstration output must be absent or empty. Keep declaration/input
  files outside it. Reused nonempty folders are rejected without changing their
  proof, movie, captions or manifest; direct browser recording likewise refuses
  an existing `demo.mp4` or `video/` directory. Choose a new destination to retry.
- Requires Chromium, `ffmpeg`, and `ffprobe`. Set `PRAMAN_VATRA` to the installed
  Vatra helper to use MLX/Kokoro `af_heart`; an unavailable requested helper fails
  instead of silently changing voices. Otherwise voice uses macOS `say` or
  `espeak-ng`/`espeak`; no available engine blocks narrated delivery.
  Exit codes: 0 demonstrated; 1 failed; 2 insufficient evidence/unavailable recording.
- Artifacts: `proof.json`, private `scenario.json`, `feedback.json`, `REPORT.md`,
  per-run `result.json` and screenshots, then `demo.mp4`, `video/tour.json`,
  `video/captions.vtt`, and narration/recordings. Managed runs also retain a private
  replay declaration; credentials and raw evidence must not be published.
- Scope is the declared scenario, not the entire app. Browser sessions are fresh;
  raw `demonstrate` URLs require caller-owned state isolation. The managed
  `environment` commands supply and reset the declared infrastructure. Supported
  actions: goto, waitForURL, click, hover, fill, press, upload and waitFor. CLI upload
  paths resolve relative to the scenario file; programmatic/MCP callers supply
  resolved paths. `upload.completionSelector` waits for real completion inside
  the action, before narration holds can outlast transient confirmation UI.
  Use explicit completion conditions for asynchronous mutations.
  After navigation, use `waitFor` on an application-owned visible ready state;
  `waitForURL` alone is not content readiness. Put result narration `at: "after"`
  that wait step, not on the click or URL step. Text equality observes rendered
  `innerText`, including CSS casing (`Released` can render as `RELEASED`); form
  `value` observes `inputValue()`. See the [runnable casing/readiness example](docs/static-browser-acceptance.md#authoring-text-checks-and-navigation-ready-story-beats).
  Checks normally run at the end. Optional zero-based `check.afterStep` captures
  transient results immediately after that action, before narration or the next
  action—for example, decode a full-size image before closing its dialog.
  `pageErrors` must remain an end-of-workflow check. Every checkpoint still counts
  toward the same complete before/current proof gate and replay comparison.
  Each run saves `network.json` (including optimizer error bodies); a visible
  broken image cannot pass an `image` check. Autonomous test design, arbitrary
  source checkout/deployment and exhaustive behavior discovery remain out of scope.

### Standalone scene preview (Group 8)

```sh
node dist/cli.js preview ./scenario.json -o .praman/browser-preview-fresh
node dist/cli.js command-preview ./video-plan.json -o .praman/command-preview-fresh
```

MCP equivalents: `praman_preview({scenario,outDir})` (inline browser declaration)
and `praman_command_preview({planPath,outDir})`. Both call the same no-speech
preflight used before recording; no speech engine, ffmpeg or ffprobe is needed
for layout inspection. Authored artifact checks may still need their own decoder
or other execution prerequisites. These commands generate **no audio or movie**.

The destination must not exist, even if empty. CLI scenario identity/upload/diff
paths resolve relative to its JSON file. Command plan `commandsPath`/`diffPath`
resolve relative to the plan; command cwd/script identities retain declaration-relative
resolution. Inline MCP browser paths use server cwd, as with browser verification.
Keep inputs outside outputs. Existing output is refused without mutation.

Results carry `kind: "story-preflight"`, `proof: false`, `status: "passed" | "blocked"`,
structural scene indexes/private screenshot pointers and indexed `diagnostics`.
`verdict: "passed"` means **layout preview passed, not requirements passed**;
blocked previews use `verdict: "insufficient_evidence"`. CLI exits 0/2 for those
statuses; MCP sets `isError` on blocked results. Invalid MCP arguments or output
creation failures are rejected before execution, not adopted as a preview.
Private `preflight/preflight.json` retains scene geometry/raw errors; `feedback.json`
is the safe returned presentation. Output directories are 0700 and JSON receipts
0600. Public results omit narration, selectors, command output and raw exceptions;
local evidence paths can still be sensitive.

Each browser/terminal/code beat may add:

```json
{"framing":{"caption":"top","padding":16}}
```

- `caption`: `auto` (existing bottom/top selection), `top` or `bottom`. An explicit
  choice is honored or blocked on overlap/overflow, never silently moved.
- `padding`: integer 0–32 viewport pixels around the full selected target, clipped
  only at viewport edges. Omission retains 8 pixels. It never crops or retargets.
- The target **and padded aperture** must remain below 80% of viewport area.
  Visibility, complete target viewport fit, readable source/terminal bounds and
  caption/focus separation remain required. No zoom, font shrink, hidden output
  or automatic narrower-selector substitution.
- Use `framing` on `walkthrough.before/after` browser or terminal beats and on
  `walkthrough.code.beats`; selectors/source/terminal line ranges still select
  the actual focus. Private focused scene evidence records requested framing,
  resolved caption position/box, target and aperture. Defaults are not inserted
  into older declarations; existing normalized hashes stay unchanged.

Previews execute real setup/actions/commands once per declared stage and can
change external state. Use caller-owned isolation/reset discipline. Complete
requirement mismatches may still have a passing **layout** preview; unavailable
execution/evidence blocks it. Preview is neither repeated acceptance proof nor a
historical repair claim, human review or recording authorization. A framing edit
does not waive final fresh proof, matching live replays or narration. Add
`--cut short` (MCP `cut: "short"`) to inspect the authored short composition;
the private receipt identifies its original selected beats and story hash.
This does not measure speech duration. Speech reuse remains separate Group 10 work.

### Story-directed walkthroughs

Keep the acceptance workflow complete; direct its presentation separately with
`walkthrough`. It is optional for acceptance verification but required for video.
The coding agent authors the story from demonstrated behavior using the
[reusable prompt and comprehension checklist](docs/video-guidelines.md).
PRAMAN does not invent a cause or autonomously write a human story. Missing
story/source focus blocks movie delivery without rewriting valid acceptance proof.

```json
{
  "walkthrough": {
    "startStep": 5,
    "before": [
      {"step":5,"at":"before","text":"Let's add an image to this card."},
      {"step":5,"at":"after","text":"The upload finishes, but the preview is broken.","selector":"button[aria-label=\"View proof.png\"] >> nth=-1"}
    ],
    "after": [
      {"step":5,"at":"after","text":"This time, the preview appears."}
    ],
    "code": {
      "title":"Use the storage address Kan was given",
      "text":"The fix uses the configured storage endpoint instead of guessing its parent domain.",
      "excerpts":[
        {"file":"apps/web/next.config.js","side":"before","from":69,"to":76,"label":"Previously"},
        {"file":"apps/web/next.config.js","side":"after","from":68,"to":73,"label":"With the fix"}
      ],
      "beats":[
        {"text":"Previously the hostname was split to guess a parent domain. That guess rejected a valid storage endpoint.","focus":{"file":"apps/web/next.config.js","side":"before","from":69,"to":71}},
        {"text":"The fix reads the configured hostname and port directly. This allows the preview to use the same endpoint as the uploaded original.","focus":{"file":"apps/web/next.config.js","side":"after","from":69,"to":71}}
      ]
    }
  }
}
```

This fragment comes from a historical dogfooding scenario; the complete example was
archived on 2026-11-05.
All indices are zero-based; `at` defaults to `after`. `startStep` trims setup footage
from the finished movie, **not execution or checks**. Full raw recordings remain;
`tour.json` records `startedAt` and `presentedAt`. Before/after beats anchor speech
to the real action/result, with measured audio holds and quieter captions/highlights.
Code explains one idea per focused beat, not a wall of diff. Up to eight excerpts,
each at most twelve consecutive lines, must exist completely on the requested
side of the supplied diff. Only the beat's selected lines are shown, full width;
missing ranges or an overflowing view block the movie. Split a long focus rather
than shrinking the text. The full diff, checks/verdicts and scope remain in the report.

For an immersive team demo, a beat's `selector` keeps that live region sharp while
the surrounding page is dimmed and blurred. Focus moves between beats; the overlay
does not clone the widget, replace the application or intercept its controls.
Missing, hidden or out-of-frame focus targets block recording rather than silently
omit a promised highlight. Observed selectors, target/aperture bounds and effects
are retained per note in `tour.json`.

For source-change videos, `walkthrough.code.beats` is required and each beat
requires an exact file, version and line-range focus. Beats supply narration
instead of `code.text` (which remains the summary). Each focused range must fit
completely inside one declared source excerpt:

```json
{
  "beats": [
    {"text":"Here Kan guesses a parent domain.","focus":{"file":"apps/web/next.config.js","side":"before","from":69,"to":71}},
    {"text":"The fix uses the configured hostname and port instead.","focus":{"file":"apps/web/next.config.js","side":"after","from":69,"to":71}}
  ]
}
```

Author the story like an engineer showing teammates their work: explain why an
action matters, point at its result, walk through the causal code lines, then
repeat the action. More detail should clarify the work, not bring back narrated
test verdicts, every click, login/setup footage or invented reactions.



Real-project examples (Headlamp tooltip repair, Kan checklist/attachment campaigns,
Stern repair, jq command movie) were archived outside this repository on 2026-11-05
together with their evidence and movies. The product no longer ships target-specific
scenarios; the walkthrough contract above is the general mechanism.

## MCP

```
node dist/cli.js mcp
```

The server exposes 14 tools. Core verification: `praman_scenario_verify(scenario, outDir)`
and `praman_command_verify(specPath, outDir)` return evidence-backed verdicts
(`isError` set on non-pass). Proof-gated delivery: `praman_demonstrate` and
`praman_command_demonstrate`. Non-proof previews: `praman_preview` and
`praman_command_preview`. Managed lifecycle: `praman_environment`. Workflow and
campaign tools: `praman_service_replay`, `praman_workflow_replay`,
`praman_coverage_review`, `praman_workflow_campaign`, `praman_campaign_resume`,
`praman_agent_campaign`, `praman_case_from_trace`.

The legacy `praman_verify`, `praman_experience` and `praman_stimulate` tools
were removed on 2026-11-05; they depended on the deleted checkout demo pipeline.

## Kiro usage

`/.kiro/` contains specs, steering, a save hook and a custom agent.

Actual Kiro engineering was **one bounded IDE session** (2026-11-01, about 86
minutes) that started a Headlamp dry-run preview feature before hitting a usage
limit; the remaining work and the product core were completed with an assistant.
Attribution is mixed and disclosed. The full truthful account, observed evidence
and limits are in [Kiro usage](docs/kiro-usage.md). Do not claim substantial
Kiro-authored development without evidence; do not claim Kiro built the core.

## License
MIT


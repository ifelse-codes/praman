# Static/browser-only acceptance

Use `scenario-verify` for a running HTML/JavaScript app. It executes real Chromium actions, checks declared requirements, saves screenshots and returns feedback. No command harness, before fixture, Docker, kind, narration or video is required.

## Prerequisites and ownership

In the PRAMAN checkout: `npm ci`, `npx playwright install chromium`, then `npm run build`. Use an absolute path to `dist/cli.js` below. Node runs PRAMAN; the target itself can be dependency-free. For a fully public owned fixture plus CLI/MCP negative controls, start with the [first-use guide](first-use.md).

Keep the scenario, setup and any reset/seed logic in the target project. Use a disposable origin and test data. Every repeat gets a fresh browser context; that isolates browser storage, **not backend data or external side effects**. The caller must provision/reset those when necessary. PRAMAN does not infer requirements or silently patch the application.

## Separate-project example: Luma

This current-only workflow was exercised against the separate `luma/` checkout on 2026-11-03, without changing its source or using its manufactured before fixture. The example verifies task creation only, not all Luma behavior.

1. From the target project, start an owned loopback static server in a separate terminal:

   ```sh
   python3 -m http.server 8080 --bind 127.0.0.1
   ```

   The exercised run used Luma's `node tools/serve.mjs .`, which prints its allocated loopback URL. Either server serves the same current application files; put the actual URL in `afterUrl`. Do not adopt or kill someone else's server.

2. Save this declaration as `proof/current-acceptance.json` in that project:

   ```json
   {
     "mode": "acceptance",
     "title": "Current task creation",
     "change": "Adding a task keeps its title, clears the composer and updates the count.",
     "afterUrl": "http://127.0.0.1:8080",
     "repeats": 2,
     "steps": [
       {"action":"fill","selector":"#taskInput","value":"Review current-only acceptance","note":"Enter a task"},
       {"action":"press","selector":"#taskInput","key":"Enter","note":"Add the task"}
     ],
     "checks": [
       {"id":"title","kind":"text","selector":"#taskList .task__title","equals":"Review current-only acceptance"},
       {"id":"composer-cleared","kind":"value","selector":"#taskInput","equals":""},
       {"id":"all-count","kind":"text","selector":"#allCount","equals":"1"},
       {"id":"runtime","kind":"pageErrors","equals":0}
     ]
   }
   ```

   `change` is the existing browser requirement-description field, also used for new work. Acceptance rejects `beforeUrl`, `baselineKind`, `regressionCheck` and visibility `beforeEquals`. Adapt selectors, actions and requirements for another application; do not add its names or selectors to PRAMAN core.

3. From the target project, run:

   ```sh
   export PRAMAN_CLI=/absolute/path/to/praman/dist/cli.js
   node "$PRAMAN_CLI" scenario-verify proof/current-acceptance.json \
     -o .praman/current-acceptance
   ```

   Choose a new output directory on every run. CLI relative upload/diff paths resolve against the scenario file. MCP uses `praman_scenario_verify({ scenario, outDir })` with the same parsed scenario object; supply absolute upload paths to MCP.

4. Read `REPORT.md` and `feedback.json`. Private `proof.json` records mode, declaration hash, exact target URL, checks and repeated outcomes. `scenario.json`, `after-1/` and `after-2/` retain inputs, per-run results, screenshots and network observations. Acceptance creates no `before/` evidence.

   - **passed / exit 0:** every declared requirement passed in all repeats.
   - **failed / exit 1:** a current requirement had an observed mismatch with complete evidence.
   - **insufficient_evidence / exit 2:** execution or evidence is unavailable/incomplete. This is neither success nor an established app defect. Mixed unavailable/failed runs stay insufficient overall; observed mismatches remain in feedback.
   - Invalid declarations are rejected before execution, not turned into a pass.

5. Stop **only the owned server** with Ctrl-C. Retain private evidence under an ignored `.praman/`; do not publish screenshots, filled values or network captures without review.

## Failure and unavailable-evidence exercises

The saved Luma smoke deliberately required a different task title while entering the original title: both current runs observed the actual title and returned `failed`. This validates mismatch reporting; it is **not a claim of a Luma defect**. A nonexistent app URL returned `insufficient_evidence`, not a pass. Both cases also ran through real MCP stdio calls with `isError: true`.

For your own project, declare a meaningful requirement and inspect observed values rather than adjusting expectations until everything turns green. An absent selector for a text/value/image observation is unavailable evidence; an explicit visibility expectation can intentionally assert absence. HTTP 200 and a screenshot alone are not acceptance.

## Authoring text checks and navigation-ready story beats

Text checks compare the element's **rendered `innerText`**, with exact casing and
whitespace; they do not compare HTML source or automatically normalize text.
For `<span style="text-transform:uppercase">Released</span>`, declare
`"equals": "RELEASED"`, not `"Released"`. Form `value` checks instead observe
`inputValue()`. Inspect the actual UI and private observations before choosing
an expectation; do not change a meaningful requirement merely to obtain a pass.

Navigation and readiness are separate. `waitForURL` confirms the URL, not that
asynchronously loaded content is usable. Follow navigation with `waitFor` on a
visible, application-owned ready-state selector. An element that is visible
throughout loading is not a ready signal. There is no arbitrary sleep action.

### Runnable delayed-navigation example

In a separate disposable project, save these two files and start the loopback
server from the prerequisites above. The timer below **simulates an application
loading asynchronously**; it is not a scenario delay or recommended app logic.
In a real project, choose a selector that becomes visible after actual readiness.

`index.html`:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Release overview</title>
<body>
  <h1>Release overview</h1>
  <a id="open-release" href="/release.html">Open release details</a>
</body>
</html>
```

`release.html`:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Release details</title>
<style>
  body { font: 20px sans-serif; margin: 48px; }
  #release-status { text-transform: uppercase; }
</style>
<body>
  <h1>Release details</h1>
  <p id="loading">Loading release details…</p>
  <section id="release-ready" hidden>
    <p>Status: <span id="release-status">Released</span></p>
    <p>The current release is available.</p>
  </section>
  <script>
    setTimeout(() => {
      document.querySelector('#loading').hidden = true;
      document.querySelector('#release-ready').hidden = false;
    }, 1000);
  </script>
</body>
</html>
```

Save `release-acceptance.json` alongside them; replace the origin if your owned
server uses another port:

```json
{
  "mode": "acceptance",
  "title": "Current release details",
  "change": "Opening the release details shows the ready release with its rendered status.",
  "afterUrl": "http://127.0.0.1:8080",
  "repeats": 2,
  "steps": [
    {"action":"click","selector":"#open-release","note":"Open release details"},
    {"action":"waitForURL","path":"/release.html","note":"Confirm release navigation"},
    {"action":"waitFor","selector":"#release-ready","note":"Wait for loaded release details"}
  ],
  "checks": [
    {"id":"release-status","kind":"text","selector":"#release-status","equals":"RELEASED","afterStep":2},
    {"id":"loading-finished","kind":"visible","selector":"#loading","equals":false,"afterStep":2},
    {"id":"runtime","kind":"pageErrors","equals":0}
  ],
  "walkthrough": {
    "startStep": 2,
    "after": [
      {"step":2,"at":"after","selector":"#release-ready","text":"The release details are loaded. The status reads RELEASED, so we can see this release is available."},
      {"step":2,"at":"after","selector":"#release-status","text":"This checks the current release screen only. It does not verify publishing or the rest of the application."}
    ]
  }
}
```

Run:

```sh
node "$PRAMAN_CLI" scenario-verify release-acceptance.json -o .praman/release-acceptance
```

Verification does not generate speech or video. The optional story uses zero-based indexes: narration belongs
**after step 2**, the ready-state wait, not after step 0's click or step 1's URL
wait. `startStep` trims presentation only; every setup action still executes.
For direct `goto`, use the same pattern: `goto` → `waitFor` → an `at: "after"`
beat on that ready-state step. A narration hold must never be the thing that
makes an otherwise-racy acceptance check pass.

If presentation is separately authorized, use the existing
[no-speech story preflight](video-guidelines.md#no-speech-story-preflight) to
inspect focus at that actual position before speech. A passing preflight is
explicitly non-proof; final recording still requires fresh proof and matching
live replays. Do not treat these examples as permission to create a movie.

## Common authoring traps

- **One element per selector.** Playwright strict mode rejects selectors matching
  two or more elements (most checks also require an attached element). An
  ambiguous or missing selector returns `insufficient_evidence`; the cause is in
  the private `result.json`, not in the redacted summary. Fix the selector (for
  example, target the single group container) instead of loosening the check.
- **A container can be visible while empty.** For charts, lists and other
  asynchronous content, assert the rendered text/value/state (or wait for the
  element that appears), not only the wrapper's visibility.
- **Zero-based indexes shift on insertion.** `afterStep`, network `window` steps
  and walkthrough `step`/`startStep` are zero-based. Validation rejects
  out-of-range values but cannot tell that an index now points at a different
  action — renumber after inserting steps.
- **Read private evidence when a step fails.** `--summary` and `REPORT.md` are
  redacted by design; the exact error and observed values are in
  `after-<run>/result.json` and `proof.json`. See the
  [schema cheat sheet](schema-cheatsheet.md#debug-a-failed-run-private-evidence)
  for the short `jq` recipe; do not publish private evidence.

## Optional presentation

Verification is complete without recording. If separately authorized, add an authored `walkthrough` with `startStep` and current `after` beats, then call `demonstrate` or MCP `praman_demonstrate`. Acceptance stories omit `before` and `code`; they explain purpose, current requirements, visible results and limits—not an invented failure/fix. Narration and matching fresh replays are still mandatory. See [video guidelines](video-guidelines.md).

For an actual historical repair, migrate the declaration to `mode: "repair"`, provide genuine before/current targets, `baselineKind: "historical"` and a named `regressionCheck`. For an optional baseline or manufactured check-validation fixture, use `mode: "comparison"`, an explicit `baselineKind` (`historical`, `synthetic` or `unattested`) and no `regressionCheck`. Comparison passing means complete baseline evidence plus passing current requirements, not that the baseline failed or a historical defect was repaired.

## Evidence limits

URLs and declaration hashes identify declared targets/inputs, not deployed source builds. Optional source context is not signed provenance. Browser/interpreter/harness dependency attestation is still a separate roadmap item. This recipe does not establish cross-browser, native desktop, complete security/accessibility, autonomous test discovery or whole-application correctness.

Local exercised evidence: [consumer smoke results](ARCHIVE.md) (receipt archived externally). Saved URLs are historical observations, not a guarantee that a server remains live.

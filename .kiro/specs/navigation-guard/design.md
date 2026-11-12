# Design: navigation guard without false failures

## Trigger (measured, private `trigger.md`)

Chromium 156.0.8078.4, Playwright 1.64.1. Any registered Playwright route (even a glob
that matches nothing, `page.route` or `context.route`, `continue` or `fallback`) makes
Playwright send `Network.setCacheDisabled(true)`. With the HTTP cache off, Chromium
aborts a CSS cross-document view transition on a page that has a subresource that is not
render-blocking (image, SVG sprite, module script), and raises `InvalidStateError ...
ViewTransition opt-in disabled` in the page. Miniflux: 5/5 with any route, 5/5 with only
`Network.setCacheDisabled(true)`, 0/5 without routing, 0/5 with raw `Fetch.enable` and the
cache on. Fixture: 5/5 with a route, 0/5 with Fetch interception and the cache on.

## Decision

New module `src/eval/navigationGuard.ts`, used by `executeScenario` (so every user of a
many-users run gets it):

- `guardNavigation(browser, origin)` opens a browser-level CDP session right after
  launch, before any page exists, tracks page targets (`Target.setDiscoverTargets`; a
  page's main-frame id is its target id), and enables `Fetch` for `Document` requests at
  the request stage only. A paused request whose frame is a page's main frame and whose
  origin differs is failed with `errorReason: 'Failed'` (recorded `net::ERR_FAILED`, as
  `route.abort()` was) and listed in `stopped`; every other one is continued.
- `attach(page)` marks the scenario page and sets `Network.setBypassServiceWorker(true)`
  on it, as Playwright routing did.
- `executeScenario` checks `stopped` after the first load, after each step's action,
  after the final checks and after recording; a stopped navigation throws
  `leftOriginMessage(...)` ("Navigation left the app origin: PRAMAN stopped ..."), and the
  run's catch prefers that message over a later timeout. `classifyError` already maps
  "navigation ... left the app origin" to `navigation_failed`; no classifier change.

## Rejected options

| Option | Why rejected |
|---|---|
| A narrower Playwright route (URL predicate or glob for other origins only) | Still 5/5 on Miniflux: any route turns the cache off |
| `context.route`, `route.fallback()` | Same, 5/5 |
| Page-level CDP Fetch (first version) | Fixes the transition, but a new tab's first request is sent before a page session can attach (the other server answered), and page routes never saw redirect hops |
| Keep today's reporting (stopped link ends `failed`/timeout) | Blames the app for what PRAMAN did; owner chose the correct behavior |
| Detect after the navigation started (no interception) | Lets a GET reach the other site; not needed, since stopping before send works |
| Filter the page error, or inject CSS to turn transitions off | Forbidden: hides symptoms and changes the app |

## Effects and limits

- The browser HTTP cache is on, as in a normal browser. Each run still launches a new
  browser and context, so nothing is cached across runs. The app's server can see fewer
  requests for cacheable files. Recorded rows were equal to the old guard in a pinned
  fixture and on Shiori's network-check scenario; on Kan 3 of 258 rows (`__ENV.js`)
  showed `304` instead of `200` (a revalidated file), with the same verdicts and observed
  counts for every network check.
- A start URL that redirects to another origin is now stopped (Kan's `/` redirects from
  `127.0.0.1` to `localhost`; its private integration now starts at `/login`).
- Chromium only. Workers' own requests are not documents and are not guarded (as before).

# Requirements: navigation guard without false failures (plan step 4c)

Spec type: bugfix. Source: step 4c of the Hue-style environment plan in `docs/ROADMAP.md`
(added 2026-11-12; found on Miniflux v2.3.5 in plan step 0).

## Observed gap (2026-11-12, current `main` `04cc125`, before any change)

- Miniflux v2.3.5 (`faecfa2f`, clean clone), managed `environment verify` of a scenario
  that signs in and follows two in-app links: `failed`, `pageErrors` observed 2 in both
  runs (`InvalidStateError: Transition was aborted because of invalid state.
  ViewTransition opt-in disabled`). The app is not at fault: without PRAMAN's routing the
  error never appears (private `.praman/real-apps/miniflux/navigation-guard/gap-before.json`).
- Control on Miniflux: a same-tab link to another origin was stopped (`net::ERR_FAILED`,
  no response) but the run did not report `navigation_failed`.
- Fixture (old code): a stopped cross-origin link ended as `failed` (the next check saw
  Chromium's error page) or `locator_timeout`; a same-origin URL that redirects to another
  origin, and a link that opens a new tab, **reached** the other server.

## Owner decision (2026-11-12)

"Do the correct fix": a stopped navigation ends the run as not proven with
`navigation_failed` (the verdict of such runs changes from `failed` to
`insufficient_evidence`), and redirect hops and new tabs are stopped too.

## Requirement 1: no page error caused by PRAMAN

1.1 The browser run SHALL NOT disable Chromium's HTTP cache or otherwise change how an
app's pages load, so CSS cross-document view transitions run as in a normal browser.
1.2 No page error SHALL be filtered, renamed or ignored by text; no CSS or script SHALL be
injected into the app. A real app error SHALL still fail the run (`pageErrors`) or stop it
("Unasserted app runtime errors").

## Requirement 2: the guard

2.1 Every top-level document request to an origin other than the declared app origin (the
page, a new tab or window, a redirect hop, a form post, a script navigation, an iframe that
navigates the top) SHALL be failed before the request is sent, for every user's browser.
2.2 The run SHALL then end as `insufficient_evidence` with an error that `classifyError`
names `navigation_failed`; a later locator timeout on the error page SHALL NOT replace it.
2.3 Iframe documents and subresources from other origins SHALL continue unchanged.

## Requirement 3: no other change

3.1 Schemas, declaration hashes, exit codes, verdict logic in `assessProof`, and the
`proof.json` / `feedback.json` shapes SHALL NOT change.
3.2 The network rows that `network` checks read (method, resource type, URL, status,
failure) SHALL stay the same for the same page traffic; a known difference (a revalidated
file can show `304`) SHALL be written down.
3.3 No new dependency; no app name, selector or route in core, tests or schemas.

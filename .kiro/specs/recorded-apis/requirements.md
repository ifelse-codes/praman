# Requirements: Recorded outside APIs (plan step 4)

Spec type: feature (requirements-first). Source: step 4 of the Hue-style environment
plan in `docs/ROADMAP.md` (2026-11-10).

## Observed gap (2026-11-11, before any change)

See "Gap record" in `tasks.md`. In short: an application's own outside HTTP calls (Shiori
downloading a saved page, Kan's server fetching a list from formbricks.com) always reach
the real internet during a managed `verify`. PRAMAN neither sees them nor can replay them:
with the outside network cut, the same scenarios fail or stop, and a declaration asking for
recorded calls is rejected by the schema.

## Requirement 1: an owned recorder and replay

**User story:** As a coding agent, I want my application's outside HTTP calls to go through
a recorder once and a replay later, so later runs do not depend on, or reach, the real
outside service.

1.1 A Docker declaration MAY declare `outsideCalls` (`{ minPerRun? }`). Then PRAMAN SHALL
run one owned Hoverfly container per environment, with its proxy and admin ports
published on `127.0.0.1` only, behind a per-environment password.
1.2 Without `--recording`, the container SHALL record (Hoverfly capture mode: calls reach
the real service and are stored). With `create --recording <id>`, it SHALL replay
(simulate mode) a saved recording.
1.3 HTTPS calls SHALL be read with a CA certificate generated for this environment (never
Hoverfly's built-in default CA). `state.outside` SHALL give the integration `proxyUrl`
(with the password) and `caCert` (a file path). PRAMAN SHALL NOT change the application:
the integration points it at the proxy through the application's own configuration.
1.4 Before the integration starts, the proxy SHALL be observed: it refuses a call without
the password (HTTP 407), and in replay mode an unrecorded call with the password is
refused by the replay. Otherwise `create` is `insufficient_evidence`.
1.5 In replay mode the container SHALL run on an owned network without outbound address
translation, so the replay itself cannot reach the internet.
1.6 The container SHALL keep running across `reset` and world restores (the outside world
is not part of the application's data); `destroy` removes it and its network.
1.7 Declarations without `outsideCalls` SHALL behave exactly as before. Kind environments
SHALL reject `outsideCalls`.

## Requirement 2: saved recordings

2.1 `environment recording-save <id>` (CLI) and `praman_environment` with
`action: "recording-save"` (MCP) SHALL store the recorder's calls as a hashed recording
under `<base>/recordings/<recordingId>/` (`simulation.json`, `manifest.json`). It SHALL
refuse an environment that is not recording or has recorded nothing.
2.2 The recording id SHALL be a hash of the manifest (size and SHA-256 of the simulation,
number of calls, Hoverfly image).
2.3 `create --recording` SHALL re-hash the recording before any container starts; an
altered or missing recording SHALL give `insufficient_evidence` and nothing starts.
2.4 After loading, the replay SHALL hold exactly the recording's calls.

## Requirement 3: every run is checked

3.1 In a managed `environment verify`, PRAMAN SHALL clear the recorder's journal before
every run (each repeat and any baseline run) and read it after the run.
3.2 A call the replay refused (not in the recording), or an HTTPS call whose TLS the
application rejected (it does not trust the environment's CA), SHALL make that run
`insufficient_evidence`, never a pass. In record mode, a rejected TLS call SHALL do the same.
3.3 A run with fewer served calls than `minPerRun` (default 1) SHALL be
`insufficient_evidence`: the application may not be pointed at the recorder.
3.4 A journal that cannot be read, or that may have dropped entries, SHALL be
`insufficient_evidence`.
3.5 Each run SHALL record its calls privately (`outside-calls.json` in the run folder, with
addresses); results, feedback and MCP output SHALL carry only the mode, the recording id
and counts. The result SHALL end with a one-line `outsideSummary`.
3.6 `demonstrate` SHALL be refused for an environment with `outsideCalls`.
3.7 Scenarios and their hashes SHALL NOT change; `outsideCalls` is environment-level.

## Requirement 4: real proof

4.1 Shiori replays a recorded real page download (`http://example.com/`) with no outside
network for the replay; an unrecorded call is refused and the run is
`insufficient_evidence`.
4.2 A second real app (Kan: its server's HTTPS call to formbricks.com) records and
replays the same way, for the cross-app claim.
4.3 The same through `praman_environment` in a headless Kiro session.

## Non-goals

Browser-side recording (Playwright HAR): no real-app scenario in this plan has a
browser-side outside call. Changing recorded responses, matching on headers, stateful
sequences, latency replay, non-HTTP protocols, kind environments, calls that bypass the
application's proxy settings, and HTTPS for clients that cannot trust an added CA.

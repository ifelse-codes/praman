# Requirements: Real network faults (plan step 2)

Spec type: feature (requirements-first). Source: step 2 of the Hue-style environment
plan in `docs/ROADMAP.md` (2026-11-10).

## Observed gap (2026-11-10, before any change)

See "Gap record" in `tasks.md`. In short: the only fault a managed Docker environment can
apply is `environment fault <id>`, which stops the whole `faultService` container. A slow,
hanging or connection-dropping dependency cannot be produced: a declaration that names
such a fault is rejected by the schema, and a scenario cannot apply a fault for some of
its steps only.

## Requirement 1: declare a proxied dependency

**User story:** As a coding agent, I want the application to reach a declared dependency
through a fault proxy, so PRAMAN can change how that connection behaves.

1.1 A Docker service MAY declare `proxy`. Then PRAMAN SHALL run one owned Toxiproxy
container per environment, on an owned Docker network, that forwards a published host
port to the service.
1.2 For a proxied service, `state.services[name].port` SHALL be the proxy's host port (the
port the application uses) and `directPort` the service's own published port. Readiness
keeps using the direct port. Integrations need no change.
1.3 A proxied service SHALL have a probe that goes through the proxy: by default the HTTP
readiness path through the proxy port; for command readiness, a declared `proxy.probe`
command run inside the service container with `{proxyHost}` and `{proxyPort}` replaced by
the proxy's address. A command probe without `{proxyPort}` SHALL be rejected.
1.4 After the proxy is configured, the probe through the proxy SHALL succeed before the
integration starts; otherwise `create` is `insufficient_evidence`.
1.5 Core SHALL stay protocol-free: it never learns the database or storage type.
1.6 Declarations without `proxy` SHALL behave exactly as before (no network, no proxy).

## Requirement 2: named faults

2.1 A Docker declaration MAY declare `faults`, a map of names to one of: `delay`
(`delayMs`), `timeout` (`timeoutMs`), `drop` (connection reset) or `down` (proxy
disabled), each on a proxied `service`. `faultService` becomes optional when `faults` is
not empty.
2.2 Applying a fault SHALL first probe the healthy dependency, then apply the fault, read
it back from the proxy, and probe again. The effect SHALL be observed: `delay` needs the
probe to succeed at least 0.8 × `delayMs` slower than the healthy probe; `timeout`, `drop`
and `down` need the probe to fail. IF the effect is not observed, THEN the result SHALL be
`insufficient_evidence`.
2.3 Removing a fault SHALL be observed too: the probe succeeds again (for `delay`, less
than 0.8 × `delayMs` slower than healthy). Otherwise `insufficient_evidence`.
2.4 `environment fault <id> <name>` and `environment recover <id>` (CLI) and
`praman_environment` with `fault` (MCP) SHALL apply and remove a named fault. Without a
name, `fault` keeps its old meaning (stop `faultService`).
2.5 Removed during implementation: Toxiproxy updates its byte counters only when a
connection closes, so they cannot show the traffic of pooled connections during a window.
Recorded as a limit instead.

## Requirement 3: faults at step ids

3.1 A scenario MAY declare `faults: [{ name, fromStep, throughStep }]`, with step indexes
or step ids. Windows are ordered, inside the scenario and do not overlap.
3.2 In a managed `environment verify`, the fault SHALL be applied before step `fromStep`
and removed after the checks of step `throughStep`, in every run (each repeat and any
baseline run). A fault still active when a run ends SHALL be removed.
3.3 IF a fault's effect or removal is not observed, THEN that run SHALL be
`insufficient_evidence`. (A requirement that the application sent bytes during the window
was removed; see 2.5.)
3.4 Each run SHALL record its fault evidence (applied, effect, traffic, removal) in
`result.json` and the proof.
3.5 IF a scenario with fault windows runs anywhere else (`scenario-verify`, MCP
`praman_scenario_verify`, `demonstrate`), OR names a fault the environment does not
declare, THEN it SHALL be `insufficient_evidence` and never pass.
3.6 Scenarios without `faults` SHALL keep their meaning and hash.

## Requirement 4: ownership and cleanup

4.1 The proxy container and network SHALL carry the environment's ownership label;
`destroy` and `reset` remove them and refuse to touch unlabelled ones.
4.2 The proxy API SHALL listen on `127.0.0.1` only and require a per-environment token,
which is kept out of results.

## Requirement 5: real proof

5.1 On Kan and Shiori: each fault kind applied to live traffic and observed; checks
authored from the app's real behavior under the fault; fault removed and recovery
observed.
5.2 The same through `praman_environment` in a headless Kiro session.

## Non-goals

Faults inside kind clusters; random or partial (toxicity) faults; bandwidth, slicer and
packet-loss toxics; several faults active at once; faults on traffic between two
containers; `demonstrate` with fault windows; the application's own outside (internet)
calls (plan step 4).

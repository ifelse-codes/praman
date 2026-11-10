# Design: Real network faults

- Reuse: Toxiproxy (Shopify, MIT), image `ghcr.io/shopify/toxiproxy:2.13.0`, run as a
  separate owned container. PRAMAN talks to its HTTP API only.
- Schema (`src/environments/schema.ts`, mirrored in `types.ts`):
  `services.<name>.proxy?: { probe?: string[] }`; `faults?: Record<name, { service, kind:
  'delay', delayMs } | { service, kind: 'timeout', timeoutMs } | { service, kind: 'drop' }
  | { service, kind: 'down' }>`. Refinements: a fault names a proxied service; a proxied
  service with command readiness declares `proxy.probe` containing `{proxyPort}`;
  `faultService` is required only when `faults` is empty.
- State: `network?: { name, owned }`, `proxy?: { name, apiPort, token, listen:
  Record<service, number> }`, `services[name].directPort?`, `activeFault?: string`.
- Provisioning (`docker.ts`): only when a service declares `proxy`: `docker network create
  --label io.praman.owner=<token> praman-<id>`; every service joins it; after the services
  are ready, `docker run` the proxy (`praman-<id>--toxiproxy`, a name no service can have)
  with `TOXIPROXY_AUTH_TOKEN`, the API and one listen port per proxied service published on
  `127.0.0.1`, and `-proxy-metrics`. Wait for `/version`, create one proxy per service
  (`upstream praman-<id>-<service>:<port>`, resolved by Docker DNS, so restarts do not
  change it), swap `port`/`directPort`, then probe through the proxy.
- New module `src/environments/proxy.ts` (app-independent): API client, probe through the
  proxy (HTTP from the host, or `docker exec` in the service container with placeholders),
  `applyFault`, `removeFault`; the manager's `clear` removes a fault left active.
  (Traffic counters from `/metrics` were planned and dropped: Toxiproxy updates them only
  when a connection closes.) Fault mapping: delay = `latency` toxic (downstream, jitter 0); timeout =
  `timeout` toxic; drop = `reset_peer` toxic (timeout 0); down = `enabled: false`.
- Scenario (`src/case/change.ts`): optional `faults` windows; step ids resolved in
  `resolveStepRefs`; order/overlap checked in the refinement.
- Engine (`src/eval/change.ts`): `ProofHooks.faults?: { apply(name), remove(name), clear() }`.
  `proveChange` passes `beforeStep`/`afterStep` to `executeScenario` that call them at the
  window bounds, collects each window's evidence into `ScenarioRun.faults`, and always
  calls `clear()` after a run (a throw makes that run `insufficient_evidence`). Without the
  hook a scenario with windows is `insufficient_evidence` before any browser starts.
- Manager: `EnvironmentRequest.fault`; `fault`/`recover` with a name use `proxy.ts`;
  `create` refuses scenario windows that name undeclared faults; `verify` supplies the hook
  and adds `evidence.faultWindows` plus a last-field `faultSummary`; `destroy` removes the
  proxy and then the network after checking their labels. Output redacts the proxy token.
- CLI: `environment fault <id> [name]`. MCP: `praman_environment` gains `fault`.
- Tests: fake `docker` on `PATH` (network/proxy commands), a fake Toxiproxy API on a local
  HTTP server, and a real TCP probe target so effects are measured, not assumed.
- Limits: the probe measures the proxy path, not the application; there is no
  per-window traffic count; `down` closes the listener; one fault at a time.

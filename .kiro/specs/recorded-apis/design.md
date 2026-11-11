# Design: Recorded outside APIs

- Reuse: Hoverfly (SpectoLabs, Apache-2.0), image `spectolabs/hoverfly:v1.12.17`, run as a
  separate owned container. PRAMAN talks to its admin API (token from `/api/token-auth`)
  and reads its container log. Checked first on a throwaway container (2026-11-11):
  `-generate-ca-cert` makes a fresh CA inside the container and Hoverfly signs with it;
  `-auth` protects the admin API (401) and the proxy (407); simulate mode answers an
  unmatched call with HTTP 502 and a body starting `Hoverfly Error!`; identical captured
  calls collapse to one pair; an HTTPS client that rejects the CA leaves no journal entry,
  but with `-v` the log shows `Cannot handshake client <host>:443`; a container on a
  network with `enable_ip_masquerade=false` keeps its published ports and cannot reach
  the internet (spy mode timed out on `example.com` and `1.1.1.1`). An `--internal`
  network was rejected: published ports do not work there.
- Schema (`src/environments/schema.ts`, `types.ts`): `outsideCalls?: { minPerRun?: 0..1000 }`
  (Docker only). State: `outside?: { name, mode: 'record' | 'replay', proxyPort, adminPort,
  password, proxyUrl, caCert, network?, recording?, tlsRefusedSeen }`, `recording?: { id,
  directory }` (set by `create --recording`).
- New module `src/environments/outside.ts` (app-independent, HTTP only):
  `loadRecording`, `startOutside`, `destroyOutside`, `saveRecording`, `beginRun`, `endRun`.
  - Start: optional owned network `praman-<id>--outside` (replay only, masquerade off);
    `docker run -d --name praman-<id>--hoverfly --label io.praman.owner=<token> -p
    127.0.0.1:<proxy>:8500 -p 127.0.0.1:<admin>:8888 <image> -generate-ca-cert -auth
    -username praman -password <random> -v -journal-size 1000 [-capture]`; wait for the
    token; `docker cp :/cert.pem` to `<env>/outside-ca.pem` and check it is a CA; replay:
    `PUT /api/v2/simulation`, read back the pair count and mode; probes through the proxy
    (407 without the password; replay: a reserved `.invalid` address is refused); clear the
    journal.
  - Runs: `beginRun` clears the journal and counts TLS refusals in the log; `endRun` reads
    the whole journal (paged), classifies each entry (served, or refused when 502 with the
    `Hoverfly Error!` body), counts new TLS refusals, writes `outside-calls.json` privately
    in the run folder and returns `{ mode, recordingId?, served, refused, tlsRefused,
    minPerRun, ok, reason? }`.
  - Save: `GET /api/v2/simulation`, refuse 0 pairs, write `simulation.json` + `manifest.json`
    (`version, image, calls, bytes, sha256`) in a staging folder, id = first 12 hex of the
    SHA-256 of the canonical manifest, rename into `<base>/recordings/<id>/`.
- Docker provider: `provisionDocker` loads the recording before any container starts and
  starts the recorder last; it skips the start when `state.outside` already runs (reset).
  `destroyDocker(state, save, { keepOutside })` keeps it for `reset` and world restores.
- Engine (`src/eval/change.ts`): `ProofHooks.outside?: { begin(), end(directory) }`, called
  around every run in `proveChange`; the evidence goes to `ScenarioRun.outside`; a run with
  `ok: false` gets an error and `insufficient_evidence`; `assessProof` refuses any run whose
  `outside.ok` is false (also for many-users runs, whose own error is not read).
- Manager: `EnvironmentRequest.recording`, action `recording-save`, `demonstrate` refused
  with `outsideCalls`, `evidence.outsideCalls` per run and a last-field `outsideSummary`;
  the proxy password is redacted from every result.
- Integration contract (README): read `state.outside.proxyUrl` / `caCert` in `start`; set
  the application's own proxy and CA settings (for example Go: `HTTP_PROXY`,
  `HTTPS_PROXY`; Node: `NODE_USE_ENV_PROXY=1`, `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`).
- CLI: `environment create --recording <id>`, `environment recording-save <id>`. MCP:
  `praman_environment` gains `recording-save` and `recording`.
- Tests: fake `docker` on `PATH` that starts a fake Hoverfly (admin API and an HTTP forward
  proxy with record/replay, 407, 502 refusals and a TLS-refusal log line), a fixed test CA
  certificate, and a local app whose page shows what its server fetched through the proxy.
- Limits: HTTP(S) through the application's proxy settings only; a call that bypasses them
  is not seen (the `minPerRun` gate catches a full bypass, not a partial one); matching is
  Hoverfly's default (method, scheme, host, path, query, body; not headers); responses are
  replayed without their original timing; the recorder is one per environment.

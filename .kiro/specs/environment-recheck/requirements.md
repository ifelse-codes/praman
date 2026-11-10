# Requirements: environment re-check (plan step 0)

Spec type: bugfix (requirements-first). Source: step 0 of the Hue-style environment plan
in `docs/ROADMAP.md` (2026-11-10). The Docker `environment` route (create, verify, reset,
destroy) was frozen at the 2026-11-05 cleanup and had not been run end to end since.
kind stays frozen and is not claimed.

## Observed gap (2026-11-10, before any change)

Run on real Miniflux v2.3.5 (Postgres container, host binary built from the unmodified
checkout) and real Kan `927bf2fe` (Postgres and RustFS containers, a clean export of the
checkout's HEAD), both through `node dist/cli.js environment ...` on Colima profile
`praman-headlamp`:

- `create`, `workload`, `fault`, `recover`, `reset` and `destroy` worked (Miniflux).
- `verify` always returned `insufficient_evidence` with the reason "Managed preflight
  unavailable; no scenario execution was authorized." on both apps, and no browser ran.
  The real error, visible only in the private `operations.jsonl`, was
  "Proof output directory already contains a run; choose a fresh directory.": the
  manager wrote `scenario.json` and `declaration.json` into the run directory before
  calling the proof engine, which refuses a directory that already holds a run.
  `demonstrate` uses the same directory and refuses any non-empty directory.

## Requirement 1: managed verification runs

**User story:** As a coding agent, I want `environment verify` to run my declared
scenario against the managed instance, so a ready environment can give a real verdict.

1.1 WHEN an environment is ready, has no active fault and declares a scenario, THE
SYSTEM SHALL execute the scenario and return the proof engine's verdict.
1.2 THE SYSTEM SHALL keep the private replay copies (`declaration.json` and the
scenario it points at) in the run directory after the run.
1.3 IF preflight fails before the scenario runs, THEN THE SYSTEM SHALL keep returning
`insufficient_evidence` with the managed-preflight reason and the replay copies.
1.4 `environment demonstrate` SHALL no longer refuse its own run directory.

## Requirement 2: end-to-end re-check on two real apps

2.1 On Kan and on a second real app (Shiori, replacing Miniflux by owner decision on
2026-11-10): `create` gives a ready instance from the declared seed; a
declared scenario `passed`; a workload changes state and the same scenario then
`failed`; `reset` restores the seed and the scenario `passed` again; `destroy` leaves
no container with the instance's ownership label and no owned process.
2.2 The same route SHALL be run through the `praman_environment` MCP tool in a headless
Kiro session.

## Non-goals

No new environment features (volumes, networks, label sweeps, port templating); those
belong to later plan steps. kind, preview, demonstrate recording and campaigns stay
frozen. No app name, selector, route or credential enters core.

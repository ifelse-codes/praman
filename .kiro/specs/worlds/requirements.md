# Requirements: Worlds (plan step 1)

Spec type: feature (requirements-first). Source: step 1 of the Hue-style environment
plan in `docs/ROADMAP.md` (2026-11-10).

## Observed gap (2026-11-10, before any change)

See "Gap record" in `tasks.md`. In short: a scenario that changes data (adds a record)
passes on repeat 1 and fails on repeat 2 of the same `environment verify`, because all
repeats run against one instance and one database. `reset` restores only the integration's
own seed, and there is no way to keep a starting state, hash it, or start two instances
from the same state.

## Requirement 1: save a world

**User story:** As a coding agent, I want to save the data of a ready environment as a
named, hashed starting state, so later runs can start from exactly that state.

1.1 A Docker service MAY declare `dataPath`, an absolute path inside its container. PRAMAN
core copies that path as opaque files; it never learns the database or storage type.
1.2 `environment world-save <id>` SHALL stop each service that declares `dataPath`, copy
the path to a private archive, restart the service, wait for readiness, and write
`<base>/worlds/<worldId>/manifest.json` with each service's image, `dataPath`, archive
size and SHA-256. `worldId` is the first 12 hex characters of the SHA-256 of the manifest
body.
1.3 IF no service declares `dataPath`, or a service cannot be copied or restarted, THEN
the result SHALL be `insufficient_evidence` and no world is written.

## Requirement 2: start from a world

2.1 `environment create <declaration> --world <worldId>` SHALL restore each archive into
the new containers before they start, and the integration's `start` runs afterwards.
2.2 Before restoring, PRAMAN SHALL re-hash the manifest and every archive. IF any hash,
image or `dataPath` differs from the manifest, THEN the result SHALL be
`insufficient_evidence` and nothing starts.
2.3 After restoring and before starting, PRAMAN SHALL read the restored path back and
compare its hash with the world. A difference is `insufficient_evidence`.
2.4 Two environments created from the same world SHALL be independent: a change made in
one is absent in the other.
2.5 `reset` of an environment created from a world SHALL restore that world.

## Requirement 3: a fresh copy for every repeat

3.1 WHEN a managed `verify` or `demonstrate` runs on an environment created from a
world, THE SYSTEM SHALL restore the world before every repeat, so each repeat starts
from the world.
3.2 The run SHALL record, per repeat, the world id and the verified starting hash in the
run folder (`world-runs.json`) and in the result evidence.
3.3 IF a restore fails or the application address changes, THEN that repeat SHALL be
`insufficient_evidence`; it is never counted as a pass.
3.4 Environments without a world SHALL behave exactly as before.

## Requirement 4: real proof

4.1 On Kan and on Shiori: a data-changing scenario with two repeats `failed` before the
feature (repeat 2 saw repeat 1's data) and `passed` with a world; a change in copy A is
absent in copy B; each repeat's starting hash equals the world; an altered archive gives
`insufficient_evidence`.
4.2 The same flow through `praman_environment` in a headless Kiro session.

## Non-goals

Live (running) snapshots, incremental or deduplicated storage, network namespaces,
Kubernetes (kind) worlds, baseline (`beforeUrl`) isolation, world garbage collection,
encryption of archives (they are private files and may hold seeded secrets).

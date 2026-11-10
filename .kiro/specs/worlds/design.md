# Design: Worlds

- `services.<name>.dataPath` (schema, optional, absolute). Opaque to core.
- `src/environments/world.ts` (new, app-independent): `saveWorld`, `loadWorld`,
  `restoreWorld`, `readBack`. Archives are made with `docker cp <container>:<path> -`
  (tar stream, works on a stopped or created container) and restored with
  `docker cp - <container>:<parent>` before `docker start`. Streams go to and from files,
  never through a JS string. Hash = SHA-256 of the archive file.
- Provisioning: when a world is set on the state, a service with `dataPath` is made with
  `docker create`, restored, read back and hashed, then `docker start`. Other services
  keep `docker run`.
- State: `world?: { id, manifestSha256 }`. Persisted so `reset` restores the same world.
- Per-repeat copy: `proveChange` and `demonstrateChange` accept a `beforeRepeat(index)`
  hook (4th argument group, not part of the declaration). The manager supplies a hook that
  performs the reset path (integration `reset` with infrastructure restore), checks that
  the application URL is unchanged and records `world-runs.json`. A failed hook makes that
  repeat `insufficient_evidence`.
- CLI: `environment world-save <id>`, `environment create --world <id>`. MCP:
  `praman_environment` gains action `world-save` and `world` argument.
- Limits: a snapshot is taken with the service stopped (crash-consistent not needed);
  the application keeps running during `world-save` and must tolerate its dependency
  restarting; world archives hold seeded data and are private; baseline URLs are not
  isolated.

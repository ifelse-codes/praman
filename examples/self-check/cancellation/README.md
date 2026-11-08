# Self-check: Ctrl-C stops the declared command

PRAMAN checks its own fix for spec `verify-cancellation` in `repair` mode. The target is
PRAMAN itself, so this example has no application-specific code.

- `harness.mjs` starts `command-verify` on a declared command that sleeps, sends SIGINT
  (Ctrl-C) once the command runs, and prints `orphan: yes` or `orphan: no`.
- `before` runs the harness against a build of commit `643fbe0`, the parent of the fix.
  That baseline is caller-declared history, not signed provenance.
- `current` runs the harness against this checkout's `dist/cli.js`.
- The named regression `no-orphan` must fail on the baseline and pass in all 3 current
  repeats.

```sh
npm run build
sh examples/self-check/cancellation/prepare-baseline.sh
node dist/cli.js command-verify examples/self-check/cancellation/commands.json \
  -o .praman/self-check/run-$(date +%s) --summary
```

Expected: `Outcome: passed`, exit 0. Evidence stays private under ignored `.praman/`.
macOS and Linux only (process groups).

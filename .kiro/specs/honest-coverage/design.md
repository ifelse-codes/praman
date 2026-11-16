# Design: honest coverage

## Shared module `src/review/requirements.ts`

- `requirementsSchema`: up to 100 entries `{ id, text, checks }` (`id` letters, digits,
  `-`, `_`, `.`; `checks` up to 100 ids, may be empty). Optional and without a default,
  so a declaration without it parses and hashes exactly as before.
- `checkRequirementRefs(requirements, known, ctx)`: duplicate requirement ids and
  unknown check ids are schema issues with a field path.
- `assessRequirements(requirements, verdictsOf)`: per requirement, `untested` when it
  has no check, otherwise the combined verdict of its checks over every current run
  (any missing row is `insufficient_evidence`). Returns
  `{ declared, checked, requirements: [{ id, checks, status }] }`; the text stays in
  the declaration.
- `applyCoverage(verdict, reason, coverage)`: only `passed` changes, to
  `insufficient_evidence`, when a requirement is `untested`.
- `coverageLine(coverage)`: one line for the summary and reports.

The browser engine applies it after `assessProof`; the command engine after its own
verdict. Many-users invariants count as checks (ids must not collide with check ids).

## Check descriptions (R3)

`describeCommandCheck` and `describeBrowserCheck` return a fixed plain line built only
from the kind, source and operator (for example `stdout equals`, `element text equals`,
`no page runtime errors`). `safeFeedbackValue` stops withholding `checkId` and the `id`
of check and invariant rows; known secrets inside an id are still redacted by value.
`Diagnostic` gains `checkId`, printed as `check[0] (total)`.

## Repeat note (R4)

`inputsHash` = SHA-256 of `{ specHash, identity: [role, path, sha256] of the first current
run's identityBefore, target value hash, sourceHashes }`. After writing `proof.json`,
`findRepeat(outDir, inputsHash)` reads `proof.json` of at most 200 sibling folders
(regular files up to 64 MiB) and returns the newest one with the same hash. The result
carries `repeatOf` (an output path, kept by redaction) and `repeatNote`.

## Target identity (R5)

`target` = `{ executable, args, cwd, env, deadlineMs }` (deadline up to 60 s), resolved
like the command's `cwd` (declaration-relative; MCP reject mode refuses a relative
`scenario.target.cwd`). `readTarget` runs it with the inherited environment, keeps stdout
up to 64 KiB, trims it and records `{ status, sha256, value }` where `value` is kept only
when it is short plain text (letters, digits, `._:+@/-`, up to 128 characters).
`proof.target` = `{ status: 'identified' | 'unavailable' | 'changed' | 'not_declared',
value?, sha256?, readings }`. Unavailable or changed makes a would-pass run
`insufficient_evidence`. It reads the current version only; a baseline is not identified.

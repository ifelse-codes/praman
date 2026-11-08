---
inclusion: auto
name: praman-declarations
description: Authoring PRAMAN browser scenarios or command declarations (scenario.json, commands.json, praman-gate.json), choosing acceptance/repair/comparison mode, or reading PRAMAN verdicts
---

# Authoring PRAMAN declarations

- Every declaration needs an explicit `mode`. Use `acceptance` unless a historical
  failure is named; `repair` needs a historical `before` and a `regressionCheck`;
  `comparison` needs an explicit `baselineKind`.
- Expectations come from the requirement, never from the software's current output.
- Use a fresh output directory per run. Outcomes: `passed` (exit 0), `failed` (1),
  `insufficient_evidence` (2, "not proven"; never reported as passed).
- Command declarations are trusted local code with the user's authority, not a sandbox.

#[[file:docs/schema-cheatsheet.md]]

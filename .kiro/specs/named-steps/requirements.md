# Requirements: named steps (gap 3)

Spec type: feature (requirements-first). Source: the opencode/Lattice session of
2026-11-06: inserting 2 steps forced the agent to renumber 4 checkpoints by hand
(`afterStep` and network windows are zero-based step indexes).

## Requirement 1: Step names

**User story:** As a coding agent, I want to point checks at a step by name, so inserting a
step does not silently move my checks.

1.1 A step SHALL accept an optional `id` (non-empty, `[A-Za-z0-9_-]+`), unique within the
scenario.
1.2 `afterStep`, network `window.fromStep`/`throughStep`, walkthrough beat `step` and
`walkthrough.startStep` SHALL accept either a step index or a step `id`.
1.3 IF a referenced `id` does not exist, THEN THE SYSTEM SHALL reject the declaration before
execution with an error that names the field and the missing id.
1.4 THE SYSTEM SHALL resolve ids to indexes at load time; evidence, reports and diagnostics
SHALL show both the index and the id.
1.5 Scenarios that use only indexes SHALL keep the same meaning and `specHash`.
1.6 THE SYSTEM SHALL NOT renumber or rewrite indexes automatically.

## Non-goals

No automatic remapping of existing index references (there is no stable anchor to remap
from). Step ids are not used in private-safe output if the owner treats them as private;
see design.

# Design: named steps

- `stepRef = z.union([z.number().int().nonnegative(), z.string().regex(/^[A-Za-z0-9_-]+$/)])`
  replaces the plain index in the listed fields.
- A load-time pass in `src/case/change.ts` builds `id → index`, rejects duplicates and
  missing references, and rewrites refs to numbers in the parsed object used for execution.
  As built (2026-11-09): the pass is a zod `transform` between the strict object schema
  and the existing cross-field `superRefine`, so the existing range checks run on
  indexes and every caller still receives numbers. `specHash` covers the parsed
  declaration: step ids are kept on their steps, references are indexes. An index-only
  declaration hashes exactly as before; adding ids changes the hash; writing a reference
  as an id or as the index it resolves to gives the same hash. Parsing is idempotent.
  The MCP input schema (generated from the input side) accepts ids.
- Privacy: check IDs are withheld from safe output today. Step ids are declaration
  fields of the same kind, so safe outputs show the index only; private evidence keeps
  both. (Owner may choose to treat step ids as safe; default is private.)
- Docs: the cheat sheet recommends ids for any scenario longer than a few steps.

## Testing strategy

Validation: unknown id, duplicate id, mixed index/id. Execution: the same scenario with an
inserted step passes unchanged when it uses ids and fails validation (or checks the wrong
step) when it uses indexes, shown side by side. `specHash` stability for index-only
scenarios.

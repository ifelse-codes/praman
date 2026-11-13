# Requirements: freeze prep (plan step 4d)

Owner decision 2026-11-12: three small jobs before the Nov 19 freeze. No new features; the
video, npm and the Devpost form are not touched.

## R1. Returned output paths stay openable

- R1.1 A file path that PRAMAN made, or was given as its output location, is returned
  unchanged in CLI and MCP output even when a known private value occurs in it.
- R1.2 Every other string is redacted as before; a fill value, typed text, a known secret
  and a credential field are still withheld everywhere else.
- R1.3 When a known private value occurs in a returned path, the result carries one
  `pathNote` that does not contain the value.
- R1.4 A value in a path field that is not a plain absolute path (a URL, multi-line text,
  `key=value` credential text) is redacted as before.

## R2. The flaky network policy test

- R2.1 Find which check flipped in CI run 43219321324 and why.
- R2.2 If the cause is test timing, fix the test only (no product limit, verdict rule or
  guard change) and make a failure print the check index, its observed value and the
  network rows of its window.

## R3. Trust and privacy wording

- R3.1 README, first-use, TESTING, Devpost draft, blog and social post agree on: not a
  sandbox and inherited environment; private raw evidence; `REPORT.html` as a private local
  view; CLI/MCP redaction is not a sanitized export and returned paths are not redacted; no
  hosted execution, no npm package, no independent run yet; cross-origin navigation stopped
  as `navigation_failed`, including a start URL that redirects to another origin.

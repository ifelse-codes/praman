# Requirements: Many users and invariants (plan step 3)

Spec type: feature (requirements-first). Source: step 3 of the Hue-style environment
plan in `docs/ROADMAP.md` (2026-11-10).

## Observed gap (2026-11-11, before any change)

See "Gap record" in `tasks.md`. A browser scenario runs one user: `executeScenario`
makes one browser context per run and `proveChange` runs the repeats one after another.
Two users acting at the same time cannot be declared, and a rule such as "the list holds
the seed plus one entry per user" cannot be declared at all. On Kan and Shiori a
declaration with `users` is rejected by the schema (`Unrecognized key: "users"`).

## Requirement 1: declare many users

**User story:** As a coding agent, I want one scenario to run as N users at once against
one environment copy, so concurrency problems can be observed.

1.1 A scenario in `acceptance` mode MAY declare `users: { count }` with 2 to 10 users.
Each user SHALL get its own browser and context (own cookies and storage) and run the
whole scenario.
1.2 In strings of steps, checks and the observer steps, `{user}` SHALL be replaced by the
zero-based user index and `{user1}` by the one-based index. A scenario without `users`
SHALL keep its meaning and its hash.
1.3 `staggerMs` (0 to 30000, default 0) SHALL delay the start of user k by k times that
value, so a rate-limited sign-in is not hit by all users together.
1.4 `syncAtStep` (an index or a step id) SHALL make every user wait before that step
until all users have reached it or have already ended. A wait that lasts more than 60 s
SHALL make the waiting user `insufficient_evidence`.
1.5 `users` SHALL be refused together with `faults`, `walkthrough`, `diffPath`, a
`network` check, or any mode other than `acceptance`; unknown step ids SHALL be rejected
before anything runs.

## Requirement 2: invariants

2.1 `users.invariants` MAY list caller-declared rules. An invariant SHALL be one of the
existing check kinds (without `afterStep`; not `network`), except that a `count` may use
`equals: { perUser, plus? }`, which means `perUser * count + plus`.
2.2 Invariants SHALL be observed once, after every user has ended, by the first user's
page, which first runs the declared `users.after` steps (for example a reload).
`users.after` is required when invariants are declared and MAY NOT contain `upload`.
2.3 An invariant that cannot be observed (a user or the observer failed to run) SHALL be
`insufficient_evidence`, never `passed`.
2.4 Core SHALL NOT learn any application rule: invariants are declared selectors, JSON
paths and values only.

## Requirement 3: verdicts and evidence

3.1 Every user SHALL have its own verdict, checks, screenshots, and result file under
`after-<n>/user-<k>/`; the repeat's `result.json` SHALL list the users, the invariant
results, the per-user start and end times, and the **peak concurrency** (the largest number
of users running at the same moment) measured from those times.
3.2 A repeat SHALL be `passed` only if every user ended `passed` with complete evidence
and every invariant `passed`. A broken invariant or a failed user SHALL give `failed`; a
missing observation SHALL give `insufficient_evidence`. A repeat whose peak concurrency
is below 2 SHALL be `insufficient_evidence`.
3.3 The aggregate of a repeat SHALL keep the declared checks as one row each (verdict
merged over users, `observed` = the list of observed values in user order), so feedback,
diagnostics and the report keep working. `feedback.json` and `REPORT.md` SHALL list the
per-user verdicts and the invariants (kinds, ids and verdicts; no application text).
3.4 Output of managed `verify` SHALL end with a one-line `usersSummary`.
3.5 Identity SHALL be recorded and compared for every user run as for any run.

## Requirement 4: proof

4.1 Deterministic tests need no live app, Docker daemon or private files: a local HTTP
fixture with a visible shared counter and a deliberately broken variant (lost update).
4.2 The same feature SHALL be proven on Kan and Shiori through the CLI and through
`praman_environment` in a headless Kiro session; limits SHALL be written down.

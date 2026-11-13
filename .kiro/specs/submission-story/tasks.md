# Tasks: submission story

Target: weeks 3–4 (Nov 23 – Dec 2, 2026); submit by Nov 27, buffer to Dec 4 2:00 pm PT.

- [x] 1. Fix stale documents
  - [x] 1.1 README `dist/integrations` line; `kiro-crew/` names (or removal, owner decision)
    - 2026-11-09: no `dist/integrations` line remains; `kiro-crew/` was removed on 2026-11-08 (owner decision 4-B). TESTING.md Node floor corrected to the `package.json` range
  - [x] 1.2 STATUS: replace the quota-blocked statement with observed session evidence
    - No quota statement remains in STATUS; the rules digest's 2026-11-05 risk line is updated
  - [x] 1.3 Rewrite `.kiro/specs/praman-core` requirements in EARS form; correct its task list
  - _Requirements: 3.2_

- [x] 2. Rewrite `docs/kiro-usage.md` with the feature table and session IDs
  - Current state through 2026-11-09, spec-driven versus vibe table, feature table with session IDs; the 2026-11-05 history kept unchanged
  - _Requirements: 2.1–2.3_

- [x] 3. Update `docs/video-script.md` to the storyboard; remove reliance on the non-Kiro Headlamp clip
  - Repair story of spec `verify-cancellation` plus the finish-gate demo; every scene is a fresh take of recorded Kiro work
  - _Requirements: 1.2, 1.3, 1.5_

- [x] 3.1 Update the storyboard for plan steps 0–4d (2026-11-13)
  - New one-page report scene (`REPORT.html` of a failed many-users run on Shiori from a saved world; rule wrong on purpose, labeled), the old code (`643fbe0` lines 69–71) before the fix (lines 93–100), corrected take instructions, narration measured with a 150 words-per-minute timer: 386 words, about 2:49
  - Dry run of every take (agent part of 4.1/4.2, no recording): takes 1–7 work as written; results in `docs/video-script.md` and `docs/kiro-usage.md` (`sess_da6546e1…`, `sess_788cd3e1…`, `sess_2aa3f753…`)
  - Open owner decision: whether the `REPORT.html` frames (marked private, sample data only) may be public
  - _Requirements: 1.2, 1.3, 1.5_

- [ ] 4. Record (owner authorization required)
  - [ ] 4.1 Capture Kiro session footage for spec, MCP call and gate
  - [ ] 4.2 Capture terminal footage for the judge route and proof
  - [ ] 4.3 Edit to under 3:00; check against the video-guidelines comprehension checklist
  - _Requirements: 1.1–1.6_

- [ ] 5. Publish and submit (owner)
  - [ ] 5.1 Upload to YouTube (public); set `<DEMO_VIDEO_URL>` in `docs/devpost-draft.md`
  - [x] 5.2 Update Devpost copy (2026-11-09: Kiro section and verified list match the evidence); [ ] save the submission by Nov 27
  - [ ] 5.3 Optional bonus: blog and `#KiroweenHackathon26` social post (drafts updated 2026-11-09)
  - _Requirements: 3.1, 3.3, 3.4_

- [ ] 6. Final check: fresh public clone passes the judge route 12/12 the day of submission
  - Rehearsed 2026-11-09: fresh clone of public `main` `3c37ec3`, `npm ci`, build, `examples/first-use/run.mjs` → 12/12, exit 0
  - Rehearsed again 2026-11-13: fresh clone of public `main` `3c7a4e0`, `npm ci`, build, Chromium install, `examples/first-use/run.mjs` → 12/12, exit 0. Repeat on the day of submission

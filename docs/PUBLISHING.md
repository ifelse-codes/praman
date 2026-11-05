# Publishing checklist (public repository + submission)

Status (2026-11-05): **published.** Public repository
https://github.com/ifelse-codes/praman exists under the owner GitHub identity
(masked noreply email, single squashed commit); CI is green on Ubuntu and macOS
(run 42016072422); the static project page is live at
https://ifelse-codes.github.io/praman/. The remaining steps are the video and the
Devpost submission. Do not publish raw evidence or the external archive.

## 1. Decide Git author identity

Commits before `b0814cd` (the original October work) carry a personal email in the
author field. The release commits `b0814cd` and later use the neutral identity
`PRAMAN contributors <praman@users.noreply.github.com>`.

Choose one:

- **Recommended — publish a single squashed commit from the current tree**, keeping
  the original local history private:

  ```sh
  cd /path/to/praman
  git checkout --orphan release
  git add -A
  git -c user.name='PRAMAN contributors' \
      -c user.email='praman@users.noreply.github.com' \
      commit -m 'PRAMAN: evidence-driven verification toolkit for coding agents'
  git branch -M main
  # optional: keep the old branch locally as backup
  ```

- **Alternative** — push the existing history and accept that the earlier author
  email becomes public; or rewrite author emails with `git-filter-repo` before
  pushing.

## 2. Create and push the repository

1. Create a public repository with the MIT license (the LICENSE file is complete).
2. Confirm `.kiro/` is tracked and **not** ignored (the current .gitignore does not
   ignore it).
3. Push `main`.
4. Verify from a logged-out browser that the repository is public and the README
   renders.

## 3. Run CI and record the result

The workflow runs on push and pull request: Ubuntu + macOS, Node 22, typecheck,
test-typecheck, build, Chromium, full suite (two workers). Do not claim a remote CI
result until the run is green; local evidence is a single-worker full-suite pass
(190 tests / 28 files).

## 4. Rebuild and record the release candidate

```sh
python3 scripts/source-release.py /tmp/praman-source-final.tar.gz
shasum -a 256 /tmp/praman-source-final.tar.gz
tar -tzf /tmp/praman-source-final.tar.gz | wc -l
```

If you want to record a per-build identity, note the SHA-256 and member count in a
private release note; `release-identity.json` is procedural and excluded from the
candidate so no stale hash is published. Re-scan the extracted candidate for personal
data before sharing it.

## 5. Submission artifacts

1. Record and upload the 3-minute video using [the script](video-script.md); the
   official requirement is a public YouTube link on the submission form.
2. Replace the remaining `<DEMO_VIDEO_URL>` in [the Devpost draft](devpost-draft.md).
3. Include the Kiro usage account ([kiro-usage.md](kiro-usage.md)).
4. Save the Devpost form and keep a screenshot; target submission by Nov 26–27.
5. Confirm the submission against the captured official rules
   ([kiroween-rules.md](kiroween-rules.md)): public repo + visible MIT license,
   `/.kiro` at root (not ignored), text description, <=3 min public YouTube video,
   Kiro usage write-up, category Frankenstein, and **judge access** (website, functioning
   demo or test build). PRAMAN uses the public repository as the test build with
   [TESTING.md](../TESTING.md) and Codespaces; verify that route from a logged-out browser.
6. Optional: enable GitHub Pages for the static project page in `site/` after the
   repository exists (never host PRAMAN execution).
7. Verify all links from a logged-out browser.

## Publishing to npm (optional, after submission)

Publishing is **not** part of the Kiroween submission and is blocked by
`private: true`. If the product continues:

1. Decide the package scope/name (the bare name `praman` is unregistered today).
2. Remove `private: true`; keep the `files: ["dist"]` allowlist so only the compiled
   CLI/MCP ships with README and LICENSE.
3. `npm pack --dry-run` and inspect the file list; run the full suite first.
4. Publish with provenance and 2FA: `npm publish --provenance --access public`.
5. Do not publish raw evidence, private configuration or the external archive.

## Archive retention (owner decision)

The external ~203 MB archive holds the only copies of the accepted movies and raw
historical evidence. Keep it until the submission is final. It contains private paths,
session data and credentials, so it must never be published. After the submission:
either retain it privately for auditability or delete it; if deleted, confirm the
submission video and any public claims no longer depend on it.

## Never

- Host public PRAMAN execution (trusted commands, inherited environment, no sandbox).
- Publish raw evidence, the private archive, recordings or captured credentials.
- Claim an independent-machine or remote-CI result that has not been observed.

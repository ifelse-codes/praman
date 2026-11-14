# Judge access and testing instructions

The official rules require access to a working project for judging and testing via a
link to a website, a functioning demo, or a **test build**. This repository is the test
build; everything below runs from the public source without private data or credentials.

## Fastest route: GitHub Codespaces (no local install)

1. Open https://github.com/ifelse-codes/praman
2. Click **Code → Codespaces → Create codespace on main** (the devcontainer installs
   dependencies, builds, and installs headless Chromium automatically).
3. In the terminal run:

   ```sh
   node examples/first-use/run.mjs /tmp/first-use
   ```

4. Expected result: exit code 0 and **12/12** outcomes — pass, mismatch and unavailable
   for both command and browser, over both the CLI and a real stdio MCP client.
   Evidence is written under `/tmp/first-use` (outside the repository).

## Local route (macOS/Linux, Node >= 22.13 within 22.x, or >= 24)

```sh
git clone https://github.com/ifelse-codes/praman
cd praman
npm ci
npm run build
npx playwright install chromium
node examples/first-use/run.mjs /tmp/first-use
```

Expected: exit 0 and the same 12/12 matrix (about 25 seconds after setup).

## What the judge will see

- Every browser run also writes an offline `REPORT.html` (private evidence, mode 0600;
  open it from the saved evidence folder in a browser): verdict, expected and observed
  values and screenshots on one page. It shows application text, so do not share it; fill
  values, typed text and credential fields are redacted.  In the first-use output, look for `REPORT.html` inside the browser cases' private evidence folder.

- The runner starts a loopback HTTP fixture and a real stdio MCP server.
- Command checks run real Node subprocesses; browser checks run real headless Chromium.
- Verdicts are printed per outcome with the expected CLI exit code (0/1/2) and MCP
  `isError` value; the corresponding private proof, feedback and screenshots are saved.

## Additional verification (optional)

```sh
npm run lint
npm run lint:tests
npm test -- --maxWorkers=2
```

Full suite: 376 tests / 43 files (2026-11-14). On the public CI runners (no ffmpeg/ffprobe) it reports
359 passed and 16 skipped (41 files passed, 1 skipped; CI run 43569525499 of `ce65659`, 2026-11-14):
the media/speech tests skip when ffmpeg/ffprobe are not installed; that is
environment-guarded, not a pass.

## Limits (honest scope)

- PRAMAN executes trusted commands and browser actions with the caller's authority, and
  child processes inherit the caller's environment; it is **not** a sandbox.
- Raw evidence (screenshots, `result.json`, `network.json`, `proof.json`) stays private
  under the output folder and may contain application data or secrets. CLI and MCP output
  redact known secrets and private declaration text, but they are not a sanitized export;
  returned file paths are not redacted.
- A browser navigation to another origin, including a start URL that redirects to another
  origin (for example a single sign-on page), is stopped and reported as `navigation_failed`.
- No published npm package; an independent person has not run this guide yet.
- Checks are authored; it verifies declared requirements, not whole-application
  correctness.
- No hosted execution endpoint is provided: the test build is the public source above.
  This is deliberate — exposing execution without a sandbox would be unsafe.

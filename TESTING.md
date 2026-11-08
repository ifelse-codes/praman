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

## Local route (macOS/Linux, Node >= 22.12)

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

Full suite: 198 tests / 29 files. On the public CI runners (no ffmpeg/ffprobe) it reports
182 passed and 16 skipped: two media/speech suites skip when ffmpeg/ffprobe are
not installed; that is environment-guarded, not a pass.

## Limits (honest scope)

- PRAMAN executes trusted commands and browser actions with the caller's authority; it
  is **not** a sandbox.
- Checks are authored; it verifies declared requirements, not whole-application
  correctness.
- No hosted execution endpoint is provided: the test build is the public source above.
  This is deliberate — exposing execution without a sandbox would be unsafe.

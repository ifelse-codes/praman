# Platform support and limits

## Observed (tested)

| Platform | Node | Status | Evidence |
| --- | --- | --- | --- |
| macOS 27.0.1 arm64 | 26.0.0 | **Tested** | Full suite (190 tests / 28 files), first-use 12/12, real Chromium and ffmpeg runs |
| Ubuntu (GitHub Actions) | 22 | **Configured, not yet run** | `.github/workflows/ci.yml`; requires a public repository |
| macOS (GitHub Actions) | 22 | **Configured, not yet run** | same workflow |
| Windows | any | **Untested / unsupported** | experimental manual workflow only |

## Runtime requirements

- Node.js **>= 22.5** (`node:sqlite` is used for durable campaigns; declared in
  package.json engines).
- Headless Chromium installed through Playwright (`npx playwright install chromium`).
- ffmpeg/ffprobe on PATH for movie/media assertions; core command and browser
  verification does not require them.
- No database server, no Docker/kind for the core verification route. Docker/kind are
  only needed for the optional managed-environment surface.

## Not supported

- Windows is not validated; the manual `Windows experimental build` workflow only
  checks install, lint and build, not the browser/command suites.
- Native desktop automation, hosted public execution, and browser engines other than
  the Playwright Chromium build are out of scope.

# Platform support and limits

## Observed (tested)

| Platform | Node | Status | Evidence |
| --- | --- | --- | --- |
| macOS 27.0.1 arm64 | 26.0.0 | **Tested** | Full suite (375 tests / 42 files, 2026-11-14), first-use 12/12, real Chromium and ffmpeg runs |
| Ubuntu (GitHub Actions) | 22 | **Tested in CI** | Run 43463147294 (`c75fa81`): 358 passed + 16 environment-guarded skips; also runs the first-use judge route |
| macOS (GitHub Actions) | 22 | **Tested in CI** | Run 43463147294 (`c75fa81`): 358 passed + 16 environment-guarded skips |
| Windows | any | **Untested / unsupported** | experimental manual workflow only |

## Runtime requirements

- Node.js **>= 22.13 within 22.x, or >= 24** (`node:sqlite` is unflagged from 22.13;
  the locked Vite/Rolldown toolchain requires `^20.19 || >=22.12` and Vitest excludes
  Node 23; declared in package.json engines).
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

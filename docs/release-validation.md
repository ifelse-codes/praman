# Session 3 source candidate and release gate

This is a source candidate, not an npm package or a general security certification.
The public repository is https://github.com/ifelse-codes/praman with CI green on
Ubuntu and macOS. Clean-directory testing here is not a vendor settings UI or a
hermetic toolchain validation; independent-human validation is still pending.

## Choose the current source

The scoped MVP is complete within the documented same-host boundary. Known
dependency/license blockers are resolved; publication and independent-machine/OS/user
validation have not occurred. Follow [first use](first-use.md) to use the current source.

### Current candidate (2026-11-05, post-cleanup)

The current candidate is rebuilt from the cleaned checkout with the deterministic
procedure below. [`release-identity.json`](../release-identity.json) documents the
procedure and is deliberately **not** included in the candidate, so packaging the same
tree reproduces the same archive bytes; no universal hash is asserted because
documentation can change between builds.

It contains source, tests, product docs, the first-use example, the CI workflow and
the deterministic packaging script; it excludes `.praman`, node_modules, dist,
evidence and target checkouts. A PII scan of the extracted candidate found no
personal email or host path in its text files. The file is a local build artifact —
not a download URL and not published.

CI is added as `.github/workflows/ci.yml` (Ubuntu + macOS, Node 22): lint,
test-typecheck, build, Chromium and the full suite (two workers). Locally the suite
passes **190 tests / 28 files** in a single-worker run, and the public repository's
CI is green on Ubuntu and macOS (run 42016072422; each runner: 174 passed, 16
environment-guarded skips). The static project page deploys from the same repository.

The earlier remediated candidate and its receipts were moved to the external archive
(see [the cleanup note](ARCHIVE.md)); its recorded SHA-256 was
`547af4f143f135640a48716000a1fa74e496ac9dc90cb9a41f8b61c3fcfb03af`.
That archived copy predates the 2026-11-05 cleanup. Do not substitute the historical
vulnerable Session 3 archives.

If you already have this candidate, verify its hash, then extract into an empty directory:

```sh
shasum -a 256 /absolute/path/to/praman-source-final.tar.gz
copy="$(mktemp -d "${TMPDIR:-/tmp}/praman-first-use.XXXXXX")"
tar -xzf /absolute/path/to/praman-source-final.tar.gz -C "$copy"
cd "$copy/praman"
```

Then follow the first-use guide's install/build/example steps. No public registry
installation or release URL is claimed. To include newer documentation in a future
candidate, use the creation procedure below and review the new artifact separately;
do not overwrite the preserved archive or reuse its hash for different bytes.

## Produce and inspect

From the current source root (Python 3 is a packaging-only prerequisite):

```sh
python3 scripts/source-release.py /absolute/fresh/praman-source.tar.gz
tar -tzf /absolute/fresh/praman-source.tar.gz
shasum -a 256 /absolute/fresh/praman-source.tar.gz
```

The script reads current filesystem bytes, including uncommitted intended changes.
It includes explicit root build/contract files, itself, all TypeScript source/tests,
Markdown documentation and the public first-use runner. It rejects symlinks and
unexpected source types; macOS `.DS_Store` and non-Markdown documentation attachments
are excluded. No `.git`, `.praman`, node_modules, dist, target checkout, historical
recordings, screenshots, audio or captures are included. Private historical evidence
links intentionally do not resolve in this distributable; they are not first-use inputs.
Other target examples and Kiro assets are not shipped or validated by this candidate.

Tar entries are sorted, with fixed mode/owner/time and gzip time/name. Identical selected
bytes produce identical archives with the same Python implementation. This is not signed
provenance, reproducible dependency installation across all platforms or a secret sanitizer.
Review the actual candidate contents before sharing. LICENSE now contains the complete
MIT grant, notice condition and warranty disclaimer, with copyright attributed to
PRAMAN contributors. Dependency and third-party notices remain governed by their own licenses.

## Fresh first use

```sh
copy="$(mktemp -d "${TMPDIR:-/tmp}/praman-release.XXXXXX")"
tar -xzf /absolute/fresh/praman-source.tar.gz -C "$copy"
home="$(mktemp -d "${TMPDIR:-/tmp}/praman-home.XXXXXX")"
runtime_tmp="$(mktemp -d "${TMPDIR:-/tmp}/praman-runtime.XXXXXX")"
cd "$copy/praman"
export HOME="$home" TMPDIR="$runtime_tmp"
export npm_config_cache="$home/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="$home/browsers"
unset NODE_PATH NODE_OPTIONS PRAMAN_VATRA
npm ci
npm run build
node dist/cli.js --help
npx playwright install chromium
node examples/first-use/run.mjs
# Follow the printed RUN path and inspect/rerun section 3 of first-use.md.
# Optional existing suite needs host ffmpeg/ffprobe:
npm test
npm audit --json
```

Network/registry/Chromium download access, writable local storage, installed Node/npm
and host system libraries are permitted prerequisites. Runtime temp must be outside
the ESM package. Tested runtime: macOS 27.0.1 arm64, Node 26.0.0/npm 11.12.1.
The runner uses the installed source entrypoint for compiled CLI and actual stdio MCP;
configure absolute Node/dist paths as in [first-use](first-use.md#4-configure-an-mcp-client).
Custom browser download paths must also reach the MCP child via its `env` setting.

## Dependency and license remediation

The Session 3 archive and its audit receipts remain historical and unchanged: that
lockfile reported ten affected packages, including two critical findings. Do not
distribute that old archive as the remediated candidate.

The current manifest/lockfile upgrades Zod to 4.6.7 or later and Vitest to the patched
4.1.12 line or later. Zod record schemas explicitly declare string keys while retaining
their existing values, strictness and validation gates. The legacy Autocannon/fast-check load and fuzz helpers and their overrides were
removed from the product on 2026-11-05; no load-testing dependency remains in the
lockfile.

The post-upgrade `npm audit --json` reports zero known vulnerabilities across production
and development dependencies. This is a registry advisory result, not proof that all
dependencies or application paths are secure. Use the shipped lockfile with `npm ci`;
do not suppress advisories or use blind forced fixes.

LICENSE now contains the complete MIT license and `package.json` declares `MIT`.
No exclusive ownership of third-party contributions or dependencies is asserted.
Keep all applicable notices when redistributing.

Independent-machine/OS/human acceptance remains unavailable, not silently green.
No next feature session or publication starts automatically. Latest verification and
candidate identity are recorded in [current project status](STATUS.md).

Historical Session 3 and remediation receipts were archived outside this repository
on 2026-11-05; they are not in this checkout. See [the cleanup note](ARCHIVE.md) and
[current project status](STATUS.md).

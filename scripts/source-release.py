#!/usr/bin/env python3
"""Create a deterministic, unpublished source candidate from current filesystem bytes."""
import gzip
import io
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
FILES = (
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.test.json",
    "vitest.config.ts",
    "README.md",
    "TESTING.md",
    "CHANGELOG.md",
    "AGENTS.md",
    "LICENSE",
    ".gitignore",
    "scripts/source-release.py",
)
TREES = ("src", "tests", "docs", "examples/first-use", ".github", "site", ".devcontainer")
ALLOWED = {".ts", ".md", ".mjs", ".yml", ".yaml", ".html", ".json"}


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/source-release.py /absolute/fresh-candidate.tar.gz")
    output = Path(sys.argv[1]).resolve()
    paths = [ROOT / name for name in FILES]
    for tree in TREES:
        for path in sorted((ROOT / tree).rglob("*")):
            if path.is_symlink():
                raise SystemExit(f"Refusing symlink: {path}")
            if path.is_file():
                if path.name == ".DS_Store":
                    continue
                if tree == "docs" and path.suffix != ".md":
                    continue
                if path.suffix not in ALLOWED:
                    raise SystemExit(f"Review unexpected source file before packaging: {path}")
                paths.append(path)
    with output.open("xb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for path in sorted(paths):
                    if path.is_symlink() or not path.is_file():
                        raise SystemExit(f"Refusing non-regular input: {path}")
                    data = path.read_bytes()
                    entry = tarfile.TarInfo("praman/" + path.relative_to(ROOT).as_posix())
                    entry.size = len(data)
                    entry.mode = 0o644
                    entry.mtime = 0
                    archive.addfile(entry, io.BytesIO(data))
    print(output)


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# Bump version files, commit, tag. Pushing the tag is what publishes (CI).
# Usage:
#   scripts/cut-release.sh 0.2.0           # local commit + tag v0.2.0
#   scripts/cut-release.sh 0.2.0 --push    # also push commit + tag → GitHub Release
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ver="${1:-}"
if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: scripts/cut-release.sh X.Y.Z [--push]" >&2
  echo "semver only (v0.2.0). Do not use v2 — that is how tag and download drifted." >&2
  exit 1
fi
shift || true
push=0
if [[ "${1:-}" == "--push" ]]; then
  push=1
fi

tag="v${ver}"
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "tag $tag already exists" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree dirty — commit or stash first" >&2
  git status -sb >&2
  exit 1
fi

python3 - "$ver" <<'PY'
import json, pathlib, re, sys
ver = sys.argv[1]
root = pathlib.Path(".")

pkg = json.loads((root / "package.json").read_text())
pkg["version"] = ver
(root / "package.json").write_text(json.dumps(pkg, indent=2) + "\n")

tauri = json.loads((root / "src-tauri/tauri.conf.json").read_text())
tauri["version"] = ver
(root / "src-tauri/tauri.conf.json").write_text(json.dumps(tauri, indent=2) + "\n")

cargo = (root / "src-tauri/Cargo.toml").read_text()
cargo2, n = re.subn(r'(?m)^version = "[^"]+"', f'version = "{ver}"', cargo, count=1)
if n != 1:
    sys.exit("could not patch src-tauri/Cargo.toml version")
(root / "src-tauri/Cargo.toml").write_text(cargo2)

lock = root / "src-tauri/Cargo.lock"
if lock.is_file():
    text = lock.read_text()
    text2, n = re.subn(
        r'(name = "collab-finder"\nversion = ")[^"]+(")',
        rf"\g<1>{ver}\2",
        text,
        count=1,
    )
    if n != 1:
        sys.exit("could not patch src-tauri/Cargo.lock collab-finder version")
    lock.write_text(text2)
print(f"version files -> {ver}")
PY

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release ${ver}"
git tag -a "$tag" -m "kanithanj.ai ${tag}"

echo "tagged $tag at $(git rev-parse --short HEAD)"
if [[ "$push" -eq 1 ]]; then
  git push origin HEAD
  git push origin "$tag"
  echo "pushed $tag — watch Actions → Release"
else
  echo "next: git push origin HEAD && git push origin $tag"
  echo "CI will attach kanithanj.ai-linux-x86_64 to $tag"
fi

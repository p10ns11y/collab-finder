#!/usr/bin/env python3
"""Scan tracked files for phone numbers, home paths, and private host markers.

Reports file and line (and the rule name) only. Never prints the matched
value, an email, or a phone number.

The only allowlisted path is listed in scripts/ci-privacy-allow.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME_ALLOW = {"user", "username", "ubuntu", "runner"}
TEXT_EXT = {
    ".md", ".mjs", ".js", ".cjs", ".ts", ".tsx", ".rs", ".json", ".jsonl",
    ".yml", ".yaml", ".sh", ".toml", ".txt", ".html", ".css", ".py", ".typ",
}
# Split so this file does not itself contain a live hostname. Same marker
# as scripts/ci-host-alias.mjs; that script remains the hostname gate.
PRIVATE_HOSTS = ["mza" + "pan"]
SKIP_HOST_FILES = {
    "scripts/ci-privacy-scan.py",
    "scripts/ci-host-alias.mjs",
    "scripts/scan-web-privacy.mjs",
}
PHONE_RE = re.compile(r"(?<![\w/.+-])\+\d{1,3}(?:[ -]?\d){7,}(?![\w/])")
FICTIONAL_PHONE_RE = re.compile(
    r"""
    \+99\b
    | \+1[- ]?555\b
    | \b555[- ]01\d{2}\b
    | \+46[ -]?70[ -]?000[ -]?00[ -]?00
    | \(099\)
    | \b099[-. ]
    """,
    re.VERBOSE,
)
HOME_RE = re.compile(r"/(?:home|Users)/([A-Za-z0-9._-]+)")
CGNAT_RE = re.compile(r"\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b")
# Used only so we never echo a match; not a failing rule in this scan.
EMAIL_RE = re.compile(r"[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def git_files(root: str) -> list[str]:
    listed = subprocess.run(
        ["git", "ls-files", "-z", "-c", "-o", "--exclude-standard"],
        cwd=root, capture_output=True, check=False,
    )
    if listed.returncode != 0:
        print(listed.stderr.decode() or "git ls-files failed", file=sys.stderr)
        sys.exit(listed.returncode or 1)
    return [p for p in listed.stdout.decode().split("\0") if p]


def load_allows(path: str) -> list[tuple[str, str]]:
    if not os.path.isfile(path):
        return []
    out = []
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "\t" not in line:
            raise SystemExit(f"ci-privacy-allow: need rule<TAB>path, got a bad line")
        rule, prefix = line.split("\t", 1)
        out.append((rule.strip(), prefix.strip()))
    return out


def allowed(rel: str, rule: str, allows: list[tuple[str, str]]) -> bool:
    rel = rel.replace(os.sep, "/")
    return any(
        r in ("*", rule) and (rel == prefix or rel.startswith(prefix.rstrip("/") + "/"))
        for r, prefix in allows
    )


def extract_text(path: str) -> str | None:
    if path.lower().endswith(".pdf"):
        r = subprocess.run(
            ["pdftotext", "-q", "-layout", path, "-"],
            capture_output=True, check=False,
        )
        if r.returncode != 0:
            return ""
        return r.stdout.decode("utf-8", "replace")
    try:
        data = open(path, "rb").read()
    except OSError:
        return None
    if b"\0" in data:
        return None
    return data.decode("utf-8", "replace")


def scan_text(rel: str, text: str, allows: list[tuple[str, str]]) -> list[str]:
    hits = []
    skip_host = rel.replace(os.sep, "/") in SKIP_HOST_FILES
    for i, line in enumerate(text.splitlines(), 1):
        lower = line.lower()
        if not skip_host:
            for host in PRIVATE_HOSTS:
                if host in lower and not allowed(rel, "private-host", allows):
                    hits.append(f"{rel}:{i}: private-host")
        for m in HOME_RE.finditer(line):
            if m.group(1) not in HOME_ALLOW and not allowed(rel, "home-path", allows):
                hits.append(f"{rel}:{i}: home-path")
        if CGNAT_RE.search(line) and not allowed(rel, "cgnat-ip", allows):
            hits.append(f"{rel}:{i}: cgnat-ip")
        if PHONE_RE.search(line) and not FICTIONAL_PHONE_RE.search(line) and not allowed(rel, "phone", allows):
            hits.append(f"{rel}:{i}: phone")
        # Email is detected so a reporter cannot accidentally print it; not a fail rule.
        EMAIL_RE.findall(line)
    return hits


def scan_file(root: str, rel: str, allows: list[tuple[str, str]]) -> list[str]:
    full = os.path.join(root, rel)
    if os.path.islink(full):
        return [f"{rel}: symlink"]
    ext = os.path.splitext(rel)[1].lower()
    if ext not in TEXT_EXT and ext != ".pdf" and not rel.endswith("Dockerfile"):
        return []
    if allowed(rel, "*", allows):
        return []
    text = extract_text(full)
    if text is None:
        return []
    return scan_text(rel, text, allows)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("paths", nargs="*")
    p.add_argument("--root", default=ROOT)
    p.add_argument("--all", action="store_true")
    p.add_argument("--allow", default=None)
    args = p.parse_args(argv)
    root = os.path.abspath(args.root)
    allow_path = args.allow or os.path.join(root, "scripts", "ci-privacy-allow")
    allows = load_allows(allow_path)
    files = git_files(root) if args.all else []
    for path in args.paths:
        full = path if os.path.isabs(path) else os.path.join(root, path)
        if os.path.isdir(full):
            for dirpath, _, names in os.walk(full):
                for name in names:
                    files.append(os.path.relpath(os.path.join(dirpath, name), root))
        else:
            files.append(os.path.relpath(full, root))
    seen = set()
    ordered = []
    for f in files:
        if f not in seen:
            seen.add(f)
            ordered.append(f)
    hits = []
    for rel in ordered:
        hits.extend(scan_file(root, rel, allows))
    for h in hits:
        print(h)
    print(f"files {len(ordered)} hits {len(hits)}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Fail if the Vercel preview is public, unless GO-LIVE.md holds a dated yes.

Checks, in order:
1. GO-LIVE.md at the repo root with a line `Yes YYYY-MM-DD` unlocks the gate.
   This script does not create that file.
2. Otherwise, deployment protection must be on, and no public (non-vercel.app)
   domain alias may exist.

Live checks use a fixture JSON, or a URL probe of the targets file. The script
never changes Vercel settings. Reports reasons only, never response bodies
or cookies.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YES_RE = re.compile(r"^Yes\s+(\d{4}-\d{2}-\d{2})\s*$")
DEFAULT_TARGETS = os.path.join(ROOT, "scripts", "ci-go-live-targets.json")


def load_targets(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not data.get("probe"):
        raise SystemExit("ci-go-live: targets file is missing probe URLs")
    data.setdefault("public_alias_probes", [])
    data.setdefault("allowed_suffixes", [".vercel.app"])
    data.setdefault("protection_redirect_hosts", ["vercel.com"])
    return data


def go_live_yes(path: str) -> str | None:
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = YES_RE.match(line.rstrip("\n"))
            if m:
                return m.group(1)
    return None


def is_allowed_alias(host: str, suffixes: list[str]) -> bool:
    host = (host or "").lower().rstrip(".")
    return any(host.endswith(s.lower()) for s in suffixes)


def protection_on(project: dict) -> bool:
    sso = project.get("ssoProtection") or {}
    pwd = project.get("passwordProtection") or {}
    if sso.get("enabled") and sso.get("deploymentType") in {"all", "preview", "prod_deployment_urls_and_all_previews"}:
        return True
    if pwd.get("enabled") and pwd.get("deploymentType") in {"all", "preview", "prod_deployment_urls_and_all_previews"}:
        return True
    return False


def public_aliases(project: dict, suffixes: list[str]) -> list[str]:
    out = []
    for d in project.get("domains") or []:
        host = d if isinstance(d, str) else (d.get("name") or d.get("domain") or "")
        if host and not is_allowed_alias(host, suffixes):
            out.append(host)
    return out


def check_project(project: dict, suffixes: list[str]) -> list[str]:
    reasons = []
    if not protection_on(project):
        reasons.append("deployment protection is off")
    aliases = public_aliases(project, suffixes)
    if aliases:
        reasons.append("public domain alias exists")
    return reasons


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def probe(url: str, redirect_hosts: list[str], timeout: float = 10.0) -> str:
    """Return 'protected', 'public', or 'unreachable'."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "ci-go-live"})
    try:
        # Don't follow redirects; we want the first hop.
        class NoFollow(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                raise urllib.error.HTTPError(newurl, code, msg, headers, fp)

        opener = urllib.request.build_opener(NoFollow)
        opener.open(req, timeout=timeout)
        # A 2xx without redirect means the deployment is reachable.
        return "public"
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location") or e.url or ""
        host = _host(loc) if loc else ""
        if e.code in {301, 302, 303, 307, 308} and any(host == h or host.endswith("." + h) for h in redirect_hosts):
            return "protected"
        if e.code in {401, 403}:
            return "protected"
        if e.code == 200:
            return "public"
        # Other HTTP codes: treat a reachable app-like 404 on a custom domain
        # as "the alias exists"; for the default probe, only 2xx is public.
        return "public" if e.code < 500 else "unreachable"
    except OSError:
        return "unreachable"


def check_live(targets: dict, fetch=None) -> list[str]:
    fetch = fetch or probe
    reasons = []
    redirect_hosts = targets["protection_redirect_hosts"]
    for url in targets["probe"]:
        result = fetch(url, redirect_hosts)
        if result == "public":
            reasons.append("deployment protection is off")
            break
        if result == "unreachable":
            # Default vercel.app should exist once a project is up. Unreachable
            # is not proof that protection is on, but also not a public page.
            continue
    for url in targets["public_alias_probes"]:
        result = fetch(url, redirect_hosts)
        # A custom host that serves this project (open or SSO-walled) is a
        # public alias. DNS-only or a failed TLS handshake is not.
        if result in {"public", "protected"}:
            reasons.append("public domain alias exists")
            break
    # unique, stable order
    out = []
    for r in reasons:
        if r not in out:
            out.append(r)
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", default=ROOT)
    p.add_argument("--targets", default=None)
    p.add_argument("--fixture", help="project JSON snapshot; never talks to Vercel")
    p.add_argument("--go-live", default=None, help="path to GO-LIVE.md")
    p.add_argument("--live", action="store_true", help="probe the configured URLs")
    args = p.parse_args(argv)
    root = os.path.abspath(args.root)
    go_live_path = args.go_live or os.path.join(root, "GO-LIVE.md")
    date = go_live_yes(go_live_path)
    if date:
        print(f"ok: GO-LIVE.md dated yes ({date})")
        return 0
    targets_path = args.targets or os.path.join(root, "scripts", "ci-go-live-targets.json")
    targets = load_targets(targets_path)
    reasons = []
    if args.fixture:
        with open(args.fixture, encoding="utf-8") as f:
            project = json.load(f)
        reasons.extend(check_project(project, targets["allowed_suffixes"]))
    if args.live:
        reasons.extend(check_live(targets))
    if not args.fixture and not args.live:
        print("ci-go-live: need --fixture or --live (or a dated yes in GO-LIVE.md)", file=sys.stderr)
        return 1
    # unique
    uniq = []
    for r in reasons:
        if r not in uniq:
            uniq.append(r)
    if uniq:
        for r in uniq:
            print(f"ci-go-live: {r}")
        return 1
    print("ok: deployment protection is on and no public domain alias exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())

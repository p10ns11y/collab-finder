#!/usr/bin/env python3
"""ci-go-live.py: protection and public-alias checks. Fixtures only."""
import json
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "ci-go-live.py")
TARGETS = os.path.join(HERE, "ci-go-live-targets.json")

sys.path.insert(0, HERE)
# load as a module from scripts/
import importlib.util
spec = importlib.util.spec_from_file_location("ci_go_live", SCRIPT)
gl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gl)

PROTECTED = {
    "name": "kanithanj-ai",
    "ssoProtection": {"enabled": True, "deploymentType": "all"},
    "passwordProtection": {"enabled": False, "deploymentType": None},
    "domains": ["kanithanj-ai.vercel.app"],
}
UNPROTECTED = {
    "name": "kanithanj-ai",
    "ssoProtection": {"enabled": False, "deploymentType": None},
    "passwordProtection": {"enabled": False, "deploymentType": None},
    "domains": ["kanithanj-ai.vercel.app"],
}
PUBLIC_ALIAS = {
    **PROTECTED,
    "domains": ["kanithanj-ai.vercel.app", "kanithanj.ai"],
}


def write(dirpath, rel, body, binary=False):
    path = os.path.join(dirpath, rel)
    os.makedirs(os.path.dirname(path) or dirpath, exist_ok=True)
    mode = "wb" if binary else "w"
    with open(path, mode, encoding=None if binary else "utf-8") as f:
        f.write(body)
    return path


def run(root, extra):
    return subprocess.run(
        [sys.executable, SCRIPT, "--root", root, *extra],
        capture_output=True, text=True,
    )


class DatedYes(unittest.TestCase):
    def test_dated_yes_unlocks_even_if_protection_is_off(self):
        d = tempfile.mkdtemp()
        write(d, "GO-LIVE.md", "Yes 2026-11-20\n")
        fixture = write(d, "proj.json", json.dumps(UNPROTECTED))
        r = run(d, ["--targets", TARGETS, "--go-live", os.path.join(d, "GO-LIVE.md"), "--fixture", fixture])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("GO-LIVE.md dated yes (2026-11-20)", r.stdout)

    def test_undated_file_does_not_unlock(self):
        d = tempfile.mkdtemp()
        write(d, "GO-LIVE.md", "please ship it\n")
        fixture = write(d, "proj.json", json.dumps(UNPROTECTED))
        r = run(d, ["--targets", TARGETS, "--go-live", os.path.join(d, "GO-LIVE.md"), "--fixture", fixture])
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("deployment protection is off", r.stdout)

    def test_missing_go_live_does_not_unlock(self):
        d = tempfile.mkdtemp()
        fixture = write(d, "proj.json", json.dumps(PROTECTED))
        r = run(d, ["--targets", TARGETS, "--go-live", os.path.join(d, "GO-LIVE.md"), "--fixture", fixture])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("deployment protection is on", r.stdout)


class FixtureChecks(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        # copy targets so --root does not need the real repo
        write(self.d, "scripts/ci-go-live-targets.json", Path(TARGETS).read_text(encoding="utf-8"))

    def test_protection_off_fails(self):
        fixture = write(self.d, "proj.json", json.dumps(UNPROTECTED))
        r = run(self.d, ["--fixture", fixture])
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("deployment protection is off", r.stdout)

    def test_protected_default_domain_passes(self):
        fixture = write(self.d, "proj.json", json.dumps(PROTECTED))
        r = run(self.d, ["--fixture", fixture])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_public_alias_fails(self):
        fixture = write(self.d, "proj.json", json.dumps(PUBLIC_ALIAS))
        r = run(self.d, ["--fixture", fixture])
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("public domain alias exists", r.stdout)
        # Do not print the alias hostname? The reason is generic; good.
        # kanithanj.ai is a planned public name already in the fixture.

    def test_does_not_create_go_live(self):
        fixture = write(self.d, "proj.json", json.dumps(PROTECTED))
        r = run(self.d, ["--fixture", fixture])
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.d, "GO-LIVE.md")))


class LiveProbeHelpers(unittest.TestCase):
    def test_probe_helpers_sso_vs_public_vs_alias(self):
        targets = gl.load_targets(TARGETS)

        def fetch_ok(url, _hosts):
            if url.startswith("https://kanithanj-ai.vercel.app"):
                return "protected"
            return "unreachable"

        self.assertEqual(gl.check_live(targets, fetch=fetch_ok), [])

        def fetch_public(url, _hosts):
            return "public"

        self.assertIn("deployment protection is off", gl.check_live(targets, fetch=fetch_public))

        def fetch_alias(url, _hosts):
            if "kanithanj.ai" in url:
                return "protected"
            return "protected"

        reasons = gl.check_live(targets, fetch=fetch_alias)
        self.assertIn("public domain alias exists", reasons)


if __name__ == "__main__":
    unittest.main()

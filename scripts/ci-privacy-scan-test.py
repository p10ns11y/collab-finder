#!/usr/bin/env python3
"""ci-privacy-scan.py on synthetic snippets only. Reports file:line:rule, never values."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN = os.path.join(HERE, "ci-privacy-scan.py")
ALLOW_DEFAULT = os.path.join(HERE, "ci-privacy-allow")


def write_pdf(path, text):
    payload = f"BT /F1 12 Tf 10 100 Td ({text}) Tj ET".encode()
    pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        + f"4 0 obj<</Length {len(payload)}>>stream\n".encode()
        + payload
        + b"\nendstream\nendobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF\n"
    )
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(pdf)


def run(root, rel, body, allow=None, pdf=False):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path) or root, exist_ok=True)
    if pdf:
        write_pdf(path, body)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    cmd = [sys.executable, SCAN, "--root", root, rel]
    if allow:
        cmd.extend(["--allow", allow])
    else:
        cmd.extend(["--allow", os.devnull])
    return subprocess.run(cmd, capture_output=True, text=True)


class PrivacyScan(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def test_flags_phone_and_home_path(self):
        body = "see " + "/home/" + "someone and call +" + "46 70 123 45 67\n"
        r = run(self.d, "note.md", body)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("home-path", r.stdout)
        self.assertIn("phone", r.stdout)
        self.assertIn("note.md:1:", r.stdout)
        # Never print the number or a home user.
        self.assertNotIn("123", r.stdout + r.stderr)
        self.assertNotIn("+" + "46", r.stdout + r.stderr)
        self.assertNotIn("/home/" + "someone", r.stdout + r.stderr)

    def test_allows_fictional_phone_and_runner_home(self):
        r = run(self.d, "ok.md", "call +1 555 0100 from /home/runner/work\n")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("hits 0", r.stdout)

    def test_allowlisted_public_cv_pdf_is_ignored(self):
        rel = "data/distillation/peramanathan-sathyamoorthy-cv.pdf"
        allow = os.path.join(self.d, "allow")
        with open(allow, "w", encoding="utf-8") as f:
            f.write("*\tdata/distillation/peramanathan-sathyamoorthy-cv.pdf\n")
        r = run(
            self.d, rel, "call +" + "46 70 123 45 67 and a@" + "secret.org",
            allow=allow, pdf=True,
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("hits 0", r.stdout)
        self.assertNotIn("123", r.stdout + r.stderr)
        self.assertNotIn("@", r.stdout.split("hits")[0] if "@" in r.stdout else "")

    def test_non_allowlisted_pdf_flags_phone_without_printing_it(self):
        r = run(self.d, "secret.pdf", "call +" + "46 70 123 45 67", pdf=True)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("secret.pdf:", r.stdout)
        self.assertIn("phone", r.stdout)
        self.assertNotIn("123", r.stdout + r.stderr)
        self.assertNotIn("+" + "46", r.stdout + r.stderr)

    def test_flags_private_host(self):
        r = run(self.d, "h.md", "host " + "mza" + "pan" + " is private\n")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("private-host", r.stdout)


if __name__ == "__main__":
    unittest.main()

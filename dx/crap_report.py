#!/usr/bin/env python3
"""
Merge cyclomatic complexity (Lizard XML) with line coverage (Rust llvm-cov JSON)
and emit CRAP-style metrics (Agitar formula: CRAP = C² × (1−d)³ + C).

Pattern from thepulimaangani/dx/crap_report.py — adapted for collab-finder (Rust + verify runners, no Vitest yet).
CI: report-only by default; use --max-mean to fail the job.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def crap_score(cyclomatic: float, line_coverage_fraction: float) -> float:
    c = max(1.0, float(cyclomatic))
    d = min(1.0, max(0.0, float(line_coverage_fraction)))
    return (c * c) * math.pow(1.0 - d, 3) + c


def norm_path(p: str) -> str:
    return str(Path(p).as_posix())


def load_lizard_xml(path: Path) -> list[tuple[str, float]]:
    tree = ET.parse(path)
    root = tree.getroot()
    out: list[tuple[str, float]] = []

    for measure in root.findall("measure"):
        if measure.get("type") != "File":
            continue
        labels = [lab.text for lab in measure.findall("labels/label") if lab.text]
        if "CCN" not in labels or "Functions" not in labels:
            continue
        idx_ccn = labels.index("CCN")
        idx_fn = labels.index("Functions")
        for item in measure.findall("item"):
            name = item.get("name")
            if not name:
                continue
            vals = [float(v.text) for v in item.findall("value") if v.text is not None]
            if len(vals) <= max(idx_ccn, idx_fn):
                continue
            total_ccn = vals[idx_ccn]
            n_fn = max(1.0, vals[idx_fn])
            out.append((norm_path(name), total_ccn / n_fn))
    return out


def load_rust_llvm_cov_summary(path: Path) -> dict[str, float]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, float] = {}
    files: list | None = None
    if isinstance(data, dict):
        if isinstance(data.get("files"), list):
            files = data["files"]
        elif isinstance(data.get("data"), list) and data["data"]:
            first = data["data"][0]
            if isinstance(first, dict) and isinstance(first.get("files"), list):
                files = first["files"]
    if not isinstance(files, list):
        return out
    for item in files:
        if not isinstance(item, dict):
            continue
        fname = item.get("filename") or item.get("file")
        summ = item.get("summary") if isinstance(item.get("summary"), dict) else {}
        lines = summ.get("lines") if isinstance(summ.get("lines"), dict) else {}
        frac: float | None = None
        if isinstance(lines, dict):
            count = lines.get("count")
            covered = lines.get("covered")
            if isinstance(count, (int, float)) and count and isinstance(covered, (int, float)):
                frac = float(covered) / float(count)
            elif "percent" in lines:
                try:
                    frac = float(lines["percent"]) / 100.0
                except (TypeError, ValueError):
                    pass
        if frac is None:
            continue
        nk = norm_path(str(fname))
        out[nk] = frac
        if "src-tauri/" in nk:
            out[norm_path(nk.split("src-tauri/", 1)[1])] = frac
    return out


def pick_coverage(path: str, rust: dict[str, float]) -> float:
    n = norm_path(path)
    if n in rust:
        return rust[n]
    for k, v in rust.items():
        if n == k or n.endswith("/" + k) or k.endswith("/" + n):
            return v
    base = Path(n).name
    if base in rust:
        return rust[base]
    return 0.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lizard-xml", type=Path, nargs="+", required=True)
    ap.add_argument("--rust-cov", type=Path)
    ap.add_argument("--out-md", type=Path, default=Path("crap-report.md"))
    ap.add_argument("--max-mean", type=float, default=0.0)
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()

    file_cc: list[tuple[str, float]] = []
    for lx in args.lizard_xml:
        if lx.exists():
            file_cc.extend(load_lizard_xml(lx))
    rust_cov = (
        load_rust_llvm_cov_summary(args.rust_cov)
        if args.rust_cov and args.rust_cov.exists()
        else {}
    )

    rows: list[tuple[float, str, float, float]] = []
    for fstr, cc in file_cc:
        d = pick_coverage(fstr, rust_cov)
        rows.append((crap_score(cc, d), norm_path(fstr), cc, d))
    rows.sort(key=lambda x: -x[0])
    mean_crap = sum(r[0] for r in rows) / len(rows) if rows else 0.0

    lines_out = [
        "# CRAP report (collab-finder CI)",
        "",
        f"Files analyzed (Lizard): **{len(rows)}**",
        f"Rust coverage files matched: **{len(rust_cov)}**",
        f"Mean CRAP: **{mean_crap:.2f}**",
        "",
        f"## Top {args.top} by CRAP",
        "",
        "| CRAP | Avg CC | cov | File |",
        "| ---:| ---:| ---:| --- |",
    ]
    for crap, path, cc, d in rows[: args.top]:
        lines_out.append(f"| {crap:.1f} | {cc:.2f} | {d * 100:.0f}% | `{path}` |")

    args.out_md.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    print("\n".join(lines_out))
    if args.max_mean > 0 and mean_crap > args.max_mean:
        print(f"\nERROR: mean CRAP {mean_crap:.2f} > {args.max_mean}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

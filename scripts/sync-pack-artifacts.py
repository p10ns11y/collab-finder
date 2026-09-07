#!/usr/bin/env python3
"""Wire application pack files into opportunities.prep_artifacts_json and notes.

Pipeline hydrate lists pack overlay/PDFs only when notes contain export_path=.
Native prep schema: cover_letter str, cv_suggestions str[], research_notes str,
email_draft str, exceptional_work_example str.

Default is audit (exit 1 on gaps). Pass --write to apply. Idempotent.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path.home() / ".local/share/collab-finder"
DB = Path.home() / ".local/share/collab-finder/collab-finder.db"
PACKS = ROOT / "application_packs"
BAND = ROOT / "mon-jd-band"
INDEX = ROOT / "PACK-ARTIFACTS.md"

REQUIRED_FILES = (
    "cover-letter.md",
    "research-notes.md",
    "email-draft.md",
    "exceptional-work.md",
    "cv-suggestions.md",
    "cv-overlay.json",
    "STATUS.md",
)

HEADINGS = {
    "cover-letter.md": ("# Cover letter",),
    "email-draft.md": ("# Email draft", "# Email apply draft"),
    "exceptional-work.md": (
        "# Exceptional work (prep)",
        "# Exceptional work example",
        "# Exceptional work",
    ),
    "research-notes.md": ("# Research notes",),
    "cv-suggestions.md": (
        "# CV suggestions (sidecar-style; do not auto-apply)",
        "# CV suggestions",
    ),
}

# applied / parked (prepped) / held (prepped). Ledger SoT: week37-ledger.json
WEEK37 = (
    {
        "id": 533,
        "slug": "legora-ai-software-engineer-2026-09-04",
        "status": "applied",
        "band": True,
    },
    {
        "id": 534,
        "slug": "lovable-fullstack-engineer-cloud-app-hosting-2026-09-04",
        "status": "applied",
        "band": True,
    },
    {
        "id": 535,
        "slug": "legora-senior-software-engineer-2026-09-04",
        "status": "applied",
        "band": True,
    },
    {
        "id": 536,
        "slug": "ashby-senior-software-engineer-product-engineering-eu-2026-09-04",
        "status": "applied",
        "band": True,
    },
    {
        "id": 537,
        "slug": "distru-ai-product-engineer-2026-09-04",
        "status": "prepped",
        "band": True,
    },
    {
        "id": 538,
        "slug": "ashby-staff-software-engineer-product-engineering-eu-2026-09-07",
        "status": "applied",
        "band": True,
    },
    {
        "id": 156,
        "slug": "xai-software-engineer-platform-infrastructure-rust-2026-09-07",
        "status": "prepped",
        "band": True,
    },
)

# WEEK37-LOOKUP.md already recorded these; status did not stick on 21/24/532.
ARCHIVE_IDS = (21, 24, 532)


def strip_heading(text: str, names: tuple[str, ...]) -> str:
    t = text.replace("\r\n", "\n")
    for name in names:
        prefix = name + "\n"
        if t.startswith(prefix):
            t = t[len(prefix) :]
            if t.startswith("\n"):
                t = t[1:]
            break
    return t.strip("\n") + ("\n" if t.strip() else "")


def parse_suggestions(md: str) -> list[str]:
    body = strip_heading(md, HEADINGS["cv-suggestions.md"])
    out: list[str] = []
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("- "):
            item = s[2:].strip()
            if item:
                out.append(item)
    return out


def pack_dir(slug: str) -> Path:
    return PACKS / slug


def missing_pack_files(slug: str) -> list[str]:
    d = pack_dir(slug)
    miss = [name for name in REQUIRED_FILES if not (d / name).exists()]
    submit = d / "submit"
    pdfs = list(submit.glob("*.pdf")) if submit.is_dir() else []
    if len(pdfs) < 1:
        miss.append("submit/*.pdf")
    return miss


def prep_from_pack(slug: str, existing: dict) -> dict:
    d = pack_dir(slug)
    cover = strip_heading((d / "cover-letter.md").read_text(), HEADINGS["cover-letter.md"])
    research = strip_heading(
        (d / "research-notes.md").read_text(), HEADINGS["research-notes.md"]
    )
    email = strip_heading((d / "email-draft.md").read_text(), HEADINGS["email-draft.md"])
    ew = strip_heading(
        (d / "exceptional-work.md").read_text(), HEADINGS["exceptional-work.md"]
    )
    suggestions = parse_suggestions((d / "cv-suggestions.md").read_text())
    proof = existing.get("proof_variant_id")
    proof_title = existing.get("proof_variant_title")
    pv = d / "proof-variant.txt"
    if pv.exists():
        raw = pv.read_text().strip()
        if raw:
            proof = raw
    overlay = None
    overlay_path = d / "cv-overlay.json"
    if overlay_path.exists():
        overlay = json.loads(overlay_path.read_text())
    prep = {
        "cover_letter": cover.strip(),
        "research_notes": research.strip(),
        "email_draft": email.strip(),
        "exceptional_work_example": ew.strip(),
        "cv_suggestions": suggestions,
    }
    if proof:
        prep["proof_variant_id"] = proof
    if proof_title:
        prep["proof_variant_title"] = proof_title
    if overlay is not None:
        prep["cv_overlay"] = overlay
    return prep


def notes_with_export(notes: str | None, path: str, slug: str) -> str:
    text = notes or ""
    if f"export_path={path}" in text and f"pack_slug={slug}" in text:
        return text
    line = f"export_path={path} pack_slug={slug}"
    cleaned = []
    for raw_line in text.splitlines():
        if "export_path=" in raw_line or raw_line.strip().startswith("pack_slug="):
            continue
        cleaned.append(raw_line)
    body = "\n".join(cleaned).rstrip()
    return f"{body}\n{line}\n" if body else f"{line}\n"


def connect(db: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db), timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 8000")
    con.execute("PRAGMA foreign_keys = ON")
    return con


def audit(con: sqlite3.Connection) -> list[str]:
    gaps: list[str] = []
    for row in WEEK37:
        oid, slug, want = row["id"], row["slug"], row["status"]
        miss = missing_pack_files(slug)
        if miss:
            gaps.append(f"pack {slug}: missing {miss}")
        rec = con.execute(
            "SELECT id, status, notes, prep_artifacts_json FROM opportunities WHERE id=?",
            (oid,),
        ).fetchone()
        if rec is None:
            gaps.append(f"id={oid} {slug}: no sqlite row")
            continue
        if rec["status"] != want:
            gaps.append(f"id={oid} {slug}: status={rec['status']!r} want={want!r}")
        path = str(pack_dir(slug))
        notes = rec["notes"] or ""
        if f"export_path={path}" not in notes:
            gaps.append(f"id={oid} {slug}: notes missing export_path")
        if f"pack_slug={slug}" not in notes:
            gaps.append(f"id={oid} {slug}: notes missing pack_slug")
        raw = rec["prep_artifacts_json"] or ""
        if len(raw) < 400:
            gaps.append(f"id={oid} {slug}: prep_artifacts_json too small ({len(raw)})")
            continue
        obj = json.loads(raw)
        for key in (
            "cover_letter",
            "research_notes",
            "email_draft",
            "exceptional_work_example",
        ):
            val = obj.get(key)
            if not isinstance(val, str) or len(val.strip()) < 40:
                gaps.append(f"id={oid} {slug}: {key} empty/short")
        sug = obj.get("cv_suggestions")
        if not isinstance(sug, list) or not sug:
            gaps.append(f"id={oid} {slug}: cv_suggestions not a non-empty list")
        if not isinstance(obj.get("cv_overlay"), dict):
            gaps.append(f"id={oid} {slug}: cv_overlay missing in sqlite")
        research = obj.get("research_notes") or ""
        if len(research) < 400:
            gaps.append(
                f"id={oid} {slug}: research_notes {len(research)}B (want full notes, not ~200B stub)"
            )
    for oid in ARCHIVE_IDS:
        rec = con.execute(
            "SELECT id, status FROM opportunities WHERE id=?", (oid,)
        ).fetchone()
        if rec is None:
            gaps.append(f"archive id={oid}: no row")
        elif rec["status"] != "archived":
            gaps.append(f"archive id={oid}: status={rec['status']!r} want=archived")
    applied = con.execute(
        "SELECT COUNT(*) FROM opportunities WHERE status='applied'"
    ).fetchone()[0]
    if applied != 5:
        gaps.append(f"applied count={applied} want=5 (week37 submitted)")
    return gaps


def apply(con: sqlite3.Connection) -> list[str]:
    actions: list[str] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for row in WEEK37:
        oid, slug, want = row["id"], row["slug"], row["status"]
        path = str(pack_dir(slug))
        rec = con.execute(
            "SELECT status, notes, prep_artifacts_json FROM opportunities WHERE id=?",
            (oid,),
        ).fetchone()
        if rec is None:
            raise SystemExit(f"missing opportunity id={oid}")
        existing = json.loads(rec["prep_artifacts_json"] or "{}")
        if not isinstance(existing, dict):
            existing = {}
        prep = prep_from_pack(slug, existing)
        notes = notes_with_export(rec["notes"], path, slug)
        blob = json.dumps(prep, ensure_ascii=False)
        con.execute(
            """UPDATE opportunities
               SET status = ?,
                   prep_artifacts_json = ?,
                   notes = ?,
                   last_updated = ?
               WHERE id = ?""",
            (want, blob, notes, now, oid),
        )
        actions.append(f"upsert id={oid} {slug} status={want} prep={len(blob)}")
        if row.get("band"):
            src_r = pack_dir(slug) / "research-notes.md"
            src_c = pack_dir(slug) / "cover-letter.md"
            dest_r = BAND / f"{slug}-research.md"
            dest_c = BAND / f"{slug}-cover.md"
            BAND.mkdir(parents=True, exist_ok=True)
            if src_r.exists() and src_r.read_text() != (
                dest_r.read_text() if dest_r.exists() else None
            ):
                dest_r.write_text(src_r.read_text())
                actions.append(f"band research {dest_r.name}")
            if src_c.exists() and src_c.read_text() != (
                dest_c.read_text() if dest_c.exists() else None
            ):
                dest_c.write_text(src_c.read_text())
                actions.append(f"band cover {dest_c.name}")
    for oid in ARCHIVE_IDS:
        rec = con.execute(
            "SELECT status, notes FROM opportunities WHERE id=?", (oid,)
        ).fetchone()
        if rec is None:
            continue
        notes = rec["notes"] or ""
        if "archived_from_applied=" not in notes:
            notes = (
                notes.rstrip()
                + "\narchived_from_applied=2026-09-07T21:40+0530 reason=pre-week37_hide_for_pipeline_focus\n"
            )
        if rec["status"] != "archived" or notes != rec["notes"]:
            con.execute(
                """UPDATE opportunities
                   SET status = 'archived', notes = ?, last_updated = ?
                   WHERE id = ?""",
                (notes, now, oid),
            )
            actions.append(f"archive id={oid}")
    con.commit()
    return actions


def write_index(con: sqlite3.Connection) -> None:
    lines = [
        "# Application pack artifacts (synced 2026-09-08 IST)",
        "",
        "Full prep lives under `~/.local/share/collab-finder/application_packs/<slug>/`.",
        "Also: `mon-jd-band/` (research originals) and `_sync/` (tarballs).",
        "",
        "Each applied / parked / held pack has cover, research, email, exceptional-work,",
        "cv-suggestions, overlay, STATUS, and submit PDFs. The same text is in SQLite",
        "`prep_artifacts_json`. Notes include `export_path=` + `pack_slug=` so Pipeline",
        "hydrate lists the folder.",
        "",
        "## Week37 (+ parked/held)",
        "",
        "| id | status | slug | cover | research | email | ew | cv-sug | overlay | submit | notes-path |",
        "|---:|--------|------|------:|---------:|------:|---:|-------:|--------:|-------:|:-----------|",
    ]
    for row in WEEK37:
        oid, slug = row["id"], row["slug"]
        d = pack_dir(slug)
        rec = con.execute(
            "SELECT status, notes, prep_artifacts_json FROM opportunities WHERE id=?",
            (oid,),
        ).fetchone()
        sizes = {
            "cover": (d / "cover-letter.md").stat().st_size,
            "research": (d / "research-notes.md").stat().st_size,
            "email": (d / "email-draft.md").stat().st_size,
            "ew": (d / "exceptional-work.md").stat().st_size,
            "sug": (d / "cv-suggestions.md").stat().st_size,
            "overlay": (d / "cv-overlay.json").stat().st_size,
        }
        pdfs = len(list((d / "submit").glob("*.pdf")))
        has_path = "yes" if rec and "export_path=" in (rec["notes"] or "") else "no"
        status = rec["status"] if rec else "?"
        lines.append(
            f"| {oid} | {status} | `{slug}` | {sizes['cover']} | {sizes['research']} | "
            f"{sizes['email']} | {sizes['ew']} | {sizes['sug']} | {sizes['overlay']} | "
            f"{pdfs} | {has_path} |"
        )
    lines.extend(
        [
            "",
            "## Pipeline Applied vs packs",
            "- Week37 submitted ids 533–536, 538: packs + sqlite prep + `export_path`.",
            "- Parked: Distru 537 (`prepped`). Held: SpaceXAI Rust 156 (`prepped`).",
            "- Older applied hidden again: ids 21, 24, 532 `archived` (53, 55 already were).",
            "",
            "## Verify",
            "",
            "```bash",
            "python3 scripts/sync-pack-artifacts.py",
            "ls ~/.local/share/collab-finder/application_packs/ashby-staff-software-engineer-product-engineering-eu-2026-09-07/",
            "```",
            "",
        ]
    )
    INDEX.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="apply sqlite/notes/band/index")
    parser.add_argument("--db", type=Path, default=DB)
    args = parser.parse_args()
    if not args.db.exists():
        print(f"database not found: {args.db}", file=sys.stderr)
        return 2
    con = connect(args.db)
    before = audit(con)
    if not args.write:
        if before:
            print("GAPS")
            for g in before:
                print(f"  {g}")
            return 1
        print("OK pack artifacts complete")
        return 0
    actions = apply(con)
    write_index(con)
    for a in actions:
        print(a)
    after = audit(con)
    if after:
        print("STILL GAPS")
        for g in after:
            print(f"  {g}")
        return 1
    print("OK wrote pack artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

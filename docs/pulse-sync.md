# Hunt pulse sync (kanithanj.ai ↔ pulse-memory)

kanithanj.ai admits **ledger-honest** hunt deltas into pulse-memory while the desktop app runs. Short sessions still leave a pack on shutdown.

## What gets stored

Pulse traces are **not** chat logs, JD dumps, or secrets. Each `MemoryTrace` carries:

- `company` · `title` · `status` / `outcome` · `source_url` · as-of timestamp
- admitted on: apply / outcome / prep / search-cycle / guard pause

Format: **pulse-pack-v1** envelope:

```json
{
  "format": "pulse-pack-v1",
  "exported_at": "2026-09-13T08:00:00.000000000Z",
  "host": "mzapan",
  "traces": [ { "nat_key": "hunt/opp/7/status", "snippet": "…", "source": "kanithanj:hunt", "time": "…", "status": "tool-verified", "kind": "data", "lock": "open" } ]
}
```

## On-disk locations

| Path | Role |
|------|------|
| `~/.local/share/collab-finder/_sync/pulse/latest.json` | live pack (rewritten on each admit + shutdown archive) |
| `~/.local/share/collab-finder/_sync/pulse/hunt-pulse-*.json` | timestamped archive on app exit |
| `~/.local/share/pulse-memory/pulse.sqlite` | pulse-memory DB (`PULSE_MEMORY_DB` override) |

Pulse **informs** downstream tooling; it never writes the ensembly dependency graph.

## Cross-machine sync (mzapan laptop ↔ Grok Bot computer)

### A. File handoff (simplest)

**On machine A** (after kanithanj session):

```bash
node scripts/pulse-export.mjs --out /tmp/hunt-pulse.json
# scp /tmp/hunt-pulse.json other-host:/tmp/
```

**On machine B**:

```bash
node scripts/pulse-import.mjs /tmp/hunt-pulse.json
```

### B. Shared pulse-memory DB

If both machines share `~/.local/share/pulse-memory/` (Syncthing, rsync, etc.), kanithanj upserts directly — no import step. Set `PULSE_MEMORY_DB` when the DB lives elsewhere.

### C. ensembly tooling (optional)

If pulse-memory CLI tools are installed (`pulse_export` / `pulse_import` from ensembly), they accept the same pulse-pack-v1 JSON. This repo does not depend on ensembly runtime.

## Operator scripts

| Script | Purpose |
|--------|------|
| `node scripts/pulse-export.mjs` | copy `latest.json` to a portable file |
| `node scripts/pulse-import.mjs <pack.json>` | upsert traces into pulse-memory |
| `pnpm export-pipeline` | legacy aggregate `career/pipeline/applied-count` trace (still supported) |

## Rust seam

Implementation: `src-tauri/src/pulse.rs`

- `PulseWriter::admit` — hunt tick → memory trace + pack rewrite
- `PulseWriter::flush` — shutdown archive
- `import_pack_file` — testable import path

Tests: `cd src-tauri && cargo test pulse::`

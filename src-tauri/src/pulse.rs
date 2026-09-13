//! Hunt pulse writer — admits ledger-honest MemoryTraces into pulse-memory and
//! pulse-pack-v1 files under `app_data_dir()/_sync/pulse/`.
//!
//! Contract (pulse-pack-v1): `{ format, exported_at, host, traces[], archive? }`.
//! Default pulse DB: `~/.local/share/pulse-memory/pulse.sqlite` (`PULSE_MEMORY_DB`).
//! Pulse informs; it never writes the ensembly dependency graph.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::app_dirs::app_data_dir;

/// Tauri-managed hunt pulse writer (started at app boot, flushed on exit).
pub struct AppPulse(pub std::sync::Mutex<PulseWriter>);

/// Best-effort admit — never fails the caller.
pub fn admit(pulse: &AppPulse, tick: HuntTick) {
    if let Ok(mut w) = pulse.0.lock() {
        w.admit(tick);
    }
}

/// pulse-pack-v1 envelope (see ensembly pulse_export / pulse_import tooling).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PulsePackV1 {
    pub format: String,
    pub exported_at: String,
    pub host: String,
    pub traces: Vec<MemoryTrace>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive: Option<bool>,
}

/// One admitted hunt memory trace (maps to pulse-memory `memory_traces` row).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryTrace {
    pub nat_key: String,
    pub snippet: String,
    pub source: String,
    pub time: String,
    pub status: String,
    pub kind: String,
    pub lock: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HuntTickKind {
    StatusChange,
    OutcomeChange,
    Prep,
    SearchCycle,
    Pause,
}

/// Ledger-honest hunt tick — company/role/status/outcome/source_url/as-of only.
#[derive(Debug, Clone)]
pub struct HuntTick {
    pub kind: HuntTickKind,
    pub opp_id: Option<i64>,
    pub company: Option<String>,
    pub title: Option<String>,
    pub status: Option<String>,
    pub outcome: Option<String>,
    pub source_url: Option<String>,
    /// Guard type, query summary, pause reason — never JD or secrets.
    pub detail: Option<String>,
}

pub struct PulseWriter {
    traces: Vec<MemoryTrace>,
    host: String,
    sync_dir: PathBuf,
    pulse_db_path: Option<PathBuf>,
}

static PULSE_OVERRIDE: Mutex<Option<PulsePaths>> = Mutex::new(None);

#[derive(Clone)]
struct PulsePaths {
    sync_dir: PathBuf,
    pulse_db: Option<PathBuf>,
    host: String,
}

#[cfg(test)]
pub fn set_test_paths(sync_dir: PathBuf, pulse_db: Option<PathBuf>) {
    *PULSE_OVERRIDE.lock().expect("pulse lock") = Some(PulsePaths {
        sync_dir,
        pulse_db,
        host: "test-host".into(),
    });
}

#[cfg(test)]
pub fn clear_test_paths() {
    *PULSE_OVERRIDE.lock().expect("pulse lock") = None;
}

fn resolve_paths() -> Result<PulsePaths, String> {
    if let Some(p) = PULSE_OVERRIDE.lock().map_err(|e| e.to_string())?.clone() {
        return Ok(p);
    }
    let sync_dir = app_data_dir()?.join("_sync").join("pulse");
    let pulse_db = resolve_pulse_db_path();
    let host = hostname();
    Ok(PulsePaths {
        sync_dir,
        pulse_db,
        host,
    })
}

fn resolve_pulse_db_path() -> Option<PathBuf> {
    if let Ok(v) = std::env::var("PULSE_MEMORY_DB") {
        let t = v.trim();
        if !t.is_empty() {
            return Some(PathBuf::from(t));
        }
    }
    dirs::data_local_dir().map(|d| d.join("pulse-memory").join("pulse.sqlite"))
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "kanithanj".into())
}

impl PulseWriter {
    pub fn open() -> Self {
        let paths = resolve_paths().unwrap_or_else(|e| {
            eprintln!("[pulse] path resolve failed (pulse disabled): {e}");
            PulsePaths {
                sync_dir: PathBuf::from("/tmp/collab-finder-pulse-disabled"),
                pulse_db: None,
                host: hostname(),
            }
        });
        if let Err(e) = fs::create_dir_all(&paths.sync_dir) {
            eprintln!("[pulse] mkdir sync dir failed: {e}");
        }
        Self {
            traces: Vec::new(),
            host: paths.host,
            sync_dir: paths.sync_dir,
            pulse_db_path: paths.pulse_db,
        }
    }

    /// Admit one hunt tick (best-effort; never blocks the UI thread meaningfully).
    pub fn admit(&mut self, tick: HuntTick) {
        let trace = build_trace(&tick);
        self.traces.push(trace.clone());
        if let Err(e) = upsert_pulse_db(&self.pulse_db_path, &trace) {
            eprintln!("[pulse] pulse-memory upsert skipped: {e}");
        }
        if let Err(e) = self.write_latest_pack() {
            eprintln!("[pulse] pack write skipped: {e}");
        }
    }

    /// Flush pulse-pack-v1 on shutdown (also writes timestamped archive copy).
    pub fn flush(&self) -> Result<PathBuf, String> {
        self.write_pack(true)
    }

    fn write_latest_pack(&self) -> Result<(), String> {
        self.write_pack(false).map(|_| ())
    }

    fn write_pack(&self, archive: bool) -> Result<PathBuf, String> {
        let pack = self.build_pack(archive);
        let json = serde_json::to_string_pretty(&pack).map_err(|e| e.to_string())?;
        fs::create_dir_all(&self.sync_dir).map_err(|e| e.to_string())?;
        let latest = self.sync_dir.join("latest.json");
        fs::write(&latest, &json).map_err(|e| e.to_string())?;
        if archive {
            let ts = pack.exported_at.replace(':', "-");
            let stamped = self.sync_dir.join(format!("hunt-pulse-{ts}.json"));
            fs::write(&stamped, &json).map_err(|e| e.to_string())?;
            Ok(stamped)
        } else {
            Ok(latest)
        }
    }

    pub fn build_pack(&self, archive: bool) -> PulsePackV1 {
        PulsePackV1 {
            format: "pulse-pack-v1".into(),
            exported_at: iso_now_rfc3339(),
            host: self.host.clone(),
            traces: self.traces.clone(),
            archive: archive.then_some(true),
        }
    }

    pub fn trace_count(&self) -> usize {
        self.traces.len()
    }

    pub fn sync_dir(&self) -> &Path {
        &self.sync_dir
    }
}

fn iso_now_rfc3339() -> String {
    // Simple UTC formatter: enough for pulse packs and tests.
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let nanos = dur.subsec_nanos();
    // Convert epoch to UTC date/time without external crate (good enough for pulse).
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let (y, m, d) = epoch_days_to_ymd(days);
    let hh = time_of_day / 3600;
    let mm = (time_of_day % 3600) / 60;
    let ss = time_of_day % 60;
    format!(
        "{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{nanos:09}Z"
    )
}

fn epoch_days_to_ymd(days: u64) -> (u32, u32, u32) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html (civil_from_days).
    let z = days as i64 + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mp < 10 { y } else { y + 1 };
    (y as u32, m, d)
}

fn build_trace(tick: &HuntTick) -> MemoryTrace {
    let nat_key = nat_key_for(tick);
    let snippet = sanitize_snippet(&ledger_snippet(tick));
    MemoryTrace {
        nat_key,
        snippet,
        source: "kanithanj:hunt".into(),
        time: iso_now_rfc3339(),
        status: "tool-verified".into(),
        kind: "data".into(),
        lock: "open".into(),
    }
}

fn nat_key_for(tick: &HuntTick) -> String {
    match tick.kind {
        HuntTickKind::StatusChange | HuntTickKind::Prep => {
            format!("hunt/opp/{}/status", tick.opp_id.unwrap_or(0))
        }
        HuntTickKind::OutcomeChange => {
            format!("hunt/opp/{}/outcome", tick.opp_id.unwrap_or(0))
        }
        HuntTickKind::SearchCycle => "hunt/cycle/latest".into(),
        HuntTickKind::Pause => format!(
            "hunt/pause/{}",
            tick.detail
                .as_deref()
                .map(|s| s.chars().take(32).collect::<String>())
                .unwrap_or_else(|| "guard".into())
        ),
    }
}

fn ledger_snippet(tick: &HuntTick) -> String {
    let company = tick.company.as_deref().unwrap_or("—");
    let title = tick.title.as_deref().unwrap_or("—");
    let status = tick.status.as_deref().unwrap_or("—");
    let outcome = tick.outcome.as_deref().filter(|s| !s.is_empty());
    let url = tick.source_url.as_deref().unwrap_or("—");
    let as_of = iso_now_rfc3339();
    match tick.kind {
        HuntTickKind::StatusChange => {
            format!(
                "{company} · {title} → status={status} · {url} · as-of {as_of}"
            )
        }
        HuntTickKind::OutcomeChange => {
            format!(
                "{company} · {title} → outcome={} · status={status} · {url} · as-of {as_of}",
                outcome.unwrap_or("—")
            )
        }
        HuntTickKind::Prep => {
            format!(
                "{company} · {title} prepped → status={status} · {url} · as-of {as_of}"
            )
        }
        HuntTickKind::SearchCycle => {
            let detail = tick.detail.as_deref().unwrap_or("cycle");
            format!("search-cycle: {detail} · as-of {as_of}")
        }
        HuntTickKind::Pause => {
            let detail = tick.detail.as_deref().unwrap_or("guard");
            format!("pause: {detail} · as-of {as_of}")
        }
    }
}

/// Strip secrets, bearer tokens, and oversized blobs from pulse snippets.
pub fn sanitize_snippet(raw: &str) -> String {
    let mut s = redact_token_after(&raw, "Bearer ", "Bearer [REDACTED]");
    s = redact_token_after(&s, "bearer ", "bearer [REDACTED]");
    s = redact_token_after(&s, "xai-", "xai-[REDACTED]");
    const MAX: usize = 480;
    if s.len() > MAX {
        s.truncate(MAX);
        s.push_str("…");
    }
    s
}

/// Replace `prefix<token>` with `replacement`, where token runs until whitespace.
fn redact_token_after(input: &str, prefix: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(idx) = rest.find(prefix) {
        out.push_str(&rest[..idx]);
        out.push_str(replacement);
        rest = &rest[idx + prefix.len()..];
        if let Some(space) = rest.find(|c: char| c.is_whitespace()) {
            rest = &rest[space..];
        } else {
            rest = "";
            break;
        }
    }
    out.push_str(rest);
    out
}

fn ensure_pulse_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS memory_traces (
            nat_key TEXT PRIMARY KEY,
            snippet TEXT NOT NULL,
            source TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT NOT NULL,
            kind TEXT NOT NULL,
            lock TEXT NOT NULL DEFAULT 'open'
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_pulse_db(db_path: &Option<PathBuf>, trace: &MemoryTrace) -> Result<(), String> {
    let path = db_path.as_ref().ok_or("pulse DB path unset")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    ensure_pulse_schema(&conn)?;
    conn.execute(
        "INSERT INTO memory_traces (nat_key, snippet, source, time, status, kind, lock)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(nat_key) DO UPDATE SET
           snippet = excluded.snippet,
           time = excluded.time,
           status = excluded.status",
        params![
            trace.nat_key,
            trace.snippet,
            trace.source,
            trace.time,
            trace.status,
            trace.kind,
            trace.lock,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Import traces from a pulse-pack-v1 file into pulse-memory (for cross-machine sync).
pub fn import_pack_file(pack_path: &Path, pulse_db: Option<PathBuf>) -> Result<usize, String> {
    let raw = fs::read_to_string(pack_path).map_err(|e| e.to_string())?;
    let pack: PulsePackV1 = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if pack.format != "pulse-pack-v1" {
        return Err(format!("unsupported format '{}'", pack.format));
    }
    let db = pulse_db.or_else(resolve_pulse_db_path);
    let mut n = 0;
    for trace in &pack.traces {
        let clean = MemoryTrace {
            snippet: sanitize_snippet(&trace.snippet),
            ..trace.clone()
        };
        upsert_pulse_db(&db, &clean)?;
        n += 1;
    }
    Ok(n)
}

pub fn tick_from_opportunity(
    kind: HuntTickKind,
    opp: &crate::db::Opportunity,
    detail: Option<String>,
) -> HuntTick {
    HuntTick {
        kind,
        opp_id: Some(opp.id),
        company: opp.company.clone(),
        title: opp.title.clone(),
        status: Some(opp.status.clone()),
        outcome: opp.outcome_status.clone(),
        source_url: opp.source_url.clone(),
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Opportunity;
    use tempfile::TempDir;

    fn sample_opp() -> Opportunity {
        Opportunity {
            id: 7,
            kind: "web".into(),
            source_url: Some("https://jobs.example.com/role".into()),
            source_ref: None,
            title: Some("Staff Engineer".into()),
            company: Some("Acme".into()),
            jd_text: "SECRET JD SHOULD NOT APPEAR".into(),
            status: "applied".into(),
            fit_score: Some(88),
            analysis_json: None,
            prep_artifacts_json: None,
            last_updated: "2026-01-01".into(),
            notes: None,
            outcome_status: Some("waiting".into()),
            applied_at: Some("2026-01-01".into()),
        }
    }

    #[test]
    fn pack_shape_is_pulse_pack_v1() {
        let dir = TempDir::new().unwrap();
        set_test_paths(dir.path().join("pulse"), None);
        let mut w = PulseWriter::open();
        w.admit(tick_from_opportunity(
            HuntTickKind::StatusChange,
            &sample_opp(),
            None,
        ));
        let pack = w.build_pack(false);
        assert_eq!(pack.format, "pulse-pack-v1");
        assert_eq!(pack.host, "test-host");
        assert!(!pack.traces.is_empty());
        assert_eq!(pack.traces[0].lock, "open");
        clear_test_paths();
    }

    #[test]
    fn admit_does_not_leak_jd_or_bearer() {
        let dir = TempDir::new().unwrap();
        set_test_paths(dir.path().join("pulse"), None);
        let mut w = PulseWriter::open();
        let opp = sample_opp();
        w.admit(tick_from_opportunity(HuntTickKind::StatusChange, &opp, None));
        let snippet = &w.build_pack(false).traces[0].snippet;
        assert!(!snippet.contains("SECRET JD"));
        assert!(!snippet.contains("jd_text"));

        let pause = HuntTick {
            kind: HuntTickKind::Pause,
            opp_id: None,
            company: None,
            title: None,
            status: None,
            outcome: None,
            source_url: None,
            detail: Some("Bearer AAAAfake-token-should-redact".into()),
        };
        w.admit(pause);
        let pause_snip = w.build_pack(false).traces.last().unwrap().snippet.clone();
        assert!(!pause_snip.contains("AAAAfake"));
        assert!(pause_snip.contains("REDACTED"));
        clear_test_paths();
    }

    #[test]
    fn flush_writes_latest_and_archive() {
        let dir = TempDir::new().unwrap();
        let sync = dir.path().join("pulse");
        set_test_paths(sync.clone(), None);
        let mut w = PulseWriter::open();
        w.admit(tick_from_opportunity(
            HuntTickKind::OutcomeChange,
            &sample_opp(),
            None,
        ));
        let archived = w.flush().unwrap();
        assert!(sync.join("latest.json").is_file());
        assert!(archived.is_file());
        let pack: PulsePackV1 =
            serde_json::from_str(&fs::read_to_string(sync.join("latest.json")).unwrap()).unwrap();
        assert_eq!(pack.traces.len(), 1);
        clear_test_paths();
    }

    #[test]
    fn import_pack_upserts_pulse_db() {
        let dir = TempDir::new().unwrap();
        let sync = dir.path().join("pulse");
        let db = dir.path().join("pulse.sqlite");
        set_test_paths(sync, Some(db.clone()));
        let mut w = PulseWriter::open();
        w.admit(tick_from_opportunity(
            HuntTickKind::Prep,
            &sample_opp(),
            None,
        ));
        let pack_path = w.flush().unwrap();
        clear_test_paths();

        let n = import_pack_file(&pack_path, Some(db.clone())).unwrap();
        assert_eq!(n, 1);
        let conn = Connection::open(&db).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM memory_traces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn sanitize_strips_xai_prefix() {
        let out = sanitize_snippet("model xai-grok-2 key leaked");
        assert!(!out.contains("grok-2"));
        assert!(out.contains("xai-[REDACTED]"));
    }
}

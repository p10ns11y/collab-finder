//! SQLite audit store: searches, hits, leads (dedup), pauses, events. Best-effort; disabled on init failure.

use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::app_dirs::app_data_dir;
use crate::x_search::{tweet_snippet, XTweet}; // reuse for consistency with reactor / commands

pub const DB_FILE: &str = "collab-finder.db";
pub const SCHEMA_VERSION: i32 = 8;

/// High-level filter for leads queries (used by UI dashboard + future MCP).
#[derive(Debug, Default, Clone)]
pub struct LeadFilter {
    pub min_score: Option<i32>,
    pub status: Option<String>,
    pub q: Option<String>,     // simple LIKE on decision or notes; FTS separate
    pub since: Option<String>, // ISO ts
    pub limit: Option<u32>,
}

/// Filter for events.
#[derive(Debug, Default, Clone)]
pub struct EventFilter {
    pub event_type: Option<String>,
    pub since: Option<String>,
    pub correlation_id: Option<String>,
    pub limit: Option<u32>,
}

/// Simple filter for opportunities (web/paste targets).
#[derive(Debug, Default, Clone)]
pub struct OpportunityFilter {
    pub id: Option<i64>,
    pub status: Option<String>,
    pub min_fit: Option<i32>,
    pub q: Option<String>,
    pub limit: Option<u32>,
}

/// Stats for the history dashboard (neat summary, no full scan).
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DashboardStats {
    pub total_searches: i64,
    pub total_unique_leads: i64,
    pub total_surfaces: i64, // sum seen_count or count hits
    pub total_pauses: i64,
    pub avg_score: Option<f64>,
    pub top_queries: Vec<String>,
    pub most_reseen: Option<(String, i64)>, // tweet snippet or id + count
}

/// Serializable row types (returned over Tauri; match TS).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchRun {
    pub id: i64,
    pub ts: String,
    pub query: String,
    pub source: String,
    pub max_results: Option<i32>,
    pub num_results: i64,
    pub rate_remaining: Option<u32>,
    pub rate_limit: Option<u32>,
    pub cost_incurred: i64,
    pub duration_ms: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchRunWithTweets {
    pub run: SearchRun,
    pub tweets: Vec<XTweet>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Lead {
    pub id: i64,
    pub tweet_id: String,
    pub first_seen: String,
    pub seen_count: i64,
    pub score: Option<i32>,
    pub action: Option<String>,
    pub decision_json: Option<String>,
    pub status: String,
    pub prep_artifacts_json: Option<String>,
    pub last_updated: String,
    pub notes: Option<String>,
    // Enriched (optional, joined in some queries)
    pub tweet_text: Option<String>,
    pub tweet_created_at: Option<String>,
}

/// Generalized target for web/pasted opportunity descriptions (and future x-post enrichment).
/// Mirrors the TS Opportunity type.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Opportunity {
    pub id: i64,
    pub kind: String, // "web" | "paste" | "x-post"
    pub source_url: Option<String>,
    pub source_ref: Option<String>,
    pub title: Option<String>,
    pub company: Option<String>,
    pub jd_text: String,
    pub status: String,
    pub fit_score: Option<i32>,
    pub analysis_json: Option<String>,
    pub prep_artifacts_json: Option<String>,
    pub last_updated: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pause {
    pub id: i64,
    pub ts: String,
    pub reason: String,
    pub guard_type: Option<String>,
    pub lead_id: Option<i64>,
    pub search_run_id: Option<i64>,
    pub details_json: Option<String>,
    pub resolved_at: Option<String>,
    pub resolution: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: i64,
    pub ts: String,
    pub event_type: String,
    pub payload_json: Option<String>,
    pub correlation_id: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestTurnRow {
    pub role: String,
    pub text: String,
    pub ts: String,
    pub backend: Option<String>,
    pub prompt_chars: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestThread {
    pub session_id: String,
    pub kind: String,
    pub context_ids: String,
    pub last_opp_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub turns: Vec<QuestTurnRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestThreadSummary {
    pub session_id: String,
    pub kind: String,
    pub updated_at: String,
    pub preview: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuestTurnHit {
    pub session_id: String,
    pub role: String,
    pub text: String,
    pub ts: String,
}

pub struct SqliteStore {
    conn: Mutex<Connection>,
    enabled: bool,
}

impl SqliteStore {
    /// Production store under `app_data_dir()` / `collab-finder.db`. Never panics.
    pub fn new() -> Self {
        match app_data_dir()
            .map(|dir| dir.join(DB_FILE))
            .and_then(Self::open_at)
        {
            Ok(store) => store,
            Err(e) => {
                eprintln!("[db] init failed (history disabled, searches unaffected): {e}");
                Self::disabled()
            }
        }
    }

    /// Open (or create) a database at an explicit path — used in tests.
    pub fn open_at(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Self::open_connection(&db_path)?;
        eprintln!(
            "[db] opened {} (schema v{})",
            db_path.display(),
            SCHEMA_VERSION
        );
        Ok(Self {
            conn: Mutex::new(conn),
            enabled: true,
        })
    }

    pub(crate) fn disabled() -> Self {
        Self {
            conn: Mutex::new(
                Connection::open_in_memory().unwrap_or_else(|_| panic!("sqlite mem fallback")),
            ),
            enabled: false,
        }
    }

    fn open_connection(db_path: &PathBuf) -> Result<Connection, String> {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA cache_size = -16000;
             PRAGMA temp_store = MEMORY;",
        )
        .map_err(|e| e.to_string())?;
        Self::migrate(&conn)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(db_path, std::fs::Permissions::from_mode(0o600));
            if let Some(parent) = db_path.parent() {
                let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
            }
        }
        Ok(conn)
    }

    fn migrate(conn: &Connection) -> Result<(), String> {
        // Ensure migrations table.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        let current: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        if current < 1 {
            Self::migrate_v1(conn)?;
            Self::record_migration(conn, 1)?;
        }

        if current < 2 {
            Self::migrate_v2(conn)?;
            Self::record_migration(conn, 2)?;
        }

        if current < 3 {
            Self::migrate_v3(conn)?;
            Self::record_migration(conn, 3)?;
        }

        if current < 4 {
            Self::migrate_v4(conn)?;
            Self::record_migration(conn, 4)?;
        }

        if current < 5 {
            Self::migrate_v5(conn)?;
            Self::record_migration(conn, 5)?;
        }

        if current < 6 {
            Self::migrate_v6(conn)?;
            Self::record_migration(conn, 6)?;
        }

        if current < 7 {
            Self::migrate_v7(conn)?;
            Self::record_migration(conn, 7)?;
        }

        if current < 8 {
            Self::migrate_v8(conn)?;
            Self::record_migration(conn, 8)?;
        }

        Ok(())
    }

    fn record_migration(conn: &Connection, version: i32) -> Result<(), String> {
        conn.execute(
            "INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now'))",
            params![version],
        )
        .map_err(|e| e.to_string())?;
        eprintln!("[db] migrated to schema v{version}");
        Ok(())
    }

    /// v1 full schema. FTS5 indexes `text` (snippet-only after v2 migration).
    fn migrate_v1(conn: &Connection) -> Result<(), String> {
        let sql_v1 = r#"
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  author_id TEXT,
  created_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at);
CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author_id);

CREATE VIRTUAL TABLE IF NOT EXISTS tweets_fts USING fts5(
  text,
  content='tweets',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS tweets_ai AFTER INSERT ON tweets BEGIN
  INSERT INTO tweets_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS tweets_ad AFTER DELETE ON tweets BEGIN
  INSERT INTO tweets_fts(tweets_fts, rowid, text) VALUES('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS tweets_au AFTER UPDATE ON tweets BEGIN
  INSERT INTO tweets_fts(tweets_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO tweets_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE IF NOT EXISTS search_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  query TEXT NOT NULL,
  source TEXT NOT NULL,
  max_results INTEGER,
  num_results INTEGER DEFAULT 0,
  rate_remaining INTEGER,
  rate_limit INTEGER,
  cost_incurred INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_sr_ts ON search_runs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_sr_query ON search_runs(query);

CREATE TABLE IF NOT EXISTS search_hits (
  search_run_id INTEGER NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  rank INTEGER,
  PRIMARY KEY(search_run_id, tweet_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE REFERENCES tweets(id) ON DELETE CASCADE,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  seen_count INTEGER NOT NULL DEFAULT 1,
  score INTEGER,
  action TEXT,
  decision_json TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  prep_artifacts_json TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_seen ON leads(first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tweet ON leads(tweet_id);
CREATE INDEX IF NOT EXISTS idx_leads_seen_count ON leads(seen_count DESC);

CREATE TABLE IF NOT EXISTS pauses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT NOT NULL,
  guard_type TEXT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  search_run_id INTEGER REFERENCES search_runs(id) ON DELETE SET NULL,
  details_json TEXT,
  resolved_at TEXT,
  resolution TEXT
);
CREATE INDEX IF NOT EXISTS idx_pauses_ts ON pauses(ts DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  payload_json TEXT,
  correlation_id TEXT,
  source TEXT DEFAULT 'ui'
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_corr ON events(correlation_id);

CREATE TABLE IF NOT EXISTS rate_snapshots (
  ts TEXT PRIMARY KEY,
  remaining INTEGER,
  limit_val INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rate_ts ON rate_snapshots(ts DESC);
        "#;

        conn.execute_batch(sql_v1).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v2: truncate any legacy full post bodies to snippet length; rebuild FTS.
    fn migrate_v2(conn: &Connection) -> Result<(), String> {
        let max = crate::x_search::TWEET_SNIPPET_MAX_LEN as i32;
        conn.execute(
            "UPDATE tweets SET text = substr(text, 1, ?1) WHERE length(text) > ?1",
            params![max],
        )
        .map_err(|e| e.to_string())?;
        conn.execute_batch("INSERT INTO tweets_fts(tweets_fts) VALUES('rebuild');")
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v3: opportunities table for web/paste targets (additive, X leads untouched).
    /// kind: "web" | "paste" | "x-post"
    fn migrate_v3(conn: &Connection) -> Result<(), String> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'web',
  source_url TEXT,
  source_ref TEXT,
  title TEXT,
  company TEXT,
  jd_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  fit_score INTEGER,
  analysis_json TEXT,
  prep_artifacts_json TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_fit ON opportunities(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_kind ON opportunities(kind);
CREATE INDEX IF NOT EXISTS idx_opp_updated ON opportunities(last_updated DESC);
        "#;
        conn.execute_batch(sql).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v4 (data integrity foundation, TD-001): adds partial UNIQUE *index* on source_url (nullable via WHERE)
    /// (for enforcement + query speed) + dedup step; upsert_opportunity uses explicit tx lookup+UPDATE/INSERT
    /// (index alone does not enable ON CONFLICT(target) syntax in INSERT per SQLite rules; design allowed explicit form).
    /// Deduplicates any pre-existing duplicate rows (from repeated Greenhouse etc before this fix)
    /// by keeping the latest (max id) per source_url. Additive: optional content_hash column.
    /// See tech-debt-deep-dive TD-001 + Phase 0 acceptance.
    fn migrate_v4(conn: &Connection) -> Result<(), String> {
        // Dedup before adding unique index (otherwise CREATE UNIQUE fails on pre-existing dups).
        // Keep newest per url; null urls (pastes) untouched (multiple pastes intended).
        conn.execute(
            "DELETE FROM opportunities WHERE source_url IS NOT NULL AND id NOT IN (SELECT MAX(id) FROM opportunities WHERE source_url IS NOT NULL GROUP BY source_url)",
            [],
        )
        .map_err(|e| e.to_string())?;

        // ALTER ADD COLUMN is idempotent via ignore; IF NOT EXISTS on index is safe.
        let _ = conn.execute("ALTER TABLE opportunities ADD COLUMN content_hash TEXT", []);
        let sql = r#"
CREATE UNIQUE INDEX IF NOT EXISTS idx_opp_source_url ON opportunities(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opp_content_hash ON opportunities(content_hash);
        "#;
        conn.execute_batch(sql).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v5: personal network people (imported from gitignored CSVs) + import fingerprints.
    /// Speeds repeated Network screen loads; CSV remains the offline import source.
    fn migrate_v5(conn: &Connection) -> Result<(), String> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS network_people (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'linkedin_connection',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  connected_on TEXT,
  emails TEXT,
  phones TEXT,
  location_bucket TEXT,
  x_profile_json TEXT,
  linkedin_enrichment_json TEXT,
  collab_score REAL NOT NULL DEFAULT 0,
  categories_json TEXT NOT NULL DEFAULT '[]',
  score_reasons_json TEXT NOT NULL DEFAULT '[]',
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_network_people_score ON network_people(collab_score DESC);
CREATE INDEX IF NOT EXISTS idx_network_people_company ON network_people(company);
CREATE INDEX IF NOT EXISTS idx_network_people_source ON network_people(source);
CREATE INDEX IF NOT EXISTS idx_network_people_name ON network_people(full_name);

CREATE TABLE IF NOT EXISTS network_import_meta (
  source_kind TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
        "#;
        conn.execute_batch(sql).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v6: phones on network_people (from contacts export).
    fn migrate_v6(conn: &Connection) -> Result<(), String> {
        let _ = conn.execute("ALTER TABLE network_people ADD COLUMN phones TEXT", []);
        Ok(())
    }

    /// v7: unique (kind, source_ref) so Platsbanken ad ids cannot double-insert.
    fn migrate_v7(conn: &Connection) -> Result<(), String> {
        conn.execute(
            "DELETE FROM opportunities WHERE source_ref IS NOT NULL AND id NOT IN (
               SELECT MAX(id) FROM opportunities WHERE source_ref IS NOT NULL GROUP BY kind, source_ref
             )",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_opp_kind_source_ref
             ON opportunities(kind, source_ref) WHERE source_ref IS NOT NULL;",
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// v8: Quest threads + turns (local Grok drawer). Best-effort memory; not Grok session files.
    fn migrate_v8(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(
            r#"
CREATE TABLE IF NOT EXISTS quest_threads (
  session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'free',
  context_ids TEXT NOT NULL DEFAULT '["me"]',
  last_opp_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quest_threads_updated ON quest_threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS quest_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES quest_threads(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  backend TEXT,
  prompt_chars INTEGER
);
CREATE INDEX IF NOT EXISTS idx_quest_turns_session ON quest_turns(session_id, id);
            "#,
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn get_network_import_fingerprint(&self, source_kind: &str) -> Result<Option<String>, String> {
        if !self.is_enabled() {
            return Ok(None);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let fp: Option<String> = guard
            .query_row(
                "SELECT content_fingerprint FROM network_import_meta WHERE source_kind = ?1",
                params![source_kind],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(fp)
    }

    pub fn set_network_import_meta(
        &self,
        source_kind: &str,
        source_path: &str,
        fingerprint: &str,
        row_count: i64,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Err("database disabled".into());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "INSERT INTO network_import_meta (source_kind, source_path, content_fingerprint, row_count, imported_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))
                 ON CONFLICT(source_kind) DO UPDATE SET
                   source_path = excluded.source_path,
                   content_fingerprint = excluded.content_fingerprint,
                   row_count = excluded.row_count,
                   imported_at = datetime('now')",
                params![source_kind, source_path, fingerprint, row_count],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Replace all rows for a source kind, then upsert people (id is global PK).
    pub fn replace_network_people_for_source(
        &self,
        source: &str,
        people: &[crate::network_graph::NetworkPerson],
    ) -> Result<usize, String> {
        if !self.is_enabled() {
            return Err("database disabled".into());
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM network_people WHERE source = ?1",
            params![source],
        )
        .map_err(|e| e.to_string())?;
        let mut n = 0usize;
        for person in people {
            let x_json = person
                .x_profile
                .as_ref()
                .and_then(|x| serde_json::to_string(x).ok());
            let li_json = person
                .linkedin_enrichment
                .as_ref()
                .and_then(|x| serde_json::to_string(x).ok());
            let cats = serde_json::to_string(&person.categories).unwrap_or_else(|_| "[]".into());
            let reasons =
                serde_json::to_string(&person.score_reasons).unwrap_or_else(|_| "[]".into());
            tx.execute(
                "INSERT INTO network_people (
                    id, source, first_name, last_name, full_name, company, position,
                    linkedin_url, connected_on, emails, phones, location_bucket,
                    x_profile_json, linkedin_enrichment_json,
                    collab_score, categories_json, score_reasons_json, updated_at
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                    source=excluded.source,
                    first_name=excluded.first_name,
                    last_name=excluded.last_name,
                    full_name=excluded.full_name,
                    company=excluded.company,
                    position=excluded.position,
                    linkedin_url=excluded.linkedin_url,
                    connected_on=excluded.connected_on,
                    emails=COALESCE(excluded.emails, network_people.emails),
                    phones=COALESCE(excluded.phones, network_people.phones),
                    location_bucket=COALESCE(excluded.location_bucket, network_people.location_bucket),
                    x_profile_json=COALESCE(excluded.x_profile_json, network_people.x_profile_json),
                    linkedin_enrichment_json=COALESCE(excluded.linkedin_enrichment_json, network_people.linkedin_enrichment_json),
                    collab_score=excluded.collab_score,
                    categories_json=excluded.categories_json,
                    score_reasons_json=excluded.score_reasons_json,
                    updated_at=datetime('now')",
                params![
                    person.id,
                    person.source,
                    person.first_name,
                    person.last_name,
                    person.full_name,
                    person.company,
                    person.position,
                    person.linkedin_url,
                    person.connected_on,
                    person.emails,
                    person.phones,
                    person.location_bucket,
                    x_json,
                    li_json,
                    person.collab_score,
                    cats,
                    reasons,
                ],
            )
            .map_err(|e| e.to_string())?;
            n += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n)
    }

    pub fn upsert_network_people_scores(
        &self,
        people: &[crate::network_graph::NetworkPerson],
    ) -> Result<usize, String> {
        if !self.is_enabled() {
            return Err("database disabled".into());
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;
        let mut n = 0usize;
        for person in people {
            let x_json = person
                .x_profile
                .as_ref()
                .and_then(|x| serde_json::to_string(x).ok());
            let li_json = person
                .linkedin_enrichment
                .as_ref()
                .and_then(|x| serde_json::to_string(x).ok());
            let cats = serde_json::to_string(&person.categories).unwrap_or_else(|_| "[]".into());
            let reasons =
                serde_json::to_string(&person.score_reasons).unwrap_or_else(|_| "[]".into());
            let changed = tx
                .execute(
                    "UPDATE network_people SET
                        emails = COALESCE(?2, emails),
                        phones = COALESCE(?3, phones),
                        location_bucket = ?4,
                        x_profile_json = COALESCE(?5, x_profile_json),
                        linkedin_enrichment_json = COALESCE(?6, linkedin_enrichment_json),
                        collab_score = ?7,
                        categories_json = ?8,
                        score_reasons_json = ?9,
                        updated_at = datetime('now')
                     WHERE id = ?1",
                    params![
                        person.id,
                        person.emails,
                        person.phones,
                        person.location_bucket,
                        x_json,
                        li_json,
                        person.collab_score,
                        cats,
                        reasons,
                    ],
                )
                .map_err(|e| e.to_string())?;
            n += changed as usize;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(n)
    }

    pub fn list_network_people(&self) -> Result<Vec<crate::network_graph::NetworkPerson>, String> {
        if !self.is_enabled() {
            return Ok(Vec::new());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = guard
            .prepare(
                "SELECT id, source, first_name, last_name, full_name, company, position,
                        linkedin_url, connected_on, emails, phones, location_bucket,
                        x_profile_json, linkedin_enrichment_json,
                        collab_score, categories_json, score_reasons_json
                 FROM network_people
                 ORDER BY collab_score DESC, full_name ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                let x_profile_json: Option<String> = r.get(12)?;
                let li_json: Option<String> = r.get(13)?;
                let cats_json: String = r.get(15)?;
                let reasons_json: String = r.get(16)?;
                Ok(crate::network_graph::NetworkPerson {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    first_name: r.get(2)?,
                    last_name: r.get(3)?,
                    full_name: r.get(4)?,
                    company: r.get(5)?,
                    position: r.get(6)?,
                    linkedin_url: r.get(7)?,
                    connected_on: r.get(8)?,
                    emails: r.get(9)?,
                    phones: r.get(10)?,
                    location_bucket: r.get(11)?,
                    x_profile: x_profile_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok()),
                    linkedin_enrichment: li_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok()),
                    collab_score: r.get(14)?,
                    categories: serde_json::from_str(&cats_json).unwrap_or_default(),
                    score_reasons: serde_json::from_str(&reasons_json).unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn network_people_count(&self) -> Result<usize, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let n: i64 = guard
            .query_row("SELECT COUNT(*) FROM network_people", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        Ok(n as usize)
    }

    /// Best effort persist. Never errors the caller.
    #[allow(clippy::too_many_arguments)]
    pub fn record_search_run(
        &self,
        query: &str,
        source: &str,
        max_results: Option<i32>,
        rate_remaining: Option<u32>,
        rate_limit: Option<u32>,
        cost_incurred: i64,
        duration_ms: Option<i64>,
        error: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO search_runs (query, source, max_results, rate_remaining, rate_limit, cost_incurred, duration_ms, error, num_results)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
            params![
                query,
                source,
                max_results,
                rate_remaining,
                rate_limit,
                cost_incurred,
                duration_ms,
                error
            ],
        )
        .map_err(|e| e.to_string())?;

        let id: i64 = tx.last_insert_rowid();
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Record (or ignore dups) tweets + hits for a run. Idempotent on tweet id.
    pub fn record_search_hits(
        &self,
        run_id: i64,
        tweets: &[XTweet],
        rank_start: i32,
    ) -> Result<(), String> {
        if !self.is_enabled() || run_id == 0 {
            return Ok(());
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;

        let mut num = 0i64;
        for (i, t) in tweets.iter().enumerate() {
            // Dedup tweets by PK (X id). Persist snippet only — full text via hydrate_tweet.
            let snippet = tweet_snippet(&t.text);
            tx.execute(
                "INSERT OR IGNORE INTO tweets (id, text, author_id, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![t.id, snippet, t.author_id, t.created_at],
            )
            .map_err(|e| e.to_string())?;

            // Link to this run (may re-link same tweet across runs — that's correct for history).
            tx.execute(
                "INSERT OR IGNORE INTO search_hits (search_run_id, tweet_id, rank) VALUES (?1, ?2, ?3)",
                params![run_id, t.id, rank_start + i as i32],
            )
            .map_err(|e| e.to_string())?;
            num += 1;
        }

        // Update count on run.
        tx.execute(
            "UPDATE search_runs SET num_results = ?1 WHERE id = ?2",
            params![num, run_id],
        )
        .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Upsert lead with duplicate removal: increment seen_count on re-encounter of tweet_id.
    /// This is the core of the "duplicate result removal strategy".
    pub fn upsert_lead(
        &self,
        tweet_id: &str,
        score: Option<i32>,
        action: Option<&str>,
        decision_json: Option<&str>,
        status: &str,
        prep_artifacts_json: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;

        // Ensure tweet row exists (defensive; usually from hits).
        // (text may be empty here; update later if needed via join from tweets).
        tx.execute(
            "INSERT OR IGNORE INTO tweets (id, text) VALUES (?1, '')",
            params![tweet_id],
        )
        .map_err(|e| e.to_string())?;

        // Upsert lead: on conflict (tweet_id) bump seen + update timestamps/fields.
        tx.execute(
            "INSERT INTO leads (tweet_id, score, action, decision_json, status, prep_artifacts_json, seen_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
             ON CONFLICT(tweet_id) DO UPDATE SET
               last_updated = datetime('now'),
               seen_count = seen_count + 1,
               score = COALESCE(excluded.score, leads.score),
               action = COALESCE(excluded.action, leads.action),
               decision_json = COALESCE(excluded.decision_json, leads.decision_json),
               status = excluded.status,
               prep_artifacts_json = COALESCE(excluded.prep_artifacts_json, leads.prep_artifacts_json)",
            params![
                tweet_id,
                score,
                action,
                decision_json,
                status,
                prep_artifacts_json
            ],
        )
        .map_err(|e| e.to_string())?;

        let lead_id: i64 = tx
            .query_row(
                "SELECT id FROM leads WHERE tweet_id = ?1",
                params![tweet_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        Ok(lead_id)
    }

    /// Record a guard pause/intervention (wired from finder_reactor guard triggers for TD-003).
    /// get_recent_pauses + stats.total_pauses now real (no more empty in prod use).
    pub fn record_pause(
        &self,
        reason: &str,
        guard_type: Option<&str>,
        lead_id: Option<i64>,
        search_run_id: Option<i64>,
        details_json: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "INSERT INTO pauses (reason, guard_type, lead_id, search_run_id, details_json)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![reason, guard_type, lead_id, search_run_id, details_json],
            )
            .map_err(|e| e.to_string())?;
        Ok(guard.last_insert_rowid())
    }

    pub fn record_event(
        &self,
        event_type: &str,
        payload_json: Option<&str>,
        correlation_id: Option<&str>,
        source: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "INSERT INTO events (event_type, payload_json, correlation_id, source)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    event_type,
                    payload_json,
                    correlation_id,
                    source.unwrap_or("ui")
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(guard.last_insert_rowid())
    }

    pub fn persist_quest_turn(
        &self,
        session_id: &str,
        kind: &str,
        context_ids: &str,
        last_opp_id: Option<i64>,
        role: &str,
        text: &str,
        backend: Option<&str>,
        prompt_chars: Option<i64>,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }
        if session_id.trim().is_empty() || text.trim().is_empty() {
            return Ok(());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "INSERT INTO quest_threads (session_id, kind, context_ids, last_opp_id)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(session_id) DO UPDATE SET
                   kind = excluded.kind,
                   context_ids = excluded.context_ids,
                   last_opp_id = COALESCE(excluded.last_opp_id, quest_threads.last_opp_id),
                   updated_at = datetime('now')",
                params![session_id, kind, context_ids, last_opp_id],
            )
            .map_err(|e| e.to_string())?;
        guard
            .execute(
                "INSERT INTO quest_turns (session_id, role, text, backend, prompt_chars)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![session_id, role, text, backend, prompt_chars],
            )
            .map_err(|e| e.to_string())?;
        let _ = guard.execute(
            "INSERT INTO events (event_type, payload_json, correlation_id, source)
             VALUES ('quest.turn', ?1, ?2, 'quest')",
            params![
                format!("{{\"role\":\"{}\",\"kind\":\"{}\"}}", role, kind),
                session_id
            ],
        );
        Ok(())
    }

    pub fn get_latest_quest_thread(&self) -> Result<Option<QuestThread>, String> {
        if !self.is_enabled() {
            return Ok(None);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let row = guard
            .query_row(
                "SELECT session_id, kind, context_ids, last_opp_id, created_at, updated_at
                 FROM quest_threads ORDER BY updated_at DESC LIMIT 1",
                [],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((session_id, kind, context_ids, last_opp_id, created_at, updated_at)) = row else {
            return Ok(None);
        };
        let mut stmt = guard
            .prepare(
                "SELECT role, text, ts, backend, prompt_chars FROM quest_turns
                 WHERE session_id = ?1 ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;
        let turns = stmt
            .query_map(params![session_id], |r| {
                Ok(QuestTurnRow {
                    role: r.get(0)?,
                    text: r.get(1)?,
                    ts: r.get(2)?,
                    backend: r.get(3)?,
                    prompt_chars: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(Some(QuestThread {
            session_id,
            kind,
            context_ids,
            last_opp_id,
            created_at,
            updated_at,
            turns,
        }))
    }

    pub fn get_quest_thread(&self, session_id: &str) -> Result<Option<QuestThread>, String> {
        if !self.is_enabled() {
            return Ok(None);
        }
        let latest = self.get_latest_quest_thread()?;
        if latest
            .as_ref()
            .map(|t| t.session_id == session_id)
            .unwrap_or(false)
        {
            return Ok(latest);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        self.read_quest_thread(&guard, session_id)
    }

    fn read_quest_thread(
        &self,
        guard: &Connection,
        session_id: &str,
    ) -> Result<Option<QuestThread>, String> {
        let row = guard
            .query_row(
                "SELECT session_id, kind, context_ids, last_opp_id, created_at, updated_at
                 FROM quest_threads WHERE session_id = ?1",
                params![session_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((session_id, kind, context_ids, last_opp_id, created_at, updated_at)) = row else {
            return Ok(None);
        };
        let mut stmt = guard
            .prepare(
                "SELECT role, text, ts, backend, prompt_chars FROM quest_turns
                 WHERE session_id = ?1 ORDER BY id ASC",
            )
            .map_err(|e| e.to_string())?;
        let turns = stmt
            .query_map(params![session_id], |r| {
                Ok(QuestTurnRow {
                    role: r.get(0)?,
                    text: r.get(1)?,
                    ts: r.get(2)?,
                    backend: r.get(3)?,
                    prompt_chars: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(Some(QuestThread {
            session_id,
            kind,
            context_ids,
            last_opp_id,
            created_at,
            updated_at,
            turns,
        }))
    }

    pub fn list_quest_threads(&self, limit: u32) -> Result<Vec<QuestThreadSummary>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let lim = limit.clamp(1, 50);
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = guard
            .prepare(
                "SELECT t.session_id, t.kind, t.updated_at,
                    (SELECT substr(text, 1, 80) FROM quest_turns
                     WHERE session_id = t.session_id AND role = 'user' ORDER BY id ASC LIMIT 1)
                 FROM quest_threads t
                 ORDER BY t.updated_at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(QuestThreadSummary {
                    session_id: r.get(0)?,
                    kind: r.get(1)?,
                    updated_at: r.get(2)?,
                    preview: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }

    pub fn search_quest_turns(&self, q: &str, limit: u32) -> Result<Vec<QuestTurnHit>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let needle = q.trim();
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let lim = limit.clamp(1, 50);
        let like = format!("%{needle}%");
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = guard
            .prepare(
                "SELECT session_id, role, text, ts FROM quest_turns
                 WHERE text LIKE ?1 ESCAPE '\\' ORDER BY ts DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![like, lim], |r| {
                Ok(QuestTurnHit {
                    session_id: r.get(0)?,
                    role: r.get(1)?,
                    text: r.get(2)?,
                    ts: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }

    pub fn record_rate_snapshot(
        &self,
        remaining: Option<i32>,
        limit_val: Option<i32>,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }
        if let (Some(r), Some(l)) = (remaining, limit_val) {
            let guard = self.conn.lock().map_err(|e| e.to_string())?;
            // ts as PK (second precision is fine).
            let ts = chrono_like_now(); // simple, avoid extra dep
            let _ = guard.execute(
                "INSERT OR REPLACE INTO rate_snapshots (ts, remaining, limit_val) VALUES (?1, ?2, ?3)",
                params![ts, r, l],
            );
        }
        Ok(())
    }

    // --- Query APIs (always LIMITed) ---

    pub fn get_recent_searches(&self, limit: u32) -> Result<Vec<SearchRun>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = limit.clamp(1, 500) as i64;
        let mut stmt = guard
            .prepare(
                "SELECT id, ts, query, source, max_results, num_results, rate_remaining, rate_limit, cost_incurred, duration_ms, error
                 FROM search_runs ORDER BY ts DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(SearchRun {
                    id: r.get(0)?,
                    ts: r.get(1)?,
                    query: r.get(2)?,
                    source: r.get(3)?,
                    max_results: r.get(4)?,
                    num_results: r.get(5)?,
                    rate_remaining: r.get(6)?,
                    rate_limit: r.get(7)?,
                    cost_incurred: r.get(8)?,
                    duration_ms: r.get(9)?,
                    error: r.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_search_run(&self, id: i64) -> Result<Option<SearchRunWithTweets>, String> {
        if !self.is_enabled() {
            return Ok(None);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;

        let run: Option<SearchRun> = guard
            .query_row(
                "SELECT id, ts, query, source, max_results, num_results, rate_remaining, rate_limit, cost_incurred, duration_ms, error
                 FROM search_runs WHERE id = ?1",
                params![id],
                |r| {
                    Ok(SearchRun {
                        id: r.get(0)?,
                        ts: r.get(1)?,
                        query: r.get(2)?,
                        source: r.get(3)?,
                        max_results: r.get(4)?,
                        num_results: r.get(5)?,
                        rate_remaining: r.get(6)?,
                        rate_limit: r.get(7)?,
                        cost_incurred: r.get(8)?,
                        duration_ms: r.get(9)?,
                        error: r.get(10)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some(run) = run else {
            return Ok(None);
        };

        let mut stmt = guard
            .prepare(
                "SELECT t.id, t.text, t.author_id, t.created_at
                 FROM search_hits h JOIN tweets t ON h.tweet_id = t.id
                 WHERE h.search_run_id = ?1 ORDER BY h.rank ASC",
            )
            .map_err(|e| e.to_string())?;

        let tweets: Vec<XTweet> = stmt
            .query_map(params![id], |r| {
                Ok(XTweet {
                    id: r.get(0)?,
                    text: r.get(1)?,
                    author_id: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;

        Ok(Some(SearchRunWithTweets { run, tweets }))
    }

    pub fn get_leads(&self, filter: &LeadFilter) -> Result<Vec<Lead>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = filter.limit.unwrap_or(100).clamp(1, 500) as i64;

        let mut stmt = guard
            .prepare("SELECT l.id, l.tweet_id, l.first_seen, l.seen_count, l.score, l.action, l.decision_json, l.status, l.prep_artifacts_json, l.last_updated, l.notes, t.text, t.created_at
                      FROM leads l LEFT JOIN tweets t ON l.tweet_id = t.id
                      ORDER BY l.last_updated DESC, l.score DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(Lead {
                    id: r.get(0)?,
                    tweet_id: r.get(1)?,
                    first_seen: r.get(2)?,
                    seen_count: r.get(3)?,
                    score: r.get(4)?,
                    action: r.get(5)?,
                    decision_json: r.get(6)?,
                    status: r.get(7)?,
                    prep_artifacts_json: r.get(8)?,
                    last_updated: r.get(9)?,
                    notes: r.get(10)?,
                    tweet_text: r.get(11)?,
                    tweet_created_at: r.get(12)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut out = rows
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;

        // Post-filter for min_score etc (small data, fine; keeps SQL simple & correct).
        if let Some(min) = filter.min_score {
            out.retain(|l| l.score.unwrap_or(0) >= min);
        }
        if let Some(ref st) = filter.status {
            out.retain(|l| &l.status == st);
        }
        if let Some(ref q) = filter.q {
            let ql = q.to_lowercase();
            out.retain(|l| {
                l.tweet_text
                    .as_ref()
                    .is_some_and(|t| t.to_lowercase().contains(&ql))
                    || l.decision_json
                        .as_ref()
                        .is_some_and(|d| d.to_lowercase().contains(&ql))
                    || l.notes
                        .as_ref()
                        .is_some_and(|n| n.to_lowercase().contains(&ql))
            });
        }

        Ok(out)
    }

    pub fn search_tweets_fts(&self, fts_query: &str, limit: u32) -> Result<Vec<XTweet>, String> {
        if !self.is_enabled() || fts_query.trim().is_empty() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = limit.clamp(1, 200) as i64;

        // FTS MATCH (user provides terms; we trust dashboard to sanitize lightly).
        let mut stmt = guard
            .prepare(
                "SELECT t.id, t.text, t.author_id, t.created_at
                 FROM tweets_fts f JOIN tweets t ON f.rowid = t.rowid
                 WHERE tweets_fts MATCH ?1
                 ORDER BY f.rank
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![fts_query, lim], |r| {
                Ok(XTweet {
                    id: r.get(0)?,
                    text: r.get(1)?,
                    author_id: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_dashboard_stats(&self) -> Result<DashboardStats, String> {
        if !self.is_enabled() {
            return Ok(DashboardStats::default());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;

        let total_searches: i64 = guard
            .query_row("SELECT COUNT(*) FROM search_runs", [], |r| r.get(0))
            .unwrap_or_else(|e| {
                eprintln!("[db] stats total_searches query failed (pre-existing; TD trust): {e}");
                0
            });

        let total_unique_leads: i64 = guard
            .query_row("SELECT COUNT(*) FROM leads", [], |r| r.get(0))
            .unwrap_or_else(|e| {
                eprintln!(
                    "[db] stats total_unique_leads query failed (pre-existing; TD trust): {e}"
                );
                0
            });

        let total_surfaces: i64 = guard
            .query_row("SELECT COALESCE(SUM(seen_count), 0) FROM leads", [], |r| {
                r.get(0)
            })
            .unwrap_or_else(|e| {
                eprintln!("[db] stats total_surfaces query failed (pre-existing; TD trust): {e}");
                0
            });

        let total_pauses: i64 = guard
            .query_row("SELECT COUNT(*) FROM pauses", [], |r| r.get(0))
            .unwrap_or_else(|e| {
                eprintln!("[db] stats total_pauses query failed (pre-existing; TD trust): {e}");
                0
            });

        // AVG returns SQL NULL when no scored leads — must decode as Option<f64>, not f64.
        let avg_score: Option<f64> = guard
            .query_row(
                "SELECT AVG(score) FROM leads WHERE score IS NOT NULL",
                [],
                |r| r.get::<_, Option<f64>>(0),
            )
            .unwrap_or_else(|e| {
                eprintln!("[db] stats avg_score query failed: {e}");
                None
            });

        // Top queries (simple, last 50 runs).
        let mut top = vec![];
        {
            let s = guard
                .prepare("SELECT query FROM search_runs ORDER BY ts DESC LIMIT 50")
                .ok();
            if let Some(mut stmt) = s {
                let r = stmt.query_map([], |r| r.get::<_, String>(0)).ok();
                if let Some(rr) = r {
                    let mut counts = std::collections::HashMap::new();
                    for q in rr.flatten() {
                        *counts.entry(q).or_insert(0i64) += 1;
                    }
                    let mut v: Vec<_> = counts.into_iter().collect();
                    v.sort_by_key(|(_, c)| std::cmp::Reverse(*c));
                    top = v.into_iter().take(5).map(|(q, _)| q).collect();
                }
            }
        }

        // Most re-seen.
        let most_reseen: Option<(String, i64)> = guard
            .query_row(
                "SELECT tweet_id, seen_count FROM leads ORDER BY seen_count DESC, last_updated DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get(1)?)),
            )
            .map_err(|e| {
                eprintln!("[db] stats most_reseen query failed (pre-existing; TD trust): {e}");
                e
            })
            .ok();

        Ok(DashboardStats {
            total_searches,
            total_unique_leads,
            total_surfaces,
            total_pauses,
            avg_score,
            top_queries: top,
            most_reseen,
        })
    }

    /// Lightweight recent pauses for dashboard.
    pub fn get_recent_pauses(&self, limit: u32) -> Result<Vec<Pause>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = limit.clamp(1, 100) as i64;

        let mut stmt = guard
            .prepare(
                "SELECT id, ts, reason, guard_type, lead_id, search_run_id, details_json, resolved_at, resolution
                 FROM pauses ORDER BY ts DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(Pause {
                    id: r.get(0)?,
                    ts: r.get(1)?,
                    reason: r.get(2)?,
                    guard_type: r.get(3)?,
                    lead_id: r.get(4)?,
                    search_run_id: r.get(5)?,
                    details_json: r.get(6)?,
                    resolved_at: r.get(7)?,
                    resolution: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    /// Events for audit / timeline.
    pub fn get_events(&self, filter: &EventFilter) -> Result<Vec<Event>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = filter.limit.unwrap_or(50).clamp(1, 200) as i64;

        let mut stmt = guard
            .prepare("SELECT id, ts, event_type, payload_json, correlation_id, source FROM events ORDER BY ts DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(Event {
                    id: r.get(0)?,
                    ts: r.get(1)?,
                    event_type: r.get(2)?,
                    payload_json: r.get(3)?,
                    correlation_id: r.get(4)?,
                    source: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    // --- Opportunities (web/paste targets) ---

    pub fn get_opportunities(
        &self,
        filter: &OpportunityFilter,
    ) -> Result<Vec<Opportunity>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = filter.limit.unwrap_or(100).clamp(1, 500) as i64;

        // TD-002 fix: when filter.id is set, push WHERE id=? into SQL so that prep_target(opportunity_id: old)
        // and get by id work even when 50+ newer rows exist (N>50 newer per tech-debt-deep-dive:570-571).
        // Previously: always LIMIT recency then in-mem retain, which dropped old ids.
        let mut out: Vec<Opportunity> = if filter.id.is_some() {
            let idv = filter.id.unwrap();
            let mut stmt = guard
                .prepare(
                    "SELECT id, kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, last_updated, notes
                      FROM opportunities
                      WHERE id = ?1
                      ORDER BY last_updated DESC, fit_score DESC LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![idv, lim], |r| {
                    Ok(Opportunity {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        source_url: r.get(2)?,
                        source_ref: r.get(3)?,
                        title: r.get(4)?,
                        company: r.get(5)?,
                        jd_text: r.get(6)?,
                        status: r.get(7)?,
                        fit_score: r.get(8)?,
                        analysis_json: r.get(9)?,
                        prep_artifacts_json: r.get(10)?,
                        last_updated: r.get(11)?,
                        notes: r.get(12)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<SqliteResult<Vec<_>>>()
                .map_err(|e| e.to_string())?
        } else {
            let mut stmt = guard
                .prepare(
                    "SELECT id, kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, last_updated, notes
                      FROM opportunities
                      ORDER BY last_updated DESC, fit_score DESC LIMIT ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![lim], |r| {
                    Ok(Opportunity {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        source_url: r.get(2)?,
                        source_ref: r.get(3)?,
                        title: r.get(4)?,
                        company: r.get(5)?,
                        jd_text: r.get(6)?,
                        status: r.get(7)?,
                        fit_score: r.get(8)?,
                        analysis_json: r.get(9)?,
                        prep_artifacts_json: r.get(10)?,
                        last_updated: r.get(11)?,
                        notes: r.get(12)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<SqliteResult<Vec<_>>>()
                .map_err(|e| e.to_string())?
        };

        if let Some(id) = filter.id {
            out.retain(|o| o.id == id);
        }
        if let Some(min) = filter.min_fit {
            out.retain(|o| o.fit_score.unwrap_or(0) >= min);
        }
        if let Some(ref st) = filter.status {
            out.retain(|o| &o.status == st);
        }
        if let Some(ref qq) = filter.q {
            let ql: String = qq.to_lowercase();
            out.retain(|o| {
                o.title
                    .as_ref()
                    .is_some_and(|t| t.to_lowercase().contains(&ql))
                    || o.company
                        .as_ref()
                        .is_some_and(|c| c.to_lowercase().contains(&ql))
                    || o.jd_text.to_lowercase().contains(&ql)
                    || o.analysis_json
                        .as_ref()
                        .is_some_and(|a| a.to_lowercase().contains(&ql))
            });
        }

        Ok(out)
    }

    /// Insert or update an opportunity. Returns the id.
    /// TD-001 fix: uses explicit lookup+UPDATE or INSERT (with tx) + the v4 partial UNIQUE index on source_url.
    /// This makes re-analyze of same URL UPDATE the 1 existing row (ON CONFLICT(target) syntax not usable with index-only).
    /// Replaces previous heuristic post-select. For source_url=NULL always inserts (no dedup intended).
    /// The index still enforces no dups + was created after deduping legacy data.
    /// Per tech-debt-deep-dive TD-001 + Phase 0 acceptance + design "or explicit UPDATE ... WHERE source_url = ?".
    pub fn upsert_opportunity(
        &self,
        kind: &str,
        source_url: Option<&str>,
        source_ref: Option<&str>,
        title: Option<&str>,
        company: Option<&str>,
        jd_text: &str,
        status: &str,
        fit_score: Option<i32>,
        analysis_json: Option<&str>,
        prep_artifacts_json: Option<&str>,
        notes: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;

        let id: i64 = if source_url.is_none() && source_ref.is_none() {
            // paste etc: always new row
            tx.execute(
                "INSERT INTO opportunities (kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, notes
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        } else if let Some(existing) = Self::find_opportunity_id(&tx, source_url, source_ref, kind)? {
            tx.execute(
                "UPDATE opportunities SET last_updated = datetime('now'), status = ?1, fit_score = COALESCE(?2, fit_score), analysis_json = COALESCE(?3, analysis_json), prep_artifacts_json = COALESCE(?4, prep_artifacts_json), notes = COALESCE(?5, notes) WHERE id = ?6",
                params![status, fit_score, analysis_json, prep_artifacts_json, notes, existing],
            )
            .map_err(|e| e.to_string())?;
            existing
        } else {
            tx.execute(
                "INSERT INTO opportunities (kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, notes
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.last_insert_rowid()
        };

        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    }

    fn find_opportunity_id(
        tx: &rusqlite::Transaction<'_>,
        source_url: Option<&str>,
        source_ref: Option<&str>,
        kind: &str,
    ) -> Result<Option<i64>, String> {
        if let Some(u) = source_url {
            if let Some(id) = tx
                .query_row(
                    "SELECT id FROM opportunities WHERE source_url = ?1",
                    params![u],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
            {
                return Ok(Some(id));
            }
        }
        if let Some(r) = source_ref.filter(|s| !s.is_empty()) {
            if let Some(id) = tx
                .query_row(
                    "SELECT id FROM opportunities WHERE kind = ?1 AND source_ref = ?2",
                    params![kind, r],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
            {
                return Ok(Some(id));
            }
        }
        Ok(None)
    }

    /// Insert hunt hit if new. Existing row (url or kind+ad id) is left intact — no status reset.
    pub fn remember_opportunity(
        &self,
        kind: &str,
        source_url: Option<&str>,
        source_ref: Option<&str>,
        title: Option<&str>,
        company: Option<&str>,
        jd_text: &str,
        notes: Option<&str>,
    ) -> Result<i64, String> {
        if !self.is_enabled() {
            return Ok(0);
        }
        let mut guard = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = guard.transaction().map_err(|e| e.to_string())?;
        if let Some(existing) = Self::find_opportunity_id(&tx, source_url, source_ref, kind)? {
            tx.execute(
                "UPDATE opportunities SET last_updated = datetime('now'),
                   source_ref = COALESCE(source_ref, ?1),
                   title = COALESCE(title, ?2),
                   company = COALESCE(company, ?3)
                 WHERE id = ?4",
                params![source_ref, title, company, existing],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            return Ok(existing);
        }
        tx.execute(
            "INSERT INTO opportunities (kind, source_url, source_ref, title, company, jd_text, status, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'new', ?7)",
            params![kind, source_url, source_ref, title, company, jd_text, notes],
        )
        .map_err(|e| e.to_string())?;
        let id = tx.last_insert_rowid();
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn delete_opportunity(&self, id: i64) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute("DELETE FROM opportunities WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_opportunity_status(
        &self,
        id: i64,
        status: &str,
        notes: Option<&str>,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "UPDATE opportunities SET status = ?1, notes = COALESCE(?2, notes), last_updated = datetime('now') WHERE id = ?3",
                params![status, notes, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Set prep artifacts on an existing opportunity (used by prep_target to avoid creating duplicate rows).
    pub fn set_prep_artifacts(
        &self,
        id: i64,
        prep_artifacts_json: &str,
        status: &str,
    ) -> Result<(), String> {
        if !self.is_enabled() {
            return Ok(());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        guard
            .execute(
                "UPDATE opportunities SET prep_artifacts_json = ?1, status = ?2, last_updated = datetime('now') WHERE id = ?3",
                params![prep_artifacts_json, status, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

// Minimal now() without chrono dep (use sqlite or simple).
fn chrono_like_now() -> String {
    // Fallback: ask sqlite for current time (reliable).
    // But since we may not have conn here, use a simple RFC-ish.
    // In practice callers pass from headers or use time from run.
    // For rate ts we use a second-granularity string.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple sortable: unix seconds is fine, or format.
    format!("{}", now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_tweet(id: &str, text: &str) -> XTweet {
        XTweet {
            id: id.to_string(),
            text: text.to_string(),
            author_id: Some("u1".to_string()),
            created_at: Some("2026-06-01T00:00:00Z".to_string()),
        }
    }

    fn temp_store() -> (TempDir, SqliteStore) {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("test.db");
        let store = SqliteStore::open_at(path).expect("open_at");
        (dir, store)
    }

    #[test]
    fn disabled_store_is_noop() {
        let store = SqliteStore::disabled();
        assert_eq!(
            store
                .record_search_run("q", "manual", None, None, None, 0, None, None)
                .unwrap(),
            0
        );
        assert!(store.get_recent_searches(10).unwrap().is_empty());
        assert_eq!(store.get_dashboard_stats().unwrap().total_searches, 0);
    }

    #[test]
    fn migrate_is_idempotent() {
        let (_dir, store) = temp_store();
        let guard = store.conn.lock().unwrap();
        let v: i32 = guard
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
        drop(guard);
        let path = _dir.path().join("test.db");
        SqliteStore::open_at(path).expect("re-open");
    }

    #[test]
    fn persist_quest_turns_survive_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        {
            let store = SqliteStore::open_at(path.clone()).unwrap();
            store
                .persist_quest_turn(
                    "019ff6f8-bd49-7572-bf21-4e36443ae877",
                    "free",
                    r#"["me"]"#,
                    None,
                    "user",
                    "draft the email",
                    None,
                    None,
                )
                .unwrap();
            store
                .persist_quest_turn(
                    "019ff6f8-bd49-7572-bf21-4e36443ae877",
                    "free",
                    r#"["me"]"#,
                    None,
                    "assistant",
                    "Subject: hello",
                    Some("grok"),
                    Some(120),
                )
                .unwrap();
        }
        let store = SqliteStore::open_at(path).unwrap();
        let thread = store.get_latest_quest_thread().unwrap().expect("thread");
        assert_eq!(thread.kind, "free");
        assert_eq!(thread.turns.len(), 2);
        assert_eq!(thread.turns[0].role, "user");
        assert_eq!(thread.turns[1].text, "Subject: hello");
    }

    #[test]
    fn persist_quest_noop_when_disabled() {
        let store = SqliteStore::disabled();
        store
            .persist_quest_turn("x", "free", "[]", None, "user", "hi", None, None)
            .unwrap();
        assert!(store.get_latest_quest_thread().unwrap().is_none());
    }

    #[test]
    fn search_run_hits_and_fetch() {
        let (_dir, store) = temp_store();
        let tweets = vec![
            sample_tweet("1", "rust engineer hiring"),
            sample_tweet("2", "typescript react collab"),
        ];
        let run_id = store
            .record_search_run(
                "rust lang:en",
                "manual",
                Some(10),
                Some(100),
                Some(450),
                50,
                Some(12),
                None,
            )
            .unwrap();
        assert!(run_id > 0);
        store.record_search_hits(run_id, &tweets, 0).unwrap();

        let history = store.get_recent_searches(5).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].query, "rust lang:en");
        assert_eq!(history[0].num_results, 2);

        let detail = store.get_search_run(run_id).unwrap().expect("run");
        assert_eq!(detail.tweets.len(), 2);
        assert_eq!(detail.tweets[0].id, "1");
    }

    #[test]
    fn upsert_lead_increments_seen_count() {
        let (_dir, store) = temp_store();
        let id1 = store
            .upsert_lead("tw_99", Some(80), Some("prep"), None, "new", None)
            .unwrap();
        let id2 = store
            .upsert_lead("tw_99", Some(85), Some("prep"), None, "prepped", None)
            .unwrap();
        assert_eq!(id1, id2);
        let leads = store
            .get_leads(&LeadFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].seen_count, 2);
        assert_eq!(leads[0].status, "prepped");
    }

    #[test]
    fn record_pause_event_and_stats() {
        let (_dir, store) = temp_store();
        let run_id = store
            .record_search_run("q", "cycle", None, None, None, 0, None, None)
            .unwrap();
        let pause_id = store
            .record_pause("fit low", Some("FitThreshold"), None, Some(run_id), None)
            .unwrap();
        assert!(pause_id > 0);
        store
            .record_event(
                "CycleRequested",
                Some(r#"{"q":"x"}"#),
                Some("c1"),
                Some("ui"),
            )
            .unwrap();

        let stats = store.get_dashboard_stats().unwrap();
        assert_eq!(stats.total_searches, 1);
        assert_eq!(stats.total_pauses, 1);
        // No scored leads yet — AVG is SQL NULL; must not error (was Invalid column type Null).
        assert!(stats.avg_score.is_none());

        let pauses = store.get_recent_pauses(5).unwrap();
        assert_eq!(pauses[0].reason, "fit low");

        let events = store
            .get_events(&EventFilter {
                limit: Some(5),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(events[0].event_type, "CycleRequested");
    }

    #[test]
    fn record_search_hits_stores_snippet_not_full_text() {
        let (_dir, store) = temp_store();
        let run_id = store
            .record_search_run("q", "manual", None, None, None, 0, None, None)
            .unwrap();
        let long = "x".repeat(crate::x_search::TWEET_SNIPPET_MAX_LEN + 40);
        store
            .record_search_hits(run_id, &[sample_tweet("long1", &long)], 0)
            .unwrap();
        let detail = store.get_search_run(run_id).unwrap().unwrap();
        assert_eq!(
            detail.tweets[0].text.len(),
            crate::x_search::TWEET_SNIPPET_MAX_LEN
        );
    }

    #[test]
    fn fts_finds_indexed_tweet_text() {
        let (_dir, store) = temp_store();
        let run_id = store
            .record_search_run("fts q", "manual", None, None, None, 0, None, None)
            .unwrap();
        store
            .record_search_hits(
                run_id,
                &[sample_tweet("fts1", "unique zebra keyword collab")],
                0,
            )
            .unwrap();
        let hits = store.search_tweets_fts("zebra", 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "fts1");
    }

    #[test]
    fn lead_filter_min_score_and_status() {
        let (_dir, store) = temp_store();
        store
            .upsert_lead("a", Some(50), None, None, "paused", None)
            .unwrap();
        store
            .upsert_lead("b", Some(90), None, None, "prepped", None)
            .unwrap();
        let filtered = store
            .get_leads(&LeadFilter {
                min_score: Some(70),
                status: Some("prepped".to_string()),
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].tweet_id, "b");
    }

    #[test]
    fn get_search_run_missing_returns_none() {
        let (_dir, store) = temp_store();
        assert!(store.get_search_run(9999).unwrap().is_none());
    }

    #[test]
    fn record_hits_noop_when_run_id_zero() {
        let (_dir, store) = temp_store();
        store
            .record_search_hits(0, &[sample_tweet("x", "text")], 0)
            .unwrap();
        assert_eq!(store.get_recent_searches(5).unwrap().len(), 0);
    }

    #[test]
    fn record_rate_snapshot_and_empty_fts() {
        let (_dir, store) = temp_store();
        store.record_rate_snapshot(Some(10), Some(450)).unwrap();
        assert!(store.search_tweets_fts("", 5).unwrap().is_empty());
        assert!(store.search_tweets_fts("   ", 5).unwrap().is_empty());
    }

    #[test]
    fn lead_text_filter_via_q() {
        let (_dir, store) = temp_store();
        let run_id = store
            .record_search_run("q", "manual", None, None, None, 0, None, None)
            .unwrap();
        store
            .record_search_hits(run_id, &[sample_tweet("z1", "zebra stripe pattern")], 0)
            .unwrap();
        store
            .upsert_lead("z1", Some(80), None, None, "new", None)
            .unwrap();
        let hits = store
            .get_leads(&LeadFilter {
                q: Some("zebra".to_string()),
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn search_run_with_error_field() {
        let (_dir, store) = temp_store();
        let id = store
            .record_search_run("bad", "manual", None, None, None, 0, None, Some("401"))
            .unwrap();
        let run = store.get_search_run(id).unwrap().unwrap().run;
        assert_eq!(run.error.as_deref(), Some("401"));
    }

    // --- Opportunity data integrity tests (TD-001 + TD-002) ---
    // Per design PR1 + tech-debt-deep-dive Phase 0 acceptance:
    // - re-analyze same URL updates 1 row (count stable)
    // - prep-by-old-id (get by id) works when 50+ newer opps exist
    // - id filter correctness

    #[test]
    fn remember_platsbanken_ad_id_is_unique() {
        let (_dir, store) = temp_store();
        let url = Some("https://arbetsformedlingen.se/platsbanken/annonser/31192648");
        let id1 = store
            .remember_opportunity(
                "platsbanken",
                url,
                Some("31192648"),
                Some("Senior Fullstack"),
                Some("Anyfin"),
                "snippet",
                Some("search persist"),
            )
            .unwrap();
        let id2 = store
            .remember_opportunity(
                "platsbanken",
                url,
                Some("31192648"),
                Some("Senior Fullstack"),
                Some("Anyfin"),
                "other snippet",
                Some("search persist"),
            )
            .unwrap();
        assert_eq!(id1, id2);
        let via_ref = store
            .upsert_opportunity(
                "platsbanken",
                Some("https://other.example/31192648"),
                Some("31192648"),
                Some("Senior Fullstack"),
                Some("Anyfin"),
                "full jd",
                "new",
                None,
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(id1, via_ref, "same ad id must hit existing row even if url differs");
        store.delete_opportunity(id1).unwrap();
        let after = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert!(after.iter().all(|o| o.id != id1));
    }

    #[test]
    fn upsert_opportunity_same_url_updates_one_row() {
        let (_dir, store) = temp_store();
        let url = Some("https://boards.greenhouse.io/example/jobs/123");
        let id1 = store
            .upsert_opportunity(
                "web",
                url,
                None,
                Some("Software Engineer"),
                Some("Example Co"),
                "original jd text here",
                "analyzed",
                Some(75),
                Some(r#"{"overall":75}"#),
                None,
                None,
            )
            .unwrap();
        // Re-analyze same URL (e.g. re-fetch may have minor diff or same)
        let id2 = store
            .upsert_opportunity(
                "web",
                url,
                None,
                Some("Software Engineer"),
                Some("Example Co"),
                "updated jd text here", // passed but per upsert logic, jd kept from first (source content)
                "analyzed",
                Some(82),
                Some(r#"{"overall":82,"rationale":"improved"}"#),
                None,
                None,
            )
            .unwrap();
        assert_eq!(id1, id2, "same url must return same id and not create dup");

        let all = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            all.len(),
            1,
            "re-analyze same URL must keep count stable at 1"
        );
        let opp = &all[0];
        assert_eq!(opp.id, id1);
        assert_eq!(opp.fit_score, Some(82)); // updated
        assert_eq!(opp.jd_text, "original jd text here"); // source jd not overwritten on conflict (existing behavior)
        assert!(opp.analysis_json.as_ref().unwrap().contains("82"));
    }

    #[test]
    fn get_opportunity_by_old_id_with_many_newer_rows() {
        let (_dir, store) = temp_store();
        // Simulate old opportunity (e.g. from prior session)
        let old_id = store
            .upsert_opportunity(
                "web",
                Some("https://old.example.com/job"),
                None,
                Some("Old Role"),
                None,
                "old jd for prep target",
                "analyzed",
                Some(65),
                None,
                None,
                None,
            )
            .unwrap();

        // Insert 60 newer opportunities (N>50 as cited in reports)
        for i in 0..60 {
            let _ = store
                .upsert_opportunity(
                    "web",
                    Some(&format!("https://new{}.example.com/job", i)),
                    None,
                    None,
                    None,
                    &format!("newer jd {}", i),
                    "analyzed",
                    Some(50),
                    None,
                    None,
                    None,
                )
                .unwrap();
        }

        // Now simulate what prep_target does: load by old opportunity_id (with limit=1)
        let mut filter = OpportunityFilter::default();
        filter.id = Some(old_id);
        filter.limit = Some(1);
        let opps = store.get_opportunities(&filter).unwrap();
        assert_eq!(
            opps.len(),
            1,
            "id filter must return old row even with 60 newer"
        );
        assert_eq!(opps[0].id, old_id);
        assert_eq!(opps[0].jd_text, "old jd for prep target");

        // Also without explicit limit (still must work)
        let mut filter2 = OpportunityFilter::default();
        filter2.id = Some(old_id);
        let opps2 = store.get_opportunities(&filter2).unwrap();
        assert_eq!(opps2.len(), 1);
        assert_eq!(opps2[0].id, old_id);
    }

    #[test]
    fn get_opportunities_id_filter_correctness() {
        let (_dir, store) = temp_store();
        let id_a = store
            .upsert_opportunity(
                "web",
                Some("u/a"),
                None,
                Some("RoleA"),
                None,
                "jdA",
                "new",
                Some(90),
                None,
                None,
                None,
            )
            .unwrap();
        let _id_b = store
            .upsert_opportunity(
                "web",
                Some("u/b"),
                None,
                Some("RoleB"),
                None,
                "jdB",
                "new",
                Some(60),
                None,
                None,
                None,
            )
            .unwrap();

        let all = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(all.len(), 2);

        let just_a = store
            .get_opportunities(&OpportunityFilter {
                id: Some(id_a),
                limit: Some(5),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(just_a.len(), 1);
        assert_eq!(just_a[0].title.as_deref(), Some("RoleA"));
        assert_eq!(just_a[0].fit_score, Some(90));

        let missing = store
            .get_opportunities(&OpportunityFilter {
                id: Some(999999),
                ..Default::default()
            })
            .unwrap();
        assert!(missing.is_empty());
    }

    #[test]
    fn upsert_opportunity_null_url_creates_separate_rows() {
        // Pastes (no source_url) should not dedup; each is distinct.
        let (_dir, store) = temp_store();
        let id1 = store
            .upsert_opportunity(
                "paste",
                None,
                None,
                None,
                None,
                "paste one",
                "analyzed",
                None,
                None,
                None,
                None,
            )
            .unwrap();
        let id2 = store
            .upsert_opportunity(
                "paste",
                None,
                None,
                None,
                None,
                "paste two",
                "analyzed",
                None,
                None,
                None,
                None,
            )
            .unwrap();
        assert_ne!(id1, id2);
        let all = store
            .get_opportunities(&OpportunityFilter {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn upsert_opportunity_coalesce_preserves_values_on_none_reupsert() {
        // Addresses review feedback (Issue 3): exercise COALESCE in re-upsert when passing None for fit_score/analysis_json/prep_artifacts/notes
        // (only status + last_updated should change; priors preserved via COALESCE). Follows exact test patterns from sibling tests (e.g. same_url_updates_one_row).
        let (_dir, store) = temp_store();
        let url = Some("https://example.com/coalesce-test");
        let id1 = store
            .upsert_opportunity(
                "web",
                url,
                None,
                Some("T"),
                None,
                "jd",
                "analyzed",
                Some(70),
                Some(r#"{"a":1}"#),
                Some("prep1"),
                Some("note1"),
            )
            .unwrap();
        // Re-upsert same url, Nones for coalesced fields, different status
        let id2 = store
            .upsert_opportunity(
                "web",
                url,
                None,
                Some("T"),
                None,
                "jd",
                "prepped",
                None,
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(id1, id2);
        let opps = store
            .get_opportunities(&OpportunityFilter {
                id: Some(id1),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(opps.len(), 1);
        let o = &opps[0];
        assert_eq!(o.status, "prepped");
        assert_eq!(o.fit_score, Some(70)); // COALESCE preserved
        assert!(o.analysis_json.as_ref().unwrap().contains("a\":1"));
        assert_eq!(o.prep_artifacts_json.as_deref(), Some("prep1"));
        assert_eq!(o.notes.as_deref(), Some("note1"));
    }

    #[test]
    fn upsert_and_get_opportunity_roundtrips_cv_packet_metadata_in_analysis_json() {
        // Verifies AC1 / checklist item 1: analysis_json now embeds cv meta from analyze so restore can reconstruct non-zero cv_*.
        let (_dir, store) = temp_store();
        let url = Some("https://boards.greenhouse.io/xai/jobs/42");
        let analysis_with_cv = r#"{"fit":{"overall":82,"rationale":"strong","gaps_must":[],"recommended_action":"apply"},"packet_preview":"CV...","packet_preview_truncated":false,"cv_chars_sent":1234,"cv_ipc_chars":1200,"cv_used_fallback":false,"prompt_tokens":500,"completion_tokens":120,"est_cost_usd":0.012}"#;
        let id = store
            .upsert_opportunity(
                "web",
                url,
                None,
                Some("Staff Engineer, AI Infra"),
                Some("xAI"),
                "JD text about truth-seeking AI agents...",
                "analyzed",
                Some(82),
                Some(analysis_with_cv),
                None,
                None,
            )
            .unwrap();

        let opps = store
            .get_opportunities(&OpportunityFilter { id: Some(id), limit: Some(1), ..Default::default() })
            .unwrap();
        assert_eq!(opps.len(), 1);
        let o = &opps[0];
        let stored = o.analysis_json.as_ref().expect("analysis_json present");
        assert!(stored.contains("cv_chars_sent\":1234"));
        assert!(stored.contains("cv_used_fallback\":false"));
        assert!(stored.contains("\"fit\""));
    }
}

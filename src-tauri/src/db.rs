//! SQLite audit store: searches, hits, leads (dedup), pauses, events. Best-effort; disabled on init failure.

use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::app_dirs::app_data_dir;
use crate::x_search::{tweet_snippet, XTweet}; // reuse for consistency with reactor / commands

pub const DB_FILE: &str = "collab-finder.db";
pub const SCHEMA_VERSION: i32 = 3;

/// High-level filter for leads queries (used by UI dashboard + future MCP).
#[derive(Debug, Default, Clone)]
pub struct LeadFilter {
    pub min_score: Option<i32>,
    pub status: Option<String>,
    pub q: Option<String>, // simple LIKE on decision or notes; FTS separate
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

/// Generalized target for web/pasted job posts (and future x-post enrichment).
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
        eprintln!("[db] opened {} (schema v{})", db_path.display(), SCHEMA_VERSION);
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
            .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |r| r.get(0))
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

    /// v3: opportunities table for web/paste job targets (additive, X leads untouched).
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

    fn is_enabled(&self) -> bool {
        self.enabled
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
    pub fn record_search_hits(&self, run_id: i64, tweets: &[XTweet], rank_start: i32) -> Result<(), String> {
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
                params![event_type, payload_json, correlation_id, source.unwrap_or("ui")],
            )
            .map_err(|e| e.to_string())?;
        Ok(guard.last_insert_rowid())
    }

    pub fn record_rate_snapshot(&self, remaining: Option<i32>, limit_val: Option<i32>) -> Result<(), String> {
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

        rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())
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

        let Some(run) = run else { return Ok(None); };

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

        let mut out = rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())?;

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
                l.tweet_text.as_ref().is_some_and(|t| t.to_lowercase().contains(&ql))
                    || l.decision_json.as_ref().is_some_and(|d| d.to_lowercase().contains(&ql))
                    || l.notes.as_ref().is_some_and(|n| n.to_lowercase().contains(&ql))
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

        rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())
    }

    pub fn get_dashboard_stats(&self) -> Result<DashboardStats, String> {
        if !self.is_enabled() {
            return Ok(DashboardStats::default());
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;

        let total_searches: i64 = guard
            .query_row("SELECT COUNT(*) FROM search_runs", [], |r| r.get(0))
            .unwrap_or(0);

        let total_unique_leads: i64 = guard
            .query_row("SELECT COUNT(*) FROM leads", [], |r| r.get(0))
            .unwrap_or(0);

        let total_surfaces: i64 = guard
            .query_row("SELECT COALESCE(SUM(seen_count), 0) FROM leads", [], |r| r.get(0))
            .unwrap_or(0);

        let total_pauses: i64 = guard
            .query_row("SELECT COUNT(*) FROM pauses", [], |r| r.get(0))
            .unwrap_or(0);

        let avg_score: Option<f64> = guard
            .query_row("SELECT AVG(score) FROM leads WHERE score IS NOT NULL", [], |r| r.get(0))
            .ok();

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

        rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())
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

        rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())
    }

    // --- Opportunities (web/paste job targets) ---

    pub fn get_opportunities(&self, filter: &OpportunityFilter) -> Result<Vec<Opportunity>, String> {
        if !self.is_enabled() {
            return Ok(vec![]);
        }
        let guard = self.conn.lock().map_err(|e| e.to_string())?;
        let lim = filter.limit.unwrap_or(100).clamp(1, 500) as i64;

        let mut stmt = guard
            .prepare("SELECT id, kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, last_updated, notes
                      FROM opportunities
                      ORDER BY last_updated DESC, fit_score DESC LIMIT ?1")
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

        let mut out: Vec<Opportunity> = rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())?;

        if let Some(min) = filter.min_fit {
            out.retain(|o| o.fit_score.unwrap_or(0) >= min);
        }
        if let Some(ref st) = filter.status {
            out.retain(|o| &o.status == st);
        }
        if let Some(ref qq) = filter.q {
            let ql: String = qq.to_lowercase();
            out.retain(|o| {
                o.title.as_ref().is_some_and(|t| t.to_lowercase().contains(&ql))
                    || o.company.as_ref().is_some_and(|c| c.to_lowercase().contains(&ql))
                    || o.jd_text.to_lowercase().contains(&ql)
                    || o.analysis_json.as_ref().is_some_and(|a| a.to_lowercase().contains(&ql))
            });
        }

        Ok(out)
    }

    /// Insert or update an opportunity. Returns the id.
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
        let guard = self.conn.lock().map_err(|e| e.to_string())?;

        guard.execute(
            "INSERT INTO opportunities (kind, source_url, source_ref, title, company, jd_text, status, fit_score, analysis_json, prep_artifacts_json, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT DO UPDATE SET
               last_updated = datetime('now'),
               status = excluded.status,
               fit_score = COALESCE(excluded.fit_score, opportunities.fit_score),
               analysis_json = COALESCE(excluded.analysis_json, opportunities.analysis_json),
               prep_artifacts_json = COALESCE(excluded.prep_artifacts_json, opportunities.prep_artifacts_json),
               notes = COALESCE(excluded.notes, opportunities.notes)",
            params![
                kind,
                source_url,
                source_ref,
                title,
                company,
                jd_text,
                status,
                fit_score,
                analysis_json,
                prep_artifacts_json,
                notes
            ],
        )
        .map_err(|e| e.to_string())?;

        let id: i64 = guard
            .query_row(
                "SELECT id FROM opportunities WHERE (source_url = ?1 AND ?1 IS NOT NULL) OR (jd_text = ?2) ORDER BY id DESC LIMIT 1",
                params![source_url, jd_text],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;

        Ok(id)
    }

    pub fn update_opportunity_status(&self, id: i64, status: &str, notes: Option<&str>) -> Result<(), String> {
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
        assert_eq!(store.record_search_run("q", "manual", None, None, None, 0, None, None).unwrap(), 0);
        assert!(store.get_recent_searches(10).unwrap().is_empty());
        assert_eq!(store.get_dashboard_stats().unwrap().total_searches, 0);
    }

    #[test]
    fn migrate_is_idempotent() {
        let (_dir, store) = temp_store();
        let guard = store.conn.lock().unwrap();
        let v: i32 = guard
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
        drop(guard);
        let path = _dir.path().join("test.db");
        SqliteStore::open_at(path).expect("re-open");
    }

    #[test]
    fn search_run_hits_and_fetch() {
        let (_dir, store) = temp_store();
        let tweets = vec![
            sample_tweet("1", "rust engineer hiring"),
            sample_tweet("2", "typescript react collab"),
        ];
        let run_id = store
            .record_search_run("rust lang:en", "manual", Some(10), Some(100), Some(450), 50, Some(12), None)
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
        let id1 = store.upsert_lead("tw_99", Some(80), Some("prep"), None, "new", None).unwrap();
        let id2 = store.upsert_lead("tw_99", Some(85), Some("prep"), None, "prepped", None).unwrap();
        assert_eq!(id1, id2);
        let leads = store.get_leads(&LeadFilter { limit: Some(10), ..Default::default() }).unwrap();
        assert_eq!(leads.len(), 1);
        assert_eq!(leads[0].seen_count, 2);
        assert_eq!(leads[0].status, "prepped");
    }

    #[test]
    fn record_pause_event_and_stats() {
        let (_dir, store) = temp_store();
        let run_id = store.record_search_run("q", "cycle", None, None, None, 0, None, None).unwrap();
        let pause_id = store
            .record_pause("fit low", Some("FitThreshold"), None, Some(run_id), None)
            .unwrap();
        assert!(pause_id > 0);
        store.record_event("CycleRequested", Some(r#"{"q":"x"}"#), Some("c1"), Some("ui")).unwrap();

        let stats = store.get_dashboard_stats().unwrap();
        assert_eq!(stats.total_searches, 1);
        assert_eq!(stats.total_pauses, 1);

        let pauses = store.get_recent_pauses(5).unwrap();
        assert_eq!(pauses[0].reason, "fit low");

        let events = store.get_events(&EventFilter { limit: Some(5), ..Default::default() }).unwrap();
        assert_eq!(events[0].event_type, "CycleRequested");
    }

    #[test]
    fn record_search_hits_stores_snippet_not_full_text() {
        let (_dir, store) = temp_store();
        let run_id = store.record_search_run("q", "manual", None, None, None, 0, None, None).unwrap();
        let long = "x".repeat(crate::x_search::TWEET_SNIPPET_MAX_LEN + 40);
        store
            .record_search_hits(run_id, &[sample_tweet("long1", &long)], 0)
            .unwrap();
        let detail = store.get_search_run(run_id).unwrap().unwrap();
        assert_eq!(detail.tweets[0].text.len(), crate::x_search::TWEET_SNIPPET_MAX_LEN);
    }

    #[test]
    fn fts_finds_indexed_tweet_text() {
        let (_dir, store) = temp_store();
        let run_id = store.record_search_run("fts q", "manual", None, None, None, 0, None, None).unwrap();
        store
            .record_search_hits(run_id, &[sample_tweet("fts1", "unique zebra keyword collab")], 0)
            .unwrap();
        let hits = store.search_tweets_fts("zebra", 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "fts1");
    }

    #[test]
    fn lead_filter_min_score_and_status() {
        let (_dir, store) = temp_store();
        store.upsert_lead("a", Some(50), None, None, "paused", None).unwrap();
        store.upsert_lead("b", Some(90), None, None, "prepped", None).unwrap();
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
        let run_id = store.record_search_run("q", "manual", None, None, None, 0, None, None).unwrap();
        store
            .record_search_hits(
                run_id,
                &[sample_tweet("z1", "zebra stripe pattern")],
                0,
            )
            .unwrap();
        store.upsert_lead("z1", Some(80), None, None, "new", None).unwrap();
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
}

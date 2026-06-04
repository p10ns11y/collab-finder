mod db;
mod finder_reactor;
mod secrets;
mod x_query;
mod x_search;

use finder_reactor::{CycleResult, FinderReactor, ReactorState};
use std::sync::Mutex as StdMutex;
use tauri::State;
use tokio::sync::Mutex;
use x_search::XTweet;

pub struct AppReactor(pub Mutex<FinderReactor>);
pub struct AppDb(pub StdMutex<db::SqliteStore>);

fn x_bearer() -> Result<String, String> {
    secrets::get_x_bearer()
}

#[tauri::command]
fn has_x_bearer() -> bool {
    secrets::has_x_bearer()
}

#[tauri::command]
fn set_x_bearer(token: String) -> Result<(), String> {
    secrets::set_x_bearer(token.trim())
}

#[tauri::command]
fn clear_x_bearer() -> Result<(), String> {
    secrets::clear_x_bearer()
}

#[tauri::command]
async fn search_x_recent(
    db: State<'_, AppDb>,
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<XTweet>, String> {
    let bearer = x_bearer()?;
    let max = max_results.unwrap_or(10);
    let start = std::time::Instant::now();
    let (tweets, rate) = x_search::search_recent(&bearer, &query, max).await?;
    let dur = start.elapsed().as_millis() as i64;

    // Best-effort: log rate to stderr for dev; reactor cycle updates shared state.
    if let Some(rem) = rate.remaining {
        eprintln!("[x] rate remaining: {rem}");
    }

    // Persist search + hits + rate (dedup inside db via PK + upsert logic).
    let run_id = db
        .0
        .lock()
        .map(|s| {
            let rid = s
                .record_search_run(
                    &query,
                    "manual",
                    Some(max as i32),
                    rate.remaining,
                    rate.limit,
                    100, // rough cost for search
                    Some(dur),
                    None,
                )
                .unwrap_or(0);
            if let Err(e) = s.record_search_hits(rid, &tweets, 0) {
                eprintln!("[db] hits persist skipped: {e}");
            }
            if let Some(r) = rate.remaining {
                let _ = s.record_rate_snapshot(Some(r as i32), rate.limit.map(|l| l as i32));
            }
            rid
        })
        .unwrap_or_else(|e| {
            eprintln!("[db] search persist skipped (non-fatal): {e}");
            0
        });

    if run_id > 0 {
        eprintln!("[db] recorded search_run {} ({} tweets)", run_id, tweets.len());
    }

    Ok(tweets)
}

#[tauri::command]
async fn run_finder_cycle_cmd(
    db: State<'_, AppDb>,
    reactor: State<'_, AppReactor>,
    query: String,
    cv_summary: String,
) -> Result<CycleResult, String> {
    let bearer = x_bearer()?;
    let start = std::time::Instant::now();
    let mut guard = reactor.0.lock().await;
    let result = guard.run_autonomous_cycle(query.clone(), bearer, cv_summary).await?;

    let dur = start.elapsed().as_millis() as i64;

    // Persist the cycle's search (the tweets returned are what guarded_search produced).
    // Source "cycle" so dashboard can distinguish.
    let run_id = db
        .0
        .lock()
        .map(|s| {
            let rid = s
                .record_search_run(&query, "cycle", Some(10), None, None, 200, Some(dur), None)
                .unwrap_or(0);
            if let Err(e) = s.record_search_hits(rid, &result.tweets, 0) {
                eprintln!("[db] cycle hits skipped: {e}");
            }
            rid
        })
        .unwrap_or(0);

    // Upsert the "best" analyzed tweet as a lead (dedup + seen_count handled in db).
    if !result.tweets.is_empty() {
        // The reactor already picked the best internally; for simplicity use first returned (or the decision one).
        // In practice the cycle returns the full list + the decision for the chosen best.
        let best = &result.tweets[0];
        let decision_json = serde_json::to_string(&result.decision).ok();
        let _lead_id = db
            .0
            .lock()
            .map(|s| {
                s.upsert_lead(
                    &best.id,
                    None, // score is inside decision/analyze; for now use action confidence later
                    Some(&result.decision.action),
                    decision_json.as_deref(),
                    if result.decision.guards_triggered.is_empty() { "analyzed" } else { "paused" },
                    None,
                )
                .unwrap_or(0)
            })
            .unwrap_or(0);
    }

    if run_id > 0 {
        eprintln!("[db] recorded cycle search_run {}", run_id);
    }

    Ok(result)
}

#[tauri::command]
async fn get_reactor_state(
    _db: State<'_, AppDb>, // reserved for future enrichment (e.g. historical lead counts)
    reactor: State<'_, AppReactor>,
) -> Result<ReactorState, String> {
    let guard = reactor.0.lock().await;
    Ok(guard.state.clone())
}

#[tauri::command]
async fn promote_lead(
    db: State<'_, AppDb>,
    reactor: State<'_, AppReactor>,
    lead_id: String,
) -> Result<String, String> {
    let mut guard = reactor.0.lock().await;
    let msg = guard.promote_insights(&lead_id)?;

    // Record the promote attempt (high guard action).
    let _ = db.0.lock().map(|s| {
        let _ = s.record_event(
            "PromoteRequested",
            Some(&format!(r#"{{"lead_id":"{}","message":"{}"}}"#, lead_id, msg.replace('"', "'"))),
            Some(&lead_id),
            Some("ui"),
        );
    });

    Ok(msg)
}

// --- History / dashboard commands (read side of the durable store) ---

#[tauri::command]
async fn get_search_history(db: State<'_, AppDb>, limit: Option<u32>) -> Result<Vec<db::SearchRun>, String> {
    let lim = limit.unwrap_or(50);
    db.0.lock()
        .map(|s| s.get_recent_searches(lim))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_search_run(db: State<'_, AppDb>, id: i64) -> Result<Option<db::SearchRunWithTweets>, String> {
    db.0.lock()
        .map(|s| s.get_search_run(id))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_leads(db: State<'_, AppDb>, min_score: Option<i32>, status: Option<String>, q: Option<String>, limit: Option<u32>) -> Result<Vec<db::Lead>, String> {
    let filter = db::LeadFilter {
        min_score,
        status,
        q,
        since: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_leads(&filter))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_dashboard_stats(db: State<'_, AppDb>) -> Result<db::DashboardStats, String> {
    db.0.lock()
        .map(|s| s.get_dashboard_stats())
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_recent_pauses(db: State<'_, AppDb>, limit: Option<u32>) -> Result<Vec<db::Pause>, String> {
    let lim = limit.unwrap_or(30);
    db.0.lock()
        .map(|s| s.get_recent_pauses(lim))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_events(db: State<'_, AppDb>, limit: Option<u32>) -> Result<Vec<db::Event>, String> {
    let filter = db::EventFilter {
        event_type: None,
        since: None,
        correlation_id: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_events(&filter))
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_past_tweets(db: State<'_, AppDb>, fts_query: String, limit: Option<u32>) -> Result<Vec<XTweet>, String> {
    let lim = limit.unwrap_or(20);
    db.0.lock()
        .map(|s| s.search_tweets_fts(&fts_query, lim))
        .map_err(|e| e.to_string())?
}

/// General log for TUI actions (e.g. PresetSelected, CycleRequested intents) from frontend.
#[tauri::command]
fn log_event(
    db: State<'_, AppDb>,
    event_type: String,
    payload: Option<String>,
    correlation_id: Option<String>,
) -> Result<(), String> {
    let _ = db.0.lock().map(|s| {
        let _ = s.record_event(&event_type, payload.as_deref(), correlation_id.as_deref(), Some("ui"));
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppReactor(Mutex::new(FinderReactor::new(None))))
        .manage(AppDb(StdMutex::new(db::SqliteStore::new())))
        .invoke_handler(tauri::generate_handler![
            search_x_recent,
            run_finder_cycle_cmd,
            get_reactor_state,
            promote_lead,
            has_x_bearer,
            set_x_bearer,
            clear_x_bearer,
            // History / audit (durable storage of every search, event, lead, pause)
            get_search_history,
            get_search_run,
            get_leads,
            get_dashboard_stats,
            get_recent_pauses,
            get_events,
            search_past_tweets,
            log_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

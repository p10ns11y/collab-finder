mod commands;
mod db;
mod finder_reactor;
mod secrets;
mod x_query;
mod x_search;

use commands::{
    persist_cycle_lead, persist_cycle_search, persist_manual_search, persist_promote_event,
    promote_message,
};
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
fn get_x_bearer_storage() -> secrets::BearerStorageStatus {
    secrets::get_bearer_storage_status()
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

    if let Some(rem) = rate.remaining {
        eprintln!("[x] rate remaining: {rem}");
    }

    let run_id = db
        .0
        .lock()
        .map(|s| persist_manual_search(&s, &query, max, &tweets, &rate, dur))
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
    drop(guard);

    let run_id = db
        .0
        .lock()
        .map(|s| persist_cycle_search(&s, &query, &result.tweets, dur))
        .unwrap_or(0);

    let _lead_id = db
        .0
        .lock()
        .map(|s| persist_cycle_lead(&s, &result))
        .unwrap_or(0);

    if run_id > 0 {
        eprintln!("[db] recorded cycle search_run {}", run_id);
    }

    Ok(result)
}

#[tauri::command]
async fn get_reactor_state(
    _db: State<'_, AppDb>,
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
    let msg = promote_message(&mut guard, &lead_id)?;
    drop(guard);

    let _ = db.0.lock().map(|s| {
        persist_promote_event(&s, &lead_id, &msg);
    });

    Ok(msg)
}

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
async fn get_leads(
    db: State<'_, AppDb>,
    min_score: Option<i32>,
    status: Option<String>,
    q: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<db::Lead>, String> {
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
async fn search_past_tweets(
    db: State<'_, AppDb>,
    fts_query: String,
    limit: Option<u32>,
) -> Result<Vec<XTweet>, String> {
    let lim = limit.unwrap_or(20);
    db.0.lock()
        .map(|s| s.search_tweets_fts(&fts_query, lim))
        .map_err(|e| e.to_string())?
}

/// Re-fetch full post content from X on demand (not persisted; handles deletions via 404).
#[tauri::command]
async fn hydrate_tweet(id: String) -> Result<XTweet, String> {
    let bearer = x_bearer()?;
    x_search::lookup_tweet(&bearer, &id).await
}

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
            get_x_bearer_storage,
            set_x_bearer,
            clear_x_bearer,
            get_search_history,
            get_search_run,
            get_leads,
            get_dashboard_stats,
            get_recent_pauses,
            get_events,
            search_past_tweets,
            hydrate_tweet,
            log_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

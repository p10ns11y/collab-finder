mod app_dirs;
mod commands;
mod db;
mod finder_reactor;
mod secrets;
mod x_query;
mod x_search;
mod xai;

use commands::{
    persist_cycle_lead, persist_cycle_search, persist_manual_search, persist_promote_event,
    promote_message,
};
use finder_reactor::{CycleResult, FinderReactor, ReactorState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex as StdMutex;
use tauri::State;
use tokio::sync::Mutex;
use x_search::XTweet;

pub struct AppReactor(pub Mutex<FinderReactor>);
pub struct AppDb(pub StdMutex<db::SqliteStore>);

// ============================================================================
// CREDENTIALS / X BEARER + xAI KEY ACCESS (STABILITY BOUNDARY)
// ============================================================================
// These are the ONLY ways the rest of the app (and the React UI via invoke) touches
// secrets. See the huge warning header in src/secrets.rs (covers BOTH bearer and xai-key).
//
// x_bearer() is the internal helper used by search/cycle/hydrate.
// get_xai_key() (added below) is the internal helper used by analyze/prep commands.
//
// The EIGHT credential commands (4 bearer + 4 xai) are registered together below.
//
// DO NOT:
// - Rename any of the 8 command strings without updating docs/tauri-commands.md + adapters.
// - Remove any from generate_handler![].
// - Change return shapes of get_*_storage (TS types must match the duplicated structs).
// - Add extra params or make them async unless you update docs + all call sites.
// ============================================================================

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

// xAI key commands (exact parallel to the 4 bearer commands above — stability boundary)
#[tauri::command]
fn has_xai_key() -> bool {
    secrets::has_xai_key()
}

#[tauri::command]
fn get_xai_key_storage() -> secrets::XaiKeyStorageStatus {
    secrets::get_xai_key_storage()
}

#[tauri::command]
fn set_xai_key(key: String) -> Result<(), String> {
    secrets::set_xai_key(key.trim())
}

#[tauri::command]
fn clear_xai_key() -> Result<(), String> {
    secrets::clear_xai_key()
}

// New job target commands (web/paste focus for this slice)
#[tauri::command]
async fn fetch_job_page(url: String) -> Result<JobPageResult, String> {
    // Basic fetch + naive clean (no extra crates in v1)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (compatible; collab-finder/0.1; +https://github.com/sustainableabundance/collab-finder)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;

    // Very naive strip of tags/scripts for v1. Real readability can come later.
    let cleaned = strip_html_basic(&text);
    let truncated = if cleaned.len() > 8000 { &cleaned[..8000] } else { &cleaned };

    Ok(JobPageResult {
        title: None, // can be enhanced by xAI extract later
        company: None,
        cleaned_text: truncated.to_string(),
        original_len: cleaned.len() as u32,
        truncated: cleaned.len() > 8000,
    })
}

#[tauri::command]
async fn analyze_job_target(
    db: State<'_, AppDb>,
    url: Option<String>,
    pasted_jd: Option<String>,
    title: Option<String>,
    company: Option<String>,
    cv_summary: Option<String>, // fallback; real prune from devprofile path wired in follow-up
) -> Result<JobAnalysisResult, String> {
    let jd = match (url.clone(), pasted_jd) {
        (_, Some(p)) if !p.trim().is_empty() => p,
        (Some(u), _) => {
            let fetched = fetch_job_page(u.clone()).await?;
            fetched.cleaned_text
        }
        _ => return Err("Provide either url or pasted_jd".into()),
    };

    // For v1: use provided cv or a sensible default (real devprofile ~/Work/personal/devprofile load + prune comes next slice)
    let cv = cv_summary.unwrap_or_else(|| "Senior engineer with Rust, TypeScript, React, Tauri, agentic tooling experience. Open to high-impact roles.".to_string());

    // Build a minimal system + user for structured fit
    let system = "You are an expert career fit analyst. Output ONLY valid JSON matching the provided schema. Be precise and cite phrases from the JD.";
    let user = format!(
        "CV PACKET (pruned):\n{}\n\nJOB DESCRIPTION:\n{}\n\nReturn fit analysis.",
        cv, jd
    );

    // Minimal strict schema for JobFitReport (v1)
    let schema = json!({
        "type": "object",
        "properties": {
            "overall": {"type": "integer", "minimum": 0, "maximum": 100},
            "rationale": {"type": "string"},
            "gaps_must": {"type": "array", "items": {"type": "string"}},
            "gaps_nice": {"type": "array", "items": {"type": "string"}},
            "recommended_action": {"type": "string"}
        },
        "required": ["overall", "rationale", "gaps_must", "recommended_action"],
        "additionalProperties": false
    });

    let (fit_json, usage) = crate::xai::structured_chat(system, &user, "job_fit_v1", schema).await?;

    let fit_score = fit_json.get("overall").and_then(|v| v.as_i64()).map(|i| i as i32);

    // Persist as opportunity (best effort)
    let run_id = if let Ok(guard) = db.0.lock() {
        guard.upsert_opportunity(
            "web",
            url.as_deref(),
            None,
            title.as_deref(),
            company.as_deref(),
            &jd,
            "analyzed",
            fit_score,
            Some(&fit_json.to_string()),
            None,
            None,
        ).unwrap_or(0)
    } else {
        0
    };

    let cost = crate::xai::cost_from_usage(&usage);

    Ok(JobAnalysisResult {
        opportunity_id: run_id,
        fit: fit_json,
        packet_preview: cv.chars().take(600).collect(),
        est_cost_usd: cost,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobPageResult {
    pub title: Option<String>,
    pub company: Option<String>,
    pub cleaned_text: String,
    pub original_len: u32,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobAnalysisResult {
    pub opportunity_id: i64,
    pub fit: Value,
    pub packet_preview: String,
    pub est_cost_usd: f64,
}

fn strip_html_basic(html: &str) -> String {
    // Extremely basic tag stripper for v1. Good enough to get text for LLM.
    let mut out = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if in_tag && c == '>' {
            in_tag = false;
            continue;
        }
        if in_tag {
            // crude script skip
            let lower = html.to_lowercase();
            if lower.contains("<script") { in_script = true; }
            if lower.contains("</script>") { in_script = false; }
            continue;
        }
        if !in_script {
            out.push(c);
        }
    }
    // Collapse whitespace
    out.split_whitespace().collect::<Vec<_>>().join(" ")
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
async fn get_opportunities(
    db: State<'_, AppDb>,
    q: Option<String>,
    status: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<db::Opportunity>, String> {
    let filter = db::OpportunityFilter {
        q,
        status,
        min_fit: None,
        limit,
    };
    db.0.lock()
        .map(|s| s.get_opportunities(&filter))
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
            // Credential commands (stability boundary — see above). Keep bearer + xai together.
            has_x_bearer,
            get_x_bearer_storage,
            set_x_bearer,
            clear_x_bearer,
            has_xai_key,
            get_xai_key_storage,
            set_xai_key,
            clear_xai_key,
            fetch_job_page,
            analyze_job_target,
            get_opportunities,
            search_x_recent,
            run_finder_cycle_cmd,
            get_reactor_state,
            promote_lead,
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

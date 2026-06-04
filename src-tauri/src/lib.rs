mod finder_reactor;
mod secrets;
mod x_query;
mod x_search;

use finder_reactor::{CycleResult, FinderReactor, ReactorState};
use tauri::State;
use tokio::sync::Mutex;
use x_search::XTweet;

pub struct AppReactor(pub Mutex<FinderReactor>);

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
async fn search_x_recent(query: String, max_results: Option<u32>) -> Result<Vec<XTweet>, String> {
    let bearer = x_bearer()?;
    let max = max_results.unwrap_or(10);
    let (tweets, rate) = x_search::search_recent(&bearer, &query, max).await?;

    // Best-effort: log rate to stderr for dev; reactor cycle updates shared state.
    if let Some(rem) = rate.remaining {
        eprintln!("[x] rate remaining: {rem}");
    }

    Ok(tweets)
}

#[tauri::command]
async fn run_finder_cycle_cmd(
    reactor: State<'_, AppReactor>,
    query: String,
    cv_summary: String,
) -> Result<CycleResult, String> {
    let bearer = x_bearer()?;
    let mut guard = reactor.0.lock().await;
    guard.run_autonomous_cycle(query, bearer, cv_summary).await
}

#[tauri::command]
async fn get_reactor_state(reactor: State<'_, AppReactor>) -> Result<ReactorState, String> {
    let guard = reactor.0.lock().await;
    Ok(guard.state.clone())
}

#[tauri::command]
async fn promote_lead(reactor: State<'_, AppReactor>, lead_id: String) -> Result<String, String> {
    let mut guard = reactor.0.lock().await;
    guard.promote_insights(&lead_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppReactor(Mutex::new(FinderReactor::new(None))))
        .invoke_handler(tauri::generate_handler![
            search_x_recent,
            run_finder_cycle_cmd,
            get_reactor_state,
            promote_lead,
            has_x_bearer,
            set_x_bearer,
            clear_x_bearer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

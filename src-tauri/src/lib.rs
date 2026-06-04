mod finder_reactor;
mod secrets;

use anyhow::Result;
use finder_reactor::{Decision, get_reactor_state, promote_lead, run_finder_cycle};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XTweet {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub author_id: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct XSearchResponse {
    data: Option<Vec<XTweet>>,
    meta: Option<serde_json::Value>,
}

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
    let max = max_results.unwrap_or(10).clamp(10, 20);
    let url = format!(
        "https://api.x.com/2/tweets/search/recent?query={}&max_results={}&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username",
        urlencoding::encode(&query),
        max
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", bearer))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("X API error: {}", text));
    }

    let body: XSearchResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body.data.unwrap_or_default())
}

#[tauri::command]
async fn run_finder_cycle_cmd(query: String, cv_summary: String) -> Result<Decision, String> {
    let bearer = x_bearer()?;
    run_finder_cycle(query, bearer, cv_summary).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
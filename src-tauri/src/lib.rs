// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod finder_reactor;

use anyhow::Result;
use finder_reactor::{Decision, ReactorState, run_finder_cycle, get_reactor_state, promote_lead};
use serde::{Deserialize, Serialize};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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

#[tauri::command]
async fn search_x_recent(query: String, bearer: String, max_results: Option<u32>) -> Result<Vec<XTweet>, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, search_x_recent, run_finder_cycle, get_reactor_state, promote_lead])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

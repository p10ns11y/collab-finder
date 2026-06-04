use crate::x_query::validate_recent_search_query;
use reqwest::header::HeaderMap;
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

#[derive(Debug, Deserialize)]
struct XSearchResponse {
    data: Option<Vec<XTweet>>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct XRateInfo {
    pub remaining: Option<u32>,
    pub limit: Option<u32>,
}

fn parse_rate_header(headers: &HeaderMap, name: &str) -> Option<u32> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
}

/// Recent search — shared by UI `search_x_recent` and reactor `guarded_search`.
/// Operators: https://docs.x.com/x-api/posts/search/integrate/operators
pub async fn search_recent(
    bearer: &str,
    query: &str,
    max_results: u32,
) -> Result<(Vec<XTweet>, XRateInfo), String> {
    validate_recent_search_query(query)?;

    let max = max_results.clamp(10, 20);
    let url = format!(
        "https://api.x.com/2/tweets/search/recent?query={}&max_results={}&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username",
        urlencoding::encode(query.trim()),
        max
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", bearer.trim()))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let rate = XRateInfo {
        remaining: parse_rate_header(resp.headers(), "x-rate-limit-remaining"),
        limit: parse_rate_header(resp.headers(), "x-rate-limit-limit"),
    };

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("X API error: {}", text));
    }

    let body: XSearchResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok((body.data.unwrap_or_default(), rate))
}

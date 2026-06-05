use crate::x_query::validate_recent_search_query;
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};

/// Max chars persisted locally (X Developer Policy: minimize offline post content).
pub const TWEET_SNIPPET_MAX_LEN: usize = 280;

/// Truncate post text for sqlite storage / FTS (preview only; full text via lookup API).
pub fn tweet_snippet(text: &str) -> String {
    text.chars().take(TWEET_SNIPPET_MAX_LEN).collect()
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

#[derive(Debug, Deserialize)]
struct XSearchResponse {
    data: Option<Vec<XTweet>>,
}

#[derive(Debug, Deserialize)]
struct XLookupResponse {
    data: Option<XTweet>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct XRateInfo {
    pub remaining: Option<u32>,
    pub limit: Option<u32>,
}

pub(crate) fn clamp_max_results(max_results: u32) -> u32 {
    max_results.clamp(10, 20)
}

pub(crate) fn bearer_authorization_header(bearer: &str) -> String {
    format!("Bearer {}", bearer.trim())
}

/// Build recent-search URL after query validation (unit-testable, no network).
pub(crate) fn recent_search_url(query: &str, max_results: u32) -> Result<String, String> {
    validate_recent_search_query(query)?;
    let max = clamp_max_results(max_results);
    Ok(format!(
        "https://api.x.com/2/tweets/search/recent?query={}&max_results={}&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username",
        urlencoding::encode(query.trim()),
        max
    ))
}

pub(crate) fn parse_rate_header(headers: &HeaderMap, name: &str) -> Option<u32> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
}

pub(crate) fn rate_from_headers(headers: &HeaderMap) -> XRateInfo {
    XRateInfo {
        remaining: parse_rate_header(headers, "x-rate-limit-remaining"),
        limit: parse_rate_header(headers, "x-rate-limit-limit"),
    }
}

pub(crate) fn parse_search_response_body(body: &str) -> Result<Vec<XTweet>, String> {
    let parsed: XSearchResponse = serde_json::from_str(body).map_err(|e| e.to_string())?;
    Ok(parsed.data.unwrap_or_default())
}

pub(crate) fn lookup_tweet_url(id: &str) -> Result<String, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("tweet id required".into());
    }
    Ok(format!(
        "https://api.x.com/2/tweets/{}?tweet.fields=created_at,author_id",
        urlencoding::encode(id)
    ))
}

pub(crate) fn parse_lookup_response_body(body: &str) -> Result<XTweet, String> {
    let parsed: XLookupResponse = serde_json::from_str(body).map_err(|e| e.to_string())?;
    parsed
        .data
        .ok_or_else(|| "Post not found on X (may have been deleted)".to_string())
}

pub(crate) fn api_error_message(status: u16, body: &str) -> String {
    if body.is_empty() {
        format!("X API error: HTTP {status}")
    } else {
        format!("X API error: {body}")
    }
}

/// Recent search — shared by UI `search_x_recent` and reactor `guarded_search`.
pub async fn search_recent(
    bearer: &str,
    query: &str,
    max_results: u32,
) -> Result<(Vec<XTweet>, XRateInfo), String> {
    let url = recent_search_url(query, max_results)?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", bearer_authorization_header(bearer))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let rate = rate_from_headers(resp.headers());
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(api_error_message(status.as_u16(), &text));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let tweets = parse_search_response_body(&body)?;
    Ok((tweets, rate))
}

/// Fetch authoritative post content from X (rehydrate on demand; not persisted).
pub async fn lookup_tweet(bearer: &str, id: &str) -> Result<XTweet, String> {
    let url = lookup_tweet_url(id)?;

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", bearer_authorization_header(bearer))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if status.as_u16() == 404 {
        return Err("Post not found on X (may have been deleted)".into());
    }
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(api_error_message(status.as_u16(), &text));
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    parse_lookup_response_body(&body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn clamp_bounds() {
        assert_eq!(clamp_max_results(1), 10);
        assert_eq!(clamp_max_results(15), 15);
        assert_eq!(clamp_max_results(99), 20);
    }

    #[test]
    fn bearer_header_trims() {
        assert_eq!(
            bearer_authorization_header("  tok  "),
            "Bearer tok"
        );
    }

    #[test]
    fn recent_search_url_encodes_query() {
        let url = recent_search_url("rust lang:en", 12).unwrap();
        assert!(url.contains("api.x.com/2/tweets/search/recent"));
        assert!(url.contains("max_results=12"));
        assert!(url.contains("lang%3Aen") || url.contains("lang:en"));
    }

    #[test]
    fn recent_search_url_rejects_invalid_operator() {
        assert!(recent_search_url("x since:2026-01-01", 10).is_err());
    }

    #[test]
    fn parse_rate_headers() {
        let mut h = HeaderMap::new();
        h.insert("x-rate-limit-remaining", HeaderValue::from_static("42"));
        h.insert("x-rate-limit-limit", HeaderValue::from_static("450"));
        let rate = rate_from_headers(&h);
        assert_eq!(rate.remaining, Some(42));
        assert_eq!(rate.limit, Some(450));
        assert_eq!(parse_rate_header(&h, "missing"), None);
    }

    #[test]
    fn parse_search_json_tweets_and_empty_data() {
        let body = r#"{"data":[{"id":"9","text":"hello","author_id":"1","created_at":"t"}]}"#;
        let tweets = parse_search_response_body(body).unwrap();
        assert_eq!(tweets.len(), 1);
        assert_eq!(tweets[0].id, "9");

        let empty = parse_search_response_body(r#"{}"#).unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn parse_search_json_rejects_invalid() {
        assert!(parse_search_response_body("not-json").is_err());
    }

    #[test]
    fn api_error_message_formats_status() {
        assert_eq!(api_error_message(401, ""), "X API error: HTTP 401");
        assert!(api_error_message(403, r#"{"title":"Forbidden"}"#).contains("Forbidden"));
    }

    #[test]
    fn tweet_snippet_truncates_long_text() {
        let long = "a".repeat(TWEET_SNIPPET_MAX_LEN + 50);
        let snippet = tweet_snippet(&long);
        assert_eq!(snippet.len(), TWEET_SNIPPET_MAX_LEN);
        assert_eq!(snippet.chars().count(), TWEET_SNIPPET_MAX_LEN);
    }

    #[test]
    fn tweet_snippet_preserves_short_text() {
        assert_eq!(tweet_snippet("hello"), "hello");
    }

    #[test]
    fn lookup_tweet_url_encodes_id() {
        let url = lookup_tweet_url("99").unwrap();
        assert!(url.contains("/2/tweets/99"));
    }

    #[test]
    fn lookup_tweet_url_rejects_empty() {
        assert!(lookup_tweet_url("").is_err());
    }

    #[test]
    fn parse_lookup_json_single_tweet() {
        let body = r#"{"data":{"id":"9","text":"full post","author_id":"1","created_at":"t"}}"#;
        let tweet = parse_lookup_response_body(body).unwrap();
        assert_eq!(tweet.id, "9");
        assert_eq!(tweet.text, "full post");
    }

    #[test]
    fn parse_lookup_json_missing_data() {
        assert!(parse_lookup_response_body(r#"{}"#).is_err());
    }
}
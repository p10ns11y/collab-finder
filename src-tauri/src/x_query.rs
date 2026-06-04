//! X recent-search query validation (v2 operators only).

const OPERATORS_DOC: &str = "https://docs.x.com/x-api/posts/search/integrate/operators";
const MAX_QUERY_LEN: usize = 512;

/// Legacy operators invalid in X API v2 query strings (use `start_time` / `end_time` params instead).
pub const INVALID_IN_QUERY: &[&str] = &[
    "since:",
    "until:",
    "min_faves:",
    "min_retweets:",
    "min_replies:",
    "filter:",
    "within:",
    "near:",
    "geocode:",
    "source:",
];

pub fn validate_recent_search_query(query: &str) -> Result<(), String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("Search query cannot be empty.".to_string());
    }
    if q.len() > MAX_QUERY_LEN {
        return Err(format!(
            "Query exceeds {MAX_QUERY_LEN} characters (self-serve recent search limit). See {OPERATORS_DOC}"
        ));
    }

    let lower = q.to_lowercase();
    for token in INVALID_IN_QUERY {
        if lower.contains(token) {
            return Err(format!(
                "Query uses unsupported operator \"{token}\". X API v2 recent search does not support this in the query string. \
                 Use documented operators only ({OPERATORS_DOC}). \
                 For date ranges, use API parameters start_time/end_time on /2/tweets/search/recent (last 7 days), not since: in the query."
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_whitespace() {
        assert!(validate_recent_search_query("").is_err());
        assert!(validate_recent_search_query("   ").is_err());
    }

    #[test]
    fn rejects_over_512_chars() {
        let q = "a".repeat(513);
        let err = validate_recent_search_query(&q).unwrap_err();
        assert!(err.contains("512"));
    }

    #[test]
    fn accepts_512_chars() {
        let q = "a".repeat(512);
        validate_recent_search_query(&q).unwrap();
    }

    #[test]
    fn rejects_each_invalid_operator() {
        for token in INVALID_IN_QUERY {
            let q = format!("hiring {token}2026 lang:en");
            let err = validate_recent_search_query(&q).unwrap_err();
            assert!(err.contains(token), "expected error for {token}");
        }
    }

    #[test]
    fn accepts_documented_operators() {
        validate_recent_search_query(
            "(hiring OR engineer) lang:en -is:retweet has:links",
        )
        .unwrap();
    }
}
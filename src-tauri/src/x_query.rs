//! X recent-search query validation against official v2 operators.
//! Reference: https://docs.x.com/x-api/posts/search/integrate/operators
//! Date windows use API `start_time` / `end_time` params — not `since:` in the query string.

const OPERATORS_DOC: &str = "https://docs.x.com/x-api/posts/search/integrate/operators";

/// Legacy Twitter web / GNIP operators that are invalid in X API v2 search queries.
const INVALID_IN_QUERY: &[&str] = &[
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
    if q.len() > 512 {
        return Err(format!(
            "Query exceeds 512 characters (self-serve recent search limit). See {OPERATORS_DOC}"
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
    fn rejects_since_operator() {
        let err = validate_recent_search_query("python since:2026-05-01 lang:en").unwrap_err();
        assert!(err.contains("since:"));
    }

    #[test]
    fn accepts_documented_operators() {
        validate_recent_search_query(
            "(hiring OR engineer) lang:en -is:retweet has:links",
        )
        .unwrap();
    }
}

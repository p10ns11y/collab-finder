//! Tauri command implementations (testable without the IPC macro layer).

use crate::db::SqliteStore;
use crate::finder_reactor::{CycleResult, Decision, FinderReactor};
use crate::x_search::{XRateInfo, XTweet};

pub(crate) fn lead_status_from_decision(decision: &Decision) -> &'static str {
    if decision.guards_triggered.is_empty() {
        "analyzed"
    } else {
        "paused"
    }
}

/// Best-effort persist for `search_x_recent`. Returns run id (0 if disabled / failed).
pub(crate) fn persist_manual_search(
    store: &SqliteStore,
    query: &str,
    max: u32,
    tweets: &[XTweet],
    rate: &XRateInfo,
    duration_ms: i64,
) -> i64 {
    let run_id = store
        .record_search_run(
            query,
            "manual",
            Some(max as i32),
            rate.remaining,
            rate.limit,
            100,
            Some(duration_ms),
            None,
        )
        .unwrap_or(0);
    if run_id > 0 {
        if let Err(e) = store.record_search_hits(run_id, tweets, 0) {
            eprintln!("[db] hits persist skipped: {e}");
        }
        if let Some(r) = rate.remaining {
            let _ = store.record_rate_snapshot(Some(r as i32), rate.limit.map(|l| l as i32));
        }
    }
    run_id
}

pub(crate) fn persist_cycle_search(
    store: &SqliteStore,
    query: &str,
    tweets: &[XTweet],
    duration_ms: i64,
) -> i64 {
    let run_id = store
        .record_search_run(query, "cycle", Some(10), None, None, 200, Some(duration_ms), None)
        .unwrap_or(0);
    if run_id > 0 {
        if let Err(e) = store.record_search_hits(run_id, tweets, 0) {
            eprintln!("[db] cycle hits skipped: {e}");
        }
    }
    run_id
}

pub(crate) fn persist_cycle_lead(store: &SqliteStore, result: &CycleResult) -> i64 {
    if result.tweets.is_empty() {
        return 0;
    }
    let best = &result.tweets[0];
    let decision_json = serde_json::to_string(&result.decision).ok();
    store
        .upsert_lead(
            &best.id,
            None,
            Some(&result.decision.action),
            decision_json.as_deref(),
            lead_status_from_decision(&result.decision),
            None,
        )
        .unwrap_or(0)
}

pub(crate) fn persist_promote_event(store: &SqliteStore, lead_id: &str, message: &str) {
    let payload = format!(
        r#"{{"lead_id":"{}","message":"{}"}}"#,
        lead_id,
        message.replace('"', "'")
    );
    let _ = store.record_event("PromoteRequested", Some(&payload), Some(lead_id), Some("ui"));
}

pub(crate) fn promote_message(reactor: &mut FinderReactor, lead_id: &str) -> Result<String, String> {
    reactor.promote_insights(lead_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SqliteStore;
    use crate::finder_reactor::Guard;
    use tempfile::TempDir;

    fn temp_store() -> (TempDir, SqliteStore) {
        let dir = TempDir::new().unwrap();
        let store = SqliteStore::open_at(dir.path().join("t.db")).unwrap();
        (dir, store)
    }

    fn tweet(id: &str) -> XTweet {
        XTweet {
            id: id.into(),
            text: "rust hiring".into(),
            author_id: None,
            created_at: None,
        }
    }

    #[test]
    fn lead_status_analyzed_vs_paused() {
        let analyzed = Decision {
            action: "prep".into(),
            confidence: 80,
            rationale: "".into(),
            guards_triggered: vec![],
            next_steps: vec![],
        };
        assert_eq!(lead_status_from_decision(&analyzed), "analyzed");

        let paused = Decision {
            action: "pause".into(),
            confidence: 40,
            rationale: "".into(),
            guards_triggered: vec![Guard::FitThreshold {
                score: 50,
                threshold: 70,
            }],
            next_steps: vec![],
        };
        assert_eq!(lead_status_from_decision(&paused), "paused");
    }

    #[test]
    fn persist_manual_search_writes_run_and_hits() {
        let (_d, store) = temp_store();
        let rate = XRateInfo {
            remaining: Some(99),
            limit: Some(450),
        };
        let id = persist_manual_search(&store, "rust lang:en", 10, &[tweet("1")], &rate, 25);
        assert!(id > 0);
        let runs = store.get_recent_searches(5).unwrap();
        assert_eq!(runs[0].source, "manual");
        let detail = store.get_search_run(id).unwrap().unwrap();
        assert_eq!(detail.tweets.len(), 1);
    }

    #[test]
    fn persist_cycle_lead_skips_empty_tweets() {
        let (_d, store) = temp_store();
        let result = CycleResult {
            decision: Decision {
                action: "ignore".into(),
                confidence: 0,
                rationale: "".into(),
                guards_triggered: vec![],
                next_steps: vec![],
            },
            tweets: vec![],
        };
        assert_eq!(persist_cycle_lead(&store, &result), 0);
    }

    #[test]
    fn persist_promote_event_inserts_row() {
        let (_d, store) = temp_store();
        persist_promote_event(&store, "lead-9", "Sidecar written");
        let events = store
            .get_events(&crate::db::EventFilter {
                limit: Some(5),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(events[0].event_type, "PromoteRequested");
    }
}
#!/usr/bin/env bash
# Offline ranking check. No network and no API key.
#
# The Sweden screen calls the Tauri command search_platsbanken. That command
# parses ads, then ranks them with:
#   collab_finder_lib::platsbanken::lead_from_parsed(ad, today: &str)
#   collab_finder_lib::platsbanken::rank_leads(leads)
# today is YYYY-MM-DD. This script calls those two functions with fixture ads
# and today 2026-10-02. It does not call search_platsbanken, because that
# command reads the clock, contacts JobTech, and writes the local database.
#
# Another implementation plugs in by exposing those two functions on
# collab_finder_lib::platsbanken, with ParsedAd and PlatsbankenLead fields
# ad_id, api_relevance, rank_score, rank_reasons, and favorite_match.
# If lead_from_parsed takes a different today type, accept &str or add a
# public wrapper with that signature. Do not read the clock inside ranking.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRIVER="$ROOT/src-tauri/tests/qa_platsbanken_freshness_driver.rs"
LOG="$(mktemp)"

cleanup() {
  rm -f "$DRIVER" "$LOG"
}
trap cleanup EXIT

cat > "$DRIVER" << 'EOF'
use std::io::Write;

use collab_finder_lib::platsbanken::{lead_from_parsed, rank_leads, ParsedAd, PlatsbankenLead};

const TODAY: &str = "2026-10-02";
const GENERIC_TITLE: &str = "Software engineer";
const GENERIC_BODY: &str = "General software role.";
const FAVORITE_TITLE: &str = "Machine learning engineer";
const FAVORITE_BODY: &str = "Build machine learning systems.";

fn ad(
    id: &str,
    published: Option<&str>,
    relevance: f64,
    headline: &str,
    description: &str,
) -> ParsedAd {
    ParsedAd {
        ad_id: id.to_string(),
        headline: headline.to_string(),
        employer: "Example Employer AB".into(),
        municipality: None,
        occupation: None,
        webpage_url: format!("https://arbetsformedlingen.se/platsbanken/annonser/{id}"),
        application_url: None,
        publication_date: published.map(str::to_string),
        application_deadline: None,
        description_text: description.to_string(),
        api_relevance: relevance,
    }
}

fn generic(id: &str, published: Option<&str>, relevance: f64) -> ParsedAd {
    ad(id, published, relevance, GENERIC_TITLE, GENERIC_BODY)
}

fn favorite(id: &str, published: Option<&str>, relevance: f64) -> ParsedAd {
    ad(id, published, relevance, FAVORITE_TITLE, FAVORITE_BODY)
}

fn rank(ads: Vec<ParsedAd>) -> Vec<PlatsbankenLead> {
    rank_leads(
        ads.into_iter()
            .map(|item| lead_from_parsed(item, TODAY))
            .collect(),
    )
}

fn age_tag(lead: &PlatsbankenLead) -> Option<&str> {
    lead.rank_reasons.iter().find_map(|reason| {
        if reason.starts_with("fresh:") || reason.starts_with("stale:") || reason == "posted:unknown"
        {
            Some(reason.as_str())
        } else {
            None
        }
    })
}

fn find<'a>(leads: &'a [PlatsbankenLead], id: &str) -> &'a PlatsbankenLead {
    leads
        .iter()
        .find(|lead| lead.ad_id == id)
        .unwrap_or_else(|| panic!("missing lead {id}"))
}

fn position(leads: &[PlatsbankenLead], id: &str) -> usize {
    leads
        .iter()
        .position(|lead| lead.ad_id == id)
        .unwrap_or_else(|| panic!("missing lead {id}"))
}

fn num(score: f64) -> String {
    format!("{score:.1}")
}

fn same(left: f64, right: f64) -> bool {
    (left - right).abs() < 1e-9
}

struct Tally {
    failed: i32,
}

impl Tally {
    fn report(&mut self, ok: bool, name: &str, detail: &str) {
        if ok {
            println!("PASS {name}: {detail}");
        } else {
            self.failed += 1;
            println!("FAIL {name}: {detail}");
        }
    }
}

#[test]
fn freshness_qa() {
    let mut tally = Tally { failed: 0 };
    let board = rank(vec![
        generic("fresh-0d", Some("2026-10-02T00:00:00"), 10.0),
        generic("fresh-3d", Some("2026-09-29T00:00:00"), 10.0),
        generic("fresh-7d", Some("2026-09-25T00:00:00"), 10.0),
        generic("future", Some("2026-10-05T00:00:00"), 10.0),
        generic("neutral-8d", Some("2026-09-24T00:00:00"), 10.0),
        generic("neutral-30d", Some("2026-09-02T00:00:00"), 10.0),
        generic("neutral-60d", Some("2026-08-03T00:00:00"), 10.0),
        generic("stale-61d", Some("2026-08-02T00:00:00"), 10.0),
        generic("stale-140d", Some("2026-05-15T00:00:00"), 10.0),
        generic("unknown-missing", None, 10.0),
        generic("unknown-bad", Some("not-a-date"), 10.0),
        favorite("neutral-favorite", Some("2026-09-02T00:00:00"), 10.0),
        favorite("unknown-favorite", None, 10.0),
    ]);

    let fresh = find(&board, "fresh-3d");
    let stale = find(&board, "stale-140d");
    let neutral = find(&board, "neutral-30d");
    tally.report(
        position(&board, "fresh-3d") < position(&board, "stale-140d")
            && fresh.rank_score > stale.rank_score
            && same(fresh.api_relevance, stale.api_relevance)
            && !fresh.favorite_match
            && !stale.favorite_match,
        "fresh-vs-stale",
        &format!(
            "fresh-3d ({}, rank {}) is above stale-140d ({}, rank {}); relevance {} and {}",
            age_tag(fresh).unwrap_or("none"),
            num(fresh.rank_score),
            age_tag(stale).unwrap_or("none"),
            num(stale.rank_score),
            num(fresh.api_relevance),
            num(stale.api_relevance),
        ),
    );

    let fresh_samples = [
        ("fresh-0d", "fresh:0d"),
        ("fresh-3d", "fresh:3d"),
        ("fresh-7d", "fresh:7d"),
    ];
    let mut fresh_ok = true;
    let mut fresh_parts = Vec::new();
    for (id, expected) in fresh_samples {
        let lead = find(&board, id);
        let tag = age_tag(lead);
        let higher = lead.rank_score > neutral.rank_score;
        if tag != Some(expected) || !higher || lead.favorite_match {
            fresh_ok = false;
        }
        fresh_parts.push(format!(
            "{id} {} rank {} vs neutral {}",
            tag.unwrap_or("none"),
            num(lead.rank_score),
            num(neutral.rank_score),
        ));
    }
    tally.report(fresh_ok, "fresh-tag", &fresh_parts.join("; "));

    let future = find(&board, "future");
    let today_lead = find(&board, "fresh-0d");
    tally.report(
        age_tag(future) == Some("fresh:0d")
            && same(future.rank_score, today_lead.rank_score)
            && future.rank_score > neutral.rank_score,
        "future-date",
        &format!(
            "2026-10-05 is {} rank {}, same score as a posting from today ({})",
            age_tag(future).unwrap_or("none"),
            num(future.rank_score),
            num(today_lead.rank_score),
        ),
    );

    let neutral_ids = ["neutral-8d", "neutral-30d", "neutral-60d"];
    let neutral_favorite = find(&board, "neutral-favorite");
    let unknown_favorite = find(&board, "unknown-favorite");
    let mut neutral_ok = true;
    let mut neutral_parts = Vec::new();
    for id in neutral_ids {
        let lead = find(&board, id);
        if age_tag(lead).is_some() || !same(lead.rank_score, lead.api_relevance) || lead.favorite_match
        {
            neutral_ok = false;
        }
        neutral_parts.push(format!(
            "{id} tag {} rank {} relevance {}",
            age_tag(lead).unwrap_or("none"),
            num(lead.rank_score),
            num(lead.api_relevance),
        ));
    }
    if age_tag(neutral_favorite).is_some()
        || !neutral_favorite.favorite_match
        || !same(neutral_favorite.rank_score, unknown_favorite.rank_score)
        || neutral_favorite.rank_score <= neutral.rank_score
    {
        neutral_ok = false;
    }
    neutral_parts.push(format!(
        "neutral-favorite tag {} rank {} equals unknown-favorite rank {}",
        age_tag(neutral_favorite).unwrap_or("none"),
        num(neutral_favorite.rank_score),
        num(unknown_favorite.rank_score),
    ));
    tally.report(neutral_ok, "neutral-window", &neutral_parts.join("; "));

    let stale_61 = find(&board, "stale-61d");
    let stale_140 = find(&board, "stale-140d");
    tally.report(
        age_tag(stale_61) == Some("stale:61d")
            && age_tag(stale_140) == Some("stale:140d")
            && position(&board, "stale-61d") > position(&board, "fresh-0d")
            && stale_61.rank_score < today_lead.rank_score
            && stale_61.rank_score < neutral.rank_score
            && !stale_61.favorite_match,
        "stale-below-fresh",
        &format!(
            "stale-61d ({}, rank {}) and stale-140d ({}, rank {}) sit below fresh-0d (rank {}) and below neutral (rank {})",
            age_tag(stale_61).unwrap_or("none"),
            num(stale_61.rank_score),
            age_tag(stale_140).unwrap_or("none"),
            num(stale_140.rank_score),
            num(today_lead.rank_score),
            num(neutral.rank_score),
        ),
    );

    let mut page_ads = Vec::new();
    for n in 0..10 {
        page_ads.push(generic(
            &format!("fresh-{n:02}"),
            Some("2026-10-01T00:00:00"),
            2.0,
        ));
    }
    page_ads.push(favorite(
        "stale-favorite",
        Some("2026-01-01T00:00:00"),
        2.0,
    ));
    let page = rank(page_ads);
    let favorite_at = position(&page, "stale-favorite");
    let favorite_score = find(&page, "stale-favorite").rank_score;
    let favorite_flag = find(&page, "stale-favorite").favorite_match;
    let favorite_tag = age_tag(find(&page, "stale-favorite")).unwrap_or("none").to_string();
    let generic_score = find(&page, "fresh-00").rank_score;
    let generics_ok = page.iter().enumerate().all(|(index, lead)| {
        if !lead.ad_id.starts_with("fresh-") {
            return true;
        }
        !lead.favorite_match
            && age_tag(lead) == Some("fresh:1d")
            && favorite_score > lead.rank_score
            && favorite_at < index
    });
    tally.report(
        generics_ok && favorite_flag && favorite_tag == "stale:274d",
        "stale-favorite-above-generic",
        &format!(
            "stale-favorite ({favorite_tag}, rank {}, favorite {favorite_flag}) is above 10 fresh generic ads (rank {})",
            num(favorite_score),
            num(generic_score),
        ),
    );
    tally.report(
        favorite_at < 10,
        "stale-favorite-on-first-page",
        &format!(
            "stale-favorite is {} of {}",
            favorite_at + 1,
            page.len()
        ),
    );

    let missing = find(&board, "unknown-missing");
    let bad = find(&board, "unknown-bad");
    tally.report(
        age_tag(missing) == Some("posted:unknown")
            && age_tag(bad) == Some("posted:unknown")
            && same(missing.rank_score, neutral.rank_score)
            && same(bad.rank_score, bad.api_relevance)
            && same(missing.rank_score, missing.api_relevance)
            && same(unknown_favorite.rank_score, neutral_favorite.rank_score)
            && !missing.favorite_match
            && !bad.favorite_match,
        "unknown-date",
        &format!(
            "missing {} rank {} and not-a-date {} rank {} match the neutral score {}; unknown favorite rank {} matches neutral favorite {}",
            age_tag(missing).unwrap_or("none"),
            num(missing.rank_score),
            age_tag(bad).unwrap_or("none"),
            num(bad.rank_score),
            num(neutral.rank_score),
            num(unknown_favorite.rank_score),
            num(neutral_favorite.rank_score),
        ),
    );

    let inspected = [
        ("fresh-0d", Some("fresh:0d")),
        ("fresh-3d", Some("fresh:3d")),
        ("fresh-7d", Some("fresh:7d")),
        ("future", Some("fresh:0d")),
        ("neutral-30d", None),
        ("stale-61d", Some("stale:61d")),
        ("stale-140d", Some("stale:140d")),
        ("unknown-missing", Some("posted:unknown")),
        ("unknown-bad", Some("posted:unknown")),
    ];
    let mut reasons_ok = true;
    let mut reason_parts = Vec::new();
    for (id, expected) in inspected {
        let lead = find(&board, id);
        let tag = age_tag(lead);
        if tag != expected {
            reasons_ok = false;
        }
        reason_parts.push(format!("{id}={}", tag.unwrap_or("none")));
    }
    tally.report(reasons_ok, "reasons-visible", &reason_parts.join(", "));

    let _ = std::io::stdout().flush();
    assert_eq!(tally.failed, 0, "{} checks failed", tally.failed);
}
EOF

cd "$ROOT/src-tauri"
set +e
CARGO_TERM_COLOR=never cargo test --offline --test qa_platsbanken_freshness_driver -- --nocapture >"$LOG" 2>&1
status=$?
set -e

if grep -q -E '^(PASS|FAIL) ' "$LOG"; then
  grep -E '^(PASS|FAIL) ' "$LOG"
  cat << 'EOF'
MANUAL launch-app: On laptop-1 or laptop-2, open the app window with pnpm tauri dev or kanithanj.ai.
MANUAL sweden-rail: Click Sweden (Meta+5) and confirm the query field, Search button, rail chips, and location chips.
MANUAL live-search: Enter a query, optionally choose Stockholm, click Search, and wait until Results replaces Searching.
MANUAL row-and-card: Select a row and confirm the same age tag is on the row and on the selected card.
EOF
  if grep -q '^FAIL ' "$LOG"; then
    exit 1
  fi
  exit "$status"
fi

cat "$LOG" >&2
exit "$status"

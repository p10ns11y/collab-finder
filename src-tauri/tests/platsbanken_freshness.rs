use std::collections::HashMap;

use collab_finder_lib::platsbanken::{
    lead_from_parsed_for, rank_leads, score_favorites, ParsedAd, PlatsbankenLead,
};
use cucumber::{given, then, when, World as _};
use serde_json::json;

#[derive(cucumber::World, Debug, Default)]
struct FreshnessWorld {
    today: String,
    leads: HashMap<String, PlatsbankenLead>,
    baselines: HashMap<String, f64>,
    ranked: Vec<PlatsbankenLead>,
    last_alias: Option<String>,
}

fn baseline_score(ad: &ParsedAd) -> f64 {
    let (boost, _, _) = score_favorites(ad);
    ad.api_relevance + boost
}

fn make_ad(
    ad_id: &str,
    publication_date: Option<&str>,
    api_relevance: f64,
    headline: &str,
    description: &str,
) -> ParsedAd {
    let mut raw = json!({
        "id": ad_id,
        "headline": headline,
        "relevance": api_relevance,
        "employer": { "name": "Test Employer AB" },
        "webpage_url": format!("https://arbetsformedlingen.se/platsbanken/annonser/{ad_id}"),
        "description": { "text": description }
    });
    if let Some(date) = publication_date {
        raw["publication_date"] = json!(date);
    }
    collab_finder_lib::platsbanken::parse_ad_value(&raw).expect("fixture ad should parse")
}

fn freshness_tag(lead: &PlatsbankenLead) -> Option<&str> {
    lead.rank_reasons
        .iter()
        .find(|r| {
            r.starts_with("fresh:")
                || r.starts_with("stale:")
                || r.as_str() == "posted:unknown"
        })
        .map(|s| s.as_str())
}

fn rank_for_today(ad: ParsedAd, today: &str) -> PlatsbankenLead {
    lead_from_parsed_for(ad, today)
}

#[given(expr = "today is {string}")]
fn today_is(world: &mut FreshnessWorld, today: String) {
    world.today = today;
}

#[given(expr = "a Platsbanken lead published {string} with api relevance {float} and no favorite terms")]
fn lead_published(
    world: &mut FreshnessWorld,
    published: String,
    api_relevance: f64,
) {
    let ad_id = format!("pb-{}", world.leads.len() + 1);
    let ad = make_ad(
        &ad_id,
        Some(&published),
        api_relevance,
        "Software Engineer",
        "General software role.",
    );
    world.baselines.insert(ad_id.clone(), baseline_score(&ad));
    world.leads.insert(ad_id.clone(), rank_for_today(ad, &world.today));
    world.last_alias = Some(ad_id);
}

#[given(expr = "a Platsbanken lead with no publication date and api relevance {float} and no favorite terms")]
fn lead_no_date(world: &mut FreshnessWorld, api_relevance: f64) {
    let ad_id = format!("pb-{}", world.leads.len() + 1);
    let ad = make_ad(
        &ad_id,
        None,
        api_relevance,
        "Software Engineer",
        "General software role.",
    );
    world.baselines.insert(ad_id.clone(), baseline_score(&ad));
    world.leads.insert(ad_id.clone(), rank_for_today(ad, &world.today));
    world.last_alias = Some(ad_id);
}


#[given(expr = "a Platsbanken lead {string} published {string} with api relevance {float} and no favorite terms")]
fn named_lead_published(
    world: &mut FreshnessWorld,
    alias: String,
    published: String,
    api_relevance: f64,
) {
    let ad_id = alias.clone();
    let headline = format!("Role {}", alias);
    let ad = make_ad(
        &ad_id,
        Some(&published),
        api_relevance,
        &headline,
        "General software role.",
    );
    world.baselines.insert(alias.clone(), baseline_score(&ad));
    world.leads.insert(alias.clone(), rank_for_today(ad, &world.today));
    world.last_alias = Some(alias);
}

#[given(expr = "a Platsbanken lead {string} with no publication date and api relevance {float} and no favorite terms")]
fn named_lead_no_date(world: &mut FreshnessWorld, alias: String, api_relevance: f64) {
    let headline = format!("Role {}", alias);
    let ad = make_ad(
        &alias,
        None,
        api_relevance,
        &headline,
        "General software role.",
    );
    world.baselines.insert(alias.clone(), baseline_score(&ad));
    world.leads.insert(alias.clone(), rank_for_today(ad, &world.today));
    world.last_alias = Some(alias);
}

#[given(expr = "a Platsbanken lead {string} published {string} with api relevance {float} and favorite term {string}")]
fn named_lead_with_favorite(
    world: &mut FreshnessWorld,
    alias: String,
    published: String,
    api_relevance: f64,
    favorite: String,
) {
    let headline = format!("Role {}", alias);
    let description = format!("We need a {favorite} specialist.");
    let ad = make_ad(
        &alias,
        Some(&published),
        api_relevance,
        &headline,
        &description,
    );
    world.baselines.insert(alias.clone(), baseline_score(&ad));
    world.leads.insert(alias.clone(), rank_for_today(ad, &world.today));
    world.last_alias = Some(alias);
}

#[when(expr = "the lead is ranked for publication freshness")]
fn rank_single(world: &mut FreshnessWorld) {
    let alias = world
        .last_alias
        .clone()
        .expect("no lead staged for freshness ranking");
    let lead = world.leads.get(&alias).expect("lead missing").clone();
    world.ranked = rank_leads(vec![lead]);
}

#[when(expr = "the lead is ranked for publication freshness again")]
fn rank_single_again(world: &mut FreshnessWorld) {
    let alias = world
        .last_alias
        .clone()
        .expect("no lead staged for freshness ranking");
    let ad = {
        let lead = world.leads.get(&alias).expect("lead missing");
        make_ad(
            &lead.ad_id,
            lead.publication_date.as_deref(),
            lead.api_relevance,
            &lead.headline,
            "General software role.",
        )
    };
    let refreshed = rank_for_today(ad, &world.today);
    world.leads.insert(alias.clone(), refreshed);
    world.ranked = rank_leads(vec![world.leads.get(&alias).unwrap().clone()]);
}

#[when(expr = "the leads are ranked together")]
fn rank_all(world: &mut FreshnessWorld) {
    let leads: Vec<PlatsbankenLead> = world.leads.values().cloned().collect();
    world.ranked = rank_leads(leads);
}

#[then(expr = "the rank reasons include {string}")]
fn reasons_include(world: &mut FreshnessWorld, expected: String) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    assert!(
        lead.rank_reasons.iter().any(|r| r == &expected),
        "expected rank reason '{expected}' in {:?}; publication freshness not implemented yet",
        lead.rank_reasons
    );
}

#[then(expr = "the rank reasons have no freshness tag")]
fn reasons_no_freshness_tag(world: &mut FreshnessWorld) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    assert!(
        freshness_tag(lead).is_none(),
        "expected no freshness tag, got {:?}; neutral bucket not implemented yet",
        lead.rank_reasons
    );
}

#[then(expr = "the freshness score adjustment is positive")]
fn adjustment_positive(world: &mut FreshnessWorld) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    let alias = world.last_alias.clone().expect("lead alias");
    let baseline = world.baselines.get(&alias).expect("baseline");
    assert!(
        lead.rank_score > *baseline,
        "expected rank_score {} > baseline {}; fresh boost not implemented yet",
        lead.rank_score,
        baseline
    );
}

#[then(expr = "the freshness score adjustment is zero")]
fn adjustment_zero(world: &mut FreshnessWorld) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    let alias = world.last_alias.clone().expect("lead alias");
    let baseline = world.baselines.get(&alias).expect("baseline");
    assert!(
        (lead.rank_score - *baseline).abs() < f64::EPSILON,
        "expected rank_score {} == baseline {}; neutral freshness not implemented yet",
        lead.rank_score,
        baseline
    );
}

#[then(expr = "the freshness score adjustment is negative")]
fn adjustment_negative(world: &mut FreshnessWorld) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    let alias = world.last_alias.clone().expect("lead alias");
    let baseline = world.baselines.get(&alias).expect("baseline");
    assert!(
        lead.rank_score < *baseline,
        "expected rank_score {} < baseline {}; stale demotion not implemented yet",
        lead.rank_score,
        baseline
    );
}

#[then(expr = "{string} appears before {string} in the results")]
fn appears_before(world: &mut FreshnessWorld, first: String, second: String) {
    let first_idx = world
        .ranked
        .iter()
        .position(|l| l.ad_id == first)
        .expect("first lead missing from ranked results");
    let second_idx = world
        .ranked
        .iter()
        .position(|l| l.ad_id == second)
        .expect("second lead missing from ranked results");
    assert!(
        first_idx < second_idx,
        "expected {first} before {second}; got order {:?}; freshness ordering not implemented yet",
        world
            .ranked
            .iter()
            .map(|l| l.ad_id.as_str())
            .collect::<Vec<_>>()
    );
}

#[then(expr = "{string} has rank reason {string}")]
fn alias_has_reason(world: &mut FreshnessWorld, alias: String, expected: String) {
    let lead = world
        .ranked
        .iter()
        .find(|l| l.ad_id == alias)
        .expect("alias missing from ranked results");
    assert!(
        lead.rank_reasons.iter().any(|r| r == &expected),
        "expected {alias} to have reason '{expected}' in {:?}",
        lead.rank_reasons
    );
}

#[then(expr = "{string} has rank reason matching {string}")]
fn alias_has_reason_prefix(world: &mut FreshnessWorld, alias: String, prefix: String) {
    let lead = world
        .ranked
        .iter()
        .find(|l| l.ad_id == alias)
        .expect("alias missing from ranked results");
    assert!(
        lead.rank_reasons.iter().any(|r| r.starts_with(&prefix)),
        "expected {alias} to have reason starting with '{prefix}' in {:?}",
        lead.rank_reasons
    );
}

#[then(expr = "{string} still appears in the first {int} results")]
fn alias_in_first_n(world: &mut FreshnessWorld, alias: String, n: i32) {
    let n = n as usize;
    let visible = world.ranked.iter().take(n).any(|l| l.ad_id == alias);
    assert!(
        visible,
        "expected {alias} in first {n} results; stale bury guard not implemented yet"
    );
}

#[then(expr = "{string} rank score equals its pre-freshness baseline")]
fn alias_equals_baseline(world: &mut FreshnessWorld, alias: String) {
    let lead = world
        .ranked
        .iter()
        .find(|l| l.ad_id == alias)
        .expect("alias missing from ranked results");
    let baseline = world.baselines.get(&alias).expect("baseline");
    assert!(
        (lead.rank_score - *baseline).abs() < f64::EPSILON,
        "expected {alias} rank_score {} == baseline {}",
        lead.rank_score,
        baseline
    );
}

#[tokio::main]
async fn main() {
    FreshnessWorld::run("tests/features/platsbanken_freshness.feature").await;
}

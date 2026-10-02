use std::collections::HashMap;

use collab_finder_lib::platsbanken::{
    lead_from_parsed, parse_ad_value, rank_leads, score_favorites, ParsedAd, PlatsbankenLead,
};
use cucumber::{given, then, when, World as _};
use serde_json::json;

#[derive(Debug)]
struct Staged {
    ad: ParsedAd,
    baseline: f64,
}

#[derive(cucumber::World, Debug, Default)]
struct FreshnessWorld {
    today: String,
    staged: HashMap<String, Staged>,
    ranked: Vec<PlatsbankenLead>,
    last_alias: Option<String>,
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
    parse_ad_value(&raw).expect("fixture ad should parse")
}

fn stage(
    world: &mut FreshnessWorld,
    alias: String,
    publication_date: Option<&str>,
    api_relevance: f64,
    description: &str,
) {
    let headline = format!("Role {alias}");
    let ad = make_ad(
        &alias,
        publication_date,
        api_relevance,
        &headline,
        description,
    );
    let (boost, _, _) = score_favorites(&ad);
    let baseline = ad.api_relevance + boost;
    world.staged.insert(alias.clone(), Staged { ad, baseline });
    world.last_alias = Some(alias);
}

fn is_pre_existing_reason(reason: &str) -> bool {
    reason.starts_with("favorite:")
        || reason == "ml_ai_robotics_boost"
        || reason.starts_with("api_relevance:")
}

fn age_tags(lead: &PlatsbankenLead) -> Vec<&str> {
    lead.rank_reasons
        .iter()
        .filter(|reason| !is_pre_existing_reason(reason))
        .map(|reason| reason.as_str())
        .collect()
}

fn assert_age_tag(lead: &PlatsbankenLead, tag: &str) {
    let tags = age_tags(lead);
    if tag == "none" {
        assert!(
            tags.is_empty(),
            "expected no age tag, got {:?}",
            lead.rank_reasons
        );
    } else {
        assert_eq!(tags, vec![tag], "reasons {:?}", lead.rank_reasons);
    }
}

fn lead_named<'a>(world: &'a FreshnessWorld, alias: &str) -> &'a PlatsbankenLead {
    world
        .ranked
        .iter()
        .find(|lead| lead.ad_id == alias)
        .unwrap_or_else(|| panic!("alias {alias} missing from ranked results"))
}

fn rank_one(world: &FreshnessWorld, alias: &str) -> PlatsbankenLead {
    let staged = world.staged.get(alias).expect("lead missing");
    lead_from_parsed(staged.ad.clone(), &world.today)
}

#[given(expr = "today is {string}")]
fn today_is(world: &mut FreshnessWorld, today: String) {
    world.today = today;
}

#[given(
    expr = "a Platsbanken lead published {string} with api relevance {float} and no favorite terms"
)]
fn lead_published(world: &mut FreshnessWorld, published: String, api_relevance: f64) {
    let alias = format!("pb-{}", world.staged.len() + 1);
    stage(
        world,
        alias,
        Some(&published),
        api_relevance,
        "General software role.",
    );
}

#[given(
    expr = "a Platsbanken lead with no publication date and api relevance {float} and no favorite terms"
)]
fn lead_no_date(world: &mut FreshnessWorld, api_relevance: f64) {
    let alias = format!("pb-{}", world.staged.len() + 1);
    stage(world, alias, None, api_relevance, "General software role.");
}

#[given(
    expr = "a Platsbanken lead {string} published {string} with api relevance {float} and no favorite terms"
)]
fn named_lead_published(
    world: &mut FreshnessWorld,
    alias: String,
    published: String,
    api_relevance: f64,
) {
    stage(
        world,
        alias,
        Some(&published),
        api_relevance,
        "General software role.",
    );
}

#[given(
    expr = "a Platsbanken lead {string} with no publication date and api relevance {float} and no favorite terms"
)]
fn named_lead_no_date(world: &mut FreshnessWorld, alias: String, api_relevance: f64) {
    stage(world, alias, None, api_relevance, "General software role.");
}

#[given(
    expr = "a Platsbanken lead {string} published {string} with api relevance {float} and favorite term {string}"
)]
fn named_lead_with_favorite(
    world: &mut FreshnessWorld,
    alias: String,
    published: String,
    api_relevance: f64,
    favorite: String,
) {
    stage(
        world,
        alias,
        Some(&published),
        api_relevance,
        &format!("We need a {favorite} specialist."),
    );
}

#[given(expr = "{int} fresh generic leads published {string} with api relevance {float}")]
fn fresh_generics(world: &mut FreshnessWorld, count: i32, published: String, api_relevance: f64) {
    for index in 1..=count {
        stage(
            world,
            format!("fresh-generic-{index}"),
            Some(&published),
            api_relevance,
            "General software role.",
        );
    }
}

#[when(expr = "the lead is ranked for publication freshness")]
fn rank_single(world: &mut FreshnessWorld) {
    let alias = world
        .last_alias
        .clone()
        .expect("no lead staged for freshness ranking");
    world.ranked = rank_leads(vec![rank_one(world, &alias)]);
}

#[when(expr = "the leads are ranked together")]
fn rank_all(world: &mut FreshnessWorld) {
    let aliases: Vec<String> = world.staged.keys().cloned().collect();
    let leads = aliases.iter().map(|alias| rank_one(world, alias)).collect();
    world.ranked = rank_leads(leads);
}

#[then(expr = "the publication age tag is {string}")]
fn age_tag_of_last(world: &mut FreshnessWorld, tag: String) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    assert_age_tag(lead, &tag);
}

#[then(expr = "{string} publication age tag is {string}")]
fn age_tag_of_alias(world: &mut FreshnessWorld, alias: String, tag: String) {
    assert_age_tag(lead_named(world, &alias), &tag);
}

#[then(expr = "the freshness score adjustment is {word}")]
fn adjustment(world: &mut FreshnessWorld, direction: String) {
    let lead = world
        .ranked
        .first()
        .expect("ranked list should have a lead");
    let alias = world.last_alias.as_deref().expect("lead alias");
    let baseline = world.staged.get(alias).expect("baseline").baseline;
    let delta = lead.rank_score - baseline;
    match direction.as_str() {
        "positive" => assert!(delta > 0.0, "rank {} baseline {baseline}", lead.rank_score),
        "zero" => assert!(
            delta.abs() < 1e-9,
            "rank {} baseline {baseline}",
            lead.rank_score
        ),
        "negative" => assert!(delta < 0.0, "rank {} baseline {baseline}", lead.rank_score),
        other => panic!("unknown adjustment direction {other}"),
    }
}

#[then(expr = "{string} appears before {string} in the results")]
fn appears_before(world: &mut FreshnessWorld, first: String, second: String) {
    let first_idx = world
        .ranked
        .iter()
        .position(|lead| lead.ad_id == first)
        .unwrap_or_else(|| panic!("{first} missing from ranked results"));
    let second_idx = world
        .ranked
        .iter()
        .position(|lead| lead.ad_id == second)
        .unwrap_or_else(|| panic!("{second} missing from ranked results"));
    assert!(
        first_idx < second_idx,
        "expected {first} before {second}; got {:?}",
        world
            .ranked
            .iter()
            .map(|lead| lead.ad_id.as_str())
            .collect::<Vec<_>>()
    );
}

#[then(expr = "{string} appears before every fresh generic lead")]
fn before_generics(world: &mut FreshnessWorld, alias: String) {
    let alias_idx = world
        .ranked
        .iter()
        .position(|lead| lead.ad_id == alias)
        .unwrap_or_else(|| panic!("{alias} missing from ranked results"));
    let generics: Vec<_> = world
        .ranked
        .iter()
        .enumerate()
        .filter(|(_, lead)| lead.ad_id.starts_with("fresh-generic-"))
        .collect();
    assert!(!generics.is_empty(), "no fresh generic leads were ranked");
    for (index, lead) in generics {
        assert!(
            alias_idx < index,
            "{alias} at {alias_idx} is not before {} at {index}",
            lead.ad_id
        );
    }
}

#[then(expr = "{string} still appears in the first {int} results")]
fn alias_in_first_n(world: &mut FreshnessWorld, alias: String, n: i32) {
    let n = n as usize;
    let visible = world.ranked.iter().take(n).any(|lead| lead.ad_id == alias);
    assert!(
        visible,
        "expected {alias} in the first {n} of {} results",
        world.ranked.len()
    );
}

#[then(expr = "{string} rank score equals {string} rank score")]
fn scores_equal(world: &mut FreshnessWorld, left: String, right: String) {
    let left_score = lead_named(world, &left).rank_score;
    let right_score = lead_named(world, &right).rank_score;
    assert!(
        (left_score - right_score).abs() < 1e-9,
        "{left} score {left_score} != {right} score {right_score}"
    );
}

#[then(expr = "{string} rank score equals its pre-freshness baseline")]
fn alias_equals_baseline(world: &mut FreshnessWorld, alias: String) {
    let score = lead_named(world, &alias).rank_score;
    let baseline = world.staged.get(&alias).expect("baseline").baseline;
    assert!(
        (score - baseline).abs() < 1e-9,
        "{alias} rank {score} != baseline {baseline}"
    );
}

#[tokio::main]
async fn main() {
    // Cargo forwards the lib filter (`platsbanken`) to every selected target.
    // This harness runs the whole feature file and does not take that filter.
    FreshnessWorld::cucumber()
        .with_default_cli()
        .run_and_exit("tests/features/platsbanken_freshness.feature")
        .await;
}

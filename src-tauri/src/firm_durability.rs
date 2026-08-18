//! Firm durability scorer v1 — fortress cash, AI-wave relevance, hiring theatre gate.
//!
//! Universe: `data/durability/universe.v1.json` (public IR only).
//! Persistence: SQLite snapshots (see `db.rs` v9). Not Neo4j — see README.

use serde::{Deserialize, Serialize};

const UNIVERSE_JSON: &str = include_str!("../../data/durability/universe.v1.json");
pub const ALGORITHM_VERSION: &str = "v1";

const DEPTH_SLOTS: usize = 7;
const WIDTH_SLOTS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DepthGeo {
    Sweden,
    Nordics,
    Europe,
    Estonia,
    UnitedStates,
    Japan,
    Singapore,
    Other,
}

impl DepthGeo {
    pub fn is_depth(self) -> bool {
        matches!(
            self,
            DepthGeo::Sweden | DepthGeo::Nordics | DepthGeo::Europe | DepthGeo::Estonia
        )
    }

    pub fn is_width(self) -> bool {
        matches!(
            self,
            DepthGeo::UnitedStates | DepthGeo::Japan | DepthGeo::Singapore
        )
    }

    pub fn bonus(self) -> i32 {
        match self {
            DepthGeo::Sweden => 16,
            DepthGeo::Nordics => 12,
            DepthGeo::Europe => 8,
            DepthGeo::Estonia => 6,
            DepthGeo::UnitedStates | DepthGeo::Japan | DepthGeo::Singapore => 4,
            DepthGeo::Other => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashEvidence {
    pub fy: Option<u16>,
    pub currency: Option<String>,
    pub scale: Option<String>,
    pub revenue: Option<f64>,
    pub profit: Option<f64>,
    pub profit_kind: Option<String>,
    pub fcf: Option<f64>,
    pub fcf_kind: Option<String>,
    pub net_cash: Option<f64>,
    pub order_backlog: Option<f64>,
    pub operating_margin_pct: Option<f64>,
    pub source: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmRecord {
    pub id: String,
    pub name: String,
    pub hq: String,
    pub depth_geo: DepthGeo,
    pub product_class: String,
    pub theater_saas: bool,
    pub product_moat: u8,
    pub ai_tsunami: u8,
    pub fortress: u8,
    pub hiring_signal: u8,
    pub spacexai_vector: u8,
    pub cash: Option<CashEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniverseFile {
    pub algorithm_version: String,
    pub scored_at: String,
    pub firms: Vec<FirmRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileMatch {
    pub score: i32,
    pub hits: Vec<String>,
    pub misses: Vec<String>,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchProcedure {
    pub name: String,
    pub steps: Vec<String>,
    pub gates: Vec<String>,
    pub weights: String,
    pub split: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedFirm {
    pub firm_id: String,
    pub name: String,
    pub admitted: bool,
    pub band: String,
    pub total: i32,
    pub quality: i32,
    pub geo_bonus: i32,
    pub exclude_reason: Option<String>,
    pub product_class: String,
    pub depth_geo: DepthGeo,
    pub cash_line: String,
    pub source: Option<String>,
    pub fortress: u8,
    pub product_moat: u8,
    pub ai_tsunami: u8,
    pub hiring_signal: u8,
    pub spacexai_vector: u8,
    pub profile: ProfileMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationResult {
    pub algorithm_version: String,
    pub scored_at: String,
    pub wave: u32,
    pub remaining: u32,
    pub exhausted: bool,
    pub exclude_ids: Vec<String>,
    pub top10: Vec<RankedFirm>,
    pub depth: Vec<RankedFirm>,
    pub width: Vec<RankedFirm>,
    pub excluded: Vec<RankedFirm>,
    pub procedure: SearchProcedure,
    pub store: String,
}

#[derive(Debug, Clone)]
struct Scored<'a> {
    firm: &'a FirmRecord,
    admitted: bool,
    exclude_reason: Option<&'static str>,
    quality: i32,
    geo_bonus: i32,
    total: i32,
}

fn clamp_axis(v: u8) -> i32 {
    i32::from(v.min(4))
}

fn score_one(firm: &FirmRecord) -> Scored<'_> {
    let geo_bonus = firm.depth_geo.bonus();
    let quality = 8 * clamp_axis(firm.spacexai_vector)
        + 7 * clamp_axis(firm.fortress)
        + 6 * clamp_axis(firm.ai_tsunami)
        + 6 * clamp_axis(firm.product_moat)
        + 5 * clamp_axis(firm.hiring_signal);

    let (admitted, exclude_reason) = if firm.theater_saas {
        (false, Some("theater_saas"))
    } else if firm.hiring_signal == 0 {
        (false, Some("hiring_theatre"))
    } else if firm.fortress < 2 {
        (false, Some("fortress_lt_2"))
    } else if firm.product_moat < 2 {
        (false, Some("product_moat_lt_2"))
    } else {
        (true, None)
    };

    Scored {
        firm,
        admitted,
        exclude_reason,
        quality,
        geo_bonus,
        total: quality + geo_bonus,
    }
}

fn cash_line(firm: &FirmRecord) -> String {
    let Some(c) = firm.cash.as_ref() else {
        return "no cash row".into();
    };
    let cur = c.currency.as_deref().unwrap_or("?");
    let fy = c.fy.map(|y| y.to_string()).unwrap_or_else(|| "?".into());
    let mut parts = Vec::new();
    if let Some(r) = c.revenue {
        parts.push(format!("rev {r} {cur}b"));
    }
    if let Some(p) = c.profit {
        let kind = c.profit_kind.as_deref().unwrap_or("profit");
        parts.push(format!("{kind} {p} {cur}b"));
    }
    if let Some(f) = c.fcf {
        let kind = c.fcf_kind.as_deref().unwrap_or("fcf");
        parts.push(format!("{kind} {f} {cur}b"));
    }
    if let Some(n) = c.net_cash {
        parts.push(format!("net cash {n} {cur}b"));
    }
    if let Some(b) = c.order_backlog {
        parts.push(format!("backlog {b} {cur}b"));
    }
    if parts.is_empty() {
        return c
            .note
            .clone()
            .unwrap_or_else(|| format!("FY{fy} numbers not pulled"));
    }
    format!("FY{fy} {}", parts.join(" · "))
}

fn band_of(firm: &FirmRecord) -> &'static str {
    if firm.depth_geo.is_depth() {
        "depth"
    } else if firm.depth_geo.is_width() {
        "width"
    } else {
        "other"
    }
}

pub fn search_procedure() -> SearchProcedure {
    SearchProcedure {
        name: "fortress-wave-v1".into(),
        steps: vec![
            "Load public-IR universe (no apply state)".into(),
            "Hard-gate: theatre SaaS, fortress<2, moat<2, hiring=0".into(),
            "Score quality + geo (Sweden first, then Nordics/EU, then US/JP/SG)".into(),
            "Take 7 depth + 3 width (SpaceXAI held in width if still live)".into(),
            "Persist wave; next wave excludes those ids".into(),
        ],
        gates: vec![
            "theater_saas".into(),
            "fortress_lt_2".into(),
            "product_moat_lt_2".into(),
            "hiring_theatre".into(),
        ],
        weights: "8·spacexai + 7·fortress + 6·ai_wave + 6·moat + 5·hiring + geo".into(),
        split: "7 depth (SE→Nordics→EU→EE) + 3 width (US first, JP/SG)".into(),
    }
}

/// Local dual-fit vs locked candidate constraints — no model, no network.
pub fn profile_match_firm(firm: &FirmRecord) -> ProfileMatch {
    let mut hits = Vec::new();
    let mut misses = Vec::new();
    let mut pts = 0;
    let mut max = 0;

    max += 25;
    if matches!(
        firm.depth_geo,
        DepthGeo::Sweden | DepthGeo::Nordics | DepthGeo::Europe
    ) {
        pts += 25;
        hits.push(format!("geo:{:?}", firm.depth_geo));
    } else if firm.depth_geo.is_width() && firm.spacexai_vector >= 3 {
        pts += 16;
        hits.push("geo:width_high_vector".into());
    } else {
        misses.push("geo:not_depth".into());
    }

    max += 20;
    if !firm.theater_saas && firm.hiring_signal > 0 {
        pts += 20;
        hits.push("not_theatre_saas".into());
    } else {
        misses.push("theatre_or_hiring_zero".into());
    }

    max += 20;
    if firm.fortress >= 3 {
        pts += 20;
        hits.push(format!("fortress:{}", firm.fortress));
    } else {
        misses.push(format!("fortress:{}", firm.fortress));
    }

    max += 20;
    if firm.spacexai_vector >= 3 {
        pts += 20;
        hits.push(format!("spacexai_vector:{}", firm.spacexai_vector));
    } else if firm.spacexai_vector >= 2 {
        pts += 10;
        hits.push("spacexai_vector:partial".into());
    } else {
        misses.push("spacexai_vector:low".into());
    }

    max += 15;
    if firm.ai_tsunami >= 3 && firm.product_moat >= 3 {
        pts += 15;
        hits.push("physical_or_infra_moat".into());
    } else {
        misses.push("weak_ai_wave_or_moat".into());
    }

    ProfileMatch {
        score: if max == 0 { 0 } else { (pts * 100) / max },
        hits,
        misses,
        method: "local_constraints".into(),
    }
}

const WANT_ROLE: &[&str] = &[
    "software",
    "fullstack",
    "full-stack",
    "backend",
    "frontend",
    "rust",
    "typescript",
    "react",
    "agent",
    "orchestr",
    "robot",
    "embedded",
    "autonom",
    "inference",
    "platform",
    "systems",
    "firmware",
    "ml ",
    "machine learning",
];
const SKIP_ROLE: &[&str] = &[
    "intern",
    "internship",
    "account executive",
    "sales representative",
    "employer branding",
    "hr business",
    "marketing coordinator",
];

/// Cheap on-the-fly role match (title + JD). No xAI.
pub fn local_role_match(title: &str, company: &str, location: &str, jd: &str) -> ProfileMatch {
    let hay = format!("{title} {company} {location} {jd}").to_ascii_lowercase();
    let mut hits = Vec::new();
    let mut misses = Vec::new();
    if SKIP_ROLE.iter().any(|t| hay.contains(t)) {
        return ProfileMatch {
            score: 8,
            hits,
            misses: vec!["skip_role_pattern".into()],
            method: "local_jd_overlap".into(),
        };
    }
    let mut hit_n = 0;
    for kw in WANT_ROLE {
        if hay.contains(kw) {
            hit_n += 1;
            if hits.len() < 8 {
                hits.push(format!("kw:{kw}"));
            }
        }
    }
    if hay.contains("stockholm") || hay.contains("sweden") || hay.contains("sverige") {
        hits.push("geo:sweden_text".into());
        hit_n += 2;
    }
    if hit_n == 0 {
        misses.push("no_role_keywords".into());
    }
    let score = (hit_n * 12).min(100) as i32;
    ProfileMatch {
        score,
        hits,
        misses,
        method: "local_jd_overlap".into(),
    }
}

pub fn blend_match(firm: Option<&ProfileMatch>, role: &ProfileMatch) -> ProfileMatch {
    let fs = firm.map(|m| m.score).unwrap_or(role.score);
    let score = (fs * 45 + role.score * 55) / 100;
    let mut hits = role.hits.clone();
    if let Some(f) = firm {
        hits.extend(f.hits.iter().cloned());
    }
    let mut misses = role.misses.clone();
    if let Some(f) = firm {
        misses.extend(f.misses.iter().cloned());
    }
    hits.truncate(10);
    misses.truncate(8);
    ProfileMatch {
        score,
        hits,
        misses,
        method: "local_firm+role".into(),
    }
}

fn to_ranked(s: &Scored<'_>) -> RankedFirm {
    RankedFirm {
        firm_id: s.firm.id.clone(),
        name: s.firm.name.clone(),
        admitted: s.admitted,
        band: band_of(s.firm).into(),
        total: s.total,
        quality: s.quality,
        geo_bonus: s.geo_bonus,
        exclude_reason: s.exclude_reason.map(str::to_string),
        product_class: s.firm.product_class.clone(),
        depth_geo: s.firm.depth_geo,
        cash_line: cash_line(s.firm),
        source: s.firm.cash.as_ref().and_then(|c| c.source.clone()),
        fortress: s.firm.fortress,
        product_moat: s.firm.product_moat,
        ai_tsunami: s.firm.ai_tsunami,
        hiring_signal: s.firm.hiring_signal,
        spacexai_vector: s.firm.spacexai_vector,
        profile: profile_match_firm(s.firm),
    }
}

fn sort_admitted(mut rows: Vec<Scored<'_>>) -> Vec<Scored<'_>> {
    rows.sort_by(|a, b| {
        b.total
            .cmp(&a.total)
            .then_with(|| b.quality.cmp(&a.quality))
            .then_with(|| a.firm.id.cmp(&b.firm.id))
    });
    rows
}

pub fn load_universe() -> Result<UniverseFile, String> {
    serde_json::from_str(UNIVERSE_JSON).map_err(|e| format!("durability universe: {e}"))
}

pub fn run_iteration() -> IterationResult {
    run_wave(&[], 1)
}

/// Next top-10: same procedure, skip `exclude` firm ids (prior waves).
pub fn run_wave(exclude: &[String], wave: u32) -> IterationResult {
    let uni = load_universe().expect("universe.v1.json must parse");
    let skip: std::collections::HashSet<&str> = exclude.iter().map(String::as_str).collect();
    let scored: Vec<Scored<'_>> = uni.firms.iter().map(score_one).collect();

    let gated: Vec<RankedFirm> = scored
        .iter()
        .filter(|s| !s.admitted)
        .map(to_ranked)
        .collect();

    let depth = sort_admitted(
        scored
            .iter()
            .filter(|s| s.admitted && s.firm.depth_geo.is_depth() && !skip.contains(s.firm.id.as_str()))
            .cloned()
            .collect(),
    );
    let width = sort_admitted(
        scored
            .iter()
            .filter(|s| s.admitted && s.firm.depth_geo.is_width() && !skip.contains(s.firm.id.as_str()))
            .cloned()
            .collect(),
    );

    let mut top10: Vec<RankedFirm> = Vec::new();
    for s in depth.iter().take(DEPTH_SLOTS) {
        top10.push(to_ranked(s));
    }
    let mut width_pick: Vec<&Scored<'_>> = Vec::new();
    if let Some(sx) = width.iter().find(|s| s.firm.id == "spacexai") {
        width_pick.push(sx);
    }
    for s in &width {
        if width_pick.len() >= WIDTH_SLOTS {
            break;
        }
        if width_pick.iter().any(|p| p.firm.id == s.firm.id) {
            continue;
        }
        width_pick.push(s);
    }
    for s in width_pick {
        top10.push(to_ranked(s));
    }

    let picked: std::collections::HashSet<&str> =
        top10.iter().map(|r| r.firm_id.as_str()).collect();
    let remaining = scored
        .iter()
        .filter(|s| {
            s.admitted
                && !skip.contains(s.firm.id.as_str())
                && !picked.contains(s.firm.id.as_str())
        })
        .count() as u32;

    IterationResult {
        algorithm_version: if uni.algorithm_version.is_empty() {
            ALGORITHM_VERSION.to_string()
        } else {
            uni.algorithm_version
        },
        scored_at: uni.scored_at,
        wave,
        remaining,
        exhausted: top10.is_empty(),
        exclude_ids: exclude.to_vec(),
        top10,
        depth: depth.iter().map(to_ranked).collect(),
        width: width.iter().map(to_ranked).collect(),
        excluded: gated,
        procedure: search_procedure(),
        store: "sqlite+json — not neo4j".into(),
    }
}

pub fn score_for_id(id: &str) -> Option<RankedFirm> {
    let uni = load_universe().ok()?;
    uni.firms
        .iter()
        .find(|f| f.id == id)
        .map(|f| to_ranked(&score_one(f)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn universe_parses_and_has_evidence() {
        let uni = load_universe().unwrap();
        assert_eq!(uni.algorithm_version, "v1");
        assert!(uni.firms.len() >= 20);
        let ericsson = uni.firms.iter().find(|f| f.id == "ericsson").unwrap();
        let cash = ericsson.cash.as_ref().unwrap();
        assert_eq!(cash.revenue, Some(236.681));
        assert_eq!(cash.net_cash, Some(61.2));
    }

    #[test]
    fn gates_drop_theater_and_venture() {
        let it = run_iteration();
        let excluded: HashSet<&str> = it
            .excluded
            .iter()
            .map(|r| r.firm_id.as_str())
            .collect();
        for id in [
            "klarna", "spotify", "wolt", "gitlab", "hive", "einride", "figure", "agility", "pi",
            "onex", "bolt",
        ] {
            assert!(excluded.contains(id), "{id} should be excluded");
        }
        assert!(it
            .excluded
            .iter()
            .all(|r| !r.admitted && r.exclude_reason.is_some()));
    }

    #[test]
    fn estonia_has_no_admitted_fortress() {
        let it = run_iteration();
        assert!(it
            .depth
            .iter()
            .all(|r| r.depth_geo != DepthGeo::Estonia));
    }

    #[test]
    fn iteration_top10_is_seven_depth_three_width() {
        let it = run_iteration();
        assert_eq!(it.top10.len(), 10);
        let depth_n = it.top10.iter().filter(|r| r.band == "depth").count();
        let width_n = it.top10.iter().filter(|r| r.band == "width").count();
        assert_eq!(depth_n, DEPTH_SLOTS);
        assert_eq!(width_n, WIDTH_SLOTS);
        assert!(it.top10.iter().all(|r| r.admitted));
        assert!(it.top10.iter().any(|r| r.firm_id == "spacexai"));
        assert!(it.top10.iter().any(|r| r.firm_id == "saab"));
        assert!(it.top10.iter().any(|r| r.firm_id == "atlas_copco"));
        assert!(it.top10.iter().any(|r| r.firm_id == "abb"));
        assert!(!it.top10.iter().any(|r| r.firm_id == "klarna"));
    }

    #[test]
    fn abb_outranks_consumer_auto_on_depth() {
        let it = run_iteration();
        let abb = it.depth.iter().find(|r| r.firm_id == "abb").unwrap();
        let cars = score_for_id("volvo_cars").unwrap();
        assert!(abb.total > cars.total);
        assert!(cars.admitted);
    }

    #[test]
    fn next_wave_does_not_repeat_ids() {
        let w1 = run_iteration();
        let ids: Vec<String> = w1.top10.iter().map(|r| r.firm_id.clone()).collect();
        let w2 = run_wave(&ids, 2);
        let overlap: Vec<_> = w2
            .top10
            .iter()
            .filter(|r| ids.iter().any(|id| id == &r.firm_id))
            .collect();
        assert!(overlap.is_empty(), "wave2 overlapped {overlap:?}");
        assert!(!w2.top10.is_empty());
        assert!(w2.wave == 2);
    }

    #[test]
    fn profile_prefers_abb_over_theatre() {
        let uni = load_universe().unwrap();
        let abb = uni.firms.iter().find(|f| f.id == "abb").unwrap();
        let klarna = uni.firms.iter().find(|f| f.id == "klarna").unwrap();
        assert!(profile_match_firm(abb).score > profile_match_firm(klarna).score);
        let role = local_role_match(
            "Senior Software Engineer",
            "Saab",
            "Stockholm",
            "Rust embedded autonomy",
        );
        assert!(role.score >= 36);
    }
}

//! Place / environment ranker — critic of country lists.
//!
//! Life quality is a city bet. Legal work-right (Swedish citizen) is a
//! separate axis and must not be sold as "best place to become someone."

use serde::{Deserialize, Serialize};

const ENV_JSON: &str = include_str!("../../data/durability/environments.v1.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceRecord {
    pub id: String,
    pub name: String,
    pub country: String,
    pub band: String,
    pub economic: u8,
    pub ethics: u8,
    pub character: u8,
    pub social: u8,
    pub family: u8,
    #[serde(rename = "self")]
    pub self_fit: u8,
    pub legal_ease: i32,
    pub why: String,
    pub cost: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EnvFile {
    algorithm_version: String,
    scored_at: String,
    critic: Vec<String>,
    places: Vec<PlaceRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedPlace {
    pub place_id: String,
    pub name: String,
    pub country: String,
    pub band: String,
    pub env_total: i32,
    pub env_bonus: i32,
    pub legal_ease: i32,
    pub economic: u8,
    pub ethics: u8,
    pub character: u8,
    pub social: u8,
    pub family: u8,
    pub self_fit: u8,
    pub why: String,
    pub cost: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentBoard {
    pub algorithm_version: String,
    pub critic: Vec<String>,
    pub top10: Vec<RankedPlace>,
}

fn clamp(v: u8) -> i32 {
    i32::from(v.min(4))
}

/// Life score only (no legal_ease). Max 120.
pub fn env_total(p: &PlaceRecord) -> i32 {
    5 * clamp(p.economic)
        + 5 * clamp(p.ethics)
        + 4 * clamp(p.character)
        + 6 * clamp(p.social)
        + 6 * clamp(p.family)
        + 4 * clamp(p.self_fit)
}

pub fn env_bonus(p: &PlaceRecord) -> i32 {
    env_total(p) / 6
}

fn to_ranked(p: &PlaceRecord) -> RankedPlace {
    RankedPlace {
        place_id: p.id.clone(),
        name: p.name.clone(),
        country: p.country.clone(),
        band: p.band.clone(),
        env_total: env_total(p),
        env_bonus: env_bonus(p),
        legal_ease: p.legal_ease,
        economic: p.economic,
        ethics: p.ethics,
        character: p.character,
        social: p.social,
        family: p.family,
        self_fit: p.self_fit,
        why: p.why.clone(),
        cost: p.cost.clone(),
    }
}

fn load() -> EnvFile {
    serde_json::from_str(ENV_JSON).expect("environments.v1.json must parse")
}

pub fn board() -> EnvironmentBoard {
    let file = load();
    let mut rows: Vec<RankedPlace> = file.places.iter().map(to_ranked).collect();
    rows.sort_by(|a, b| {
        b.env_total
            .cmp(&a.env_total)
            .then_with(|| b.social.cmp(&a.social))
            .then_with(|| a.place_id.cmp(&b.place_id))
    });
    EnvironmentBoard {
        algorithm_version: file.algorithm_version,
        critic: file.critic,
        top10: rows.into_iter().take(10).collect(),
    }
}

pub fn lookup(id: &str) -> Option<RankedPlace> {
    load().places.iter().find(|p| p.id == id).map(to_ranked)
}

pub fn default_place_id(firm_id: &str, depth_geo: crate::firm_durability::DepthGeo) -> &'static str {
    match firm_id {
        "asml" => "nl_eindhoven",
        "tesla" => "us_austin",
        "spacexai" | "nvidia" | "deepmind" | "pi" | "figure" => "us_bay",
        "abb" => "ch_zurich",
        "siemens" => "de_munich",
        "nokia" => "fi_helsinki",
        "kongsberg" => "no_oslo",
        "fanuc" => "jp_tokyo",
        "bolt" => "ee_tallinn",
        _ => match depth_geo {
            crate::firm_durability::DepthGeo::Sweden => "se_stockholm",
            crate::firm_durability::DepthGeo::Nordics => "dk_copenhagen",
            crate::firm_durability::DepthGeo::Europe => "de_munich",
            crate::firm_durability::DepthGeo::Estonia => "ee_tallinn",
            crate::firm_durability::DepthGeo::UnitedStates => "us_bay",
            crate::firm_durability::DepthGeo::Japan => "jp_tokyo",
            crate::firm_durability::DepthGeo::Singapore => "sg_singapore",
            crate::firm_durability::DepthGeo::Other => "se_stockholm",
        },
    }
}

pub fn bonuses_for(firm_id: &str, depth_geo: crate::firm_durability::DepthGeo) -> (i32, i32, String) {
    let id = default_place_id(firm_id, depth_geo);
    match lookup(id) {
        Some(p) => (p.env_bonus, p.legal_ease, p.place_id),
        None => (0, 0, id.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eindhoven_beats_stockholm_and_tallinn() {
        let b = board();
        assert_eq!(b.top10[0].place_id, "nl_eindhoven");
        assert!(b.top10.iter().all(|p| p.place_id != "ee_tallinn"));
        let se = lookup("se_stockholm").unwrap();
        assert!(b.top10[0].env_total > se.env_total);
    }

    #[test]
    fn legal_ease_not_in_env_total() {
        let se = lookup("se_stockholm").unwrap();
        let au = lookup("us_austin").unwrap();
        assert!(se.legal_ease > au.legal_ease);
        assert!(au.env_total > se.env_total);
    }
}

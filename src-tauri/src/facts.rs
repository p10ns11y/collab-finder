//! Deterministic firm facts for the downstream pick step.

use std::path::Path;

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::firm_durability::{FirmRecord, UniverseFile};

const ALGORITHM_VERSION: &str = "facts-v1";
const NOTE: &str = "Sourced from the durability universe (public IR). Missing values are unknown.";

#[derive(Serialize)]
struct FirmsSummary {
    firms: usize,
    with_runway: usize,
    flags: usize,
}

struct Built {
    facts: Value,
    with_runway: usize,
    flags: usize,
}

pub fn firm_facts(u: &UniverseFile) -> Value {
    built(u).facts
}

pub fn firms_summary(u: &UniverseFile) -> String {
    let built = built(u);
    summary_json(u.firms.len(), &built).expect("firms summary")
}

pub fn write_firms(universe_path: &Path, out_path: &Path) -> Result<String, String> {
    let universe = read_universe(universe_path)?;
    let built = built(&universe);
    let mut body = serde_json::to_string_pretty(&built.facts).map_err(|err| err.to_string())?;
    body.push('\n');
    std::fs::write(out_path, body).map_err(|err| format!("write {}: {err}", out_path.display()))?;
    summary_json(universe.firms.len(), &built)
}

fn read_universe(path: &Path) -> Result<UniverseFile, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|err| format!("read {}: {err}", path.display()))?;
    serde_json::from_str(&text).map_err(|err| format!("parse {}: {err}", path.display()))
}

fn summary_json(firms: usize, built: &Built) -> Result<String, String> {
    serde_json::to_string(&FirmsSummary {
        firms,
        with_runway: built.with_runway,
        flags: built.flags,
    })
    .map_err(|err| err.to_string())
}

fn built(u: &UniverseFile) -> Built {
    let mut postings = Map::new();
    let mut with_runway = 0;
    let mut flags = 0;
    for firm in &u.firms {
        let mut entry = Map::new();
        if let Some(runway) = funding_runway(firm) {
            let mut stability = Map::new();
            stability.insert("funding_runway".into(), runway);
            entry.insert("comp_stability".into(), Value::Object(stability));
            with_runway += 1;
        }
        let flag_list = red_flags(firm);
        if !flag_list.is_empty() {
            flags += flag_list.len();
            entry.insert("red_flags".into(), Value::Array(flag_list));
        }
        if !entry.is_empty() {
            postings.insert(firm.id.clone(), Value::Object(entry));
        }
    }
    let mut root = Map::new();
    root.insert("algorithm_version".into(), json!(ALGORITHM_VERSION));
    root.insert("note".into(), json!(NOTE));
    root.insert("postings".into(), Value::Object(postings));
    Built {
        facts: Value::Object(root),
        with_runway,
        flags,
    }
}

fn funding_runway(firm: &FirmRecord) -> Option<Value> {
    let cash = firm.cash.as_ref()?;
    let source = cash.source.as_ref()?;
    let value = round4(f64::from(firm.fortress.min(4)) / 4.0);
    let basis = match cash.fy {
        Some(fy) => format!("IR fy{fy} {source}"),
        None => format!("IR {source}"),
    };
    Some(json!({
        "basis": basis,
        "value": value,
    }))
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn red_flags(firm: &FirmRecord) -> Vec<Value> {
    let mut flags = Vec::new();
    if firm.hiring_signal == 0 {
        flags.push(json!({"hard": false, "reason": "hiring_theatre"}));
    }
    if firm.theater_saas {
        flags.push(json!({"hard": false, "reason": "theater_saas"}));
    }
    flags
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn read_repo(rel: &str) -> String {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(rel);
        std::fs::read_to_string(&path)
            .unwrap_or_else(|err| panic!("read {}: {err}", path.display()))
    }

    #[test]
    fn firm_facts_rules_omit_unknown_and_keep_soft_flags() {
        let raw = r#"
        {"algorithm_version":"v1","scored_at":"t","firms":[
          {"id":"sourced","name":"S","hq":"SE","depth_geo":"sweden","product_class":"x",
           "theater_saas":false,"product_moat":1,"ai_tsunami":1,"fortress":3,"hiring_signal":2,
           "spacexai_vector":1,"cash":{"fy":2025,"source":"https://ir.example/a"}},
          {"id":"capped","name":"C","hq":"SE","depth_geo":"sweden","product_class":"x",
           "theater_saas":false,"product_moat":1,"ai_tsunami":1,"fortress":8,"hiring_signal":2,
           "spacexai_vector":1,"cash":{"source":"https://ir.example/nofy"}},
          {"id":"null_source","name":"N","hq":"SE","depth_geo":"sweden","product_class":"x",
           "theater_saas":false,"product_moat":1,"ai_tsunami":1,"fortress":4,"hiring_signal":2,
           "spacexai_vector":1,"cash":{"fy":2024,"source":null}},
          {"id":"theatre","name":"T","hq":"SE","depth_geo":"sweden","product_class":"x",
           "theater_saas":true,"product_moat":1,"ai_tsunami":1,"fortress":1,"hiring_signal":0,
           "spacexai_vector":0},
          {"id":"quiet","name":"Q","hq":"SE","depth_geo":"sweden","product_class":"x",
           "theater_saas":false,"product_moat":1,"ai_tsunami":1,"fortress":1,"hiring_signal":2,
           "spacexai_vector":0}
        ]}
        "#;
        let universe: UniverseFile = serde_json::from_str(raw).expect("universe");
        let got = firm_facts(&universe);
        assert!(got["postings"].get("null_source").is_none());
        assert!(got["postings"].get("quiet").is_none());
        assert_eq!(
            got["postings"]["sourced"]["comp_stability"]["funding_runway"]["value"],
            json!(0.75)
        );
        assert_eq!(
            got["postings"]["sourced"]["comp_stability"]["funding_runway"]["basis"],
            json!("IR fy2025 https://ir.example/a")
        );
        assert!(got["postings"]["sourced"].get("red_flags").is_none());
        assert_eq!(
            got["postings"]["capped"]["comp_stability"]["funding_runway"]["value"],
            json!(1.0)
        );
        assert_eq!(
            got["postings"]["capped"]["comp_stability"]["funding_runway"]["basis"],
            json!("IR https://ir.example/nofy")
        );
        assert_eq!(
            got["postings"]["theatre"]["red_flags"],
            json!([
                {"hard": false, "reason": "hiring_theatre"},
                {"hard": false, "reason": "theater_saas"}
            ])
        );
        assert!(got["postings"]["theatre"].get("comp_stability").is_none());
        assert_eq!(
            firms_summary(&universe),
            r#"{"firms":5,"with_runway":2,"flags":2}"#
        );
    }

    #[test]
    fn firm_facts_match_universe_golden() {
        let universe: UniverseFile =
            serde_json::from_str(&read_repo("data/durability/universe.v1.json")).expect("universe");
        let golden: Value =
            serde_json::from_str(&read_repo("data/facts/firms.golden.json")).expect("golden");
        let got = firm_facts(&universe);
        assert_eq!(got, golden);
        assert_eq!(
            firms_summary(&universe),
            r#"{"firms":29,"with_runway":11,"flags":11}"#
        );
    }
}

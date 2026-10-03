//! Product-lane preset score. Fortress and durability hits are not added here.

pub const QUERY_KEY: &str = "lane:product";

pub const FIRM_IDS: &[&str] = &[
    "linear",
    "stripe",
    "modal",
    "elevenlabs",
    "intercom",
    "gitlab",
    "enode",
    "railway",
    "pleo",
    "doctolib",
    "wolt",
    "spotify",
];

pub const PRODUCT_ONLY_IDS: &[&str] = &[
    "linear",
    "stripe",
    "modal",
    "elevenlabs",
    "intercom",
    "enode",
    "railway",
    "pleo",
    "doctolib",
];

const PRODUCT_TEAM: f64 = 100.0;
const PHYSICAL: f64 = 30.0;
const AI_OR_ZERO_BUG: f64 = 18.0;
const EU_MOAT: f64 = 5.0;
const QUERY_HIT: f64 = 2.0;

struct Seed {
    id: &'static str,
    us_employer: bool,
    eu_moat: Option<&'static str>,
    ai_native: bool,
    near_zero_bug: bool,
}

const SEEDS: &[Seed] = &[
    Seed {
        id: "linear",
        us_employer: true,
        eu_moat: None,
        ai_native: false,
        near_zero_bug: true,
    },
    Seed {
        id: "stripe",
        us_employer: true,
        eu_moat: Some("PSD2"),
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "modal",
        us_employer: true,
        eu_moat: None,
        ai_native: true,
        near_zero_bug: false,
    },
    Seed {
        id: "elevenlabs",
        us_employer: false,
        eu_moat: Some("AI Act"),
        ai_native: true,
        near_zero_bug: false,
    },
    Seed {
        id: "intercom",
        us_employer: true,
        eu_moat: None,
        ai_native: true,
        near_zero_bug: false,
    },
    Seed {
        id: "gitlab",
        us_employer: true,
        eu_moat: None,
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "enode",
        us_employer: false,
        eu_moat: Some("grid"),
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "railway",
        us_employer: true,
        eu_moat: None,
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "pleo",
        us_employer: false,
        eu_moat: Some("PSD2"),
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "doctolib",
        us_employer: false,
        eu_moat: Some("patient-data residency"),
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "wolt",
        us_employer: false,
        eu_moat: None,
        ai_native: false,
        near_zero_bug: false,
    },
    Seed {
        id: "spotify",
        us_employer: false,
        eu_moat: Some("GDPR"),
        ai_native: false,
        near_zero_bug: false,
    },
];

pub fn us_employer(firm_id: &str) -> bool {
    SEEDS
        .iter()
        .find(|seed| seed.id == firm_id)
        .is_some_and(|seed| seed.us_employer)
}

pub fn is_product_lane_query(query: Option<&str>) -> bool {
    let normalized = normalize_query(query);
    normalized == QUERY_KEY || normalized.starts_with(&format!("{QUERY_KEY} "))
}

pub fn extra_query(query: Option<&str>) -> Option<String> {
    let normalized = normalize_query(query);
    if normalized == QUERY_KEY {
        return None;
    }
    let prefix = format!("{QUERY_KEY} ");
    if let Some(rest) = normalized.strip_prefix(&prefix) {
        let rest = rest.trim();
        if rest.is_empty() {
            return None;
        }
        return Some(rest.to_string());
    }
    None
}

pub fn score(firm_id: &str, title: &str, extra_query: Option<&str>) -> (f64, Vec<String>) {
    let mut score = 0.0;
    let mut reasons = Vec::new();
    let seed = SEEDS.iter().find(|seed| seed.id == firm_id);
    if seed.is_some() {
        score += PRODUCT_TEAM;
        reasons.push("product_team".into());
    }
    if let Some(kind) = physical_kind(title) {
        score += PHYSICAL;
        reasons.push(format!("physical:{kind}"));
    }
    let title_ai = title_is_ai_native(title);
    let title_zero = title_is_near_zero_bug(title);
    let firm_ai = seed.is_some_and(|seed| seed.ai_native);
    let firm_zero = seed.is_some_and(|seed| seed.near_zero_bug);
    if firm_ai || firm_zero || title_ai || title_zero {
        score += AI_OR_ZERO_BUG;
    }
    if firm_ai || title_ai {
        reasons.push("ai_native".into());
    }
    if firm_zero || title_zero {
        reasons.push("near_zero_bug".into());
    }
    if let Some(reason) = seed.and_then(|seed| seed.eu_moat) {
        score += EU_MOAT;
        reasons.push(format!("eu_moat:{reason}"));
    }
    let hits = query_hit_count(title, extra_query);
    if hits > 0 {
        score += QUERY_HIT * hits as f64;
        reasons.push(format!("query_hits:{hits}"));
    }
    (score, reasons)
}

fn normalize_query(query: Option<&str>) -> String {
    query
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn physical_kind(title: &str) -> Option<&'static str> {
    let hay = format!(" {} ", title.to_ascii_lowercase());
    if hay.contains(" devices ") {
        return Some("devices");
    }
    if hay.contains("robot") {
        return Some("robots");
    }
    if hay.contains("vehicle") {
        return Some("vehicles");
    }
    None
}

fn title_is_ai_native(title: &str) -> bool {
    let raw = format!(" {} ", title.to_ascii_lowercase());
    let spaced: String = raw
        .chars()
        .map(|ch| match ch {
            '(' | ')' | '[' | ']' => ' ',
            other => other,
        })
        .collect();
    spaced.contains(" ai ")
        || raw.contains(" a.i. ")
        || raw.contains("machine learning")
        || spaced.contains(" llm ")
        || spaced.contains(" genai ")
        || spaced.contains(" agentic ")
        || spaced.contains(" ml ")
}

fn title_is_near_zero_bug(title: &str) -> bool {
    let hay = title.to_ascii_lowercase();
    hay.contains("near-zero")
        || hay.contains("near zero")
        || hay.contains("zero-bug")
        || hay.contains("zero bug")
        || hay.contains("bug-free")
}

fn query_hit_count(title: &str, extra_query: Option<&str>) -> usize {
    let Some(query) = extra_query.map(str::trim).filter(|query| !query.is_empty()) else {
        return 0;
    };
    let hay = title.to_ascii_lowercase();
    query
        .split(|ch: char| ch.is_whitespace() || ch == '|' || ch == ',')
        .map(|token| {
            token
                .trim_matches(|ch: char| !ch.is_alphanumeric() && ch != '-' && ch != '_')
                .to_ascii_lowercase()
        })
        .filter(|token| token.len() >= 2 && token != "or" && token != "and" && token != "not")
        .filter(|token| hay.contains(token.as_str()))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_key_is_distinct_from_a_title_search() {
        assert!(is_product_lane_query(Some("lane:product")));
        assert!(is_product_lane_query(Some("  LANE:PRODUCT  ")));
        assert!(is_product_lane_query(Some("lane:product typescript")));
        assert!(!is_product_lane_query(Some("lane:productx")));
        assert!(!is_product_lane_query(Some("product")));
        assert!(!is_product_lane_query(Some("typescript")));
        assert!(!is_product_lane_query(None));
        assert_eq!(extra_query(Some("lane:product")), None);
        assert_eq!(
            extra_query(Some("lane:product typescript")),
            Some("typescript".into())
        );
    }

    #[test]
    fn seed_list_is_the_twelve_product_firms() {
        assert_eq!(FIRM_IDS.len(), 12);
        assert_eq!(
            FIRM_IDS,
            &[
                "linear",
                "stripe",
                "modal",
                "elevenlabs",
                "intercom",
                "gitlab",
                "enode",
                "railway",
                "pleo",
                "doctolib",
                "wolt",
                "spotify",
            ]
        );
        for id in FIRM_IDS {
            assert!(SEEDS.iter().any(|seed| seed.id == *id), "{id}");
        }
        for id in ["linear", "stripe", "modal", "intercom", "gitlab", "railway"] {
            assert!(us_employer(id), "{id}");
        }
        for id in ["elevenlabs", "enode", "pleo", "doctolib", "wolt", "spotify"] {
            assert!(!us_employer(id), "{id}");
        }
        assert!(!us_employer("abb"));
    }

    #[test]
    fn product_team_outranks_physical_and_ai_bonuses() {
        let (railway, railway_reasons) = score("railway", "Senior Fullstack Engineer", None);
        let (vehicle, vehicle_reasons) = score("railway", "Vehicle Software Engineer", None);
        let (eleven, eleven_reasons) = score("elevenlabs", "Forward Deployed Engineer", None);
        let (linear, linear_reasons) = score("linear", "AI Product Engineer", None);
        let (pleo, pleo_reasons) = score("pleo", "Senior Backend Engineer", None);
        let (spotify, _) = score("spotify", "Senior Fullstack Engineer", None);
        let (abb, _) = score("abb", "Senior Software Engineer", None);
        let (abb_vehicle, abb_reasons) = score("abb", "Vehicle Software Engineer", None);

        assert_eq!(railway, 100.0);
        assert_eq!(vehicle, 130.0);
        assert_eq!(eleven, 123.0);
        assert_eq!(linear, 118.0);
        assert_eq!(pleo, 105.0);
        assert_eq!(spotify, 105.0);
        assert_eq!(abb, 0.0);
        assert_eq!(abb_vehicle, 30.0);
        assert!(railway > abb_vehicle);
        assert!(vehicle > eleven);
        assert!(eleven > linear);
        assert!(linear > pleo);
        assert!(pleo > abb);
        assert_eq!(railway_reasons, vec!["product_team".to_string()]);
        assert_eq!(
            vehicle_reasons,
            vec!["product_team".to_string(), "physical:vehicles".to_string()]
        );
        assert_eq!(
            eleven_reasons,
            vec![
                "product_team".to_string(),
                "ai_native".to_string(),
                "eu_moat:AI Act".to_string(),
            ]
        );
        assert_eq!(
            linear_reasons,
            vec![
                "product_team".to_string(),
                "ai_native".to_string(),
                "near_zero_bug".to_string(),
            ]
        );
        assert_eq!(
            pleo_reasons,
            vec!["product_team".to_string(), "eu_moat:PSD2".to_string()]
        );
        assert_eq!(abb_reasons, vec!["physical:vehicles".to_string()]);
    }

    #[test]
    fn eu_moat_reasons_are_one_line() {
        let cases = [
            ("stripe", "PSD2"),
            ("pleo", "PSD2"),
            ("doctolib", "patient-data residency"),
            ("spotify", "GDPR"),
            ("elevenlabs", "AI Act"),
            ("enode", "grid"),
        ];
        for (firm, reason) in cases {
            let (_, reasons) = score(firm, "Senior Software Engineer", None);
            assert!(
                reasons
                    .iter()
                    .any(|row| row == &format!("eu_moat:{reason}")),
                "{firm} {reasons:?}"
            );
        }
        let (_, gitlab) = score("gitlab", "Senior Software Engineer", None);
        assert!(gitlab.iter().all(|row| !row.starts_with("eu_moat:")));
    }

    #[test]
    fn physical_and_ai_bonuses_stack_once() {
        let (stacked, reasons) = score("spotify", "AI Vehicle Engineer", None);
        assert_eq!(stacked, 105.0 + 30.0 + 18.0);
        assert!(reasons.iter().any(|row| row == "physical:vehicles"));
        assert!(reasons.iter().any(|row| row == "ai_native"));
        assert_eq!(reasons.iter().filter(|row| *row == "ai_native").count(), 1);

        let (devices, device_reasons) = score("railway", "Home Energy Devices Engineer", None);
        let (admin, admin_reasons) = score("railway", "IT Device Administrator", None);
        assert_eq!(admin, 100.0);
        assert!(admin_reasons
            .iter()
            .all(|row| !row.starts_with("physical:")));
        assert_eq!(devices, 130.0);
        assert_eq!(
            device_reasons,
            vec!["product_team".to_string(), "physical:devices".to_string()]
        );
        let (robots, robot_reasons) = score("railway", "Robotics Software Engineer", None);
        assert_eq!(robots, 130.0);
        assert_eq!(
            robot_reasons,
            vec!["product_team".to_string(), "physical:robots".to_string()]
        );
    }

    #[test]
    fn extra_query_is_a_small_hit_inside_the_lane() {
        let (hit, reasons) = score("railway", "Senior TypeScript Engineer", Some("typescript"));
        let (miss, _) = score("railway", "Senior Backend Engineer", Some("typescript"));
        assert_eq!(hit, 102.0);
        assert_eq!(miss, 100.0);
        assert!(reasons.iter().any(|row| row == "query_hits:1"));
        assert_eq!(
            score(
                "railway",
                "Senior TypeScript Engineer",
                Some("or and not a")
            )
            .0,
            100.0
        );
        assert_eq!(
            score(
                "railway",
                "Senior TypeScript Engineer",
                Some("foo|typescript")
            )
            .0,
            102.0
        );
        assert_eq!(
            score(
                "railway",
                "Senior TypeScript Engineer",
                Some("zzz,typescript")
            )
            .0,
            102.0
        );
        assert_eq!(
            score("railway", "Senior TypeScript Engineer", Some("")).0,
            100.0
        );
        assert_eq!(
            score("railway", "Senior TypeScript Engineer", Some("   ")).0,
            100.0
        );
    }

    #[test]
    fn ai_and_near_zero_phrases_each_add_one_bonus() {
        let ai_titles = [
            "A.I. Engineer",
            "(AI) Engineer",
            "Machine Learning Engineer",
            "LLM Engineer",
            "GenAI Engineer",
            "Agentic Engineer",
            "ML Engineer",
        ];
        for title in ai_titles {
            let (points, reasons) = score("railway", title, None);
            assert_eq!(points, 118.0, "{title}");
            assert!(reasons.iter().any(|row| row == "ai_native"), "{title}");
            assert!(reasons.iter().all(|row| row != "near_zero_bug"), "{title}");
        }
        let zero_titles = [
            "Near-zero Defect Engineer",
            "Near zero Defect Engineer",
            "Zero-bug Engineer",
            "Zero bug Engineer",
            "Bug-free Engineer",
        ];
        for title in zero_titles {
            let (points, reasons) = score("railway", title, None);
            assert_eq!(points, 118.0, "{title}");
            assert!(reasons.iter().any(|row| row == "near_zero_bug"), "{title}");
            assert!(reasons.iter().all(|row| row != "ai_native"), "{title}");
        }
        let (linear, reasons) = score("linear", "Senior Backend Engineer", None);
        assert_eq!(linear, 118.0);
        assert_eq!(
            reasons,
            vec!["product_team".to_string(), "near_zero_bug".to_string()]
        );
        let (plain, _) = score("railway", "Email Platform Engineer", None);
        assert_eq!(plain, 100.0);
    }
}

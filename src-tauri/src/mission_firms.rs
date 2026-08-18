//! Mission firms — multi-source hunt with query-keyed append cache.
//!
//! Sources: Greenhouse, Lever, Ashby, JobTech (Sweden), Tesla local dump.
//! Cache: each distinct query+firms key is fetched once; later Pulls reuse the pool;
//! a new query fetches and **appends** leads into the saved pool.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

const GH_BASE: &str = "https://boards-api.greenhouse.io/v1/boards";
const LEVER_BASE: &str = "https://api.lever.co/v0/postings";
const ASHBY_BASE: &str = "https://api.ashbyhq.com/posting-api/job-board";
const JOBSEARCH_BASE: &str = "https://jobsearch.api.jobtechdev.se";
const TESLA_CAREERS_STATE: &str = "https://www.tesla.com/cua-api/apps/careers/state";
const SEARCH_CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy)]
enum FirmSource {
    Greenhouse { board: &'static str },
    Lever { site: &'static str },
    Ashby { board: &'static str },
    JobTech { org_number: &'static str },
    TeslaLocal,
}

#[derive(Debug, Clone, Copy)]
struct FirmDef {
    id: &'static str,
    label: &'static str,
    source: FirmSource,
    /// Tesla-style mixed software↔hardware gate.
    mixed_sw_hw_only: bool,
}

/// Curated mission / Nordic / EU / physical-AI boards (public career APIs).
const FIRM_REGISTRY: &[FirmDef] = &[
    FirmDef {
        id: "spacexai",
        label: "SpaceXAI",
        source: FirmSource::Greenhouse { board: "xai" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "tesla",
        label: "Tesla",
        source: FirmSource::TeslaLocal,
        mixed_sw_hw_only: true,
    },
    FirmDef {
        id: "einride",
        label: "Einride",
        source: FirmSource::JobTech {
            org_number: "5590748926",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "ericsson",
        label: "Ericsson",
        source: FirmSource::JobTech {
            org_number: "5560566258",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "saab",
        label: "Saab",
        source: FirmSource::JobTech {
            org_number: "5560360793",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "klarna",
        label: "Klarna",
        source: FirmSource::JobTech {
            org_number: "5567370431",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "volvo_cars",
        label: "Volvo Cars",
        source: FirmSource::JobTech {
            org_number: "5560743089",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "volvo_group",
        label: "Volvo Group",
        source: FirmSource::JobTech {
            org_number: "5560295197",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "atlas_copco",
        label: "Atlas Copco",
        source: FirmSource::JobTech {
            org_number: "5560142720",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "sandvik",
        label: "Sandvik",
        source: FirmSource::JobTech {
            org_number: "5560003468",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "abb",
        label: "ABB",
        source: FirmSource::JobTech {
            org_number: "5591930903",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "hexagon",
        label: "Hexagon",
        source: FirmSource::JobTech {
            org_number: "5561904771",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "epiroc",
        label: "Epiroc",
        source: FirmSource::JobTech {
            org_number: "5560779018",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "spotify",
        label: "Spotify",
        source: FirmSource::Lever { site: "spotify" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "wolt",
        label: "Wolt",
        source: FirmSource::Greenhouse { board: "wolt" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "gitlab",
        label: "GitLab",
        source: FirmSource::Greenhouse { board: "gitlab" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "waymo",
        label: "Waymo",
        source: FirmSource::Greenhouse { board: "waymo" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "figure",
        label: "Figure",
        source: FirmSource::Greenhouse { board: "figureai" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "agility",
        label: "Agility",
        source: FirmSource::Greenhouse {
            board: "agilityrobotics",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "pi",
        label: "Physical Int.",
        source: FirmSource::Ashby {
            board: "physicalintelligence",
        },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "onex",
        label: "1X",
        source: FirmSource::Ashby { board: "1x" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "hive",
        label: "Hive",
        source: FirmSource::Greenhouse { board: "hive" },
        mixed_sw_hw_only: false,
    },
    FirmDef {
        id: "deepmind",
        label: "DeepMind",
        source: FirmSource::Greenhouse { board: "deepmind" },
        mixed_sw_hw_only: false,
    },
];

fn firm_by_id(id: &str) -> Option<&'static FirmDef> {
    let key = id.trim().to_ascii_lowercase();
    let key = match key.as_str() {
        "xai" => "spacexai",
        "figureai" => "figure",
        "agilityrobotics" => "agility",
        "physicalintelligence" => "pi",
        "1x" => "onex",
        "volvo" | "volvocars" => "volvo_cars",
        "volvoab" | "volvo_ab" | "abvolvo" => "volvo_group",
        "atlas" | "atlascopco" => "atlas_copco",
        other => other,
    };
    FIRM_REGISTRY.iter().find(|f| f.id == key)
}

pub fn default_firm_ids() -> Vec<String> {
    [
        "spacexai",
        "tesla",
        "saab",
        "ericsson",
        "atlas_copco",
        "abb",
        "volvo_group",
        "sandvik",
        "hexagon",
        "epiroc",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn parse_firm_ids(raw: &[String]) -> Vec<&'static FirmDef> {
    let mut out = Vec::new();
    for s in raw {
        if let Some(def) = firm_by_id(s) {
            if !out.iter().any(|d: &&FirmDef| d.id == def.id) {
                out.push(def);
            }
        }
    }
    if out.is_empty() {
        for id in default_firm_ids() {
            if let Some(def) = firm_by_id(&id) {
                out.push(def);
            }
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissionFirmLead {
    pub firm_id: String,
    pub firm_label: String,
    pub source: String,
    pub external_id: String,
    pub title: String,
    pub location: String,
    pub absolute_url: String,
    pub department: Option<String>,
    pub rank_score: f64,
    pub rank_reasons: Vec<String>,
    pub texas_match: bool,
    pub terafab_adjacent: bool,
    pub already_in_db: bool,
    pub opportunity_id: Option<i64>,
}

impl MissionFirmLead {
    pub fn cache_key(&self) -> String {
        format!("{}:{}:{}", self.source, self.firm_id, self.external_id)
    }
}

#[derive(Debug, Clone, Default)]
pub struct MissionFirmFilter {
    pub q: Option<String>,
    pub firms: Vec<String>,
    pub texas_only: bool,
    pub terafab_bias: bool,
    pub limit: Option<usize>,
    /// Force network even if this query was cached (optional; default false).
    pub force_refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SearchPoolCache {
    version: u32,
    /// `normalized_query|firm1,firm2,...` already fetched from network.
    fetched_query_keys: HashSet<String>,
    /// Deduped leads across all searches.
    leads: HashMap<String, MissionFirmLead>,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("collab-finder/mission-firms")
        .build()
        .map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn normalize_query(q: Option<&str>) -> String {
    q.unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn query_cache_key(filter: &MissionFirmFilter, firms: &[&FirmDef]) -> String {
    let q = normalize_query(filter.q.as_deref());
    let mut ids: Vec<&str> = firms.iter().map(|f| f.id).collect();
    ids.sort_unstable();
    format!("{q}|{}", ids.join(","))
}

fn search_pool_path() -> Option<PathBuf> {
    let dir = crate::app_dirs::app_data_dir().ok()?.join("mission_firms_cache");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("search_pool.json"))
}

fn load_search_pool() -> SearchPoolCache {
    let Some(path) = search_pool_path() else {
        return SearchPoolCache {
            version: SEARCH_CACHE_VERSION,
            ..Default::default()
        };
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return SearchPoolCache {
            version: SEARCH_CACHE_VERSION,
            ..Default::default()
        };
    };
    serde_json::from_str(&text).unwrap_or(SearchPoolCache {
        version: SEARCH_CACHE_VERSION,
        ..Default::default()
    })
}

fn save_search_pool(cache: &SearchPoolCache) {
    let Some(path) = search_pool_path() else {
        return;
    };
    if let Ok(text) = serde_json::to_string_pretty(cache) {
        let _ = std::fs::write(path, text);
    }
}

const TERAFAB_TERMS: &[&str] = &[
    "terafab",
    "tera fab",
    "semiconductor",
    "silicon",
    "wafer",
    "dram",
    "memory process",
    "process integration",
    "lithograph",
    "cleanroom",
    "yield",
    "fab ",
    " fab",
    "asic",
    "soc ",
];

const TEXAS_TERMS: &[&str] = &[
    "texas", " tx", "tx,", "austin", "starbase", "brownsville", "bastrop", "grimes", "houston",
    "dallas", "plano", "lewisville",
];

const PHYSICAL_AI_TERMS: &[&str] = &[
    "autonomous",
    "autonomi",
    "robot",
    "robotik",
    "vehicle",
    "fordon",
    "freight",
    "perception",
    "lidar",
    "motion",
    "control",
    "embedded",
    "realtime",
    "real-time",
    "physical",
    "humanoid",
];

fn location_is_texas(loc: &str) -> bool {
    let hay = format!(" {} ", loc.to_ascii_lowercase());
    TEXAS_TERMS.iter().any(|t| hay.contains(t))
}

fn title_terafab_adjacent(title: &str) -> bool {
    let hay = title.to_ascii_lowercase();
    TERAFAB_TERMS.iter().any(|t| hay.contains(t.trim()))
}

fn title_physical_ai(title: &str) -> bool {
    let hay = title.to_ascii_lowercase();
    PHYSICAL_AI_TERMS.iter().any(|t| hay.contains(*t))
}

fn query_tokens(query: Option<&str>) -> Vec<String> {
    let Some(q) = query.map(str::trim).filter(|s| !s.is_empty()) else {
        return Vec::new();
    };
    q.split(|c: char| c.is_whitespace() || c == '|' || c == ',')
        .map(|t| {
            t.trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                .to_ascii_lowercase()
        })
        .filter(|t| t.len() >= 2 && t != "or" && t != "and" && t != "not")
        .collect()
}

fn query_matches(title: &str, location: &str, query: Option<&str>) -> bool {
    let tokens = query_tokens(query);
    if tokens.is_empty() {
        return true;
    }
    let hay = format!("{title} {location}").to_ascii_lowercase();
    tokens.iter().any(|t| hay.contains(t))
}

pub fn is_mixed_software_hardware(title: &str, department: &str) -> bool {
    let hay = format!(" {title} {department} ").to_ascii_lowercase();
    const HYBRID: &[&str] = &[
        "firmware",
        "embedded",
        "mechatronic",
        "autopilot",
        "autonomy",
        "autonomous",
        "robotics software",
        "software, robotics",
        "controls software",
        "control systems",
        "perception",
        "sensor fusion",
        "vehicle software",
        "fullstack",
        "full stack",
        "systems software",
        "silicon software",
        "asic",
        "soc ",
        "fpga",
        "hardware-in-the-loop",
        "motor control",
        "battery software",
        "power electronics software",
        "diagnostics software",
        "test software",
        "automation software",
        "humanoid",
    ];
    if HYBRID.iter().any(|t| hay.contains(t)) {
        return true;
    }
    const SOFTWARE: &[&str] = &[
        "software",
        "firmware",
        "developer",
        "sde ",
        " swe",
        "swe ",
        "backend",
        "frontend",
        "fullstack",
        "ml ",
        "machine learning",
        "ai ",
        " artificial",
        "data engineer",
        "devops",
        "platform engineer",
        "infrastructure engineer",
        "simulation",
        "algorithm",
    ];
    const HARDWARE: &[&str] = &[
        "hardware",
        "mechanical",
        "electrical",
        "electronics",
        "silicon",
        "semiconductor",
        "manufacturing",
        "process engineer",
        "battery",
        "motor",
        "vehicle",
        "sensor",
        "optics",
        "pcb",
        "robotics",
        "mechatronic",
        "thermal",
        "powertrain",
        "cell engineering",
        "factory",
        "production engineer",
        "test engineer",
        "validation engineer",
        "reliability",
    ];
    let has_sw = SOFTWARE.iter().any(|t| hay.contains(t));
    let has_hw = HARDWARE.iter().any(|t| hay.contains(t));
    has_sw && has_hw
}

fn score_lead(
    firm: &FirmDef,
    title: &str,
    location: &str,
    query: Option<&str>,
    terafab_bias: bool,
) -> (f64, Vec<String>, bool, bool) {
    let mut score = 10.0_f64;
    let mut reasons = Vec::new();
    let texas = location_is_texas(location);
    let terafab = title_terafab_adjacent(title);
    let physical = title_physical_ai(title);

    match firm.id {
        "spacexai" => {
            score += 48.0;
            reasons.push("firm:spacexai".into());
        }
        "tesla" => {
            score += 36.0;
            reasons.push("firm:tesla_mixed_sw_hw".into());
        }
        "saab" => {
            score += 28.0;
            reasons.push("firm:saab_defence_ai".into());
        }
        "abb" | "atlas_copco" | "volvo_group" | "sandvik" => {
            score += 26.0;
            reasons.push("firm:fortress_industrial".into());
        }
        "ericsson" | "hexagon" | "epiroc" => {
            score += 20.0;
            reasons.push("firm:sweden_infra".into());
        }
        "einride" => {
            score += 8.0;
            reasons.push("firm:einride_venture".into());
        }
        "waymo" => {
            score += 28.0;
            reasons.push("firm:physical_ai_peer".into());
        }
        "figure" | "agility" | "pi" | "onex" => {
            score += 10.0;
            reasons.push("firm:venture_robotics".into());
        }
        "spotify" | "klarna" | "wolt" | "gitlab" | "hive" => {
            score -= 16.0;
            reasons.push("firm:theater_saas".into());
        }
        "volvo_cars" => {
            score += 12.0;
            reasons.push("firm:nordic_auto".into());
        }
        _ => {
            score += 12.0;
            reasons.push(format!("firm:{}", firm.id));
        }
    }

    if let Some(dur) = crate::firm_durability::score_for_id(firm.id) {
        if dur.admitted {
            score += (dur.total as f64) * 0.25;
            reasons.push(format!("durability:{}", dur.total));
        } else {
            score -= 24.0;
            reasons.push(format!(
                "durability_exclude:{}",
                dur.exclude_reason.as_deref().unwrap_or("?")
            ));
        }
    }

    if texas {
        score += 12.0;
        reasons.push("geo:texas".into());
    }
    if physical {
        score += 14.0;
        reasons.push("theme:physical_ai".into());
    }
    if terafab {
        score += if terafab_bias { 24.0 } else { 12.0 };
        reasons.push("theme:terafab_adjacent".into());
    }

    let tokens = query_tokens(query);
    if !tokens.is_empty() {
        let hay = format!("{title} {location}").to_ascii_lowercase();
        let hits = tokens.iter().filter(|t| hay.contains(t.as_str())).count();
        if hits > 0 {
            score += 8.0 * hits as f64;
            reasons.push(format!("query_hits:{hits}"));
        } else if matches!(firm.source, FirmSource::JobTech { .. }) {
            reasons.push("query:soft_swedish".into());
        } else {
            score -= 6.0;
            reasons.push("query:weak".into());
        }
    }

    (score, reasons, texas, terafab)
}

fn finish_lead(
    firm: &FirmDef,
    source: &str,
    external_id: String,
    title: String,
    location: String,
    absolute_url: String,
    department: Option<String>,
    filter: &MissionFirmFilter,
) -> Option<MissionFirmLead> {
    if firm.mixed_sw_hw_only
        && !is_mixed_software_hardware(&title, department.as_deref().unwrap_or(""))
    {
        return None;
    }
    let soft_jobtech = matches!(firm.source, FirmSource::JobTech { .. });
    if !soft_jobtech && !query_matches(&title, &location, filter.q.as_deref()) {
        return None;
    }
    let (rank_score, rank_reasons, texas_match, terafab_adjacent) = score_lead(
        firm,
        &title,
        &location,
        filter.q.as_deref(),
        filter.terafab_bias,
    );
    let is_bridge_se = matches!(firm.source, FirmSource::JobTech { .. });
    if filter.texas_only && !texas_match && !is_bridge_se {
        return None;
    }
    Some(MissionFirmLead {
        firm_id: firm.id.into(),
        firm_label: firm.label.into(),
        source: source.into(),
        external_id,
        title,
        location,
        absolute_url,
        department,
        rank_score,
        rank_reasons,
        texas_match,
        terafab_adjacent,
        already_in_db: false,
        opportunity_id: None,
    })
}

async fn fetch_greenhouse_jobs(
    client: &reqwest::Client,
    board: &str,
) -> Result<Vec<Value>, String> {
    let url = format!("{GH_BASE}/{board}/jobs");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Greenhouse {board}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Greenhouse {board} HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Greenhouse {board} JSON: {e}"))?;
    Ok(body
        .get("jobs")
        .and_then(|j| j.as_array())
        .cloned()
        .unwrap_or_default())
}

async fn fetch_lever_jobs(client: &reqwest::Client, site: &str) -> Result<Vec<Value>, String> {
    let url = format!("{LEVER_BASE}/{site}?mode=json");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Lever {site}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Lever {site} HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Lever {site} JSON: {e}"))?;
    Ok(body.as_array().cloned().unwrap_or_default())
}

async fn fetch_ashby_jobs(client: &reqwest::Client, board: &str) -> Result<Vec<Value>, String> {
    let url = format!("{ASHBY_BASE}/{board}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ashby {board}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Ashby {board} HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Ashby {board} JSON: {e}"))?;
    Ok(body
        .get("jobs")
        .and_then(|j| j.as_array())
        .cloned()
        .unwrap_or_default())
}

async fn fetch_jobtech_employer(
    client: &reqwest::Client,
    org_number: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let url = format!(
        "{JOBSEARCH_BASE}/search?limit={limit}&employer={}",
        urlencoding::encode(org_number)
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("JobTech: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("JobTech HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("JobTech JSON: {e}"))?;
    Ok(body
        .get("hits")
        .and_then(|h| h.as_array())
        .cloned()
        .unwrap_or_default())
}

fn lead_from_greenhouse(
    firm: &FirmDef,
    job: &Value,
    filter: &MissionFirmFilter,
) -> Option<MissionFirmLead> {
    let id = job.get("id").map(|v| match v {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => String::new(),
    })?;
    if id.is_empty() {
        return None;
    }
    let title = job.get("title")?.as_str()?.trim().to_string();
    let location = job
        .get("location")
        .and_then(|l| l.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let absolute_url = job.get("absolute_url")?.as_str()?.trim().to_string();
    if absolute_url.is_empty() {
        return None;
    }
    let department = job
        .get("departments")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .and_then(|d| d.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    finish_lead(
        firm,
        "greenhouse",
        id,
        title,
        location,
        absolute_url,
        department,
        filter,
    )
}

fn lead_from_lever(
    firm: &FirmDef,
    job: &Value,
    filter: &MissionFirmFilter,
) -> Option<MissionFirmLead> {
    let id = job.get("id")?.as_str()?.to_string();
    let title = job.get("text")?.as_str()?.trim().to_string();
    let cats = job.get("categories");
    let location = cats
        .and_then(|c| c.get("location"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let department = cats
        .and_then(|c| c.get("team").or_else(|| c.get("department")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let absolute_url = job
        .get("hostedUrl")
        .or_else(|| job.get("applyUrl"))
        .and_then(|v| v.as_str())?
        .to_string();
    finish_lead(
        firm,
        "lever",
        id,
        title,
        location,
        absolute_url,
        department,
        filter,
    )
}

fn lead_from_ashby(
    firm: &FirmDef,
    job: &Value,
    filter: &MissionFirmFilter,
) -> Option<MissionFirmLead> {
    let id = job
        .get("id")
        .map(|v| match v {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())?;
    let title = job.get("title")?.as_str()?.trim().to_string();
    let location = job
        .get("location")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let department = job
        .get("department")
        .or_else(|| job.get("team"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let absolute_url = job
        .get("jobUrl")
        .or_else(|| job.get("applyUrl"))
        .and_then(|v| v.as_str())?
        .to_string();
    finish_lead(
        firm,
        "ashby",
        id,
        title,
        location,
        absolute_url,
        department,
        filter,
    )
}

fn lead_from_jobtech(
    firm: &FirmDef,
    hit: &Value,
    filter: &MissionFirmFilter,
) -> Option<MissionFirmLead> {
    let ad_id = hit.get("id").map(|v| match v {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        _ => String::new(),
    })?;
    if ad_id.is_empty() {
        return None;
    }
    let title = hit
        .get("headline")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .trim()
        .to_string();
    let municipality = hit
        .get("workplace_address")
        .and_then(|a| a.get("municipality"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let location = if municipality.is_empty() {
        "Sweden".into()
    } else {
        format!("{municipality}, Sweden")
    };
    let absolute_url = hit
        .get("webpage_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            format!("https://arbetsformedlingen.se/platsbanken/annonser/{ad_id}")
        });
    let department = hit
        .get("occupation")
        .and_then(|o| o.get("label"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    finish_lead(
        firm,
        "jobtech",
        ad_id,
        title,
        location,
        absolute_url,
        department,
        filter,
    )
}

fn tesla_json_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        out.push(cwd.join("data/mission-firms/tesla.jobs.json"));
        out.push(cwd.join("data/mission-firms/tesla.jobs.sample.json"));
        out.push(cwd.join("../data/mission-firms/tesla.jobs.json"));
        out.push(cwd.join("../data/mission-firms/tesla.jobs.sample.json"));
    }
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("../data/mission-firms/tesla.jobs.json");
    out.push(p.clone());
    p.set_file_name("tesla.jobs.sample.json");
    out.push(p);
    out
}

fn extract_tesla_listings(root: &Value) -> Vec<Value> {
    for key in ["listings", "results", "jobs", "data", "positions"] {
        if let Some(arr) = root.get(key).and_then(|v| v.as_array()) {
            return arr.clone();
        }
    }
    root.as_array().cloned().unwrap_or_default()
}

fn read_tesla_json_file(path: &std::path::Path) -> Result<Vec<Value>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let root: Value = serde_json::from_str(&text).map_err(|e| format!("Tesla JSON: {e}"))?;
    Ok(extract_tesla_listings(&root))
}

pub async fn load_tesla_listings(client: &reqwest::Client) -> Result<Vec<Value>, String> {
    match client
        .get(TESLA_CAREERS_STATE)
        .header("Accept", "application/json")
        .header("Referer", "https://www.tesla.com/careers/search/")
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(root) = resp.json::<Value>().await {
                let listings = extract_tesla_listings(&root);
                if !listings.is_empty() {
                    return Ok(listings);
                }
            }
        }
        _ => {}
    }
    for path in tesla_json_candidates() {
        if path.is_file() {
            let listings = read_tesla_json_file(&path)?;
            if !listings.is_empty() {
                return Ok(listings);
            }
        }
    }
    Err(
        "Tesla careers API blocked. Save cua-api/state JSON to data/mission-firms/tesla.jobs.json or keep sample."
            .into(),
    )
}

fn tesla_field<'a>(job: &'a Value, keys: &[&str]) -> Option<&'a str> {
    for k in keys {
        if let Some(s) = job
            .get(*k)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Some(s);
        }
    }
    None
}

fn lead_from_tesla(firm: &FirmDef, job: &Value, filter: &MissionFirmFilter) -> Option<MissionFirmLead> {
    let title = tesla_field(job, &["title", "t", "jobTitle", "name"])?.to_string();
    let location = tesla_field(job, &["location", "l", "loc", "city"])
        .unwrap_or("")
        .to_string();
    let department = tesla_field(job, &["department", "dp", "team", "family"]).map(|s| s.to_string());
    let id = job
        .get("id")
        .map(|v| match v {
            Value::Number(n) => n.to_string(),
            Value::String(s) => s.clone(),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("tesla-{}", title.chars().take(24).collect::<String>()));
    let absolute_url = tesla_field(job, &["absolute_url", "url", "applyUrl", "jobUrl"])
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            format!(
                "https://www.tesla.com/careers/search/?query={}",
                urlencoding::encode(&title)
            )
        });
    finish_lead(
        firm,
        "tesla",
        id,
        title,
        location,
        absolute_url,
        department,
        filter,
    )
}

async fn fetch_firm_leads(
    client: &reqwest::Client,
    firm: &FirmDef,
    filter: &MissionFirmFilter,
) -> Vec<MissionFirmLead> {
    let mut out = Vec::new();
    match firm.source {
        FirmSource::Greenhouse { board } => match fetch_greenhouse_jobs(client, board).await {
            Ok(jobs) => {
                for job in jobs {
                    if let Some(lead) = lead_from_greenhouse(firm, &job, filter) {
                        out.push(lead);
                    }
                }
            }
            Err(e) => eprintln!("[mission_firms] {} greenhouse skip: {e}", firm.id),
        },
        FirmSource::Lever { site } => match fetch_lever_jobs(client, site).await {
            Ok(jobs) => {
                for job in jobs {
                    if let Some(lead) = lead_from_lever(firm, &job, filter) {
                        out.push(lead);
                    }
                }
            }
            Err(e) => eprintln!("[mission_firms] {} lever skip: {e}", firm.id),
        },
        FirmSource::Ashby { board } => match fetch_ashby_jobs(client, board).await {
            Ok(jobs) => {
                for job in jobs {
                    if let Some(lead) = lead_from_ashby(firm, &job, filter) {
                        out.push(lead);
                    }
                }
            }
            Err(e) => eprintln!("[mission_firms] {} ashby skip: {e}", firm.id),
        },
        FirmSource::JobTech { org_number } => {
            match fetch_jobtech_employer(client, org_number, 100).await {
                Ok(hits) => {
                    for hit in hits {
                        if let Some(lead) = lead_from_jobtech(firm, &hit, filter) {
                            out.push(lead);
                        }
                    }
                }
                Err(e) => eprintln!("[mission_firms] {} jobtech skip: {e}", firm.id),
            }
        }
        FirmSource::TeslaLocal => match load_tesla_listings(client).await {
            Ok(listings) => {
                for job in listings {
                    if let Some(lead) = lead_from_tesla(firm, &job, filter) {
                        out.push(lead);
                    }
                }
            }
            Err(e) => eprintln!("[mission_firms] tesla skip: {e}"),
        },
    }
    out
}

fn merge_firm_buckets(mut buckets: Vec<Vec<MissionFirmLead>>, limit: usize) -> Vec<MissionFirmLead> {
    if buckets.is_empty() {
        return Vec::new();
    }
    for bucket in &mut buckets {
        bucket.sort_by(|a, b| {
            b.rank_score
                .partial_cmp(&a.rank_score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.external_id.cmp(&b.external_id))
        });
    }
    let firm_count = buckets.iter().filter(|b| !b.is_empty()).count().max(1);
    let per_firm = (limit / firm_count).clamp(5, 35);
    let mut out = Vec::new();
    let mut leftovers = Vec::new();
    for bucket in buckets {
        let mut iter = bucket.into_iter();
        for lead in iter.by_ref().take(per_firm) {
            out.push(lead);
        }
        leftovers.extend(iter);
    }
    leftovers.sort_by(|a, b| {
        b.rank_score
            .partial_cmp(&a.rank_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for lead in leftovers {
        if out.len() >= limit {
            break;
        }
        out.push(lead);
    }
    out.sort_by(|a, b| {
        b.rank_score
            .partial_cmp(&a.rank_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.firm_id.cmp(&b.firm_id))
            .then_with(|| a.external_id.cmp(&b.external_id))
    });
    out
}

fn leads_from_pool_for_filter(
    pool: &SearchPoolCache,
    firms: &[&FirmDef],
    filter: &MissionFirmFilter,
) -> Vec<Vec<MissionFirmLead>> {
    let firm_ids: HashSet<&str> = firms.iter().map(|f| f.id).collect();
    let mut by_firm: HashMap<String, Vec<MissionFirmLead>> = HashMap::new();
    for lead in pool.leads.values() {
        if !firm_ids.contains(lead.firm_id.as_str()) {
            continue;
        }
        let soft = lead.source == "jobtech";
        if !soft && !query_matches(&lead.title, &lead.location, filter.q.as_deref()) {
            continue;
        }
        if filter.texas_only && !lead.texas_match && !soft {
            continue;
        }
        // Re-score lightly for current terafab_bias / query
        let mut scored = lead.clone();
        if let Some(def) = firm_by_id(&lead.firm_id) {
            let (rank_score, rank_reasons, texas_match, terafab_adjacent) = score_lead(
                def,
                &lead.title,
                &lead.location,
                filter.q.as_deref(),
                filter.terafab_bias,
            );
            scored.rank_score = rank_score;
            scored.rank_reasons = rank_reasons;
            scored.texas_match = texas_match;
            scored.terafab_adjacent = terafab_adjacent;
        }
        by_firm
            .entry(lead.firm_id.clone())
            .or_default()
            .push(scored);
    }
    by_firm.into_values().collect()
}

pub async fn search_mission_firms(
    filter: &MissionFirmFilter,
) -> Result<Vec<MissionFirmLead>, String> {
    let client = http_client()?;
    let firms = parse_firm_ids(&filter.firms);
    let key = query_cache_key(filter, &firms);
    let mut pool = load_search_pool();
    pool.version = SEARCH_CACHE_VERSION;

    let cache_hit = !filter.force_refresh && pool.fetched_query_keys.contains(&key);
    if cache_hit {
        eprintln!("[mission_firms] cache hit for query key `{key}` ({} leads in pool)", pool.leads.len());
    } else {
        eprintln!(
            "[mission_firms] fetch+append for query key `{key}` (pool had {} leads)",
            pool.leads.len()
        );
        for firm in &firms {
            let fetched = fetch_firm_leads(&client, firm, filter).await;
            for lead in fetched {
                pool.leads.insert(lead.cache_key(), lead);
            }
        }
        pool.fetched_query_keys.insert(key);
        // stamp unused but useful for debugging
        let _ = now_secs();
        save_search_pool(&pool);
    }

    let buckets = leads_from_pool_for_filter(&pool, &firms, filter);
    let limit = filter.limit.unwrap_or(100).clamp(1, 250);
    Ok(merge_firm_buckets(buckets, limit))
}

pub fn mark_already_in_db(leads: &mut [MissionFirmLead], known: &[(String, i64)]) {
    for lead in leads.iter_mut() {
        if let Some((_, id)) = known
            .iter()
            .find(|(url, _)| url == &lead.absolute_url)
        {
            lead.already_in_db = true;
            lead.opportunity_id = Some(*id);
        }
    }
}

pub async fn fetch_greenhouse_job_jd(
    board: &str,
    job_id: &str,
) -> Result<(String, String, String, String), String> {
    let client = http_client()?;
    let url = format!("{GH_BASE}/{board}/jobs/{}", urlencoding::encode(job_id));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Greenhouse job: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Greenhouse job HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Greenhouse job JSON: {e}"))?;
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Role")
        .to_string();
    let location = body
        .get("location")
        .and_then(|l| l.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let absolute_url = body
        .get("absolute_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content_html = body
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content_text = strip_html_light(&content_html);
    let jd = format!(
        "# {title}\nLocation: {location}\nURL: {absolute_url}\nBoard: {board}\nJob id: {job_id}\n\n{content_text}"
    );
    Ok((title, location, absolute_url, jd))
}

pub async fn fetch_lever_job_jd(
    site: &str,
    job_id: &str,
) -> Result<(String, String, String, String), String> {
    let client = http_client()?;
    let url = format!("{LEVER_BASE}/{site}/{}", urlencoding::encode(job_id));
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Lever job: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Lever job HTTP {}", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Lever job JSON: {e}"))?;
    let title = body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("Role")
        .to_string();
    let location = body
        .get("categories")
        .and_then(|c| c.get("location"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let absolute_url = body
        .get("hostedUrl")
        .or_else(|| body.get("applyUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let desc = body
        .get("descriptionPlain")
        .or_else(|| body.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let jd = format!(
        "# {title}\nLocation: {location}\nURL: {absolute_url}\nLever: {site}\nId: {job_id}\n\n{desc}"
    );
    Ok((title, location, absolute_url, jd))
}

pub async fn fetch_ashby_job_jd(
    board: &str,
    job_id: &str,
    absolute_url_hint: Option<&str>,
) -> Result<(String, String, String, String), String> {
    let client = http_client()?;
    let jobs = fetch_ashby_jobs(&client, board).await?;
    let job = jobs
        .iter()
        .find(|j| {
            let id = j.get("id").map(|v| match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => String::new(),
            });
            id.as_deref() == Some(job_id)
        })
        .ok_or_else(|| format!("Ashby job {job_id} not on board {board}"))?;
    let title = job
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Role")
        .to_string();
    let location = job
        .get("location")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let absolute_url = job
        .get("jobUrl")
        .or_else(|| job.get("applyUrl"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| absolute_url_hint.map(|s| s.to_string()))
        .unwrap_or_default();
    let desc = job
        .get("descriptionPlain")
        .or_else(|| job.get("descriptionHtml"))
        .and_then(|v| v.as_str())
        .map(strip_html_light)
        .unwrap_or_default();
    let jd = format!(
        "# {title}\nLocation: {location}\nURL: {absolute_url}\nAshby: {board}\nId: {job_id}\n\n{desc}"
    );
    Ok((title, location, absolute_url, jd))
}

pub fn resolve_tesla_job_for_import(
    external_id: &str,
    absolute_url_hint: Option<&str>,
) -> Result<(String, String, String, String), String> {
    let mut listings = None;
    for path in tesla_json_candidates() {
        if path.is_file() {
            listings = Some(read_tesla_json_file(&path)?);
            break;
        }
    }
    let listings = listings.ok_or_else(|| {
        "Tesla listing file missing — save cua-api/state JSON to data/mission-firms/tesla.jobs.json"
            .to_string()
    })?;
    let job = listings
        .iter()
        .find(|j| {
            let id = j.get("id").map(|v| match v {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                _ => String::new(),
            });
            id.as_deref() == Some(external_id)
        })
        .ok_or_else(|| format!("Tesla job id {external_id} not in local dump"))?;
    let title = tesla_field(job, &["title", "t", "jobTitle", "name"])
        .unwrap_or("Tesla role")
        .to_string();
    let location = tesla_field(job, &["location", "l", "loc", "city"])
        .unwrap_or("")
        .to_string();
    let url = tesla_field(job, &["absolute_url", "url", "applyUrl", "jobUrl"])
        .map(|s| s.to_string())
        .or_else(|| {
            absolute_url_hint
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| {
            format!(
                "https://www.tesla.com/careers/search/?query={}",
                urlencoding::encode(&title)
            )
        });
    let desc = tesla_field(job, &["description", "content", "jobDescription", "d"])
        .unwrap_or("")
        .to_string();
    let dept = tesla_field(job, &["department", "dp", "team"]).unwrap_or("");
    let jd = format!(
        "# {title}\nCompany: Tesla\nDepartment: {dept}\nLocation: {location}\nURL: {url}\nId: {external_id}\n\n{desc}"
    );
    Ok((title, "Tesla".into(), url, jd))
}

/// Resolve Greenhouse board token for a firm id (import path).
pub fn greenhouse_board_for_firm(firm_id: &str) -> Option<&'static str> {
    match firm_by_id(firm_id)?.source {
        FirmSource::Greenhouse { board } => Some(board),
        _ => None,
    }
}

pub fn lever_site_for_firm(firm_id: &str) -> Option<&'static str> {
    match firm_by_id(firm_id)?.source {
        FirmSource::Lever { site } => Some(site),
        _ => None,
    }
}

pub fn ashby_board_for_firm(firm_id: &str) -> Option<&'static str> {
    match firm_by_id(firm_id)?.source {
        FirmSource::Ashby { board } => Some(board),
        _ => None,
    }
}

pub fn firm_label(firm_id: &str) -> String {
    firm_by_id(firm_id)
        .map(|f| f.label.to_string())
        .unwrap_or_else(|| firm_id.to_string())
}

fn strip_html_light(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
        .replace("&quot;", "\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_key_stable() {
        let firms = parse_firm_ids(&["einride".into(), "spacexai".into()]);
        let filter = MissionFirmFilter {
            q: Some("  AutonomOUS  ".into()),
            firms: vec!["einride".into(), "spacexai".into()],
            ..Default::default()
        };
        let k = query_cache_key(&filter, &firms);
        assert_eq!(k, "autonomous|einride,spacexai");
    }

    #[test]
    fn append_pool_dedupes_by_cache_key() {
        let mut pool = SearchPoolCache {
            version: 1,
            fetched_query_keys: HashSet::new(),
            leads: HashMap::new(),
        };
        let lead = MissionFirmLead {
            firm_id: "spacexai".into(),
            firm_label: "SpaceXAI".into(),
            source: "greenhouse".into(),
            external_id: "1".into(),
            title: "SWE".into(),
            location: "PA".into(),
            absolute_url: "https://example.test/1".into(),
            department: None,
            rank_score: 10.0,
            rank_reasons: vec![],
            texas_match: false,
            terafab_adjacent: false,
            already_in_db: false,
            opportunity_id: None,
        };
        let key = lead.cache_key();
        pool.leads.insert(key.clone(), lead.clone());
        pool.leads.insert(key, {
            let mut l2 = lead;
            l2.title = "SWE updated".into();
            l2
        });
        assert_eq!(pool.leads.len(), 1);
        assert_eq!(pool.leads.values().next().unwrap().title, "SWE updated");
    }

    #[test]
    fn merge_keeps_swedish_when_spacexai_dominates() {
        let mut spacexai = Vec::new();
        for i in 0..50 {
            spacexai.push(MissionFirmLead {
                firm_id: "spacexai".into(),
                firm_label: "SpaceXAI".into(),
                source: "greenhouse".into(),
                external_id: format!("x{i}"),
                title: format!("Role {i}"),
                location: "Palo Alto, CA".into(),
                absolute_url: format!("https://example.test/x/{i}"),
                department: None,
                rank_score: 90.0,
                rank_reasons: vec![],
                texas_match: false,
                terafab_adjacent: false,
                already_in_db: false,
                opportunity_id: None,
            });
        }
        let ericsson = vec![MissionFirmLead {
            firm_id: "ericsson".into(),
            firm_label: "Ericsson".into(),
            source: "jobtech".into(),
            external_id: "e1".into(),
            title: "Baseband Developer".into(),
            location: "Stockholm, Sweden".into(),
            absolute_url: "https://example.test/e/1".into(),
            department: None,
            rank_score: 30.0,
            rank_reasons: vec![],
            texas_match: false,
            terafab_adjacent: false,
            already_in_db: false,
            opportunity_id: None,
        }];
        let merged = merge_firm_buckets(vec![spacexai, ericsson], 20);
        assert!(merged.iter().any(|l| l.firm_id == "ericsson"));
    }

    #[test]
    fn tesla_keeps_mixed_sw_hw_only() {
        assert!(is_mixed_software_hardware(
            "Firmware Engineer, Vehicle Controls",
            "Vehicle Software"
        ));
        assert!(!is_mixed_software_hardware(
            "Backend Software Engineer",
            "Cloud Services"
        ));
    }

    #[test]
    fn registry_resolves_aliases() {
        assert_eq!(firm_by_id("xai").unwrap().id, "spacexai");
        assert_eq!(firm_by_id("1x").unwrap().id, "onex");
        assert!(firm_by_id("spotify").is_some());
        assert!(firm_by_id("volvo_cars").is_some());
    }
}

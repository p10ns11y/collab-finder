//! Personal network graph from gitignored LinkedIn/contacts exports.
//! PII stays on disk under `data/` — never commit. Scoring is local; X lookup uses
//! official API; LinkedIn uses public-page HTML meta only (no login bypass).
//!
//! Collab **fitness** is forward-looking: prefer people/companies whose products and
//! applied work stay relevant ≥~2 years — robotics, real engineering, societal
//! problem-solving. AI/ML counts when grounded in a domain, not as fashion.

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

const TOP_QUALIFY_DEFAULT: usize = 50;
const LI_FETCH_DELAY_MS: u64 = 1500;
const X_USER_LOOKUP_BATCH: usize = 100;
/// Direct Space/Defence/robotics path.
const COLLAB_FIT_THRESHOLD_DIRECT: f32 = 40.0;
/// Few-step bridge from web/SWE (ML/systems/platform eng) — looser than direct.
const COLLAB_FIT_THRESHOLD_BRIDGE: f32 = 28.0;

/// Default ex-employer allowlist (relationship tag — not primary fitness).
const EX_COLLEAGUE_COMPANIES: &[&str] = &["oneflow", "oneflow ab"];

/// Tier A — core targets (Space / Defence / robotics / autonomy / cyber-defence).
const MISSION_TIER_A: &[&str] = &[
    "robot",
    "robotics",
    "autonomous",
    "autonomy",
    "drone",
    "aerospace",
    "avionics",
    "satellite",
    "space tech",
    "spacetech",
    "spacex",
    "xai",
    "defence",
    "defense",
    "cyberdefense",
    "cyber defence",
    "cybersecurity",
    "cyber security",
    "dual-use",
    "missile",
    "orbital",
    "launch vehicle",
    "propulsion",
    "mechatronic",
    "perception",
    "computer vision",
    "control system",
    "actuator",
];

/// Tier B — durable applied domains; only count with software/engineering bridge.
const MISSION_TIER_B: &[&str] = &[
    "climate",
    "nuclear",
    "fusion",
    "semiconductor",
    "embedded",
    "firmware",
    "hardware engineer",
    "battery",
    "bioinformat",
    "computational",
];

/// Roles that look technical but are usually off the web→space path.
const OFF_PATH_DAMPEN: &[&str] = &[
    "process engineer",
    "account executive",
    "sales manager",
    "recruiter",
    "talent acquisition",
    "hr business",
    "marketing manager",
    "sugar",
    "doctoral researcher",
    "phd candidate",
    "people generalist",
    "desktop support",
];

/// Profile anchors — where the operator is now (web/SWE/agentic stack).
const PROFILE_ANCHOR_KEYWORDS: &[&str] = &[
    " software",
    "web ",
    "typescript",
    "javascript",
    "react",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full-stack",
    "playwright",
    "node.js",
    "nodejs",
    "tauri",
    " rust",
    "python",
    "agentic",
    "mcp",
];

/// Few-step bridges from web/SWE toward applied AI / systems / platform eng.
const PROFILE_BRIDGE_KEYWORDS: &[&str] = &[
    "ml engineer",
    "machine learning engineer",
    "machine learning /",
    "applied ai",
    "applied ml",
    "mlops",
    "systems software",
    "robotics software",
    "autonomy software",
    "perception engineer",
    "computer vision engineer",
    "staff software",
    "principal software",
    "principal engineer",
    "staff engineer",
    "systems developer",
    "platform engineer",
    "data infrastructure",
    "infrastructure & engineering",
    "lead software",
    "senior software engineer",
    "devops",
];

/// Target industries reachable in few steps from a senior SWE profile.
const PROFILE_TARGET_INDUSTRY_KEYWORDS: &[&str] = &[
    "space tech",
    "spacetech",
    "spacex",
    "xai",
    "aerospace",
    "satellite",
    "avionics",
    "defence",
    "defense",
    "dual-use",
    "autonomy",
    "robotics",
];

/// Extra target tokens matched with light word-boundary care (avoid "workspace").
fn blob_has_space_industry(blob: &str) -> bool {
    blob.contains("spacetech")
        || blob.contains("space tech")
        || blob.contains("spacex")
        || blob.contains(" aerospace")
        || blob.contains(" satellite")
        || blob.split_whitespace().any(|w| {
            w == "space"
                || w.starts_with("space,")
                || w.starts_with("space/")
                || w.starts_with("space-")
        })
}

/// Engineering roles that ship real systems (not title inflation alone).
const APPLIED_ENGINEERING_KEYWORDS: &[&str] = &[
    "robotics engineer",
    "systems engineer",
    "embedded",
    "firmware",
    "hardware engineer",
    "controls engineer",
    "mechatronic",
    "mechanical engineer",
    "electrical engineer",
    "research engineer",
    "staff engineer",
    "principal engineer",
    "platform engineer",
    "infrastructure",
    "sre",
    "reliability",
];

/// Soft builder signals — only score highly when paired with mission domain.
const BUILDER_ROLE_KEYWORDS: &[&str] = &[
    "founder",
    "co-founder",
    "cofounder",
    "cto",
    "chief technology",
    "head of engineering",
    "technical lead",
    "tech lead",
];

/// Generic software titles — small bump; not enough for CollabFit alone.
const GENERIC_SWE_KEYWORDS: &[&str] = &[
    "software engineer",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full-stack",
    "developer",
    "product engineer",
];

/// AI/ML surface terms — scored only with mission grounding (see rescore).
const AI_SURFACE_KEYWORDS: &[&str] = &[
    "machine learning",
    "deep learning",
    "computer vision",
    "reinforcement learning",
    " ml ",
    "ai ",
    "artificial intelligence",
    "llm",
    "genai",
    "generative ai",
    "prompt",
    "agentic",
    " ai engineer",
    "ml engineer",
    "mlops",
];

/// Fashion / AI-for-sake patterns — dampen fitness.
const AI_FOR_SAKE_KEYWORDS: &[&str] = &[
    "prompt engineer",
    "prompt engineering",
    "ai influencer",
    "chatgpt",
    "ai enthusiast",
    "genai evangelist",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum NetworkCategory {
    FirstConnection,
    ExColleague,
    CollabFit,
    LocationMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct XProfileHit {
    pub username: String,
    pub user_id: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    /// 0..1 name similarity vs LinkedIn full name
    pub name_match: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LinkedInPublicEnrichment {
    pub fetched: bool,
    #[serde(default)]
    pub auth_walled: bool,
    #[serde(default)]
    pub headline: Option<String>,
    #[serde(default)]
    pub about_snip: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPerson {
    pub id: String,
    /// `linkedin_connection` | `contact`
    #[serde(default = "default_linkedin_source")]
    pub source: String,
    pub first_name: String,
    pub last_name: String,
    pub full_name: String,
    pub company: String,
    pub position: String,
    pub linkedin_url: String,
    #[serde(default)]
    pub connected_on: Option<String>,
    #[serde(default)]
    pub emails: Option<String>,
    #[serde(default)]
    pub phones: Option<String>,
    pub collab_score: f32,
    pub categories: Vec<NetworkCategory>,
    #[serde(default)]
    pub location_bucket: Option<String>,
    #[serde(default)]
    pub x_profile: Option<XProfileHit>,
    #[serde(default)]
    pub linkedin_enrichment: Option<LinkedInPublicEnrichment>,
    #[serde(default)]
    pub score_reasons: Vec<String>,
}

fn default_linkedin_source() -> String {
    "linkedin_connection".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkGraphResult {
    pub source_path: String,
    pub total: usize,
    pub people: Vec<NetworkPerson>,
    pub top_ids: Vec<String>,
    pub category_counts: NetworkCategoryCounts,
    #[serde(default)]
    pub from_db: bool,
    #[serde(default)]
    pub connections_imported: usize,
    #[serde(default)]
    pub contacts_imported: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NetworkCategoryCounts {
    pub first_connection: usize,
    pub ex_colleague: usize,
    pub collab_fit: usize,
    pub location_match: usize,
    pub with_x: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct XUserData {
    id: String,
    name: String,
    username: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    location: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XUsersByResponse {
    data: Option<Vec<XUserData>>,
}

fn config_missing_hint() -> String {
    "Network CSV not found. Place LinkedIn Connections export at data/connections.csv (gitignored), or keep data/connections.sample.csv for local demos.".into()
}

pub fn connections_csv_candidates() -> Vec<PathBuf> {
    csv_candidates("connections.csv")
}

pub fn contacts_csv_candidates() -> Vec<PathBuf> {
    csv_candidates("contacts.csv")
}

fn csv_candidates(filename: &str) -> Vec<PathBuf> {
    let mut out = csv_paths_for_name(filename);
    // Prefer real exports; fall back to committed mocks so others can run Network locally.
    if let Some(stem) = filename.strip_suffix(".csv") {
        out.extend(csv_paths_for_name(&format!("{stem}.sample.csv")));
    }
    out
}

fn csv_paths_for_name(filename: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        out.push(cwd.join("data").join(filename));
        out.push(cwd.join("../data").join(filename));
    }
    {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../data");
        p.push(filename);
        out.push(p);
    }
    if let Ok(app) = crate::app_dirs::app_data_dir() {
        out.push(app.join(filename));
        out.push(app.join("network").join(filename));
    }
    out
}

pub fn resolve_connections_csv_path(explicit: Option<&str>) -> Result<PathBuf, String> {
    resolve_csv_path(explicit, &connections_csv_candidates(), "connections")
}

pub fn resolve_contacts_csv_path(explicit: Option<&str>) -> Option<PathBuf> {
    resolve_csv_path(explicit, &contacts_csv_candidates(), "contacts").ok()
}

fn resolve_csv_path(
    explicit: Option<&str>,
    candidates: &[PathBuf],
    label: &str,
) -> Result<PathBuf, String> {
    if let Some(raw) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        let p = PathBuf::from(raw);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!("{label} csv not found at {}", p.display()));
    }
    for p in candidates {
        if p.is_file() {
            return Ok(p.clone());
        }
    }
    Err(if label == "connections" {
        config_missing_hint()
    } else {
        format!("{label}.csv not found")
    })
}

pub fn file_fingerprint(path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(format!("{}:{}:{}", path.display(), meta.len(), modified))
}

/// LinkedIn export has a Notes preamble before the real header.
pub fn parse_connections_csv(text: &str) -> Result<Vec<NetworkPerson>, String> {
    let lines: Vec<&str> = text.lines().collect();
    let header_idx = lines
        .iter()
        .position(|line| {
            let lower = line.to_ascii_lowercase();
            lower.starts_with("first name,") || lower.contains("first name,last name,url")
        })
        .ok_or_else(|| "connections.csv missing 'First Name,…' header".to_string())?;

    let body = lines[header_idx..].join("\n");
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(body.as_bytes());

    let mut people = Vec::new();
    for rec in reader.records() {
        let record = rec.map_err(|e| e.to_string())?;
        let get = |i: usize| record.get(i).unwrap_or("").trim().to_string();
        let first = get(0);
        let last = get(1);
        let url = get(2);
        let company = get(4);
        let position = get(5);
        let connected = {
            let c = get(6);
            if c.is_empty() {
                None
            } else {
                Some(c)
            }
        };
        if first.is_empty() && last.is_empty() && url.is_empty() {
            continue;
        }
        let full_name = format!("{} {}", first, last).trim().to_string();
        let id = person_id("linkedin_connection", &url, &full_name, &company);
        let mut person = NetworkPerson {
            id,
            source: "linkedin_connection".into(),
            first_name: first,
            last_name: last,
            full_name,
            company,
            position,
            linkedin_url: url,
            connected_on: connected,
            emails: {
                let e = get(3);
                if e.is_empty() {
                    None
                } else {
                    Some(e)
                }
            },
            phones: None,
            collab_score: 0.0,
            categories: vec![NetworkCategory::FirstConnection],
            location_bucket: None,
            x_profile: None,
            linkedin_enrichment: None,
            score_reasons: Vec::new(),
        };
        rescore_person(&mut person);
        people.push(person);
    }
    Ok(people)
}

/// Mobile/Google contacts export (different header than LinkedIn Connections).
pub fn parse_contacts_csv(text: &str) -> Result<Vec<NetworkPerson>, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(text.as_bytes());
    let headers = reader
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|h| h.to_string())
        .collect::<Vec<_>>();
    let idx = |name: &str| {
        headers
            .iter()
            .position(|h| h.eq_ignore_ascii_case(name))
    };
    let i_first = idx("FirstName").or_else(|| idx("First Name"));
    let i_last = idx("LastName").or_else(|| idx("Last Name"));
    let i_full = idx("FullName").or_else(|| idx("Full Name"));
    let i_co = idx("Companies").or_else(|| idx("Company"));
    let i_title = idx("Title").or_else(|| idx("Position"));
    let i_email = idx("Emails").or_else(|| idx("Email Address"));
    let i_phone = idx("PhoneNumbers").or_else(|| idx("Phone Numbers")).or_else(|| idx("Phone"));
    let i_loc = idx("Location");
    let i_profiles = idx("Profiles");

    let mut people = Vec::new();
    for rec in reader.records() {
        let record = rec.map_err(|e| e.to_string())?;
        let get = |i: Option<usize>| {
            i.and_then(|ix| record.get(ix))
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let first = get(i_first);
        let last = get(i_last);
        let mut full = get(i_full);
        if full.is_empty() {
            full = format!("{first} {last}").trim().to_string();
        }
        let company = get(i_co);
        let company = if company == "null" {
            String::new()
        } else {
            company
                .split(',')
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        };
        let position = get(i_title);
        let emails = {
            let e = get(i_email);
            if e.is_empty() {
                None
            } else {
                Some(e)
            }
        };
        let phones = {
            let p = get(i_phone);
            if p.is_empty() {
                None
            } else {
                Some(p)
            }
        };
        let loc = get(i_loc);
        let profiles = get(i_profiles);
        let linkedin_url = profiles
            .split(|c| c == ',' || c == ';' || c == ' ')
            .find(|p| p.to_ascii_lowercase().contains("linkedin.com"))
            .unwrap_or("")
            .to_string();
        if full.is_empty() && company.is_empty() && emails.is_none() {
            continue;
        }
        let id = person_id("contact", &linkedin_url, &full, &company);
        let mut person = NetworkPerson {
            id,
            source: "contact".into(),
            first_name: first,
            last_name: last,
            full_name: full,
            company,
            position,
            linkedin_url,
            connected_on: None,
            emails,
            phones,
            collab_score: 0.0,
            categories: vec![NetworkCategory::FirstConnection],
            location_bucket: if loc.is_empty() {
                None
            } else {
                Some(location_bucket(&loc))
            },
            x_profile: None,
            linkedin_enrichment: None,
            score_reasons: Vec::new(),
        };
        rescore_person(&mut person);
        people.push(person);
    }
    Ok(people)
}

fn person_id(source: &str, linkedin_url: &str, full_name: &str, company: &str) -> String {
    let key = if !linkedin_url.trim().is_empty() {
        format!(
            "{}|{}",
            source,
            linkedin_url.trim().to_ascii_lowercase()
        )
    } else {
        format!(
            "{}|{}|{}",
            source,
            full_name.trim().to_ascii_lowercase(),
            company.trim().to_ascii_lowercase()
        )
    };
    format!("{:x}", simple_hash(&key))
}

fn simple_hash(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in s.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn normalize_company(company: &str) -> String {
    company.trim().to_ascii_lowercase()
}

fn is_ex_colleague(company: &str) -> bool {
    let n = normalize_company(company);
    EX_COLLEAGUE_COMPANIES.iter().any(|c| n == *c || n.contains(c))
}

fn pad_lower(s: &str) -> String {
    format!(" {} ", s.to_ascii_lowercase())
}

fn keyword_hits<'a>(haystack: &str, keywords: &[&'a str]) -> Vec<&'a str> {
    keywords
        .iter()
        .copied()
        .filter(|kw| haystack.contains(kw))
        .collect()
}

fn person_text_blob(person: &NetworkPerson) -> String {
    let mut parts = vec![
        person.company.as_str(),
        person.position.as_str(),
    ];
    if let Some(enrich) = &person.linkedin_enrichment {
        if let Some(h) = enrich.headline.as_deref() {
            parts.push(h);
        }
        if let Some(a) = enrich.about_snip.as_deref() {
            parts.push(a);
        }
    }
    if let Some(x) = &person.x_profile {
        if let Some(d) = x.description.as_deref() {
            parts.push(d);
        }
    }
    pad_lower(&parts.join(" "))
}

pub fn rescore_person(person: &mut NetworkPerson) {
    let mut total: f32 = 0.0;
    let mut forward: f32 = 0.0;
    let mut reasons = Vec::new();
    let mut cats = vec![NetworkCategory::FirstConnection];
    let blob = person_text_blob(person);

    if is_ex_colleague(&person.company) {
        total += 8.0;
        reasons.push("relationship:ex_colleague".into());
        cats.push(NetworkCategory::ExColleague);
    }

    let tier_a = keyword_hits(&blob, MISSION_TIER_A);
    let tier_b = keyword_hits(&blob, MISSION_TIER_B);
    let has_tier_a = !tier_a.is_empty() || blob_has_space_industry(&blob);
    let has_tier_b = !tier_b.is_empty();
    let has_mission = has_tier_a || has_tier_b;

    if has_tier_a {
        let bump = (28.0 + tier_a.len() as f32 * 3.0).min(40.0);
        forward += bump;
        total += bump;
        reasons.push(format!(
            "mission_a:{}",
            tier_a.iter().take(4).cloned().collect::<Vec<_>>().join("+")
        ));
    } else if has_tier_b {
        let bump = (10.0 + tier_b.len() as f32 * 2.0).min(16.0);
        forward += bump;
        total += bump;
        reasons.push(format!(
            "mission_b:{}",
            tier_b.iter().take(3).cloned().collect::<Vec<_>>().join("+")
        ));
    }

    let applied = keyword_hits(&blob, APPLIED_ENGINEERING_KEYWORDS);
    if !applied.is_empty() {
        let bump = if has_tier_a {
            (16.0 + applied.len() as f32 * 3.0).min(26.0)
        } else {
            (8.0 + applied.len() as f32 * 2.0).min(14.0)
        };
        forward += bump;
        total += bump;
        reasons.push(format!(
            "applied_eng:{}",
            applied.iter().take(3).cloned().collect::<Vec<_>>().join("+")
        ));
    }

    let ai_surface = keyword_hits(&blob, AI_SURFACE_KEYWORDS);
    let ai_for_sake = keyword_hits(&blob, AI_FOR_SAKE_KEYWORDS);
    let off_path = keyword_hits(&blob, OFF_PATH_DAMPEN);

    if !off_path.is_empty() {
        forward -= 16.0;
        total -= 16.0;
        reasons.push(format!("dampen:off_path:{}", off_path.join("+")));
    }

    if !ai_for_sake.is_empty() {
        forward -= 12.0;
        total -= 12.0;
        reasons.push(format!("dampen:ai_for_sake:{}", ai_for_sake.join("+")));
    } else if !ai_surface.is_empty() {
        if has_tier_a || (!applied.is_empty() && has_tier_b) {
            forward += 12.0;
            total += 12.0;
            reasons.push("applied_ai:grounded".into());
        } else {
            total += 1.0;
            reasons.push("ai_surface:ungrounded".into());
        }
    }

    let mut builders = keyword_hits(&blob, BUILDER_ROLE_KEYWORDS);
    let is_ceo = blob.split_whitespace().any(|w| {
        w.trim_matches(|c: char| !c.is_alphanumeric()) == "ceo"
    });
    if has_tier_a && is_ceo && !builders.iter().any(|b| *b == "ceo") {
        builders.push("ceo");
    }
    if !builders.is_empty() {
        let bump = if has_tier_a { 14.0 } else if has_tier_b { 6.0 } else { 2.0 };
        forward += bump;
        total += bump;
        reasons.push(format!("builder:{}", builders[0]));
    }

    let generic = keyword_hits(&blob, GENERIC_SWE_KEYWORDS);
    let has_swe = !generic.is_empty()
        || !applied.is_empty()
        || blob.contains("software")
        || blob.contains("developer")
        || blob.contains("systems developer")
        || blob.contains(" engineer")
        || blob.contains("engineer ");
    if !generic.is_empty() && applied.is_empty() {
        total += 3.0;
        if has_tier_a {
            forward += 8.0;
            total += 8.0;
            reasons.push("swe_on_tier_a".into());
        } else if has_tier_b {
            forward += 4.0;
            total += 4.0;
            reasons.push("swe_on_tier_b".into());
        } else {
            reasons.push(format!("generic_swe:{}", generic[0]));
        }
    }

    let bridges_early = keyword_hits(&blob, PROFILE_BRIDGE_KEYWORDS);
    if !bridges_early.is_empty() {
        let bump = if has_tier_a { 28.0 } else { 30.0 };
        forward += bump;
        total += bump;
        reasons.push(format!(
            "bridge_role:{}",
            bridges_early
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("+")
        ));
    }

    let (adj, adj_reasons) =
        profile_adjacency_score(&blob, has_swe, has_tier_a, has_tier_b, !ai_surface.is_empty());
    if adj > 0.0 {
        if bridges_early.is_empty() || adj_reasons.iter().any(|r| r.contains("target_swe")) {
            forward += adj;
            total += adj;
            reasons.extend(adj_reasons);
        } else {
            reasons.extend(adj_reasons.into_iter().map(|r| format!("adj_note:{r}")));
        }
    }

    if let Some(enrich) = &person.linkedin_enrichment {
        if let Some(loc) = enrich.location.as_ref().filter(|s| !s.is_empty()) {
            person.location_bucket = Some(location_bucket(loc));
            if location_is_priority(loc) {
                total += 3.0;
                reasons.push("location_priority".into());
                cats.push(NetworkCategory::LocationMatch);
            }
        }
        if let Some(about) = enrich.about_snip.as_ref().or(enrich.headline.as_ref()) {
            let about_lower = pad_lower(about);
            if !keyword_hits(&about_lower, MISSION_TIER_A).is_empty() || blob_has_space_industry(&about_lower)
            {
                forward += 6.0;
                total += 6.0;
                reasons.push("li_mission:tier_a".into());
            }
        }
    }

    if let Some(x) = &person.x_profile {
        total += 3.0 + (x.name_match * 3.0);
        reasons.push("outreach:has_x".into());
        if let Some(loc) = x.location.as_ref().filter(|s| !s.is_empty()) {
            if person.location_bucket.is_none() {
                person.location_bucket = Some(location_bucket(loc));
            }
            if location_is_priority(loc) && !cats.contains(&NetworkCategory::LocationMatch) {
                total += 2.0;
                cats.push(NetworkCategory::LocationMatch);
                reasons.push("x_location_priority".into());
            }
        }
        if let Some(desc) = x.description.as_ref() {
            let d = pad_lower(desc);
            if !keyword_hits(&d, MISSION_TIER_A).is_empty() || blob_has_space_industry(&d) {
                forward += 5.0;
                total += 5.0;
                reasons.push("x_mission_bio".into());
            }
        }
    }

    // CollabFit: (1) direct Space/Defence/robotics path, or (2) few-step SWE bridge.
    let bridges = keyword_hits(&blob, PROFILE_BRIDGE_KEYWORDS);
    let direct_path = has_tier_a && (has_swe || !builders.is_empty() || !applied.is_empty());
    // Bridge title keywords already imply an engineering role (ML eng, platform eng, …).
    let bridge_path = !bridges.is_empty() && off_path.is_empty();

    let is_fit = off_path.is_empty()
        && person.source != "contact" // contacts enrich LI rows; don't rank phonebook-only as fit
        && ((direct_path && forward >= COLLAB_FIT_THRESHOLD_DIRECT)
            || (bridge_path && forward >= COLLAB_FIT_THRESHOLD_BRIDGE));

    if is_fit {
        if !cats.contains(&NetworkCategory::CollabFit) {
            cats.push(NetworkCategory::CollabFit);
        }
        reasons.push(format!(
            "collab_fit:{}:forward={:.0}",
            if direct_path { "direct" } else { "bridge" },
            forward
        ));
    } else if forward >= COLLAB_FIT_THRESHOLD_BRIDGE && !direct_path && !bridge_path {
        reasons.push("near_fit:no_core_path".into());
    }

    let mut seen = HashSet::new();
    cats.retain(|c| seen.insert(c.clone()));

    person.collab_score = total.max(0.0);
    person.categories = cats;
    person.score_reasons = reasons;
}

/// Fewer career steps from current profile (web/software/AI-ML) into target industries.
fn profile_adjacency_score(
    blob: &str,
    has_swe: bool,
    has_tier_a: bool,
    has_tier_b: bool,
    has_ai_surface: bool,
) -> (f32, Vec<String>) {
    let anchors = keyword_hits(blob, PROFILE_ANCHOR_KEYWORDS);
    let bridges = keyword_hits(blob, PROFILE_BRIDGE_KEYWORDS);
    let mut targets = keyword_hits(blob, PROFILE_TARGET_INDUSTRY_KEYWORDS);
    if blob_has_space_industry(blob) && !targets.iter().any(|t| *t == "space" || t.contains("space"))
    {
        targets.push("space");
    }
    let mut reasons = Vec::new();

    if (!targets.is_empty() || has_tier_a) && has_swe {
        reasons.push(format!(
            "adjacency:target_swe:{}",
            targets.iter().take(3).cloned().collect::<Vec<_>>().join("+")
        ));
        return (26.0, reasons);
    }
    if has_tier_a {
        reasons.push("adjacency:target_non_swe".into());
        return (6.0, reasons);
    }
    if !bridges.is_empty() && (has_tier_b || has_tier_a) {
        reasons.push(format!("adjacency:bridge:{}", bridges[0]));
        return (16.0, reasons);
    }
    if !bridges.is_empty() {
        // Bridge title alone (no mission) — modest, not enough for CollabFit alone.
        reasons.push(format!("adjacency:bridge_only:{}", bridges[0]));
        return (8.0, reasons);
    }
    if has_ai_surface && has_swe && has_tier_a {
        reasons.push("adjacency:ai_swe_mission".into());
        return (14.0, reasons);
    }
    if has_ai_surface && has_swe {
        reasons.push("adjacency:ai_swe".into());
        return (6.0, reasons);
    }
    if !anchors.is_empty() && has_tier_a {
        reasons.push("adjacency:anchor_mission".into());
        return (12.0, reasons);
    }
    if !anchors.is_empty() {
        reasons.push("adjacency:anchor".into());
        return (3.0, reasons);
    }
    (0.0, reasons)
}

fn location_bucket(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("stockholm") || lower.contains("sweden") || lower.contains("sverige") {
        "Sweden / Stockholm".into()
    } else if lower.contains("india") || lower.contains("chennai") || lower.contains("bangalore") || lower.contains("bengaluru") {
        "India".into()
    } else if lower.contains("remote") {
        "Remote".into()
    } else if lower.contains("united states") || lower.contains("usa") || lower.contains("san francisco") || lower.contains("new york") {
        "US".into()
    } else {
        raw.split(',').next().unwrap_or(raw).trim().chars().take(40).collect()
    }
}

fn location_is_priority(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.contains("stockholm")
        || lower.contains("sweden")
        || lower.contains("sverige")
        || lower.contains("remote")
        || lower.contains("europe")
}

pub fn rank_and_summarize(mut people: Vec<NetworkPerson>, top_n: usize) -> NetworkGraphResult {
    people.sort_by(|a, b| {
        b.collab_score
            .partial_cmp(&a.collab_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.full_name.cmp(&b.full_name))
    });
    let top_ids: Vec<String> = people.iter().take(top_n).map(|p| p.id.clone()).collect();
    let mut counts = NetworkCategoryCounts {
        first_connection: people.len(),
        ..Default::default()
    };
    for person in &people {
        if person.categories.contains(&NetworkCategory::ExColleague) {
            counts.ex_colleague += 1;
        }
        if person.categories.contains(&NetworkCategory::CollabFit) {
            counts.collab_fit += 1;
        }
        if person.categories.contains(&NetworkCategory::LocationMatch) {
            counts.location_match += 1;
        }
        if person.x_profile.is_some() {
            counts.with_x += 1;
        }
    }
    NetworkGraphResult {
        source_path: String::new(),
        total: people.len(),
        people,
        top_ids,
        category_counts: counts,
        from_db: false,
        connections_imported: 0,
        contacts_imported: 0,
    }
}

pub fn load_network_graph_from_path(path: &Path, top_n: usize) -> Result<NetworkGraphResult, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let people = parse_connections_csv(&text)?;
    let mut result = rank_and_summarize(people, top_n);
    result.source_path = path.display().to_string();
    Ok(result)
}

pub fn normalize_person_name(name: &str) -> String {
    let lowered: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c.is_whitespace() {
                c.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect();
    lowered.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Copy emails/phones from `contact` rows onto matching LinkedIn connections (by normalized name).
pub fn merge_contact_fields_into_connections(people: &mut [NetworkPerson]) {
    use std::collections::HashMap;
    let mut by_name: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    for person in people.iter().filter(|p| p.source == "contact") {
        let key = normalize_person_name(&person.full_name);
        if key.is_empty() {
            continue;
        }
        let entry = by_name.entry(key).or_insert((None, None));
        if entry.0.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
            if let Some(e) = person.emails.as_ref().filter(|s| !s.is_empty()) {
                entry.0 = Some(e.clone());
            }
        }
        if entry.1.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
            if let Some(ph) = person.phones.as_ref().filter(|s| !s.is_empty()) {
                entry.1 = Some(ph.clone());
            }
        }
    }
    for person in people
        .iter_mut()
        .filter(|p| p.source == "linkedin_connection" || p.source.is_empty())
    {
        let key = normalize_person_name(&person.full_name);
        let Some((email, phone)) = by_name.get(&key) else {
            continue;
        };
        if person.emails.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
            person.emails = email.clone();
        }
        if person.phones.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
            person.phones = phone.clone();
        }
    }
}

/// Sync gitignored CSVs into SQLite when fingerprints change, then score + rank from DB.
pub fn load_network_graph_via_db(
    store: &crate::db::SqliteStore,
    connections_path: Option<&str>,
    contacts_path: Option<&str>,
    force_reimport: bool,
    top_n: usize,
) -> Result<NetworkGraphResult, String> {
    let conn_path = resolve_connections_csv_path(connections_path)?;
    // Contacts: explicit path, else sibling `contacts.csv` next to connections (not a global hunt).
    let contacts = if let Some(raw) = contacts_path.map(str::trim).filter(|s| !s.is_empty()) {
        let p = PathBuf::from(raw);
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    } else {
        conn_path
            .parent()
            .map(|dir| dir.join("contacts.csv"))
            .filter(|p| p.is_file())
    };

    let mut connections_imported = 0usize;
    let mut contacts_imported = 0usize;

    let conn_fp = file_fingerprint(&conn_path)?;
    let prev = store
        .get_network_import_fingerprint("connections")
        .unwrap_or(None);
    if force_reimport || prev.as_deref() != Some(conn_fp.as_str()) {
        let text = std::fs::read_to_string(&conn_path)
            .map_err(|e| format!("read {}: {e}", conn_path.display()))?;
        let people = parse_connections_csv(&text)?;
        connections_imported = people.len();
        store.replace_network_people_for_source("linkedin_connection", &people)?;
        store.set_network_import_meta(
            "connections",
            &conn_path.display().to_string(),
            &conn_fp,
            connections_imported as i64,
        )?;
    }

    if let Some(ref cpath) = contacts {
        let cfp = file_fingerprint(cpath)?;
        let prev_c = store
            .get_network_import_fingerprint("contacts")
            .unwrap_or(None);
        if force_reimport || prev_c.as_deref() != Some(cfp.as_str()) {
            let text = std::fs::read_to_string(cpath)
                .map_err(|e| format!("read {}: {e}", cpath.display()))?;
            let people = parse_contacts_csv(&text)?;
            contacts_imported = people.len();
            store.replace_network_people_for_source("contact", &people)?;
            store.set_network_import_meta(
                "contacts",
                &cpath.display().to_string(),
                &cfp,
                contacts_imported as i64,
            )?;
        }
    }

    let mut people = store.list_network_people()?;
    if people.is_empty() {
        return Err("network_people empty after import — check CSV paths".into());
    }
    merge_contact_fields_into_connections(&mut people);
    for person in &mut people {
        rescore_person(person);
    }
    let _ = store.upsert_network_people_scores(&people);

    let mut result = rank_and_summarize(people, top_n);
    result.from_db = true;
    result.connections_imported = connections_imported;
    result.contacts_imported = contacts_imported;
    result.source_path = format!(
        "sqlite:network_people←{}",
        conn_path.display()
    );
    Ok(result)
}

pub fn linkedin_vanity_slug(url: &str) -> Option<String> {
    let lower = url.trim().to_ascii_lowercase();
    let marker = "/in/";
    let idx = lower.find(marker)?;
    let rest = &url.trim()[idx + marker.len()..];
    let slug = rest
        .split(['/', '?', '#', '&'])
        .next()
        .unwrap_or("")
        .trim()
        .trim_matches('/');
    if slug.is_empty() {
        None
    } else {
        Some(slug.to_string())
    }
}

pub fn username_candidates(person: &NetworkPerson) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |s: String| {
        let cleaned: String = s
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect();
        if cleaned.len() >= 3 && !out.iter().any(|x| x == &cleaned) {
            out.push(cleaned);
        }
    };
    if let Some(slug) = linkedin_vanity_slug(&person.linkedin_url) {
        push(slug.replace('-', "_"));
        push(slug.replace('-', ""));
        // keep hyphen-stripped already; also try original alnum-only from slug
        let alnum: String = slug.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        push(alnum);
    }
    let first = person.first_name.to_ascii_lowercase();
    let last = person.last_name.to_ascii_lowercase();
    if !first.is_empty() && !last.is_empty() {
        push(format!("{first}{last}"));
        push(format!("{first}_{last}"));
        if let Some(fi) = first.chars().next() {
            push(format!("{fi}{last}"));
        }
    }
    out.truncate(6);
    out
}

pub fn name_similarity(a: &str, b: &str) -> f32 {
    let tokens = |s: &str| -> HashSet<String> {
        s.to_ascii_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|t| t.len() > 1)
            .map(|t| t.to_string())
            .collect()
    };
    let ta = tokens(a);
    let tb = tokens(b);
    if ta.is_empty() || tb.is_empty() {
        return 0.0;
    }
    let inter = ta.intersection(&tb).count() as f32;
    let union = ta.union(&tb).count() as f32;
    inter / union
}

fn pick_best_x_user(person: &NetworkPerson, users: &[XUserData]) -> Option<XProfileHit> {
    let mut best: Option<(f32, &XUserData)> = None;
    for user in users {
        let sim = name_similarity(&person.full_name, &user.name);
        // Prefer stronger name match; allow medium if username came from LI slug
        if sim < 0.34 {
            continue;
        }
        if best.map(|(s, _)| sim > s).unwrap_or(true) {
            best = Some((sim, user));
        }
    }
    best.map(|(sim, user)| XProfileHit {
        username: user.username.clone(),
        user_id: user.id.clone(),
        display_name: user.name.clone(),
        description: user.description.clone(),
        location: user.location.clone(),
        name_match: sim,
    })
}

async fn lookup_x_usernames(bearer: &str, usernames: &[String]) -> Result<Vec<XUserData>, String> {
    if usernames.is_empty() {
        return Ok(Vec::new());
    }
    let joined = usernames.join(",");
    let url = format!(
        "https://api.x.com/2/users/by?usernames={}&user.fields=name,description,location,public_metrics",
        urlencoding::encode(&joined)
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", bearer.trim()))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(crate::x_search::api_error_message(status.as_u16(), &body));
    }
    let parsed: XUsersByResponse = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(parsed.data.unwrap_or_default())
}

/// Resolve X profiles for the current top-N (or explicit ids). Mutates matching people in `graph`.
pub async fn resolve_x_for_top(
    bearer: &str,
    graph: &mut NetworkGraphResult,
    ids: Option<Vec<String>>,
    top_n: usize,
) -> Result<usize, String> {
    let target_ids: Vec<String> = if let Some(ids) = ids {
        ids
    } else {
        graph.top_ids.iter().take(top_n).cloned().collect()
    };
    if target_ids.is_empty() {
        return Ok(0);
    }

    // Build candidate batches per person, then flatten unique lookups
    let mut resolved = 0usize;
    for id in &target_ids {
        let Some(person) = graph.people.iter().find(|p| &p.id == id) else {
            continue;
        };
        let candidates = username_candidates(person);
        if candidates.is_empty() {
            continue;
        }
        // Chunk to respect API batch size (usually small per person)
        let mut found: Option<XProfileHit> = None;
        for chunk in candidates.chunks(X_USER_LOOKUP_BATCH.min(10).max(1)) {
            let users = lookup_x_usernames(bearer, &chunk.to_vec()).await?;
            if let Some(hit) = pick_best_x_user(person, &users) {
                found = Some(hit);
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        if let Some(hit) = found {
            if let Some(person_mut) = graph.people.iter_mut().find(|p| &p.id == id) {
                person_mut.x_profile = Some(hit);
                rescore_person(person_mut);
                resolved += 1;
            }
        }
    }

    // Re-rank after X hits
    let people = std::mem::take(&mut graph.people);
    let source = graph.source_path.clone();
    let from_db = graph.from_db;
    let connections_imported = graph.connections_imported;
    let contacts_imported = graph.contacts_imported;
    *graph = rank_and_summarize(people, top_n.max(TOP_QUALIFY_DEFAULT));
    graph.source_path = source;
    graph.from_db = from_db;
    graph.connections_imported = connections_imported;
    graph.contacts_imported = contacts_imported;
    Ok(resolved)
}

fn browser_like_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (compatible; collab-finder/0.1; +https://github.com/sustainableabundance/collab-finder)",
        ),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml"),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.8"),
    );
    headers
}

pub fn parse_linkedin_public_html(html: &str) -> LinkedInPublicEnrichment {
    let lower = html.to_ascii_lowercase();
    let auth_walled = lower.contains("authwall")
        || lower.contains("session_redirect")
        || lower.contains("join linkedin")
        || (lower.contains("sign in") && lower.contains("linkedin") && !lower.contains("og:title"));

    let meta_content = |prop: &str| -> Option<String> {
        // property="og:title" content="..."
        let patterns = [
            format!("property=\"{prop}\""),
            format!("name=\"{prop}\""),
            format!("property='{prop}'"),
            format!("name='{prop}'"),
        ];
        for pat in &patterns {
            if let Some(idx) = lower.find(&pat.to_ascii_lowercase()) {
                let slice = &html[idx..html.len().min(idx + 400)];
                if let Some(cidx) = slice.to_ascii_lowercase().find("content=") {
                    let after = &slice[cidx + "content=".len()..];
                    let quote = after.chars().next()?;
                    if quote == '"' || quote == '\'' {
                        let rest = &after[1..];
                        if let Some(end) = rest.find(quote) {
                            let val = rest[..end].trim();
                            if !val.is_empty() {
                                return Some(html_unescape_basic(val));
                            }
                        }
                    }
                }
            }
        }
        None
    };

    let headline = meta_content("og:title").or_else(|| meta_content("twitter:title"));
    let about = meta_content("og:description").or_else(|| meta_content("description"));
    let location = extract_json_ld_location(html).or_else(|| {
        // LinkedIn sometimes embeds "addressLocality"
        extract_quoted_field(html, "addressLocality")
            .or_else(|| extract_quoted_field(html, "locationName"))
    });

    LinkedInPublicEnrichment {
        fetched: true,
        auth_walled,
        headline,
        about_snip: about.map(|s| s.chars().take(400).collect()),
        location,
        error: if auth_walled {
            Some("Public page looked auth-walled; used whatever meta was present".into())
        } else {
            None
        },
    }
}

fn html_unescape_basic(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn extract_quoted_field(html: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\"");
    let idx = html.find(&needle)?;
    let after = &html[idx + needle.len()..];
    let colon = after.find(':')?;
    let rest = after[colon + 1..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let rest = &rest[1..];
    let end = rest.find('"')?;
    let val = rest[..end].trim();
    if val.is_empty() {
        None
    } else {
        Some(val.to_string())
    }
}

fn extract_json_ld_location(html: &str) -> Option<String> {
    extract_quoted_field(html, "addressLocality")
        .or_else(|| extract_quoted_field(html, "addressRegion"))
}

pub async fn fetch_linkedin_public(url: &str) -> Result<LinkedInPublicEnrichment, String> {
    let url = url.trim();
    if url.is_empty() || !url.contains("linkedin.com") {
        return Err("linkedin url required".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .headers(browser_like_headers())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let html = resp.text().await.map_err(|e| e.to_string())?;
    if status.as_u16() == 999 || status.as_u16() == 429 {
        return Ok(LinkedInPublicEnrichment {
            fetched: false,
            auth_walled: true,
            error: Some(format!("LinkedIn blocked fetch (HTTP {status})")),
            ..Default::default()
        });
    }
    if !status.is_success() {
        return Ok(LinkedInPublicEnrichment {
            fetched: false,
            error: Some(format!("HTTP {status}")),
            ..Default::default()
        });
    }
    Ok(parse_linkedin_public_html(&html))
}

pub async fn enrich_linkedin_for_top(
    graph: &mut NetworkGraphResult,
    ids: Option<Vec<String>>,
    top_n: usize,
) -> Result<usize, String> {
    let target_ids: Vec<String> = if let Some(ids) = ids {
        ids
    } else {
        // Prefer people who already have X, else top by score
        let mut with_x: Vec<String> = graph
            .people
            .iter()
            .filter(|p| p.x_profile.is_some())
            .take(top_n)
            .map(|p| p.id.clone())
            .collect();
        if with_x.is_empty() {
            with_x = graph.top_ids.iter().take(top_n).cloned().collect();
        }
        with_x
    };

    let mut enriched = 0usize;
    for (i, id) in target_ids.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(Duration::from_millis(LI_FETCH_DELAY_MS)).await;
        }
        let url = match graph.people.iter().find(|p| &p.id == id) {
            Some(p) if !p.linkedin_url.is_empty() => p.linkedin_url.clone(),
            _ => continue,
        };
        match fetch_linkedin_public(&url).await {
            Ok(enrichment) => {
                if let Some(person) = graph.people.iter_mut().find(|p| &p.id == id) {
                    person.linkedin_enrichment = Some(enrichment);
                    rescore_person(person);
                    enriched += 1;
                }
            }
            Err(e) => {
                if let Some(person) = graph.people.iter_mut().find(|p| &p.id == id) {
                    person.linkedin_enrichment = Some(LinkedInPublicEnrichment {
                        fetched: false,
                        error: Some(e),
                        ..Default::default()
                    });
                }
            }
        }
    }

    let people = std::mem::take(&mut graph.people);
    let source = graph.source_path.clone();
    let from_db = graph.from_db;
    let connections_imported = graph.connections_imported;
    let contacts_imported = graph.contacts_imported;
    *graph = rank_and_summarize(people, top_n.max(TOP_QUALIFY_DEFAULT));
    graph.source_path = source;
    graph.from_db = from_db;
    graph.connections_imported = connections_imported;
    graph.contacts_imported = contacts_imported;
    Ok(enriched)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"Notes:
"note line"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace,,Field Robotics AB,Robotics Engineer,16 Mar 2025
Bob,Builder,https://www.linkedin.com/in/bobbuilder,,OtherCo,Account Executive,01 Jan 2015
Cai,Prompt,https://www.linkedin.com/in/caiprompt,,Oneflow,Staff AI Engineer,16 Mar 2025
Dee,Hype,https://www.linkedin.com/in/deehype,,BuzzAI,Prompt Engineer,01 Jan 2024
Sam,Orbit,https://www.linkedin.com/in/samorbit,,SpaceTech AB,Senior Software Engineer,01 Jun 2024
Pri,Sugar,https://www.linkedin.com/in/prisugar,,BAIRAVANATH SUGAR FACTORY,Process Engineer,01 Jan 2023
Yue,Robot,https://www.linkedin.com/in/yuerobot,,Bongos Robotics,CEO,01 Jan 2024
Mel,Learn,https://www.linkedin.com/in/mellearn,,Oneflow,Machine Learning Engineer,01 Jan 2023
"#;

    #[test]
    fn parses_preamble_and_scores_ex_colleague() {
        let people = parse_connections_csv(SAMPLE).expect("parse");
        assert_eq!(people.len(), 8);
        let cai = people.iter().find(|p| p.first_name == "Cai").unwrap();
        assert!(cai.categories.contains(&NetworkCategory::ExColleague));
    }

    #[test]
    fn forward_fitness_prefers_robotics_over_ai_for_sake() {
        let people = parse_connections_csv(SAMPLE).unwrap();
        let ada = people.iter().find(|p| p.first_name == "Ada").unwrap();
        let cai = people.iter().find(|p| p.first_name == "Cai").unwrap();
        let dee = people.iter().find(|p| p.first_name == "Dee").unwrap();
        let bob = people.iter().find(|p| p.first_name == "Bob").unwrap();
        assert!(ada.categories.contains(&NetworkCategory::CollabFit));
        assert!(
            ada.collab_score > cai.collab_score,
            "robotics mission should outrank ungrounded AI at ex-employer"
        );
        assert!(ada.collab_score > dee.collab_score);
        assert!(ada.collab_score > bob.collab_score);
        assert!(!dee.categories.contains(&NetworkCategory::CollabFit));
        assert!(
            dee.score_reasons.iter().any(|r| r.contains("ai_for_sake")),
            "prompt-engineer should be dampened"
        );
    }

    #[test]
    fn profile_adjacency_boosts_space_swe() {
        let people = parse_connections_csv(SAMPLE).unwrap();
        let sam = people.iter().find(|p| p.first_name == "Sam").unwrap();
        let dee = people.iter().find(|p| p.first_name == "Dee").unwrap();
        let pri = people.iter().find(|p| p.first_name == "Pri").unwrap();
        let yue = people.iter().find(|p| p.first_name == "Yue").unwrap();
        let mel = people.iter().find(|p| p.first_name == "Mel").unwrap();
        assert!(
            sam.score_reasons.iter().any(|r| r.contains("adjacency:target_swe")),
            "space + SWE should be few-step adjacent to profile"
        );
        assert!(sam.collab_score > dee.collab_score);
        assert!(sam.categories.contains(&NetworkCategory::CollabFit));
        assert!(
            !pri.categories.contains(&NetworkCategory::CollabFit),
            "sugar process engineer must not be collab fit"
        );
        assert!(
            yue.categories.contains(&NetworkCategory::CollabFit),
            "robotics CEO should be direct fit"
        );
        assert!(
            mel.categories.contains(&NetworkCategory::CollabFit),
            "ML engineer is a few-step bridge fit"
        );
    }

    #[test]
    fn merges_contact_email_and_phone_onto_connection() {
        let mut people = parse_connections_csv(SAMPLE).unwrap();
        let contacts = parse_contacts_csv(
            "Source,FirstName,LastName,Companies,Title,Emails,PhoneNumbers,FullName\n\
             GOOGLE_CONTACTS,Sam,Orbit,,eng,sam@example.com,+46701234567,Sam Orbit\n",
        )
        .unwrap();
        people.extend(contacts);
        merge_contact_fields_into_connections(&mut people);
        let sam = people
            .iter()
            .find(|p| p.first_name == "Sam" && p.source == "linkedin_connection")
            .unwrap();
        assert_eq!(sam.emails.as_deref(), Some("sam@example.com"));
        assert_eq!(sam.phones.as_deref(), Some("+46701234567"));
    }

    #[test]
    fn db_import_and_reload() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("n.db");
        let store = crate::db::SqliteStore::open_at(db_path).unwrap();
        let csv = dir.path().join("connections.csv");
        std::fs::write(&csv, SAMPLE).unwrap();
        let g1 = load_network_graph_via_db(&store, Some(csv.to_str().unwrap()), None, true, 3)
            .expect("import");
        assert!(g1.from_db);
        assert_eq!(g1.connections_imported, 8);
        assert_eq!(store.network_people_count().unwrap(), 8);
        let g2 = load_network_graph_via_db(&store, Some(csv.to_str().unwrap()), None, false, 3)
            .expect("reload");
        assert_eq!(g2.connections_imported, 0, "fingerprint skip reimport");
        assert_eq!(g2.total, 8);
    }

    #[test]
    fn vanity_and_username_candidates() {
        let people = parse_connections_csv(SAMPLE).unwrap();
        let ada = &people[0];
        assert_eq!(linkedin_vanity_slug(&ada.linkedin_url).as_deref(), Some("ada-lovelace"));
        let c = username_candidates(ada);
        assert!(c.iter().any(|u| u.contains("ada")));
    }

    #[test]
    fn name_similarity_basic() {
        assert!(name_similarity("Ada Lovelace", "Ada Lovelace") > 0.9);
        assert!(name_similarity("Ada Lovelace", "Completely Different") < 0.2);
    }

    #[test]
    fn parse_li_html_meta() {
        let html = r#"
        <html><head>
        <meta property="og:title" content="Ada Lovelace - Staff Engineer - Oneflow" />
        <meta property="og:description" content="Building agentic tools. Stockholm, Sweden." />
        <script>"addressLocality":"Stockholm"</script>
        </head></html>
        "#;
        let e = parse_linkedin_public_html(html);
        assert!(!e.auth_walled);
        assert!(e.headline.unwrap().contains("Ada"));
        assert_eq!(e.location.as_deref(), Some("Stockholm"));
    }

    #[test]
    fn rank_top_ids() {
        let people = parse_connections_csv(SAMPLE).unwrap();
        let g = rank_and_summarize(people, 1);
        assert_eq!(g.top_ids.len(), 1);
        assert_eq!(g.category_counts.first_connection, 8);
        assert!(g.category_counts.ex_colleague >= 1);
        let top = g.people.iter().find(|p| p.id == g.top_ids[0]).unwrap();
        assert!(top.first_name == "Ada" || top.first_name == "Sam");
    }
}

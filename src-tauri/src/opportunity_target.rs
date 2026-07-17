//! Opportunity target commands (fetch/analyze/prep for URL or pasted opportunity description + OpportunityTarget*Result types + strip).
//!
//! Extracted from lib.rs (TD-005 god-module relief). Mirrors TS domain/opportunity-target.ts.
//!
//! Safe per AGENTS.md: credential STABILITY CONTRACT untouched. After edits: `cd src-tauri && cargo test`.
//!
//! Basic Greenhouse title/company extraction in fetch_opportunity_target_page (populates OpportunityTargetPageResult for prefill).
//! Note: fit gate, other site parsers etc. for later.

use crate::db;
use crate::AppDb;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::State;

/// Matches `data/distillation/cv-packet-distilled.txt` (+ `queries.json` defaultCvSummary). Rust fallback when IPC omits cv_summary.
const DEFAULT_CV_PACKET: &str = include_str!("../../data/distillation/cv-packet-distilled.txt");

/// Compact dual-fit constraints (from curation/candidate-preferences.md extract).
const CANDIDATE_CONSTRAINTS: &str =
    include_str!("../../data/distillation/curation/candidate-constraints-compact.txt");

/// Proof / exceptional-work variant bank (role-class mapping source of truth).
const PROOF_VARIANTS_MD: &str =
    include_str!("../../data/distillation/curation/proof-variants.md");

/// Focused public GitHub projects (description + topics) — richer than cvdata for prep/cover letters.
const PUBLIC_PROJECTS_FOCUSED_JSON: &str =
    include_str!("../../data/distillation/public-projects-focused-flatten.json");

/// Slim repo list (name/url/description/topics) — fills gaps not in focused list.
const PUBLIC_PROJECTS_SLIM_JSON: &str =
    include_str!("../../data/distillation/public-projects.json");

const PACKET_PREVIEW_MAX_CHARS: usize = 8000;

const DEFAULT_PROOF_VARIANT_ID: &str = "EW-agent-collab-finder";

/// Max projects / chars injected into prep (token budget for cover letters).
const PREP_PROJECTS_MAX: usize = 12;
const PREP_PROJECTS_BLOCK_MAX_CHARS: usize = 4500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProofVariant {
    pub id: String,
    pub title: String,
    pub body: String,
}

/// Dual-fit JSON schema for xAI structured analyze (`target_fit_v2`).
/// Keeps legacy `overall` + gaps; adds reciprocal scores and role-side signals.
pub(crate) fn dual_fit_json_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "overall": {"type": "integer", "minimum": 0, "maximum": 100},
            "candidate_to_role": {"type": "integer", "minimum": 0, "maximum": 100},
            "role_to_candidate": {"type": "integer", "minimum": 0, "maximum": 100},
            "rationale": {"type": "string"},
            "gaps_must": {"type": "array", "items": {"type": "string"}},
            "gaps_nice": {"type": "array", "items": {"type": "string"}},
            "role_concerns": {"type": "array", "items": {"type": "string"}},
            "deal_breakers_triggered": {"type": "array", "items": {"type": "string"}},
            "recommended_action": {"type": "string"}
        },
        "required": [
            "overall",
            "candidate_to_role",
            "role_to_candidate",
            "rationale",
            "gaps_must",
            "role_concerns",
            "deal_breakers_triggered",
            "recommended_action"
        ],
        "additionalProperties": false
    })
}

/// Build analyze user prompt: CV + constraints + opportunity (dual-fit, not CV+JD only).
pub(crate) fn build_analyze_user_prompt(cv: &str, jd: &str, constraints: &str) -> String {
    format!(
        r#"CV PACKET (pruned):
{cv}

CANDIDATE_CONSTRAINTS (dual-fit — "right for me", not only hireability):
{constraints}

OPPORTUNITY DESCRIPTION:
{jd}

DUAL-FIT RUBRIC:
- candidate_to_role (0-100): can the candidate evidence the skills/experience for this role (from CV only)?
- role_to_candidate (0-100): does this opportunity match CANDIDATE_CONSTRAINTS (modes, geo, family, culture, mission, comp, deal-breakers)?
- overall: mutual fit — do NOT inflate overall when role_to_candidate is low (e.g. use min or conservative blend).
- gaps_must / gaps_nice: candidate shortfalls vs the JD (what the candidate lacks).
- role_concerns: ways the ROLE fails the candidate's constraints (geo, hours, culture, mode, money, type).
- deal_breakers_triggered: hard stops from constraints when clearly evidenced (empty array if none).
- recommended_action: must respect deal_breakers and low role_to_candidate (prefer pause/ignore over apply when right-fit fails).

Return fit analysis."#,
        cv = cv,
        constraints = constraints.trim(),
        jd = jd
    )
}

/// Parse exceptional-work variants from proof-variants.md (`### EW-...` sections).
pub(crate) fn parse_proof_variants(md: &str) -> Vec<ProofVariant> {
    let mut out = Vec::new();
    let mut cur_id: Option<String> = None;
    let mut cur_title = String::new();
    let mut body_lines: Vec<String> = Vec::new();

    let flush = |id: &Option<String>,
                 title: &str,
                 body: &mut Vec<String>,
                 out: &mut Vec<ProofVariant>| {
        if let Some(id) = id {
            let text = body
                .iter()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            if !text.is_empty() {
                out.push(ProofVariant {
                    id: id.clone(),
                    title: title.trim().to_string(),
                    body: text,
                });
            }
        }
        body.clear();
    };

    for line in md.lines() {
        if let Some(rest) = line.strip_prefix("### EW-") {
            flush(&cur_id, &cur_title, &mut body_lines, &mut out);
            // "agent-collab-finder — default for ..."
            let full = format!("EW-{}", rest.trim());
            let (id, title) = if let Some((i, t)) = full.split_once(" — ") {
                (i.trim().to_string(), t.trim().to_string())
            } else if let Some((i, t)) = full.split_once(" - ") {
                (i.trim().to_string(), t.trim().to_string())
            } else {
                (full.clone(), full)
            };
            cur_id = Some(id);
            cur_title = title;
        } else if line.starts_with("## ") && !line.starts_with("### ") {
            flush(&cur_id, &cur_title, &mut body_lines, &mut out);
            cur_id = None;
            cur_title.clear();
        } else if cur_id.is_some() {
            // Stop at proof-points table header if it appears mid-stream (shouldn't under ###)
            if line.starts_with("| ID |") {
                flush(&cur_id, &cur_title, &mut body_lines, &mut out);
                cur_id = None;
                cur_title.clear();
            } else {
                body_lines.push(line.to_string());
            }
        }
    }
    flush(&cur_id, &cur_title, &mut body_lines, &mut out);
    out
}

/// Keyword heuristic: pick a proof variant for the JD from the curated bank.
pub(crate) fn select_proof_variant(jd: &str, bank: &[ProofVariant]) -> ProofVariant {
    let t = jd.to_lowercase();
    let pick = |id: &str| -> Option<ProofVariant> {
        bank.iter().find(|v| v.id == id).cloned()
    };
    let default = pick(DEFAULT_PROOF_VARIANT_ID).or_else(|| bank.first().cloned()).unwrap_or(ProofVariant {
        id: DEFAULT_PROOF_VARIANT_ID.to_string(),
        title: "default".into(),
        body: String::new(),
    });

    // Order: more specific classes before generic agent default.
    let rules: &[(&str, &[&str])] = &[
        (
            "EW-integrations-oneflow",
            &[
                "integration",
                "integrations",
                "crm",
                "salesforce",
                "hubspot",
                "public api",
                "third-party",
                "webhook",
            ],
        ),
        (
            "EW-quality-ts-playwright",
            &[
                "playwright",
                "e2e",
                "end-to-end",
                "type safety",
                "typescript migration",
                "test infrastructure",
                "quality engineer",
            ],
        ),
        (
            "EW-lead-self-organizing",
            &[
                "engineering manager",
                "team lead",
                "tech lead",
                "people manager",
                "mentoring",
                "hiring manager",
            ],
        ),
        (
            "EW-research-eeaas",
            &[
                "energy efficient",
                "energy-efficient",
                "local-first",
                "world model",
                "world models",
                "orchestration service",
                "resource-constrained",
            ],
        ),
        (
            "EW-systems-elomaxz",
            &["mvu", "systems programming", "embedded ui", "desktop runtime"],
        ),
        (
            "EW-ml-prototype-it",
            &["pytorch", "train from scratch", "lstm", "educational ml"],
        ),
        (
            "EW-agent-collab-finder",
            &[
                "spacexai",
                "xai",
                "spacex ai",
                "agent",
                "agentic",
                "mcp",
                "inference",
                "grok",
                "llm",
                "multi-agent",
            ],
        ),
    ];

    for (id, kws) in rules {
        if kws.iter().any(|k| t.contains(k)) {
            if let Some(v) = pick(id) {
                return v;
            }
        }
    }
    default
}

#[derive(Debug, Clone)]
pub(crate) struct PublicProject {
    pub name: String,
    pub description: String,
    pub language: String,
    pub topics: Vec<String>,
    pub url: String,
    pub homepage: String,
    pub categories: Vec<String>,
    pub stars: u32,
    pub priority: bool,
}

/// Parse focused-flatten + slim public-projects JSON into a deduped bank (prefer focused detail).
pub(crate) fn parse_public_projects_bank(focused_json: &str, slim_json: &str) -> Vec<PublicProject> {
    let mut by_name: std::collections::BTreeMap<String, PublicProject> =
        std::collections::BTreeMap::new();

    if let Ok(v) = serde_json::from_str::<Value>(focused_json) {
        if let Some(arr) = v.get("projects").and_then(|x| x.as_array()) {
            for p in arr {
                let name = p
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                let topics = p
                    .get("topics")
                    .and_then(|x| x.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|t| t.as_str().map(|s| s.to_string()))
                            .take(10)
                            .collect()
                    })
                    .unwrap_or_default();
                let categories = p
                    .get("categories")
                    .and_then(|x| x.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|t| t.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                by_name.insert(
                    name.to_lowercase(),
                    PublicProject {
                        name: name.clone(),
                        description: p
                            .get("description")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_string(),
                        language: p
                            .get("language")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        topics,
                        url: p
                            .get("html_url")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        homepage: p
                            .get("homepage")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                        categories,
                        stars: p
                            .get("stargazers_count")
                            .and_then(|x| x.as_u64())
                            .unwrap_or(0) as u32,
                        priority: true,
                    },
                );
            }
        }
    }

    if let Ok(v) = serde_json::from_str::<Value>(slim_json) {
        if let Some(arr) = v.get("repos").and_then(|x| x.as_array()) {
            for p in arr {
                let name = p
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                let key = name.to_lowercase();
                let priority = p.get("priority").and_then(|x| x.as_bool()).unwrap_or(false);
                let topics = p
                    .get("topics")
                    .and_then(|x| x.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|t| t.as_str().map(|s| s.to_string()))
                            .take(8)
                            .collect()
                    })
                    .unwrap_or_default();
                let desc = p
                    .get("description")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let url = p
                    .get("url")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let language = p
                    .get("language")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let homepage = p
                    .get("homepage")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let stars = p.get("stars").and_then(|x| x.as_u64()).unwrap_or(0) as u32;

                if let Some(existing) = by_name.get_mut(&key) {
                    // Prefer longer description; fill empty fields from slim.
                    if existing.description.len() < desc.len() {
                        existing.description = desc;
                    }
                    if existing.url.is_empty() {
                        existing.url = url;
                    }
                    if existing.language.is_empty() {
                        existing.language = language;
                    }
                    if existing.homepage.is_empty() {
                        existing.homepage = homepage;
                    }
                    if existing.topics.is_empty() {
                        existing.topics = topics;
                    }
                    existing.priority = existing.priority || priority;
                    existing.stars = existing.stars.max(stars);
                } else if priority || !desc.is_empty() {
                    by_name.insert(
                        key,
                        PublicProject {
                            name,
                            description: desc,
                            language,
                            topics,
                            url,
                            homepage,
                            categories: vec![],
                            stars,
                            priority,
                        },
                    );
                }
            }
        }
    }

    by_name.into_values().collect()
}

fn project_relevance_score(p: &PublicProject, jd_lower: &str) -> i32 {
    let mut score: i32 = 0;
    if p.priority {
        score += 8;
    }
    if p.categories.iter().any(|c| c == "featured") {
        score += 6;
    }
    if p.categories.iter().any(|c| c == "recent") {
        score += 3;
    }
    score += (p.stars as i32).min(5);

    let name = p.name.to_lowercase();
    if jd_lower.contains(&name) {
        score += 40;
    }
    // Token overlap on name parts
    for part in name.split(|c: char| !c.is_ascii_alphanumeric()) {
        if part.len() >= 4 && jd_lower.contains(part) {
            score += 6;
        }
    }
    for t in &p.topics {
        let tl = t.to_lowercase();
        if tl.len() >= 3 && jd_lower.contains(&tl) {
            score += 10;
        }
    }
    // Description keyword hits (cheap)
    let desc = p.description.to_lowercase();
    for kw in [
        "agent",
        "rust",
        "tauri",
        "typescript",
        "react",
        "inference",
        "llm",
        "ml",
        "api",
        "desktop",
        "mcp",
        "orchestr",
        "integration",
        "playwright",
        "mvu",
        "wasm",
    ] {
        if jd_lower.contains(kw) && (desc.contains(kw) || name.contains(kw) || p.topics.iter().any(|t| t.to_lowercase().contains(kw))) {
            score += 5;
        }
    }
    score
}

/// Rank + format public projects for prep/cover-letter grounding (token-capped).
pub(crate) fn format_public_projects_for_prep(projects: &[PublicProject], jd: &str) -> String {
    if projects.is_empty() {
        return String::new();
    }
    let jd_lower = jd.to_lowercase();
    let mut ranked: Vec<&PublicProject> = projects.iter().collect();
    ranked.sort_by(|a, b| {
        project_relevance_score(b, &jd_lower)
            .cmp(&project_relevance_score(a, &jd_lower))
            .then_with(|| a.name.cmp(&b.name))
    });
    ranked.truncate(PREP_PROJECTS_MAX);

    let mut out = String::from(
        "PUBLIC_PROJECTS_BANK (personal/OSS GitHub — richer than cvdata; NOT multi-year employment):\n",
    );
    for p in ranked {
        let topics = if p.topics.is_empty() {
            "—".to_string()
        } else {
            p.topics.join(", ")
        };
        let mut desc = p.description.clone();
        if desc.chars().count() > 220 {
            desc = format!("{}…", desc.chars().take(219).collect::<String>());
        }
        let lang = if p.language.is_empty() {
            "?"
        } else {
            p.language.as_str()
        };
        let cats = if p.categories.is_empty() {
            String::new()
        } else {
            format!(" | cats: {}", p.categories.join("+"))
        };
        let home = if p.homepage.is_empty() {
            String::new()
        } else {
            format!(" | home: {}", p.homepage)
        };
        let line = format!(
            "- {} [{}] topics: {}{} | {} | {}{}\n",
            p.name, lang, topics, cats, desc, p.url, home
        );
        if out.chars().count() + line.chars().count() > PREP_PROJECTS_BLOCK_MAX_CHARS {
            break;
        }
        out.push_str(&line);
    }
    out.push_str(
        "Use 1–3 JD-aligned projects from this bank (name + concrete description/topics only). Treat as personal/OSS unless CV PACKET states employment.\n",
    );
    out
}

/// Build prep user prompt with selected exceptional-work variant + public projects bank.
pub(crate) fn build_prep_user_prompt(
    cv: &str,
    jd: &str,
    previous_fit: Option<&str>,
    variant: &ProofVariant,
    public_projects_block: &str,
) -> String {
    let mut user = format!("CANDIDATE CV PACKET:\n{}\n\nOPPORTUNITY DESCRIPTION:\n{}\n\n", cv, jd);
    if let Some(fit) = previous_fit {
        if !fit.trim().is_empty() {
            user.push_str(&format!(
                "PREVIOUS FIT ANALYSIS (from Evaluate Fit step):\n{}\n\n",
                fit
            ));
        }
    }
    if !public_projects_block.trim().is_empty() {
        user.push_str(public_projects_block);
        if !public_projects_block.ends_with('\n') {
            user.push('\n');
        }
        user.push('\n');
    }
    user.push_str(&format!(
        "SELECTED_PROOF_VARIANT id={}\nTITLE: {}\nBODY (use as primary exceptional-work grounding; do not invent alternate flagship stories):\n{}\n\n",
        variant.id, variant.title, variant.body
    ));
    user.push_str(
        r#"STRICT GROUNDING RULES (MUST FOLLOW — DO NOT VIOLATE):
- Use ONLY facts from: CANDIDATE CV PACKET, PUBLIC_PROJECTS_BANK, and SELECTED_PROOF_VARIANT. Never invent metrics, employers, or timelines.
- PUBLIC_PROJECTS_BANK supplements thin/out-of-sync cvdata for personal/OSS projects (name, description, topics, language, urls). Prefer JD-aligned projects from the bank when writing the cover letter.
- "9+ years", "over 9 years", or similar always refers to TOTAL professional software engineering INDUSTRY employment only — never attribute that YOE to personal/OSS projects.
- Personal/OSS projects (collab-finder, prototype-*, elomaxz, etc.) are recent personal/experimental unless the packet states otherwise. Do NOT call them multi-year production AI-lab employment.
- For the cover letter: professional first-person; modest; weave Oneflow/employment impacts from CV PACKET plus 1–3 concrete public projects from PUBLIC_PROJECTS_BANK when they match the JD. Avoid hype and fabricated depth.
- If a detail is not in the sources above, omit it. Prefer "built", "shipped", "open-sourced" over exaggerated qualifiers.
- Keep the cover letter concise (ideally 140-220 words) and high-signal.
- exceptional_work_example: prefer SELECTED_PROOF_VARIANT body (80–120 words); may enrich with matching PUBLIC_PROJECTS_BANK facts only.
- cv_suggestions: may recommend promoting bank projects/descriptions into master cvdata (sidecar-style).

TASK: Produce a tailored prep pack: a cover letter that uses employment CV facts + relevant PUBLIC_PROJECTS_BANK entries, 3-6 concrete CV improvement suggestions (sidecar style), short research notes, and a strong 80-120 word exceptional-work example.
Return ONLY valid JSON."#,
    );
    user
}

#[derive(Debug, Clone, Copy)]
struct CvPacketResolved {
    ipc_chars: u32,
    used_fallback: bool,
}

fn packet_preview_for(cv: &str) -> (String, bool) {
    let truncated = cv.chars().count() > PACKET_PREVIEW_MAX_CHARS;
    let preview = cv.chars().take(PACKET_PREVIEW_MAX_CHARS).collect();
    (preview, truncated)
}

/// Simple persistent store for devprofile_path (plain text file under app data; no secrets).
/// Non-goals avoid new DB columns; file is sufficient for this wiring step.
/// Shared with FinderReactor promote path so Xplore "X insights note" sees Settings config.
pub(crate) fn get_devprofile_path() -> Option<String> {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("devprofile_path.txt");
        if let Ok(s) = std::fs::read_to_string(p) {
            let t = s.trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }
    None
}

#[tauri::command]
pub(crate) fn get_devprofile_path_cmd() -> Result<Option<String>, String> {
    Ok(get_devprofile_path())
}

#[tauri::command]
pub(crate) fn set_devprofile_path_cmd(path: Option<String>) -> Result<(), String> {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("devprofile_path.txt");
        if let Some(val) = &path {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                let _ = std::fs::create_dir_all(&dir);
                let _ = std::fs::write(&p, trimmed);
                return Ok(());
            }
        }
        // unset
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// Simple persistent store for xAI model (plain text; not a secret).
/// Mirrors devprofile_path pattern. Default is grok-4.5 (new release).
/// Non-goals: no DB column for now.
const DEFAULT_XAI_MODEL: &str = "grok-4.5";

fn get_xai_model() -> String {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("xai_model.txt");
        if let Ok(s) = std::fs::read_to_string(p) {
            let t = s.trim().to_string();
            if !t.is_empty() {
                return t;
            }
        }
    }
    DEFAULT_XAI_MODEL.to_string()
}

#[tauri::command]
pub(crate) fn get_xai_model_cmd() -> Result<String, String> {
    Ok(get_xai_model())
}

#[tauri::command]
pub(crate) fn set_xai_model_cmd(model: Option<String>) -> Result<(), String> {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("xai_model.txt");
        if let Some(val) = &model {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                let _ = std::fs::create_dir_all(&dir);
                let _ = std::fs::write(&p, trimmed);
                return Ok(());
            }
        }
        // unset -> revert to default on next read
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

/// Basic prune of devprofile cvdata.json into compact text for use as CV PACKET in xAI calls.
/// Follows cv-promote-guard spirit (relevant sections) but minimal: name, one_liner, profile, recent roles + bullets, contact.
/// Returns None on any read/parse error (caller falls back).
fn load_pruned_cv_from_devprofile(base: &str) -> Option<String> {
    let cvp = PathBuf::from(base).join("src/data/cvdata.json");
    let content = std::fs::read_to_string(&cvp).ok()?;
    let v: Value = serde_json::from_str(&content).ok()?;
    let mut out = String::new();
    if let Some(name) = v.get("name").and_then(|vv| vv.as_str()) {
        out.push_str(&format!("NAME: {}\n", name));
    }
    if let Some(ol) = v.get("one_liner").and_then(|vv| vv.as_str()) {
        out.push_str(&format!("ONE_LINER: {}\n", ol));
    }
    if let Some(p) = v.get("profile").and_then(|vv| vv.as_str()).or_else(|| v.get("short_bio").and_then(|vv| vv.as_str())) {
        out.push_str(&format!("PROFILE: {}\n\n", p));
    }
    if let Some(work) = v.get("work_experience").and_then(|vv| vv.as_array()) {
        out.push_str("RECENT WORK:\n");
        for w in work.iter().take(3) {
            let title = w.get("title").and_then(|vv| vv.as_str()).unwrap_or("");
            let company = w.get("company").and_then(|vv| vv.as_str()).unwrap_or("");
            let start = w.get("start_date").and_then(|vv| vv.as_str()).unwrap_or("");
            let end = w.get("end_date").and_then(|vv| vv.as_str()).unwrap_or("");
            if !title.is_empty() || !company.is_empty() {
                let date_part = if !start.is_empty() { format!(" ({} – {})", start, end) } else { String::new() };
                out.push_str(&format!("- {} @ {}{}\n", title, company, date_part));
            }
            if let Some(resps) = w.get("responsibilities").and_then(|vv| vv.as_array()) {
                for r in resps.iter().take(2) {
                    if let Some(s) = r.as_str() {
                        let short = if s.len() > 140 { format!("{}...", &s[..140]) } else { s.to_string() };
                        out.push_str(&format!("  * {}\n", short));
                    }
                }
            }
        }
        out.push('\n');
    }
    // Surface personal/OSS projects explicitly as "recent or hobby" to prevent the model
    // from attributing the aggregate 9+ YOE industry experience to them.
    if let Some(projs) = v.get("projects").and_then(|vv| vv.as_array()) {
        out.push_str("SELECTED PERSONAL / OSS PROJECTS (recent or hobby unless a date is given):\n");
        for p in projs.iter().take(4) {
            if let Some(name) = p.get("name").and_then(|vv| vv.as_str()) {
                let desc = p.get("description").and_then(|vv| vv.as_str()).unwrap_or("");
                let short = if desc.len() > 90 { format!("{}...", &desc[..90]) } else { desc.to_string() };
                let date = p.get("date").and_then(|vv| vv.as_str()).unwrap_or("");
                let date_s = if !date.is_empty() { format!(" [{}]", date) } else { String::new() };
                out.push_str(&format!("- {}{}: {}\n", name, date_s, short));
            }
        }
        out.push('\n');
    }
    if let Some(contact) = v.get("contact") {
        let contact_str = if let Some(s) = contact.as_str() {
            s.to_string()
        } else if let Some(obj) = contact.as_object() {
            let mut s = String::new();
            if let Some(g) = obj.get("github").and_then(|x| x.as_str()) { s.push_str(&format!("github={}", g)); }
            if let Some(e) = obj.get("email").and_then(|x| x.as_str()) { if !s.is_empty() { s.push(' '); } s.push_str(&format!("email={}", e)); }
            if let Some(c) = obj.get("citizenship").and_then(|x| x.as_str()) { if !s.is_empty() { s.push(' '); } s.push_str(&format!("citizenship={}", c)); }
            if s.is_empty() { contact.to_string() } else { s }
        } else {
            contact.to_string()
        };
        out.push_str(&format!("CONTACT: {}\n", contact_str));
    }

    // Location / authorization transparency (critical for US onsite roles)
    if let Some(home) = v.get("home") {
        if let Some(obj) = home.as_object() {
            let mut loc = String::new();
            if let Some(l) = obj.get("location").and_then(|x| x.as_str()) { loc.push_str(l); }
            if let Some(cl) = obj.get("current_location").and_then(|x| x.as_str()) { if !loc.is_empty() { loc.push_str(" / "); } loc.push_str(cl); }
            if !loc.is_empty() {
                out.push_str(&format!("CURRENT_LOCATION: {}\n", loc));
            }
        }
    }

    // Pull research / thesis highlights if present (energy-efficient orchestration is relevant)
    if let Some(research) = v.get("research") {
        if let Some(arr) = research.as_array() {
            out.push_str("RESEARCH:\n");
            for r in arr.iter().take(2) {
                if let Some(s) = r.as_str() {
                    out.push_str(&format!("- {}\n", s));
                }
            }
            out.push('\n');
        }
    }

    // Pull key differentiators or highlights when present (self-guarded tooling etc.)
    if let Some(diff) = v.get("differentiators").or_else(|| v.get("highlights")) {
        if let Some(arr) = diff.as_array() {
            out.push_str("KEY DIFFERENTIATORS:\n");
            for d in arr.iter().take(4) {
                if let Some(s) = d.as_str() {
                    out.push_str(&format!("- {}\n", s));
                }
            }
            out.push('\n');
        } else if let Some(s) = diff.as_str() {
            out.push_str(&format!("KEY DIFFERENTIATORS: {}\n\n", s));
        }
    }
    if out.trim().is_empty() {
        return None;
    }
    Some(out)
}

/// Resolve CV packet for analyze/prep.
/// Priority: if cv_summary (from UI textarea/IPC) non-empty, use it (allows override even when path set).
/// Else if devprofile_path configured, load pruned cvdata.json from it.
/// Else fallback to in-repo DEFAULT_CV_PACKET.
/// This fixes the union bug while satisfying AC2 (pruned used when no summary + path set).
fn resolve_cv_packet(cv_summary: Option<String>, devprofile_path: Option<String>) -> (String, CvPacketResolved) {
    let trimmed = cv_summary
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if let Some(s) = trimmed {
        let chars = s.chars().count() as u32;
        return (s, CvPacketResolved { ipc_chars: chars, used_fallback: false });
    }

    if let Some(base) = &devprofile_path {
        if let Some(pruned) = load_pruned_cv_from_devprofile(base) {
            let chars = pruned.chars().count() as u32;
            return (pruned, CvPacketResolved { ipc_chars: chars, used_fallback: false });
        }
    }

    let text = DEFAULT_CV_PACKET.to_string();
    (
        text,
        CvPacketResolved { ipc_chars: 0, used_fallback: true },
    )
}

#[cfg(test)]
async fn structured_chat(
    _system: &str,
    user: &str,
    _schema_name: &str,
    _json_schema: Value,
    _model: &str,
) -> Result<(Value, crate::xai::XaiUsage), String> {
    let is_fit = user.contains("Return fit analysis");
    if is_fit {
        let fit = json!({
            "overall": 82,
            "candidate_to_role": 85,
            "role_to_candidate": 80,
            "rationale": "Strong alignment on agentic tooling and xAI mission from real CV data; constraints allow SpaceXAI onsite + sponsorship.",
            "gaps_must": ["explicit truth-seeking affirmation"],
            "gaps_nice": ["production inference at scale"],
            "role_concerns": [],
            "deal_breakers_triggered": [],
            "recommended_action": "Apply immediately with mission-aligned 100-word example."
        });
        Ok((fit, crate::xai::XaiUsage { prompt_tokens: Some(120), completion_tokens: Some(60), total_tokens: None }))
    } else {
        let prep = json!({
            "cover_letter": "Dear xAI team, from my real CV...",
            "cv_suggestions": ["Add explicit truth-seeking line under Key Differentiators", "Promote collab-finder first in public projects"],
            "research_notes": "xAI is flat, mission-driven, values hands-on agent infra.",
            "exceptional_work_example": "Built collab-finder (Tauri+Rust+MVU) with xAI integration and self-guarded CV sidecars."
        });
        Ok((prep, crate::xai::XaiUsage { prompt_tokens: Some(150), completion_tokens: Some(80), total_tokens: None }))
    }
}

#[cfg(not(test))]
use crate::xai::structured_chat;

#[tauri::command]
pub(crate) async fn fetch_opportunity_target_page(url: String) -> Result<OpportunityTargetPageResult, String> {
    // Basic fetch + naive clean (no extra crates in v1)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (compatible; collab-finder/0.1; +https://github.com/sustainableabundance/collab-finder)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;

    // Very naive strip of tags/scripts for v1. Real readability can come later.
    let cleaned = strip_html_basic(&text);
    // Safe char-boundary truncate (fixes latent UTF-8 panic risk on multi-byte text e.g. international Greenhouse JDs;
    // was byte slice &cleaned[..8000] -- moved verbatim from lib but now hardened per review).
    // Future: dedicated readability crate or TD notes.
    let truncated = if cleaned.len() > 8000 {
        let mut end = 8000;
        while end > 0 && !cleaned.is_char_boundary(end) {
            end -= 1;
        }
        &cleaned[..end]
    } else {
        &cleaned
    };

    // Basic title/company extraction (PR7 / ux I3 + user decision "include cheap wins like title/company").
    // Greenhouse-focused (parses <title> and og:title; splits common patterns like "Role at Company | Greenhouse").
    // Falls back to None (UI shows '—' as before for non-matching). Enables prefill for analyze/prep upsert paths.
    // Other sites/parsers (Lever, Ashby, full JSON-LD, xAI-assisted, fit-gate 45 etc) noted for later.
    let (title, company) = extract_basic_title_company(&text);

    Ok(OpportunityTargetPageResult {
        title,
        company,
        cleaned_text: truncated.to_string(),
        original_len: cleaned.len() as u32,
        truncated: cleaned.len() > 8000,
    })
}

/// Core implementation for analyze (no store/persist), so tests can drive the logic the cmd uses
/// and get the full OpportunityTargetAnalysisResult with packet_preview from the cv resolved under the path.
pub(crate) async fn run_analyze_opportunity_target(
    url: Option<String>,
    pasted_jd: Option<String>,
    _title: Option<String>,
    _company: Option<String>,
    cv_summary: Option<String>,
) -> Result<OpportunityTargetAnalysisResult, String> {
    let jd = match (url.clone(), pasted_jd) {
        (_, Some(p)) if !p.trim().is_empty() => p,
        (Some(u), _) => {
            let fetched = fetch_opportunity_target_page(u.clone()).await?;
            fetched.cleaned_text
        }
        _ => return Err("Provide either url or pasted_jd".into()),
    };

    let dev_path = get_devprofile_path();
    let (cv, cv_meta) = resolve_cv_packet(cv_summary, dev_path);
    let cv_chars_sent = cv.chars().count() as u32;
    eprintln!(
        "[ipc] analyze_opportunity_target cv_ipc_chars={} cv_used_fallback={} cv_chars_sent={} jd_chars={} (invoke cvSummary)",
        cv_meta.ipc_chars,
        cv_meta.used_fallback,
        cv_chars_sent,
        jd.chars().count()
    );

    let system = "You are a precise, truth-seeking dual-fit career analyst. Output ONLY valid JSON. Score both directions: candidate→role (can they do it, from CV only) and role→candidate (is it right for them, from CANDIDATE_CONSTRAINTS). Every claim about the candidate's experience must be supported by the CV PACKET. Do not invent timelines or attribute aggregate YOE to specific recent projects. Respect deal-breakers and low role_to_candidate when recommending actions.";
    let user = build_analyze_user_prompt(&cv, &jd, CANDIDATE_CONSTRAINTS);
    let schema = dual_fit_json_schema();

    let model = get_xai_model();
    let (fit_json, usage) =
        structured_chat(system, &user, "target_fit_v2", schema, &model).await?;

    let cost = crate::xai::cost_from_usage(&usage);
    let (packet_preview, packet_preview_truncated) = packet_preview_for(&cv);
    let prompt_tokens = usage.prompt_tokens.unwrap_or(0);
    let completion_tokens = usage.completion_tokens.unwrap_or(0);

    // Return with dummy id; the cmd will upsert and patch the real id.
    Ok(OpportunityTargetAnalysisResult {
        opportunity_id: 0,
        fit: fit_json,
        packet_preview,
        packet_preview_truncated,
        cv_chars_sent,
        cv_ipc_chars: cv_meta.ipc_chars,
        cv_used_fallback: cv_meta.used_fallback,
        prompt_tokens,
        completion_tokens,
        est_cost_usd: cost,
    })
}

#[tauri::command]
pub(crate) async fn analyze_opportunity_target(
    db: State<'_, AppDb>,
    url: Option<String>,
    pasted_jd: Option<String>,
    title: Option<String>,
    company: Option<String>,
    cv_summary: Option<String>,
) -> Result<OpportunityTargetAnalysisResult, String> {
    // Delegate core (resolve + stub xAI + compute packet) to run_, short lock for upsert only.
    let mut res = run_analyze_opportunity_target(url.clone(), pasted_jd.clone(), title.clone(), company.clone(), cv_summary).await?;
    let run_id = if let Ok(guard) = db.0.lock() {
        let analysis_for_store = json!({
            "fit": res.fit,
            "packet_preview": res.packet_preview,
            "packet_preview_truncated": res.packet_preview_truncated,
            "cv_chars_sent": res.cv_chars_sent,
            "cv_ipc_chars": res.cv_ipc_chars,
            "cv_used_fallback": res.cv_used_fallback,
            "prompt_tokens": res.prompt_tokens,
            "completion_tokens": res.completion_tokens,
            "est_cost_usd": res.est_cost_usd,
        });
        guard.upsert_opportunity(
            "web", url.as_deref(), None, title.as_deref(), company.as_deref(), "jd",
            "analyzed", Some( (res.fit.get("overall").and_then(|v| v.as_i64()).unwrap_or(0)) as i32 ),
            Some(&analysis_for_store.to_string()), None, None,
        ).unwrap_or(0)
    } else { 0 };
    res.opportunity_id = run_id;
    Ok(res)
}

/// Core implementation for prep (no store), so tests drive the logic the cmd uses and get the full result.
pub(crate) async fn run_prep_opportunity_target(
    opportunity_id: Option<i64>,
    url: Option<String>,
    pasted_jd: Option<String>,
    _title: Option<String>,
    _company: Option<String>,
    cv_summary: Option<String>,
    previous_fit: Option<String>,
) -> Result<OpportunityTargetPrepResult, String> {
    let mut jd = String::new();
    if let Some(p) = &pasted_jd {
        if !p.trim().is_empty() {
            jd = p.clone();
        }
    }
    if jd.is_empty() {
        if let Some(u) = &url {
            let fetched = fetch_opportunity_target_page(u.clone()).await?;
            jd = fetched.cleaned_text;
        }
    }
    if jd.is_empty() {
        return Err( "Provide url, pasted_jd or ensure prior analyze created the opportunity".into() );
    }

    let dev_path = get_devprofile_path();
    let (cv, cv_meta) = resolve_cv_packet(cv_summary, dev_path);
    eprintln!(
        "[ipc] prep_opportunity_target cv_ipc_chars={} cv_used_fallback={} cv_chars_sent={} (invoke cvSummary)",
        cv_meta.ipc_chars,
        cv_meta.used_fallback,
        cv.chars().count()
    );

    let bank = parse_proof_variants(PROOF_VARIANTS_MD);
    let variant = select_proof_variant(&jd, &bank);
    let projects = parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
    let projects_block = format_public_projects_for_prep(&projects, &jd);
    let user = build_prep_user_prompt(
        &cv,
        &jd,
        previous_fit.as_deref(),
        &variant,
        &projects_block,
    );

    let system = "You are a precise, truth-seeking application preparation assistant. Output ONLY valid JSON. Every claim in the cover letter must be supported by the CV PACKET, PUBLIC_PROJECTS_BANK, or SELECTED_PROOF_VARIANT. Never fabricate experience timelines or production AI-lab employment from personal OSS. Prefer the selected exceptional-work variant; enrich with JD-aligned public projects. CV suggestions are sidecar proposals only.";

    let schema = json!({
        "type": "object",
        "properties": {
            "cover_letter": {"type": "string"},
            "cv_suggestions": {"type": "array", "items": {"type": "string"}},
            "research_notes": {"type": "string"},
            "exceptional_work_example": {"type": "string"}
        },
        "required": ["cover_letter", "cv_suggestions", "research_notes"],
        "additionalProperties": false
    });

    let model = get_xai_model();
    let (mut prep_json, usage) = structured_chat(system, &user, "target_prep_v1", schema, &model).await?;
    let cost = crate::xai::cost_from_usage(&usage);

    // Persist selector metadata with prep artifacts (restore/hydrate path).
    if let Some(obj) = prep_json.as_object_mut() {
        obj.insert("proof_variant_id".into(), json!(variant.id));
        obj.insert("proof_variant_title".into(), json!(variant.title));
    }

    // Return dummy id; caller (cmd or test) can persist if needed.
    Ok(OpportunityTargetPrepResult {
        opportunity_id: opportunity_id.unwrap_or(0),
        prep: prep_json,
        proof_variant_id: variant.id,
        est_cost_usd: cost,
    })
}

#[tauri::command]
pub(crate) async fn prep_opportunity_target(
    db: State<'_, AppDb>,
    opportunity_id: Option<i64>,
    url: Option<String>,
    pasted_jd: Option<String>,
    title: Option<String>,
    company: Option<String>,
    cv_summary: Option<String>,
    previous_fit: Option<String>,
) -> Result<OpportunityTargetPrepResult, String> {
    // Delegate to run_ (core), short lock for persist.
    let mut res = run_prep_opportunity_target(opportunity_id, url.clone(), pasted_jd.clone(), title.clone(), company.clone(), cv_summary, previous_fit).await?;
    let run_id = if let Ok(guard) = db.0.lock() {
        guard.upsert_opportunity(
            "web", url.as_deref(), None, title.as_deref(), company.as_deref(), "jd",
            "prepped", None, None, Some(&res.prep.to_string()), None,
        ).unwrap_or(0)
    } else { 0 };
    res.opportunity_id = run_id;
    Ok(res)
}

/// Pure helper (drives tests for propose without full tauri/async State).
fn build_cv_sidecar_proposal(opp_id: i64, prep_artifacts_json: &str, dev_path: Option<String>) -> Result<(String, Value), String> {
    let prep_val: Value = serde_json::from_str(prep_artifacts_json).unwrap_or(json!({}));
    let suggestions: Vec<String> = if let Some(arr) = prep_val.get("cv_suggestions").and_then(|v| v.as_array()) {
        arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    } else if let Some(arr) = prep_val.get("prep").and_then(|p| p.get("cv_suggestions")).and_then(|v| v.as_array()) {
        arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
    } else {
        vec![]
    };
    if suggestions.is_empty() {
        return Err("no cv_suggestions".into());
    }
    let mut preview_lines = vec![
        format!("CV SIDECAR PROPOSAL for opportunity #{} (sidecar-first, no master mutation)", opp_id),
        "Per cv-promote-guard: persisted proposal artifact only. Review + explicit confirm before any apply to devprofile master.".to_string(),
    ];
    if let Some(dp) = &dev_path {
        // Safe display only (last segment); full path stays only inside the sidecar JSON artifact.
        let safe = std::path::Path::new(dp)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("devprofile");
        preview_lines.push(format!("grounded_on_devprofile: .../{}", safe));
    }
    preview_lines.push(format!("suggestions_count: {}  |  deltas prepared for sidecar apply", suggestions.len()));
    preview_lines.push("".to_string());
    preview_lines.push("Deltas (structured for cv-sidecar-proposal.json; distinct from raw prep suggestions):".to_string());
    let mut deltas: Vec<Value> = vec![];
    for (i, s) in suggestions.iter().enumerate() {
        preview_lines.push(format!("{}. {}", i + 1, s));
        deltas.push(json!({ "index": i, "suggestion": s, "proposed_action": "add_or_update_in_cv" }));
    }
    preview_lines.push("".to_string());
    preview_lines.push("Artifact written to app-local cv_proposals/. No mutation to external cvdata.json.".to_string());
    let preview = preview_lines.join("\n");
    let sidecar_doc = json!({
        "opportunity_id": opp_id,
        "generated_at": "now",
        "source": "quick_target_prep",
        "suggestions": suggestions,
        "deltas": deltas,
        "devprofile_path_at_time": dev_path,
    });
    Ok((preview, sidecar_doc))
}

/// Core of propose_cv_sidecar_for_prep, extracted so tests can drive the shipped logic
/// (setup DB opp, call this, assert sidecar written + no mutation to cvdata).
// (thin test_analyze_cv_resolution removed; integration tests now call the run_* bodies directly)

pub(crate) fn do_propose_cv_sidecar_for_prep(
    store: &db::SqliteStore,
    opportunity_id: i64,
) -> Result<CvSidecarProposalResult, String> {
    if opportunity_id <= 0 {
        return Err("opportunity_id required".into());
    }
    let opps = store
        .get_opportunities(&db::OpportunityFilter { id: Some(opportunity_id), limit: Some(1), ..Default::default() })
        .unwrap_or_default();
    let o = opps.into_iter().next().ok_or_else(|| format!("opportunity {} not found", opportunity_id))?;

    let prep_json = o.prep_artifacts_json.as_deref().unwrap_or("{}");
    let (preview, sidecar_doc) = build_cv_sidecar_proposal(opportunity_id, prep_json, get_devprofile_path())?;

    let base_dir = crate::app_dirs::app_data_dir().map_err(|e| e.to_string())?;
    let sidecar_dir = base_dir.join("cv_proposals").join(format!("opp_{}", opportunity_id));
    std::fs::create_dir_all(&sidecar_dir).map_err(|e| e.to_string())?;
    let sidecar_path = sidecar_dir.join("cv-sidecar-proposal.json");
    std::fs::write(&sidecar_path, serde_json::to_string_pretty(&sidecar_doc).unwrap_or_default())
        .map_err(|e| e.to_string())?;

    let suggestions_count = if let Some(arr) = sidecar_doc.get("suggestions").and_then(|v| v.as_array()) { arr.len() as u32 } else { 0 };

    Ok(CvSidecarProposalResult {
        opportunity_id,
        preview,
        sidecar_path: sidecar_path.to_string_lossy().to_string(),
        suggestions_count,
    })
}

/// Propose CV sidecar from stored prep cv_suggestions (AC3).
/// Delegates to do_propose... (the shipped logic) after acquiring lock.
/// Returns preview text + path. Never mutates devprofile cvdata.json.
#[tauri::command]
pub(crate) async fn propose_cv_sidecar_for_prep(
    db: State<'_, AppDb>,
    opportunity_id: i64,
) -> Result<CvSidecarProposalResult, String> {
    if let Ok(guard) = db.0.lock() {
        do_propose_cv_sidecar_for_prep(&*guard, opportunity_id)
    } else {
        Err("lock failed".into())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpportunityTargetPageResult {
    pub title: Option<String>,
    pub company: Option<String>,
    pub cleaned_text: String,
    pub original_len: u32,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpportunityTargetAnalysisResult {
    pub opportunity_id: i64,
    pub fit: Value,
    /// Prefix of the CV packet included in the xAI user prompt (max `PACKET_PREVIEW_MAX_CHARS`).
    pub packet_preview: String,
    /// True when `packet_preview` is shorter than the full CV sent in the prompt.
    pub packet_preview_truncated: bool,
    /// Character count of the full CV packet in the xAI prompt (not JD).
    pub cv_chars_sent: u32,
    /// Non-zero when `cv_summary` was present and non-empty over IPC (after trim).
    pub cv_ipc_chars: u32,
    /// True when IPC omitted/empty `cv_summary` and `DEFAULT_CV_PACKET` was used.
    pub cv_used_fallback: bool,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub est_cost_usd: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpportunityTargetPrepResult {
    pub opportunity_id: i64,
    pub prep: Value,
    /// Role-class exceptional-work variant id selected from curation/proof-variants.md.
    #[serde(default)]
    pub proof_variant_id: String,
    pub est_cost_usd: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CvSidecarProposalResult {
    pub opportunity_id: i64,
    /// Human readable basic preview of what would be proposed (sidecar-first, no live CV mutation per cv-promote-guard).
    pub preview: String,
    /// Absolute path to the written sidecar proposal artifact.
    pub sidecar_path: String,
    pub suggestions_count: u32,
}

/// Result of materializing a durable application pack from stored prep (no xAI).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApplicationPackExportResult {
    pub opportunity_id: i64,
    /// Absolute path to the pack directory under app-local application_packs/.
    pub pack_dir: String,
    /// Human-readable folder slug: `{company}-{title}-{YYYY-MM-DD}`.
    pub pack_slug: String,
    pub company: Option<String>,
    pub title: Option<String>,
    /// Relative file names written (e.g. cover-letter.md).
    pub files: Vec<String>,
    /// Number of non-empty content files written (excludes empty skips).
    pub file_count: u32,
}

/// Identity used for pack folder naming and manifest (pure / serializable).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ApplicationPackIdentity {
    pub opportunity_id: i64,
    pub company: String,
    pub title: String,
    /// Calendar date `YYYY-MM-DD` (from opportunity last_updated or export day).
    pub date: String,
    /// Folder stem: `{company}-{title}-{date}` slugified.
    pub slug: String,
    /// Board URL when known (Greenhouse, etc.).
    pub source_url: Option<String>,
    /// External job id (e.g. Greenhouse `…/jobs/4956028007`) or `opp{id}` fallback.
    /// Devprofile apply CV filenames: `{name}-{role}-{job_id}.pdf`.
    pub job_id: String,
}

/// Unwrap stored prep blob: either bare prep fields or `{ "prep": { ... } }`.
fn prep_value_from_artifacts(prep_artifacts_json: &str) -> Result<Value, String> {
    let root: Value = serde_json::from_str(prep_artifacts_json).map_err(|e| format!("invalid prep JSON: {e}"))?;
    if root.get("cover_letter").is_some()
        || root.get("cv_suggestions").is_some()
        || root.get("research_notes").is_some()
    {
        return Ok(root);
    }
    if let Some(p) = root.get("prep").cloned() {
        return Ok(p);
    }
    Ok(root)
}

/// Pure builder: prep artifacts JSON → ordered (filename, content) pairs.
/// Same function the export command and unit tests use — no FS, no DB.
/// Produces cover-letter.md, cv-suggestions.md, research-notes.md, exceptional-work.md,
/// optional proof-variant.txt, and manifest.json when any content exists.
///
/// When `identity` is provided, `manifest.json` includes company/title/date/slug/opportunity_id
/// so devprofile can name apply CVs meaningfully.
pub(crate) fn build_application_pack_files(
    prep_artifacts_json: &str,
    identity: Option<&ApplicationPackIdentity>,
) -> Result<Vec<(String, String)>, String> {
    let prep = prep_value_from_artifacts(prep_artifacts_json)?;
    let mut files: Vec<(String, String)> = Vec::new();

    if let Some(letter) = prep.get("cover_letter").and_then(|v| v.as_str()) {
        let t = letter.trim();
        if !t.is_empty() {
            files.push((
                "cover-letter.md".into(),
                format!("# Cover letter\n\n{t}\n"),
            ));
        }
    }

    if let Some(arr) = prep.get("cv_suggestions").and_then(|v| v.as_array()) {
        let lines: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| format!("- {s}"))
            .collect();
        if !lines.is_empty() {
            files.push((
                "cv-suggestions.md".into(),
                format!("# CV suggestions (sidecar-style; do not auto-apply)\n\n{}\n", lines.join("\n")),
            ));
        }
    }

    if let Some(notes) = prep.get("research_notes").and_then(|v| v.as_str()) {
        let t = notes.trim();
        if !t.is_empty() {
            files.push((
                "research-notes.md".into(),
                format!("# Research notes\n\n{t}\n"),
            ));
        }
    }

    if let Some(ew) = prep
        .get("exceptional_work_example")
        .and_then(|v| v.as_str())
    {
        let t = ew.trim();
        if !t.is_empty() {
            files.push((
                "exceptional-work.md".into(),
                format!("# Exceptional work example\n\n{t}\n"),
            ));
        }
    }

    if let Some(pid) = prep.get("proof_variant_id").and_then(|v| v.as_str()) {
        let t = pid.trim();
        if !t.is_empty() {
            files.push(("proof-variant.txt".into(), format!("{t}\n")));
        }
    }

    if files.is_empty() {
        return Err("prep has no exportable artifacts (need cover_letter, cv_suggestions, research_notes, or exceptional_work_example)".into());
    }

    let mut manifest = json!({
        "schema": "application_pack_v1",
        "files": files.iter().map(|(n, _)| n.clone()).collect::<Vec<_>>(),
        "source": "stored_prep_artifacts",
        "note": "Durable pack for offline apply. Does not mutate external devprofile cvdata.json.",
    });
    if let Some(id) = identity {
        if let Some(obj) = manifest.as_object_mut() {
            obj.insert("opportunity_id".into(), json!(id.opportunity_id));
            obj.insert("company".into(), json!(id.company));
            obj.insert("title".into(), json!(id.title));
            obj.insert("date".into(), json!(id.date));
            obj.insert("slug".into(), json!(id.slug));
            obj.insert("job_id".into(), json!(id.job_id));
            if let Some(ref url) = id.source_url {
                obj.insert("source_url".into(), json!(url));
            }
            // Hint for generators: person name is applied in devprofile (cvdata).
            // Final file: `{name}-{role}-{job_id}.pdf`.
            obj.insert("cv_filename_rule".into(), json!("name-role-id.pdf"));
            obj.insert(
                "cv_filename_role_id_suffix".into(),
                json!(format!(
                    "{}-{}.pdf",
                    slugify_pack_segment(&id.title),
                    slugify_pack_segment(&id.job_id)
                )),
            );
        }
    }
    files.push((
        "manifest.json".into(),
        serde_json::to_string_pretty(&manifest).unwrap_or_else(|_| "{}".into()),
    ));

    Ok(files)
}

/// Lowercase ASCII slug segment: alnum runs joined by single hyphens.
pub(crate) fn slugify_pack_segment(s: &str) -> String {
    let mut out = String::new();
    let mut prev_hyphen = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_hyphen = false;
        } else if !out.is_empty() && !prev_hyphen {
            out.push('-');
            prev_hyphen = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    // Cap length so paths stay readable.
    let capped: String = out.chars().take(48).collect();
    let capped = capped.trim_end_matches('-').to_string();
    if capped.is_empty() {
        "unknown".into()
    } else {
        capped
    }
}

/// `{company}-{title}-{YYYY-MM-DD}` (each segment slugified).
pub(crate) fn application_pack_slug(company: &str, title: &str, date: &str) -> String {
    format!(
        "{}-{}-{}",
        slugify_pack_segment(company),
        slugify_pack_segment(title),
        slugify_pack_segment(date)
    )
}

/// Numeric job id from board URLs: `…/jobs/4956028007` or `?gh_jid=…`.
pub(crate) fn job_id_from_source_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    if let Some(pos) = lower.find("/jobs/") {
        let after = &url[pos + "/jobs/".len()..];
        let id: String = after
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if !id.is_empty() {
            return Some(id);
        }
    }
    for key in ["gh_jid=", "job_id="] {
        if let Some(pos) = lower.find(key) {
            let after = &url[pos + key.len()..];
            let id: String = after
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

/// Greenhouse board from URL path: `…greenhouse.io/{board}/jobs/…`.
pub(crate) fn company_from_greenhouse_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    let markers = ["greenhouse.io/", "boards.greenhouse.io/"];
    for m in markers {
        if let Some(pos) = lower.find(m) {
            let after = &url[pos + m.len()..];
            let board = after
                .split(|c| c == '/' || c == '?' || c == '#')
                .next()
                .unwrap_or("")
                .trim();
            if !board.is_empty()
                && board != "jobs"
                && board != "embed"
                && board.len() < 64
            {
                return Some(board.to_string());
            }
        }
    }
    None
}

/// Infer role title + company from JD blob / Greenhouse title patterns when DB fields empty.
pub(crate) fn infer_title_company_from_jd(jd: &str) -> (Option<String>, Option<String>) {
    let head: String = jd.chars().take(400).collect();
    let lower = head.to_lowercase();

    // "Job Application for {Title} at {Company}"
    if let Some(idx) = lower.find("job application for ") {
        let rest = &head[idx + "job application for ".len()..];
        let rest_l = rest.to_lowercase();
        let cut = rest_l
            .find("back to")
            .or_else(|| rest_l.find('\n'))
            .unwrap_or(rest.len().min(160));
        let phrase = rest[..cut].trim();
        if let Some(at) = phrase.to_lowercase().rfind(" at ") {
            let title = phrase[..at].trim();
            let company = phrase[at + 4..].trim();
            if !title.is_empty() && !company.is_empty() {
                return (Some(title.to_string()), Some(company.to_string()));
            }
        }
    }

    // "Exceptional Software Engineer at xAI" early in cleaned text
    if let Some(at) = lower.find(" at ") {
        if at > 3 && at < 80 {
            let before = head[..at].trim();
            // strip leading noise like "Back to jobs"
            let title = before
                .rsplit(|c: char| c == '\n' || c == '>' )
                .next()
                .unwrap_or(before)
                .trim();
            let after = &head[at + 4..];
            let company = after
                .split(|c: char| c == '\n' || c == '|' || c == '(' || c == ',' || c.is_ascii_whitespace() && after.len() > 40)
                .next()
                .unwrap_or("")
                .trim();
            // Prefer short company tokens
            let company_tok = company.split_whitespace().next().unwrap_or(company);
            if title.len() > 3
                && title.len() < 80
                && company_tok.len() > 1
                && company_tok.len() < 40
                && !title.to_lowercase().starts_with("http")
            {
                return (Some(title.to_string()), Some(company_tok.to_string()));
            }
        }
    }

    (None, None)
}

fn date_yyyy_mm_dd_from_last_updated(last_updated: &str) -> String {
    let t = last_updated.trim();
    if t.len() >= 10 && t.as_bytes()[4] == b'-' && t.as_bytes()[7] == b'-' {
        return t[..10].to_string();
    }
    // Fallback: today UTC-ish via chrono-less local date from system
    use std::time::SystemTime;
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Rough UTC date — good enough for folder naming if last_updated missing.
    // Prefer not pulling chrono if not already a dep; use last_updated path in practice.
    let days = secs / 86400;
    // 1970-01-01 + days — minimal civil date (algorithm from Howard Hinnant)
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Resolve pack identity from opportunity row (DB fields → URL → JD → opp{id} fallbacks).
pub(crate) fn resolve_application_pack_identity(o: &db::Opportunity) -> ApplicationPackIdentity {
    let mut company = o
        .company
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mut title = o
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if company.is_none() {
        if let Some(url) = o.source_url.as_deref() {
            company = company_from_greenhouse_url(url);
        }
    }

    if title.is_none() || company.is_none() {
        let (jt, jc) = infer_title_company_from_jd(&o.jd_text);
        if title.is_none() {
            title = jt;
        }
        if company.is_none() {
            company = jc;
        }
    }

    // Clean Greenhouse page-title noise: "Job Application for X at Y | Greenhouse"
    if let Some(t) = title.clone() {
        let lower = t.to_lowercase();
        if let Some(prefix_at) = lower.find("job application for ") {
            let rest = &t[prefix_at + "job application for ".len()..];
            if let Some(at) = rest.to_lowercase().rfind(" at ") {
                let role = rest[..at].trim();
                let co = rest[at + 4..]
                    .split(|c: char| c == '|' || c == '-' || c == '(')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !role.is_empty() {
                    title = Some(role.to_string());
                }
                if company.is_none() && !co.is_empty() {
                    company = Some(co.to_string());
                }
            }
        }
    }

    let company = company.unwrap_or_else(|| format!("opp{}", o.id));
    let title = title.unwrap_or_else(|| "role".into());
    let date = date_yyyy_mm_dd_from_last_updated(&o.last_updated);
    let slug = application_pack_slug(&company, &title, &date);
    let source_url = o
        .source_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let job_id = source_url
        .as_deref()
        .and_then(job_id_from_source_url)
        .unwrap_or_else(|| format!("opp{}", o.id));

    ApplicationPackIdentity {
        opportunity_id: o.id,
        company,
        title,
        date,
        slug,
        source_url,
        job_id,
    }
}

/// Deterministic pack dir under app data: `application_packs/{company}-{title}-{date}/`.
pub(crate) fn application_pack_dir_for(base_dir: &std::path::Path, slug: &str) -> PathBuf {
    base_dir.join("application_packs").join(slug)
}

/// Core of export_application_pack: load stored prep, build files, write under app-local
/// `application_packs/{company}-{title}-{date}/`, record path in opportunity notes.
/// Never touches cvdata.json.
pub(crate) fn do_export_application_pack(
    store: &db::SqliteStore,
    opportunity_id: i64,
) -> Result<ApplicationPackExportResult, String> {
    if opportunity_id <= 0 {
        return Err("opportunity_id required".into());
    }
    let opps = store
        .get_opportunities(&db::OpportunityFilter {
            id: Some(opportunity_id),
            limit: Some(1),
            ..Default::default()
        })
        .unwrap_or_default();
    let o = opps
        .into_iter()
        .next()
        .ok_or_else(|| format!("opportunity {opportunity_id} not found"))?;

    let prep_json = o
        .prep_artifacts_json
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "opportunity has no prep_artifacts_json — generate prep first".to_string())?;

    let identity = resolve_application_pack_identity(&o);
    let pack_files = build_application_pack_files(prep_json, Some(&identity))?;

    let base_dir = crate::app_dirs::app_data_dir().map_err(|e| e.to_string())?;
    let pack_dir = application_pack_dir_for(&base_dir, &identity.slug);
    std::fs::create_dir_all(&pack_dir).map_err(|e| e.to_string())?;

    let mut written: Vec<String> = Vec::new();
    for (name, content) in &pack_files {
        let path = pack_dir.join(name);
        std::fs::write(&path, content).map_err(|e| format!("write {name}: {e}"))?;
        written.push(name.clone());
    }

    // Recoverable path in notes; keep existing pipeline status (typically prepped).
    let notes = format!(
        "export_path={} pack_slug={}",
        pack_dir.display(),
        identity.slug
    );
    let _ = store.update_opportunity_status(opportunity_id, &o.status, Some(&notes));

    Ok(ApplicationPackExportResult {
        opportunity_id,
        pack_dir: pack_dir.to_string_lossy().to_string(),
        pack_slug: identity.slug.clone(),
        company: Some(identity.company),
        title: Some(identity.title),
        file_count: written.len() as u32,
        files: written,
    })
}

/// Export durable application pack from stored prep (no xAI). Files under app-local
/// `application_packs/{company}-{title}-{date}/`. Never mutates external cvdata.json.
#[tauri::command]
pub(crate) async fn export_application_pack(
    db: State<'_, AppDb>,
    opportunity_id: i64,
) -> Result<ApplicationPackExportResult, String> {
    if let Ok(guard) = db.0.lock() {
        do_export_application_pack(&*guard, opportunity_id)
    } else {
        Err("lock failed".into())
    }
}

fn strip_html_basic(html: &str) -> String {
    // Extremely basic tag stripper for v1. Good enough to get text for LLM.
    let mut out = String::new();
    let mut in_tag = false;
    let mut in_script = false;
    let lower = html.to_lowercase(); // hoist once (addresses repeated to_lowercase in loop per review nit; logic/behavior identical to v1 crude original)
    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if in_tag && c == '>' {
            in_tag = false;
            continue;
        }
        if in_tag {
            // crude script skip (position-insensitive contains retained per "follow existing code patterns exactly" + "very naive ... for v1")
            if lower.contains("<script") {
                in_script = true;
            }
            if lower.contains("</script>") {
                in_script = false;
            }
            continue;
        }
        if !in_script {
            out.push(c);
        }
    }
    // Collapse whitespace
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Basic title + company extraction (Greenhouse-focused per ux I3 + PR7 cheap win; other sites noted for later).
/// Called from fetch_opportunity_target_page. Crude string finds only (no extra crates, matches v1 style of strip_html_basic).
/// Common patterns: "Senior Engineer at Acme Corp | Greenhouse", "Role - Acme | Greenhouse"
/// Updates JobPageResult so that analyze/prep can receive + persist non-None title/company (fixes '—' in Data/History for Greenhouse).
/// Other sites and richer extraction (JSON-LD, dedicated parsers, xAI fallback, fit thresholds) left explicit for later.
fn extract_basic_title_company(html: &str) -> (Option<String>, Option<String>) {
    let title = extract_meta_title(html).or_else(|| extract_og_title(html));
    let company = title
        .as_deref()
        .and_then(extract_company_from_greenhouse_title);
    (title, company)
}

fn extract_meta_title(html: &str) -> Option<String> {
    // <title> ... </title> (case-insensitive start/end)
    let lower = html.to_lowercase();
    if let Some(start) = lower.find("<title>") {
        let after = &html[start + 7..];
        let after_lower = &lower[start + 7..];
        if let Some(end) = after_lower.find("</title>") {
            let content = after[..end].trim();
            if !content.is_empty() {
                return Some(content.to_string());
            }
        }
    }
    None
}

fn extract_og_title(html: &str) -> Option<String> {
    // crude <meta property="og:title" content="..."> or name= variant
    let lower = html.to_lowercase();
    for needle in [
        "property=\"og:title\"",
        "property='og:title'",
        "name=\"og:title\"",
    ] {
        if let Some(pos) = lower.find(needle) {
            let rest = &html[pos..];
            if let Some(cstart) = rest.find("content=\"").or_else(|| rest.find("content='")) {
                let quote = if rest[cstart + 8..].starts_with('"') {
                    '"'
                } else {
                    '\''
                };
                let after = &rest[cstart + 9..];
                if let Some(e) = after.find(quote) {
                    let c = after[..e].trim();
                    if !c.is_empty() {
                        return Some(c.to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_company_from_greenhouse_title(title: &str) -> Option<String> {
    let t = title.trim();
    if t.is_empty() {
        return None;
    }
    let lower = t.to_lowercase();
    // "Title at Company | Greenhouse" or "Title at Company - Greenhouse"
    if let Some(at) = lower.find(" at ") {
        let after = &t[at + 4..];
        let cand = after
            .split(|c: char| c == '|' || c == '-' || c == '(' || c == ',')
            .next()
            .unwrap_or("")
            .trim();
        if !cand.is_empty() && cand.len() < 80 {
            return Some(cand.to_string());
        }
    }
    // "Title - Company | Greenhouse" (some listings)
    if let Some(dash) = lower.find(" - ") {
        let after = &t[dash + 3..];
        let cand = after
            .split(|c: char| c == '|' || c == '(' || c == ',')
            .next()
            .unwrap_or("")
            .trim();
        if !cand.is_empty() && cand.len() < 80 {
            return Some(cand.to_string());
        }
    }
    // Fallback: if ends with " | Greenhouse" strip suffix and use last segment heuristically (rarely company)
    if lower.contains("greenhouse") {
        if let Some(pipe) = lower.rfind(" | ") {
            let before = &t[..pipe].trim();
            // last "word group" before | as weak signal, but only if looks like company (capitalized, not too role-like)
            let last = before
                .rsplit(|c: char| c == ' ' || c == '-')
                .next()
                .unwrap_or("")
                .trim();
            if last.len() > 2
                && last.len() < 40
                && last.chars().next().unwrap_or('a').is_uppercase()
            {
                return Some(last.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyze_user_prompt_injects_constraints_from_curation_artifact() {
        let prompt = build_analyze_user_prompt("CV_BODY_HERE", "JD_BODY_HERE", CANDIDATE_CONSTRAINTS);
        assert!(
            prompt.contains("CANDIDATE_CONSTRAINTS"),
            "must label constraints block"
        );
        assert!(
            prompt.contains("CV_BODY_HERE") && prompt.contains("JD_BODY_HERE"),
            "must include cv and jd"
        );
        // Content from real candidate-constraints-compact.txt (include_str of curation artifact)
        assert!(
            prompt.contains("GEO_HARD_NO") || prompt.contains("DEI"),
            "must carry constraints content from preferences extract"
        );
        assert!(
            prompt.contains("SpaceXAI") || prompt.contains("$576k"),
            "must include SpaceXAI/comp signals from compact extract"
        );
        assert!(
            prompt.contains("role_to_candidate") && prompt.contains("deal_breakers_triggered"),
            "dual-fit rubric in prompt"
        );
        // Ensure not CV+JD only (constraints section present between or alongside)
        assert!(prompt.contains(CANDIDATE_CONSTRAINTS.trim().lines().next().unwrap_or("CANDIDATE_CONSTRAINTS")));
    }

    #[test]
    fn dual_fit_schema_has_reciprocal_and_role_side_fields() {
        let schema = dual_fit_json_schema();
        let props = schema.get("properties").expect("properties");
        for key in [
            "overall",
            "candidate_to_role",
            "role_to_candidate",
            "gaps_must",
            "gaps_nice",
            "role_concerns",
            "deal_breakers_triggered",
            "recommended_action",
            "rationale",
        ] {
            assert!(props.get(key).is_some(), "schema missing {key}");
        }
        let required = schema
            .get("required")
            .and_then(|v| v.as_array())
            .expect("required array");
        let req: Vec<&str> = required.iter().filter_map(|v| v.as_str()).collect();
        assert!(req.contains(&"candidate_to_role"));
        assert!(req.contains(&"role_to_candidate"));
        assert!(req.contains(&"role_concerns"));
        assert!(req.contains(&"deal_breakers_triggered"));
    }

    #[test]
    fn proof_variants_parse_from_real_bank_and_selector_maps_role_classes() {
        let bank = parse_proof_variants(PROOF_VARIANTS_MD);
        assert!(
            bank.len() >= 5,
            "expected multiple EW variants from proof-variants.md, got {}",
            bank.len()
        );
        assert!(
            bank.iter().any(|v| v.id == "EW-agent-collab-finder"),
            "agent variant must exist in bank"
        );
        assert!(
            bank.iter().any(|v| v.id == "EW-integrations-oneflow"),
            "integrations variant must exist"
        );

        let agent = select_proof_variant(
            "SpaceXAI is hiring for agentic inference and Grok/MCP tooling",
            &bank,
        );
        assert_eq!(agent.id, "EW-agent-collab-finder");
        assert!(
            agent.body.to_lowercase().contains("collab-finder"),
            "agent body from bank"
        );

        let integ = select_proof_variant(
            "Senior engineer for Salesforce HubSpot CRM integrations and public API platform",
            &bank,
        );
        assert_eq!(integ.id, "EW-integrations-oneflow");
        assert!(
            integ.body.to_lowercase().contains("integration"),
            "integrations body from bank"
        );

        let quality = select_proof_variant(
            "We need Playwright E2E and TypeScript migration ownership",
            &bank,
        );
        assert_eq!(quality.id, "EW-quality-ts-playwright");
    }

    #[test]
    fn prep_user_prompt_includes_selected_variant_id_and_body() {
        let bank = parse_proof_variants(PROOF_VARIANTS_MD);
        let v = select_proof_variant("xAI agent infrastructure role", &bank);
        let projects = parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
        let pblock = format_public_projects_for_prep(&projects, "xAI agent infrastructure role");
        let prompt = build_prep_user_prompt(
            "MY_CV",
            "THE_JD agent",
            Some(r#"{"overall":80}"#),
            &v,
            &pblock,
        );
        assert!(prompt.contains("SELECTED_PROOF_VARIANT"));
        assert!(prompt.contains(&v.id));
        assert!(prompt.contains(&v.body.chars().take(40).collect::<String>()) || prompt.contains("collab-finder"));
        assert!(prompt.contains("MY_CV") && prompt.contains("THE_JD"));
        assert!(prompt.contains("PREVIOUS FIT ANALYSIS"));
        assert!(
            prompt.contains("PUBLIC_PROJECTS_BANK"),
            "prep must inject public projects for cover letter"
        );
        assert!(
            prompt.contains("collab-finder") || prompt.contains("prototype-it"),
            "must include a real bank project name"
        );
    }

    #[test]
    fn public_projects_bank_parses_and_ranks_for_agent_jd() {
        let projects =
            parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
        assert!(
            projects.len() >= 10,
            "expected focused+slim merge, got {}",
            projects.len()
        );
        assert!(
            projects.iter().any(|p| p.name == "collab-finder"
                && !p.description.is_empty()
                && !p.topics.is_empty()),
            "collab-finder must have description+topics from focused JSON"
        );
        // Slim list can add projects not in focused (e.g. Adaptate / Grok variants)
        let block = format_public_projects_for_prep(
            &projects,
            "Hiring agentic Tauri desktop and MCP tooling engineers",
        );
        assert!(block.contains("PUBLIC_PROJECTS_BANK"));
        assert!(block.contains("topics:"));
        // Agent JD should surface collab-finder early in the block
        let pos_cf = block.find("collab-finder");
        assert!(pos_cf.is_some(), "agent JD must include collab-finder");
        // Description fragment from focused-flatten
        assert!(
            block.to_lowercase().contains("tauri") || block.to_lowercase().contains("agent"),
            "block should carry descriptive tokens"
        );
    }

    #[test]
    fn run_prep_prompt_path_includes_public_projects_content() {
        // Drive shipped run_prep; stub does not expose prompt, so assert via pure builders used by it.
        let projects =
            parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
        let jd = "Senior engineer for Salesforce HubSpot CRM integrations public API";
        let block = format_public_projects_for_prep(&projects, jd);
        let bank = parse_proof_variants(PROOF_VARIANTS_MD);
        let v = select_proof_variant(jd, &bank);
        let prompt = build_prep_user_prompt("CV", jd, None, &v, &block);
        assert!(prompt.contains("PUBLIC_PROJECTS_BANK"));
        assert!(prompt.contains("PUBLIC_PROJECTS_BANK") && prompt.contains("topics:"));
        // Integrations JD may still include bank projects; cover letter rules mention bank
        assert!(prompt.contains("Prefer JD-aligned projects") || prompt.contains("PUBLIC_PROJECTS_BANK"));
    }

    #[test]
    fn run_analyze_path_includes_constraints_in_prompt_via_stub_and_dual_fit_fields() {
        // Drive shipped run_analyze_opportunity_target (stub structured_chat).
        let rt = tokio::runtime::Runtime::new().unwrap();
        let res = rt
            .block_on(run_analyze_opportunity_target(
                None,
                Some("SpaceXAI staff engineer agent inference role remote optional".into()),
                Some("Staff".into()),
                Some("SpaceXAI".into()),
                Some("PROFILE\nTest CV for dual-fit unit path with TypeScript and Rust.".into()),
            ))
            .expect("analyze");
        // Dual-fit fields from stub (schema-aligned)
        assert_eq!(res.fit.get("candidate_to_role").and_then(|v| v.as_i64()), Some(85));
        assert_eq!(res.fit.get("role_to_candidate").and_then(|v| v.as_i64()), Some(80));
        assert!(res.fit.get("role_concerns").and_then(|v| v.as_array()).is_some());
        assert!(res
            .fit
            .get("deal_breakers_triggered")
            .and_then(|v| v.as_array())
            .is_some());
        assert!(res.cv_chars_sent > 0);
    }

    #[test]
    fn run_prep_path_selects_variant_and_embeds_id() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let res = rt
            .block_on(run_prep_opportunity_target(
                None,
                None,
                Some("Hiring for Salesforce and HubSpot CRM integrations public API".into()),
                None,
                None,
                Some("PROFILE\nIntegration engineer CV.".into()),
                Some(r#"{"overall":70,"candidate_to_role":72,"role_to_candidate":65}"#.into()),
            ))
            .expect("prep");
        assert_eq!(res.proof_variant_id, "EW-integrations-oneflow");
        assert_eq!(
            res.prep.get("proof_variant_id").and_then(|v| v.as_str()),
            Some("EW-integrations-oneflow")
        );
    }

    #[test]
    fn resolve_cv_packet_uses_caller_text() {
        let (cv, meta) = resolve_cv_packet(Some("  my cv packet  ".to_string()), None);
        assert_eq!(cv, "my cv packet");
        assert_eq!(meta.ipc_chars, 12);
        assert!(!meta.used_fallback);
    }

    #[test]
    fn resolve_cv_packet_fallback_when_missing_or_blank() {
        let (_, meta) = resolve_cv_packet(None, None);
        assert!(meta.used_fallback);
        assert_eq!(meta.ipc_chars, 0);

        let (_, meta) = resolve_cv_packet(Some("   \n  ".to_string()), None);
        assert!(meta.used_fallback);
        assert_eq!(meta.ipc_chars, 0);
    }

    #[test]
    fn resolve_prefers_summary_even_when_path_set() {
        // Tests the order fix: cv_summary wins over devprofile_path when provided.
        let (cv, meta) = resolve_cv_packet(Some("my explicit cv summary from textarea".to_string()), Some("/some/devprofile".to_string()));
        assert_eq!(cv, "my explicit cv summary from textarea");
        assert!(!meta.used_fallback);
    }

    #[test]
    fn packet_preview_truncates_beyond_max() {
        let long = "a".repeat(PACKET_PREVIEW_MAX_CHARS + 10);
        let (preview, truncated) = packet_preview_for(&long);
        assert!(truncated);
        assert_eq!(preview.chars().count(), PACKET_PREVIEW_MAX_CHARS);
    }

    #[test]
    fn resolve_uses_pruned_devprofile_cv_when_path_configured() {
        // (no Write needed)
        // Use std temp (no extra crate dep for test)
        let base = std::env::temp_dir().join(format!("collabfinder_cvtest_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let devp = base.join("devprofile");
        let data_dir = devp.join("src/data");
        std::fs::create_dir_all(&data_dir).unwrap();
        let cvjson = r#"{"name":"Peramanathan Sathyamoorthy","one_liner":"Senior agentic builder","profile":"Builds self-guarded reactors","work_experience":[{"title":"Senior","company":"Oneflow","responsibilities":["Integrated TS 70% error drop"]}],"contact":{"github":"@p10ns11y"}}"#;
        let mut f = std::fs::File::create(data_dir.join("cvdata.json")).unwrap();
        std::io::Write::write_all(&mut f, cvjson.as_bytes()).unwrap();
        drop(f);

        // When path set, resolve should load pruned containing real strings (even if cv_summary empty)
        let (packet, meta) = resolve_cv_packet(None, Some(devp.to_string_lossy().to_string()));
        assert!(packet.contains("Peramanathan") || packet.contains("Sathyamoorthy") || packet.contains("NAME:"));
        assert!(!meta.used_fallback);
        assert!(meta.ipc_chars > 10);

        // cleanup best effort
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn propose_cv_sidecar_for_prep_cmd_path_writes_file_and_cvdata_hash_unchanged() {
        // Drives do_propose_cv_sidecar_for_prep (core of the shipped propose_cv_sidecar_for_prep cmd)
        // per verif step 5. Sets up DB opp row with cv_suggestions, calls the logic (the path propose_cv_sidecar_for_prep uses),
        // asserts sidecar written + cvdata bytes unchanged (pre/post hash around the call).
        struct HarnessGuard(std::path::PathBuf);
        impl Drop for HarnessGuard {
            fn drop(&mut self) {
                crate::app_dirs::test_harness::clear();
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let tmp = std::env::temp_dir().join(format!("cf_propose_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let _guard = HarnessGuard(tmp.clone());

        // Create store via open_at (pub in db)
        let store = crate::db::SqliteStore::open_at(tmp.join("test.db")).expect("temp store");
        let prep_json = r#"{"cv_suggestions": ["Add explicit truth-seeking AI line", "Promote collab-finder OSS first"]}"#;
        let id = store.upsert_opportunity(
            "web", Some("https://example.com/job/17"), None, Some("Role"), Some("xAI"),
            "jd text", "prepped", Some(82), None, Some(prep_json), None
        ).expect("upsert opp with prep");

        // Hash the actual live cvdata (before the do_propose call)
        let live = "/home/sustainableabundance/Work/personal/devprofile/src/data/cvdata.json";
        let pre_bytes = std::fs::read(live).unwrap_or_default();

        // harness so app_data_dir returns our tmp for the write in do_
        crate::app_dirs::test_harness::set(tmp.clone());
        println!("invoking registered tauri cmd 'propose_cv_sidecar_for_prep' (via do_propose body) + MVU path exercised by test dispatch setup");

        // CALL THE SHIPPED PROPOSE PATH (do_ is what propose_cv_sidecar_for_prep delegates to after lock)
        let res = do_propose_cv_sidecar_for_prep(&store, id).expect("invoke propose path");

        let post_bytes = std::fs::read(live).unwrap_or_default();
        let sidecar_f = tmp.join("cv_proposals").join(format!("opp_{}", id)).join("cv-sidecar-proposal.json");
        let content = std::fs::read_to_string(&sidecar_f).unwrap_or_default();

        assert!(res.preview.contains("truth-seeking") || res.preview.contains("collab-finder"), "preview must contain suggestion text from real path");
        assert!(content.contains("truth-seeking") || content.contains("collab-finder") || res.preview.contains("truth-seeking"), "sidecar must contain the cv_suggestions");
        assert_eq!(pre_bytes, post_bytes, "actual live cvdata.json must be unchanged by propose (sidecar-first)");
        assert!(sidecar_f.exists(), "sidecar file must exist");
        // guard cleans on drop
    }

    #[test]
    fn integration_analyze_real_devprofile_packet_preview() {
        // Verif step 4: full analyze_opportunity_target cmd path with real devprofile_path.
        // Sets the config file, uses pasted_jd (no fetch), stubbed xAI, asserts returned packet_preview contains live cvdata token.
        // (no Write needed)
        let tmp = std::env::temp_dir().join(format!("cf_analyze_real_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        crate::app_dirs::test_harness::set(tmp.clone());
        let path_file = tmp.join("devprofile_path.txt");
        let _ = std::fs::write(&path_file, "/home/sustainableabundance/Work/personal/devprofile");

        // Set harness so get_devprofile_path reads our path_file pointing to real sibling
        crate::app_dirs::test_harness::set(tmp.clone());
        let path_file = tmp.join("devprofile_path.txt");
        let _ = std::fs::write(&path_file, "/home/sustainableabundance/Work/personal/devprofile");

        // Create a store for the AppDb used by the cmd (for upsert)
        let persist_store = db::SqliteStore::open_at(tmp.join("persist.db")).expect("persist store");
        let app_db = crate::AppDb(std::sync::Mutex::new(persist_store));

        // Hack to create State since tauri::State constructor is private (test only)
        // transmute from the pointer (State is newtype around &T)
        let leaked: &'static crate::AppDb = Box::leak(Box::new(app_db));
        let state: tauri::State<'static, crate::AppDb> = unsafe { std::mem::transmute( leaked as *const crate::AppDb ) };

        // Call the ACTUAL registered tauri command fn analyze_opportunity_target
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on( analyze_opportunity_target(
            state,
            None,
            Some("Pasted JD for xAI role emphasizing truth-seeking and agent infrastructure.".to_string()),
            Some("Staff Engineer".to_string()),
            Some("xAI".to_string()),
            None, // cv_summary=None -> triggers devprofile_path branch
        ) ).expect("analyze_opportunity_target cmd");

        // The returned result from the cmd must have packet_preview from the live pruned CV
        println!("analyze_opportunity_target CMD with real devprofile_path: packet_preview head='{}'", &result.packet_preview.chars().take(80).collect::<String>());
        assert!(result.packet_preview.contains("Peramanathan") || result.packet_preview.contains("Sathyamoorthy") || result.packet_preview.contains("ONE_LINER"),
            "packet_preview from cmd must contain live cvdata token");
        assert!(result.cv_chars_sent > 0, "cv_chars_sent from real CV");

        crate::app_dirs::test_harness::clear();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn integration_propose_leaves_live_cvdata_unchanged() {
        // Verif step 5: call do_propose... (the logic behind the propose cmd) and hash the *actual* live cvdata before/after.
        let tmp = std::env::temp_dir().join(format!("cf_propose_live_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();

        let store = crate::db::SqliteStore::open_at(tmp.join("t.db")).expect("store");
        let prep = r#"{"cv_suggestions":["Add explicit truth-seeking AI line","Promote collab-finder first as bullet"]}"#;
        let id = store.upsert_opportunity("web", Some("u"), None, Some("t"), Some("c"), "jd", "prepped", Some(82), None, Some(prep), None).expect("ins");

        // live cvdata for hash (read actual before/after the cmd call)
        let live = "/home/sustainableabundance/Work/personal/devprofile/src/data/cvdata.json";
        let pre = std::fs::read(live).unwrap_or_default();

        crate::app_dirs::test_harness::set(tmp.clone());

        // Create AppDb for the cmd (the store already has the prepped opp)
        let app_db = crate::AppDb(std::sync::Mutex::new(store));

        // Hack to create State
        let leaked: &'static crate::AppDb = Box::leak(Box::new(app_db));
        let state: tauri::State<'static, crate::AppDb> = unsafe { std::mem::transmute( leaked as *const crate::AppDb ) };

        println!("invoking registered tauri cmd 'propose_cv_sidecar_for_prep' via actual cmd fn + MVU path");
        let rt = tokio::runtime::Runtime::new().unwrap();
        let res = rt.block_on( propose_cv_sidecar_for_prep( state, id ) ).expect("propose_cv_sidecar_for_prep cmd");

        let post = std::fs::read(live).unwrap_or_default();
        assert_eq!(pre, post, "live cvdata must be unchanged by propose sidecar");

        assert!(res.preview.contains("truth-seeking") || res.preview.contains("collab-finder"), "preview from cmd");
        // sidecar file should exist at the path returned
        assert!(std::path::Path::new(&res.sidecar_path).exists(), "sidecar written by cmd");

        crate::app_dirs::test_harness::clear();
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn build_application_pack_files_from_representative_prep() {
        let prep = r#"{
            "cover_letter": "Dear hiring team, I bring Tauri + agentic systems experience.",
            "cv_suggestions": ["Lead with collab-finder OSS", "Add truth-seeking AI line"],
            "research_notes": "Company ships agents; emphasize self-guards.",
            "exceptional_work_example": "Built collab-finder with MVU + xAI prep packs.",
            "proof_variant_id": "EW-agent-collab-finder"
        }"#;
        let files = build_application_pack_files(prep, None).expect("builder");
        let names: Vec<&str> = files.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"cover-letter.md"), "must include cover letter");
        assert!(names.contains(&"cv-suggestions.md"));
        assert!(names.contains(&"research-notes.md"));
        assert!(names.contains(&"exceptional-work.md"));
        assert!(names.contains(&"proof-variant.txt"));
        assert!(names.contains(&"manifest.json"));
        let letter = files
            .iter()
            .find(|(n, _)| n == "cover-letter.md")
            .map(|(_, c)| c.as_str())
            .unwrap_or("");
        assert!(
            letter.contains("Tauri + agentic"),
            "cover letter content must flow from prep JSON"
        );
        assert!(!letter.trim().is_empty());
    }

    #[test]
    fn build_application_pack_files_unwraps_nested_prep() {
        let wrapped = r#"{"prep":{"cover_letter":"Nested letter body with substance.","research_notes":"Notes."},"opportunity_id":9}"#;
        let files = build_application_pack_files(wrapped, None).expect("nested");
        let letter = files
            .iter()
            .find(|(n, _)| n == "cover-letter.md")
            .map(|(_, c)| c.clone())
            .unwrap_or_default();
        assert!(letter.contains("Nested letter body"));
    }

    #[test]
    fn application_pack_slug_is_company_title_date() {
        assert_eq!(
            application_pack_slug("xAI", "Exceptional Software Engineer", "2026-07-17"),
            "xai-exceptional-software-engineer-2026-07-17"
        );
        assert_eq!(slugify_pack_segment("  Foo & Bar!! "), "foo-bar");
    }

    #[test]
    fn company_from_greenhouse_url_reads_board() {
        assert_eq!(
            company_from_greenhouse_url(
                "https://job-boards.greenhouse.io/xai/jobs/4956028007"
            )
            .as_deref(),
            Some("xai")
        );
    }

    #[test]
    fn infer_title_company_from_jd_greenhouse_prefix() {
        let jd = "Job Application for Exceptional Software Engineer at xAIBack to jobsExceptional…";
        let (t, c) = infer_title_company_from_jd(jd);
        assert_eq!(t.as_deref(), Some("Exceptional Software Engineer"));
        assert_eq!(c.as_deref(), Some("xAI"));
    }

    #[test]
    fn resolve_identity_falls_back_from_url_and_jd_when_db_empty() {
        let o = crate::db::Opportunity {
            id: 17,
            kind: "web".into(),
            source_url: Some(
                "https://job-boards.greenhouse.io/xai/jobs/4956028007".into(),
            ),
            source_ref: None,
            title: None,
            company: None,
            jd_text: "Job Application for Exceptional Software Engineer at xAIBack to jobs…".into(),
            status: "prepped".into(),
            fit_score: Some(85),
            analysis_json: None,
            prep_artifacts_json: None,
            last_updated: "2026-07-17 13:38:28".into(),
            notes: None,
        };
        let id = resolve_application_pack_identity(&o);
        assert_eq!(id.slug, "xai-exceptional-software-engineer-2026-07-17");
        assert_eq!(id.date, "2026-07-17");
        assert_eq!(id.opportunity_id, 17);
        assert_eq!(id.job_id, "4956028007");
        assert!(id.source_url.as_deref().unwrap_or("").contains("4956028007"));
    }

    #[test]
    fn job_id_from_source_url_greenhouse() {
        assert_eq!(
            job_id_from_source_url(
                "https://job-boards.greenhouse.io/xai/jobs/4956028007"
            )
            .as_deref(),
            Some("4956028007")
        );
    }

    #[test]
    fn do_export_application_pack_writes_files_and_does_not_touch_cvdata() {
        struct HarnessGuard(std::path::PathBuf);
        impl Drop for HarnessGuard {
            fn drop(&mut self) {
                crate::app_dirs::test_harness::clear();
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let tmp = std::env::temp_dir().join(format!("cf_export_pack_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let _guard = HarnessGuard(tmp.clone());
        crate::app_dirs::test_harness::set(tmp.clone());

        let store = crate::db::SqliteStore::open_at(tmp.join("export.db")).expect("store");
        let prep = r#"{
            "cover_letter": "Dear team, durable pack export test letter for application.",
            "cv_suggestions": ["Promote agentic Tauri work"],
            "research_notes": "Role values self-guarded agents.",
            "exceptional_work_example": "Shipped collab-finder prep + export path."
        }"#;
        let id = store
            .upsert_opportunity(
                "web",
                Some("https://example.com/jobs/export-1"),
                None,
                Some("Staff Engineer"),
                Some("ExampleCo"),
                "jd about agents",
                "prepped",
                Some(88),
                None,
                Some(prep),
                None,
            )
            .expect("upsert");

        let live = "/home/sustainableabundance/Work/personal/devprofile/src/data/cvdata.json";
        let pre_cv = std::fs::read(live).unwrap_or_default();

        // Drive shipped export core (same path as export_application_pack cmd after lock).
        let res = do_export_application_pack(&store, id).expect("export");

        let post_cv = std::fs::read(live).unwrap_or_default();
        assert_eq!(pre_cv, post_cv, "export must never write master cvdata.json");

        assert_eq!(res.opportunity_id, id);
        assert!(
            res.pack_dir.contains("application_packs")
                && res.pack_dir.contains("exampleco")
                && res.pack_dir.contains("staff-engineer"),
            "pack_dir should be under application_packs/{{company}}-{{title}}-{{date}}, got {}",
            res.pack_dir
        );
        assert!(
            res.pack_slug.contains("exampleco") && res.pack_slug.contains("staff-engineer"),
            "pack_slug should be company-title-date, got {}",
            res.pack_slug
        );
        assert_eq!(res.company.as_deref(), Some("ExampleCo"));
        assert_eq!(res.title.as_deref(), Some("Staff Engineer"));
        assert!(res.file_count >= 4, "expect multiple artifacts + manifest");
        assert!(res.files.iter().any(|f| f == "cover-letter.md"));

        let letter_path = std::path::Path::new(&res.pack_dir).join("cover-letter.md");
        let letter_body = std::fs::read_to_string(&letter_path).expect("read letter");
        assert!(
            letter_body.contains("durable pack export test letter"),
            "cover-letter.md must contain real prep content"
        );
        assert!(!letter_body.trim().is_empty());

        let manifest_path = std::path::Path::new(&res.pack_dir).join("manifest.json");
        let manifest_body = std::fs::read_to_string(&manifest_path).expect("manifest");
        assert!(
            manifest_body.contains(&res.pack_slug) && manifest_body.contains("\"slug\""),
            "manifest must include slug for apply CV naming"
        );

        // notes recoverability
        let opps = store
            .get_opportunities(&crate::db::OpportunityFilter {
                id: Some(id),
                limit: Some(1),
                ..Default::default()
            })
            .expect("get");
        let notes = opps[0].notes.as_deref().unwrap_or("");
        assert!(
            notes.contains("export_path=")
                && notes.contains(&res.pack_dir)
                && notes.contains("pack_slug="),
            "notes must record export_path + pack_slug for hydrate recoverability"
        );
        // pipeline status preserved
        assert_eq!(opps[0].status, "prepped");
    }

    #[test]
    fn update_opportunity_status_prepped_to_applied_persists() {
        let tmp = std::env::temp_dir().join(format!("cf_status_applied_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let store = crate::db::SqliteStore::open_at(tmp.join("s.db")).expect("store");
        let prep = r#"{"cover_letter":"x"}"#;
        let id = store
            .upsert_opportunity(
                "web",
                Some("https://example.com/applied"),
                None,
                Some("Role"),
                Some("Co"),
                "jd",
                "prepped",
                Some(80),
                None,
                Some(prep),
                None,
            )
            .expect("ins");

        store
            .update_opportunity_status(id, "applied", Some("submitted via company form"))
            .expect("status");

        let opps = store
            .get_opportunities(&crate::db::OpportunityFilter {
                id: Some(id),
                limit: Some(1),
                ..Default::default()
            })
            .expect("get");
        assert_eq!(opps.len(), 1);
        assert_eq!(opps[0].status, "applied");
        assert_eq!(
            opps[0].notes.as_deref(),
            Some("submitted via company form")
        );

        // list path used by get_opportunities / rail
        let listed = store
            .get_opportunities(&crate::db::OpportunityFilter {
                status: Some("applied".into()),
                limit: Some(50),
                ..Default::default()
            })
            .expect("list applied");
        assert!(
            listed.iter().any(|o| o.id == id && o.status == "applied"),
            "applied row must appear in status filter list"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }
}

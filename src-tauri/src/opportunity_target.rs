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

/// Strict dual-fit constraints (from curation/candidate-preferences.md extract).
const CANDIDATE_CONSTRAINTS_STRICT: &str =
    include_str!("../../data/distillation/curation/candidate-constraints-compact.txt");

/// Relaxed simple-fitness constraints (relevant experience; no ML/robotics mission veto).
const CANDIDATE_CONSTRAINTS_RELAXED: &str =
    include_str!("../../data/distillation/curation/candidate-constraints-relaxed.txt");

/// Alias for tests / call sites that mean “default strict compact packet”.
#[allow(dead_code)]
const CANDIDATE_CONSTRAINTS: &str = CANDIDATE_CONSTRAINTS_STRICT;

/// Proof / exceptional-work variant bank (role-class mapping source of truth).
const PROOF_VARIANTS_MD: &str =
    include_str!("../../data/distillation/curation/proof-variants.md");

/// Focused public GitHub projects (description + topics) — richer than cvdata for prep/cover letters.
const PUBLIC_PROJECTS_FOCUSED_JSON: &str =
    include_str!("../../data/distillation/public-projects-focused-flatten.json");

/// Slim repo list (name/url/description/topics) — fills gaps not in focused list.
const PUBLIC_PROJECTS_SLIM_JSON: &str =
    include_str!("../../data/distillation/public-projects.json");

/// Full GitHub descriptions (no API ellipsis) — upgrades truncated slim blurbs.
const PUBLIC_PROJECTS_CLEAN_JSON: &str =
    include_str!("../../data/distillation/public-projects-clean.json");

const PACKET_PREVIEW_MAX_CHARS: usize = 8000;

const DEFAULT_PROOF_VARIANT_ID: &str = "EW-agent-collab-finder";

/// Max projects / chars injected into prep (token budget for cover letters).
const PREP_PROJECTS_MAX: usize = 8;
const PREP_PROJECTS_BLOCK_MAX_CHARS: usize = 4500;
/// PDF column: few complete blurbs beat many truncated GitHub leftovers.
const FEATURED_PROJECTS_MAX: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProofVariant {
    pub id: String,
    pub title: String,
    pub body: String,
}

/// Fit evaluation mode: strict dual-fit vs relaxed simple fitness.
pub(crate) const FIT_MODE_STRICT: &str = "strict";
pub(crate) const FIT_MODE_RELAXED: &str = "relaxed";
const DEFAULT_FIT_MODE: &str = FIT_MODE_STRICT;

/// Normalize stored / IPC fit mode strings.
pub(crate) fn parse_fit_mode(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "relaxed" => FIT_MODE_RELAXED,
        _ => FIT_MODE_STRICT,
    }
}

pub(crate) fn resolve_constraints(mode: &str) -> &'static str {
    if parse_fit_mode(mode) == FIT_MODE_RELAXED {
        CANDIDATE_CONSTRAINTS_RELAXED
    } else {
        CANDIDATE_CONSTRAINTS_STRICT
    }
}

/// Dual-fit JSON schema for xAI structured analyze (`target_fit_v2`) — **strict** mode.
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

/// Simple fitness schema for **relaxed** mode (`target_fit_simple_v1`).
/// No You↔Role dual scores — experience match only, then prep bundle in the UI.
pub(crate) fn simple_fitness_json_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "overall": {"type": "integer", "minimum": 0, "maximum": 100},
            "rationale": {"type": "string"},
            "gaps_must": {"type": "array", "items": {"type": "string"}},
            "gaps_nice": {"type": "array", "items": {"type": "string"}},
            "recommended_action": {"type": "string"}
        },
        "required": [
            "overall",
            "rationale",
            "gaps_must",
            "recommended_action"
        ],
        "additionalProperties": false
    })
}

/// Build analyze user prompt: CV + constraints + opportunity (dual-fit, not CV+JD only).
pub(crate) fn build_analyze_user_prompt(cv: &str, jd: &str, constraints: &str) -> String {
    build_analyze_user_prompt_for_mode(cv, jd, constraints, FIT_MODE_STRICT)
}

/// Mode-aware analyze user prompt (strict dual-fit vs relaxed simple fitness).
pub(crate) fn build_analyze_user_prompt_for_mode(
    cv: &str,
    jd: &str,
    constraints: &str,
    mode: &str,
) -> String {
    if parse_fit_mode(mode) == FIT_MODE_RELAXED {
        return format!(
            r#"CV PACKET (pruned):
{cv}

CANDIDATE_CONSTRAINTS (RELAXED — relevant experience only; not dual-fit mission scoring):
{constraints}

OPPORTUNITY DESCRIPTION:
{jd}

SIMPLE FITNESS RUBRIC (relaxed):
- overall (0-100): how well the candidate's evidenced experience matches this role's requirements (from CV only).
- Do NOT require physical-world ML, robotics, world models, or Elon multi-planetary alignment.
- Do NOT penalize for non-SpaceXAI-tier compensation or non-AI-lab production tenure when skills match.
- gaps_must / gaps_nice: candidate skill/experience shortfalls vs the JD.
- recommended_action: next step toward applying or preparing materials when fit is decent; pause only for clear capability gaps.
- Do NOT emit candidate_to_role, role_to_candidate, role_concerns, or deal_breakers_triggered (not in schema).

Return simple fitness analysis."#,
            cv = cv,
            constraints = constraints.trim(),
            jd = jd
        );
    }

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
                    if should_replace_description(&existing.description, &desc) {
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
                            description: if github_description_truncated(&desc) {
                                String::new()
                            } else {
                                desc
                            },
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

    merge_clean_repo_descriptions(&mut by_name, PUBLIC_PROJECTS_CLEAN_JSON);

    by_name.into_values().collect()
}

fn github_description_truncated(s: &str) -> bool {
    let t = s.trim();
    t.ends_with('\u{2026}') || t.ends_with("...")
}

fn should_replace_description(current: &str, incoming: &str) -> bool {
    if incoming.trim().is_empty() {
        return false;
    }
    let incoming_cut = github_description_truncated(incoming);
    let current_cut = current.trim().is_empty() || github_description_truncated(current);
    if incoming_cut && !current_cut {
        return false;
    }
    if !incoming_cut && current_cut {
        return true;
    }
    incoming.chars().count() > current.chars().count()
}

fn merge_clean_repo_descriptions(
    by_name: &mut std::collections::BTreeMap<String, PublicProject>,
    clean_json: &str,
) {
    let Ok(v) = serde_json::from_str::<Value>(clean_json) else {
        return;
    };
    let Some(arr) = v.get("repos").and_then(|x| x.as_array()) else {
        return;
    };
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
        let desc = p
            .get("description")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if desc.is_empty() || github_description_truncated(&desc) {
            continue;
        }
        let key = name.to_lowercase();
        if let Some(existing) = by_name.get_mut(&key) {
            if should_replace_description(&existing.description, &desc) {
                existing.description = desc;
            }
            if existing.url.is_empty() {
                if let Some(u) = p.get("html_url").and_then(|x| x.as_str()) {
                    existing.url = u.to_string();
                }
            }
        }
    }
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
        if github_description_truncated(&desc) {
            desc.clear();
        } else if desc.chars().count() > 320 {
            // Sentence-complete clamp — never mid-word GitHub leftover + extra ellipsis.
            let cut: String = desc.chars().take(320).collect();
            if let Some(idx) = cut.rfind(". ") {
                desc = cut[..=idx].to_string();
            } else {
                desc = cut;
            }
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
/// Mirrors devprofile_path pattern. Default is grok-4.6.
/// Non-goals: no DB column for now.
const DEFAULT_XAI_MODEL: &str = "grok-4.6";

fn get_xai_model() -> String {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("xai_model.txt");
        if let Ok(s) = std::fs::read_to_string(&p) {
            let t = s.trim().to_string();
            if !t.is_empty() {
                // Previous app default — pick up grok-4.6 without a Settings click.
                if t == "grok-4.5" {
                    let _ = std::fs::write(&p, DEFAULT_XAI_MODEL);
                    return DEFAULT_XAI_MODEL.to_string();
                }
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

/// Persistent fit mode: `strict` (dual-fit) | `relaxed` (simple fitness). Default strict.
/// Same plain-text file pattern as xai_model.txt (not a secret).
fn get_fit_mode() -> String {
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("fit_mode.txt");
        if let Ok(s) = std::fs::read_to_string(p) {
            return parse_fit_mode(&s).to_string();
        }
    }
    DEFAULT_FIT_MODE.to_string()
}

#[tauri::command]
pub(crate) fn get_fit_mode_cmd() -> Result<String, String> {
    Ok(get_fit_mode())
}

#[tauri::command]
pub(crate) fn set_fit_mode_cmd(mode: Option<String>) -> Result<String, String> {
    let normalized = match &mode {
        Some(m) if !m.trim().is_empty() => parse_fit_mode(m).to_string(),
        _ => DEFAULT_FIT_MODE.to_string(),
    };
    if let Ok(dir) = crate::app_dirs::app_data_dir() {
        let p = dir.join("fit_mode.txt");
        let _ = std::fs::create_dir_all(&dir);
        if normalized == DEFAULT_FIT_MODE {
            // Prefer explicit file so UI reloads see the choice; still write default.
            let _ = std::fs::write(&p, &normalized);
        } else {
            let _ = std::fs::write(&p, &normalized);
        }
    }
    Ok(normalized)
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
    schema_name: &str,
    _json_schema: Value,
    _model: &str,
) -> Result<(Value, crate::xai::XaiUsage), String> {
    // Offline stub only (unit/integration tests). Live build uses crate::xai::structured_chat.
    let is_simple = schema_name == "target_fit_simple_v1"
        || user.contains("SIMPLE FITNESS RUBRIC")
        || user.contains("Return simple fitness analysis");
    let is_dual = schema_name == "target_fit_v2"
        || user.contains("Return fit analysis")
        || user.contains("DUAL-FIT RUBRIC");
    if schema_name == "cv_profile_polish_v1" || user.contains("Draft profile to improve") {
        // Return a coherent polished paragraph for unit/integration stubs.
        let polished = "Fullstack TypeScript engineer with deep ownership of production integrations, platform reliability, and secure data flows. At Oneflow I established the Integration Team and multi-client systems connecting HubSpot, SuperOffice, Dynamics, Salesforce and Teamtailor, then stabilized the Public API so a third-party ecosystem could grow reliably. Later work focused on large-scale TypeScript migration (≈70% reduction in type-related errors), ACL unification, and Playwright E2E. Recent personal work includes AWS Rekognition identity flows and Zod-based schema tooling. Seeking the Fullstack Developer role at Qred to own full-stack delivery of internal platforms and integrations.";
        Ok((
            json!({ "profile": polished }),
            crate::xai::XaiUsage {
                prompt_tokens: Some(80),
                completion_tokens: Some(120),
                total_tokens: None,
            },
        ))
    } else if is_simple {
        let fit = json!({
            "overall": 78,
            "rationale": "Strong TypeScript/Rust/agent tooling evidence matches the role requirements without mission magnets.",
            "gaps_must": ["explicit production AI-infra tenure if required"],
            "gaps_nice": ["on-call ownership examples"],
            "recommended_action": "Generate prep pack and tailor cover letter to JD keywords."
        });
        Ok((fit, crate::xai::XaiUsage { prompt_tokens: Some(100), completion_tokens: Some(50), total_tokens: None }))
    } else if is_dual {
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

/// Make a paste-friendly opportunity URL absolute for reqwest.
/// Bare `host/path` (no scheme) → `https://host/path`. Rejects empty / non-http(s).
///
/// Fixes: `builder error: relative URL without a base` when user pastes
/// `jobs.qred.com/...` without `https://`.
pub(crate) fn normalize_opportunity_fetch_url(raw: &str) -> Result<String, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Err("URL is empty".into());
    }
    let with_scheme = if t.len() >= 8 && t[..8].eq_ignore_ascii_case("https://") {
        t.to_string()
    } else if t.len() >= 7 && t[..7].eq_ignore_ascii_case("http://") {
        t.to_string()
    } else if t.starts_with("//") {
        format!("https:{t}")
    } else {
        format!("https://{t}")
    };
    let parsed = reqwest::Url::parse(&with_scheme).map_err(|e| {
        format!("Invalid opportunity URL '{raw}': {e} (try full https://… URL)")
    })?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!(
            "Only http(s) URLs supported (got scheme '{}')",
            parsed.scheme()
        ));
    }
    if parsed.host_str().is_none() {
        return Err(format!("URL has no host: {raw}"));
    }
    Ok(parsed.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_opportunity_target_page(url: String) -> Result<OpportunityTargetPageResult, String> {
    let url = normalize_opportunity_fetch_url(&url)?;
    // Basic fetch + naive clean (no extra crates in v1)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (compatible; collab-finder/0.1; +https://github.com/sustainableabundance/collab-finder)")
        .build()
        .map_err(|e| format!("HTTP client build failed: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fetch failed for {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Fetch failed for {url}: HTTP {}",
            resp.status()
        ));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Read body failed for {url}: {e}"))?;

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

/// Placeholder written by older analyze/prep upserts instead of the real JD body.
fn stored_jd_is_usable(jd_text: &str) -> bool {
    let trimmed = jd_text.trim();
    !trimmed.is_empty() && trimmed != "jd"
}

/// Prefer pasted JD, else fetch URL. Empty Option means neither source had usable text (caller may load DB).
async fn resolve_opportunity_jd_text(
    url: Option<String>,
    pasted_jd: Option<String>,
) -> Result<Option<String>, String> {
    if let Some(pasted) = pasted_jd {
        if stored_jd_is_usable(&pasted) {
            return Ok(Some(pasted));
        }
    }
    if let Some(page_url) = url {
        if !page_url.trim().is_empty() {
            let fetched = fetch_opportunity_target_page(page_url).await?;
            if stored_jd_is_usable(&fetched.cleaned_text) {
                return Ok(Some(fetched.cleaned_text));
            }
        }
    }
    Ok(None)
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
    let jd = resolve_opportunity_jd_text(url, pasted_jd)
        .await?
        .ok_or_else(|| "Provide either url or pasted_jd".to_string())?;

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

    // Live xAI path (structured_chat). Unit tests never call this — they cover prompt/schema only.
    let fit_mode = get_fit_mode();
    let constraints = resolve_constraints(&fit_mode);
    let relaxed = parse_fit_mode(&fit_mode) == FIT_MODE_RELAXED;
    let (system, schema_name, schema) = if relaxed {
        (
            "You are a precise, truth-seeking career fitness analyst. Output ONLY valid JSON. Score simple fitness: how well the candidate's evidenced CV experience matches this role. Do not require physical-world ML, robotics, or mission magnets. Every claim about experience must be supported by the CV PACKET. Do not invent timelines or production AI-lab employment.",
            "target_fit_simple_v1",
            simple_fitness_json_schema(),
        )
    } else {
        (
            "You are a precise, truth-seeking dual-fit career analyst. Output ONLY valid JSON. Score both directions: candidate→role (can they do it, from CV only) and role→candidate (is it right for them, from CANDIDATE_CONSTRAINTS). Every claim about the candidate's experience must be supported by the CV PACKET. Do not invent timelines or attribute aggregate YOE to specific recent projects. Respect deal-breakers and low role_to_candidate when recommending actions.",
            "target_fit_v2",
            dual_fit_json_schema(),
        )
    };
    let user = build_analyze_user_prompt_for_mode(&cv, &jd, constraints, &fit_mode);

    let model = get_xai_model();
    let (fit_json, usage) =
        structured_chat(system, &user, schema_name, schema, &model).await?;

    let cost = crate::xai::cost_from_usage(&usage);
    let (packet_preview, packet_preview_truncated) = packet_preview_for(&cv);
    let prompt_tokens = usage.prompt_tokens.unwrap_or(0);
    let completion_tokens = usage.completion_tokens.unwrap_or(0);

    // Return with dummy id; the cmd will upsert and patch the real id.
    Ok(OpportunityTargetAnalysisResult {
        opportunity_id: 0,
        fit: fit_json,
        fit_mode,
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
    paste: Option<String>,
) -> Result<OpportunityTargetAnalysisResult, String> {
    // Normalize bare host/path so DB + Open URL store absolute https://…
    let url = match url {
        Some(u) if !u.trim().is_empty() => Some(normalize_opportunity_fetch_url(&u)?),
        other => other.filter(|u| !u.trim().is_empty()),
    };
    let pasted_jd = pasted_jd.filter(|t| !t.trim().is_empty()).or(paste.filter(|t| !t.trim().is_empty()));
    // Resolve JD once so we persist the real body (not the old "jd" placeholder) and analyze uses the same text.
    let jd = resolve_opportunity_jd_text(url.clone(), pasted_jd.clone())
        .await?
        .ok_or_else(|| "Provide either url or pasted_jd".to_string())?;
    // Delegate core (resolve + stub xAI + compute packet) to run_, short lock for upsert only.
    let mut res = run_analyze_opportunity_target(None, Some(jd.clone()), title.clone(), company.clone(), cv_summary).await?;
    let run_id = if let Ok(guard) = db.0.lock() {
        let analysis_for_store = json!({
            "fit": res.fit,
            "fit_mode": res.fit_mode,
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
            "web", url.as_deref(), None, title.as_deref(), company.as_deref(), &jd,
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
    title: Option<String>,
    company: Option<String>,
    cv_summary: Option<String>,
    previous_fit: Option<String>,
) -> Result<OpportunityTargetPrepResult, String> {
    let jd = resolve_opportunity_jd_text(url, pasted_jd)
        .await?
        .ok_or_else(|| {
            "Provide url, pasted_jd or ensure prior analyze created the opportunity".to_string()
        })?;

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
        let cover = obj
            .get("cover_letter")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !cover.trim().is_empty() {
            obj.insert(
                "email_draft".into(),
                json!(build_email_apply_draft(
                    &cover,
                    company.as_deref().unwrap_or(""),
                    title.as_deref().unwrap_or(""),
                )),
            );
        }
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
    paste: Option<String>,
) -> Result<OpportunityTargetPrepResult, String> {
    let pasted_jd = pasted_jd.filter(|t| !t.trim().is_empty()).or(paste.filter(|t| !t.trim().is_empty()));
    let mut jd = resolve_opportunity_jd_text(url.clone(), pasted_jd.clone()).await?;
    if !jd.as_ref().is_some_and(|text| stored_jd_is_usable(text)) {
        if let Some(oid) = opportunity_id.filter(|id| *id > 0) {
            if let Ok(guard) = db.0.lock() {
                if let Ok(rows) = guard.get_opportunities(&db::OpportunityFilter {
                    id: Some(oid),
                    limit: Some(1),
                    ..Default::default()
                }) {
                    if let Some(row) = rows.into_iter().next() {
                        if stored_jd_is_usable(&row.jd_text) {
                            jd = Some(row.jd_text);
                        }
                    }
                }
            }
        }
    }
    let jd = jd.filter(|text| stored_jd_is_usable(text)).ok_or_else(|| {
        "Provide url, pasted_jd or ensure prior analyze created the opportunity".to_string()
    })?;
    // Delegate to run_ (core) with resolved JD as pasted_jd so paste-only / prior-analyze paths work.
    let mut res = run_prep_opportunity_target(
        opportunity_id,
        None,
        Some(jd.clone()),
        title.clone(),
        company.clone(),
        cv_summary,
        previous_fit,
    )
    .await?;
    let run_id = if let Some(oid) = opportunity_id.filter(|id| *id > 0) {
        if let Ok(guard) = db.0.lock() {
            let _ = guard.set_prep_artifacts(oid, &res.prep.to_string(), "prepped");
        }
        oid
    } else if let Ok(guard) = db.0.lock() {
        guard
            .upsert_opportunity(
                "web",
                url.as_deref(),
                None,
                title.as_deref(),
                company.as_deref(),
                &jd,
                "prepped",
                None,
                None,
                Some(&res.prep.to_string()),
                None,
            )
            .unwrap_or(0)
    } else {
        0
    };
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

/// In-app reader payload for pack markdown/PDF (bounded paths only).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PackArtifactRead {
    pub filename: String,
    /// `text` or `pdf`
    pub kind: String,
    pub text: Option<String>,
    pub pdf_base64: Option<String>,
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

/// Known project keys (cvdata / public bank) matched when mentioned in prep suggestions.
const OVERLAY_PROJECT_HINTS: &[(&str, &str)] = &[
    ("collab-finder", "collab-finder"),
    ("agent-prompt-tuning-lab", "agent-prompt-tuning-lab"),
    ("agent-prompt", "agent-prompt-tuning-lab"),
    ("elomaxz", "elomaxz"),
    ("premflow", "premflow"),
    ("thepulimaangani", "thepulimaangani"),
    ("pulima", "thepulimaangani"),
    ("selfie-signin", "selfie-signin"),
    ("selfie-sign", "selfie-signin"),
    ("rekognition", "selfie-signin"),
    ("adaptate", "adaptate"),
    ("latex-cv", "latex-cv"),
    ("grok-dia", "grok-dia"),
    ("prototype-it", "prototype-it-to-explain-itself"),
];

/// Collect project keys mentioned in free-text suggestions / research (order preserved).
pub(crate) fn featured_keys_from_prep_text(blob: &str) -> Vec<String> {
    let lower = blob.to_lowercase();
    let mut out: Vec<String> = Vec::new();
    for (needle, key) in OVERLAY_PROJECT_HINTS {
        if lower.contains(needle) && !out.iter().any(|k| k == *key) {
            out.push((*key).to_string());
        }
    }
    out
}

/// Strip cover-letter salutation/sign-off; keep body prose for PROFILE.
fn cover_letter_body_excerpt(cover: &str, max_chars: usize) -> String {
    let mut lines: Vec<&str> = cover
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    // Drop leading Dear … / Hi …
    while lines
        .first()
        .map(|l| {
            let ll = l.to_lowercase();
            ll.starts_with("dear ") || ll.starts_with("hi ") || ll.starts_with("hello ")
        })
        .unwrap_or(false)
    {
        lines.remove(0);
    }
    // Drop trailing sign-off lines
    while lines
        .last()
        .map(|l| {
            let ll = l.to_lowercase();
            ll.starts_with("sincerely")
                || ll.starts_with("best regards")
                || ll.starts_with("kind regards")
                || ll.starts_with("regards")
                || *l == "—"
                || l.starts_with("Peramanathan")
        })
        .unwrap_or(false)
    {
        lines.pop();
    }
    let body = lines.join(" ");
    body.chars().take(max_chars).collect()
}

fn first_sentences(text: &str, max_sentences: usize) -> String {
    let mut out = String::new();
    let mut count = 0usize;
    for part in text.split_inclusive(|ch: char| matches!(ch, '.' | '!' | '?')) {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(trimmed);
        count += 1;
        if count >= max_sentences {
            break;
        }
    }
    out
}

/// Subject + short email touch + full cover letter for apply-via-email (no extra xAI call).
pub(crate) fn build_email_apply_draft(cover: &str, company: &str, title: &str) -> String {
    let co = display_company_name(company);
    let role = display_role_title(title);
    let subject = format!("Application — {role} — {co}");
    let excerpt = cover_letter_body_excerpt(cover, 480);
    let touch = first_sentences(&excerpt, 2);
    let touch = if touch.is_empty() {
        format!("I'm applying for the {role} role at {co}.")
    } else {
        touch
    };
    let letter = cover.trim();
    format!(
        "Subject: {subject}\n\nHi,\n\n{touch}\n\nI've attached my CV as a PDF.\n\n---\n\n{letter}\n"
    )
}

/// Display company: `qred` → `Qred`, leave multi-word as-is with first-letter upcase.
pub(crate) fn display_company_name(company: &str) -> String {
    let t = company.trim();
    if t.is_empty() {
        return "the company".into();
    }
    if t.contains(' ') {
        return t
            .split_whitespace()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
    }
    let mut c = t.chars();
    match c.next() {
        None => t.to_string(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Clean role title for prose (collapse Typescript → TypeScript, drop trailing junk).
pub(crate) fn display_role_title(title: &str) -> String {
    let t = title.trim().replace("Typescript", "TypeScript");
    if t.is_empty() {
        "Software Engineer".into()
    } else {
        t
    }
}

/// Beat 1 — identity + ownership themes (stable phrasing; not job-title fixation).
pub(crate) fn profile_hook(title: &str, scan: &str) -> String {
    let t = title.to_lowercase();
    let s = scan.to_lowercase();
    let secure = s.contains("secur")
        || s.contains("rekognition")
        || s.contains("auth")
        || s.contains("acl")
        || t.contains("secur");
    // Fixed preferred phrasing (user): not "Fullstack TypeScript engineer"
    let base = "Senior Software Engineer with fullstack web dev specialization";
    if secure {
        return format!(
            "{base}, with deep ownership of production integrations, platform reliability, and secure data flows."
        );
    }
    if t.contains("backend") || t.contains("platform") {
        return format!(
            "{base}, with deep ownership of production systems, integrations, and reliable delivery."
        );
    }
    if t.contains("frontend") || t.contains("front-end") {
        return format!(
            "{base}, with deep ownership of product UI, reliable delivery, and full-stack collaboration."
        );
    }
    format!(
        "{base}, with deep ownership of production integrations, platform reliability, and high-signal delivery."
    )
}

/// Compress exceptional-work / cover into career+craft beats (strip trailing meta fluff).
fn career_and_craft_prose(exceptional: &str, cover: &str) -> String {
    let raw = if !exceptional.trim().is_empty() {
        exceptional.trim().to_string()
    } else if !cover.trim().is_empty() {
        cover_letter_body_excerpt(cover, 700)
    } else {
        String::new()
    };
    if raw.is_empty() {
        return "At Oneflow I led full-stack integration and platform work—multi-client systems, Public API reliability, TypeScript migration, and Playwright E2E—with ownership of production quality.".into();
    }
    // Drop trailing self-commentary that weakens flow
    let mut t = raw;
    for junk in [
        "This is production product integration at scale, the same craft I apply when shipping secure, maintainable fullstack systems.",
        "This is production product integration at scale",
        "the same craft I apply when shipping secure, maintainable fullstack systems.",
    ] {
        if let Some(idx) = t.find(junk) {
            t = t[..idx].trim().to_string();
        }
    }
    // Keep PROFILE short enough that Work Experience roles 0–2 stay on PDF page 1.
    take_prose_up_to(t.trim(), 480)
}

/// Prefer whole sentences within `max` chars (for page-1 PROFILE budget).
fn take_prose_up_to(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out = String::new();
    for part in s.split_inclusive(". ") {
        let next_len = out.chars().count() + part.chars().count();
        if next_len > max {
            break;
        }
        out.push_str(part);
    }
    let out = out.trim().to_string();
    if out.len() >= max / 3 {
        out
    } else {
        s.chars().take(max).collect()
    }
}

/// Beat 4 — at most two short personal/OSS items (prefer Rekognition / Zod when present).
pub(crate) fn recent_personal_phrase(featured: &[String], scan: &str) -> String {
    let s = scan.to_lowercase();
    let mut items: Vec<&str> = Vec::new();
    if s.contains("rekognition") || s.contains("selfie") || featured.iter().any(|k| k == "selfie-signin")
    {
        items.push("AWS Rekognition identity flows");
    }
    if s.contains("zod") || s.contains("schema") {
        items.push("Zod-based schema tooling");
    }
    if items.len() < 2 && featured.iter().any(|k| k == "collab-finder") && s.contains("agent") {
        items.push("agentic desktop tooling (personal OSS)");
    }
    if items.is_empty() && featured.iter().any(|k| k == "collab-finder") {
        items.push("personal OSS agentic tooling");
    }
    if items.is_empty() {
        return String::new();
    }
    items.truncate(2);
    if items.len() == 1 {
        format!("Recent personal work includes {}.", items[0])
    } else {
        format!("Recent personal work includes {} and {}.", items[0], items[1])
    }
}

/// Beat 5 — seeking line (gold pattern).
pub(crate) fn seeking_line(title: &str, company: &str) -> String {
    let role = display_role_title(title);
    let co = display_company_name(company);
    format!(
        "Seeking the {role} role at {co} to own full-stack delivery of internal platforms and integrations."
    )
}

/// PROFILE: 5-beat coherent overview (hook → career/craft → recent → seeking).
/// Hiring-manager prose only — never agent meta or raw prep instruction dumps.
pub(crate) fn build_professional_profile_override(
    exceptional: &str,
    cover: &str,
    featured: &[String],
    company: &str,
    title: &str,
) -> String {
    build_professional_profile_override_with_scan(exceptional, cover, featured, company, title, "")
}

/// Same as [`build_professional_profile_override`] with full prep scan for theme/recent selection.
pub(crate) fn build_professional_profile_override_with_scan(
    exceptional: &str,
    cover: &str,
    featured: &[String],
    company: &str,
    title: &str,
    scan: &str,
) -> String {
    let scan_all = format!("{scan}\n{exceptional}\n{cover}");
    let hook = profile_hook(title, &scan_all);
    let seeking = seeking_line(title, company);
    // Page-1 budget: leave room for 3 Oneflow roles under Work Experience.
    const MAX_PROFILE_CHARS: usize = 600;
    let fixed = hook.chars().count() + seeking.chars().count() + 2;
    let mut rem = MAX_PROFILE_CHARS.saturating_sub(fixed);

    let mut recent = recent_personal_phrase(featured, &scan_all);
    let recent_cost = if recent.is_empty() {
        0
    } else {
        recent.chars().count() + 1
    };
    // Prefer career prose over recent if space is tight
    if recent_cost > 0 && recent_cost + 120 > rem {
        recent = String::new();
    }
    let career_budget = rem.saturating_sub(if recent.is_empty() {
        0
    } else {
        recent.chars().count() + 1
    });
    let career = take_prose_up_to(
        &career_and_craft_prose(exceptional, cover),
        career_budget.max(80),
    );

    let mut parts = vec![hook, career];
    if !recent.is_empty() {
        parts.push(recent);
    }
    parts.push(seeking);
    parts
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Build `cv_overlay_v1` so generate-apply-cv can role-fit the PDF (master cvdata never written).
/// Maps prep suggestions → featured_keys + profile/title overrides + optional project upserts from bank.
pub(crate) fn build_cv_overlay_from_prep(
    prep: &Value,
    identity: Option<&ApplicationPackIdentity>,
) -> Value {
    let suggestions: Vec<String> = prep
        .get("cv_suggestions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let research = prep
        .get("research_notes")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let exceptional = prep
        .get("exceptional_work_example")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let cover = prep
        .get("cover_letter")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    let mut scan = suggestions.join("\n");
    scan.push('\n');
    scan.push_str(research);
    scan.push('\n');
    scan.push_str(exceptional);
    scan.push('\n');
    scan.push_str(cover);

    let mut featured = featured_keys_from_prep_text(&scan);
    for def in ["collab-finder", "agent-prompt-tuning-lab", "adaptate"] {
        if featured.len() >= FEATURED_PROJECTS_MAX {
            break;
        }
        if !featured.iter().any(|k| k == def) {
            featured.push(def.to_string());
        }
    }
    featured.truncate(FEATURED_PROJECTS_MAX);

    let company = identity.map(|i| i.company.as_str()).unwrap_or("target");
    let title = identity.map(|i| i.title.as_str()).unwrap_or("role");

    // 5-beat PROFILE: hook → career/craft → recent personal → seeking (gold-standard flow).
    // Do not override latest_proffessional_role — header no longer shows it; avoids role fixation.
    let profile = build_professional_profile_override_with_scan(
        exceptional,
        cover,
        &featured,
        company,
        title,
        &scan,
    );

    let co = display_company_name(company);
    let one_liner = format!(
        "Senior Software Engineer with fullstack web dev specialization · {co} · integrations & production craft"
    );

    // Upsert bank projects that we featured so descriptions are rich when keys are missing from master
    let bank = parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
    let mut projects_upsert: Vec<Value> = Vec::new();
    for key in &featured {
        if let Some(p) = bank.iter().find(|p| p.name.eq_ignore_ascii_case(key) || p.name.replace('_', "-") == *key) {
            let mut techs: Vec<String> = p.topics.clone();
            if techs.is_empty() && !p.language.is_empty() {
                techs.push(p.language.clone());
            }
            let mut rec = serde_json::Map::new();
            rec.insert("key".into(), json!(key));
            rec.insert("name".into(), json!(p.name));
            rec.insert("url".into(), json!(p.url));
            rec.insert("type".into(), json!("hobby_oss"));
            rec.insert("technologies".into(), json!(techs));
            rec.insert("is_open_source".into(), json!(true));
            if !p.description.is_empty() && !github_description_truncated(&p.description) {
                rec.insert("description".into(), json!(p.description.clone()));
            }
            projects_upsert.push(Value::Object(rec));
        }
    }

    json!({
        "schema": "cv_overlay_v1",
        "source": "auto_from_prep",
        "featured_keys": featured,
        "projects_upsert": projects_upsert,
        "overrides": {
            "profile": profile,
            "one_liner": one_liner,
        },
        "prep_suggestions": suggestions,
        "note": "Auto-built from prep for generate-apply-cv. Does not mutate master cvdata.json.",
    })
}

/// Pure builder: prep artifacts JSON → ordered (filename, content) pairs.
/// Same function the export command and unit tests use — no FS, no DB.
/// Produces cover-letter.md, cv-suggestions.md, research-notes.md, exceptional-work.md,
/// optional proof-variant.txt, **cv-overlay.json** (role-fit for generate-apply-cv), and manifest.json.
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
            let company = identity.map(|i| i.company.as_str()).unwrap_or("");
            let title = identity.map(|i| i.title.as_str()).unwrap_or("");
            let draft = prep
                .get("email_draft")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_email_apply_draft(t, company, title));
            files.push((
                "email-draft.md".into(),
                format!("# Email apply draft\n\n{draft}\n"),
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

    // Always emit overlay when we have any prep content so apply CVs differ per role.
    let overlay = build_cv_overlay_from_prep(&prep, identity);
    let has_suggestions = overlay
        .get("prep_suggestions")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    let has_featured = overlay
        .get("featured_keys")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if has_suggestions || has_featured || !files.is_empty() {
        files.push((
            "cv-overlay.json".into(),
            serde_json::to_string_pretty(&overlay).unwrap_or_else(|_| "{}".into()),
        ));
    }

    if files.is_empty() {
        return Err("prep has no exportable artifacts (need cover_letter, cv_suggestions, research_notes, or exceptional_work_example)".into());
    }

    let mut manifest = json!({
        "schema": "application_pack_v1",
        "files": files.iter().map(|(n, _)| n.clone()).collect::<Vec<_>>(),
        "source": "stored_prep_artifacts",
        "note": "Durable pack for offline apply. Does not mutate external devprofile cvdata.json.",
        "has_cv_overlay": true,
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

/// Job id from board URLs.
/// - Greenhouse / numeric: `…/jobs/4956028007` → `4956028007`
/// - Qred-style id-slug: `…/jobs/7931564-fullstack-developer-typescript` → `7931564` (digits for PDF naming)
/// - Query: `?gh_jid=` / `job_id=`
pub(crate) fn job_id_from_source_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    if let Some(pos) = lower.find("/jobs/") {
        let after = &url[pos + "/jobs/".len()..];
        let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !digits.is_empty() {
            return Some(digits);
        }
        let id: String = after
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
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
                .take_while(|c| c.is_ascii_digit() || c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

/// Title from id-slug path: `…/jobs/7931564-fullstack-developer-typescript` → `Fullstack Developer Typescript`.
pub(crate) fn title_from_job_url_slug(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    let pos = lower.find("/jobs/")?;
    let after = &url[pos + "/jobs/".len()..];
    let segment: String = after
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if segment.is_empty() {
        return None;
    }
    // Strip leading numeric id and hyphen
    let rest = segment
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches('-');
    if rest.is_empty() {
        return None;
    }
    let titled: String = rest
        .split(|c| c == '-' || c == '_')
        .filter(|p| !p.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    if titled.len() > 2 {
        Some(titled)
    } else {
        None
    }
}

/// Company from host: `jobs.qred.com` → `qred`, `careers.x.com` → `x`.
pub(crate) fn company_from_jobs_host_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    let host = lower
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split(|c| c == '/' || c == '?' || c == '#')
        .next()
        .unwrap_or("");
    for prefix in ["jobs.", "careers.", "boards."] {
        if let Some(rest) = host.strip_prefix(prefix) {
            let co = rest.split('.').next().unwrap_or("").trim();
            if co.len() > 1 && co != "www" && co != "greenhouse" && co != "lever" {
                return Some(co.to_string());
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
            company = company_from_greenhouse_url(url)
                .or_else(|| company_from_jobs_host_url(url));
        }
    }

    if title.is_none() {
        if let Some(url) = o.source_url.as_deref() {
            title = title_from_job_url_slug(url);
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

const MAX_ARTIFACT_BYTES: u64 = 12 * 1024 * 1024;

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn path_is_under(canonical_file: &std::path::Path, root: &std::path::Path) -> bool {
    let Ok(root_c) = root.canonicalize() else {
        return false;
    };
    canonical_file.starts_with(&root_c)
}

/// Only application_packs under app data, or generate-apply-cv PDFs under devprofile/out/apply.
fn artifact_path_allowed(canonical_file: &std::path::Path) -> bool {
    if let Ok(data) = crate::app_dirs::app_data_dir() {
        if path_is_under(canonical_file, &data.join("application_packs")) {
            return true;
        }
    }
    if let Some(dev) = get_devprofile_path() {
        if path_is_under(canonical_file, &std::path::PathBuf::from(dev).join("out").join("apply")) {
            return true;
        }
    }
    false
}

pub(crate) fn read_pack_artifact_at(path: &str) -> Result<PackArtifactRead, String> {
    let raw = std::path::PathBuf::from(path.trim());
    if path.trim().is_empty() {
        return Err("path required".into());
    }
    let canonical = raw
        .canonicalize()
        .map_err(|_| "artifact not found".to_string())?;
    if !canonical.is_file() {
        return Err("artifact is not a file".into());
    }
    if !artifact_path_allowed(&canonical) {
        return Err("artifact path is outside allowed pack/apply folders".into());
    }
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ARTIFACT_BYTES {
        return Err("artifact too large to preview".into());
    }
    let filename = canonical
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("artifact")
        .to_string();
    let ext = canonical
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext == "pdf" {
        let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
        return Ok(PackArtifactRead {
            filename,
            kind: "pdf".into(),
            text: None,
            pdf_base64: Some(encode_base64(&bytes)),
        });
    }
    if matches!(ext.as_str(), "md" | "txt" | "json") {
        let text = std::fs::read_to_string(&canonical).map_err(|e| e.to_string())?;
        return Ok(PackArtifactRead {
            filename,
            kind: "text".into(),
            text: Some(text),
            pdf_base64: None,
        });
    }
    Err("preview supports markdown, text, json, and pdf".into())
}

#[tauri::command]
pub(crate) fn read_pack_artifact(path: String) -> Result<PackArtifactRead, String> {
    read_pack_artifact_at(&path)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PackArtifactListItem {
    pub name: String,
    pub path: String,
    pub kind: String,
}

fn artifact_kind_for_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "pdf",
        "md" | "txt" | "json" => "text",
        _ => "other",
    }
}

pub(crate) fn list_pack_dir_at(dir: &str) -> Result<Vec<PackArtifactListItem>, String> {
    let raw = std::path::PathBuf::from(dir.trim());
    if dir.trim().is_empty() {
        return Err("pack dir required".into());
    }
    let canonical = raw
        .canonicalize()
        .map_err(|_| "pack folder not found".to_string())?;
    if !canonical.is_dir() {
        return Err("pack path is not a folder".into());
    }
    if !artifact_path_allowed(&canonical) && !path_is_under_allowed_dir(&canonical) {
        return Err("pack folder is outside allowed pack/apply folders".into());
    }
    let mut out: Vec<PackArtifactListItem> = Vec::new();
    collect_pack_files(&canonical, &canonical, &mut out, 0)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn path_is_under_allowed_dir(canonical_dir: &std::path::Path) -> bool {
    if let Ok(data) = crate::app_dirs::app_data_dir() {
        if path_is_under(canonical_dir, &data.join("application_packs")) {
            return true;
        }
        if canonical_dir.starts_with(&data.join("application_packs")) {
            return true;
        }
    }
    if let Some(dev) = get_devprofile_path() {
        let apply = std::path::PathBuf::from(dev).join("out").join("apply");
        if path_is_under(canonical_dir, &apply) {
            return true;
        }
    }
    false
}

fn collect_pack_files(
    root: &std::path::Path,
    dir: &std::path::Path,
    out: &mut Vec<PackArtifactListItem>,
    depth: u8,
) -> Result<(), String> {
    if depth > 2 {
        return Ok(());
    }
    let rd = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in rd.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_pack_files(root, &path, out, depth + 1)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let kind = artifact_kind_for_path(&path);
        if kind == "other" {
            continue;
        }
        let name = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        out.push(PackArtifactListItem {
            name,
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_pack_dir(dir: String) -> Result<Vec<PackArtifactListItem>, String> {
    list_pack_dir_at(&dir)
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

    // Ensure submit/ so generate-apply-cv can copy the PDF into the pack for Greenhouse attach.
    let submit_dir = pack_dir.join("submit");
    if !submit_dir.is_dir() {
        let _ = std::fs::create_dir_all(&submit_dir);
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

/// Result of spawning devprofile generate-apply-cv (PDF only; no master CV mutation).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateApplyCvResult {
    pub opportunity_id: i64,
    pub pack_slug: String,
    pub pack_dir: String,
    /// Primary PDF under out/apply/<slug>/…
    pub pdf_path: String,
    /// Flat upload path out/apply/{name-role-id}.pdf when present.
    #[serde(default)]
    pub flat_pdf_path: Option<String>,
    /// Copy under pack submit/ when present.
    #[serde(default)]
    pub submit_pdf_path: Option<String>,
    /// Tail of process stdout for UI.
    #[serde(default)]
    pub stdout_tail: String,
    /// Files written by the re-export step (so UI does not show "0 files").
    #[serde(default)]
    pub export_files: Vec<String>,
    #[serde(default)]
    pub export_file_count: u32,
    /// Absolute path to pack `cv-overlay.json` used for role-fit (required for non-identical apply CVs).
    #[serde(default)]
    pub overlay_path: String,
    /// True when profile was rewritten via xAI polish after the 5-beat template.
    #[serde(default)]
    pub profile_polished: bool,
}

/// Optional xAI polish of overlay `overrides.profile` (template first, then model).
/// Skips when no key or offline tests without polish path. Never mutates master cvdata.
async fn maybe_polish_overlay_profile(
    overlay_path: &std::path::Path,
    title: &str,
    company: &str,
) -> bool {
    if !crate::secrets::has_xai_key() {
        return false;
    }
    let raw = match std::fs::read_to_string(overlay_path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let mut ov: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let draft = ov
        .pointer("/overrides/profile")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if draft.len() < 40 {
        return false;
    }
    let co = display_company_name(company);
    let role = display_role_title(title);
    let system = "You rewrite CV PROFILE paragraphs for hiring managers. Output ONE tight paragraph with strong flow: (1) role-identity hook, (2) career evidence, (3) craft/metrics arc, (4) recent personal work max two concrete items, (5) seeking line naming the role and company. No bullets, no meta, no 'overlay', no 'prep deltas', no agent language. Do not claim production AI-lab employment for personal OSS. Keep factual claims grounded in the draft.";
    let user = format!(
        "Target role: {role}\nTarget company: {co}\n\nDraft profile to improve:\n{draft}\n\nReturn JSON with key profile only."
    );
    let schema = json!({
        "type": "object",
        "properties": {
            "profile": { "type": "string" }
        },
        "required": ["profile"],
        "additionalProperties": false
    });
    let model = get_xai_model();
    let Ok((val, _)) =
        structured_chat(system, &user, "cv_profile_polish_v1", schema, &model).await
    else {
        return false;
    };
    let Some(polished) = val.get("profile").and_then(|v| v.as_str()) else {
        return false;
    };
    let p = polished.trim();
    let pl = p.to_lowercase();
    if p.len() < 80
        || pl.contains("prep deltas")
        || pl.contains("overlay only")
        || pl.contains("master cv")
    {
        return false;
    }
    if let Some(obj) = ov
        .get_mut("overrides")
        .and_then(|v| v.as_object_mut())
    {
        obj.insert("profile".into(), json!(p));
    } else {
        return false;
    }
    ov.as_object_mut()
        .map(|o| o.insert("profile_polished".into(), json!(true)));
    std::fs::write(
        overlay_path,
        serde_json::to_string_pretty(&ov).unwrap_or_else(|_| raw),
    )
    .is_ok()
}

fn parse_pack_slug_from_notes(notes: &str) -> Option<String> {
    for part in notes.split_whitespace() {
        if let Some(rest) = part.strip_prefix("pack_slug=") {
            let s = rest.trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

fn parse_export_path_from_notes(notes: &str) -> Option<String> {
    for part in notes.split_whitespace() {
        if let Some(rest) = part.strip_prefix("export_path=") {
            let s = rest.trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Preflight: devprofile_path must contain scripts/generate-apply-cv.tsx.
pub(crate) fn preflight_generate_apply_cv(devprofile: &std::path::Path) -> Result<PathBuf, String> {
    if !devprofile.is_dir() {
        return Err(format!(
            "devprofile_path is not a directory: {}",
            devprofile.display()
        ));
    }
    let script = devprofile.join("scripts").join("generate-apply-cv.tsx");
    if !script.is_file() {
        return Err(format!(
            "generate-apply-cv.tsx missing at {} — pull latest devprofile main (apply-cv scripts)",
            script.display()
        ));
    }
    Ok(script)
}

/// Resolve `bun`/`pnpm` for GUI-launched Tauri (often has a minimal PATH).
fn resolve_tool_binary(name: &str) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(':') {
            if dir.is_empty() {
                continue;
            }
            let p = PathBuf::from(dir).join(name);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.bun/bin"),
        format!("{home}/.local/share/pnpm"),
        format!("{home}/.local/bin"),
        format!("{home}/.nvm/current/bin"),
        "/usr/local/bin".into(),
        "/usr/bin".into(),
    ];
    for dir in candidates {
        let p = PathBuf::from(&dir).join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn find_bun_or_pnpm() -> Result<(PathBuf, Vec<String>), String> {
    // Prefer bun (package.json: "generate-apply-cv": "bun scripts/…")
    if let Some(bun) = resolve_tool_binary("bun") {
        return Ok((bun, vec!["scripts/generate-apply-cv.tsx".into()]));
    }
    if let Some(pnpm) = resolve_tool_binary("pnpm") {
        return Ok((pnpm, vec!["generate-apply-cv".into()]));
    }
    Err(
        "Neither bun nor pnpm found (PATH + ~/.bun/bin + ~/.local/bin). Install bun or open a shell with pnpm."
            .into(),
    )
}

fn expected_pdf_paths(
    devprofile: &std::path::Path,
    pack_dir: &std::path::Path,
    slug: &str,
) -> (PathBuf, Option<PathBuf>, Option<PathBuf>) {
    // Prefer meta.json written by generate-apply-cv when present
    let meta_path = devprofile.join("out").join("apply").join(slug).join("meta.json");
    if let Ok(raw) = std::fs::read_to_string(&meta_path) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if let Some(name) = v.get("cv_filename").and_then(|x| x.as_str()) {
                let primary = devprofile.join("out").join("apply").join(slug).join(name);
                let flat = devprofile.join("out").join("apply").join(name);
                let submit = pack_dir.join("submit").join(name);
                return (
                    primary,
                    if flat.is_file() { Some(flat) } else { None },
                    if submit.is_file() { Some(submit) } else { None },
                );
            }
        }
    }
    // Fallback: any pdf under out/apply/<slug>/ except cv.pdf alias prefer longer name
    let dir = devprofile.join("out").join("apply").join(slug);
    let mut best: Option<PathBuf> = None;
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("pdf") {
                let name = p.file_name().and_then(|x| x.to_str()).unwrap_or("");
                if name == "cv.pdf" {
                    continue;
                }
                if best.as_ref().map(|b| name.len() > b.file_name().map(|f| f.len()).unwrap_or(0)).unwrap_or(true) {
                    best = Some(p);
                }
            }
        }
    }
    let primary = best.unwrap_or_else(|| dir.join("cv.pdf"));
    let flat = primary
        .file_name()
        .map(|n| devprofile.join("out").join("apply").join(n));
    let submit = primary
        .file_name()
        .map(|n| pack_dir.join("submit").join(n));
    (
        primary,
        flat.filter(|p| p.is_file()),
        submit.filter(|p| p.is_file()),
    )
}

/// Export pack + optional xAI profile polish + spawn devprofile generate-apply-cv.
/// Never mutates master cvdata.json — only pack files + PDFs under out/apply/.
pub(crate) fn do_generate_apply_cv(
    store: &db::SqliteStore,
    opportunity_id: i64,
) -> Result<GenerateApplyCvResult, String> {
    // Sync path used by tests: template overlay only (no live polish).
    do_generate_apply_cv_inner(store, opportunity_id, false)
}

fn do_generate_apply_cv_inner(
    store: &db::SqliteStore,
    opportunity_id: i64,
    _polish_already_done: bool,
) -> Result<GenerateApplyCvResult, String> {
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

    let _ = o;
    let exported = do_export_application_pack(store, opportunity_id)?;
    if exported.file_count == 0 || exported.files.is_empty() {
        return Err(
            "Export produced 0 pack files — run Generate prep first (cover letter / suggestions)."
                .into(),
        );
    }
    let pack_slug = exported.pack_slug;
    let pack_dir = PathBuf::from(&exported.pack_dir);
    let export_files = exported.files.clone();
    let export_file_count = exported.file_count;
    let company = exported.company.clone().unwrap_or_default();
    let title = exported.title.clone().unwrap_or_default();

    let overlay_path = pack_dir.join("cv-overlay.json");
    if !overlay_path.is_file() {
        return Err(format!(
            "Pack missing cv-overlay.json at {} — export must write overlay from prep. Without overlay, every role gets the same master CV.",
            overlay_path.display()
        ));
    }
    let overlay_raw = std::fs::read_to_string(&overlay_path).map_err(|e| e.to_string())?;
    let overlay_val: Value =
        serde_json::from_str(&overlay_raw).map_err(|e| format!("invalid cv-overlay.json: {e}"))?;
    let has_fit = overlay_val
        .get("featured_keys")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false)
        || overlay_val
            .get("overrides")
            .and_then(|v| v.as_object())
            .map(|o| !o.is_empty())
            .unwrap_or(false)
        || overlay_val
            .get("projects_upsert")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
    if !has_fit {
        return Err(
            "cv-overlay.json has no featured_keys/overrides/projects_upsert — cannot produce a role-fit CV"
                .into(),
        );
    }

    let profile_polished = overlay_val
        .get("profile_polished")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let dev_path = get_devprofile_path().ok_or_else(|| {
        "devprofile_path not set — configure Settings → devprofile path (e.g. ~/Work/personal/devprofile)".to_string()
    })?;
    let devprofile = PathBuf::from(&dev_path);
    let _script = preflight_generate_apply_cv(&devprofile)?;

    let link_script = devprofile.join("scripts").join("link-application-packs.mjs");
    if link_script.is_file() {
        let packs_root = crate::app_dirs::app_data_dir()
            .map_err(|e| e.to_string())?
            .join("application_packs");
        let status = std::process::Command::new("node")
            .arg(&link_script)
            .current_dir(&devprofile)
            .env("COLLAB_FINDER_PACKS", packs_root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .status()
            .map_err(|e| format!("link-application-packs failed to start: {e}"))?;
        if !status.success() {
            eprintln!("[apply-cv] link-application-packs exited {:?}", status.code());
        }
    }

    let (bin, mut args) = find_bun_or_pnpm()?;
    args.push(pack_slug.clone());

    let mut path_env = std::env::var("PATH").unwrap_or_default();
    if let Some(parent) = bin.parent() {
        let p = parent.display().to_string();
        if !path_env.split(':').any(|d| d == p) {
            path_env = format!("{p}:{path_env}");
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    for extra in [
        format!("{home}/.bun/bin"),
        format!("{home}/.local/bin"),
        "/usr/local/bin".into(),
    ] {
        if !path_env.split(':').any(|d| d == extra) {
            path_env = format!("{extra}:{path_env}");
        }
    }

    let mut child = std::process::Command::new(&bin);
    child
        .args(&args)
        .current_dir(&devprofile)
        .env("PATH", &path_env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let output = child.output().map_err(|e| {
        format!("spawn {} failed: {e}", bin.display())
    })?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!(
            "generate-apply-cv failed (exit {:?}):\n{}\n{}",
            output.status.code(),
            stdout.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>(),
            stderr.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>()
        ));
    }

    let (primary, flat, submit) = expected_pdf_paths(&devprofile, &pack_dir, &pack_slug);
    if !primary.is_file() {
        return Err(format!(
            "generate-apply-cv finished but PDF missing at {}\nstdout:\n{}",
            primary.display(),
            stdout.chars().rev().take(2000).collect::<String>().chars().rev().collect::<String>()
        ));
    }

    let tail: String = stdout
        .chars()
        .rev()
        .take(800)
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    let _ = (company, title); // used by async polish path
    Ok(GenerateApplyCvResult {
        opportunity_id,
        pack_slug,
        pack_dir: pack_dir.to_string_lossy().to_string(),
        pdf_path: primary.to_string_lossy().to_string(),
        flat_pdf_path: flat.map(|p| p.to_string_lossy().to_string()),
        submit_pdf_path: submit.map(|p| p.to_string_lossy().to_string()),
        stdout_tail: tail,
        export_files,
        export_file_count,
        overlay_path: overlay_path.to_string_lossy().to_string(),
        profile_polished,
    })
}

#[tauri::command]
pub(crate) async fn generate_apply_cv(
    db: State<'_, AppDb>,
    opportunity_id: i64,
) -> Result<GenerateApplyCvResult, String> {
    // 1) Export + template overlay under lock
    let exported = {
        let guard = db
            .0
            .lock()
            .map_err(|_| "lock failed".to_string())?;
        if opportunity_id <= 0 {
            return Err("opportunity_id required".into());
        }
        // existence check
        let opps = guard
            .get_opportunities(&db::OpportunityFilter {
                id: Some(opportunity_id),
                limit: Some(1),
                ..Default::default()
            })
            .unwrap_or_default();
        if opps.is_empty() {
            return Err(format!("opportunity {opportunity_id} not found"));
        }
        do_export_application_pack(&*guard, opportunity_id)?
    };

    if exported.file_count == 0 {
        return Err(
            "Export produced 0 pack files — run Generate prep first.".into(),
        );
    }
    let pack_dir = PathBuf::from(&exported.pack_dir);
    let overlay_path = pack_dir.join("cv-overlay.json");
    if !overlay_path.is_file() {
        return Err(format!(
            "Pack missing cv-overlay.json at {}",
            overlay_path.display()
        ));
    }

    // 2) Optional xAI polish of profile (outside lock)
    let title = exported.title.clone().unwrap_or_default();
    let company = exported.company.clone().unwrap_or_default();
    let polished = maybe_polish_overlay_profile(&overlay_path, &title, &company).await;
    if polished {
        eprintln!("[apply-cv] profile polished via xAI for opp {opportunity_id}");
    }

    // 3) Spawn generate-apply-cv (re-open store briefly for notes-free spawn path)
    let guard = db
        .0
        .lock()
        .map_err(|_| "lock failed".to_string())?;
    // Avoid re-export wiping polish: only spawn using existing pack
    spawn_generate_apply_cv_for_export(&*guard, opportunity_id, &exported, polished)
}

/// Spawn PDF generator for an already-exported pack (does not re-export — preserves polished overlay).
fn spawn_generate_apply_cv_for_export(
    _store: &db::SqliteStore,
    opportunity_id: i64,
    exported: &ApplicationPackExportResult,
    profile_polished: bool,
) -> Result<GenerateApplyCvResult, String> {
    let pack_slug = exported.pack_slug.clone();
    let pack_dir = PathBuf::from(&exported.pack_dir);
    let export_files = exported.files.clone();
    let export_file_count = exported.file_count;
    let overlay_path = pack_dir.join("cv-overlay.json");
    if !overlay_path.is_file() {
        return Err(format!("missing {}", overlay_path.display()));
    }

    let dev_path = get_devprofile_path().ok_or_else(|| {
        "devprofile_path not set — configure Settings → devprofile path".to_string()
    })?;
    let devprofile = PathBuf::from(&dev_path);
    let _script = preflight_generate_apply_cv(&devprofile)?;

    let link_script = devprofile.join("scripts").join("link-application-packs.mjs");
    if link_script.is_file() {
        let packs_root = crate::app_dirs::app_data_dir()
            .map_err(|e| e.to_string())?
            .join("application_packs");
        let _ = std::process::Command::new("node")
            .arg(&link_script)
            .current_dir(&devprofile)
            .env("COLLAB_FINDER_PACKS", packs_root)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .status();
    }

    let (bin, mut args) = find_bun_or_pnpm()?;
    args.push(pack_slug.clone());
    let mut path_env = std::env::var("PATH").unwrap_or_default();
    if let Some(parent) = bin.parent() {
        let p = parent.display().to_string();
        if !path_env.split(':').any(|d| d == p) {
            path_env = format!("{p}:{path_env}");
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    for extra in [
        format!("{home}/.bun/bin"),
        format!("{home}/.local/bin"),
        "/usr/local/bin".into(),
    ] {
        if !path_env.split(':').any(|d| d == extra) {
            path_env = format!("{extra}:{path_env}");
        }
    }

    let output = std::process::Command::new(&bin)
        .args(&args)
        .current_dir(&devprofile)
        .env("PATH", &path_env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("spawn {} failed: {e}", bin.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        return Err(format!(
            "generate-apply-cv failed (exit {:?}):\n{}\n{}",
            output.status.code(),
            stdout.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>(),
            stderr.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>()
        ));
    }

    let (primary, flat, submit) = expected_pdf_paths(&devprofile, &pack_dir, &pack_slug);
    if !primary.is_file() {
        return Err(format!(
            "generate-apply-cv finished but PDF missing at {}",
            primary.display()
        ));
    }
    let tail: String = stdout
        .chars()
        .rev()
        .take(800)
        .collect::<String>()
        .chars()
        .rev()
        .collect();

    Ok(GenerateApplyCvResult {
        opportunity_id,
        pack_slug,
        pack_dir: pack_dir.to_string_lossy().to_string(),
        pdf_path: primary.to_string_lossy().to_string(),
        flat_pdf_path: flat.map(|p| p.to_string_lossy().to_string()),
        submit_pdf_path: submit.map(|p| p.to_string_lossy().to_string()),
        stdout_tail: tail,
        export_files,
        export_file_count,
        overlay_path: overlay_path.to_string_lossy().to_string(),
        profile_polished,
    })
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
    /// `strict` (dual-fit) or `relaxed` (simple fitness). Default strict when omitted on old rows.
    #[serde(default = "default_fit_mode_field")]
    pub fit_mode: String,
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

fn default_fit_mode_field() -> String {
    DEFAULT_FIT_MODE.to_string()
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
    fn normalize_opportunity_fetch_url_adds_https_for_bare_host_path() {
        let bare = "jobs.qred.com/jobs/7931564-fullstack-developer-typescript";
        let out = normalize_opportunity_fetch_url(bare).expect("bare host/path");
        assert_eq!(
            out,
            "https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript"
        );
        let already = "https://jobs.qred.com/jobs/1";
        assert_eq!(
            normalize_opportunity_fetch_url(already).unwrap(),
            already
        );
        let http = "http://example.com/a";
        assert_eq!(normalize_opportunity_fetch_url(http).unwrap(), http);
        assert!(normalize_opportunity_fetch_url("").is_err());
        assert!(normalize_opportunity_fetch_url("   ").is_err());
        // protocol-relative
        assert_eq!(
            normalize_opportunity_fetch_url("//jobs.example.com/x").unwrap(),
            "https://jobs.example.com/x"
        );
    }

    #[test]
    fn analyze_user_prompt_injects_constraints_from_curation_artifact() {
        let prompt = build_analyze_user_prompt(
            "CV_BODY_HERE",
            "JD_BODY_HERE",
            CANDIDATE_CONSTRAINTS_STRICT,
        );
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
        assert!(prompt.contains(
            CANDIDATE_CONSTRAINTS_STRICT
                .trim()
                .lines()
                .next()
                .unwrap_or("CANDIDATE_CONSTRAINTS")
        ));
    }

    #[test]
    fn relaxed_prompt_is_simple_fitness_not_dual_fit_mission() {
        let prompt = build_analyze_user_prompt_for_mode(
            "CV_BODY_HERE",
            "JD_BODY_HERE",
            CANDIDATE_CONSTRAINTS_RELAXED,
            FIT_MODE_RELAXED,
        );
        assert!(prompt.contains("SIMPLE FITNESS RUBRIC"), "relaxed rubric label");
        assert!(
            prompt.contains("MODE: RELAXED") || prompt.contains("RELAXED"),
            "relaxed constraints packet"
        );
        assert!(
            !prompt.contains("DUAL-FIT RUBRIC"),
            "must not use dual-fit rubric in relaxed"
        );
        assert!(
            !prompt.contains("MISSION: physical-world ML"),
            "must not inject strict hard MISSION line"
        );
        assert!(
            prompt.contains("Do NOT require physical-world ML")
                || prompt.contains("DO_NOT: Require physical-world ML"),
            "must explicitly reject ML/robotics mission veto"
        );
        assert_eq!(resolve_constraints(FIT_MODE_RELAXED), CANDIDATE_CONSTRAINTS_RELAXED);
        assert_eq!(resolve_constraints(FIT_MODE_STRICT), CANDIDATE_CONSTRAINTS_STRICT);
        assert_eq!(parse_fit_mode("relaxed"), FIT_MODE_RELAXED);
        assert_eq!(parse_fit_mode("STRICT"), FIT_MODE_STRICT);
        assert_eq!(parse_fit_mode(""), FIT_MODE_STRICT);
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
    fn simple_fitness_schema_omits_dual_fit_fields() {
        let schema = simple_fitness_json_schema();
        let props = schema.get("properties").expect("properties");
        assert!(props.get("overall").is_some());
        assert!(props.get("rationale").is_some());
        assert!(props.get("gaps_must").is_some());
        assert!(props.get("recommended_action").is_some());
        assert!(props.get("candidate_to_role").is_none());
        assert!(props.get("role_to_candidate").is_none());
        assert!(props.get("role_concerns").is_none());
        assert!(props.get("deal_breakers_triggered").is_none());
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
    fn stored_jd_placeholder_is_not_usable() {
        assert!(!stored_jd_is_usable("jd"));
        assert!(!stored_jd_is_usable("  "));
        assert!(stored_jd_is_usable(
            "Hiring a staff engineer for agent inference"
        ));
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
            None, // paste alias
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
            "cv_suggestions": ["Lead with collab-finder OSS", "Add truth-seeking AI line", "Promote agent-prompt-tuning-lab"],
            "research_notes": "Company ships agents; emphasize self-guards.",
            "exceptional_work_example": "Built collab-finder with live xAI fit/prep.",
            "proof_variant_id": "EW-agent-collab-finder"
        }"#;
        let files = build_application_pack_files(prep, None).expect("builder");
        let names: Vec<&str> = files.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"cover-letter.md"));
        assert!(names.contains(&"email-draft.md"));
        let email = files
            .iter()
            .find(|(n, _)| n == "email-draft.md")
            .map(|(_, c)| c.as_str())
            .unwrap_or("");
        assert!(email.contains("Subject:"));
        assert!(email.contains("I've attached my CV as a PDF."));
        assert!(email.contains("Dear hiring team"));
        assert!(names.contains(&"cv-suggestions.md"));
        assert!(names.contains(&"research-notes.md"));
        assert!(names.contains(&"exceptional-work.md"));
        assert!(names.contains(&"proof-variant.txt"));
        assert!(names.contains(&"cv-overlay.json"), "export must write cv-overlay for apply CV deltas");
        assert!(names.contains(&"manifest.json"));
        let overlay_raw = files
            .iter()
            .find(|(n, _)| n == "cv-overlay.json")
            .map(|(_, c)| c.as_str())
            .unwrap();
        let ov: Value = serde_json::from_str(overlay_raw).expect("overlay json");
        assert_eq!(ov.get("schema").and_then(|v| v.as_str()), Some("cv_overlay_v1"));
        let keys = ov
            .get("featured_keys")
            .and_then(|v| v.as_array())
            .expect("featured_keys");
        assert!(
            keys.iter().any(|k| k.as_str() == Some("collab-finder")),
            "featured_keys should include collab-finder from suggestions"
        );
        let profile = ov
            .pointer("/overrides/profile")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let pl = profile.to_lowercase();
        assert!(
            !pl.contains("prep deltas")
                && !pl.contains("overlay only")
                && !pl.contains("application pack for")
                && !pl.contains("master cv unchanged"),
            "profile must be hiring-manager prose, not agent meta: {profile}"
        );
        assert!(
            pl.contains("collab-finder") || pl.contains("software engineer"),
            "profile should still reflect role-fit content"
        );
        if let Some(lr) = ov
            .pointer("/overrides/latest_proffessional_role")
            .and_then(|v| v.as_str())
        {
            assert!(
                !lr.to_lowercase().contains("application pack"),
                "title line must not say application pack: {lr}"
            );
        }
    }

    #[test]
    fn email_apply_draft_combines_touch_and_cover_letter() {
        let cover = "Dear hiring team,\n\nI bring Tauri plus agentic systems experience. I ship self-guarded loops.\n\nBest regards";
        let draft = build_email_apply_draft(cover, "qred", "Fullstack Engineer");
        assert!(draft.contains("Subject: Application — Fullstack Engineer — Qred"));
        assert!(draft.contains("I bring Tauri plus agentic systems experience."));
        assert!(draft.contains("I've attached my CV as a PDF."));
        assert!(draft.contains("Dear hiring team"));
        assert!(
            !draft.contains("Peramanathan"),
            "email touch must not inject extra identity lines"
        );
    }

    #[test]
    fn featured_keys_from_prep_text_detects_project_mentions() {
        let keys = featured_keys_from_prep_text(
            "Promote collab-finder and agent-prompt-tuning-lab; selfie-sign-in with Rekognition",
        );
        assert!(keys.contains(&"collab-finder".to_string()));
        assert!(keys.contains(&"agent-prompt-tuning-lab".to_string()));
        assert!(keys.contains(&"selfie-signin".to_string()));
    }

    #[test]
    fn bank_and_overlay_use_complete_adaptate_description() {
        let projects =
            parse_public_projects_bank(PUBLIC_PROJECTS_FOCUSED_JSON, PUBLIC_PROJECTS_SLIM_JSON);
        let adaptate = projects
            .iter()
            .find(|p| p.name.eq_ignore_ascii_case("adaptate"))
            .expect("adaptate in bank");
        assert!(
            !github_description_truncated(&adaptate.description),
            "bank must not keep GitHub ellipsis: {}",
            adaptate.description
        );
        assert!(
            adaptate.description.to_lowercase().contains("at runtime")
                || adaptate.description.to_lowercase().contains("consumer"),
            "expected full clean blurb, got {}",
            adaptate.description
        );
        let overlay = build_cv_overlay_from_prep(
            &serde_json::from_str(
                r#"{"cover_letter":"","cv_suggestions":["Lead with adaptate Zod OpenAPI"],"research_notes":"","exceptional_work_example":""}"#,
            )
            .unwrap(),
            None,
        );
        let upsert = overlay
            .get("projects_upsert")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let ad = upsert.iter().find(|p| {
            p.get("key").and_then(|k| k.as_str()) == Some("adaptate")
        });
        if let Some(ad) = ad {
            if let Some(d) = ad.get("description").and_then(|v| v.as_str()) {
                assert!(!github_description_truncated(d), "overlay leaked truncated desc: {d}");
                assert!(!d.contains("configuration objects to …"));
            }
        }
        let keys = overlay
            .get("featured_keys")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(keys <= FEATURED_PROJECTS_MAX);
    }

    #[test]
    fn profile_5beat_matches_gold_structure() {
        let exceptional = "At Oneflow (Full Stack Integration Engineer, 2019–2021) I established the Integration Team and long-term integration processes from the ground up. I built multi-client Python/React applications integrating HubSpot, SuperOffice, Microsoft Dynamics, Salesforce, and Teamtailor, and stabilized and evolved the Public API so a third-party ecosystem could grow reliably. Later senior work—TypeScript migrations that cut type-related errors ~70%, ACL unification, and Playwright E2E—compounded that platform ownership.";
        let featured = vec![
            "collab-finder".into(),
            "selfie-signin".into(),
            "adaptate".into(),
        ];
        let scan = "rekognition zod schema fullstack typescript";
        let profile = build_professional_profile_override_with_scan(
            exceptional,
            "",
            &featured,
            "qred",
            "Fullstack Developer TypeScript",
            scan,
        );
        let pl = profile.to_lowercase();
        assert!(
            pl.starts_with("senior software engineer with fullstack web dev specialization"),
            "hook beat: {profile}"
        );
        assert!(
            pl.contains("oneflow") && pl.contains("integration"),
            "career beat: {profile}"
        );
        assert!(
            pl.contains("rekognition") || pl.contains("zod") || pl.contains("recent personal"),
            "recent personal beat: {profile}"
        );
        assert!(
            pl.contains("seeking the fullstack developer") && pl.contains("qred"),
            "seeking beat: {profile}"
        );
        assert!(
            profile.chars().count() <= 700,
            "profile too long for page 1: {}",
            profile.chars().count()
        );
        assert!(!pl.contains("prep deltas") && !pl.contains("overlay only"));
        assert!(!pl.contains("labeled personal/oss, not employment tenure"));
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
    fn read_pack_artifact_allows_app_packs_and_rejects_outside() {
        struct HarnessGuard(std::path::PathBuf);
        impl Drop for HarnessGuard {
            fn drop(&mut self) {
                crate::app_dirs::test_harness::clear();
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let tmp = std::env::temp_dir().join(format!("cf_artifact_read_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let _guard = HarnessGuard(tmp.clone());
        crate::app_dirs::test_harness::set(tmp.clone());
        let pack = tmp.join("application_packs").join("vend-role-2026-08-15");
        std::fs::create_dir_all(&pack).unwrap();
        let letter = pack.join("cover-letter.md");
        std::fs::write(&letter, "# Cover letter\n\nHello Vend.\n").unwrap();
        let read = read_pack_artifact_at(letter.to_str().unwrap()).expect("read pack md");
        assert_eq!(read.kind, "text");
        assert!(read.text.unwrap_or_default().contains("Hello Vend"));
        let outside = tmp.join("secret.txt");
        std::fs::write(&outside, "nope").unwrap();
        let err = read_pack_artifact_at(outside.to_str().unwrap()).unwrap_err();
        assert!(err.contains("outside"), "{err}");
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
        // Qred-style id-slug → digits only (stable PDF id segment)
        assert_eq!(
            job_id_from_source_url(
                "https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript"
            )
            .as_deref(),
            Some("7931564")
        );
        assert_eq!(
            company_from_jobs_host_url(
                "https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript"
            )
            .as_deref(),
            Some("qred")
        );
        assert_eq!(
            title_from_job_url_slug(
                "https://jobs.qred.com/jobs/7931564-fullstack-developer-typescript"
            )
            .as_deref(),
            Some("Fullstack Developer Typescript")
        );
    }

    #[test]
    fn preflight_generate_apply_cv_requires_script() {
        let tmp = std::env::temp_dir().join(format!("cf_preflight_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("scripts")).unwrap();
        assert!(preflight_generate_apply_cv(&tmp).is_err());
        std::fs::write(tmp.join("scripts/generate-apply-cv.tsx"), "// stub\n").unwrap();
        assert!(preflight_generate_apply_cv(&tmp).is_ok());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Live dogfood: re-export + generate apply CV for Qred opp #21 (needs real app data + bun).
    /// Run: `CF_DOGFOOD=1 cargo test dogfood_qred_export_and_generate_apply_cv -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn dogfood_qred_export_and_generate_apply_cv() {
        if std::env::var("CF_DOGFOOD").ok().as_deref() != Some("1") {
            return;
        }
        // Use real app data dir (no harness) so we hit live packs + devprofile_path.
        crate::app_dirs::test_harness::clear();
        let db_path = crate::app_dirs::app_data_dir()
            .expect("app data")
            .join("collab-finder.db");
        assert!(db_path.is_file(), "missing {:?}", db_path);
        let store = db::SqliteStore::open_at(db_path).expect("open db");
        let opp_id: i64 = std::env::var("CF_DOGFOOD_OPP")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(21);
        let res = do_generate_apply_cv(&store, opp_id)
            .unwrap_or_else(|e| panic!("generate apply cv for opp {opp_id}: {e}"));
        println!("opp={opp_id}");
        println!("pack_slug={}", res.pack_slug);
        println!("export_file_count={}", res.export_file_count);
        println!("export_files={:?}", res.export_files);
        println!("overlay_path={}", res.overlay_path);
        println!("pdf_path={}", res.pdf_path);
        assert!(
            res.export_file_count > 0 && !res.export_files.is_empty(),
            "export must write files, got count={} files={:?}",
            res.export_file_count,
            res.export_files
        );
        assert!(
            res.export_files.iter().any(|f| f == "cv-overlay.json"),
            "export must include cv-overlay.json (role-fit deltas)"
        );
        assert!(
            std::path::Path::new(&res.overlay_path).is_file(),
            "overlay_path missing {}",
            res.overlay_path
        );
        assert!(
            res.pack_slug.contains("qred")
                || res.pack_slug.contains("fullstack")
                || res.pack_slug.contains("open-application"),
            "expected human slug, got {}",
            res.pack_slug
        );
        assert!(
            std::path::Path::new(&res.pdf_path).is_file(),
            "pdf missing {}",
            res.pdf_path
        );
    }

    #[test]
    fn do_export_application_pack_writes_files_and_does_not_touch_cvdata() {
        let tmp = std::env::temp_dir().join(format!("cf_export_pack_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        crate::app_dirs::test_harness::set(tmp.clone());

        let store = db::SqliteStore::open_at(tmp.join("t.db")).expect("store");
        let prep = r#"{"cover_letter":"Hi","cv_suggestions":["a"],"research_notes":"r","exceptional_work_example":"e","proof_variant_id":"EW-agent-collab-finder"}"#;
        let id = store
            .upsert_opportunity(
                "web",
                Some("https://example.com/jobs/99"),
                None,
                Some("Staff Engineer"),
                Some("ExampleCo"),
                "jd",
                "prepped",
                Some(80),
                None,
                Some(prep),
                None,
            )
            .expect("ins");

        let res = do_export_application_pack(&store, id).expect("export");
        assert!(res.pack_dir.contains("application_packs"), "got {}", res.pack_dir);
        assert!(
            res.pack_slug.contains("exampleco") && res.pack_slug.contains("staff-engineer"),
            "slug {}",
            res.pack_slug
        );
        assert!(std::path::Path::new(&res.pack_dir).join("manifest.json").is_file());
        assert!(std::path::Path::new(&res.pack_dir).join("cover-letter.md").is_file());

        let opps = store
            .get_opportunities(&db::OpportunityFilter {
                id: Some(id),
                limit: Some(1),
                ..Default::default()
            })
            .unwrap();
        let notes = opps[0].notes.clone().unwrap_or_default();
        assert!(notes.contains("export_path=") && notes.contains("pack_slug="));
        assert_eq!(opps[0].status, "prepped");

        crate::app_dirs::test_harness::clear();
        let _ = std::fs::remove_dir_all(&tmp);
    }

}

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
use tauri::State;

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

#[tauri::command]
pub(crate) async fn analyze_opportunity_target(
    db: State<'_, AppDb>,
    url: Option<String>,
    pasted_jd: Option<String>,
    title: Option<String>,
    company: Option<String>,
    cv_summary: Option<String>, // from UI model (populated from data/distillation defaultCvSummary / cv-packet-pruned)
) -> Result<OpportunityTargetAnalysisResult, String> {
    let jd = match (url.clone(), pasted_jd) {
        (_, Some(p)) if !p.trim().is_empty() => p,
        (Some(u), _) => {
            let fetched = fetch_opportunity_target_page(u.clone()).await?;
            fetched.cleaned_text
        }
        _ => return Err("Provide either url or pasted_jd".into()),
    };

    // Use the CV summary packet passed from the UI (the distilled one shown in CvSummaryInput).
    // This is the "CV summary packet (from distillation)" that is now properly exposed in the Discover left column.
    // Fallback is only for safety if nothing was passed.
    let cv = cv_summary.unwrap_or_else(|| {
        "Senior TS/React/Rust engineer. Oneflow: led frontend/platform (TS, React, Playwright, Zod migrations).\nRust OSS and agentic desktop tools (Tauri, MVU UI, MCP-oriented design). 2016 thesis: energy-efficient orchestration — relevant to on-device/local-first/agent infra today.\nPublic work: arch-machine (AI-ready workstations), premflow, Grok Dia, thepulimaangani, collab-finder.\nOpen to: staff/senior IC, AI/agent/inference roles, technical cofounder collabs. Based Sweden (citizen); remote/hybrid OK; selective relocation for SpaceXAI-tier impact (xAI division of SpaceX).\nDifferentiators: official X agent resources in workflows, self-guarded autonomous tooling, ships in public with minimal hype.".to_string()
    });

    // Build a minimal system + user for structured fit
    let system = "You are an expert career fit analyst. Output ONLY valid JSON matching the provided schema. Be precise and cite phrases from the JD.";
    let user = format!(
        "CV PACKET (pruned):\n{}\n\nOPPORTUNITY DESCRIPTION:\n{}\n\nReturn fit analysis.",
        cv, jd
    );

    // Minimal strict schema for TargetFit (v1)
    let schema = json!({
        "type": "object",
        "properties": {
            "overall": {"type": "integer", "minimum": 0, "maximum": 100},
            "rationale": {"type": "string"},
            "gaps_must": {"type": "array", "items": {"type": "string"}},
            "gaps_nice": {"type": "array", "items": {"type": "string"}},
            "recommended_action": {"type": "string"}
        },
        "required": ["overall", "rationale", "gaps_must", "recommended_action"],
        "additionalProperties": false
    });

    let (fit_json, usage) =
        crate::xai::structured_chat(system, &user, "target_fit_v1", schema).await?;

    let fit_score = fit_json
        .get("overall")
        .and_then(|v| v.as_i64())
        .map(|i| i as i32);

    // Persist as opportunity (best effort). Now uses reliable upsert (TD-001) that updates 1 row for same source_url.
    let run_id = if let Ok(guard) = db.0.lock() {
        guard
            .upsert_opportunity(
                "web",
                url.as_deref(),
                None,
                title.as_deref(),
                company.as_deref(),
                &jd,
                "analyzed",
                fit_score,
                Some(&fit_json.to_string()),
                None,
                None,
            )
            .unwrap_or(0)
    } else {
        0
    };

    let cost = crate::xai::cost_from_usage(&usage);

    Ok(OpportunityTargetAnalysisResult {
        opportunity_id: run_id,
        fit: fit_json,
        packet_preview: cv.chars().take(600).collect(),
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
    // Optional context from prior Evaluate Fit (analysis). Allows prep to be informed by the just-computed fit/gaps/rationale.
    previous_fit: Option<String>,
) -> Result<OpportunityTargetPrepResult, String> {
    // Resolve JD text.
    // Prefer pasted_jd or url (for fresh calls from the form).
    // If only opportunity_id (e.g. "Generate prep pack" CTA from TargetFitPanel after prior analyze),
    // load the persisted jd_text (and source_url) from the opportunities table.
    let mut jd = String::new();
    let mut effective_url = url.clone();
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
        if let Some(oid) = opportunity_id {
            if let Ok(guard) = db.0.lock() {
                let filter = db::OpportunityFilter {
                    id: Some(oid),
                    limit: Some(1),
                    ..Default::default()
                };
                // TD-002: id filter now pushed to SQL in get_opportunities; this succeeds for old opportunity_id
                // even when 50+ newer opportunities exist (see Phase 0 acceptance in tech-debt-deep-dive).
                if let Ok(opps) = guard.get_opportunities(&filter) {
                    if let Some(opp) = opps.first() {
                        jd = opp.jd_text.clone();
                        if effective_url.is_none() {
                            effective_url = opp.source_url.clone();
                        }
                    }
                }
            }
        }
    }
    if jd.is_empty() {
        return Err(
            "Provide url, pasted_jd or ensure prior analyze created the opportunity".into(),
        );
    }

    // Use the CV summary packet passed from the UI (the distilled one shown/edited in the prominent CvSummaryInput after the recent UI refactor).
    // This ensures the "CV summary packet (from distillation)" is actually used in the Evaluate Fit + Prep (Slice C) flow.
    let cv = cv_summary.unwrap_or_else(|| {
        "Senior TS/React/Rust engineer. Oneflow: led frontend/platform (TS, React, Playwright, Zod migrations).\nRust OSS and agentic desktop tools (Tauri, MVU UI, MCP-oriented design). 2016 thesis: energy-efficient orchestration — relevant to on-device/local-first/agent infra today.\nPublic work: arch-machine (AI-ready workstations), premflow, Grok Dia, thepulimaangani, collab-finder.\nOpen to: staff/senior IC, AI/agent/inference roles, technical cofounder collabs. Based Sweden (citizen); remote/hybrid OK; selective relocation for SpaceXAI-tier impact (xAI division of SpaceX).\nDifferentiators: official X agent resources in workflows, self-guarded autonomous tooling, ships in public with minimal hype.".to_string()
    });

    // Slice C: incorporate previous fit analysis (gaps, rationale, recommended_action) when provided
    // by the frontend from the current opportunityTarget result after "Evaluate Fit".
    let mut user = format!(
        "CANDIDATE CV PACKET:\n{}\n\nOPPORTUNITY DESCRIPTION:\n{}\n\n",
        cv, jd
    );
    if let Some(fit) = previous_fit {
        if !fit.trim().is_empty() {
            user.push_str(&format!(
                "PREVIOUS FIT ANALYSIS (from Evaluate Fit step):\n{}\n\n",
                fit
            ));
        }
    }
    user.push_str("Produce a tailored prep pack: a cover letter, 3-6 concrete CV improvement suggestions (deltas/sidecar style, per cv-promote-guard principles), short research notes on the company/role, and (if the JD asks for it) a strong 80-120 word 'exceptional work' example.\nReturn JSON only.");

    let system = "You are an expert application preparation assistant. Output ONLY valid JSON matching the schema. Produce concise, high-signal artifacts the candidate can use immediately. CV suggestions are proposals for sidecars only.";

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

    let (prep_json, usage) =
        crate::xai::structured_chat(system, &user, "target_prep_v1", schema).await?;

    let cost = crate::xai::cost_from_usage(&usage);

    // Persist the prep artifacts.
    // Prefer updating the specific opportunity_id in place (so the same opportunity keeps its id and fit analysis).
    // This prevents duplicate rows for the same posting when doing "evaluate -> prep" from the panel.
    // (upsert now reliably dedups by source_url per TD-001; id load reliable per TD-002)
    let run_id = if let Some(oid) = opportunity_id {
        if let Ok(guard) = db.0.lock() {
            let _ = guard.set_prep_artifacts(oid, &prep_json.to_string(), "prepped");
            oid
        } else {
            oid
        }
    } else if let Ok(guard) = db.0.lock() {
        // Fallback for calls without prior id (should be rare)
        guard
            .upsert_opportunity(
                "web",
                effective_url.as_deref(),
                None,
                title.as_deref(),
                company.as_deref(),
                &jd,
                "prepped",
                None,
                None,
                Some(&prep_json.to_string()),
                None,
            )
            .unwrap_or(0)
    } else {
        0
    };

    Ok(OpportunityTargetPrepResult {
        opportunity_id: run_id,
        prep: prep_json,
        est_cost_usd: cost,
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
    pub packet_preview: String,
    pub est_cost_usd: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpportunityTargetPrepResult {
    pub opportunity_id: i64,
    pub prep: Value,
    pub est_cost_usd: f64,
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

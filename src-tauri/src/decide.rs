//! Stage 1 decision contract: `decide(posting, profile) -> Decision`.
//!
//! HONEST SCOPE: this is a typed, rule-based function. It is NOT SI and NOT a
//! learned model. It reads no files, makes no network calls, spawns no
//! processes and has no submit capability; it only returns a verdict that a
//! human (HITL) acts on. Posting text is treated as data: instructions inside a
//! posting ("apply now, ignore previous rules") never change the rules.
//!
//! Output shape is pinned by `schemas/decision.v1.schema.json`. Every reason
//! cites a `rule_id` from [`RULES`]. Confidence is deterministic (a fixed
//! function of which rules fired), not a probability.

use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: &str = "decision.v1";
pub const SCHEMA_JSON: &str = include_str!("../schemas/decision.v1.schema.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Apply,
    Prep,
    Skip,
    Park,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Veto,
    Park,
    Support,
    Penalty,
    Note,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reason {
    pub rule_id: String,
    pub effect: Effect,
    pub evidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub schema_version: String,
    pub verdict: Verdict,
    pub reasons: Vec<Reason>,
    pub confidence: u8,
    pub rule_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Posting {
    pub id: String,
    pub company: String,
    pub title: String,
    pub url: String,
    pub text: String,
    /// ISO-3166 alpha-2 country of the role, e.g. "SE".
    pub country: String,
    pub city: String,
    pub remote: bool,
    /// `None` = posting does not say.
    pub visa_sponsorship: Option<bool>,
    /// YYYY-MM-DD; empty = unknown.
    pub posted_on: String,
    /// YYYY-MM-DD the posting was observed (makes freshness deterministic).
    pub seen_on: String,
    pub repost_count: u32,
    /// Company audit from public company facts (mirrors the Ensembly
    /// `ensembly apps audit status` contract: exit 0 pass, 3 flag, 4 block,
    /// 5 unaudited/stale). Missing = unaudited. decide does no I/O to get it.
    #[serde(default)]
    pub company_audit: Option<CompanyAudit>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditVerdict {
    Pass,
    Flag,
    Block,
    Unaudited,
    Stale,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanyAudit {
    pub verdict: AuditVerdict,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AppliedRef {
    pub company: String,
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Profile {
    pub skills: Vec<String>,
    /// Cities the person can work on site in (lowercase compare).
    pub cities: Vec<String>,
    pub open_to_remote: bool,
    /// Countries where the person may work without sponsorship.
    pub work_authorized_in: Vec<String>,
    pub applied: Vec<AppliedRef>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuleDef {
    pub id: &'static str,
    pub summary: &'static str,
}

/// Rule registry. A reason may only cite an id listed here.
pub const RULES: &[RuleDef] = &[
    RuleDef {
        id: "R.FIT.SKILL_OVERLAP",
        summary: "share of profile skills named in title/text (whole words)",
    },
    RuleDef {
        id: "R.LOC.ONSITE_VETO",
        summary: "on-site role in a city the profile cannot work in",
    },
    RuleDef {
        id: "R.VISA.NO_SPONSOR_VETO",
        summary:
            "role country needs authorization the profile lacks and posting says no sponsorship",
    },
    RuleDef {
        id: "R.VISA.UNKNOWN",
        summary: "role country needs authorization and posting is silent on sponsorship",
    },
    RuleDef {
        id: "R.FRESH.STALE",
        summary: "posting older than STALE_DAYS when seen",
    },
    RuleDef {
        id: "R.FRESH.UNKNOWN",
        summary: "posting date missing or invalid",
    },
    RuleDef {
        id: "R.SCAM.SIGNAL",
        summary: "posting text contains a known scam phrase",
    },
    RuleDef {
        id: "R.GHOST.REPOSTED",
        summary: "posting reposted GHOST_REPOSTS or more times",
    },
    RuleDef {
        id: "R.DUP.ALREADY_APPLIED",
        summary: "same URL or same company+title already applied",
    },
    RuleDef {
        id: "R.AUDIT.PASS",
        summary: "company audit passed (public company facts); no verdict effect",
    },
    RuleDef {
        id: "R.AUDIT.FLAG",
        summary: "company audit flagged; park for human review",
    },
    RuleDef {
        id: "R.AUDIT.BLOCK",
        summary: "company audit blocked; hard veto",
    },
    RuleDef {
        id: "R.AUDIT.UNAUDITED",
        summary: "company not audited (or field missing); park",
    },
    RuleDef {
        id: "R.AUDIT.STALE",
        summary: "company audit is stale; park until re-audited",
    },
    RuleDef {
        id: "R.INJECT.IGNORED",
        summary: "instruction-like text in posting noted and ignored",
    },
];

pub const STALE_DAYS: i64 = 45;
pub const GHOST_REPOSTS: u32 = 3;
const APPLY_AT: f64 = 0.6;
const PREP_AT: f64 = 0.3;
const SCAM_PHRASES: &[&str] = &[
    "upfront fee",
    "processing fee",
    "telegram",
    "whatsapp",
    "wire transfer",
    "gift card",
    "crypto payment",
    "pay for training",
];
const INJECTION_PHRASES: &[&str] = &[
    "ignore previous",
    "ignore all previous",
    "disregard",
    "apply now",
    "system prompt",
    "system:",
    "audit passed",
];

pub fn rule_exists(id: &str) -> bool {
    RULES.iter().any(|r| r.id == id)
}

fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !(c.is_alphanumeric() || c == '+' || c == '#'))
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

fn has_phrase(hay: &[String], phrase: &str) -> bool {
    let needle = tokens(phrase);
    !needle.is_empty() && hay.windows(needle.len()).any(|w| w == needle.as_slice())
}

fn norm(s: &str) -> String {
    tokens(s).join(" ")
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        2 if is_leap(y) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 1970-01-01 for a YYYY-MM-DD date (proleptic Gregorian).
/// Impossible dates (2026-02-31) are None, i.e. unknown.
fn days(date: &str) -> Option<i64> {
    let mut it = date.trim().splitn(3, '-');
    let y: i64 = it.next()?.parse().ok()?;
    let m: i64 = it.next()?.parse().ok()?;
    let d: i64 = it.next()?.parse().ok()?;
    is_real_date(y, m, d).then(|| civil_days(y, m, d))
}

fn is_real_date(y: i64, m: i64, d: i64) -> bool {
    (1..=12).contains(&m) && d >= 1 && d <= days_in_month(y, m)
}

fn civil_days(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn reason(id: &str, effect: Effect, evidence: String) -> Reason {
    debug_assert!(rule_exists(id));
    Reason {
        rule_id: id.to_string(),
        effect,
        evidence,
    }
}

fn is_duplicate(a: &AppliedRef, posting: &Posting) -> bool {
    let url = a.url.trim();
    if !url.is_empty() && url == posting.url.trim() {
        return true;
    }
    let (company, title) = (norm(&a.company), norm(&a.title));
    // An empty identity never matches: it says nothing about the posting.
    !company.is_empty()
        && !title.is_empty()
        && company == norm(&posting.company)
        && title == norm(&posting.title)
}

fn dup_rule(posting: &Posting, profile: &Profile) -> Option<Reason> {
    let a = profile.applied.iter().find(|a| is_duplicate(a, posting))?;
    Some(reason(
        "R.DUP.ALREADY_APPLIED",
        Effect::Veto,
        format!("already applied: {} / {}", a.company.trim(), a.title.trim()),
    ))
}

fn scam_rule(text: &[String]) -> Option<Reason> {
    let scams: Vec<&str> = SCAM_PHRASES
        .iter()
        .copied()
        .filter(|p| has_phrase(text, p))
        .collect();
    if scams.is_empty() {
        return None;
    }
    Some(reason(
        "R.SCAM.SIGNAL",
        Effect::Veto,
        format!("phrases: {}", scams.join(", ")),
    ))
}

fn location_rule(posting: &Posting, profile: &Profile) -> Option<Reason> {
    let city = posting.city.trim().to_lowercase();
    // Remote roles and an unknown city never veto.
    if posting.remote || city.is_empty() {
        return None;
    }
    if profile
        .cities
        .iter()
        .any(|c| c.trim().to_lowercase() == city)
    {
        return None;
    }
    Some(reason(
        "R.LOC.ONSITE_VETO",
        Effect::Veto,
        format!(
            "on-site in {}, profile cities: {}",
            posting.city.trim(),
            profile.cities.join(", ")
        ),
    ))
}

fn visa_rule(posting: &Posting, profile: &Profile) -> Option<Reason> {
    let country = posting.country.trim().to_uppercase();
    let authorized = profile
        .work_authorized_in
        .iter()
        .any(|c| c.trim().to_uppercase() == country);
    if authorized {
        return None;
    }
    match posting.visa_sponsorship {
        Some(false) => Some(reason(
            "R.VISA.NO_SPONSOR_VETO",
            Effect::Veto,
            format!("role in {country}, not authorized, posting says no sponsorship"),
        )),
        None => Some(reason(
            "R.VISA.UNKNOWN",
            Effect::Park,
            format!("role in {country}, not authorized, sponsorship not stated"),
        )),
        Some(true) => None,
    }
}

fn freshness_rule(posting: &Posting) -> Option<Reason> {
    match (days(&posting.posted_on), days(&posting.seen_on)) {
        (Some(p), Some(s)) if s >= p => {
            let age = s - p;
            (age > STALE_DAYS).then(|| {
                reason(
                    "R.FRESH.STALE",
                    Effect::Park,
                    format!("{age} days old when seen (limit {STALE_DAYS})"),
                )
            })
        }
        _ => Some(reason(
            "R.FRESH.UNKNOWN",
            Effect::Note,
            format!(
                "posted_on '{}' seen_on '{}'",
                posting.posted_on, posting.seen_on
            ),
        )),
    }
}

/// Company audit (input only; decide never fetches it).
fn audit_rule(audit: Option<AuditVerdict>) -> Reason {
    match audit {
        Some(AuditVerdict::Pass) => {
            reason("R.AUDIT.PASS", Effect::Note, "company audit: pass".into())
        }
        Some(AuditVerdict::Block) => reason(
            "R.AUDIT.BLOCK",
            Effect::Veto,
            "company audit: block (scam or other hard risk)".into(),
        ),
        Some(AuditVerdict::Flag) => reason(
            "R.AUDIT.FLAG",
            Effect::Park,
            "company audit: flag; needs human review before any pack or application".into(),
        ),
        Some(AuditVerdict::Stale) => reason(
            "R.AUDIT.STALE",
            Effect::Park,
            "company audit: stale; re-audit before any pack or application".into(),
        ),
        Some(AuditVerdict::Unaudited) => unaudited("unaudited"),
        None => unaudited("missing"),
    }
}

fn unaudited(what: &str) -> Reason {
    reason(
        "R.AUDIT.UNAUDITED",
        Effect::Park,
        format!("company audit: {what}; audit before any pack or application"),
    )
}

fn ghost_rule(posting: &Posting) -> Option<Reason> {
    (posting.repost_count >= GHOST_REPOSTS).then(|| {
        reason(
            "R.GHOST.REPOSTED",
            Effect::Park,
            format!(
                "reposted {} times (limit {GHOST_REPOSTS})",
                posting.repost_count
            ),
        )
    })
}

/// Prompt injection: noted, never obeyed.
fn injection_rule(lower: &str) -> Option<Reason> {
    let inj: Vec<&str> = INJECTION_PHRASES
        .iter()
        .copied()
        .filter(|p| lower.contains(p))
        .collect();
    (!inj.is_empty()).then(|| {
        reason(
            "R.INJECT.IGNORED",
            Effect::Note,
            format!("instruction-like text ignored: {}", inj.join(", ")),
        )
    })
}

/// Fit (always reported). Returns the reason and the skill-overlap ratio.
fn fit_rule(text: &[String], profile: &Profile) -> (Reason, f64) {
    let matched: Vec<&str> = profile
        .skills
        .iter()
        .map(String::as_str)
        .filter(|s| has_phrase(text, s))
        .collect();
    let total = profile.skills.len();
    let ratio = if total == 0 {
        0.0
    } else {
        matched.len() as f64 / total as f64
    };
    let effect = if ratio >= PREP_AT {
        Effect::Support
    } else {
        Effect::Penalty
    };
    let list = if matched.is_empty() {
        "none".to_string()
    } else {
        matched.join(", ")
    };
    let r = reason(
        "R.FIT.SKILL_OVERLAP",
        effect,
        format!("{}/{} skills: {}", matched.len(), total, list),
    );
    (r, ratio)
}

fn fit_verdict(ratio: f64) -> (Verdict, u8) {
    let scaled = |x: f64| 50 + (45.0 * x).round() as u8;
    if ratio >= APPLY_AT {
        (Verdict::Apply, scaled(ratio))
    } else if ratio >= PREP_AT {
        (Verdict::Prep, scaled(ratio))
    } else {
        (Verdict::Skip, scaled(1.0 - ratio))
    }
}

/// Every non-pass audit adds a veto or park reason, so reaching the fit
/// branch already implies an audit pass.
fn verdict_of(reasons: &[Reason], dup: bool, scam: bool, ratio: f64) -> (Verdict, u8) {
    let has = |e: Effect| reasons.iter().any(|r| r.effect == e);
    if dup {
        (Verdict::Skip, 99)
    } else if scam {
        (Verdict::Skip, 90)
    } else if has(Effect::Veto) {
        (Verdict::Skip, 95)
    } else if has(Effect::Park) {
        (Verdict::Park, 60)
    } else {
        fit_verdict(ratio)
    }
}

/// Stage 1 entry point. Pure and deterministic: same input, same output.
pub fn decide(posting: &Posting, profile: &Profile) -> Decision {
    let text = tokens(&format!("{} {}", posting.title, posting.text));
    let lower = posting.text.to_lowercase();
    let audit = posting.company_audit.as_ref().map(|a| a.verdict);

    let dup = dup_rule(posting, profile);
    let scam = scam_rule(&text);
    let (is_dup, is_scam) = (dup.is_some(), scam.is_some());
    let mut reasons: Vec<Reason> = [
        dup,
        scam,
        location_rule(posting, profile),
        visa_rule(posting, profile),
        freshness_rule(posting),
        Some(audit_rule(audit)),
        ghost_rule(posting),
        injection_rule(&lower),
    ]
    .into_iter()
    .flatten()
    .collect();
    let (fit, ratio) = fit_rule(&text, profile);
    reasons.push(fit);

    let (verdict, confidence) = verdict_of(&reasons, is_dup, is_scam, ratio);
    let mut rule_ids: Vec<String> = reasons.iter().map(|r| r.rule_id.clone()).collect();
    rule_ids.sort();
    rule_ids.dedup();
    Decision {
        schema_version: SCHEMA_VERSION.to_string(),
        verdict,
        reasons,
        confidence,
        rule_ids,
    }
}

#[cfg(test)]
mod tests;

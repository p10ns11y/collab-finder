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

/// Days since 1970-01-01 for a YYYY-MM-DD date (proleptic Gregorian).
fn days(date: &str) -> Option<i64> {
    let mut it = date.trim().splitn(3, '-');
    let y: i64 = it.next()?.parse().ok()?;
    let m: i64 = it.next()?.parse().ok()?;
    let d: i64 = it.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

fn reason(id: &str, effect: Effect, evidence: String) -> Reason {
    debug_assert!(rule_exists(id));
    Reason {
        rule_id: id.to_string(),
        effect,
        evidence,
    }
}

/// Stage 1 entry point. Pure and deterministic: same input, same output.
pub fn decide(posting: &Posting, profile: &Profile) -> Decision {
    let mut reasons = Vec::new();
    let text = tokens(&format!("{} {}", posting.title, posting.text));
    let lower = posting.text.to_lowercase();

    // Duplicates.
    let dup = profile.applied.iter().find(|a| {
        (!a.url.is_empty() && a.url.trim() == posting.url.trim())
            || (norm(&a.company) == norm(&posting.company)
                && norm(&a.title) == norm(&posting.title))
    });
    if let Some(a) = dup {
        reasons.push(reason(
            "R.DUP.ALREADY_APPLIED",
            Effect::Veto,
            format!("already applied: {} / {}", a.company.trim(), a.title.trim()),
        ));
    }

    // Scam signals.
    let scams: Vec<&str> = SCAM_PHRASES
        .iter()
        .copied()
        .filter(|p| has_phrase(&text, p))
        .collect();
    if !scams.is_empty() {
        reasons.push(reason(
            "R.SCAM.SIGNAL",
            Effect::Veto,
            format!("phrases: {}", scams.join(", ")),
        ));
    }

    // Location / visa hard rules.
    let city = posting.city.trim().to_lowercase();
    if !posting.remote
        && !profile
            .cities
            .iter()
            .any(|c| c.trim().to_lowercase() == city)
    {
        reasons.push(reason(
            "R.LOC.ONSITE_VETO",
            Effect::Veto,
            format!(
                "on-site in {}, profile cities: {}",
                posting.city.trim(),
                profile.cities.join(", ")
            ),
        ));
    }
    let country = posting.country.trim().to_uppercase();
    let authorized = profile
        .work_authorized_in
        .iter()
        .any(|c| c.trim().to_uppercase() == country);
    if !authorized {
        match posting.visa_sponsorship {
            Some(false) => reasons.push(reason(
                "R.VISA.NO_SPONSOR_VETO",
                Effect::Veto,
                format!("role in {country}, not authorized, posting says no sponsorship"),
            )),
            None => reasons.push(reason(
                "R.VISA.UNKNOWN",
                Effect::Park,
                format!("role in {country}, not authorized, sponsorship not stated"),
            )),
            Some(true) => {}
        }
    }

    // Freshness.
    match (days(&posting.posted_on), days(&posting.seen_on)) {
        (Some(p), Some(s)) if s >= p => {
            let age = s - p;
            if age > STALE_DAYS {
                reasons.push(reason(
                    "R.FRESH.STALE",
                    Effect::Park,
                    format!("{age} days old when seen (limit {STALE_DAYS})"),
                ));
            }
        }
        _ => reasons.push(reason(
            "R.FRESH.UNKNOWN",
            Effect::Note,
            format!(
                "posted_on '{}' seen_on '{}'",
                posting.posted_on, posting.seen_on
            ),
        )),
    }

    // Ghost signal.
    if posting.repost_count >= GHOST_REPOSTS {
        reasons.push(reason(
            "R.GHOST.REPOSTED",
            Effect::Park,
            format!(
                "reposted {} times (limit {GHOST_REPOSTS})",
                posting.repost_count
            ),
        ));
    }

    // Prompt injection: noted, never obeyed.
    let inj: Vec<&str> = INJECTION_PHRASES
        .iter()
        .copied()
        .filter(|p| lower.contains(p))
        .collect();
    if !inj.is_empty() {
        reasons.push(reason(
            "R.INJECT.IGNORED",
            Effect::Note,
            format!("instruction-like text ignored: {}", inj.join(", ")),
        ));
    }

    // Fit (always reported).
    let matched: Vec<&str> = profile
        .skills
        .iter()
        .map(String::as_str)
        .filter(|s| has_phrase(&text, s))
        .collect();
    let total = profile.skills.len();
    let ratio = if total == 0 {
        0.0
    } else {
        matched.len() as f64 / total as f64
    };
    let fit_effect = if ratio >= PREP_AT {
        Effect::Support
    } else {
        Effect::Penalty
    };
    reasons.push(reason(
        "R.FIT.SKILL_OVERLAP",
        fit_effect,
        format!(
            "{}/{} skills: {}",
            matched.len(),
            total,
            if matched.is_empty() {
                "none".to_string()
            } else {
                matched.join(", ")
            }
        ),
    ));

    let has = |e: Effect| reasons.iter().any(|r| r.effect == e);
    let (verdict, confidence) = if dup.is_some() {
        (Verdict::Skip, 99)
    } else if !scams.is_empty() {
        (Verdict::Skip, 90)
    } else if has(Effect::Veto) {
        (Verdict::Skip, 95)
    } else if has(Effect::Park) {
        (Verdict::Park, 60)
    } else if ratio >= APPLY_AT {
        (Verdict::Apply, 50 + (45.0 * ratio).round() as u8)
    } else if ratio >= PREP_AT {
        (Verdict::Prep, 50 + (45.0 * ratio).round() as u8)
    } else {
        (Verdict::Skip, 50 + (45.0 * (1.0 - ratio)).round() as u8)
    };

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

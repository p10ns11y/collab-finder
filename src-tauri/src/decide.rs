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
pub const RULES: &[RuleDef] = &[];

pub fn rule_exists(id: &str) -> bool {
    RULES.iter().any(|r| r.id == id)
}

/// Stage 1 entry point. Pure and deterministic.
pub fn decide(_posting: &Posting, _profile: &Profile) -> Decision {
    Decision {
        schema_version: String::new(),
        verdict: Verdict::Skip,
        reasons: Vec::new(),
        confidence: 0,
        rule_ids: Vec::new(),
    }
}

#[cfg(test)]
mod tests;

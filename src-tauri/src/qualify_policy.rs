//! QUALIFY firm-weight prior.
//!
//! One logged stage outcome updates one firm when that outcome is allowed to teach.
//! The audit row is the undo record.
//! Interview and offer step +8. A rejection steps −8 only when the note is specific
//! feedback. Generic templates, paper screens with no tailored feedback, and empty
//! notes do not move the prior. Waiting, screening, ghost, and withdrawn do not either.
//!
//! Stored `fit_score` is never rewritten. This file is the policy, not a second prediction.
//! Keep the step, clamp, phrase lists, and missing-fit rule aligned with
//! `src/core/domain/qualify-policy.ts`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const QUALIFY_STEP: i32 = 8;
pub const QUALIFY_CLAMP: i32 = 40;
pub const FIT_QUALIFY_THRESHOLD: i32 = 70;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QualifyAudit {
    pub outcome_id: i64,
    pub firm_key: String,
    pub outcome_status: String,
    pub before: i32,
    pub after: i32,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct QualifyPolicy {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub firm_weights: BTreeMap<String, i32>,
    #[serde(default)]
    pub audit: Vec<QualifyAudit>,
}

fn default_version() -> u32 {
    1
}

impl Default for QualifyPolicy {
    fn default() -> Self {
        Self {
            version: 1,
            firm_weights: BTreeMap::new(),
            audit: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyResult {
    pub policy: QualifyPolicy,
    pub changed: bool,
    pub audit: Option<QualifyAudit>,
}

static DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_test_dir(dir: Option<PathBuf>) {
    *DIR_OVERRIDE.lock().expect("qualify dir") = dir;
}

fn policy_path() -> Result<PathBuf, String> {
    let dir = if let Some(d) = DIR_OVERRIDE.lock().expect("qualify dir").clone() {
        d
    } else {
        let base = dirs::config_dir().ok_or("no config dir")?;
        base.join("collab-finder")
    };
    Ok(dir.join("qualify-priors.json"))
}

pub fn firm_key(company: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in company.trim().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !out.is_empty() && !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

pub fn reward_delta(outcome: &str) -> Option<i32> {
    match outcome.trim().to_ascii_lowercase().as_str() {
        "rejected" => Some(-QUALIFY_STEP),
        "interview" | "offer" => Some(QUALIFY_STEP),
        _ => None,
    }
}

/// Named refuse set. Empty text, and any note that misses the allow set, is generic too.
/// Keep this list aligned with `GENERIC_REJECT_PHRASES` in qualify-policy.ts.
pub const GENERIC_REJECT_PHRASES: &[&str] = &[
    "position filled",
    "position has been filled",
    "position is filled",
    "role has been filled",
    "role is filled",
    "no longer available",
    "no longer accepting",
    "requisition closed",
    "auto-close",
    "automatically closed",
    "paper reject",
    "paper screen",
    "paper rejection",
    "no tailored feedback",
    "no feedback",
    "thank you for your interest",
    "thank you for applying",
    "thank you for your application",
    "other candidates",
    "not be moving forward",
    "not moving forward",
    "will not be proceeding",
    "high volume of applicants",
    "we regret to inform",
    "application was unsuccessful",
    "ashby paper",
];

/// Honest skill, fit, or stage reason. A hit here is specific even inside a template.
/// Keep this list aligned with `SPECIFIC_REJECT_PHRASES` in qualify-policy.ts.
pub const SPECIFIC_REJECT_PHRASES: &[&str] = &[
    "feedback:",
    "reject reason:",
    "rejected because",
    "not a fit",
    "not a match",
    "poor fit",
    "skill gap",
    "lacking experience",
    "lacking production",
    "hiring manager said",
    "did not meet the",
    "does not meet the",
    "overqualified",
    "underqualified",
    "too junior",
    "too senior",
    "failed the screen",
    "failed the interview",
    "technical bar",
    "your background in",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackClass {
    Generic,
    Specific,
}

pub fn normalize_feedback(raw: &str) -> String {
    let mut out = String::new();
    let mut prev_space = false;
    for c in raw.trim().chars() {
        let c = if c.is_ascii() {
            c.to_ascii_lowercase()
        } else {
            c
        };
        if c.is_ascii_alphanumeric() || c == ':' || c == '-' {
            out.push(c);
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim().to_string()
}

/// Generic unless the note contains one allow-list phrase. Empty notes are generic.
pub fn classify_reject_feedback(feedback: Option<&str>) -> FeedbackClass {
    let text = normalize_feedback(feedback.unwrap_or(""));
    if text.is_empty() {
        return FeedbackClass::Generic;
    }
    if SPECIFIC_REJECT_PHRASES
        .iter()
        .any(|phrase| text.contains(phrase))
    {
        return FeedbackClass::Specific;
    }
    FeedbackClass::Generic
}

/// Step that may be written. Negative rejects need specific feedback.
/// Interview and offer still use the stage step when the note is empty.
pub fn policy_delta(outcome: &str, feedback: Option<&str>) -> Option<i32> {
    let step = reward_delta(outcome)?;
    if step < 0 && classify_reject_feedback(feedback) != FeedbackClass::Specific {
        return None;
    }
    Some(step)
}

fn clamp(n: i32) -> i32 {
    n.clamp(-QUALIFY_CLAMP, QUALIFY_CLAMP)
}

fn replay(audit: &[QualifyAudit]) -> (BTreeMap<String, i32>, Vec<QualifyAudit>) {
    let mut weights = BTreeMap::new();
    let next = audit
        .iter()
        .map(|entry| {
            let before = weights.get(&entry.firm_key).copied().unwrap_or(0);
            let after = clamp(before + entry.delta);
            if after == 0 {
                weights.remove(&entry.firm_key);
            } else {
                weights.insert(entry.firm_key.clone(), after);
            }
            QualifyAudit {
                outcome_id: entry.outcome_id,
                firm_key: entry.firm_key.clone(),
                outcome_status: entry.outcome_status.clone(),
                before,
                after,
                delta: entry.delta,
            }
        })
        .collect();
    (weights, next)
}

/// Same rules as `applyOutcome` in qualify-policy.ts.
pub fn apply_outcome(
    policy: &QualifyPolicy,
    outcome_id: i64,
    company: Option<&str>,
    outcome_status: Option<&str>,
    feedback: Option<&str>,
) -> ApplyResult {
    let outcome = outcome_status.unwrap_or("").trim().to_ascii_lowercase();
    let key = firm_key(company.unwrap_or(""));
    let requested = policy_delta(&outcome, feedback);
    if let Some(existing) = policy.audit.iter().find(|row| row.outcome_id == outcome_id) {
        if requested.is_some()
            && !key.is_empty()
            && existing.outcome_status == outcome
            && existing.firm_key == key
            && existing.delta == requested.unwrap_or(0)
        {
            return ApplyResult {
                policy: policy.clone(),
                changed: false,
                audit: None,
            };
        }
    }

    let kept: Vec<QualifyAudit> = policy
        .audit
        .iter()
        .filter(|row| row.outcome_id != outcome_id)
        .cloned()
        .collect();

    if requested.is_none() || key.is_empty() {
        let changed = kept.len() != policy.audit.len();
        let (weights, audit) = replay(&kept);
        return ApplyResult {
            policy: QualifyPolicy {
                version: 1,
                firm_weights: weights,
                audit,
            },
            changed,
            audit: None,
        };
    }

    let mut provisional = kept;
    provisional.push(QualifyAudit {
        outcome_id,
        firm_key: key,
        outcome_status: outcome,
        before: 0,
        after: 0,
        delta: requested.unwrap_or(0),
    });
    let (weights, audit) = replay(&provisional);
    let last = audit.last().cloned();
    ApplyResult {
        policy: QualifyPolicy {
            version: 1,
            firm_weights: weights,
            audit,
        },
        changed: true,
        audit: last,
    }
}

pub fn qualifies(fit_score: Option<i32>, firm_weight: i32) -> bool {
    match fit_score {
        Some(score) => score.saturating_add(firm_weight) >= FIT_QUALIFY_THRESHOLD,
        None => firm_weight >= 0,
    }
}

pub fn first_weight(keys: &[String]) -> i32 {
    let policy = load();
    for key in keys {
        let slug = firm_key(key);
        if slug.is_empty() {
            continue;
        }
        if let Some(weight) = policy.firm_weights.get(&slug) {
            if *weight != 0 {
                return *weight;
            }
        }
    }
    0
}

fn load_from(path: &Path) -> Result<QualifyPolicy, String> {
    if !path.exists() {
        return Ok(QualifyPolicy::default());
    }
    let text = fs::read_to_string(path).map_err(|e| io_msg("qualify prior read failed", &e))?;
    serde_json::from_str(&text).map_err(|_| "qualify prior file is not valid json".to_string())
}

fn load() -> QualifyPolicy {
    match policy_path() {
        Ok(path) => load_from(&path).unwrap_or_default(),
        Err(_) => QualifyPolicy::default(),
    }
}

fn save(policy: &QualifyPolicy) -> Result<(), String> {
    let path = policy_path()?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| io_msg("qualify prior save failed", &e))?;
    }
    let text = serde_json::to_string_pretty(policy).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| io_msg("qualify prior save failed", &e))?;
    Ok(())
}

fn io_msg(prefix: &str, err: &io::Error) -> String {
    format!("{prefix}: {}", err.kind())
}

/// Persist one outcome update. Does not insert opportunity rows.
pub fn apply_logged_outcome(
    outcome_id: i64,
    company: Option<&str>,
    outcome_status: Option<&str>,
    feedback: Option<&str>,
) -> Result<ApplyResult, String> {
    let current = match policy_path() {
        Ok(path) => load_from(&path)?,
        Err(e) => return Err(e),
    };
    let result = apply_outcome(&current, outcome_id, company, outcome_status, feedback);
    if result.changed {
        save(&result.policy)?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct ResetDir;
    impl Drop for ResetDir {
        fn drop(&mut self) {
            set_test_dir(None);
        }
    }

    #[test]
    fn firm_key_and_rewards_match_the_ts_policy() {
        assert_eq!(firm_key("xAI"), "xai");
        assert_eq!(firm_key("  "), "");
        assert_eq!(reward_delta("waiting"), None);
        assert_eq!(reward_delta("withdrawn"), None);
        assert_eq!(reward_delta("rejected"), Some(-8));
        assert_eq!(reward_delta("offer"), Some(8));
    }

    const SPECIFIC: &str =
        "feedback: not a fit for the staff role; lacking production experience the panel asked about";

    #[test]
    fn one_specific_reject_is_reversible_and_idempotent() {
        let policy = QualifyPolicy::default();
        let first = apply_outcome(
            &policy,
            533,
            Some("Legora"),
            Some("rejected"),
            Some(SPECIFIC),
        );
        assert!(first.changed);
        let audit = first.audit.expect("audit");
        assert_eq!(audit.delta, -8);
        assert_eq!(audit.before, 0);
        assert_eq!(audit.after, -8);
        assert_eq!(first.policy.firm_weights.get("legora").copied(), Some(-8));

        let again = apply_outcome(
            &first.policy,
            533,
            Some("Legora"),
            Some("rejected"),
            Some(SPECIFIC),
        );
        assert!(!again.changed);
        assert_eq!(again.policy.firm_weights.get("legora").copied(), Some(-8));

        let cleared = apply_outcome(&first.policy, 533, Some("Legora"), Some(""), Some(SPECIFIC));
        assert!(cleared.changed);
        assert!(cleared.policy.firm_weights.get("legora").is_none());
        assert!(cleared.policy.audit.is_empty());

        let generic = apply_outcome(
            &first.policy,
            533,
            Some("Legora"),
            Some("rejected"),
            Some("position filled"),
        );
        assert!(generic.changed);
        assert!(generic.policy.firm_weights.get("legora").is_none());
        assert!(generic.policy.audit.is_empty());
    }

    #[test]
    fn generic_phrases_do_not_write_and_specific_phrases_do() {
        assert_eq!(classify_reject_feedback(None), FeedbackClass::Generic);
        assert_eq!(
            classify_reject_feedback(Some("   ")),
            FeedbackClass::Generic
        );
        for phrase in GENERIC_REJECT_PHRASES {
            assert_eq!(
                classify_reject_feedback(Some(phrase)),
                FeedbackClass::Generic,
                "{phrase}"
            );
            let applied = apply_outcome(
                &QualifyPolicy::default(),
                1,
                Some("Neko"),
                Some("rejected"),
                Some(phrase),
            );
            assert!(!applied.changed, "{phrase}");
            assert!(applied.policy.firm_weights.is_empty(), "{phrase}");
        }
        for phrase in SPECIFIC_REJECT_PHRASES {
            assert_eq!(
                classify_reject_feedback(Some(phrase)),
                FeedbackClass::Specific,
                "{phrase}"
            );
            let applied = apply_outcome(
                &QualifyPolicy::default(),
                2,
                Some("Legora"),
                Some("rejected"),
                Some(phrase),
            );
            assert!(applied.changed, "{phrase}");
            assert_eq!(
                applied.policy.firm_weights.get("legora").copied(),
                Some(-8),
                "{phrase}"
            );
        }
    }

    #[test]
    fn neko_class_and_position_filled_do_not_move_the_prior() {
        let notes = [
            "2026-09-23 Ashby paper, no tailored feedback",
            "position filled",
            "The position has been filled. Thank you for your interest.",
            "This requisition was auto-closed.",
            "",
        ];
        for note in notes {
            let applied = apply_outcome(
                &QualifyPolicy::default(),
                530,
                Some("Neko"),
                Some("rejected"),
                Some(note),
            );
            assert!(!applied.changed, "{note}");
            assert!(applied.policy.firm_weights.get("neko").is_none(), "{note}");
        }
        let interview = apply_outcome(
            &QualifyPolicy::default(),
            540,
            Some("Proposales"),
            Some("interview"),
            None,
        );
        assert_eq!(interview.audit.expect("audit").delta, 8);
    }

    #[test]
    fn non_reward_stages_and_blank_firms_do_not_invent_priors() {
        let policy = QualifyPolicy::default();
        let waiting = apply_outcome(&policy, 540, Some("Proposales"), Some("waiting"), None);
        assert!(!waiting.changed);
        assert!(waiting.policy.audit.is_empty());

        let blank = apply_outcome(&policy, 1, Some("  "), Some("rejected"), Some(SPECIFIC));
        assert!(!blank.changed);
        assert!(blank.policy.audit.is_empty());
    }

    #[test]
    fn specific_feedback_steps_one_firm_and_paper_screens_do_not() {
        assert!(qualifies(None, 0));
        assert!(!qualifies(None, -8));
        let paper = apply_outcome(
            &QualifyPolicy::default(),
            533,
            Some("Legora"),
            Some("rejected"),
            Some("paper reject"),
        );
        assert!(!paper.changed);
        assert!(paper.policy.firm_weights.get("legora").is_none());

        let neko = apply_outcome(
            &paper.policy,
            530,
            Some("Neko"),
            Some("rejected"),
            Some("2026-09-23 Ashby paper, no tailored feedback"),
        );
        assert!(!neko.changed);
        assert!(neko.policy.firm_weights.get("neko").is_none());

        let specific = apply_outcome(
            &neko.policy,
            9104,
            Some("Legora"),
            Some("rejected"),
            Some(SPECIFIC),
        );
        assert_eq!(
            specific.policy.firm_weights.get("legora").copied(),
            Some(-8)
        );
        assert!(specific.policy.firm_weights.get("neko").is_none());
        let legora = specific
            .policy
            .firm_weights
            .get("legora")
            .copied()
            .unwrap_or(0);
        assert!(!qualifies(None, legora));
        assert!(qualifies(None, 0));
    }

    #[test]
    fn logged_outcome_skips_generic_rejects_and_audits_specific_ones() {
        let tmp = tempfile::tempdir().expect("temp");
        let _reset = ResetDir;
        set_test_dir(Some(tmp.path().to_path_buf()));
        let skipped = apply_logged_outcome(
            530,
            Some("Neko"),
            Some("rejected"),
            Some("2026-09-23 Ashby paper, no tailored feedback"),
        )
        .expect("skip");
        assert!(!skipped.changed);
        let path = tmp.path().join("qualify-priors.json");
        assert!(!path.exists());

        let result = apply_logged_outcome(9104, Some("Legora"), Some("rejected"), Some(SPECIFIC))
            .expect("write");
        assert!(result.changed);
        assert_eq!(result.audit.as_ref().map(|a| a.outcome_id), Some(9104));
        assert_eq!(result.audit.as_ref().map(|a| a.delta), Some(-8));
        let text = fs::read_to_string(&path).expect("file");
        assert!(text.contains("\"outcome_id\": 9104"));
        assert!(text.contains("\"firm_key\": \"legora\""));
        assert!(!text.contains("neko"));
        assert!(!text.contains("INSERT"));
        let again = apply_logged_outcome(9104, Some("Legora"), Some("rejected"), Some(SPECIFIC))
            .expect("idempotent");
        assert!(!again.changed);
    }
}

//! QUALIFY firm-weight prior.
//!
//! One logged stage outcome updates one firm. The audit row is the undo record.
//! Reward stages: rejected −8, interview/offer +8. Waiting, screening, ghost, and
//! withdrawn do not move the prior.
//!
//! Stored `fit_score` is never rewritten. This file is the policy, not a second prediction.
//! Keep the step, clamp, and missing-fit rule aligned with `src/core/domain/qualify-policy.ts`.

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
) -> ApplyResult {
    let outcome = outcome_status.unwrap_or("").trim().to_ascii_lowercase();
    let key = firm_key(company.unwrap_or(""));
    let requested = reward_delta(&outcome);
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
) -> Result<ApplyResult, String> {
    let current = match policy_path() {
        Ok(path) => load_from(&path)?,
        Err(e) => return Err(e),
    };
    let result = apply_outcome(&current, outcome_id, company, outcome_status);
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

    #[test]
    fn one_reject_is_reversible_and_idempotent() {
        let policy = QualifyPolicy::default();
        let first = apply_outcome(&policy, 533, Some("Legora"), Some("rejected"));
        assert!(first.changed);
        let audit = first.audit.expect("audit");
        assert_eq!(audit.delta, -8);
        assert_eq!(audit.before, 0);
        assert_eq!(audit.after, -8);
        assert_eq!(first.policy.firm_weights.get("legora").copied(), Some(-8));

        let again = apply_outcome(&first.policy, 533, Some("Legora"), Some("rejected"));
        assert!(!again.changed);
        assert_eq!(again.policy.firm_weights.get("legora").copied(), Some(-8));

        let cleared = apply_outcome(&first.policy, 533, Some("Legora"), Some(""));
        assert!(cleared.changed);
        assert!(cleared.policy.firm_weights.get("legora").is_none());
        assert!(cleared.policy.audit.is_empty());
    }

    #[test]
    fn non_reward_stages_and_blank_firms_do_not_invent_priors() {
        let policy = QualifyPolicy::default();
        let waiting = apply_outcome(&policy, 540, Some("Proposales"), Some("waiting"));
        assert!(!waiting.changed);
        assert!(waiting.policy.audit.is_empty());

        let blank = apply_outcome(&policy, 1, Some("  "), Some("rejected"));
        assert!(!blank.changed);
        assert!(blank.policy.audit.is_empty());
    }

    #[test]
    fn held_out_legora_false_qualify_drops_and_neko_stays() {
        assert!(qualifies(None, 0));
        assert!(!qualifies(None, -8));
        let trained = apply_outcome(
            &QualifyPolicy::default(),
            533,
            Some("Legora"),
            Some("rejected"),
        );
        let legora = trained
            .policy
            .firm_weights
            .get("legora")
            .copied()
            .unwrap_or(0);
        let neko = trained
            .policy
            .firm_weights
            .get("neko")
            .copied()
            .unwrap_or(0);
        assert!(
            !qualifies(None, legora),
            "held-out Legora SE is no longer qualified"
        );
        assert!(qualifies(None, neko), "Neko was not in the update");
        assert!(trained.policy.firm_weights.get("neko").is_none());
    }

    #[test]
    fn logged_outcome_writes_audit_without_touching_a_database() {
        let tmp = tempfile::tempdir().expect("temp");
        let _reset = ResetDir;
        set_test_dir(Some(tmp.path().to_path_buf()));
        let result = apply_logged_outcome(530, Some("Neko"), Some("rejected")).expect("write");
        assert!(result.changed);
        assert_eq!(result.audit.as_ref().map(|a| a.outcome_id), Some(530));
        let path = tmp.path().join("qualify-priors.json");
        let text = fs::read_to_string(&path).expect("file");
        assert!(text.contains("\"outcome_id\": 530"));
        assert!(text.contains("\"firm_key\": \"neko\""));
        assert!(!text.contains("INSERT"));
        let again = apply_logged_outcome(530, Some("Neko"), Some("rejected")).expect("idempotent");
        assert!(!again.changed);
    }
}

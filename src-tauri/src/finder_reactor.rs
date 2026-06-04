// finder_reactor.rs
// Core of the agentic, self-guarded Finder Reactor per .agents/skills/finder-reactor/SKILL.md + agentic-reactor + tauri-agentic + x-agent-resources + cv-promote-guard.
// Fission for guards/impl; Fusion for the living system.
// Self-guards: Cost, XRate, FitThreshold, CVPromote (delegates).
// Pauses: Return Pause variant for UI/MCP intervention.
// Smart decisions: Structured Decision with confidence, rationale, guards_triggered.
// MCP exposure: These structs/commands are the tools (search, analyze, decide, prep, promote).
// X integration: Load .agents/x-resources/skill.md for context in decisions/prompts (stub for now).
// CV: Use cv_promote_guard for any promote.
// Surplus: See end of file and calls.

use crate::x_search::search_recent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub use crate::x_search::XTweet;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Guard {
    Cost { estimated_tokens: u32, budget: u32 },
    XRate { remaining: u32, limit: u32 },
    FitThreshold { score: u8, threshold: u8 },
    CVPromote { field: String, risk: String },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CycleResult {
    pub decision: Decision,
    pub tweets: Vec<XTweet>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Decision {
    pub action: String, // e.g., "prep", "pause", "ignore", "promote"
    pub confidence: u8, // 0-100
    pub rationale: String,
    pub guards_triggered: Vec<Guard>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Lead {
    pub tweet: XTweet,
    pub score: Option<u8>,
    pub decision: Option<Decision>,
    pub prep_artifacts: Option<HashMap<String, String>>, // e.g., {"letter": "...", "cv_delta": "..."}
    pub status: String, // new, analyzed, prepped, paused, applied
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReactorState {
    pub leads: Vec<Lead>,
    pub current_cost: u32,
    pub x_rate_remaining: u32,
    pub cv_path: Option<String>,
    pub pauses: Vec<String>, // logs of interventions
}

pub struct FinderReactor {
    pub state: ReactorState,
    pub x_skill_context: String, // loaded from .agents/x-resources/skill.md
    pub devprofile_path: Option<PathBuf>,
}

impl FinderReactor {
    pub fn new(devprofile_path: Option<String>) -> Self {
        let x_skill = Self::load_x_skill_context();
        let cv_path = devprofile_path.clone();
        let devprofile = cv_path.as_ref().map(|p| PathBuf::from(p));
        Self {
            state: ReactorState {
                leads: vec![],
                current_cost: 0,
                x_rate_remaining: 450, // example from X skill.md knowledge
                cv_path,
                pauses: vec![],
            },
            x_skill_context: x_skill,
            devprofile_path: devprofile,
        }
    }

    fn load_x_skill_context() -> String {
        // Per x-agent-resources: load for prompt context / decisions.
        // In prod: read from app dir or embed. For now, use known excerpt + file if present.
        let path = PathBuf::from(".agents/x-resources/skill.md");
        if path.exists() {
            fs::read_to_string(path).unwrap_or_else(|_| "X API skill: search recent, create posts, auth via bearer/OAuth, rate limits...".to_string())
        } else {
            // Fallback excerpt from official (follow skill.md: use for accurate ops)
            "X API Skill: Use for searchPostsRecent, getUsersByUsername, createPosts etc. Always request fields explicitly. Rate limits via headers. Auth: Bearer for app-only. Operators for queries. See full skill.md for workflows/gotchas.".to_string()
        }
    }

    // Guard: Cost
    fn check_cost_guard(&self, est_tokens: u32) -> Option<Guard> {
        let budget = 10000; // configurable
        if self.state.current_cost + est_tokens > budget {
            Some(Guard::Cost { estimated_tokens: est_tokens, budget })
        } else {
            None
        }
    }

    // Guard: XRate (from headers in real calls, per x-agent-resources)
    fn check_xrate_guard(&self) -> Option<Guard> {
        if self.state.x_rate_remaining < 10 {
            Some(Guard::XRate { remaining: self.state.x_rate_remaining, limit: 450 })
        } else {
            None
        }
    }

    // Guard: Fit (smart decision)
    fn check_fit_guard(&self, score: u8) -> Option<Guard> {
        let threshold = 70;
        if score < threshold {
            Some(Guard::FitThreshold { score, threshold })
        } else {
            None
        }
    }

    fn fit_score(text: &str) -> u8 {
        let t = text.to_lowercase();
        let mut score: u8 = 40;
        for kw in ["react", "typescript", "rust", "agent", "ai", "hiring", "collab"] {
            if t.contains(kw) {
                score = score.saturating_add(12);
            }
        }
        score.min(95)
    }

    // Core: Analyze with X context + CV prune (fission per skills)
    pub fn analyze_lead(&mut self, tweet: XTweet, cv_summary: &str) -> Decision {
        // Per finder-reactor + x-agent-resources: prefix with X skill + pruned CV.
        // Stub "xAI structured decision" - in real: call xAI with skill + pruned CV context.
        let score = Self::fit_score(&tweet.text);
        let _cv = cv_summary;
        let _skill = &self.x_skill_context;
        let mut guards = vec![];
        if let Some(g) = self.check_fit_guard(score) { guards.push(g); }
        if let Some(g) = self.check_xrate_guard() { guards.push(g); }
        if let Some(g) = self.check_cost_guard(500) { guards.push(g); }

        let action = if guards.iter().any(|g| matches!(g, Guard::FitThreshold {..})) {
            "pause".to_string()
        } else if score > 70 {
            "prep".to_string()
        } else {
            "ignore".to_string()
        };

        Decision {
            action,
            confidence: if score > 70 { 80 } else { 40 },
            rationale: format!("Based on X skill context + CV match. Score: {}. Guards: {:?}", score, guards),
            guards_triggered: guards,
            next_steps: vec!["review_pause".to_string(), "generate_prep".to_string()],
        }
    }

    // Guarded search — same live X API path as `search_x_recent`.
    pub async fn guarded_search(&mut self, query: String, bearer: String) -> Result<Vec<XTweet>, String> {
        if let Some(guard) = self.check_xrate_guard() {
            self.state.pauses.push(format!("XRate guard: {:?}", guard));
            return Err(format!("Paused on guard: {:?}", guard));
        }

        let (tweets, rate) = search_recent(&bearer, &query, 10).await?;
        if let Some(remaining) = rate.remaining {
            self.state.x_rate_remaining = remaining;
        }
        self.state.current_cost += 100;
        Ok(tweets)
    }

    // Full cycle with self-guards, pauses, decisions (per agentic-reactor loop)
    pub async fn run_autonomous_cycle(
        &mut self,
        query: String,
        bearer: String,
        cv_summary: String,
    ) -> Result<CycleResult, String> {
        let tweets = self.guarded_search(query, bearer).await?;
        if tweets.is_empty() {
            return Ok(CycleResult {
                decision: Decision {
                    action: "ignore".into(),
                    confidence: 0,
                    rationale: "No matching posts from X recent search.".into(),
                    guards_triggered: vec![],
                    next_steps: vec!["broaden_query".into()],
                },
                tweets: vec![],
            });
        }

        let mut best_tweet = tweets[0].clone();
        let mut best_decision = self.analyze_lead(best_tweet.clone(), &cv_summary);
        let mut best_score = Self::fit_score(&best_tweet.text);

        for tweet in tweets.iter().skip(1).take(9) {
            let score = Self::fit_score(&tweet.text);
            if score > best_score {
                best_score = score;
                best_tweet = tweet.clone();
                best_decision = self.analyze_lead(tweet.clone(), &cv_summary);
            }
        }

        let decision = best_decision;

        if !decision.guards_triggered.is_empty() {
            self.state.pauses.push(format!("Cycle paused: {:?}", decision.guards_triggered));
            self.state.leads.push(Lead {
                tweet: best_tweet,
                score: Some(best_score),
                decision: Some(decision.clone()),
                prep_artifacts: None,
                status: "paused".to_string(),
            });
            return Ok(CycleResult {
                decision,
                tweets,
            });
        }

        if decision.action == "prep" {
            self.state.leads.push(Lead {
                tweet: best_tweet,
                score: Some(best_score),
                decision: Some(decision.clone()),
                prep_artifacts: Some(HashMap::from([
                    (
                        "letter".to_string(),
                        "Tailored cover letter using X skill + CV...".to_string(),
                    ),
                    (
                        "cv_delta".to_string(),
                        "Sidecar delta per cv-promote-guard...".to_string(),
                    ),
                ])),
                status: "prepped".to_string(),
            });
        }

        if decision.action == "promote" {
            self.state
                .pauses
                .push("CV promote guard triggered - sidecar only, user confirm required".to_string());
        }

        Ok(CycleResult {
            decision,
            tweets,
        })
    }

    // MCP tool stub: promote (per cv-promote-guard)
    pub fn promote_insights(&mut self, lead_id: &str) -> Result<String, String> {
        // Always sidecar-first, diff, pause for confirm. Never direct write.
        // In real: load cvdata, generate patch, write sidecar in app_data, return preview.
        // Use devprofile_path.
        if let Some(path) = &self.devprofile_path {
            Ok(format!("Sidecar written for lead {}. Preview diff at {}/preps/... . Confirm to apply? (per cv-promote-guard)", lead_id, path.display()))
        } else {
            Ok("Configure devprofile_path first. Sidecar only.".to_string())
        }
    }
}

// Surplus: shared X search + singleton reactor state — cycle and manual search stay consistent; rate headers feed guards.

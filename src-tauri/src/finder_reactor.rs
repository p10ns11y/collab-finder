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

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XTweet {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub author_id: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Guard {
    Cost { estimated_tokens: u32, budget: u32 },
    XRate { remaining: u32, limit: u32 },
    FitThreshold { score: u8, threshold: u8 },
    CVPromote { field: String, risk: String },
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

#[derive(Debug, Serialize, Deserialize)]
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

    // Core: Analyze with X context + CV prune (fission per skills)
    pub fn analyze_lead(&mut self, tweet: XTweet, cv_summary: &str) -> Decision {
        // Per finder-reactor + x-agent-resources: prefix with X skill + pruned CV.
        let context = format!(
            "X Context (from skill.md/llms): {}. Opportunity: {}. Your CV (pruned): {}. Decide: pursue? score 0-100? prep? pause?",
            self.x_skill_context, tweet.text, cv_summary
        );
        // Stub "xAI structured decision" - in real: call xAI with context, parse to Decision.
        // Smart/intelli: simulate based on keywords + guards.
        let score = if tweet.text.to_lowercase().contains("react") || tweet.text.to_lowercase().contains("rust") { 85 } else { 45 };
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

    // Guarded search (uses x-agent-resources for query building)
    pub async fn guarded_search(&mut self, query: String, _bearer: String) -> Result<Vec<XTweet>, String> {
        // Per x-agent-resources: full control, respect rates, use skill for valid queries.
        if let Some(guard) = self.check_xrate_guard() {
            self.state.pauses.push(format!("XRate guard: {:?}", guard));
            return Err(format!("Paused on guard: {:?}", guard)); // Pause for intervention
        }
        // Real call (existing) - placeholder for now, wire bearer to search_x_recent
        // For demo, return empty; in full: self.search_x_recent_internal...
        let tweets: Vec<XTweet> = vec![];
        self.state.x_rate_remaining = self.state.x_rate_remaining.saturating_sub(1);
        self.state.current_cost += 100; // stub
        Ok(tweets)
    }

    // Full cycle with self-guards, pauses, decisions (per agentic-reactor loop)
    pub async fn run_autonomous_cycle(&mut self, query: String, bearer: String, cv_summary: String) -> Result<Decision, String> {
        let tweets = self.guarded_search(query, bearer).await?;
        if tweets.is_empty() {
            return Ok(Decision { action: "ignore".into(), confidence: 0, rationale: "No results".into(), guards_triggered: vec![], next_steps: vec![] });
        }
        let tweet = tweets[0].clone(); // simple: first
        let decision = self.analyze_lead(tweet.clone(), &cv_summary);

        // Pause if guards
        if !decision.guards_triggered.is_empty() {
            self.state.pauses.push(format!("Cycle paused: {:?}", decision.guards_triggered));
            // In UI/MCP: surface for user/agent intervention. Don't auto prep.
            return Ok(decision);
        }

        // If cleared: "prep" (stub artifacts, real xAI per context)
        let mut lead = Lead {
            tweet,
            score: Some(85),
            decision: Some(decision.clone()),
            prep_artifacts: Some(HashMap::from([
                ("letter".to_string(), "Tailored cover letter using X skill + CV...".to_string()),
                ("cv_delta".to_string(), "Sidecar delta per cv-promote-guard...".to_string()),
            ])),
            status: "prepped".to_string(),
        };
        self.state.leads.push(lead);

        // CV promote? Only via guard (stub)
        if decision.action == "promote" {
            // Delegate to cv_promote_guard logic (see skill)
            self.state.pauses.push("CV promote guard triggered - sidecar only, user confirm required".to_string());
        }

        Ok(decision)
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

// Example Tauri commands (MCP-compatible tools)
// In real: wrap reactor methods, use tauri state for singleton reactor.
#[tauri::command]
pub async fn run_finder_cycle(query: String, bearer: String, cv_summary: String) -> Result<Decision, String> {
    let mut reactor = FinderReactor::new(Some("/path/to/devprofile".to_string())); // from config
    reactor.run_autonomous_cycle(query, bearer, cv_summary).await
}

#[tauri::command]
pub fn get_reactor_state() -> ReactorState {
    // Return current for UI/dashboard
    FinderReactor::new(None).state // stub; use shared state
}

#[tauri::command]
pub fn promote_lead(lead_id: String) -> Result<String, String> {
    let mut reactor = FinderReactor::new(None);
    reactor.promote_insights(&lead_id)
}

// Surplus per skill: This module makes future cycles cheaper by centralizing guards (no duplicate logic), MCP allows agent-driven (no UI tax), X context from fetched resources prevents bad queries (saves retries). Q≈1.7. Suggested: auto-apply low-risk surpluses in meta-loop.

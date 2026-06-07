/** Durable history types (mirror of Rust db.rs serializable structs + filters).
 * Used for MVU history slice + History/Data screens.
 * All lookups go through Tauri commands (persisted in sqlite).
 */

import type { Tweet } from './finder';

export type SearchRun = {
  id: number;
  ts: string;
  query: string;
  source: string; // 'manual' | 'cycle' | 'preset:...' | ...
  max_results?: number;
  num_results: number;
  rate_remaining?: number;
  rate_limit?: number;
  cost_incurred: number;
  duration_ms?: number;
  error?: string;
};

export type SearchRunWithTweets = {
  run: SearchRun;
  tweets: Tweet[];
};

export type Lead = {
  id: number;
  tweet_id: string;
  first_seen: string;
  seen_count: number; // >1 means duplicate result removal kicked in
  score?: number;
  action?: string;
  decision_json?: string;
  status: string;
  prep_artifacts_json?: string;
  last_updated: string;
  notes?: string;
  // Enriched when joined
  tweet_text?: string;
  tweet_created_at?: string;
};

export type Pause = {
  id: number;
  ts: string;
  reason: string;
  guard_type?: string;
  lead_id?: number;
  search_run_id?: number;
  details_json?: string;
  resolved_at?: string;
  resolution?: string;
};

export type Event = {
  id: number;
  ts: string;
  event_type: string;
  payload_json?: string;
  correlation_id?: string;
  source?: string;
};

export type DashboardStats = {
  total_searches: number;
  total_unique_leads: number;
  total_surfaces: number;
  total_pauses: number;
  avg_score?: number;
  top_queries: string[];
  most_reseen?: [string, number]; // [tweet_id or snippet, count]
};

export type LeadFilter = {
  min_score?: number;
  status?: string;
  q?: string; // keyword (client or server LIKE/FTS)
  since?: string;
  limit?: number;
};

export type EventFilter = {
  event_type?: string;
  since?: string;
  correlation_id?: string;
  limit?: number;
};

/// Web / pasted job targets persisted via analyze_job_target (Slice B+).
/// Mirrors Rust db::Opportunity (v3 table).
export type Opportunity = {
  id: number;
  kind: string; // 'web' | 'paste' | 'x-post'
  source_url?: string;
  source_ref?: string;
  title?: string;
  company?: string;
  jd_text: string;
  status: string;
  fit_score?: number;
  analysis_json?: string;
  prep_artifacts_json?: string;
  last_updated: string;
  notes?: string;
};

export type OpportunityFilter = {
  status?: string;
  min_fit?: number;
  q?: string;
  limit?: number;
};

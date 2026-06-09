import type { CycleResult, ReactorState, Tweet } from '../core/domain/finder'
import type {
  DashboardStats,
  Event,
  EventFilter,
  Lead,
  LeadFilter,
  Opportunity,
  OpportunityFilter,
  Pause,
  SearchRun,
  SearchRunWithTweets,
} from '../core/domain/history'
import type { TargetAnalysisResult, TargetPageResult, TargetPrepResult } from '../core/domain/target'
import type { Result } from '../core/result'
import type { AppError } from '../core/error'

export type FinderPort = {
  search(query: string, maxResults?: number): Promise<Result<Tweet[], AppError>>
  runCycle(query: string, cvSummary: string): Promise<Result<CycleResult, AppError>>
  reactorState(): Promise<Result<ReactorState, AppError>>
  promote(leadId?: string): Promise<Result<string, AppError>>

  // History / audit (sqlite backed, survives restarts, deduped leads)
  getSearchHistory(limit?: number): Promise<Result<SearchRun[], AppError>>
  getSearchRun(id: number): Promise<Result<SearchRunWithTweets | null, AppError>>
  getLeads(filter?: LeadFilter): Promise<Result<Lead[], AppError>>
  getDashboardStats(): Promise<Result<DashboardStats, AppError>>
  getRecentPauses(limit?: number): Promise<Result<Pause[], AppError>>
  getEvents(filter?: EventFilter): Promise<Result<Event[], AppError>>
  searchPastTweets(ftsQuery: string, limit?: number): Promise<Result<Tweet[], AppError>>
  hydrateTweet(id: string): Promise<Result<Tweet, AppError>>
  logEvent(eventType: string, payload?: string, correlationId?: string): Promise<Result<void, AppError>>

  // Target (web/paste URL or JD) — primary flow for analyzing opportunities in Discover
  fetchTargetPage(url: string): Promise<Result<TargetPageResult, AppError>>
  analyzeTarget(payload: { url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string }): Promise<Result<TargetAnalysisResult, AppError>>
  prepTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string; previous_fit?: string }): Promise<Result<TargetPrepResult, AppError>>
  getOpportunities(filter?: OpportunityFilter): Promise<Result<Opportunity[], AppError>>
}
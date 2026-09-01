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
import type { OpportunityTargetAnalysisResult, OpportunityTargetPageResult, OpportunityTargetPrepResult } from '../core/domain/opportunity-target'
import type { HireBoardFilter, HireBoardLead } from '../core/domain/hire-board'
import type { PlatsbankenLead, PlatsbankenSearchFilter } from '../core/domain/platsbanken'
import type { MissionFirmLead, MissionFirmFilter } from '../core/domain/mission-firms'
import type { DurabilityIteration, MissionInspectResult } from '../core/domain/firm-durability'
import type { NetworkGraphResult } from '../core/domain/network-graph'
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

  // Opportunity target (web/paste URL or JD) — primary flow for analyzing opportunities in Discover
  fetchOpportunityTargetPage(url: string): Promise<Result<OpportunityTargetPageResult, AppError>>
  analyzeOpportunityTarget(payload: { url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string }): Promise<Result<OpportunityTargetAnalysisResult, AppError>>
  prepOpportunityTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string; previous_fit?: string }): Promise<Result<OpportunityTargetPrepResult, AppError>>
  getOpportunities(filter?: OpportunityFilter): Promise<Result<Opportunity[], AppError>>
  getPipelineOpportunities(limit?: number): Promise<Result<Opportunity[], AppError>>
  /** Pipeline status only (applied/passed/archived/…) — no xAI. */
  updateOpportunityStatus(id: number, status: string, notes?: string): Promise<Result<void, AppError>>
  updateOpportunityOutcome(id: number, outcomeStatus: string): Promise<Result<void, AppError>>

  /** Public hire sheet → ranked ephemeral leads (no bulk DB write). */
  fetchHireBoard(filter?: HireBoardFilter): Promise<Result<HireBoardLead[], AppError>>
  /** Persist one lead as Opportunity status=new (URL dedup). */
  selectHireBoardLead(payload: {
    company: string
    location?: string
    career_url: string
    thread_url?: string
  }): Promise<Result<Opportunity, AppError>>

  /** JobTech JobSearch → ranked Platsbanken leads (emergency AF rail). */
  searchPlatsbanken(filter?: PlatsbankenSearchFilter): Promise<Result<PlatsbankenLead[], AppError>>
  /** Fetch full ad + upsert Opportunity kind=platsbanken (Evaluate). */
  importPlatsbankenAd(adId: string): Promise<Result<Opportunity, AppError>>
  deleteOpportunity(id: number): Promise<Result<void, AppError>>
  runLocalGrokQuest(payload: {
    prompt: string
    sessionId?: string
    resume?: boolean
    kind?: string
  }): Promise<Result<import('../core/domain/quest').QuestResult, AppError>>
  persistQuestTurn(payload: {
    sessionId: string
    kind: string
    contextIds: string
    lastOppId?: number | null
    role: string
    text: string
    backend?: string | null
    promptChars?: number | null
  }): Promise<Result<void, AppError>>
  loadLatestQuestThread(): Promise<
    Result<import('../core/domain/quest').QuestThreadRecord | null, AppError>
  >
  loadQuestThread(
    sessionId: string,
  ): Promise<Result<import('../core/domain/quest').QuestThreadRecord | null, AppError>>
  listQuestThreads(
    limit?: number,
  ): Promise<Result<import('../core/domain/quest').QuestThreadSummary[], AppError>>
  searchQuestTurns(
    q: string,
    limit?: number,
  ): Promise<Result<import('../core/domain/quest').QuestTurnHit[], AppError>>

  /** Fortress / AI-wave ranker v1 (public IR). next=true skips prior waves. */
  listDurableFirms(next?: boolean): Promise<Result<DurabilityIteration, AppError>>
  inspectMissionFirmLead(payload: {
    firm_id: string
    source: string
    external_id: string
    absolute_url?: string
    location?: string
  }): Promise<Result<MissionInspectResult, AppError>>
  /** SpaceXAI Greenhouse + Swedish bridge JobTech ads. */
  searchMissionFirms(filter?: MissionFirmFilter): Promise<Result<MissionFirmLead[], AppError>>
  importMissionFirmLead(payload: {
    firm_id: string
    source: string
    external_id: string
    absolute_url?: string
  }): Promise<Result<Opportunity, AppError>>

  /** Local gitignored connections.csv → scored network graph. */
  loadNetworkGraph(payload?: {
    path?: string
    contacts_path?: string
    force_reimport?: boolean
    top_n?: number
  }): Promise<Result<NetworkGraphResult, AppError>>
  /** Official X username lookup for top-N (or ids). */
  resolveNetworkXProfiles(payload: {
    graph: NetworkGraphResult
    top_n?: number
    ids?: string[]
  }): Promise<Result<NetworkGraphResult, AppError>>
  /** Public LinkedIn HTML meta enrich (rate-limited). */
  enrichNetworkLinkedIn(payload: {
    graph: NetworkGraphResult
    top_n?: number
    ids?: string[]
  }): Promise<Result<NetworkGraphResult, AppError>>

  // devprofile grounding config (AC2): when set, resolve_cv uses pruned cvdata.json from the path
  getDevprofilePath(): Promise<Result<string | null, AppError>>
  setDevprofilePath(path: string | null): Promise<Result<void, AppError>>

  // propose sidecar from prep cv_suggestions (AC3) - sidecar only + basic preview, no master mutation
  proposeCvSidecar(opportunityId: number): Promise<Result<{ opportunity_id: number; preview: string; sidecar_path: string; suggestions_count: number }, AppError>>

  /** Durable pack files under app-local application_packs/ (no xAI, no CV mutation). */
  exportApplicationPack(opportunityId: number): Promise<
    Result<
      {
        opportunity_id: number
        pack_dir: string
        pack_slug: string
        company?: string | null
        title?: string | null
        files: string[]
        file_count: number
      },
      AppError
    >
  >

  /**
   * Export pack if needed + spawn devprofile generate-apply-cv.
   * PDF only — never mutates master cvdata.json.
   */
  generateApplyCv(opportunityId: number): Promise<
    Result<
      {
        opportunity_id: number
        pack_slug: string
        pack_dir: string
        pdf_path: string
        flat_pdf_path?: string | null
        submit_pdf_path?: string | null
        stdout_tail?: string
        export_files?: string[]
        export_file_count?: number
      },
      AppError
    >
  >
}
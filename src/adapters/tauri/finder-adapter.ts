import type { FinderPort } from '../../ports/finder-port'
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
} from '../../core/domain/history'
import type { OpportunityTargetAnalysisResult, OpportunityTargetPageResult, OpportunityTargetPrepResult } from '../../core/domain/opportunity-target'
import type { HireBoardFilter, HireBoardLead } from '../../core/domain/hire-board'
import type { PlatsbankenLead, PlatsbankenSearchFilter } from '../../core/domain/platsbanken'
import type { MissionFirmLead, MissionFirmFilter } from '../../core/domain/mission-firms'
import type { DurabilityIteration, MissionInspectResult } from '../../core/domain/firm-durability'
import type { NetworkGraphResult } from '../../core/domain/network-graph'
import { safeInvoke } from './safe-invoke'

// Re-export filter types for the effects wrapper sig (used by history MVU)
export type { LeadFilter, EventFilter, OpportunityFilter } from '../../core/domain/history'

export function createTauriFinderPort(): FinderPort {
  return {
    search: (query, maxResults = 10) =>
      safeInvoke('search_x_recent', { query, maxResults }),
    runCycle: (query, cvSummary) =>
      safeInvoke('run_finder_cycle_cmd', { query, cvSummary }),
    reactorState: () => safeInvoke('get_reactor_state', {}), // db state injected server-side
    promote: (leadId = 'latest') => safeInvoke('promote_lead', { leadId }),

    // History (db-injected commands; frontend does not pass db arg)
    getSearchHistory: (limit = 50) => safeInvoke<SearchRun[]>('get_search_history', { limit }),
    getSearchRun: (id) => safeInvoke<SearchRunWithTweets | null>('get_search_run', { id }),
    getLeads: (filter?: LeadFilter) => safeInvoke<Lead[]>('get_leads', filter ?? {}),
    getDashboardStats: () => safeInvoke<DashboardStats>('get_dashboard_stats'),
    getRecentPauses: (limit = 30) => safeInvoke<Pause[]>('get_recent_pauses', { limit }),
    getEvents: (filter?: EventFilter) => safeInvoke<Event[]>('get_events', filter ?? {}),
    searchPastTweets: (ftsQuery, limit = 20) =>
      safeInvoke('search_past_tweets', { ftsQuery, limit }),
    hydrateTweet: (id) => safeInvoke('hydrate_tweet', { id }),
    logEvent: (eventType, payload, correlationId) =>
      safeInvoke('log_event', { eventType, payload, correlationId }),

    // Opportunity target (web/paste focus) — Quick Target flow
    fetchOpportunityTargetPage: (url) => safeInvoke<OpportunityTargetPageResult>('fetch_opportunity_target_page', { url }),
    // Tauri maps Rust snake_case args to camelCase invoke keys (cv_summary → cvSummary).
    analyzeOpportunityTarget: (payload) =>
      safeInvoke<OpportunityTargetAnalysisResult>('analyze_opportunity_target', {
        url: payload.url,
        pastedJd: payload.pasted_jd,
        paste: payload.pasted_jd,
        title: payload.title,
        company: payload.company,
        cvSummary: payload.cv_summary,
      }),
    prepOpportunityTarget: (payload) =>
      safeInvoke<OpportunityTargetPrepResult>('prep_opportunity_target', {
        opportunityId: payload.opportunity_id,
        url: payload.url,
        pastedJd: payload.pasted_jd,
        paste: payload.pasted_jd,
        title: payload.title,
        company: payload.company,
        cvSummary: payload.cv_summary,
        previousFit: payload.previous_fit,
      }),
    getOpportunities: (filter) => safeInvoke<Opportunity[]>('get_opportunities', filter ?? {}),
    updateOpportunityStatus: (id, status, notes) =>
      safeInvoke<void>('update_opportunity_status_cmd', { id, status, notes }),
    fetchHireBoard: (filter?: HireBoardFilter) =>
      safeInvoke<HireBoardLead[]>('fetch_hire_board', {
        sheetUrl: filter?.sheet_url,
        q: filter?.q,
        geo: filter?.geo,
        requireCareerUrl: filter?.require_career_url ?? true,
        limit: filter?.limit ?? 100,
      }),
    selectHireBoardLead: (payload) =>
      safeInvoke<Opportunity>('select_hire_board_lead', {
        company: payload.company,
        location: payload.location,
        careerUrl: payload.career_url,
        threadUrl: payload.thread_url,
      }),
    searchPlatsbanken: (filter?: PlatsbankenSearchFilter) =>
      safeInvoke<PlatsbankenLead[]>('search_platsbanken', {
        q: filter?.q,
        municipality: filter?.municipality,
        limit: filter?.limit ?? 30,
        offset: filter?.offset ?? 0,
      }),
    importPlatsbankenAd: (adId) =>
      safeInvoke<Opportunity>('import_platsbanken_ad', { adId }),
    deleteOpportunity: (id) => safeInvoke<void>('delete_opportunity_cmd', { id }),
    runLocalGrokQuest: (payload) =>
      safeInvoke('run_local_grok_quest', {
        input: {
          prompt: payload.prompt,
          sessionId: payload.sessionId ?? null,
          resume: payload.resume ?? false,
          kind: payload.kind ?? 'free',
        },
      }),
    persistQuestTurn: (payload) =>
      safeInvoke('persist_quest_turn', {
        input: {
          sessionId: payload.sessionId,
          kind: payload.kind,
          contextIds: payload.contextIds,
          lastOppId: payload.lastOppId ?? null,
          role: payload.role,
          text: payload.text,
          backend: payload.backend ?? null,
          promptChars: payload.promptChars ?? null,
        },
      }),
    loadLatestQuestThread: () => safeInvoke('load_latest_quest_thread'),
    loadQuestThread: (sessionId) => safeInvoke('load_quest_thread', { sessionId }),
    listQuestThreads: (limit = 12) => safeInvoke('list_quest_threads', { limit }),
    searchQuestTurns: (q, limit = 20) => safeInvoke('search_quest_turns', { q, limit }),
    listDurableFirms: (next?: boolean) =>
      safeInvoke<DurabilityIteration>('list_durable_firms', {
        next: next === true,
        advance: next === true,
      }),
    inspectMissionFirmLead: (payload) =>
      safeInvoke<MissionInspectResult>('inspect_mission_firm_lead', {
        firmId: payload.firm_id,
        source: payload.source,
        externalId: payload.external_id,
        absoluteUrl: payload.absolute_url,
        location: payload.location,
      }),
    searchMissionFirms: (filter?: MissionFirmFilter) =>
      safeInvoke<MissionFirmLead[]>('search_mission_firms', {
        q: filter?.q,
        firms: filter?.firms,
        texasOnly: filter?.texas_only ?? false,
        terafabBias: filter?.terafab_bias ?? true,
        limit: filter?.limit ?? 80,
        forceRefresh: filter?.force_refresh ?? false,
      }),
    importMissionFirmLead: (payload) =>
      safeInvoke<Opportunity>('import_mission_firm_lead', {
        firmId: payload.firm_id,
        source: payload.source,
        externalId: payload.external_id,
        absoluteUrl: payload.absolute_url,
      }),
    loadNetworkGraph: (payload) =>
      safeInvoke<NetworkGraphResult>('load_network_graph', {
        path: payload?.path,
        contactsPath: payload?.contacts_path,
        forceReimport: payload?.force_reimport ?? false,
        topN: payload?.top_n ?? 20,
      }),
    resolveNetworkXProfiles: (payload) =>
      safeInvoke<NetworkGraphResult>('resolve_network_x_profiles', {
        graph: payload.graph,
        topN: payload.top_n ?? 20,
        ids: payload.ids,
      }),
    enrichNetworkLinkedIn: (payload) =>
      safeInvoke<NetworkGraphResult>('enrich_network_linkedin', {
        graph: payload.graph,
        topN: payload.top_n ?? 20,
        ids: payload.ids,
      }),
    getDevprofilePath: () => safeInvoke<string | null>('get_devprofile_path_cmd', {}),
    setDevprofilePath: (p) => safeInvoke<void>('set_devprofile_path_cmd', { path: p }),
    proposeCvSidecar: (id) => safeInvoke('propose_cv_sidecar_for_prep', { opportunityId: id }),
    exportApplicationPack: (id) =>
      safeInvoke('export_application_pack', { opportunityId: id }),
    generateApplyCv: (id) => safeInvoke('generate_apply_cv', { opportunityId: id }),
  }
}

export function finderPortForEffects(port: FinderPort) {
  return {
    async search(query: string) {
      const result = await port.search(query)
      if (!result.ok) throw result.error
      return result.value
    },
    async runCycle(query: string, cvSummary: string) {
      const result = await port.runCycle(query, cvSummary)
      if (!result.ok) throw result.error
      return result.value
    },
    async reactorState() {
      const result = await port.reactorState()
      if (!result.ok) throw result.error
      return result.value
    },
    async promote(leadId?: string) {
      const result = await port.promote(leadId)
      if (!result.ok) throw result.error
      return result.value
    },
    // History (for MVU effects / refresh; throw on err like others)
    async getSearchHistory(limit?: number) {
      const result = await port.getSearchHistory(limit)
      if (!result.ok) throw result.error
      return result.value
    },
    async getLeads(filter?: LeadFilter) {
      const result = await port.getLeads(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async getDashboardStats() {
      const result = await port.getDashboardStats()
      if (!result.ok) throw result.error
      return result.value
    },
    async getRecentPauses(limit?: number) {
      const result = await port.getRecentPauses(limit)
      if (!result.ok) throw result.error
      return result.value
    },
    async getEvents(filter?: EventFilter) {
      const result = await port.getEvents(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async searchPastTweets(ftsQuery: string, limit?: number) {
      const result = await port.searchPastTweets(ftsQuery, limit)
      if (!result.ok) throw result.error
      return result.value
    },
    async getSearchRun(id: number) {
      const result = await port.getSearchRun(id)
      if (!result.ok) throw result.error
      return result.value
    },
    async hydrateTweet(id: string) {
      const result = await port.hydrateTweet(id)
      if (!result.ok) throw result.error
      return result.value
    },
    async logEvent(eventType: string, payload?: string, correlationId?: string) {
      const result = await port.logEvent(eventType, payload, correlationId)
      if (!result.ok) throw result.error
      return result.value
    },
    async analyzeOpportunityTarget(payload: { url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string }) {
      const result = await port.analyzeOpportunityTarget(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async prepOpportunityTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string; previous_fit?: string }) {
      const result = await port.prepOpportunityTarget(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async getOpportunities(filter?: OpportunityFilter) {
      const result = await port.getOpportunities(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async updateOpportunityStatus(id: number, status: string, notes?: string) {
      const result = await port.updateOpportunityStatus(id, status, notes)
      if (!result.ok) throw result.error
      return result.value
    },
    async getDevprofilePath() {
      const result = await port.getDevprofilePath()
      if (!result.ok) throw result.error
      return result.value
    },
    async setDevprofilePath(path: string | null) {
      const result = await port.setDevprofilePath(path)
      if (!result.ok) throw result.error
      return result.value
    },
    async proposeCvSidecar(opportunityId: number) {
      const result = await port.proposeCvSidecar(opportunityId)
      if (!result.ok) throw result.error
      return result.value
    },
    async exportApplicationPack(opportunityId: number) {
      const result = await port.exportApplicationPack(opportunityId)
      if (!result.ok) throw result.error
      return result.value
    },
    async generateApplyCv(opportunityId: number) {
      const result = await port.generateApplyCv(opportunityId)
      if (!result.ok) throw result.error
      return result.value
    },
    async fetchHireBoard(filter?: HireBoardFilter) {
      const result = await port.fetchHireBoard(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async selectHireBoardLead(payload: {
      company: string
      location?: string
      career_url: string
      thread_url?: string
    }) {
      const result = await port.selectHireBoardLead(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async searchPlatsbanken(filter?: PlatsbankenSearchFilter) {
      const result = await port.searchPlatsbanken(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async importPlatsbankenAd(adId: string) {
      const result = await port.importPlatsbankenAd(adId)
      if (!result.ok) throw result.error
      return result.value
    },
    async deleteOpportunity(id: number) {
      const result = await port.deleteOpportunity(id)
      if (!result.ok) throw result.error
    },
    async runLocalGrokQuest(payload: {
      prompt: string
      sessionId?: string
      resume?: boolean
      kind?: string
    }) {
      const result = await port.runLocalGrokQuest(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async persistQuestTurn(payload: {
      sessionId: string
      kind: string
      contextIds: string
      lastOppId?: number | null
      role: string
      text: string
      backend?: string | null
      promptChars?: number | null
    }) {
      const result = await port.persistQuestTurn(payload)
      if (!result.ok) throw result.error
    },
    async loadLatestQuestThread() {
      const result = await port.loadLatestQuestThread()
      if (!result.ok) throw result.error
      return result.value
    },
    async loadQuestThread(sessionId: string) {
      const result = await port.loadQuestThread(sessionId)
      if (!result.ok) throw result.error
      return result.value
    },
    async listQuestThreads(limit?: number) {
      const result = await port.listQuestThreads(limit)
      if (!result.ok) throw result.error
      return result.value
    },
    async searchQuestTurns(q: string, limit?: number) {
      const result = await port.searchQuestTurns(q, limit)
      if (!result.ok) throw result.error
      return result.value
    },
    async listDurableFirms(next?: boolean) {
      const result = await port.listDurableFirms(next)
      if (!result.ok) throw result.error
      return result.value
    },
    async inspectMissionFirmLead(payload: {
      firm_id: string
      source: string
      external_id: string
      absolute_url?: string
      location?: string
    }) {
      const result = await port.inspectMissionFirmLead(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async searchMissionFirms(filter?: MissionFirmFilter) {
      const result = await port.searchMissionFirms(filter)
      if (!result.ok) throw result.error
      return result.value
    },
    async importMissionFirmLead(payload: {
      firm_id: string
      source: string
      external_id: string
      absolute_url?: string
    }) {
      const result = await port.importMissionFirmLead(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async loadNetworkGraph(payload?: {
      path?: string
      contacts_path?: string
      force_reimport?: boolean
      top_n?: number
    }) {
      const result = await port.loadNetworkGraph(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async resolveNetworkXProfiles(payload: {
      graph: import('../../core/domain/network-graph').NetworkGraphResult
      top_n?: number
      ids?: string[]
    }) {
      const result = await port.resolveNetworkXProfiles(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async enrichNetworkLinkedIn(payload: {
      graph: import('../../core/domain/network-graph').NetworkGraphResult
      top_n?: number
      ids?: string[]
    }) {
      const result = await port.enrichNetworkLinkedIn(payload)
      if (!result.ok) throw result.error
      return result.value
    },
  }
}
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

    // Job targets (web/paste focus)
    fetchJobPage: (url) => safeInvoke('fetch_job_page', { url }),
    analyzeJobTarget: (payload) => safeInvoke('analyze_job_target', payload),
    prepJobTarget: (payload) => safeInvoke('prep_job_target', payload),
    getOpportunities: (filter) => safeInvoke<Opportunity[]>('get_opportunities', filter ?? {}),
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
    async analyzeJobTarget(payload: { url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string }) {
      const result = await port.analyzeJobTarget(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async prepJobTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; title?: string; company?: string; cv_summary?: string; previous_fit?: string }) {
      const result = await port.prepJobTarget(payload)
      if (!result.ok) throw result.error
      return result.value
    },
    async getOpportunities(filter?: OpportunityFilter) {
      const result = await port.getOpportunities(filter)
      if (!result.ok) throw result.error
      return result.value
    },
  }
}
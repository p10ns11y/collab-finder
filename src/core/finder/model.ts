import { idle, type AsyncState } from '../async'
import {
  DEFAULT_CV_SUMMARY,
  DEFAULT_SEARCH_QUERY,
  type Decision,
  type ReactorState,
  type Tweet,
} from '../domain/finder'
import { sanitizeCvPacket } from '../domain/cv-packet'
import type {
  DashboardStats,
  Event,
  Lead,
  Opportunity,
  Pause,
  SearchRun,
  SearchRunWithTweets,
} from '../domain/history'
import type { OpportunityTargetResult } from '../domain/opportunity-target'
import type { BearerStorageStatus } from '../domain/credentials'
import type { AppError } from '../error'

// Shared localStorage keys for CV + minimal session (used by initialFinderModel for sync boot load + effects for writes/loads).
// Central definition avoids drift (Issue 5). localStorage is the FE cache; DB is canonical for Opportunity data.
export const CV_LS_KEY = 'cf.cvSummary'
export const SESSION_LS_KEY = 'cf.lastSession'

export type PersistedSession = {
  lastActiveOppId?: number
  activeScreen?: FinderScreen
  opportunityTargetUrl?: string
}

const VALID_SCREENS: FinderScreen[] = ['discover', 'stats', 'history', 'data', 'lookup', 'settings', 'xplore']

export function isValidFinderScreen(s: unknown): s is FinderScreen {
  return typeof s === 'string' && VALID_SCREENS.includes(s as FinderScreen)
}

export type FinderScreen =
  | 'discover'
  | 'stats'
  | 'history'
  | 'data'
  | 'lookup'
  | 'settings'
  | 'xplore'

export type CredentialsSlice = {
  connected: boolean
  checking: boolean
  draft: string
  busy: boolean
  notice: string | null
  storage: BearerStorageStatus | null
}

export type HistorySlice = {
  searches: AsyncState<SearchRun[]>
  leads: AsyncState<Lead[]>
  pauses: AsyncState<Pause[]>
  events: AsyncState<Event[]>
  stats: AsyncState<DashboardStats | null>
  opportunities: AsyncState<Opportunity[]>
  lastRefreshed: number | null  // epoch ms of last successful HistoryRefreshed (any slice) — helps diagnose races / freshness for Data/History/rail after prep (TD-009)
}

export type FinderModel = {
  query: string
  cvSummary: string
  credentials: CredentialsSlice
  search: AsyncState<Tweet[]>
  cycle: AsyncState<Decision>
  decision: Decision | null
  reactorState: ReactorState | null
  pauses: string[]
  paletteOpen: boolean
  banner: AppError | null
  history: HistorySlice
  // Multi-screen shell
  activeScreen: FinderScreen
  // Lookup (FTS + run replay + hydrate)
  lookup: AsyncState<Tweet[]>
  lookupQuery: string
  selectedRunId: number | null
  selectedRun: AsyncState<SearchRunWithTweets | null>
  hydrate: AsyncState<Tweet | null>
  // Current target for quick analyze/prep (the "Quick Target" flow in Discover).
  // Works for any opportunity type (collab, side hustle, community, role, etc.).
  opportunityTarget: AsyncState<OpportunityTargetResult>
  opportunityTargetUrl?: string
  // Minimal session restore (localStorage; CV + last opp id + screen + url). DB is canonical for Opportunity data.
  lastActiveOppId?: number
  // Last proposal from "Propose these CV suggestions as sidecar" for display in the prep panel.
  lastSidecarProposal?: { preview: string; sidecar_path: string }
}

export function initialFinderModel(): FinderModel {
  // Minimal sync load of persisted session (CV + last ids + screen + url) from localStorage for zero-flash restore.
  // localStorage is FE-owned fast cache for CV (per design Key Decision 1 + user OQ); DB owns durable opps.
  // AppStarted will still issue loadCvCmd + conditional OpportunitySelected for async target hydrate + consistency.
  //
  // IMPORTANT: CV and session are loaded in *separate* try/catch blocks.
  // A corrupted CV string (CJK mojibake) used to throw later on session JSON.parse in the same
  // try — but more commonly, parse failure on a garbled session aborted after cvSummary was already
  // assigned to garbage, leaving Chinese-looking text and *no* lastActiveOppId restore.
  let cvSummary = DEFAULT_CV_SUMMARY
  let activeScreen: FinderScreen = 'discover'
  let lastActiveOppId: number | undefined = undefined
  let opportunityTargetUrl: string | undefined = undefined
  try {
    const savedCv = localStorage.getItem(CV_LS_KEY)
    const { value } = sanitizeCvPacket(savedCv, DEFAULT_CV_SUMMARY)
    cvSummary = value
  } catch {
    // ignore; keep DEFAULT_CV_SUMMARY
  }
  try {
    const sessRaw = localStorage.getItem(SESSION_LS_KEY)
    if (sessRaw) {
      const s = JSON.parse(sessRaw) as PersistedSession
      if (isValidFinderScreen(s.activeScreen)) {
        activeScreen = s.activeScreen
      }
      if (typeof s.lastActiveOppId === 'number' && s.lastActiveOppId > 0) {
        lastActiveOppId = s.lastActiveOppId
      }
      if (typeof s.opportunityTargetUrl === 'string' && s.opportunityTargetUrl.length > 0) {
        opportunityTargetUrl = s.opportunityTargetUrl
      }
    }
  } catch {
    // ignore; fall back to defaults (robustness for tampered/legacy LS)
  }
  return {
    query: DEFAULT_SEARCH_QUERY,
    cvSummary,
    credentials: {
      connected: false,
      checking: true,
      draft: '',
      busy: false,
      notice: null,
      storage: null,
    },
    search: idle(),
    cycle: idle(),
    decision: null,
    reactorState: null,
    pauses: [],
    paletteOpen: false,
    banner: null,
    history: {
      searches: idle(),
      leads: idle(),
      pauses: idle(),
      events: idle(),
      stats: idle(),
      opportunities: idle(),
      lastRefreshed: null,
    },
    activeScreen,
    lookup: idle(),
    lookupQuery: '',
    selectedRunId: null,
    selectedRun: idle(),
    hydrate: idle(),
    opportunityTarget: idle<OpportunityTargetResult>(),
    opportunityTargetUrl,
    lastActiveOppId,
    lastSidecarProposal: undefined,
  }
}
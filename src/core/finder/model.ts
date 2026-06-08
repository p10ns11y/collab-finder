import { idle, type AsyncState } from '../async'
import {
  DEFAULT_CV_SUMMARY,
  DEFAULT_SEARCH_QUERY,
  type Decision,
  type ReactorState,
  type Tweet,
} from '../domain/finder'
import type {
  DashboardStats,
  Event,
  Lead,
  Opportunity,
  Pause,
  SearchRun,
  SearchRunWithTweets,
} from '../domain/history'
import type { JobTargetResult } from '../domain/job-target'
import type { BearerStorageStatus } from '../domain/credentials'
import type { AppError } from '../error'

// Shared localStorage keys for CV + minimal session (used by initialFinderModel for sync boot load + effects for writes/loads).
// Central definition avoids drift (Issue 5). localStorage is the FE cache; DB is canonical for Opportunity data.
export const CV_LS_KEY = 'cf.cvSummary'
export const SESSION_LS_KEY = 'cf.lastSession'

export type PersistedSession = {
  lastActiveOppId?: number
  activeScreen?: FinderScreen
  jobTargetUrl?: string
}

const VALID_SCREENS: FinderScreen[] = ['discover', 'stats', 'history', 'data', 'lookup', 'settings', 'hunt']

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
  | 'hunt'

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
  // Job target (Quick Job Target analyze via grok-4.3; drives right panel priority + Data tab)
  jobTarget: AsyncState<JobTargetResult>
  jobTargetUrl?: string
  // Minimal session restore (localStorage; CV + last opp id + screen + url). DB is canonical for Opportunity data.
  lastActiveOppId?: number
}

export function initialFinderModel(): FinderModel {
  // Minimal sync load of persisted session (CV + last ids + screen + url) from localStorage for zero-flash restore.
  // localStorage is FE-owned fast cache for CV (per design Key Decision 1 + user OQ); DB owns durable opps.
  // AppStarted will still issue loadCvCmd + conditional OpportunitySelected for async jobTarget hydrate + consistency.
  let cvSummary = DEFAULT_CV_SUMMARY
  let activeScreen: FinderScreen = 'discover'
  let lastActiveOppId: number | undefined = undefined
  let jobTargetUrl: string | undefined = undefined
  try {
    const savedCv = localStorage.getItem(CV_LS_KEY)
    if (savedCv != null) cvSummary = savedCv
    const sessRaw = localStorage.getItem(SESSION_LS_KEY)
    if (sessRaw) {
      const s = JSON.parse(sessRaw) as PersistedSession
      if (isValidFinderScreen(s.activeScreen)) {
        activeScreen = s.activeScreen
      }
      if (typeof s.lastActiveOppId === 'number' && s.lastActiveOppId > 0) {
        lastActiveOppId = s.lastActiveOppId
      }
      if (s.jobTargetUrl) jobTargetUrl = s.jobTargetUrl
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
    },
    activeScreen,
    lookup: idle(),
    lookupQuery: '',
    selectedRunId: null,
    selectedRun: idle(),
    hydrate: idle(),
    jobTarget: idle<JobTargetResult>(),
    jobTargetUrl,
    lastActiveOppId,
  }
}
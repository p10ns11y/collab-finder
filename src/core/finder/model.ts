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
import type { BearerStorageStatus } from '../domain/credentials'
import type { AppError } from '../error'

export type FinderScreen =
  | 'discover'
  | 'stats'
  | 'history'
  | 'data'
  | 'lookup'
  | 'settings'

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
  jobTarget: AsyncState<any>
  jobTargetUrl?: string
}

export function initialFinderModel(): FinderModel {
  return {
    query: DEFAULT_SEARCH_QUERY,
    cvSummary: DEFAULT_CV_SUMMARY,
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
    activeScreen: 'discover',
    lookup: idle(),
    lookupQuery: '',
    selectedRunId: null,
    selectedRun: idle(),
    hydrate: idle(),
    jobTarget: idle(),
    jobTargetUrl: undefined,
  }
}
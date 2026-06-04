import { idle, type AsyncState } from '../async'
import {
  DEFAULT_CV_SUMMARY,
  DEFAULT_SEARCH_QUERY,
  type Decision,
  type ReactorState,
  type Tweet,
} from '../domain/finder'
import type { AppError } from '../error'

export type CredentialsSlice = {
  connected: boolean
  checking: boolean
  draft: string
  busy: boolean
  notice: string | null
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
    },
    search: idle(),
    cycle: idle(),
    decision: null,
    reactorState: null,
    pauses: [],
    paletteOpen: false,
    banner: null,
  }
}
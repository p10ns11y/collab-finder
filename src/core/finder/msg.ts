import type { CycleResult, ReactorState, Tweet } from '../domain/finder'
import type {
  DashboardStats,
  Event,
  Lead,
  Pause,
  SearchRun,
} from '../domain/history'
import type { AppError } from '../error'

/** All state transitions are explicit messages — no hidden setState. */
export type FinderMsg =
  | { type: 'AppStarted' }
  | { type: 'GlobalError'; error: AppError }
  | { type: 'BannerDismissed' }
  | { type: 'PaletteToggled' }
  | { type: 'PaletteClosed' }
  | { type: 'QueryChanged'; query: string }
  | { type: 'CvSummaryChanged'; cvSummary: string }
  | { type: 'PresetSelected'; query: string }
  | { type: 'CredentialsChecked'; connected: boolean }
  | { type: 'CredentialsDraftChanged'; draft: string }
  | { type: 'CredentialsSaveRequested' }
  | { type: 'CredentialsSaveSucceeded' }
  | { type: 'CredentialsSaveFailed'; error: AppError }
  | { type: 'CredentialsClearRequested' }
  | { type: 'CredentialsClearSucceeded' }
  | { type: 'CredentialsClearFailed'; error: AppError }
  | { type: 'SearchRequested' }
  | { type: 'SearchSucceeded'; tweets: Tweet[] }
  | { type: 'SearchFailed'; error: AppError }
  | { type: 'CycleRequested' }
  | { type: 'CycleSucceeded'; result: CycleResult }
  | { type: 'CycleFailed'; error: AppError }
  | { type: 'ReactorRefreshRequested' }
  | { type: 'ReactorRefreshSucceeded'; state: ReactorState }
  | { type: 'ReactorRefreshFailed'; error: AppError }
  | { type: 'PromoteRequested' }
  | { type: 'PromoteSucceeded'; message: string }
  | { type: 'PromoteFailed'; error: AppError }

  // History (durable lookup, fits MVU exactly like search/cycle)
  | { type: 'HistoryRefreshRequested' }
  | {
      type: 'HistoryRefreshed'
      searches?: SearchRun[]
      leads?: Lead[]
      pauses?: Pause[]
      events?: Event[]
      stats?: DashboardStats
    }
  | { type: 'HistoryFailed'; error: AppError }
  | { type: 'UiEventLogged'; eventType: string; payload?: string }
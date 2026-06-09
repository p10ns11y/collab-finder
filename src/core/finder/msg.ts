import type { BearerStorageStatus } from '../domain/credentials'
import type { CycleResult, ReactorState, Tweet } from '../domain/finder'
import type {
  DashboardStats,
  Event,
  Lead,
  Opportunity,
  Pause,
  SearchRun,
  SearchRunWithTweets,
} from '../domain/history'
import type { TargetAnalysisResult, TargetPrepResult } from '../domain/target'
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
  | { type: 'CvSummaryLoaded'; cvSummary: string }
  | { type: 'OpportunitySelected'; id: number; url?: string }
  | { type: 'TargetUrlSet'; url?: string }
  | { type: 'PresetSelected'; query: string }
  | { type: 'CredentialsChecked'; storage: BearerStorageStatus }
  | { type: 'CredentialsDraftChanged'; draft: string }
  | { type: 'CredentialsSaveRequested' }
  | { type: 'CredentialsSaveSucceeded'; storage: BearerStorageStatus }
  | { type: 'CredentialsSaveFailed'; error: AppError }
  | { type: 'CredentialsClearRequested' }
  | { type: 'CredentialsClearSucceeded'; storage: BearerStorageStatus }
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
      opportunities?: Opportunity[]
    }
  | { type: 'HistoryFailed'; error: AppError }
  | { type: 'UiEventLogged'; eventType: string; payload?: string }

  // Persist status surface (TD-011): basic banner for DB write fails (e.g. analyze/prep id=0)
  | { type: 'PersistFailed'; message: string }

  // Screen navigation (MVU, keyboard + sidebar + palette)
  | { type: 'ScreenChanged'; screen: import('./model').FinderScreen }

  // Lookup FTS + detail + hydrate (wired to existing backend ports)
  | { type: 'LookupQueryChanged'; query: string }
  | { type: 'LookupRequested' }
  | { type: 'LookupSucceeded'; tweets: Tweet[] }
  | { type: 'LookupFailed'; error: AppError }
  | { type: 'SearchRunSelected'; id: number }
  | { type: 'SearchRunLoaded'; run: SearchRunWithTweets }
  | { type: 'SearchRunLoadFailed'; error: AppError }
  | { type: 'HydrateRequested'; tweetId: string }
  | { type: 'HydrateSucceeded'; tweet: Tweet }
  | { type: 'HydrateFailed'; error: AppError }
  | { type: 'LookupCleared' }
  | { type: 'HydrateCleared' }

  // Target analyze (MVU integration for Quick Target flow in Discover)
  | { type: 'TargetAnalyzeRequested'; url?: string; pasted_jd?: string }
  | { type: 'TargetAnalyzeSucceeded'; result: TargetAnalysisResult }
  | { type: 'TargetAnalyzeFailed'; error: AppError }
  | { type: 'TargetCleared' }

  // Target prep (Slice C — Full Prep artifacts after fit evaluation)
  | { type: 'TargetPrepRequested'; opportunity_id?: number; url?: string; pasted_jd?: string }
  | { type: 'TargetPrepSucceeded'; result: TargetPrepResult }
  | { type: 'TargetPrepFailed'; error: AppError }

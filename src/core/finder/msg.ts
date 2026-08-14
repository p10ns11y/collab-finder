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
import type { OpportunityTargetAnalysisResult, OpportunityTargetPrepResult } from '../domain/opportunity-target'
import type { HireBoardLead } from '../domain/hire-board'
import type { PlatsbankenLead } from '../domain/platsbanken'
import type { MissionFirmLead } from '../domain/mission-firms'
import type { NetworkFilter, NetworkGraphResult } from '../domain/network-graph'
import type { AppError } from '../error'

/** All state transitions are explicit messages — no hidden setState. */
export type FinderMsg =
  | { type: 'AppStarted' }
  | { type: 'GlobalError'; error: AppError }
  | { type: 'BannerDismissed' }
  | { type: 'PaletteToggled' }
  | { type: 'PaletteClosed' }
  | { type: 'QuestToggled' }
  | { type: 'QuestClosed' }
  | { type: 'QuestKindChanged'; kind: import('../domain/quest').QuestKind }
  | { type: 'QuestDraftChanged'; draft: string }
  | { type: 'QuestContextToggled'; id: import('../domain/quest-context').QuestContextId }
  | { type: 'QuestRequested' }
  | { type: 'QuestSucceeded'; result: import('../domain/quest').QuestResult }
  | { type: 'QuestFailed'; error: AppError }
  | { type: 'QuestThreadCleared' }
  | { type: 'QuestThreadHydrated'; thread: import('../domain/quest').QuestThreadRecord }
  | { type: 'QuestRecentLoaded'; threads: import('../domain/quest').QuestThreadSummary[] }
  | { type: 'QuestLookupChanged'; q: string }
  | { type: 'QuestSearchRequested' }
  | { type: 'QuestSearchLoaded'; hits: import('../domain/quest').QuestTurnHit[] }
  | { type: 'QuestThreadLoadRequested'; sessionId: string }
  | { type: 'QueryChanged'; query: string }
  | { type: 'CvSummaryChanged'; cvSummary: string }
  | { type: 'CvSummaryLoaded'; cvSummary: string }
  /** User-triggered: restore distilled default packet and heal localStorage cache. */
  | { type: 'CvSummaryResetToDefaultRequested' }
  | { type: 'OpportunitySelected'; id: number; url?: string }
  | { type: 'OpportunityTargetUrlSet'; url?: string }
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

  // Opportunity target analyze (MVU integration for Quick Target flow in Discover)
  | { type: 'OpportunityTargetAnalyzeRequested'; url?: string; pasted_jd?: string }
  | { type: 'OpportunityTargetAnalyzeSucceeded'; result: OpportunityTargetAnalysisResult }
  | { type: 'OpportunityTargetAnalyzeFailed'; error: AppError }
  | { type: 'OpportunityTargetCleared' }

  // Opportunity target prep (Slice C — Full Prep artifacts after fit evaluation)
  | { type: 'OpportunityTargetPrepRequested'; opportunity_id?: number; url?: string; pasted_jd?: string }
  | { type: 'OpportunityTargetPrepSucceeded'; result: OpportunityTargetPrepResult }
  | { type: 'OpportunityTargetPrepFailed'; error: AppError }

  // CV sidecar proposal from prep suggestions (sidecar-first, basic preview)
  | { type: 'CvSidecarProposeRequested'; opportunity_id: number }
  | { type: 'CvSidecarProposeSucceeded'; preview: string; sidecar_path: string; suggestions_count: number }
  | { type: 'CvSidecarProposeFailed'; error: AppError }

  // Durable application pack export (prep JSON → app-local files, no xAI)
  | { type: 'ApplicationPackExportRequested'; opportunity_id: number }
  | {
      type: 'ApplicationPackExportSucceeded'
      opportunity_id: number
      pack_dir: string
      pack_slug?: string
      company?: string | null
      title?: string | null
      files: string[]
      file_count: number
    }
  | { type: 'ApplicationPackExportFailed'; error: AppError }

  // One-click apply CV PDF via devprofile generate-apply-cv (no master CV mutation)
  | { type: 'GenerateApplyCvRequested'; opportunity_id: number }
  | {
      type: 'GenerateApplyCvSucceeded'
      opportunity_id: number
      pack_slug: string
      pack_dir: string
      pdf_path: string
      flat_pdf_path?: string | null
      submit_pdf_path?: string | null
      stdout_tail?: string
      export_files?: string[]
      export_file_count?: number
    }
  | { type: 'GenerateApplyCvFailed'; error: AppError }

  // Pipeline status (applied / passed / archived) — local DB, no xAI
  | { type: 'OpportunityStatusChangeRequested'; id: number; status: string }
  | { type: 'OpportunityStatusChangeSucceeded'; id: number; status: string }
  | { type: 'OpportunityStatusChangeFailed'; error: AppError }

  // Hire board (sheet skim → Select/Evaluate)
  | { type: 'HireBoardQChanged'; q: string }
  | { type: 'HireBoardGeoToggled'; tag: string }
  | { type: 'HireBoardRefreshRequested' }
  | { type: 'HireBoardRefreshSucceeded'; leads: HireBoardLead[] }
  | { type: 'HireBoardRefreshFailed'; error: AppError }
  | { type: 'HireBoardSelectRequested'; lead: HireBoardLead }
  | { type: 'HireBoardSelectSucceeded'; opportunity: Opportunity }
  | { type: 'HireBoardSelectFailed'; error: AppError }
  | { type: 'HireBoardEvaluateRequested'; lead: HireBoardLead }

  // Platsbanken emergency rail (JobTech → Import/Evaluate → fit/prep/export)
  | { type: 'PlatsbankenQChanged'; q: string }
  | { type: 'PlatsbankenMunicipalityChanged'; municipality: string }
  | {
      type: 'HuntRailChipApplied'
      rail: import('../domain/hunt-rails').HuntRail
      q: string
      municipality?: string
      surface: 'sweden' | 'mission'
    }
  | { type: 'HuntHarvestKeyApplied'; key: string; surface: 'sweden' | 'mission' }
  | { type: 'PlatsbankenSearchRequested' }
  | { type: 'PlatsbankenSearchSucceeded'; leads: PlatsbankenLead[] }
  | { type: 'PlatsbankenSearchFailed'; error: AppError }
  | { type: 'PlatsbankenImportRequested'; lead: PlatsbankenLead }
  | { type: 'PlatsbankenImportSucceeded'; opportunity: Opportunity }
  | { type: 'PlatsbankenImportFailed'; error: AppError }
  | { type: 'PlatsbankenRemoveRequested'; lead: PlatsbankenLead }
  | { type: 'PlatsbankenRemoveSucceeded'; adId: string; opportunityId: number }
  | { type: 'PlatsbankenRemoveFailed'; error: AppError }
  | { type: 'PlatsbankenEvaluateRequested'; lead: PlatsbankenLead }

  // Mission firms (SpaceXAI Greenhouse + Swedish JobTech bridges)
  | { type: 'MissionFirmsQChanged'; q: string }
  | { type: 'MissionFirmsFirmToggled'; firmId: string }
  | { type: 'MissionFirmsTexasOnlyToggled' }
  | { type: 'MissionFirmsTerafabBiasToggled' }
  | { type: 'MissionFirmsSearchRequested'; forceRefresh?: boolean }
  | { type: 'MissionFirmsSearchSucceeded'; leads: MissionFirmLead[] }
  | { type: 'MissionFirmsSearchFailed'; error: AppError }
  | { type: 'MissionFirmsImportRequested'; lead: MissionFirmLead }
  | { type: 'MissionFirmsImportSucceeded'; opportunity: Opportunity }
  | { type: 'MissionFirmsImportFailed'; error: AppError }
  | { type: 'MissionFirmsEvaluateRequested'; lead: MissionFirmLead }

  // Network graph (local connections.csv → score → top-20 X → LI public meta)
  | { type: 'NetworkFilterChanged'; filter: NetworkFilter }
  | { type: 'NetworkLoadRequested'; force_reimport?: boolean }
  | { type: 'NetworkLoadSucceeded'; graph: NetworkGraphResult }
  | { type: 'NetworkLoadFailed'; error: AppError }
  | { type: 'NetworkResolveXRequested' }
  | { type: 'NetworkResolveXSucceeded'; graph: NetworkGraphResult }
  | { type: 'NetworkResolveXFailed'; error: AppError }
  | { type: 'NetworkEnrichLinkedInRequested' }
  | { type: 'NetworkEnrichLinkedInSucceeded'; graph: NetworkGraphResult }
  | { type: 'NetworkEnrichLinkedInFailed'; error: AppError }

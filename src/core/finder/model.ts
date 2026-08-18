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
import type { HireBoardLead } from '../domain/hire-board'
import type { PlatsbankenLead } from '../domain/platsbanken'
import {
  PLATSBANKEN_DEFAULT_MUNICIPALITY,
  PLATSBANKEN_DEFAULT_QUERY,
} from '../domain/platsbanken'
import type { HarvestedKey, HuntRail } from '../domain/hunt-rails'
import type {
  QuestKind,
  QuestResult,
  QuestThreadSummary,
  QuestTurn,
  QuestTurnHit,
} from '../domain/quest'
import {
  DEFAULT_QUEST_CONTEXT_IDS,
  type QuestContextId,
} from '../domain/quest-context'
import type { MissionFirmLead } from '../domain/mission-firms'
import type { DurabilityIteration } from '../domain/firm-durability'
import {
  MISSION_FIRMS_DEFAULT_QUERY,
  MISSION_FIRMS_DEFAULT_SELECTED,
} from '../domain/mission-firms'
import type { BearerStorageStatus } from '../domain/credentials'
import type { NetworkFilter, NetworkGraphResult } from '../domain/network-graph'
import type { AppError } from '../error'

// Shared localStorage keys for CV + minimal session (used by initialFinderModel for sync boot load + effects for writes/loads).
// Central definition avoids drift (Issue 5). localStorage is the FE cache; DB is canonical for Opportunity data.
export const CV_LS_KEY = 'cf.cvSummary'
export const SESSION_LS_KEY = 'cf.lastSession'
/** Cap persisted paste so session JSON stays small; evaluate still sends the live textarea. */
export const PASTED_JD_SESSION_MAX_CHARS = 24000

export type PersistedSession = {
  lastActiveOppId?: number
  activeScreen?: FinderScreen
  opportunityTargetUrl?: string
  opportunityTargetPastedJd?: string
}

const VALID_SCREENS: FinderScreen[] = [
  'heading',
  'discover',
  'mission',
  'sweden',
  'stats',
  'history',
  'data',
  'lookup',
  'settings',
  'xplore',
  'network',
]

export function isValidFinderScreen(s: unknown): s is FinderScreen {
  return typeof s === 'string' && VALID_SCREENS.includes(s as FinderScreen)
}

export type FinderScreen =
  | 'heading'
  | 'discover'
  | 'mission'
  | 'sweden'
  | 'stats'
  | 'history'
  | 'data'
  | 'lookup'
  | 'settings'
  | 'xplore'
  | 'network'

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
  questOpen: boolean
  questKind: QuestKind
  questDraft: string
  questContextIds: QuestContextId[]
  questSessionId?: string
  questTurns: QuestTurn[]
  questRecent: QuestThreadSummary[]
  questHits: QuestTurnHit[]
  questLookupQ: string
  quest: AsyncState<QuestResult>
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
  /** Pasted JD from Evaluate / hydrate — Prepare bundle must send this when there is no URL. */
  opportunityTargetPastedJd?: string
  // Hire board (ephemeral sheet skim — not SQLite until Select/Evaluate)
  hireBoard: AsyncState<HireBoardLead[]>
  hireBoardQ: string
  hireBoardGeo: string[]
  // Platsbanken emergency rail (JobTech JobSearch — AF benefits runway)
  platsbanken: AsyncState<PlatsbankenLead[]>
  platsbankenQ: string
  platsbankenMunicipality: string
  huntRail: HuntRail
  huntHarvested: HarvestedKey[]
  // Durability ranker v1 (public IR). Idle until Mission mounts.
  durableFirms: AsyncState<DurabilityIteration>
  missionInspect: AsyncState<import('../domain/firm-durability').MissionInspectResult>
  // Mission firms (SpaceXAI + Swedish Texas/physical-AI bridges)
  missionFirms: AsyncState<MissionFirmLead[]>
  missionFirmsQ: string
  missionFirmsSelected: string[]
  missionFirmsTexasOnly: boolean
  missionFirmsTerafabBias: boolean
  // Network graph (gitignored LinkedIn connections CSV — PII local only)
  network: AsyncState<NetworkGraphResult>
  networkFilter: NetworkFilter
  networkBusyAction: 'idle' | 'load' | 'resolve_x' | 'enrich_li'
  // Minimal session restore (localStorage; CV + last opp id + screen + url). DB is canonical for Opportunity data.
  lastActiveOppId?: number
  // Last proposal from "Propose these CV suggestions as sidecar" for display in the prep panel.
  lastSidecarProposal?: { preview: string; sidecar_path: string }
  // Last durable application pack export (files under application_packs/{slug}/).
  lastApplicationPackExport?: {
    opportunity_id: number
    pack_dir: string
    pack_slug?: string
    company?: string | null
    title?: string | null
    files: string[]
    file_count: number
  }
  // Last apply CV PDF from devprofile generate-apply-cv (no master mutation).
  lastApplyCv?: {
    opportunity_id: number
    pack_slug: string
    pack_dir: string
    pdf_path: string
    flat_pdf_path?: string | null
    submit_pdf_path?: string | null
  }
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
  let opportunityTargetPastedJd: string | undefined = undefined
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
      if (typeof s.opportunityTargetPastedJd === 'string' && s.opportunityTargetPastedJd.trim()) {
        opportunityTargetPastedJd = s.opportunityTargetPastedJd
      }
    }
  } catch {
    // ignore; fall back to defaults (robustness for tampered/legacy LS)
  }
  try {
    if (typeof window !== 'undefined') {
      const slug = window.location.hash.replace(/^#/, '').split('?')[0]?.trim().toLowerCase()
      if (isValidFinderScreen(slug)) activeScreen = slug
    }
  } catch {
    // ignore
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
    questOpen: false,
    questKind: 'free',
    questDraft: '',
    questContextIds: [...DEFAULT_QUEST_CONTEXT_IDS],
    questSessionId: undefined,
    questTurns: [],
    questRecent: [],
    questHits: [],
    questLookupQ: '',
    quest: idle(),
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
    opportunityTargetPastedJd,
    hireBoard: idle<HireBoardLead[]>(),
    hireBoardQ: '',
    hireBoardGeo: [],
    platsbanken: idle<PlatsbankenLead[]>(),
    platsbankenQ: PLATSBANKEN_DEFAULT_QUERY,
    platsbankenMunicipality: PLATSBANKEN_DEFAULT_MUNICIPALITY,
    huntRail: 'honest',
    huntHarvested: [],
    durableFirms: idle<DurabilityIteration>(),
    missionInspect: idle(),
    missionFirms: idle<MissionFirmLead[]>(),
    missionFirmsQ: MISSION_FIRMS_DEFAULT_QUERY,
    missionFirmsSelected: [...MISSION_FIRMS_DEFAULT_SELECTED],
    missionFirmsTexasOnly: false,
    missionFirmsTerafabBias: true,
    network: idle<NetworkGraphResult>(),
    networkFilter: 'top50',
    networkBusyAction: 'idle',
    lastActiveOppId,
    lastSidecarProposal: undefined,
    lastApplicationPackExport: undefined,
    lastApplyCv: undefined,
  }
}
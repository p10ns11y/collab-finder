import { idle, type AsyncState } from '../async'
import { appError, errorMessage } from '../error'
import type { Cmd } from '../mvu/engine'
import type { FinderModel } from './model'
import type { FinderMsg } from './msg'
import type { OpportunityTargetResult } from '../domain/opportunity-target'

export type FinderUpdate = (
  model: FinderModel,
  msg: FinderMsg,
) => readonly [model: FinderModel, cmd?: Cmd<FinderMsg> | Cmd<FinderMsg>[]]

/** Pure transition function — no I/O. */
export function updateFinder(model: FinderModel, msg: FinderMsg): ReturnType<FinderUpdate> {
  switch (msg.type) {
    case 'AppStarted':
      return [model]

    case 'GlobalError':
      return [{ ...model, banner: msg.error }]

    case 'BannerDismissed':
      return [{ ...model, banner: null }]

    case 'PaletteToggled':
      return [{ ...model, paletteOpen: !model.paletteOpen }]

    case 'PaletteClosed':
      return [{ ...model, paletteOpen: false }]

    case 'QueryChanged':
      return [{ ...model, query: msg.query }]

    case 'CvSummaryChanged':
      return [{ ...model, cvSummary: msg.cvSummary }]

    case 'CvSummaryLoaded':
      return [{ ...model, cvSummary: msg.cvSummary }]

    case 'OpportunitySelected':
      return [
        {
          ...model,
          lastActiveOppId: msg.id,
          // Set url if provided (from Data row or restore); enables exact "Open URL" + prep re-use with correct source after hydrate.
          ...(msg.url !== undefined ? { opportunityTargetUrl: msg.url } : {}),
          // Mark loading for the hydrate path (succeeded will populate from DB data; no re-xAI).
          opportunityTarget: { status: 'loading' } as AsyncState<OpportunityTargetResult>,
          banner: null,
        },
      ]

    case 'PresetSelected':
      return [{ ...model, query: msg.query }]

    case 'CredentialsChecked':
      return [
        {
          ...model,
          credentials: {
            ...model.credentials,
            connected: msg.storage.connected,
            storage: msg.storage,
            checking: false,
          },
        },
      ]

    case 'CredentialsDraftChanged':
      return [
        {
          ...model,
          credentials: { ...model.credentials, draft: msg.draft, notice: null },
        },
      ]

    case 'CredentialsSaveRequested':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: true, notice: null },
          banner: null,
        },
      ]

    case 'CredentialsSaveSucceeded':
      return [
        {
          ...model,
          credentials: {
            ...model.credentials,
            connected: true,
            checking: false,
            draft: '',
            busy: false,
            notice: null,
            storage: msg.storage,
          },
        },
      ]

    case 'CredentialsSaveFailed':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: false },
          banner: msg.error,
        },
      ]

    case 'CredentialsClearRequested':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: true, notice: null },
        },
      ]

    case 'CredentialsClearSucceeded':
      return [
        {
          ...model,
          credentials: {
            connected: false,
            checking: false,
            draft: '',
            busy: false,
            notice: null,
            storage: msg.storage,
          },
          search: idle(),
        },
      ]

    case 'CredentialsClearFailed':
      return [
        {
          ...model,
          credentials: { ...model.credentials, busy: false },
          banner: msg.error,
        },
      ]

    case 'SearchRequested':
      return [{ ...model, search: { status: 'loading' }, banner: null }]

    case 'SearchSucceeded':
      return [{ ...model, search: { status: 'ready', data: msg.tweets } }]

    case 'SearchFailed':
      return [
        {
          ...model,
          search: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'CycleRequested':
      return [{ ...model, cycle: { status: 'loading' }, banner: null }]

    case 'CycleSucceeded': {
      const { decision, tweets } = msg.result
      const pauses =
        decision.guards_triggered.length > 0
          ? [
              ...model.pauses,
              `PAUSED on guards: ${JSON.stringify(decision.guards_triggered)}`,
            ]
          : model.pauses
      const banner =
        decision.guards_triggered.length > 0
          ? {
              code: 'reactor' as const,
              message: `Guards triggered — review before continuing.`,
              cause: JSON.stringify(decision.guards_triggered),
            }
          : model.banner
      return [
        {
          ...model,
          cycle: { status: 'ready', data: decision },
          decision,
          search: tweets.length > 0 ? { status: 'ready', data: tweets } : model.search,
          pauses,
          banner,
        },
      ]
    }

    case 'CycleFailed':
      return [
        {
          ...model,
          cycle: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'ReactorRefreshSucceeded':
      return [{ ...model, reactorState: msg.state }]

    case 'ReactorRefreshFailed':
      return [{ ...model, banner: msg.error }]

    case 'PromoteSucceeded':
      return [
        {
          ...model,
          pauses: [
            ...model.pauses,
            `CV promote: ${msg.message} (sidecar-first — confirm before live portfolio).`,
          ],
        },
      ]

    case 'PromoteFailed':
      return [{ ...model, banner: msg.error }]

    case 'HistoryRefreshRequested':
      // Do NOT blank all slices to loading (old behavior caused History + Data to appear empty
      // immediately after evaluate/prep/search/cycle until a full AppStarted refresh or manual re-open).
      // The background historyRefreshCmd will emit incremental HistoryRefreshed as each slice arrives.
      // Previous ready data (if any) remains visible in selectors + screens during the refresh window.
      // This directly addresses the post-evaluate "History/Data show empty (data not lost on restart)" symptom
      // and the related fan-out race noted in tech-debt-deep-dive TD-009 + UX reviews.
      return [
        {
          ...model,
          banner: null,
        },
      ]

    case 'HistoryRefreshed': {
      const h = { ...model.history }
      if (msg.searches) h.searches = { status: 'ready', data: msg.searches }
      if (msg.leads) h.leads = { status: 'ready', data: msg.leads }
      if (msg.pauses) h.pauses = { status: 'ready', data: msg.pauses }
      if (msg.events) h.events = { status: 'ready', data: msg.events }
      if (msg.stats) h.stats = { status: 'ready', data: msg.stats }
      if (msg.opportunities) h.opportunities = { status: 'ready', data: msg.opportunities }
      return [{ ...model, history: h }]
    }

    case 'HistoryFailed':
      return [
        {
          ...model,
          history: {
            ...model.history,
            searches: { status: 'failed', error: msg.error },
            leads: { status: 'failed', error: msg.error },
            pauses: { status: 'failed', error: msg.error },
            events: { status: 'failed', error: msg.error },
            stats: { status: 'failed', error: msg.error },
            opportunities: { status: 'failed', error: msg.error },
          },
          banner: msg.error,
        },
      ]

    case 'PersistFailed':
      return [
        {
          ...model,
          banner: appError('persist', msg.message),
        },
      ]

    case 'UiEventLogged':
      // Pure UI intent logged via backend (no model change needed).
      return [model]

    case 'ScreenChanged':
      return [{ ...model, activeScreen: msg.screen }]

    case 'LookupQueryChanged':
      return [{ ...model, lookupQuery: msg.query }]

    case 'LookupRequested':
      return [{ ...model, lookup: { status: 'loading' }, banner: null }]

    case 'LookupSucceeded':
      return [{ ...model, lookup: { status: 'ready', data: msg.tweets } }]

    case 'LookupFailed':
      return [
        {
          ...model,
          lookup: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'SearchRunSelected':
      return [
        {
          ...model,
          selectedRunId: msg.id,
          selectedRun: { status: 'loading' },
          hydrate: idle(),
        },
      ]

    case 'SearchRunLoaded':
      return [{ ...model, selectedRun: { status: 'ready', data: msg.run } }]

    case 'SearchRunLoadFailed':
      return [
        {
          ...model,
          selectedRun: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'HydrateRequested':
      return [{ ...model, hydrate: { status: 'loading' } }]

    case 'HydrateSucceeded':
      return [{ ...model, hydrate: { status: 'ready', data: msg.tweet } }]

    case 'HydrateFailed':
      return [
        {
          ...model,
          hydrate: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    case 'LookupCleared':
      return [{ ...model, lookup: idle(), lookupQuery: '', selectedRunId: null, selectedRun: idle(), hydrate: idle() }]

    case 'HydrateCleared':
      return [{ ...model, hydrate: idle() }]

    // Opportunity target MVU (no raw invoke in views)
    case 'OpportunityTargetAnalyzeRequested':
      return [
        {
          ...model,
          opportunityTarget: { status: 'loading' },
          opportunityTargetUrl: msg.url,
          banner: null,
        },
      ]
    case 'OpportunityTargetAnalyzeSucceeded':
      return [
        {
          ...model,
          opportunityTarget: { status: 'ready', data: msg.result },
          lastActiveOppId: msg.result.opportunity_id,
        },
      ]
    case 'OpportunityTargetAnalyzeFailed':
      return [
        {
          ...model,
          opportunityTarget: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'OpportunityTargetCleared':
      return [
        {
          ...model,
          opportunityTarget: idle(),
          opportunityTargetUrl: undefined,
        },
      ]

    case 'OpportunityTargetUrlSet':
      // Pure setter (no I/O effect) used by restore/load paths to sync the display url (for panel "Open" button + prep dispatch) without triggering analyze.
      return [{ ...model, opportunityTargetUrl: msg.url }]

    // Opportunity target prep (Slice C)
    case 'OpportunityTargetPrepRequested':
      // Preserve previous ready data (the fit analysis) on the loading state.
      // The AsyncState<'loading'> type doesn't declare .data, but we carry it
      // here so the Succeeded reducer below can merge the prep artifacts
      // without losing the original fit/score (the root cause of the 0/100 low fit
      // bug after clicking the prep CTA in the panel).
      // (Cheap carry hack preserved per design; no new state machinery or model fields added.)
      // Only pull from 'ready' here (a 'loading' carry from a concurrent/prior prep request would be stale anyway; the effects previous_fit path handles the transient loading+data case).
      const prevForPrep: OpportunityTargetResult | undefined = (model.opportunityTarget && model.opportunityTarget.status === 'ready')
        ? model.opportunityTarget.data
        : undefined
      return [
        {
          ...model,
          // SAFETY: intentional structural escape to carry .data on the loading arm (AsyncState<loading> has no data per async.ts:6-8); see design PR2 "cheap carry hack preserved (no new state machinery)", TD-006 + prior 0/100 prep bug. NOT `as any`; downstream uses 'in' guards + union.
          opportunityTarget: { status: 'loading', data: prevForPrep } as AsyncState<OpportunityTargetResult>,
          banner: null,
        },
      ]
    case 'OpportunityTargetPrepSucceeded':
      // Merge prep artifacts into the previous data (carried through the loading
      // state) so the original fit analysis remains visible alongside the prep pack.
      const prevData: OpportunityTargetResult | undefined =
        model.opportunityTarget &&
        (model.opportunityTarget.status === 'ready' || model.opportunityTarget.status === 'loading') &&
        'data' in model.opportunityTarget
          ? (model.opportunityTarget as { data?: OpportunityTargetResult }).data
          : undefined
      // SAFETY: the two `as` below are narrow escapes only for the preserved carry hack (see Requested case SAFETY + design); no `as any`, no behavior change.
      const merged: OpportunityTargetResult = { ...(prevData ?? ({} as OpportunityTargetResult)), ...msg.result } as OpportunityTargetResult
      return [
        {
          ...model,
          opportunityTarget: { status: 'ready', data: merged },
          lastActiveOppId: msg.result.opportunity_id,
        },
      ]
    case 'OpportunityTargetPrepFailed':
      return [
        {
          ...model,
          opportunityTarget: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]

    default:
      return [model]
  }
}

export function searchResults(model: FinderModel) {
  return model.search.status === 'ready' ? model.search.data : []
}

export function bannerText(model: FinderModel): string | null {
  return errorMessage(model.banner)
}
import { idle, type AsyncState } from '../async'
import { errorMessage } from '../error'
import type { Cmd } from '../mvu/engine'
import type { FinderModel } from './model'
import type { FinderMsg } from './msg'
import type { JobTargetResult } from '../domain/job-target'

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
      return [
        {
          ...model,
          history: {
            ...model.history,
            searches: { status: 'loading' },
            leads: { status: 'loading' },
            stats: { status: 'loading' },
            opportunities: { status: 'loading' },
          },
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
            opportunities: { status: 'failed', error: msg.error },
          },
          banner: msg.error,
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

    // Job target MVU (no raw invoke in views)
    case 'JobTargetAnalyzeRequested':
      return [
        {
          ...model,
          jobTarget: { status: 'loading' },
          jobTargetUrl: msg.url,
          banner: null,
        },
      ]
    case 'JobTargetAnalyzeSucceeded':
      return [
        {
          ...model,
          jobTarget: { status: 'ready', data: msg.result },
        },
      ]
    case 'JobTargetAnalyzeFailed':
      return [
        {
          ...model,
          jobTarget: { status: 'failed', error: msg.error },
          banner: msg.error,
        },
      ]
    case 'JobTargetCleared':
      return [
        {
          ...model,
          jobTarget: idle(),
          jobTargetUrl: undefined,
        },
      ]

    // Job target prep (Slice C)
    case 'JobTargetPrepRequested':
      // Preserve previous ready data (the fit analysis) on the loading state.
      // The AsyncState<'loading'> type doesn't declare .data, but we carry it
      // here so the Succeeded reducer below can merge the prep artifacts
      // without losing the original fit/score (the root cause of the 0/100 low fit
      // bug after clicking the prep CTA in the panel).
      // (Cheap carry hack preserved per design; no new state machinery or model fields added.)
      // Only pull from 'ready' here (a 'loading' carry from a concurrent/prior prep request would be stale anyway; the effects previous_fit path handles the transient loading+data case).
      const prevForPrep: JobTargetResult | undefined = (model.jobTarget && model.jobTarget.status === 'ready')
        ? model.jobTarget.data
        : undefined
      return [
        {
          ...model,
          // SAFETY: intentional structural escape to carry .data on the loading arm (AsyncState<loading> has no data per async.ts:6-8); see design PR2 "cheap carry hack preserved (no new state machinery)", TD-006 + prior 0/100 prep bug. NOT `as any`; downstream uses 'in' guards + union.
          jobTarget: { status: 'loading', data: prevForPrep } as AsyncState<JobTargetResult>,
          banner: null,
        },
      ]
    case 'JobTargetPrepSucceeded':
      // Merge prep artifacts into the previous data (carried through the loading
      // state) so the original fit analysis remains visible alongside the prep pack.
      const prevData: JobTargetResult | undefined =
        model.jobTarget &&
        (model.jobTarget.status === 'ready' || model.jobTarget.status === 'loading') &&
        'data' in model.jobTarget
          ? (model.jobTarget as { data?: JobTargetResult }).data
          : undefined
      // SAFETY: the two `as` below are narrow escapes only for the preserved carry hack (see Requested case SAFETY + design); no `as any`, no behavior change.
      const merged: JobTargetResult = { ...(prevData ?? ({} as JobTargetResult)), ...msg.result } as JobTargetResult
      return [
        {
          ...model,
          jobTarget: { status: 'ready', data: merged },
        },
      ]
    case 'JobTargetPrepFailed':
      return [
        {
          ...model,
          jobTarget: { status: 'failed', error: msg.error },
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
import { idle } from '../async'
import { errorMessage } from '../error'
import type { Cmd } from '../mvu/engine'
import type { FinderModel } from './model'
import type { FinderMsg } from './msg'

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
          credentials: { ...model.credentials, connected: msg.connected, checking: false },
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
            connected: true,
            checking: false,
            draft: '',
            busy: false,
            notice: 'Credentials stored securely (keychain + local fallback). Token not kept in UI state.',
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
            notice: 'Credentials removed from keychain.',
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
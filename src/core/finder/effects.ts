import { toAppError } from '../error'
import { fromPromise } from '../result'
import { requireConnection, validateBearerDraft } from '../security/credentials-policy'
import type { Cmd } from '../mvu/engine'
import type { FinderMsg } from './msg'
import type { FinderModel } from './model'
import type { LeadFilter } from '../../adapters/tauri/finder-adapter'

export type FinderPorts = {
  credentials: {
    getStorage(): Promise<import('../domain/credentials').BearerStorageStatus>
    save(token: string): Promise<void>
    clear(): Promise<void>
  }
  finder: {
    search(query: string): Promise<import('../domain/finder').Tweet[]>
    runCycle(query: string, cvSummary: string): Promise<import('../domain/finder').CycleResult>
    reactorState(): Promise<import('../domain/finder').ReactorState>
    promote(leadId?: string): Promise<string>
    // History (durable)
    getSearchHistory(limit?: number): Promise<import('../domain/history').SearchRun[]>
    getLeads(filter?: LeadFilter): Promise<import('../domain/history').Lead[]>
    getDashboardStats(): Promise<import('../domain/history').DashboardStats>
    getRecentPauses(limit?: number): Promise<import('../domain/history').Pause[]>
    getEvents(filter?: import('../domain/history').EventFilter): Promise<import('../domain/history').Event[]>
    searchPastTweets(ftsQuery: string, limit?: number): Promise<import('../domain/finder').Tweet[]>
    logEvent(eventType: string, payload?: string, correlationId?: string): Promise<void>
  }
}

export function credentialsCheckCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.credentials.getStorage(), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({
          type: 'CredentialsChecked',
          storage: {
            connected: false,
            active_source: 'none',
            file: {
              present: false,
              path: '',
              encrypted: false,
              permissions: '0600',
              why_not_encrypted: null,
            },
            keyring: {
              present: false,
              service: 'collab-finder',
              user: 'x-bearer',
              reachable: false,
              error: result.error.message,
            },
          },
        })
        return
      }
      dispatch({ type: 'CredentialsChecked', storage: result.value })
    })
  }
}

export function credentialsSaveCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const validated = validateBearerDraft(model.credentials.draft)
    if (!validated.ok) {
      dispatch({ type: 'CredentialsSaveFailed', error: validated.error })
      return
    }
    void fromPromise(ports.credentials.save(validated.value), toAppError).then(async (result) => {
      if (!result.ok) {
        dispatch({ type: 'CredentialsSaveFailed', error: result.error })
        return
      }
      let storage: import('../domain/credentials').BearerStorageStatus
      try {
        storage = await ports.credentials.getStorage()
      } catch (e) {
        dispatch({
          type: 'CredentialsSaveFailed',
          error: toAppError(e),
        })
        return
      }
      if (!storage.connected) {
        dispatch({
          type: 'CredentialsSaveFailed',
          error: {
            code: 'credentials_store_failed',
            message:
              'Save reported success but the token could not be read back. Restart the app and try again.',
          },
        })
        return
      }
      dispatch({ type: 'CredentialsSaveSucceeded', storage })
    })
  }
}

export function credentialsClearCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.credentials.clear(), toAppError).then(async (result) => {
      if (!result.ok) {
        dispatch({ type: 'CredentialsClearFailed', error: result.error })
        return
      }
      let storage: import('../domain/credentials').BearerStorageStatus
      try {
        storage = await ports.credentials.getStorage()
      } catch (e) {
        dispatch({ type: 'CredentialsClearFailed', error: toAppError(e) })
        return
      }
      dispatch({ type: 'CredentialsClearSucceeded', storage })
    })
  }
}

export function searchCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const gate = requireConnection(model.credentials.connected)
    if (!gate.ok) {
      dispatch({ type: 'SearchFailed', error: gate.error })
      return
    }
    void fromPromise(ports.finder.search(model.query), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'SearchFailed', error: result.error })
        return
      }
      dispatch({ type: 'SearchSucceeded', tweets: result.value })
    })
  }
}

export function cycleCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const gate = requireConnection(model.credentials.connected)
    if (!gate.ok) {
      dispatch({ type: 'CycleFailed', error: gate.error })
      return
    }
    void fromPromise(ports.finder.runCycle(model.query, model.cvSummary), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'CycleFailed', error: result.error })
        return
      }
      dispatch({ type: 'CycleSucceeded', result: result.value })
      dispatch({ type: 'ReactorRefreshRequested' })
    })
  }
}

export function reactorRefreshCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.reactorState(), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'ReactorRefreshFailed', error: result.error })
        return
      }
      dispatch({ type: 'ReactorRefreshSucceeded', state: result.value })
    })
  }
}

export function promoteCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.promote(), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PromoteFailed', error: result.error })
        return
      }
      dispatch({ type: 'PromoteSucceeded', message: result.value })
    })
  }
}

export function historyRefreshCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    // Parallel-ish loads for the dashboard slices.
    void fromPromise(ports.finder.getSearchHistory(60), toAppError).then((res) => {
      if (!res.ok) {
        dispatch({ type: 'HistoryFailed', error: res.error })
        return
      }
      // Chain the rest; on success dispatch partial refresh.
      dispatch({ type: 'HistoryRefreshed', searches: res.value })

      void fromPromise(ports.finder.getLeads({ limit: 80 }), toAppError).then((r) => {
        if (r.ok) dispatch({ type: 'HistoryRefreshed', leads: r.value })
      })
      void fromPromise(ports.finder.getDashboardStats(), toAppError).then((r) => {
        if (r.ok) dispatch({ type: 'HistoryRefreshed', stats: r.value })
      })
      void fromPromise(ports.finder.getRecentPauses(20), toAppError).then((r) => {
        if (r.ok) dispatch({ type: 'HistoryRefreshed', pauses: r.value })
      })
    })
  }
}

export function logUiEventCmd(
  ports: FinderPorts,
  eventType: string,
  payload?: string,
  correlationId?: string,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.logEvent(eventType, payload, correlationId), toAppError).then(
      (res) => {
        if (res.ok) {
          dispatch({ type: 'UiEventLogged', eventType, payload })
        }
      },
    )
  }
}

/** Maps messages that need I/O to commands. Pure update runs first in program layer. */
export function effectForMsg(
  ports: FinderPorts,
  model: FinderModel,
  msg: FinderMsg,
): Cmd<FinderMsg> | Cmd<FinderMsg>[] | undefined {
  switch (msg.type) {
    case 'AppStarted':
      // Load creds + initial history for the dashboard.
      return [credentialsCheckCmd(ports), historyRefreshCmd(ports)]
    case 'CredentialsSaveRequested':
      return credentialsSaveCmd(ports, model)
    case 'CredentialsClearRequested':
      return credentialsClearCmd(ports)
    case 'SearchRequested':
      return searchCmd(ports, model)
    case 'CycleRequested':
      return cycleCmd(ports, model)
    case 'ReactorRefreshRequested':
      return reactorRefreshCmd(ports)
    case 'PromoteRequested':
      return promoteCmd(ports)

    // Auto refresh history after successful ops (data now in DB).
    case 'SearchSucceeded':
      return historyRefreshCmd(ports)
    case 'CycleSucceeded':
      // Also log the cycle decision as event for audit.
      return [
        historyRefreshCmd(ports),
        logUiEventCmd(ports, 'CycleSucceeded', JSON.stringify({ action: model.cycle.status === 'ready' ? 'done' : '' })),
      ]

    // Log meaningful UI actions (not every keystroke).
    case 'PresetSelected':
      return logUiEventCmd(ports, 'PresetSelected', JSON.stringify({ query: msg.query }))
    case 'PromoteSucceeded':
      return logUiEventCmd(ports, 'PromoteSucceeded', msg.message)

    default:
      return undefined
  }
}
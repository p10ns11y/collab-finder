import { toAppError } from '../error'
import { fromPromise } from '../result'
import { requireConnection, validateBearerDraft } from '../security/credentials-policy'
import type { Cmd } from '../mvu/engine'
import type { FinderMsg } from './msg'
import type { FinderModel, PersistedSession } from './model'
import { CV_LS_KEY, SESSION_LS_KEY } from './model'
import type { LeadFilter, OpportunityFilter } from '../../adapters/tauri/finder-adapter'
import type { Opportunity } from '../domain/history'
import type { OpportunityTargetAnalysisResult, OpportunityTargetPrep, OpportunityTargetPrepResult, OpportunityTargetResult } from '../domain/opportunity-target'
import { cvSummaryForIpc, reconstructAnalysisFromOpportunity } from '../domain/opportunity-target-ipc'
import { isPlausibleCvPacket, sanitizeCvPacket } from '../domain/cv-packet'
import { DEFAULT_CV_SUMMARY } from '../domain/search-presets'

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
    getSearchRun(id: number): Promise<import('../domain/history').SearchRunWithTweets | null>
    hydrateTweet(id: string): Promise<import('../domain/finder').Tweet>
    logEvent(eventType: string, payload?: string, correlationId?: string): Promise<void>
    // Opportunity target analyze + visibility (MVU wired in Discover Quick Target flow)
    analyzeOpportunityTarget(payload: { url?: string; pasted_jd?: string; cv_summary?: string }): Promise<OpportunityTargetAnalysisResult>
    // Opportunity target prep
    prepOpportunityTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; cv_summary?: string; previous_fit?: string }): Promise<OpportunityTargetPrepResult>
    getOpportunities(filter?: OpportunityFilter): Promise<import('../domain/history').Opportunity[]>
    // devprofile + sidecar propose
    getDevprofilePath(): Promise<string | null>
    setDevprofilePath(path: string | null): Promise<void>
    proposeCvSidecar(opportunityId: number): Promise<{ opportunity_id: number; preview: string; sidecar_path: string; suggestions_count: number }>
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

export function proposeCvSidecarCmd(ports: FinderPorts, opportunityId: number): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.proposeCvSidecar(opportunityId), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'CvSidecarProposeFailed', error: result.error })
        return
      }
      const r = result.value as any
      dispatch({ type: 'CvSidecarProposeSucceeded', preview: r.preview || '', sidecar_path: r.sidecar_path || '', suggestions_count: r.suggestions_count || 0 })
    })
  }
}

export function opportunityTargetAnalyzeCmd(
  ports: FinderPorts,
  model: FinderModel,
  payload: { url?: string; pasted_jd?: string },
): Cmd<FinderMsg> {
  return (dispatch) => {
    // Use pure contract: empty/trimmed-to-empty becomes undefined so Rust can pick devprofile_path pruned or its DEFAULT.
    // Never force DEFAULT_CV_SUMMARY at the IPC boundary.
    const cvForIpc = cvSummaryForIpc(model.cvSummary.trim())
    const p = {
      url: payload.url,
      pasted_jd: payload.pasted_jd,
      cv_summary: cvForIpc,
    }
    if (import.meta.env.DEV) {
      console.debug('[finder] analyze_opportunity_target cv_summary ipc:', cvForIpc ? cvForIpc.length : 'undefined')
    }
    void fromPromise(ports.finder.analyzeOpportunityTarget(p), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'OpportunityTargetAnalyzeFailed', error: result.error })
        return
      }
      dispatch({ type: 'OpportunityTargetAnalyzeSucceeded', result: result.value })

      // Audit: OpportunityTargetAnalyzed with opportunity_id, score, cost
      const r: OpportunityTargetAnalysisResult = result.value
      const fit = r.fit
      const audit = JSON.stringify({
        opportunity_id: r.opportunity_id,
        overall: fit.overall,
        est_cost_usd: r.est_cost_usd,
      })
      void fromPromise(ports.finder.logEvent('OpportunityTargetAnalyzed', audit), toAppError).then((logRes) => {
        if (logRes.ok) {
          dispatch({ type: 'UiEventLogged', eventType: 'OpportunityTargetAnalyzed', payload: audit })
        }
      })

      // Surface persist status (TD-011): if analyze returned id=0, user sees issue (no silent 0s in Data/History).
      if ((r?.opportunity_id ?? 0) === 0) {
        dispatch({ type: 'PersistFailed', message: 'Opportunity persist returned id=0 (DB write issue or disabled). Check Data later.' })
      }

      // Refresh history so the new opportunity row appears in Data tab immediately (consistent with Search/Cycle)
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function opportunityTargetPrepCmd(
  ports: FinderPorts,
  model: FinderModel,
  payload: { opportunity_id?: number; url?: string; pasted_jd?: string },
): Cmd<FinderMsg> {
  return (dispatch) => {
    // if we have a prior opportunityTarget result with fit analysis, pass a compact version of it
    // so the prep prompt can be context-aware (gaps, rationale, recommended_action from the Evaluate Fit step).
    let previous_fit: string | undefined
    const ot = model.opportunityTarget
    // Note: may be 'loading' + carried data (the cheap preserve-for-merge pattern); use guard not status check only.
    if (ot && (ot.status === 'ready' || ot.status === 'loading') && 'data' in ot && ot.data) {
      // SAFETY: cast only to consume the preserved carry data on loading arm (see update.ts SAFETY comments + design PR2 carry hack); 'in' narrowing used immediately after.
      const d = ot.data as OpportunityTargetResult
      if ('fit' in d && d.fit) {
        previous_fit = JSON.stringify({
          overall: d.fit.overall,
          rationale: d.fit.rationale,
          gaps_must: d.fit.gaps_must,
          gaps_nice: d.fit.gaps_nice,
          recommended_action: d.fit.recommended_action,
        })
      }
    }

    const cvForIpc = cvSummaryForIpc(model.cvSummary.trim())
    const p = {
      opportunity_id: payload.opportunity_id,
      url: payload.url,
      pasted_jd: payload.pasted_jd,
      cv_summary: cvForIpc,
      previous_fit,
    }
    void fromPromise(ports.finder.prepOpportunityTarget(p), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'OpportunityTargetPrepFailed', error: result.error })
        return
      }
      dispatch({ type: 'OpportunityTargetPrepSucceeded', result: result.value })

      // Audit
      const r: OpportunityTargetPrepResult = result.value
      const audit = JSON.stringify({
        opportunity_id: r.opportunity_id ?? payload.opportunity_id,
        has_prep: !!r.prep,
        est_cost_usd: r.est_cost_usd,
      })
      void fromPromise(ports.finder.logEvent('OpportunityTargetPrepped', audit), toAppError).then((logRes) => {
        if (logRes.ok) {
          dispatch({ type: 'UiEventLogged', eventType: 'OpportunityTargetPrepped', payload: audit })
        }
      })

      // Surface persist status (TD-011) for prep path too (id may be prior oid or 0 on fresh fail).
      // When opportunity_id provided (in-place set_prep_artifacts after prior analyze), we return the prior oid even if set fails (eprint in Rust); user already has live fit+prep in panel so no PersistFailed dispatch (avoids false "missing" alarm). Relaxed condition here for any future 0 case on prep.
      if ((r?.opportunity_id ?? 0) === 0) {
        dispatch({ type: 'PersistFailed', message: 'Prep persist returned id=0 (DB write issue or disabled). Check Data later.' })
      }

      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function historyRefreshCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    // Searches (X runs) — gate the immediate partial so UI gets *something* quickly.
    void fromPromise(ports.finder.getSearchHistory(60), toAppError).then((res) => {
      if (!res.ok) {
        dispatch({ type: 'HistoryFailed', error: res.error })
        return
      }
      dispatch({ type: 'HistoryRefreshed', searches: res.value })
    })

    // Fan-out design (TD-009): independent parallel fromPromise + partial HistoryRefreshed.
    // Intentional (post non-blanking change in update.ts) so Data/History/Discover rail stay populated
    // during/after analyze/prep/search/cycle. Tradeoff: timing races between slices.
    // Mitigation: model.history.lastRefreshed (set on every HistoryRefreshed) + keep-old-data.
    // Future: coordinated snapshot (Promise.allSettled + single dispatch) or per-slice freshness.
    // See life-os/Projects/collab-finder/Collab Finder.md for session tracking of this item.
    // The rest are independent (no longer chained inside searches success).
    // This ensures that after a target analyze/prep (which only affects opportunities),
    // the Data "Opportunities" + History slices still get refreshed even if
    // search history is empty/slow or the outer call has issues.
    // Combined with the non-blanking change in update.ts HistoryRefreshRequested, this
    // prevents the "History/Data show empty after evaluate (until full restart)" bug.
    void fromPromise(ports.finder.getLeads({ limit: 80 }), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', leads: r.value })
    })
    void fromPromise(ports.finder.getDashboardStats(), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', stats: r.value })
    })
    void fromPromise(ports.finder.getRecentPauses(20), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', pauses: r.value })
    })
    // Events for Data screen
    void fromPromise(ports.finder.getEvents({ limit: 100 }), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', events: r.value })
    })
    // Opportunities (from target analyzes) — critical for Data tab + History + Discover "Resume last"
    void fromPromise(ports.finder.getOpportunities({ limit: 100 }), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', opportunities: r.value })
    })
  }
}

export function lookupCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const q = (model.lookupQuery || '').trim()
    if (!q) {
      dispatch({ type: 'LookupSucceeded', tweets: [] })
      return
    }
    void fromPromise(ports.finder.searchPastTweets(q, 30), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'LookupFailed', error: result.error })
        return
      }
      dispatch({ type: 'LookupSucceeded', tweets: result.value })
    })
  }
}

export function loadSearchRunCmd(ports: FinderPorts, id: number): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.getSearchRun(id), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'SearchRunLoadFailed', error: result.error })
        return
      }
      if (result.value) {
        dispatch({ type: 'SearchRunLoaded', run: result.value })
      } else {
        dispatch({
          type: 'SearchRunLoadFailed',
          error: toAppError(new Error(`Search run ${id} not found`)),
        })
      }
    })
  }
}

export function hydrateCmd(ports: FinderPorts, tweetId: string): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.hydrateTweet(tweetId), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'HydrateFailed', error: result.error })
        return
      }
      dispatch({ type: 'HydrateSucceeded', tweet: result.value })
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

// --- Minimal localStorage session utils (CV + last opp/screen/url for restore on AppStarted / Opportunity load).
// Keys + PersistedSession type imported from model.ts (single source; avoids literal drift).
// Per design: localStorage = fast FE-owned cache for cvSummary + tiny session ids (no Rust changes);
// DB (via getOpportunities) remains canonical truth for Opportunity rows (analysis/prep json).
// Migration note for future cv-promote-guard: treat LS as cache; on load prefer sidecar if present + reconcile;
// on promote: sidecar-first + diff + explicit user confirm (never auto-mutate external).

function readPersistedCv(): string | null {
  try {
    return localStorage.getItem(CV_LS_KEY)
  } catch {
    return null
  }
}

function persistCvToLocal(cv: string) {
  // Never write obvious mojibake / CJK-garbage back into the cache (that permanently poisons boot).
  if (!isPlausibleCvPacket(cv)) {
    console.warn('[finder] persistCvToLocal skipped: CV packet failed plausibility check (possible encoding corruption)')
    return
  }
  try {
    localStorage.setItem(CV_LS_KEY, cv)
  } catch {
    console.warn('[finder] persistCvToLocal failed (quota/private mode?)')
    /* ignore for best-effort */
  }
}

function readPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persistSessionToLocal(partial: Partial<PersistedSession>) {
  try {
    const prev = readPersistedSession() || {}
    const next: PersistedSession = { ...prev, ...partial }
    localStorage.setItem(SESSION_LS_KEY, JSON.stringify(next))
  } catch {
    console.warn('[finder] persistSessionToLocal failed')
    /* ignore */
  }
}

export function loadCvFromLocalCmd(): Cmd<FinderMsg> {
  return (dispatch) => {
    const raw = readPersistedCv()
    if (raw == null) return
    const { value, wasCorrupted } = sanitizeCvPacket(raw, DEFAULT_CV_SUMMARY)
    if (wasCorrupted) {
      console.warn(
        '[finder] CV packet in localStorage looked corrupted (CJK/mojibake); restored distilled default and re-wrote cache',
      )
      // Heal the cache so the next boot does not flash garbage again.
      try {
        localStorage.setItem(CV_LS_KEY, value)
      } catch {
        /* ignore */
      }
    }
    dispatch({ type: 'CvSummaryLoaded', cvSummary: value })
  }
}

/** Reset textarea + localStorage to the distilled default packet (user recovery control). */
export function resetCvToDefaultCmd(): Cmd<FinderMsg> {
  return (dispatch) => {
    try {
      localStorage.setItem(CV_LS_KEY, DEFAULT_CV_SUMMARY)
    } catch {
      console.warn('[finder] resetCvToDefault: localStorage write failed')
    }
    dispatch({ type: 'CvSummaryLoaded', cvSummary: DEFAULT_CV_SUMMARY })
  }
}

export function loadOpportunityCmd(ports: FinderPorts, id: number): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.getOpportunities({ id }), toAppError).then((res) => {
      if (!res.ok) {
        dispatch({ type: 'GlobalError', error: res.error })
        dispatch({ type: 'OpportunityTargetCleared' })
        return
      }
      const opps = (res.value || []) as Opportunity[]
      const o = opps.find((x) => x.id === id) || opps[0]
      if (!o) {
        dispatch({ type: 'GlobalError', error: toAppError(new Error(`Opportunity ${id} not found`)) })
        dispatch({ type: 'OpportunityTargetCleared' })
        return
      }
      // Persist what we now know for next restart (url for open button etc).
      persistSessionToLocal({ lastActiveOppId: o.id, opportunityTargetUrl: o.source_url })
      // Switch to discover and hydrate opportunityTarget from stored DB truth (no xAI cost).
      dispatch({ type: 'ScreenChanged', screen: 'discover' })
      // Ensure live model has the url for panel (Open button + prep re-dispatch with correct source_url). Pure setter, no I/O.
      dispatch({ type: 'OpportunityTargetUrlSet', url: o.source_url })

      // Robust reconstruct using the pure contract (moved to opportunity-target-ipc for testability and honest verify).
      let fitDispatched = false
      const reconstructed = reconstructAnalysisFromOpportunity(o)
      if (reconstructed) {
        dispatch({ type: 'OpportunityTargetAnalyzeSucceeded', result: reconstructed })
        fitDispatched = true
      }
      // If reconstruction produced a legacy stub (no cv meta), warn (the pure fn already produces the stub shape when needed).
      if (fitDispatched && reconstructed && (reconstructed.cv_chars_sent === 0 && reconstructed.cv_ipc_chars === 0)) {
        console.warn('[finder] hydrate: legacy/ stub analysis without cv meta for id', id)
      }

      if (o.prep_artifacts_json) {
        try {
          const parsed = JSON.parse(o.prep_artifacts_json) as Partial<OpportunityTargetPrepResult> & { prep?: unknown }
          const prepData =
            parsed && typeof parsed === 'object' && 'prep' in parsed && (parsed as { prep?: unknown }).prep
              ? (parsed as { prep?: unknown }).prep
              : parsed
          const prepRes: OpportunityTargetPrepResult = {
            opportunity_id: (parsed as { opportunity_id?: number }).opportunity_id ?? o.id,
            prep: prepData as OpportunityTargetPrep,
            est_cost_usd: (parsed as { est_cost_usd?: number }).est_cost_usd ?? 0,
          }
          dispatch({ type: 'OpportunityTargetPrepSucceeded', result: prepRes })
        } catch {
          console.warn('[finder] hydrate: malformed prep_artifacts_json for id', id)
          /* skip */
        }
      }

      if (!o.analysis_json && !o.prep_artifacts_json) {
        dispatch({ type: 'OpportunityTargetCleared' })
      }
    })
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
      // + CV from localStorage (CvSummaryLoaded, with corruption heal) + conditional last opp hydrate
      // via OpportunitySelected (model.lastActiveOppId from initialFinderModel / LS).
      // History refresh also re-attempts restore if the first select raced or session was missing.
      const appCmds: (Cmd<FinderMsg> | undefined)[] = [
        credentialsCheckCmd(ports),
        historyRefreshCmd(ports),
        loadCvFromLocalCmd(),
      ]
      const lastId = model.lastActiveOppId
      if (typeof lastId === 'number' && lastId > 0) {
        // Trigger the normal OpportunitySelected path (sets last, loads from DB via loadCmd which also does OpportunityTargetUrlSet for live model url, hydrates opportunityTarget + screen).
        // Prefer session URL so the panel external link is available before the DB round-trip returns.
        const bootUrl = model.opportunityTargetUrl
        appCmds.push((d) =>
          d({
            type: 'OpportunitySelected',
            id: lastId,
            ...(bootUrl ? { url: bootUrl } : {}),
          }),
        )
      }
      return appCmds.filter(Boolean) as Cmd<FinderMsg>[]

    case 'CvSummaryResetToDefaultRequested':
      return resetCvToDefaultCmd()
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
    case 'CvSidecarProposeRequested':
      return proposeCvSidecarCmd(ports, msg.opportunity_id)
    case 'OpportunityTargetAnalyzeRequested':
      return opportunityTargetAnalyzeCmd(ports, model, { url: msg.url, pasted_jd: msg.pasted_jd })
    case 'OpportunityTargetPrepRequested':
      return opportunityTargetPrepCmd(ports, model, { opportunity_id: msg.opportunity_id, url: msg.url, pasted_jd: msg.pasted_jd })

    // CV persist side-effect (localStorage cache). Triggered on every edit.
    case 'CvSummaryChanged':
      return (/*dispatch*/) => {
        persistCvToLocal(model.cvSummary)
      }

    // Session id/screen persist (for resume). Also creds probe for settings already handled.
    case 'ScreenChanged':
      // existing creds check for settings
      const credsCmd = msg.screen === 'settings' ? credentialsCheckCmd(ports) : undefined
      const sessCmd = (/*dispatch*/) => {
        persistSessionToLocal({ activeScreen: msg.screen })
      }
      return credsCmd ? [credsCmd, sessCmd] : sessCmd

    // Opportunity load + hydrate opportunityTarget from DB (no xAI). Also sets screen.
    // Note: url (if passed in msg from Data row) is applied in update *before* this effect runs; loadCmd ensures via OpportunityTargetUrlSet for AppStarted path.
    // Always run the load for explicit user intent (rail click, resume, data row) or startup restore.
    // The previous guard prevented loadCmd from ever running (because update sets 'loading' before effect sees the 'next' model).
    // loadCmd itself handles not-found / errors by clearing and GlobalError.
    case 'OpportunitySelected':
      return loadOpportunityCmd(ports, msg.id)

    // Persist last active opp (and url if known) so restart can resume exact opportunityTarget.
    case 'OpportunityTargetAnalyzeSucceeded':
      return (/*dispatch*/) => {
        persistSessionToLocal({ lastActiveOppId: msg.result.opportunity_id, opportunityTargetUrl: model.opportunityTargetUrl })
      }
    case 'OpportunityTargetPrepSucceeded':
      return (/*dispatch*/) => {
        persistSessionToLocal({ lastActiveOppId: msg.result.opportunity_id })
      }

    // After opportunities list arrives: if Discover has nothing selected but we know lastActiveOppId
    // (or session had one), hydrate it. Covers boot races where the first OpportunitySelected failed
    // or session restore only landed after history. Only when target is still idle (never clobber live work).
    case 'HistoryRefreshed':
      if (msg.opportunities && msg.opportunities.length > 0) {
        const targetIdle = !model.opportunityTarget || model.opportunityTarget.status === 'idle'
        if (targetIdle) {
          const wantId =
            typeof model.lastActiveOppId === 'number' && model.lastActiveOppId > 0
              ? model.lastActiveOppId
              : (() => {
                  try {
                    const s = readPersistedSession()
                    return typeof s?.lastActiveOppId === 'number' && s.lastActiveOppId > 0
                      ? s.lastActiveOppId
                      : undefined
                  } catch {
                    return undefined
                  }
                })()
          const match = typeof wantId === 'number' ? msg.opportunities.find((o) => o.id === wantId) : undefined
          if (match) {
            return (d) =>
              d({
                type: 'OpportunitySelected',
                id: match.id,
                url: match.source_url || undefined,
              })
          }
        }
      }
      return undefined

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

    // Lookup effects
    case 'LookupRequested':
      return lookupCmd(ports, model)
    case 'SearchRunSelected':
      return loadSearchRunCmd(ports, msg.id)
    case 'HydrateRequested':
      return hydrateCmd(ports, msg.tweetId)

    default:
      return undefined
  }
}
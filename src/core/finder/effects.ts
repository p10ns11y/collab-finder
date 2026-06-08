import { toAppError } from '../error'
import { fromPromise } from '../result'
import { requireConnection, validateBearerDraft } from '../security/credentials-policy'
import type { Cmd } from '../mvu/engine'
import type { FinderMsg } from './msg'
import type { FinderModel } from './model'
import type { LeadFilter, OpportunityFilter } from '../../adapters/tauri/finder-adapter'
import type { JobAnalysisResult, JobPrep, JobPrepResult, JobTargetResult } from '../domain/job-target'

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
    // Job target analyze + visibility (MVU wired in Slice B)
    analyzeJobTarget(payload: { url?: string; pasted_jd?: string; cv_summary?: string }): Promise<JobAnalysisResult>
    // Job target prep (Slice C)
    prepJobTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; cv_summary?: string; previous_fit?: string }): Promise<JobPrepResult>
    getOpportunities(filter?: OpportunityFilter): Promise<import('../domain/history').Opportunity[]>
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

export function jobTargetAnalyzeCmd(
  ports: FinderPorts,
  model: FinderModel,
  payload: { url?: string; pasted_jd?: string },
): Cmd<FinderMsg> {
  return (dispatch) => {
    const p = {
      url: payload.url,
      pasted_jd: payload.pasted_jd,
      cv_summary: model.cvSummary || undefined,
    }
    void fromPromise(ports.finder.analyzeJobTarget(p), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'JobTargetAnalyzeFailed', error: result.error })
        return
      }
      dispatch({ type: 'JobTargetAnalyzeSucceeded', result: result.value })

      // Audit: JobTargetAnalyzed with opportunity_id, score, cost (per feedback spec)
      const r: JobAnalysisResult = result.value
      const fit = r.fit
      const audit = JSON.stringify({
        opportunity_id: r.opportunity_id,
        overall: fit.overall,
        est_cost_usd: r.est_cost_usd,
      })
      void fromPromise(ports.finder.logEvent('JobTargetAnalyzed', audit), toAppError).then((logRes) => {
        if (logRes.ok) {
          dispatch({ type: 'UiEventLogged', eventType: 'JobTargetAnalyzed', payload: audit })
        }
      })

      // Refresh history so the new opportunity row appears in Data tab immediately (consistent with Search/Cycle)
      dispatch({ type: 'HistoryRefreshRequested' })

      // Persist as last for resume/continuity (power-off mid job; explicit Resume last + auto on next start).
      try {
        localStorage.setItem('cf.lastOppId', String(r.opportunity_id))
      } catch {}
    })
  }
}

export function jobTargetPrepCmd(
  ports: FinderPorts,
  model: FinderModel,
  payload: { opportunity_id?: number; url?: string; pasted_jd?: string },
): Cmd<FinderMsg> {
  return (dispatch) => {
    // Slice C: if we have a prior jobTarget result with fit analysis, pass a compact version of it
    // so the prep prompt can be context-aware (gaps, rationale, recommended_action from the Evaluate Fit step).
    let previous_fit: string | undefined
    const jt = model.jobTarget
    // Note: may be 'loading' + carried data (the cheap preserve-for-merge pattern); use guard not status check only.
    if (jt && (jt.status === 'ready' || jt.status === 'loading') && 'data' in jt && jt.data) {
      // SAFETY: cast only to consume the preserved carry data on loading arm (see update.ts SAFETY comments + design PR2 carry hack); 'in' narrowing used immediately after.
      const d = jt.data as JobTargetResult
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

    const p = {
      opportunity_id: payload.opportunity_id,
      url: payload.url,
      pasted_jd: payload.pasted_jd,
      cv_summary: model.cvSummary || undefined,
      previous_fit,
    }
    void fromPromise(ports.finder.prepJobTarget(p), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'JobTargetPrepFailed', error: result.error })
        return
      }
      dispatch({ type: 'JobTargetPrepSucceeded', result: result.value })

      // Audit
      const r: JobPrepResult = result.value
      const audit = JSON.stringify({
        opportunity_id: r.opportunity_id ?? payload.opportunity_id,
        has_prep: !!r.prep,
        est_cost_usd: r.est_cost_usd,
      })
      void fromPromise(ports.finder.logEvent('JobTargetPrepped', audit), toAppError).then((logRes) => {
        if (logRes.ok) {
          dispatch({ type: 'UiEventLogged', eventType: 'JobTargetPrepped', payload: audit })
        }
      })

      dispatch({ type: 'HistoryRefreshRequested' })

      // Persist as last (in case prep created/updated the opp row).
      const lastIdForPrep = r.opportunity_id ?? payload.opportunity_id
      if (lastIdForPrep != null) {
        try {
          localStorage.setItem('cf.lastOppId', String(lastIdForPrep))
        } catch {}
      }
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
      // Events for Data screen (was declared but never loaded before)
      void fromPromise(ports.finder.getEvents({ limit: 100 }), toAppError).then((r) => {
        if (r.ok) dispatch({ type: 'HistoryRefreshed', events: r.value })
      })
      // Opportunities (job targets) for Data tab
      void fromPromise(ports.finder.getOpportunities({ limit: 100 }), toAppError).then((r) => {
        if (r.ok) dispatch({ type: 'HistoryRefreshed', opportunities: r.value })
      })
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

/** CV persist via localStorage (FE-owned for fast edits; loaded on AppStarted; per continuity design + user confirm).
 *  Key chosen as `cf.cvSummary` for namespacing. No Rust change.
 */
export function persistCvSummaryCmd(cvSummary: string): Cmd<FinderMsg> {
  return () => {
    try {
      localStorage.setItem('cf.cvSummary', cvSummary)
    } catch {
      // best-effort; non-fatal for continuity
    }
  }
}

export function loadCvSummaryCmd(): Cmd<FinderMsg> {
  return (dispatch) => {
    try {
      const v = localStorage.getItem('cf.cvSummary')
      if (v != null) {
        dispatch({ type: 'CvSummaryLoaded', cvSummary: v })
      }
    } catch {
      // ignore; will use DEFAULT from initial model
    }
  }
}

/** Load specific opportunity by id (via existing getOpportunities + OpportunityFilter.id support).
 *  Reconstructs typed results from the stored JSON blobs (analysis_json / prep_artifacts_json) and
 *  dispatches the existing *Succeeded messages so update + JobFitPanel reuse all carry/merge/typed paths exactly (no new state).
 *  Also navigates to discover. Persists the id as last for resume.
 */
export function loadOpportunityCmd(ports: FinderPorts, id: number): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.getOpportunities({ id }), toAppError).then((result) => {
      if (!result.ok) {
        // Use GlobalError + Cleared (instead of AnalyzeFailed) so banner is generic "load" not "analyze", and loading state from OppSelected update is cleared. Addresses review Issue 4 (terminology for Data/Resume paths).
        dispatch({ type: 'GlobalError', error: result.error })
        dispatch({ type: 'JobTargetCleared' })
        return
      }
      const opps = result.value || []
      const o = opps.find((x) => x.id === id) || opps[0]
      if (!o) {
        const err = toAppError(new Error(`Opportunity ${id} not found`))
        dispatch({ type: 'GlobalError', error: err })
        dispatch({ type: 'JobTargetCleared' })
        return
      }

      // Navigate + restore exact prior state (url for Open button + prep payload in panel; source_url from opp row).
      dispatch({ type: 'ScreenChanged', screen: 'discover' })
      if (o.source_url) {
        dispatch({ type: 'JobTargetUrlSet', url: o.source_url })
      }

      // Reconstruct analysis (fit) if present — dispatch the exact Succeeded used by live analyze path.
      if (o.analysis_json) {
        try {
          const parsed = JSON.parse(o.analysis_json) as JobAnalysisResult
          const analysis: JobAnalysisResult = {
            opportunity_id: parsed.opportunity_id ?? o.id,
            fit: parsed.fit,
            packet_preview: parsed.packet_preview ?? '',
            est_cost_usd: parsed.est_cost_usd ?? 0,
          }
          dispatch({ type: 'JobTargetAnalyzeSucceeded', result: analysis })
        } catch {
          // ignore malformed; user can re-eval
        }
      }

      // Reconstruct prep if present — dispatch PrepSucceeded (update will merge with prior fit via the carry pattern).
      if (o.prep_artifacts_json) {
        try {
          const parsed = JSON.parse(o.prep_artifacts_json) as Partial<JobPrepResult> & { prep?: unknown }
          // Narrow shape tolerant handling (no broad `as any`); supports stored as inner {prep: ...} or full result (pre/post PR2 rows). See review Issue 3.
          const prepData = (parsed && typeof parsed === 'object' && 'prep' in parsed && (parsed as { prep?: unknown }).prep) ? (parsed as { prep?: unknown }).prep : parsed
          const prepResult: JobPrepResult = {
            opportunity_id: (parsed as { opportunity_id?: number }).opportunity_id ?? o.id,
            prep: prepData as JobPrep,
            est_cost_usd: (parsed as { est_cost_usd?: number }).est_cost_usd ?? 0,
          }
          dispatch({ type: 'JobTargetPrepSucceeded', result: prepResult })
        } catch {
          // ignore malformed
        }
      }

      // If row had no analysis/prep blobs (edge: partial/pre-stabilization), clear the loading set by OpportunitySelected handler so UI doesn't stick in spinner. (Addresses review Issue 1; still nav to discover.)
      if (!o.analysis_json && !o.prep_artifacts_json) {
        dispatch({ type: 'JobTargetCleared' })
      }

      // Persist as last for explicit "Resume last" affordance + next start (best effort).
      try {
        localStorage.setItem('cf.lastOppId', String(o.id))
      } catch {}
    })
  }
}

/** Best-effort load of last active opp on start (for full restart continuity + laptop-off resume).
 *  Dispatches OpportunitySelected so the single load/hydrate path + nav is used (reuses everything).
 */
export function loadLastOpportunityCmd(): Cmd<FinderMsg> {
  return (dispatch) => {
    try {
      const raw = localStorage.getItem('cf.lastOppId')
      if (raw) {
        const id = parseInt(raw, 10)
        if (Number.isFinite(id) && id > 0) {
          dispatch({ type: 'OpportunitySelected', id })
        }
      }
    } catch {}
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
      // + CV from LS (persist) + conditional last opp hydrate for continuity (reuses OpportunitySelected path).
      return [credentialsCheckCmd(ports), historyRefreshCmd(ports), loadCvSummaryCmd(), loadLastOpportunityCmd()]
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
    case 'JobTargetAnalyzeRequested':
      return jobTargetAnalyzeCmd(ports, model, { url: msg.url, pasted_jd: msg.pasted_jd })
    case 'JobTargetPrepRequested':
      return jobTargetPrepCmd(ports, model, { opportunity_id: msg.opportunity_id, url: msg.url, pasted_jd: msg.pasted_jd })

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

    // Re-probe bearer storage (and trigger keyring promotion/heal if only file is present)
    // when the user actually visits the Settings screen. This makes the credentials panel
    // reflect an up-to-date (possibly promoted) active_source without manual refresh.
    case 'ScreenChanged':
      if (msg.screen === 'settings') {
        return credentialsCheckCmd(ports)
      }
      return undefined

    // CV persist side-effect (on every edit; load is only on AppStarted).
    case 'CvSummaryChanged':
      return persistCvSummaryCmd(msg.cvSummary)

    case 'OpportunitySelected':
      // Self-guard (per AGENTS self-guards/pauses on decision paths): skip if already loading a hydrate (prevents rapid double-click Data rows or resume from stacking dispatches while prior load in flight). Cheap read path; update already set loading idempotently.
      if (model.jobTarget && model.jobTarget.status === 'loading') {
        return undefined
      }
      return loadOpportunityCmd(ports, msg.id)

    default:
      return undefined
  }
}
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

export function opportunityTargetAnalyzeCmd(
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

    const p = {
      opportunity_id: payload.opportunity_id,
      url: payload.url,
      pasted_jd: payload.pasted_jd,
      cv_summary: model.cvSummary || undefined,
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
    const v = readPersistedCv()
    if (v != null) {
      dispatch({ type: 'CvSummaryLoaded', cvSummary: v })
    }
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

      // Robust reconstruct for "exact prior state" (addresses partial rows, prep-only, parse fail, missing analysis_json).
      // Use opp.fit_score for minimal fit stub when needed (so panel always shows score + rationale/gaps if available).
      // Always try to ensure a fit precedes prep for the merge logic.
      let fitDispatched = false
      if (o.analysis_json) {
        try {
          const fit = JSON.parse(o.analysis_json)
          // Minimal shape guard (Issue 6) before dispatch; required fields per OpportunityTargetFit in domain/opportunity-target.ts
          if (fit && typeof fit.overall === 'number' && typeof fit.rationale === 'string' && Array.isArray(fit.gaps_must)) {
            const analysis: OpportunityTargetAnalysisResult = {
              opportunity_id: o.id,
              fit,
              // Note (Issue 8): for restores we populate a short JD excerpt as packet_preview because the original full CV packet the user had entered is not persisted in the opportunity row (by design — only analysis/prep artifacts are). Real fresh analyze paths always send the complete current CV packet the user has in the input.
              // For restored opportunities we don't have the original CV packet that was sent.
              // We use a short excerpt of the JD as a stand-in so the UI can still render the preview section.
              packet_preview: (o.jd_text || '').slice(0, 800),
              est_cost_usd: 0,
            }
            dispatch({ type: 'OpportunityTargetAnalyzeSucceeded', result: analysis })
            fitDispatched = true
          } else {
            console.warn('[finder] hydrate: analysis_json present but invalid shape for id', id)
          }
        } catch {
          console.warn('[finder] hydrate: malformed analysis_json for id', id)
          /* fall through to stub if possible */
        }
      }
      // Synthesize minimal fit stub from fit_score if no valid analysis_json (or parse failed) but we have a score.
      // This ensures prep-only or partial rows still show a usable "Fit analysis" section with score on restore.
      if (!fitDispatched && typeof o.fit_score === 'number') {
        const stubFit = {
          overall: o.fit_score,
          rationale: 'Restored from prior opportunity record (no full analysis_json available).',
          gaps_must: [],
          recommended_action: 'Review prep artifacts or re-evaluate fit.',
        }
        const analysis: OpportunityTargetAnalysisResult = {
          opportunity_id: o.id,
          fit: stubFit,
          packet_preview: '(restored — the original distilled CV packet that was sent is not stored; only the opportunity record remains)',
          est_cost_usd: 0,
        }
        dispatch({ type: 'OpportunityTargetAnalyzeSucceeded', result: analysis })
        fitDispatched = true
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
      // + CV from localStorage (CvSummaryLoaded) + conditional last opp hydrate via OpportunitySelected path
      // (uses model.lastActiveOppId which initialFinderModel may have populated from LS for restore).
      const appCmds: (Cmd<FinderMsg> | undefined)[] = [
        credentialsCheckCmd(ports),
        historyRefreshCmd(ports),
        loadCvFromLocalCmd(),
      ]
      const lastId = model.lastActiveOppId
      if (typeof lastId === 'number') {
        // Trigger the normal OpportunitySelected path (sets last, loads from DB via loadCmd which also does OpportunityTargetUrlSet for live model url, hydrates opportunityTarget + screen).
        // (url for this auto path comes from the fetched opp or prior LS via initial model.)
        appCmds.push((d) => d({ type: 'OpportunitySelected', id: lastId }))
      }
      return appCmds.filter(Boolean) as Cmd<FinderMsg>[]
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
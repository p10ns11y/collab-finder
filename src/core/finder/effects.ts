import { toAppError } from '../error'
import { fromPromise } from '../result'
import { requireConnection, validateBearerDraft } from '../security/credentials-policy'
import type { Cmd } from '../mvu/engine'
import type { FinderMsg } from './msg'
import type { FinderModel, PersistedSession } from './model'
import { CV_LS_KEY, CV_USER_EDITED_LS_KEY, PASTED_JD_SESSION_MAX_CHARS, SESSION_LS_KEY } from './model'
import type { LeadFilter, OpportunityFilter } from '../../adapters/tauri/finder-adapter'
import type { Opportunity } from '../domain/history'
import type { OpportunityTargetAnalysisResult, OpportunityTargetPrep, OpportunityTargetPrepResult, OpportunityTargetResult } from '../domain/opportunity-target'
import { serializePreviousFitForPrep, usableOpportunityJdText } from '../domain/opportunity-target'
import { cvSummaryForIpc, reconstructAnalysisFromOpportunity } from '../domain/opportunity-target-ipc'
import { isPlausibleCvPacket, sanitizeCvPacket } from '../domain/cv-packet'
import { DEFAULT_CV_SUMMARY } from '../domain/search-presets'
import { normalizeOpportunityUrl } from '../domain/opportunity-url'
import { jobtechSafeQuery } from '../domain/hunt-rails'
import { buildQuestPrompt, snapshotFromFinder } from '../domain/quest'
import { formatQuestContextBlock, resolveQuestContextPacks } from '../domain/quest-context'
import {
  normalizeApplicationPackExport,
  packExportFromOpportunityNotes,
  normalizeGenerateApplyCv,
} from '../domain/application-pack'
import {
  clearClusterRoute,
  headingBootFromCluster,
  isClusterHeadingHold,
  releaseClusterHeadingHold,
  watchClusterRoute,
} from '../../adapters/tauri/heading-boot'
import { applyScreenHash, screenFromHash } from '../domain/finder-nav'

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
    analyzeOpportunityTarget(payload: {
      url?: string
      pasted_jd?: string
      title?: string
      company?: string
      cv_summary?: string
    }): Promise<OpportunityTargetAnalysisResult>
    // Opportunity target prep
    prepOpportunityTarget(payload: { opportunity_id?: number; url?: string; pasted_jd?: string; cv_summary?: string; previous_fit?: string }): Promise<OpportunityTargetPrepResult>
    getOpportunities(filter?: OpportunityFilter): Promise<import('../domain/history').Opportunity[]>
    getPipelineOpportunities(limit?: number): Promise<import('../domain/history').Opportunity[]>
    updateOpportunityStatus(id: number, status: string, notes?: string): Promise<void>
    updateOpportunityOutcome(id: number, outcomeStatus: string): Promise<void>
    // Hire board
    fetchHireBoard(filter?: import('../domain/hire-board').HireBoardFilter): Promise<import('../domain/hire-board').HireBoardLead[]>
    selectHireBoardLead(payload: {
      company: string
      location?: string
      career_url: string
      thread_url?: string
    }): Promise<import('../domain/history').Opportunity>
    searchPlatsbanken(filter?: import('../domain/platsbanken').PlatsbankenSearchFilter): Promise<
      import('../domain/platsbanken').PlatsbankenLead[]
    >
    importPlatsbankenAd(adId: string): Promise<import('../domain/history').Opportunity>
    deleteOpportunity(id: number): Promise<void>
    runLocalGrokQuest(payload: {
      prompt: string
      sessionId?: string
      resume?: boolean
      kind?: string
    }): Promise<import('../domain/quest').QuestResult>
    persistQuestTurn(payload: {
      sessionId: string
      kind: string
      contextIds: string
      lastOppId?: number | null
      role: string
      text: string
      backend?: string | null
      promptChars?: number | null
    }): Promise<void>
    loadLatestQuestThread(): Promise<import('../domain/quest').QuestThreadRecord | null>
    loadQuestThread(sessionId: string): Promise<import('../domain/quest').QuestThreadRecord | null>
    listQuestThreads(limit?: number): Promise<import('../domain/quest').QuestThreadSummary[]>
    searchQuestTurns(q: string, limit?: number): Promise<import('../domain/quest').QuestTurnHit[]>
    listDurableFirms(next?: boolean): Promise<import('../domain/firm-durability').DurabilityIteration>
    inspectMissionFirmLead(payload: {
      firm_id: string
      source: string
      external_id: string
      absolute_url?: string
      location?: string
    }): Promise<import('../domain/firm-durability').MissionInspectResult>
    searchMissionFirms(
      filter?: import('../domain/mission-firms').MissionFirmFilter,
    ): Promise<import('../domain/mission-firms').MissionFirmLead[]>
    importMissionFirmLead(payload: {
      firm_id: string
      source: string
      external_id: string
      absolute_url?: string
    }): Promise<import('../domain/history').Opportunity>
    loadNetworkGraph(payload?: {
      path?: string
      contacts_path?: string
      force_reimport?: boolean
      top_n?: number
    }): Promise<import('../domain/network-graph').NetworkGraphResult>
    resolveNetworkXProfiles(payload: {
      graph: import('../domain/network-graph').NetworkGraphResult
      top_n?: number
      ids?: string[]
    }): Promise<import('../domain/network-graph').NetworkGraphResult>
    enrichNetworkLinkedIn(payload: {
      graph: import('../domain/network-graph').NetworkGraphResult
      top_n?: number
      ids?: string[]
    }): Promise<import('../domain/network-graph').NetworkGraphResult>
    // devprofile + sidecar propose
    getDevprofilePath(): Promise<string | null>
    setDevprofilePath(path: string | null): Promise<void>
    proposeCvSidecar(opportunityId: number): Promise<{ opportunity_id: number; preview: string; sidecar_path: string; suggestions_count: number }>
    exportApplicationPack(opportunityId: number): Promise<{
      opportunity_id: number
      pack_dir: string
      pack_slug: string
      company?: string | null
      title?: string | null
      files: string[]
      file_count: number
    }>
    generateApplyCv(opportunityId: number): Promise<{
      opportunity_id: number
      pack_slug: string
      pack_dir: string
      pdf_path: string
      flat_pdf_path?: string | null
      submit_pdf_path?: string | null
      stdout_tail?: string
      export_files?: string[]
      export_file_count?: number
    }>
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

export function exportApplicationPackCmd(ports: FinderPorts, opportunityId: number): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.exportApplicationPack(opportunityId), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'ApplicationPackExportFailed', error: result.error })
        return
      }
      const r = normalizeApplicationPackExport(result.value)
      if (r.file_count === 0) {
        dispatch({
          type: 'ApplicationPackExportFailed',
          error: toAppError(
            new Error(
              'Export wrote 0 files — generate prep first (cover letter / CV suggestions), then export or use Generate apply CV.',
            ),
          ),
        })
        return
      }
      dispatch({
        type: 'ApplicationPackExportSucceeded',
        opportunity_id: r.opportunity_id || opportunityId,
        pack_dir: r.pack_dir || '',
        pack_slug: r.pack_slug || undefined,
        company: r.company ?? null,
        title: r.title ?? null,
        files: r.files,
        file_count: r.file_count,
      })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function generateApplyCvCmd(ports: FinderPorts, opportunityId: number): Cmd<FinderMsg> {
  return (dispatch) => {
    // Self-contained: Rust re-exports the pack then runs generate-apply-cv (no separate Export click).
    void fromPromise(ports.finder.generateApplyCv(opportunityId), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'GenerateApplyCvFailed', error: result.error })
        return
      }
      const r = normalizeGenerateApplyCv(result.value)
      if (!r.pdf_path) {
        dispatch({
          type: 'GenerateApplyCvFailed',
          error: toAppError(new Error('generate-apply-cv returned no pdf_path')),
        })
        return
      }
      dispatch({
        type: 'GenerateApplyCvSucceeded',
        opportunity_id: r.opportunity_id || opportunityId,
        pack_slug: r.pack_slug,
        pack_dir: r.pack_dir,
        pdf_path: r.pdf_path,
        flat_pdf_path: r.flat_pdf_path ?? null,
        submit_pdf_path: r.submit_pdf_path ?? null,
        stdout_tail: r.stdout_tail,
        export_files: r.export_files,
        export_file_count: r.export_file_count,
      })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function updateOpportunityStatusCmd(
  ports: FinderPorts,
  id: number,
  status: string,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.updateOpportunityStatus(id, status), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'OpportunityStatusChangeFailed', error: result.error })
        return
      }
      dispatch({ type: 'OpportunityStatusChangeSucceeded', id, status })
      dispatch({ type: 'HistoryRefreshRequested' })
      dispatch({ type: 'PipelineRefreshRequested' })
    })
  }
}

export function updateOpportunityOutcomeCmd(
  ports: FinderPorts,
  id: number,
  outcomeStatus: string,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.updateOpportunityOutcome(id, outcomeStatus), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'OpportunityOutcomeChangeFailed', error: result.error })
        return
      }
      dispatch({ type: 'OpportunityOutcomeChangeSucceeded', id, outcomeStatus })
      dispatch({ type: 'HistoryRefreshRequested' })
      dispatch({ type: 'PipelineRefreshRequested' })
    })
  }
}

export function pipelineRefreshCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.getPipelineOpportunities(150), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PipelineFailed', error: result.error })
        return
      }
      dispatch({ type: 'PipelineRefreshed', opportunities: result.value })
    })
  }
}

export function hireBoardRefreshCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.fetchHireBoard({
        q: model.hireBoardQ || undefined,
        geo: model.hireBoardGeo.length ? model.hireBoardGeo : undefined,
        require_career_url: true,
        limit: 100,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'HireBoardRefreshFailed', error: result.error })
        return
      }
      dispatch({ type: 'HireBoardRefreshSucceeded', leads: result.value })
    })
  }
}

export function hireBoardSelectCmd(
  ports: FinderPorts,
  lead: import('../domain/hire-board').HireBoardLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.selectHireBoardLead({
        company: lead.company,
        location: lead.location,
        career_url: lead.career_url,
        thread_url: lead.thread_url || undefined,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'HireBoardSelectFailed', error: result.error })
        return
      }
      dispatch({ type: 'HireBoardSelectSucceeded', opportunity: result.value })
      dispatch({ type: 'HistoryRefreshRequested' })
      dispatch({
        type: 'OpportunitySelected',
        id: result.value.id,
        url: result.value.source_url || lead.career_url,
        reveal: true,
      })
    })
  }
}

function persistQuestTurnBestEffort(
  ports: FinderPorts,
  model: FinderModel,
  role: 'user' | 'assistant',
  text: string,
  extra?: { backend?: string; promptChars?: number },
) {
  const sessionId = model.questSessionId
  if (!sessionId || !text.trim()) return
  void ports.finder
    .persistQuestTurn({
      sessionId,
      kind: model.questKind,
      contextIds: JSON.stringify(model.questContextIds),
      lastOppId: model.lastActiveOppId ?? null,
      role,
      text,
      backend: extra?.backend ?? null,
      promptChars: extra?.promptChars ?? null,
    })
    .catch(() => {})
}

export function persistLastQuestTurnCmd(
  ports: FinderPorts,
  model: FinderModel,
  role: 'user' | 'assistant',
): Cmd<FinderMsg> {
  return () => {
    const last = [...model.questTurns].reverse().find((t) => t.role === role)
    persistQuestTurnBestEffort(ports, model, role, last?.text || '', {
      backend: model.quest.status === 'ready' ? model.quest.data.backend : undefined,
      promptChars: model.quest.status === 'ready' ? model.quest.data.prompt_chars : undefined,
    })
  }
}

export function hydrateLatestQuestCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.loadLatestQuestThread(), toAppError).then((result) => {
      if (!result.ok || !result.value || result.value.turns.length === 0) return
      dispatch({ type: 'QuestThreadHydrated', thread: result.value })
    })
  }
}

export function listQuestRecentCmd(ports: FinderPorts): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.listQuestThreads(12), toAppError).then((result) => {
      if (!result.ok) return
      dispatch({ type: 'QuestRecentLoaded', threads: result.value })
    })
  }
}

export function searchQuestTurnsCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const q = model.questLookupQ.trim()
    if (!q) {
      dispatch({ type: 'QuestSearchLoaded', hits: [] })
      return
    }
    void fromPromise(ports.finder.searchQuestTurns(q, 20), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'QuestSearchLoaded', hits: [] })
        return
      }
      dispatch({ type: 'QuestSearchLoaded', hits: result.value })
    })
  }
}

export function loadQuestThreadCmd(ports: FinderPorts, sessionId: string): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.loadQuestThread(sessionId), toAppError).then((result) => {
      if (!result.ok || !result.value) return
      dispatch({ type: 'QuestThreadHydrated', thread: result.value })
    })
  }
}

export function localGrokQuestCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    const userTurns = model.questTurns.filter((t) => t.role === 'user').length
    const resume = model.questTurns.some((t) => t.role === 'assistant') || userTurns > 1
    const sessionId = model.questSessionId || crypto.randomUUID()
    const lastUser = [...model.questTurns].reverse().find((t) => t.role === 'user')
    const question = model.questDraft.trim() || lastUser?.text || ''
    const opps =
      model.history.opportunities.status === 'ready' ? model.history.opportunities.data : []
    const lastOpp = model.lastActiveOppId
      ? opps.find((o) => o.id === model.lastActiveOppId)
      : undefined
    const contextBlock = formatQuestContextBlock(
      resolveQuestContextPacks({
        ids: model.questContextIds,
        cvSummary: model.cvSummary,
        opportunityTargetUrl: model.opportunityTargetUrl,
        lastOpp,
      }),
    )
    const prompt = buildQuestPrompt({
      kind: model.questKind,
      question,
      snapshot: snapshotFromFinder(model),
      followUp: resume,
      contextBlock,
    })
    void fromPromise(
      ports.finder.runLocalGrokQuest({
        prompt,
        sessionId,
        resume,
        kind: model.questKind,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'QuestFailed', error: result.error })
        return
      }
      dispatch({ type: 'QuestSucceeded', result: result.value })
    })
  }
}

export function platsbankenSearchCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.searchPlatsbanken({
        q: jobtechSafeQuery(model.platsbankenQ) || undefined,
        municipality: model.platsbankenMunicipality || undefined,
        limit: 30,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PlatsbankenSearchFailed', error: result.error })
        return
      }
      dispatch({ type: 'PlatsbankenSearchSucceeded', leads: result.value })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function platsbankenImportCmd(
  ports: FinderPorts,
  lead: import('../domain/platsbanken').PlatsbankenLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.importPlatsbankenAd(lead.ad_id), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PlatsbankenImportFailed', error: result.error })
        return
      }
      dispatch({ type: 'PlatsbankenImportSucceeded', opportunity: result.value })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function platsbankenRemoveCmd(
  ports: FinderPorts,
  lead: import('../domain/platsbanken').PlatsbankenLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    const id = lead.opportunity_id
    if (typeof id !== 'number' || id <= 0) {
      dispatch({
        type: 'PlatsbankenRemoveFailed',
        error: toAppError(new Error('No saved row for this ad')),
      })
      return
    }
    void fromPromise(ports.finder.deleteOpportunity(id), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PlatsbankenRemoveFailed', error: result.error })
        return
      }
      dispatch({ type: 'PlatsbankenRemoveSucceeded', adId: lead.ad_id, opportunityId: id })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function platsbankenEvaluateCmd(
  ports: FinderPorts,
  model: FinderModel,
  lead: import('../domain/platsbanken').PlatsbankenLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.importPlatsbankenAd(lead.ad_id), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PlatsbankenImportFailed', error: result.error })
        return
      }
      const opportunity = result.value
      dispatch({ type: 'PlatsbankenImportSucceeded', opportunity })
      dispatch({ type: 'HistoryRefreshRequested' })
      // Stay on Sweden — do not OpportunitySelected (that switches to Discover).
      opportunityTargetAnalyzeCmd(ports, model, {
        pasted_jd: opportunity.jd_text,
        url: opportunity.source_url || lead.webpage_url,
        title: opportunity.title || lead.headline,
        company: opportunity.company || lead.employer,
      })(dispatch)
    })
  }
}

export function durableFirmsCmd(ports: FinderPorts, next = false): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(ports.finder.listDurableFirms(next), toAppError).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'DurableFirmsFailed', error: result.error })
        return
      }
      dispatch({
        type: 'DurableFirmsSucceeded',
        iteration: result.value,
        advanced: next,
      })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function missionLeadInspectCmd(
  ports: FinderPorts,
  lead: import('../domain/mission-firms').MissionFirmLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.inspectMissionFirmLead({
        firm_id: lead.firm_id,
        source: lead.source,
        external_id: lead.external_id,
        absolute_url: lead.absolute_url,
        location: lead.location,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'MissionLeadInspectFailed', error: result.error })
        return
      }
      dispatch({ type: 'MissionLeadInspectSucceeded', inspect: result.value })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function missionFirmsSearchCmd(
  ports: FinderPorts,
  model: FinderModel,
  opts?: { forceRefresh?: boolean },
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.searchMissionFirms({
        q: model.missionFirmsQ || undefined,
        firms: model.missionFirmsSelected,
        texas_only: model.missionFirmsTexasOnly,
        terafab_bias: model.missionFirmsTerafabBias,
        limit: 80,
        force_refresh: opts?.forceRefresh === true,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'MissionFirmsSearchFailed', error: result.error })
        return
      }
      dispatch({ type: 'MissionFirmsSearchSucceeded', leads: result.value })
      persistSessionToLocal({
        missionFirmsQ: model.missionFirmsQ,
        missionFirmsSelected: model.missionFirmsSelected,
      })
      dispatch({ type: 'HistoryRefreshRequested' })
    })
  }
}

export function missionFirmsImportCmd(
  ports: FinderPorts,
  lead: import('../domain/mission-firms').MissionFirmLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.importMissionFirmLead({
        firm_id: lead.firm_id,
        source: lead.source,
        external_id: lead.external_id,
        absolute_url: lead.absolute_url,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'MissionFirmsImportFailed', error: result.error })
        return
      }
      dispatch({ type: 'MissionFirmsImportSucceeded', opportunity: result.value })
      dispatch({ type: 'HistoryRefreshRequested' })
      dispatch({
        type: 'OpportunitySelected',
        id: result.value.id,
        url: result.value.source_url || lead.absolute_url,
        reveal: true,
      })
    })
  }
}

export function missionFirmsEvaluateCmd(
  ports: FinderPorts,
  model: FinderModel,
  lead: import('../domain/mission-firms').MissionFirmLead,
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.importMissionFirmLead({
        firm_id: lead.firm_id,
        source: lead.source,
        external_id: lead.external_id,
        absolute_url: lead.absolute_url,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'MissionFirmsImportFailed', error: result.error })
        return
      }
      const opportunity = result.value
      dispatch({ type: 'MissionFirmsImportSucceeded', opportunity })
      dispatch({ type: 'HistoryRefreshRequested' })
      dispatch({
        type: 'OpportunitySelected',
        id: opportunity.id,
        url: opportunity.source_url || lead.absolute_url,
        reveal: true,
      })
      opportunityTargetAnalyzeCmd(ports, model, {
        pasted_jd: opportunity.jd_text,
        url: opportunity.source_url || lead.absolute_url,
        title: opportunity.title || lead.title,
        company: opportunity.company || lead.firm_label,
      })(dispatch)
    })
  }
}

export function networkLoadCmd(ports: FinderPorts, forceReimport = false): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(
      ports.finder.loadNetworkGraph({ top_n: 50, force_reimport: forceReimport }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'NetworkLoadFailed', error: result.error })
        return
      }
      dispatch({ type: 'NetworkLoadSucceeded', graph: result.value })
    })
  }
}

export function networkResolveXCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    if (model.network.status !== 'ready') {
      dispatch({
        type: 'NetworkResolveXFailed',
        error: toAppError(new Error('Load network first')),
      })
      return
    }
    const graph = model.network.data
    void fromPromise(
      ports.finder.resolveNetworkXProfiles({ graph, top_n: 50, ids: graph.top_ids.slice(0, 50) }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'NetworkResolveXFailed', error: result.error })
        return
      }
      dispatch({ type: 'NetworkResolveXSucceeded', graph: result.value })
    })
  }
}

export function networkEnrichLinkedInCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  return (dispatch) => {
    if (model.network.status !== 'ready') {
      dispatch({
        type: 'NetworkEnrichLinkedInFailed',
        error: toAppError(new Error('Load network first')),
      })
      return
    }
    const graph = model.network.data
    void fromPromise(
      ports.finder.enrichNetworkLinkedIn({ graph, top_n: 50, ids: graph.top_ids.slice(0, 50) }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'NetworkEnrichLinkedInFailed', error: result.error })
        return
      }
      dispatch({ type: 'NetworkEnrichLinkedInSucceeded', graph: result.value })
    })
  }
}

export function opportunityTargetAnalyzeCmd(
  ports: FinderPorts,
  model: FinderModel,
  payload: { url?: string; pasted_jd?: string; title?: string; company?: string },
): Cmd<FinderMsg> {
  return (dispatch) => {
    // Use pure contract: empty/trimmed-to-empty becomes undefined so Rust can pick devprofile_path pruned or its DEFAULT.
    // Never force DEFAULT_CV_SUMMARY at the IPC boundary.
    // Normalize bare host/path (jobs.qred.com/…) so Open URL + DB match Rust fetch (https://…).
    const loneUrl =
      payload.url != null && payload.url.trim()
        ? normalizeOpportunityUrl(payload.url.trim())
        : null
    const cvForIpc = cvSummaryForAnalyzeIpc(model)
    const pastedJd =
      usableOpportunityJdText(payload.pasted_jd) ??
      usableOpportunityJdText(model.opportunityTargetPastedJd) ??
      (!loneUrl ? usableOpportunityJdText(payload.url) : undefined)
    const p = {
      url: loneUrl ?? undefined,
      pasted_jd: pastedJd,
      title: payload.title,
      company: payload.company,
      cv_summary: cvForIpc,
    }
    if (import.meta.env.DEV) {
      console.debug(
        '[finder] analyze_opportunity_target ipc:',
        'pasted_jd',
        pastedJd ? `${pastedJd.length} chars` : 'missing',
        'cv_summary',
        cvForIpc ? cvForIpc.length : 'undefined',
      )
    }
    if (loneUrl && loneUrl !== payload.url) {
      dispatch({ type: 'OpportunityTargetUrlSet', url: loneUrl })
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
        previous_fit = serializePreviousFitForPrep(d.fit)
      }
    }

    const cvForIpc = cvSummaryForAnalyzeIpc(model)
    const p = {
      opportunity_id: payload.opportunity_id,
      url: payload.url ? normalizeOpportunityUrl(payload.url) ?? undefined : undefined,
      pasted_jd:
        usableOpportunityJdText(payload.pasted_jd) ??
        usableOpportunityJdText(model.opportunityTargetPastedJd),
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
    void fromPromise(ports.finder.getEvents({ limit: 250 }), toAppError).then((r) => {
      if (r.ok) dispatch({ type: 'HistoryRefreshed', events: r.value })
    })
    // Opportunities (from target analyzes) — critical for Data tab + History + Discover "Resume last"
    void fromPromise(ports.finder.getOpportunities({ limit: 300 }), toAppError).then((r) => {
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

function cvUserEditedForIpc(): boolean {
  try {
    return localStorage.getItem(CV_USER_EDITED_LS_KEY) === '1'
  } catch {
    return false
  }
}

function cvSummaryForAnalyzeIpc(model: FinderModel): string | undefined {
  return cvSummaryForIpc(model.cvSummary.trim(), {
    distilledDefault: DEFAULT_CV_SUMMARY,
    userEdited: cvUserEditedForIpc(),
  })
}

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
      localStorage.removeItem(CV_USER_EDITED_LS_KEY)
    } catch {
      console.warn('[finder] resetCvToDefault: localStorage write failed')
    }
    dispatch({ type: 'CvSummaryLoaded', cvSummary: DEFAULT_CV_SUMMARY })
  }
}

export function loadOpportunityCmd(
  ports: FinderPorts,
  id: number,
  opts?: { revealDiscover?: boolean },
): Cmd<FinderMsg> {
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
      // Boot/hydrate must not steal the sidebar. Only explicit Open/select (reveal) goes to Discover.
      // Waybar Apply (`open-route=heading`) holds Heading even if a caller asked to reveal.
      if (opts?.revealDiscover && !isClusterHeadingHold()) {
        dispatch({ type: 'ScreenChanged', screen: 'discover' })
      }
      // Ensure live model has the url for panel (Open button + prep re-dispatch with correct source_url). Pure setter, no I/O.
      dispatch({ type: 'OpportunityTargetUrlSet', url: o.source_url })
      dispatch({ type: 'OpportunityTargetJdSet', pasted_jd: usableOpportunityJdText(o.jd_text) })

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

      const packFromNotes = packExportFromOpportunityNotes(o.notes)
      if (packFromNotes) {
        dispatch({
          type: 'ApplicationPackHydrated',
          opportunity_id: o.id,
          pack_dir: packFromNotes.pack_dir,
          pack_slug: packFromNotes.pack_slug || undefined,
        })
      }

      if (o.prep_artifacts_json) {
        try {
          const parsed = JSON.parse(o.prep_artifacts_json) as Partial<OpportunityTargetPrepResult> & { prep?: unknown }
          const prepData =
            parsed && typeof parsed === 'object' && 'prep' in parsed && (parsed as { prep?: unknown }).prep
              ? (parsed as { prep?: unknown }).prep
              : parsed
          const prepObj = prepData as OpportunityTargetPrep
          const prepRes: OpportunityTargetPrepResult = {
            opportunity_id: (parsed as { opportunity_id?: number }).opportunity_id ?? o.id,
            prep: prepObj,
            proof_variant_id:
              (parsed as { proof_variant_id?: string }).proof_variant_id ??
              prepObj?.proof_variant_id,
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
      // Consume open-route *before* last-opp hydrate / HistoryRefreshed, or Discover wins the sidebar.
      return (dispatch) => {
        watchClusterRoute(dispatch)
        const startRest = () => {
          credentialsCheckCmd(ports)(dispatch)
          historyRefreshCmd(ports)(dispatch)
          loadCvFromLocalCmd()(dispatch)
          hydrateLatestQuestCmd(ports)(dispatch)
          listQuestRecentCmd(ports)(dispatch)
          if (typeof window !== 'undefined' && !isClusterHeadingHold()) {
            const fromHash = screenFromHash(window.location.hash)
            if (fromHash && fromHash !== model.activeScreen) {
              dispatch({ type: 'ScreenChanged', screen: fromHash })
            }
          }
          const lastId = model.lastActiveOppId
          if (typeof lastId === 'number' && lastId > 0) {
            const bootUrl = model.opportunityTargetUrl
            dispatch({
              type: 'OpportunitySelected',
              id: lastId,
              ...(bootUrl ? { url: bootUrl } : {}),
            })
          }
        }
        void headingBootFromCluster(dispatch).then(startRest, startRest)
      }

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
    case 'ApplicationPackExportRequested':
      return exportApplicationPackCmd(ports, msg.opportunity_id)
    case 'GenerateApplyCvRequested':
      return generateApplyCvCmd(ports, msg.opportunity_id)
    case 'OpportunityStatusChangeRequested':
      return updateOpportunityStatusCmd(ports, msg.id, msg.status)
    case 'OpportunityOutcomeChangeRequested':
      return updateOpportunityOutcomeCmd(ports, msg.id, msg.outcomeStatus)
    case 'PipelineRefreshRequested':
      return pipelineRefreshCmd(ports)
    case 'HireBoardRefreshRequested':
      return hireBoardRefreshCmd(ports, model)
    case 'HireBoardSelectRequested':
      return hireBoardSelectCmd(ports, msg.lead)
    case 'HireBoardGeoToggled':
      return model.hireBoard.status === 'ready' || model.hireBoard.status === 'failed'
        ? hireBoardRefreshCmd(ports, model)
        : undefined
    case 'HireBoardEvaluateRequested':
      return [
        (d) => d({ type: 'OpportunityTargetUrlSet', url: msg.lead.career_url }),
        opportunityTargetAnalyzeCmd(ports, {
          ...model,
          opportunityTargetUrl: msg.lead.career_url,
        }, {
          url: msg.lead.career_url,
          company: msg.lead.company,
          title: msg.lead.company,
        }),
      ]
    case 'QuestRequested':
      return [persistLastQuestTurnCmd(ports, model, 'user'), localGrokQuestCmd(ports, model)]
    case 'QuestSucceeded':
      return [persistLastQuestTurnCmd(ports, model, 'assistant'), listQuestRecentCmd(ports)]
    case 'QuestToggled':
      return model.questOpen ? listQuestRecentCmd(ports) : undefined
    case 'QuestSearchRequested':
      return searchQuestTurnsCmd(ports, model)
    case 'QuestThreadLoadRequested':
      return loadQuestThreadCmd(ports, msg.sessionId)
    case 'PlatsbankenSearchRequested':
      return platsbankenSearchCmd(ports, model)
    case 'PlatsbankenImportRequested':
      return platsbankenImportCmd(ports, msg.lead)
    case 'PlatsbankenRemoveRequested':
      return platsbankenRemoveCmd(ports, msg.lead)
    case 'PlatsbankenMunicipalityChanged':
      return model.platsbanken.status === 'ready' || model.platsbanken.status === 'failed'
        ? platsbankenSearchCmd(ports, model)
        : undefined
    case 'PlatsbankenEvaluateRequested':
      return platsbankenEvaluateCmd(ports, model, msg.lead)
    case 'DurableFirmsRequested':
      return durableFirmsCmd(ports, msg.next === true)
    case 'DurableFirmsSucceeded':
      return msg.advanced
        ? (dispatch) => {
            dispatch({ type: 'MissionFirmsSearchRequested', forceRefresh: true })
          }
        : undefined
    case 'MissionLeadInspectRequested':
      return missionLeadInspectCmd(ports, msg.lead)
    case 'MissionFirmsSearchRequested':
      return missionFirmsSearchCmd(ports, model, {
        forceRefresh: msg.forceRefresh === true,
      })
    case 'MissionFirmsImportRequested':
      return missionFirmsImportCmd(ports, msg.lead)
    case 'MissionFirmsFirmToggled':
    case 'MissionFirmsTexasOnlyToggled':
    case 'MissionFirmsTerafabBiasToggled':
      return model.missionFirms.status === 'ready' || model.missionFirms.status === 'failed'
        ? missionFirmsSearchCmd(ports, model)
        : undefined
    case 'MissionFirmsEvaluateRequested':
      return missionFirmsEvaluateCmd(ports, model, msg.lead)
    case 'NetworkLoadRequested':
      return networkLoadCmd(ports, msg.force_reimport === true)
    case 'NetworkResolveXRequested':
      return networkResolveXCmd(ports, model)
    case 'NetworkEnrichLinkedInRequested':
      return networkEnrichLinkedInCmd(ports, model)
    case 'OpportunityTargetPastedJdChanged':
      return (/*dispatch*/) => {
        const text = msg.pasted_jd
        persistSessionToLocal({
          opportunityTargetPastedJd: text
            ? text.slice(0, PASTED_JD_SESSION_MAX_CHARS)
            : undefined,
        })
      }
    case 'OpportunityTargetAnalyzeRequested':
      persistSessionToLocal({
        opportunityTargetPastedJd: (msg.pasted_jd ?? model.opportunityTargetPastedJd)
          ? (msg.pasted_jd ?? model.opportunityTargetPastedJd)!.slice(0, PASTED_JD_SESSION_MAX_CHARS)
          : undefined,
        ...(msg.url ? { opportunityTargetUrl: msg.url } : {}),
      })
      return opportunityTargetAnalyzeCmd(ports, model, { url: msg.url, pasted_jd: msg.pasted_jd })
    case 'OpportunityTargetPrepRequested':
      return opportunityTargetPrepCmd(ports, model, { opportunity_id: msg.opportunity_id, url: msg.url, pasted_jd: msg.pasted_jd })

    // CV persist side-effect (localStorage cache). Triggered on every edit.
    case 'CvSummaryChanged':
      return (/*dispatch*/) => {
        try {
          localStorage.setItem(CV_USER_EDITED_LS_KEY, '1')
        } catch {
          /* ignore */
        }
        persistCvToLocal(model.cvSummary)
      }

    // Session id/screen persist (for resume). Also creds probe for settings already handled.
    case 'ScreenChanged':
      if (msg.screen === 'heading') {
        void clearClusterRoute()
      } else {
        releaseClusterHeadingHold()
      }
      // existing creds check for settings
      const credsCmd = msg.screen === 'settings' ? credentialsCheckCmd(ports) : undefined
      const networkCmd =
        msg.screen === 'network' && model.network.status === 'idle'
          ? (d: (msg: FinderMsg) => void) => d({ type: 'NetworkLoadRequested' })
          : undefined
      const sessCmd = (/*dispatch*/) => {
        applyScreenHash(msg.screen)
        persistSessionToLocal({ activeScreen: msg.screen })
      }
      return [credsCmd, networkCmd, sessCmd].filter(Boolean) as Cmd<FinderMsg>[]

    // Opportunity load + hydrate opportunityTarget from DB (no xAI). Screen only if msg.reveal.
    // Note: url (if passed in msg from Data row) is applied in update *before* this effect runs; loadCmd ensures via OpportunityTargetUrlSet for AppStarted path.
    // Always run the load for explicit user intent (rail click, resume, data row) or startup restore.
    // The previous guard prevented loadCmd from ever running (because update sets 'loading' before effect sees the 'next' model).
    // loadCmd itself handles not-found / errors by clearing and GlobalError.
    case 'OpportunitySelected':
      return loadOpportunityCmd(ports, msg.id, { revealDiscover: msg.reveal === true })

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
    // Mission/Sweden Pull also refresh history — do not steal those screens with the last Discover opp.
    case 'HistoryRefreshed':
      if (model.activeScreen !== 'discover') {
        return undefined
      }
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
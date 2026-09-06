import { toAppError } from '../error'
import { fromPromise } from '../result'
import type { Cmd } from '../mvu/engine'
import type { AppError } from '../error'
import type { FinderMsg } from './msg'
import type { FinderModel } from './model'
import type { Opportunity } from '../domain/history'
import { jobtechDroppedTokensMessage, prepareJobtechQuery } from '../domain/hunt-rails'
import type { FinderPorts } from './effects'
import { persistSessionToLocal } from './effects-session'

export type HuntAnalyzeFn = (
  ports: FinderPorts,
  model: FinderModel,
  payload: { url?: string; pasted_jd?: string; title?: string; company?: string },
) => Cmd<FinderMsg>

/** Import an opportunity row, dispatch hunt-specific success msgs, then run analyze. */
export function importOpportunityThenAnalyze(
  ports: FinderPorts,
  model: FinderModel,
  analyze: HuntAnalyzeFn,
  opts: {
    import: () => Promise<Opportunity>
    importFailedMsg: (error: AppError) => FinderMsg
    importSucceededMsgs: (opportunity: Opportunity) => FinderMsg[]
    analyzeFrom: (opportunity: Opportunity) => {
      pasted_jd?: string
      url?: string
      title?: string
      company?: string
    }
  },
): Cmd<FinderMsg> {
  return (dispatch) => {
    void fromPromise(opts.import(), toAppError).then((result) => {
      if (!result.ok) {
        dispatch(opts.importFailedMsg(result.error))
        return
      }
      const opportunity = result.value
      for (const msg of opts.importSucceededMsgs(opportunity)) {
        dispatch(msg)
      }
      dispatch({ type: 'HistoryRefreshRequested' })
      analyze(ports, model, opts.analyzeFrom(opportunity))(dispatch)
    })
  }
}

export function platsbankenSearchCmd(ports: FinderPorts, model: FinderModel): Cmd<FinderMsg> {
  const prep = prepareJobtechQuery(model.platsbankenQ)
  if (!prep.query.trim()) {
    return (dispatch) => {
      const message = prep.dropped.length
        ? `JobTech query is empty after removing: ${prep.dropped.join(', ')}. Add searchable terms.`
        : 'Enter a JobTech query — municipality-only search is blocked (too much unrelated volume).'
      dispatch({ type: 'PlatsbankenSearchFailed', error: toAppError(new Error(message)) })
    }
  }
  const droppedNotice = jobtechDroppedTokensMessage(prep.dropped)
  return (dispatch) => {
    void fromPromise(
      ports.finder.searchPlatsbanken({
        q: prep.query,
        municipality: model.platsbankenMunicipality || undefined,
        limit: 30,
      }),
      toAppError,
    ).then((result) => {
      if (!result.ok) {
        dispatch({ type: 'PlatsbankenSearchFailed', error: result.error })
        return
      }
      dispatch({
        type: 'PlatsbankenSearchSucceeded',
        leads: result.value,
        droppedNotice,
      })
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
  analyze: HuntAnalyzeFn,
): Cmd<FinderMsg> {
  return importOpportunityThenAnalyze(ports, model, analyze, {
    import: () => ports.finder.importPlatsbankenAd(lead.ad_id),
    importFailedMsg: (error) => ({ type: 'PlatsbankenImportFailed', error }),
    importSucceededMsgs: (opportunity) => [{ type: 'PlatsbankenImportSucceeded', opportunity }],
    analyzeFrom: (opportunity) => ({
      pasted_jd: opportunity.jd_text,
      url: opportunity.source_url || lead.webpage_url,
      title: opportunity.title || lead.headline,
      company: opportunity.company || lead.employer,
    }),
  })
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
        limit: 250,
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
  analyze: HuntAnalyzeFn,
): Cmd<FinderMsg> {
  return importOpportunityThenAnalyze(ports, model, analyze, {
    import: () =>
      ports.finder.importMissionFirmLead({
        firm_id: lead.firm_id,
        source: lead.source,
        external_id: lead.external_id,
        absolute_url: lead.absolute_url,
      }),
    importFailedMsg: (error) => ({ type: 'MissionFirmsImportFailed', error }),
    importSucceededMsgs: (opportunity) => [
      { type: 'MissionFirmsImportSucceeded', opportunity },
      {
        type: 'OpportunitySelected',
        id: opportunity.id,
        url: opportunity.source_url || lead.absolute_url,
        reveal: true,
      },
    ],
    analyzeFrom: (opportunity) => ({
      pasted_jd: opportunity.jd_text,
      url: opportunity.source_url || lead.absolute_url,
      title: opportunity.title || lead.title,
      company: opportunity.company || lead.firm_label,
    }),
  })
}

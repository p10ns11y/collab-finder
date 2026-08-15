/**
 * Shared fit/prep major pane for Discover · Mission · Sweden.
 * Same OpportunityTargetFitPanel wiring — hunt screens stay φ-consistent.
 */
import * as React from 'react'
import { OpportunityTargetFitPanel } from './opportunity-target-fit-panel'
import {
  DEFAULT_FIT_MODE,
  parseFitMode,
  type FitMode,
} from '../../core/domain/fit-mode'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function HuntFitPane({ view, dispatch }: Props) {
  const { model } = view
  const [fitMode, setFitMode] = React.useState<FitMode>(DEFAULT_FIT_MODE)

  React.useEffect(() => {
    void safeInvoke<string>('get_fit_mode_cmd', {}).then((res) => {
      if (res.ok && res.value) setFitMode(parseFitMode(res.value))
    })
  }, [])

  const targetState = model.opportunityTarget ?? { status: 'idle' as const }
  const targetBusy = targetState.status === 'loading'
  const targetResult = targetState.status === 'ready' ? targetState.data : null
  const targetError =
    targetState.status === 'failed' ? targetState.error?.message || String(targetState.error) : null

  const historyOpportunities = view.historyOpportunities || []
  const selectedOppId =
    targetResult && 'opportunity_id' in targetResult
      ? targetResult.opportunity_id
      : model.lastActiveOppId
  const selectedOpp =
    typeof selectedOppId === 'number'
      ? historyOpportunities.find((o) => o.id === selectedOppId)
      : undefined
  const sourceUrl = model.opportunityTargetUrl || selectedOpp?.source_url
  const pipelineStatus = selectedOpp?.status

  return (
    <OpportunityTargetFitPanel
      result={targetResult}
      error={targetError}
      busy={targetBusy}
      sourceUrl={sourceUrl}
      pipelineStatus={pipelineStatus}
      fitMode={fitMode}
      onClear={() => dispatch({ type: 'OpportunityTargetCleared' })}
      onPrepRequested={(opportunityId) =>
        dispatch({
          type: 'OpportunityTargetPrepRequested',
          opportunity_id: opportunityId,
          url: sourceUrl,
          pasted_jd: model.opportunityTargetPastedJd || selectedOpp?.jd_text,
        })
      }
      onProposeSidecar={(opportunityId) => {
        if (opportunityId)
          dispatch({ type: 'CvSidecarProposeRequested', opportunity_id: opportunityId })
      }}
      onExportPack={(opportunityId) => {
        if (opportunityId)
          dispatch({ type: 'ApplicationPackExportRequested', opportunity_id: opportunityId })
      }}
      onGenerateApplyCv={(opportunityId) => {
        if (opportunityId)
          dispatch({ type: 'GenerateApplyCvRequested', opportunity_id: opportunityId })
      }}
      onStatusChange={(id, status) =>
        dispatch({ type: 'OpportunityStatusChangeRequested', id, status })
      }
      lastSidecarProposal={view.lastSidecarProposal}
      lastApplicationPackExport={view.lastApplicationPackExport}
      lastApplyCv={view.lastApplyCv}
      companyName={selectedOpp?.company}
      roleTitle={selectedOpp?.title}
    />
  )
}

export function huntTargetIsActive(view: FinderViewState): boolean {
  const targetState = view.model.opportunityTarget ?? { status: 'idle' as const }
  return (
    targetState.status === 'loading' ||
    targetState.status === 'ready' ||
    targetState.status === 'failed'
  )
}

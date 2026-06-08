import * as React from 'react'
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { CvSummaryInput } from '../../components/finder/cv-summary-input'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { JobFitPanel } from '../../components/finder/job-fit-panel'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/** Primary workspace: Quick Job Target + global CV context + X search controls left;
 *  contextual results (job fit or X feed) on right.
 *
 *  CV summary is placed first (reordered) so it is owned by / context for the job flow (addresses T1).
 *  It remains shared cross-cutting for X too. When a job target is active (showJobFit), X workspace is
 *  rendered secondary (visual + implicit mode per user decision: primary job, X as needed).
 *  Resume-last affordance uses the opportunities already loaded via HistoryRefreshed/selectors.
 */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0
  const historyOpportunities = view.historyOpportunities || []

  // Job target state is now in MVU model (jobTarget + jobTargetUrl); right panel priority per feedback.
  // jobResult is now typed JobTargetResult | null (no any at call sites).
  const jt = model.jobTarget ?? { status: 'idle' as const }
  const jobBusy = jt.status === 'loading'
  const jobResult = jt.status === 'ready' ? jt.data : null
  const jobError = jt.status === 'failed' ? (jt.error?.message || String(jt.error)) : null
  const showJobFit = jobBusy || !!jobResult || !!jobError
  const sourceUrl = model.jobTargetUrl

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left: controls (scrollable) */}
      <div className="w-full lg:w-[38%] xl:w-[34%] 2xl:w-[30%] lg:min-w-[320px] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-4">

        {/* CV first so it feels owned by the job target flow (sticky context for fit/prep; reorder addresses T1 "CV editor still appears *after* the job form").
           Persisted to localStorage (PR3 foundation) so value survives restart. */}
        <CvSummaryInput
          cvSummary={model.cvSummary}
          onCvSummaryChange={(cvSummary) =>
            dispatch({ type: 'CvSummaryChanged', cvSummary })
          }
        />

        {/* Resume last work (explicit affordance per design + user decision for restore).
           Reuses historyOpportunities (populated by HistoryRefreshed + selectors + getOpps) + OpportunitySelected dispatch.
           Loads exact stored analysis/prep into jobTarget without re-pay. Shows only when no active job. */}
        {!showJobFit && historyOpportunities.length > 0 && (
          <button
            onClick={() => {
              const last = historyOpportunities[0]
              if (last) dispatch({ type: 'OpportunitySelected', id: last.id })
            }}
            className="w-full text-left px-3 py-1.5 text-xs rounded border border-accent/60 hover:bg-accent/10 text-accent flex items-center gap-2"
            title="Load the most recent opportunity (by last_updated) from Data/History back into Discover jobTarget + fit/prep view. Reuses stored analysis without calling xAI again."
          >
            ↩ Resume last work <span className="text-ink-faint">(opp #{historyOpportunities[0].id})</span>
          </button>
        )}

        {/* Quick Job Target (input only — results move to right panel via MVU) */}
        <QuickJobTarget
          busy={jobBusy}
          onAnalyzeRequested={(url, pasted_jd) =>
            dispatch({ type: 'JobTargetAnalyzeRequested', url, pasted_jd })
          }
        />

        {/* X workspace secondary / visually de-emphasized when in job context (implicit mode; job primary per user decision).
           Keeps full capability but does not pollute the primary job-fit+prep flow. */}
        <div className={showJobFit ? 'opacity-60' : ''}>
          <SearchWorkspace
            query={model.query}
            busy={view.busy}
            canSearch={view.canSearch}
            canRunCycle={view.canRunCycle}
            presets={view.presets}
            onQueryChange={(query) => dispatch({ type: 'QueryChanged', query })}
            onPresetSelect={(query) => dispatch({ type: 'PresetSelected', query })}
            onSearch={() => dispatch({ type: 'SearchRequested' })}
            onAutonomousCycle={() => dispatch({ type: 'CycleRequested' })}
          />
        </div>

        {model.decision && (
          <DecisionPanel
            decision={model.decision}
            onRerun={() => dispatch({ type: 'CycleRequested' })}
            onPromote={() => dispatch({ type: 'PromoteRequested' })}
          />
        )}

        <PauseLog pauses={model.pauses} />
      </div>

      {/* Right: contextual results (job fit takes priority over X feed) */}
      <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-4">
        {showJobFit ? (
          <JobFitPanel
            result={jobResult}
            error={jobError}
            busy={jobBusy}
            sourceUrl={sourceUrl}
            onClear={() => dispatch({ type: 'JobTargetCleared' })}
            onPrepRequested={(opportunityId) =>
              dispatch({ type: 'JobTargetPrepRequested', opportunity_id: opportunityId, url: sourceUrl })
            }
          />
        ) : (
          <>
            <TweetFeed tweets={view.tweets} />
            {!hasXResults && (
              <div className="mt-8 rounded-lg border border-border-subtle bg-surface-1/60 p-6 text-center text-sm text-ink-faint">
                No live results yet.<br />
                Paste a job URL or JD on the left, or run an X search / cycle below.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type QuickJobTargetProps = {
  busy: boolean
  onAnalyzeRequested: (url?: string, pasted_jd?: string) => void
}

/** Quick Job Target input form.
 *  Dispatches MVU message; results render in right panel (JobFitPanel) via model.jobTarget.
 *  CV summary (global context) is read from model inside the effect.
 *  No direct invoke — all I/O goes through effects/ports (per architecture).
 */
function QuickJobTarget({ busy, onAnalyzeRequested }: QuickJobTargetProps) {
  const [url, setUrl] = React.useState('')
  const [pasted, setPasted] = React.useState('')

  const canAnalyze = !busy && (url.trim() || pasted.trim())

  const run = (wantPrep: boolean) => {
    if (wantPrep) return // Use the "Generate prep pack" button in the result panel after evaluation (Slice C)
    onAnalyzeRequested(url.trim() || undefined, pasted.trim() || undefined)
  }

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="font-medium text-sm mb-2 flex items-center gap-2">
        🎯 Quick Job Target (URL or paste JD)
        <span className="text-[10px] text-accent">grok-4.3</span>
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://company.com/careers/job-123 (optional)"
        className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-accent/60"
      />
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste the full job description here (recommended for LinkedIn etc.)"
        rows={4}
        className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60"
      />
      <div className="flex gap-2">
        <button
          onClick={() => run(false)}
          disabled={!canAnalyze}
          className="px-3 py-1.5 text-sm rounded border border-border-default hover:border-accent/60 disabled:opacity-50"
        >
          {busy ? 'Evaluating…' : 'Evaluate fit'}
        </button>
        <button
          onClick={() => run(true)}
          disabled
          title="Full prep (CV tweaks + cover letter) coming in a future update"
          className="px-3 py-1.5 text-sm rounded border border-border-default opacity-60 cursor-not-allowed"
        >
          Full Prep (coming soon)
        </button>
      </div>

      <div className="mt-2 text-[10px] text-ink-faint">
        Uses the CV summary packet above (global context for this job target; also shared with X search &amp; prep if used). Results appear on the right. (Reopened jobs from Data/Resume restore fit/prep + Open URL to right panel; this form is for new evaluations.)
      </div>
    </div>
  )
}


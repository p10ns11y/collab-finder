import * as React from 'react'
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { JobFitPanel } from '../../components/finder/job-fit-panel'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/** Primary workspace: query + CV + presets left; live results feed right (split on lg+). */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0

  // Lifted job target state (minimal for this iteration — right panel can react)
  const [jobResult, setJobResult] = React.useState<any>(null)
  const [jobError, setJobError] = React.useState<string | null>(null)
  const [jobBusy, setJobBusy] = React.useState(false)

  const showJobFit = !!jobResult || jobBusy || !!jobError

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left: controls (scrollable) */}
      <div className="w-full lg:w-[38%] xl:w-[34%] 2xl:w-[30%] lg:min-w-[320px] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-4">

        {/* Quick Job Target (input only — results move to right panel) */}
        <QuickJobTarget
          cvSummary={model.cvSummary}
          busy={jobBusy}
          onBusyChange={setJobBusy}
          onResult={(r) => { setJobResult(r); setJobError(null) }}
          onError={(e) => { setJobError(e); setJobResult(null) }}
        />

        <SearchWorkspace
          query={model.query}
          cvSummary={model.cvSummary}
          busy={view.busy}
          canSearch={view.canSearch}
          canRunCycle={view.canRunCycle}
          presets={view.presets}
          onQueryChange={(query) => dispatch({ type: 'QueryChanged', query })}
          onCvSummaryChange={(cvSummary) =>
            dispatch({ type: 'CvSummaryChanged', cvSummary })
          }
          onPresetSelect={(query) => dispatch({ type: 'PresetSelected', query })}
          onSearch={() => dispatch({ type: 'SearchRequested' })}
          onAutonomousCycle={() => dispatch({ type: 'CycleRequested' })}
        />

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
          <JobFitPanel result={jobResult} error={jobError} busy={jobBusy} />
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
  cvSummary: string
  busy: boolean
  onBusyChange: (b: boolean) => void
  onResult: (r: any) => void
  onError: (e: string) => void
}

/** Quick Job Target input form.
 *  Results are lifted to parent so they render in the contextual right panel (per feedback).
 *  Uses the CV summary from the textarea below for grounding.
 */
function QuickJobTarget({ cvSummary, busy, onBusyChange, onResult, onError }: QuickJobTargetProps) {
  const [url, setUrl] = React.useState('')
  const [pasted, setPasted] = React.useState('')

  const runAnalyze = async (_wantPrep: boolean) => {
    onBusyChange(true)
    onError('')
    try {
      const hasKey = await safeInvoke<boolean>('has_xai_key', {})
      if (!hasKey.ok || !hasKey.value) {
        onError('Please save your xAI API key first in Settings → xAI Intelligence panel.')
        return
      }

      const payload: any = {
        url: url.trim() || undefined,
        pasted_jd: pasted.trim() || undefined,
        cv_summary: cvSummary || undefined,
      }

      const res = await safeInvoke<any>('analyze_job_target', payload)
      if (res.ok) {
        onResult(res.value)
      } else {
        onError(res.error?.message || String(res.error))
      }
    } catch (e: any) {
      onError(e?.message || String(e))
    } finally {
      onBusyChange(false)
    }
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
          onClick={() => runAnalyze(false)}
          disabled={busy || (!url.trim() && !pasted.trim())}
          className="px-3 py-1.5 text-sm rounded border border-border-default hover:border-accent/60 disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Analyze fit'}
        </button>
        <button
          onClick={() => runAnalyze(true)}
          disabled
          title="Full prep (CV tweaks + cover letter) ships in the next slice"
          className="px-3 py-1.5 text-sm rounded border border-border-default opacity-60 cursor-not-allowed"
        >
          Analyze + Full Prep
        </button>
      </div>

      <div className="mt-2 text-[10px] text-ink-faint">
        Uses the CV summary from the box below. Results appear on the right. Full prep coming soon.
      </div>
    </div>
  )
}


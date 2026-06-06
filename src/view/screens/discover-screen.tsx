import * as React from 'react'
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { TweetFeed } from '../../components/finder/tweet-feed'
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
  const hasResults = view.tweets.length > 0

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left: controls (scrollable) */}
      <div className="w-full lg:w-[38%] xl:w-[34%] 2xl:w-[30%] lg:min-w-[320px] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-4">

        {/* NEW: Quick Job Target (web URL or paste JD) — primary useful flow */}
        <QuickJobTarget />

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

      {/* Right: results (fills, scrollable) */}
      <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-4">
        <TweetFeed tweets={view.tweets} />

        {!hasResults && (
          <div className="mt-8 rounded-lg border border-border-subtle bg-surface-1/60 p-6 text-center text-sm text-ink-faint">
            No live results yet.<br />
            Use the form on the left to search or run a guarded autonomous cycle.
          </div>
        )}
      </div>
    </div>
  )
}

/** Quick usable job target analyzer (direct invoke for fast dogfood).
 *  Full MVU integration + rich review panel comes in the next polish slice.
 */
function QuickJobTarget() {
  const [url, setUrl] = React.useState('')
  const [pasted, setPasted] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)

  const runAnalyze = async (_fullPrep: boolean) => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      // First make sure we have xAI key (user provides it)
      const hasKey = await safeInvoke<boolean>('has_xai_key', {})
      if (!hasKey.ok || !hasKey.value) {
        setError('Please save your xAI API key first in Settings → xAI Intelligence panel.')
        setBusy(false)
        return
      }

      const payload: any = {
        url: url.trim() || undefined,
        pasted_jd: pasted.trim() || undefined,
      }
      const res = await safeInvoke<any>('analyze_job_target', payload)
      if (res.ok) {
        setResult(res.value)
      } else {
        setError(res.error?.message || String(res.error))
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
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
          {busy ? 'Analyzing…' : 'Analyze for fit'}
        </button>
        <button
          onClick={() => runAnalyze(true)}
          disabled={busy || (!url.trim() && !pasted.trim())}
          className="px-3 py-1.5 text-sm rounded bg-accent text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Analyze + Full Prep'}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      {result && (
        <div className="mt-3 text-xs border border-border-subtle rounded p-2 bg-surface-0">
          <div className="font-mono text-accent">opportunity #{result.opportunity_id}</div>
          <div>Est cost: ${result.est_cost_usd?.toFixed(4) ?? '—'}</div>
          <pre className="mt-1 max-h-48 overflow-auto text-[10px]">{JSON.stringify(result.fit, null, 2)}</pre>
          <div className="mt-1 text-ink-faint">Packet preview (what was sent): {result.packet_preview?.slice(0, 200)}…</div>
        </div>
      )}
      <div className="mt-2 text-[10px] text-ink-faint">
        Saves to local history. Full editable review + CV tweaks + letters in the next slice.
      </div>
    </div>
  )
}


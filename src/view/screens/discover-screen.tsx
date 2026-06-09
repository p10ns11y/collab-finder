import * as React from 'react'
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { CvSummaryInput } from '../../components/finder/cv-summary-input'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { TargetFitPanel } from '../../components/finder/target-fit-panel'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/** Primary workspace (Discover screen): opportunity rail + quick target analyze/prep + (optionally) X controls.
 *  Right panel shows fit/prep results for the current target (or X feed on Xplore).
 *
 *  The product covers opportunities (roles, collabs, side hustles, community, etc.).
 *  "Discover" = manage/continue opportunities you've found (rail + quick target).
 *  "Xplore" = actively search X for new ones.
 *  CV context is global but emphasized in Discover for opportunity work.
 */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0
  const historyOpportunities = view.historyOpportunities || []

  const isDiscover = view.activeScreen === 'discover'

  // Current target state (target + targetUrl in model) for the quick analyze/prep flow.
  // This applies to any opportunity type. Right panel priority.
  const targetState = model.opportunityTarget ?? { status: 'idle' as const }
  const targetBusy = targetState.status === 'loading'
  const targetResult = targetState.status === 'ready' ? targetState.data : null
  const targetError = targetState.status === 'failed' ? (targetState.error?.message || String(targetState.error)) : null
  const showTarget = targetBusy || !!targetResult || !!targetError
  const sourceUrl = model.opportunityTargetUrl

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left: controls (scrollable) */}
      <div className="w-full lg:w-[38%] xl:w-[34%] 2xl:w-[30%] lg:min-w-[320px] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-4">

        {/* CV context (emphasized for Discover / quick target + X flows). */}
        {isDiscover && (
          <CvSummaryInput
            cvSummary={model.cvSummary}
            onCvSummaryChange={(cvSummary) =>
              dispatch({ type: 'CvSummaryChanged', cvSummary })
            }
          />
        )}

        {/* Your Opportunities rail (Discover screen; always visible list from opportunities - the "list is memory" per plan).
           Click loads into panel (reuse OpportunitySelected + load from DB blobs, no new xAI).
           This is the primary surface for managing/continuing opportunities (jobs, collabs, side hustles, community, etc.).
           Optimistic updates via refresh after analyze/prep. */}
        {isDiscover && (
          <div className="border border-border-subtle rounded p-2">
            <div className="text-[10px] text-ink-faint mb-1 tracking-wide">YOUR OPPORTUNITIES</div>
            {historyOpportunities.length === 0 ? (
              <div className="text-xs text-ink-faint">No opportunities yet. Paste URL or description below to analyze.</div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-auto text-xs">
                {historyOpportunities.slice(0, 8).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => dispatch({ type: 'OpportunitySelected', id: o.id, url: o.source_url || undefined })}
                    className="w-full text-left px-2 py-1 rounded hover:bg-surface-2 border border-border-subtle/50 flex justify-between"
                    title={`Load #${o.id} fit+prep (from DB, no xAI call)`}
                  >
                    <span>#{o.id} {o.title || o.source_url?.slice(0,40) || 'target'}</span>
                    <span className="text-ink-faint">{o.fit_score ? `${o.fit_score}/100` : ''} {o.status === 'prepped' ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Resume last (Discover mode; kept for compatibility, rail above is the main) */}
        {isDiscover && !showTarget && historyOpportunities.length > 0 && (
          <button
            onClick={() => {
              const last = historyOpportunities[0]
              if (last) dispatch({ type: 'OpportunitySelected', id: last.id })
            }}
            className="w-full text-left px-3 py-1.5 text-xs rounded border border-accent/60 hover:bg-accent/10 text-accent flex items-center gap-2"
            title="Load the most recent opportunity from the rail (reuses stored analysis/prep without xAI)."
          >
            ↩ Resume last <span className="text-ink-faint">(#{historyOpportunities[0].id})</span>
          </button>
        )}

        {/* Quick Target (Discover mode — analyze + prep for a specific opportunity URL/JD).
           Results appear in the right panel. The flow works for any opportunity type. */}
        {isDiscover && (
          <QuickTarget
            busy={targetBusy}
            onAnalyzeRequested={(url, pasted_jd) =>
              dispatch({ type: 'TargetAnalyzeRequested', url, pasted_jd })
            }
          />
        )}

        {/* X search workspace only on Xplore screen.
           "Xplore" is the mode to actively find new opportunities on X (search + autonomous cycle).
           Discover is for working with opportunities you've found (rail, quick target analyze/prep).
           Per plan: clean separation, no mode pollution. */}
        {!isDiscover && (
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
        )}

        {/* DecisionPanel (cycle results) only on Xplore per plan split. */}
        {!isDiscover && model.decision && (
          <DecisionPanel
            decision={model.decision}
            onRerun={() => dispatch({ type: 'CycleRequested' })}
            onPromote={() => dispatch({ type: 'PromoteRequested' })}
          />
        )}

        {/* PauseLog kept for now (guards can apply to both flows); move to Xplore-only if desired later. */}
        <PauseLog pauses={model.pauses} />
      </div>

      {/* Right: contextual results.
         Discover: only opportunity fit/prep (or clean empty state). No X feed.
         Xplore: X search results / cycle output (TweetFeed). */}
      <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-4">
        {(isDiscover && showTarget) ? (
          <TargetFitPanel
            result={targetResult}
            error={targetError}
            busy={targetBusy}
            sourceUrl={sourceUrl}
            onClear={() => dispatch({ type: 'TargetCleared' })}
            onPrepRequested={(opportunityId) =>
              dispatch({ type: 'TargetPrepRequested', opportunity_id: opportunityId, url: sourceUrl })
            }
          />
        ) : !isDiscover ? (
          <>
            <TweetFeed tweets={view.tweets} />
            {!hasXResults && (
              <div className="mt-8 rounded-lg border border-border-subtle bg-surface-1/60 p-6 text-center text-sm text-ink-faint">
                No live X results yet.<br />Run a search or autonomous cycle using the controls on the left.
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 rounded-lg border border-border-subtle bg-surface-1/60 p-6 text-center text-sm text-ink-faint">
            No opportunity selected.<br />
            Choose one from the YOUR OPPORTUNITIES rail on the left, or add a new one below.
          </div>
        )}
      </div>
    </div>
  )
}

type QuickTargetProps = {
  busy: boolean
  onAnalyzeRequested: (url?: string, pasted_jd?: string) => void
}

/** Quick Target input form (for any opportunity: role, collab, side hustle, community, etc.).
 *  Dispatches MVU message; results render in right panel (TargetFitPanel) via model.opportunityTarget.
 *  CV summary (global context) is read from model inside the effect.
 *  No direct invoke — all I/O goes through effects/ports (per architecture).
 */
function QuickTarget({ busy, onAnalyzeRequested }: QuickTargetProps) {
  const [url, setUrl] = React.useState('')
  const [pasted, setPasted] = React.useState('')

  const canAnalyze = !busy && (url.trim() || pasted.trim())

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="font-medium text-sm mb-2 flex items-center gap-2">
        🎯 Quick Target (URL or paste description)
        <span className="text-[10px] text-accent">grok-4.3</span>
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://company.com/careers/opp-123 (optional)"
        className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-accent/60"
      />
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste the full description / JD here (recommended)"
        rows={4}
        className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60"
      />
      <div>
        <button
          onClick={() => onAnalyzeRequested(url.trim() || undefined, pasted.trim() || undefined)}
          disabled={!canAnalyze}
          className="px-3 py-1.5 text-sm rounded border border-border-default hover:border-accent/60 disabled:opacity-50"
        >
          {busy ? 'Evaluating…' : 'Evaluate fit'}
        </button>
      </div>

      <div className="mt-2 text-[10px] text-ink-faint">
        Uses the CV summary packet above (global context for this target; also shared with X search &amp; prep if used). Results appear on the right. (Reopened from rail/Data restore fit/prep + Open URL; this form is for new evaluations.)
      </div>
    </div>
  )
}


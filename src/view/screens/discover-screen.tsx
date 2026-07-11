import * as React from 'react'
import { ExternalLink } from 'lucide-react'
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { CvSummaryInput } from '../../components/finder/cv-summary-input'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { OpportunityTargetFitPanel } from '../../components/finder/opportunity-target-fit-panel'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { displayOpportunityUrl, normalizeOpportunityUrl } from '../../core/domain/opportunity-url'
import {
  filterOpportunitiesForRail,
  normalizePipelineStatus,
  pipelineStatusLabel,
  type PipelineFilter,
} from '../../core/domain/opportunity-pipeline'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/**
 * Discover = opportunity memory + quick target + fit/prep (hero right pane).
 * Xplore = X hunt (same component, mode via activeScreen).
 * Layout: φ split (~38% controls / ~62% results).
 */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0
  const historyOpportunities = view.historyOpportunities || []
  const isDiscover = view.activeScreen === 'discover'

  const targetState = model.opportunityTarget ?? { status: 'idle' as const }
  const targetBusy = targetState.status === 'loading'
  const targetResult = targetState.status === 'ready' ? targetState.data : null
  const targetError =
    targetState.status === 'failed' ? targetState.error?.message || String(targetState.error) : null
  const showTarget = targetBusy || !!targetResult || !!targetError

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

  const [railFilter, setRailFilter] = React.useState<PipelineFilter>('active')
  const [railQuery, setRailQuery] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)

  const filtered = React.useMemo(
    () => filterOpportunitiesForRail(historyOpportunities, railFilter, railQuery),
    [historyOpportunities, railFilter, railQuery],
  )
  const railRows = showAll ? filtered : filtered.slice(0, 12)

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left — φ minor (~38.2%) */}
      <div
        className="w-full lg:min-w-[280px] lg:max-w-[min(420px,42%)] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-3"
        style={{ flex: '0 0 var(--pane-minor)' }}
      >
        {isDiscover && (
          <>
            {/* Rail first — list is memory */}
            <div className="border border-border-subtle rounded-lg bg-surface-1/40 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  Your opportunities
                </div>
                <span className="text-[10px] text-ink-faint tabular-nums">
                  {filtered.length}/{historyOpportunities.length}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 mb-2">
                {(
                  [
                    ['active', 'Active'],
                    ['all', 'All'],
                    ['prepped', 'Prepped'],
                    ['applied', 'Applied'],
                    ['passed', 'Passed'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRailFilter(id)}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      railFilter === id
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-border-subtle text-ink-faint hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {historyOpportunities.length > 0 && (
                <input
                  value={railQuery}
                  onChange={(e) => setRailQuery(e.target.value)}
                  placeholder="Filter title, host…"
                  className="w-full mb-2 bg-surface-0 border border-border-subtle rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-accent/60"
                />
              )}

              {historyOpportunities.length === 0 ? (
                <p className="text-xs text-ink-faint px-0.5">
                  No opportunities yet. Add a URL or JD below.
                </p>
              ) : railRows.length === 0 ? (
                <p className="text-xs text-ink-faint px-0.5">No matches for this filter.</p>
              ) : (
                <div className="space-y-1 max-h-[var(--rail-max)] overflow-auto text-xs">
                  {railRows.map((o) => {
                    const selected =
                      model.lastActiveOppId === o.id &&
                      model.opportunityTarget &&
                      model.opportunityTarget.status !== 'idle'
                    const href = normalizeOpportunityUrl(o.source_url)
                    const label =
                      o.title ||
                      o.company ||
                      displayOpportunityUrl(o.source_url, 32) ||
                      'target'
                    const st = normalizePipelineStatus(o.status)
                    return (
                      <div
                        key={o.id}
                        className={`flex items-stretch gap-0.5 rounded-md border ${
                          selected
                            ? 'border-accent/70 bg-accent/10 text-ink'
                            : 'border-border-subtle/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'OpportunitySelected',
                              id: o.id,
                              url: o.source_url || undefined,
                            })
                          }
                          className="min-w-0 flex-1 text-left px-2 py-1.5 rounded-md hover:bg-surface-2 flex flex-col gap-0.5"
                          title={`Load #${o.id} fit+prep (no xAI)`}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              <span className="font-mono text-accent/80">#{o.id}</span> {label}
                            </span>
                            <span className="text-ink-faint shrink-0 tabular-nums">
                              {o.fit_score != null ? `${o.fit_score}` : '—'}
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-faint">{pipelineStatusLabel(st)}</div>
                        </button>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 px-2 inline-flex items-center text-ink-muted hover:text-accent border-l border-border-subtle/50"
                            title={href}
                            aria-label={`Open opportunity #${o.id} in browser`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}

              {filtered.length > 12 && (
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  className="mt-1.5 w-full text-[10px] text-accent hover:underline"
                >
                  {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                </button>
              )}
            </div>

            <CvSummaryInput
              cvSummary={model.cvSummary}
              onCvSummaryChange={(cvSummary) =>
                dispatch({ type: 'CvSummaryChanged', cvSummary })
              }
              onResetToDefault={() => dispatch({ type: 'CvSummaryResetToDefaultRequested' })}
            />

            <QuickTarget
              busy={targetBusy}
              onAnalyzeRequested={(url, pasted_jd) =>
                dispatch({ type: 'OpportunityTargetAnalyzeRequested', url, pasted_jd })
              }
            />
          </>
        )}

        {!isDiscover && (
          <>
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
            {!view.canSearch && (
              <p className="text-[11px] text-ink-faint px-0.5">
                X bearer required.{' '}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => dispatch({ type: 'ScreenChanged', screen: 'settings' })}
                >
                  Open Settings
                </button>
              </p>
            )}
            {model.decision && (
              <DecisionPanel
                decision={model.decision}
                onRerun={() => dispatch({ type: 'CycleRequested' })}
                onPromote={() => dispatch({ type: 'PromoteRequested' })}
              />
            )}
          </>
        )}

        <PauseLog pauses={model.pauses} />
      </div>

      {/* Right — φ major (~61.8%) */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto p-3 lg:p-5">
        {isDiscover && showTarget ? (
          <OpportunityTargetFitPanel
            result={targetResult}
            error={targetError}
            busy={targetBusy}
            sourceUrl={sourceUrl}
            pipelineStatus={pipelineStatus}
            onClear={() => dispatch({ type: 'OpportunityTargetCleared' })}
            onPrepRequested={(opportunityId) =>
              dispatch({
                type: 'OpportunityTargetPrepRequested',
                opportunity_id: opportunityId,
                url: sourceUrl,
              })
            }
            onProposeSidecar={(opportunityId) => {
              if (opportunityId)
                dispatch({ type: 'CvSidecarProposeRequested', opportunity_id: opportunityId })
            }}
            onStatusChange={(id, status) =>
              dispatch({ type: 'OpportunityStatusChangeRequested', id, status })
            }
            lastSidecarProposal={view.lastSidecarProposal}
          />
        ) : !isDiscover ? (
          <>
            <TweetFeed tweets={view.tweets} />
            {!hasXResults && (
              <EmptyState
                title="No live X results yet"
                description="Run a search or autonomous cycle on the left. Cycle decisions are heuristic until structured analyze is wired."
              />
            )}
          </>
        ) : (
          <EmptyState
            title="No opportunity selected"
            description="Choose a row from Your opportunities, or evaluate a new target on the left."
          />
        )}
      </div>
    </div>
  )
}

type QuickTargetProps = {
  busy: boolean
  onAnalyzeRequested: (url?: string, pasted_jd?: string) => void
}

function QuickTarget({ busy, onAnalyzeRequested }: QuickTargetProps) {
  const [url, setUrl] = React.useState('')
  const [pasted, setPasted] = React.useState('')
  const canAnalyze = !busy && !!(url.trim() || pasted.trim())

  return (
    <div className="border border-border-subtle rounded-lg p-3 bg-surface-1/40 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">New target</span>
        <span className="text-[10px] text-accent">evaluate</span>
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… job or collab URL"
        className="w-full bg-surface-0 border border-border-subtle rounded-md px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-accent/60"
      />
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Or paste full description / JD"
        rows={3}
        className="w-full bg-surface-0 border border-border-subtle rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent/60 resize-y"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={!canAnalyze}
        onClick={() => onAnalyzeRequested(url.trim() || undefined, pasted.trim() || undefined)}
        className="w-full"
      >
        {busy ? 'Evaluating…' : 'Evaluate fit'}
      </Button>
    </div>
  )
}

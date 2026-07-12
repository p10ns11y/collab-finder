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
import { Chip } from '../../components/ui/chip'
import { Panel } from '../../components/ui/panel'
import { SectionLabel } from '../../components/ui/section-label'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
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
    <div className="flex h-full flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      {/* Left — φ minor (~38.2%) */}
      <div
        className="w-full min-w-0 space-y-3 overflow-x-hidden overflow-y-auto border-b border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:border-b-0 lg:border-r lg:p-4"
        style={{ flex: '0 0 var(--pane-minor)' }}
      >
        {isDiscover && (
          <>
            <Panel dense className="space-y-2.5">
              <SectionLabel meta={`${filtered.length}/${historyOpportunities.length}`}>
                Your opportunities
              </SectionLabel>

              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['active', 'Active'],
                    ['all', 'All'],
                    ['prepped', 'Prepped'],
                    ['applied', 'Applied'],
                    ['passed', 'Passed'],
                  ] as const
                ).map(([id, label]) => (
                  <Chip key={id} active={railFilter === id} onClick={() => setRailFilter(id)}>
                    {label}
                  </Chip>
                ))}
              </div>

              {historyOpportunities.length > 0 && (
                <Input
                  value={railQuery}
                  onChange={(e) => setRailQuery(e.target.value)}
                  placeholder="Filter title, host…"
                  className="h-8 font-mono text-xs"
                />
              )}

              {historyOpportunities.length === 0 ? (
                <p className="ui-meta px-0.5">No opportunities yet. Add a URL or JD below.</p>
              ) : railRows.length === 0 ? (
                <p className="ui-meta px-0.5">No matches for this filter.</p>
              ) : (
                <div className="max-h-[var(--rail-max)] space-y-1 overflow-auto text-xs">
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
                        className={`flex items-stretch gap-0.5 rounded-md border transition-colors ${
                          selected
                            ? 'border-accent/60 bg-accent-soft text-ink'
                            : 'border-border-subtle/60 bg-surface-0/40'
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
                          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2/80"
                          title={`Load #${o.id} fit+prep (no xAI)`}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="truncate">
                              <span className="font-mono text-accent/80">#{o.id}</span> {label}
                            </span>
                            <span className="ui-meta shrink-0 tabular-nums">
                              {o.fit_score != null ? `${o.fit_score}` : '—'}
                            </span>
                          </div>
                          <div className="ui-meta">{pipelineStatusLabel(st)}</div>
                        </button>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex shrink-0 items-center border-l border-border-subtle/50 px-2 text-ink-muted hover:text-accent"
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
                  className="w-full text-left text-xs text-accent hover:underline"
                >
                  {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                </button>
              )}
            </Panel>

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
              <p className="ui-meta px-0.5">
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
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-5">
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
          <div className="space-y-3">
            <TweetFeed tweets={view.tweets} />
            {!hasXResults && (
              <EmptyState
                title="No live X results yet"
                description="Run a search or autonomous cycle on the left. Cycle decisions are heuristic until structured analyze is wired."
              />
            )}
          </div>
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
    <Panel className="space-y-2.5">
      <SectionLabel meta={<span className="text-accent">evaluate</span>}>New target</SectionLabel>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… job or collab URL"
        className="h-8 font-mono text-xs"
      />
      <Textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Or paste full description / JD"
        rows={3}
        className="min-h-[4.5rem] text-xs"
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
    </Panel>
  )
}

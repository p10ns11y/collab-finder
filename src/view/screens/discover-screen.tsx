import * as React from 'react'
import { ChevronLeft, ExternalLink, PenLine } from 'lucide-react'
import { PauseLog } from '../../components/finder/pause-log'
import { CvSummaryInput } from '../../components/finder/cv-summary-input'
import { OpportunityTargetFitPanel } from '../../components/finder/opportunity-target-fit-panel'
import { HireBoardPanel } from '../../components/finder/hire-board-panel'
import { HuntPresetsRow } from '../../components/finder/hunt-presets-row'
import {
  DEFAULT_FIT_MODE,
  fitModeDescription,
  fitModeLabel,
  parseFitMode,
  type FitMode,
} from '../../core/domain/fit-mode'
import {
  discoverChromeIntentAfterHydrate,
  resolveDiscoverChrome,
  type DiscoverChromeIntent,
} from '../../core/domain/discover-chrome'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { EmptyState } from '../../components/ui/empty-state'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { Panel } from '../../components/ui/panel'
import { SectionLabel } from '../../components/ui/section-label'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { displayOpportunityUrl, normalizeOpportunityUrl } from '../../core/domain/opportunity-url'
import { opportunityRailLabel } from '../../core/domain/opportunity-rail-label'
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
 * Discover. Fit docks left. Control widgets sit on the right and smart-fold.
 * Evaluate (URL/JD) is a Quest-like overlay from the bottom-right FAB.
 */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const historyOpportunities = view.historyOpportunities || []
  const [fitMode, setFitMode] = React.useState<FitMode>(DEFAULT_FIT_MODE)

  React.useEffect(() => {
    void safeInvoke<string>('get_fit_mode_cmd', {}).then((res) => {
      if (res.ok && res.value) setFitMode(parseFitMode(res.value))
    })
  }, [])

  const setFitModePersisted = React.useCallback(async (nextMode: FitMode) => {
    setFitMode(nextMode)
    const res = await safeInvoke<string>('set_fit_mode_cmd', { mode: nextMode })
    if (res.ok && res.value) setFitMode(parseFitMode(res.value))
  }, [])

  const targetState = model.opportunityTarget ?? { status: 'idle' as const }
  const targetBusy = targetState.status === 'loading'
  const targetResult = targetState.status === 'ready' ? targetState.data : null
  const targetError =
    targetState.status === 'failed' ? targetState.error?.message || String(targetState.error) : null
  const showTarget = targetBusy || !!targetResult || !!targetError
  const hasDockedResult = targetState.status === 'ready' || targetState.status === 'failed'

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
  const hasEvaluateSeed = Boolean(
    (model.opportunityTargetUrl && model.opportunityTargetUrl.trim()) ||
      (model.opportunityTargetPastedJd && model.opportunityTargetPastedJd.trim()),
  )
  const [intent, setIntent] = React.useState<DiscoverChromeIntent>('auto')
  const hydrateKey = `${selectedOppId ?? 'none'}:${targetState.status}`
  const [prevHydrateKey, setPrevHydrateKey] = React.useState(hydrateKey)
  if (hydrateKey !== prevHydrateKey) {
    const prevStatus = prevHydrateKey.split(':').slice(1).join(':')
    setPrevHydrateKey(hydrateKey)
    if (prevStatus === 'loading' && targetState.status !== 'loading') {
      const nextIntent = discoverChromeIntentAfterHydrate({
        status: targetState.status,
        hasEvaluateSeed,
      })
      if (intent !== nextIntent) setIntent(nextIntent)
    }
  }

  const chrome = resolveDiscoverChrome({ hasResult: hasDockedResult, intent })
  const setupOpen = chrome.setup === 'open'
  const evaluateOpen = chrome.evaluate

  const filtered = React.useMemo(
    () => filterOpportunitiesForRail(historyOpportunities, railFilter, railQuery),
    [historyOpportunities, railFilter, railQuery],
  )
  const railRows = showAll ? filtered : filtered.slice(0, 12)

  const closeEvaluate = React.useCallback(() => setIntent('auto'), [])

  const fitPanel = showTarget ? (
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
  ) : null

  const setupColumn = (
    <>
      {hasDockedResult ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIntent('auto')}
            aria-label="Hide setup"
          >
            Hide setup
          </Button>
        </div>
      ) : null}

      <HireBoardPanel
        hireBoard={model.hireBoard}
        hireBoardQ={model.hireBoardQ}
        hireBoardGeo={model.hireBoardGeo}
        dispatch={dispatch}
      />

      <HuntPresetsRow
        presets={model.huntPresets}
        activeId={model.activeHuntPresetId}
        surface="mission"
        dispatch={dispatch}
        navigateTo="mission"
      />

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
          <p className="ui-meta px-0.5">No opportunities yet. Evaluate a URL or JD.</p>
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
              const label = opportunityRailLabel({
                title: o.title,
                company: o.company,
                urlLabel: displayOpportunityUrl(o.source_url, 32),
              })
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
        onCvSummaryChange={(cvSummary) => dispatch({ type: 'CvSummaryChanged', cvSummary })}
        onResetToDefault={() => dispatch({ type: 'CvSummaryResetToDefaultRequested' })}
      />

      <PauseLog pauses={model.pauses} />
    </>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-5">
        {fitPanel ? (
          fitPanel
        ) : (
          <EmptyState
            title="No opportunity selected"
            description="Pick a row in setup, or evaluate a URL or JD from the button at the bottom right."
          />
        )}
      </div>

      {setupOpen ? (
        <div
          className="w-full min-w-0 space-y-3 overflow-x-hidden overflow-y-auto border-t border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:border-t-0 lg:border-l lg:p-4"
          style={{ flex: '0 0 var(--pane-minor)' }}
        >
          {setupColumn}
        </div>
      ) : (
        <DiscoverSetupFoldedStrip
          rowCount={filtered.length}
          onShow={() => setIntent('setup-open')}
        />
      )}

      {!evaluateOpen ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full p-0"
          title="Evaluate"
          aria-label="Evaluate"
          onClick={() => setIntent('evaluate')}
        >
          <PenLine className="h-4 w-4" />
        </Button>
      ) : null}

      {evaluateOpen ? (
        <DiscoverEvaluateFloat onClose={closeEvaluate}>
          <QuickTarget
            busy={targetBusy}
            fitMode={fitMode}
            url={model.opportunityTargetUrl ?? ''}
            pastedJd={model.opportunityTargetPastedJd ?? ''}
            onUrlChange={(url) => dispatch({ type: 'OpportunityTargetUrlSet', url })}
            onPastedJdChange={(pasted_jd) =>
              dispatch({ type: 'OpportunityTargetPastedJdChanged', pasted_jd })
            }
            onFitModeChange={(m) => void setFitModePersisted(m)}
            onAnalyzeRequested={(url, pasted_jd) =>
              dispatch({ type: 'OpportunityTargetAnalyzeRequested', url, pasted_jd })
            }
          />
        </DiscoverEvaluateFloat>
      ) : null}
    </div>
  )
}

function DiscoverSetupFoldedStrip({
  rowCount,
  onShow,
}: {
  rowCount: number
  onShow: () => void
}) {
  return (
    <div className="flex h-11 w-full shrink-0 items-center justify-center gap-2 border-t border-border-subtle lg:h-auto lg:w-[2.75rem] lg:flex-col lg:justify-start lg:border-t-0 lg:border-l lg:py-3">
      <button
        type="button"
        onClick={onShow}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
        aria-label="Show setup"
        title="Show setup"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="ui-meta tabular-nums" title="Opportunity rows">
        {rowCount}
      </span>
    </div>
  )
}

function DiscoverEvaluateFloat({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        className="h-full flex-1 bg-surface-0/70"
        aria-label="Close evaluate"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label="Evaluate"
        className="flex h-full w-full max-w-[min(420px,92vw)] flex-col border-l border-border-subtle bg-surface-1"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <div className="min-w-0">
            <SectionLabel>Evaluate</SectionLabel>
            <p className="ui-meta px-0.5">Paste a URL or JD, then evaluate.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      </aside>
    </div>
  )
}

type QuickTargetProps = {
  busy: boolean
  fitMode: FitMode
  url: string
  pastedJd: string
  onUrlChange: (url: string) => void
  onPastedJdChange: (pasted_jd: string) => void
  onFitModeChange: (mode: FitMode) => void
  onAnalyzeRequested: (url?: string, pasted_jd?: string) => void
}

function QuickTarget({
  busy,
  fitMode,
  url,
  pastedJd,
  onUrlChange,
  onPastedJdChange,
  onFitModeChange,
  onAnalyzeRequested,
}: QuickTargetProps) {
  const canAnalyze = !busy && !!(url.trim() || pastedJd.trim())
  const relaxed = fitMode === 'relaxed'

  return (
    <Panel className="space-y-2.5">
      <SectionLabel meta={<span className="text-accent">evaluate</span>}>New target</SectionLabel>
      <div className="flex gap-1 rounded-md border border-border-subtle p-0.5">
        {(['strict', 'relaxed'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => onFitModeChange(m)}
            className={
              fitMode === m
                ? 'flex-1 rounded px-2 py-1 text-[11px] font-medium bg-accent/15 text-accent'
                : 'flex-1 rounded px-2 py-1 text-[11px] text-ink-muted hover:text-ink'
            }
            title={fitModeDescription(m)}
          >
            {fitModeLabel(m)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-ink-faint leading-snug">{fitModeDescription(fitMode)}</p>
      <Input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://… job or collab URL"
        className="h-8 font-mono text-xs"
      />
      <Textarea
        value={pastedJd}
        onChange={(e) => onPastedJdChange(e.target.value)}
        placeholder="Or paste full description / JD"
        rows={8}
        className="min-h-[8rem] text-xs"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={!canAnalyze}
        onClick={() => onAnalyzeRequested(url.trim() || undefined, pastedJd.trim() || undefined)}
        className="w-full"
      >
        {busy ? 'Evaluating…' : relaxed ? 'Evaluate match' : 'Evaluate fit'}
      </Button>
    </Panel>
  )
}

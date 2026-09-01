import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Kanban, RefreshCw } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { Input } from '../../components/ui/input'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { Opportunity } from '../../core/domain/history'
import {
  OUTCOME_STATUSES,
  PIPELINE_STATUSES,
  filterOpportunitiesForPipelineView,
  normalizePipelineStatus,
  outcomeStatusLabel,
  pipelineStatusLabel,
  type PipelineViewFilter,
} from '../../core/domain/opportunity-pipeline'
import { formatPipelineDate, timelineFromEvents } from '../../core/domain/pipeline-timeline'
import { openExternalUrl } from '../../adapters/tauri/open-external'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

const VIEW_FILTERS: { id: PipelineViewFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'applied', label: 'Applied' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'closed', label: 'Closed' },
]

function rowLabel(opp: Opportunity): string {
  return opp.company || opp.title || opp.source_url || `Opportunity #${opp.id}`
}

export function PipelineScreen({ view, dispatch }: Props) {
  const [viewFilter, setViewFilter] = useState<PipelineViewFilter>('all')
  const [query, setQuery] = useState('')

  const opportunities = view.pipelineOpportunities ?? []
  const events = view.historyEvents ?? []

  useEffect(() => {
    dispatch({ type: 'PipelineRefreshRequested' })
    dispatch({ type: 'HistoryRefreshRequested' })
  }, [dispatch])

  const rows = useMemo(() => {
    const filtered = filterOpportunitiesForPipelineView(opportunities, viewFilter)
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((opp) => {
      const hay = [opp.title, opp.company, opp.source_url, String(opp.id), opp.status, opp.outcome_status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [opportunities, viewFilter, query])

  const appliedCount = useMemo(
    () => opportunities.filter((o) => normalizePipelineStatus(o.status) === 'applied').length,
    [opportunities],
  )

  function openInDiscover(opp: Opportunity) {
    dispatch({
      type: 'OpportunitySelected',
      id: opp.id,
      url: opp.source_url || undefined,
    })
    dispatch({ type: 'ScreenChanged', screen: 'discover' })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Kanban className="h-4 w-4 text-accent" aria-hidden />
            Pipeline
          </div>
          <p className="mt-1 max-w-prose text-xs text-ink-faint">
            Source of truth for your hunt. collab-finder SQLite holds prep and status. Outcome tracks
            post-apply progress. Private narrative stays in life-os{' '}
            <span className="font-mono">private/career/</span>.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          dispatch({ type: 'PipelineRefreshRequested' })
          dispatch({ type: 'HistoryRefreshRequested' })
        }}>
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {VIEW_FILTERS.map(({ id, label }) => (
          <Chip key={id} active={viewFilter === id} onClick={() => setViewFilter(id)}>
            {label}
          </Chip>
        ))}
        <span className="text-[11px] text-ink-faint">
          {rows.length} shown · {appliedCount} applied in DB
          {view.pipelineBusy ? ' · loading…' : ''}
        </span>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter company, title, #id…"
        className="mb-3 h-8 font-mono text-xs"
      />

      {rows.length === 0 ? (
        <div className="rounded border border-border-subtle bg-surface-1/50 p-4 text-sm text-ink-faint">
          No pipeline rows match. Analyze or prep a target on Discover, or widen the filter.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-border-subtle">
          <table className="w-full min-w-[56rem] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface-1/95 text-[10px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Fit</th>
                <th className="px-2 py-2">Prep</th>
                <th className="px-2 py-2">Outcome</th>
                <th className="px-2 py-2">Analyzed</th>
                <th className="px-2 py-2">Prepped</th>
                <th className="px-2 py-2">Applied</th>
                <th className="px-2 py-2">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/70">
              {rows.map((opp) => {
                const timeline = timelineFromEvents(events, opp.id)
                const prepStatus = normalizePipelineStatus(opp.status)
                return (
                  <tr key={opp.id} className="hover:bg-surface-2/40">
                    <td className="px-2 py-2 font-mono text-accent/90">#{opp.id}</td>
                    <td className="max-w-[14rem] px-2 py-2">
                      <button
                        type="button"
                        className="truncate text-left font-medium text-ink hover:text-accent"
                        onClick={() => openInDiscover(opp)}
                        title="Open in Discover"
                      >
                        {rowLabel(opp)}
                      </button>
                      {opp.title && opp.company ? (
                        <div className="truncate text-[10px] text-ink-faint">{opp.title}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {opp.fit_score != null ? (
                        <Badge
                          tone={opp.fit_score >= 80 ? 'success' : opp.fit_score >= 60 ? 'accent' : 'neutral'}
                          className="text-[10px]"
                        >
                          {opp.fit_score}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="max-w-[6.5rem] rounded border border-border-subtle bg-surface-0 px-1 py-0.5 text-[11px]"
                        value={prepStatus}
                        onChange={(e) =>
                          dispatch({
                            type: 'OpportunityStatusChangeRequested',
                            id: opp.id,
                            status: e.target.value,
                          })
                        }
                      >
                        {PIPELINE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {pipelineStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="max-w-[6.5rem] rounded border border-border-subtle bg-surface-0 px-1 py-0.5 text-[11px]"
                        value={opp.outcome_status ?? ''}
                        onChange={(e) =>
                          dispatch({
                            type: 'OpportunityOutcomeChangeRequested',
                            id: opp.id,
                            outcomeStatus: e.target.value,
                          })
                        }
                      >
                        <option value="">—</option>
                        {OUTCOME_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {outcomeStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 font-mono text-[10px] text-ink-faint">
                      {formatPipelineDate(timeline.analyzedAt)}
                    </td>
                    <td className="px-2 py-2 font-mono text-[10px] text-ink-faint">
                      {formatPipelineDate(timeline.preppedAt)}
                    </td>
                    <td className="px-2 py-2 font-mono text-[10px] text-ink-faint">
                      {formatPipelineDate(opp.applied_at)}
                    </td>
                    <td className="px-2 py-2">
                      {opp.source_url ? (
                        <button
                          type="button"
                          className="text-ink-muted hover:text-accent"
                          title="Open posting"
                          onClick={() => openExternalUrl(opp.source_url!)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

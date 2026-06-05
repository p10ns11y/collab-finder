import { GuardDashboard } from '../../components/finder/guard-dashboard'
import { Badge } from '../../components/ui/badge'
import type { FinderViewState } from '../../core/finder/selectors'

type Props = {
  view: FinderViewState
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'warning' | 'neutral' | 'success' }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

export function StatsScreen({ view }: Props) {
  const { model, historyStats, historySearches, historyLeads } = view
  const pauseCount = model.pauses.length
  const s = historyStats

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4">
        <div className="text-lg font-semibold tracking-tight">Statistics</div>
        <p className="text-xs text-ink-faint">Reactor state + durable aggregates (sqlite)</p>
      </div>

      <GuardDashboard reactorState={model.reactorState} pauseCount={pauseCount} />

      <div className="mt-3 text-[11px] uppercase tracking-wide text-ink-faint">Aggregates</div>
      <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total searches" value={String(s?.total_searches ?? historySearches.length)} />
        <Metric label="Unique leads" value={String(s?.total_unique_leads ?? historyLeads.length)} tone="accent" />
        <Metric label="Total surfaces" value={String(s?.total_surfaces ?? 0)} />
        <Metric
          label="Pauses logged"
          value={String(s?.total_pauses ?? 0)}
          tone={s && s.total_pauses > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {s?.top_queries && s.top_queries.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1.5">Top queries</div>
          <div className="flex flex-wrap gap-2">
            {s.top_queries.slice(0, 8).map((q, i) => (
              <Badge key={i} tone="neutral" className="text-xs">{q}</Badge>
            ))}
          </div>
        </div>
      )}

      {s?.avg_score != null && (
        <p className="mt-3 text-xs text-ink-faint">Avg score (where present): {s.avg_score.toFixed(1)}</p>
      )}

      <p className="mt-6 text-[10px] text-ink-faint">
        Data survives restarts. See History and Data screens for full lists and Lookup for FTS replay.
      </p>
    </div>
  )
}

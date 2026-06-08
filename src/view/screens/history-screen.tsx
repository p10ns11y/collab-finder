import { History, RefreshCw, Search, Star } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function HistoryScreen({ view, dispatch }: Props) {
  const { historySearches: searches, historyLeads: leads, historyPauses: pauses, historyStats: stats } = view
  // pauses here is the recent slice from get_recent_pauses (DB projection per TD-003); list capped at 5 for display. Full count in stats.total_pauses.
  const hasData = searches.length > 0 || leads.length > 0 || pauses.length > 0

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <History className="h-4 w-4 text-ink-faint" /> History
          </div>
          <p className="text-xs text-ink-faint">Timeline of runs and captured leads (persisted)</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'HistoryRefreshRequested' })}>
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh
        </Button>
      </div>

      {!hasData && (
        <div className="rounded border border-border-subtle bg-surface-1/50 p-4 text-sm text-ink-faint">
          No history yet — run a search or cycle from Discover. All runs and leads are persisted in SQLite.
        </div>
      )}

      {searches.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <span>Recent searches</span>
            <span>{searches.length} runs</span>
          </div>
          <ul className="divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
            {searches.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 px-3 py-2.5 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-accent/80">{s.id}</span>
                    <span className="truncate text-ink-muted">{s.query}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-faint">
                    <span>{new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="uppercase tracking-wide">{s.source}</span>
                    <span>{s.num_results} posts</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'PresetSelected', query: s.query })
                    dispatch({ type: 'ScreenChanged', screen: 'discover' })
                  }}
                  className="shrink-0 rounded border border-border-default px-2 py-1 text-[10px] hover:border-accent/50 hover:text-accent"
                  title="Reuse this query (switches to Discover)"
                >
                  <Search className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leads.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <span>Captured leads (unique)</span>
            <span>{leads.length} opportunities</span>
          </div>
          <ul className="divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
            {leads.map((l) => (
              <li key={l.id} className="px-3 py-2.5">
                <div className="mb-0.5 flex items-center gap-2">
                  {l.score != null && (
                    <Badge tone={l.score >= 80 ? 'success' : l.score >= 60 ? 'accent' : 'neutral'} className="text-[10px]">
                      {l.score}
                    </Badge>
                  )}
                  <span className="font-mono text-accent/80">{l.tweet_id}</span>
                  {l.seen_count > 1 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-warning">
                      <Star className="h-3 w-3" aria-hidden /> seen {l.seen_count}
                    </span>
                  )}
                  <span className="ml-auto text-ink-faint">{l.status}</span>
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap text-ink-muted">
                  {l.tweet_text || (l.decision_json ? 'Decision recorded' : 'Lead captured')}
                </p>
                {l.action && <span className="text-[10px] text-ink-faint">action: {l.action}</span>}
              </li>
            ))}
          </ul>
          {stats?.most_reseen && (
            <p className="mt-1 text-[10px] text-ink-faint">Most re-surfaced: {stats.most_reseen[0]} ×{stats.most_reseen[1]}</p>
          )}
        </div>
      )}

      {pauses.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <span>Pauses (from DB)</span>
            <span>{pauses.length} logged</span>
          </div>
          <ul className="divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
            {pauses.slice(0, 5).map((p) => (
              <li key={p.id} className="px-3 py-2 text-ink-muted">
                <span className="font-mono text-accent/80">{p.id}</span> {p.reason}
                {p.guard_type && <span className="ml-1 text-ink-faint">({p.guard_type})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

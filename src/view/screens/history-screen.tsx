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
  const { historySearches: searches, historyLeads: leads, historyStats: stats, historyOpportunities: opportunities = [] } = view
  const hasData = searches.length > 0 || leads.length > 0 || opportunities.length > 0

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <History className="h-4 w-4 text-ink-faint" /> History
          </div>
          <p className="text-xs text-ink-faint">Timeline of runs, captured leads, and job targets (persisted)</p>
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

      {opportunities.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <span>Job targets</span>
            <span>{opportunities.length > 8 ? `last 8 of ${opportunities.length}` : `${opportunities.length} opportunities`}</span>
          </div>
          <ul className="divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
            {opportunities.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2 px-3 py-2.5 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {o.fit_score != null && (
                      <Badge tone={o.fit_score >= 80 ? 'success' : o.fit_score >= 60 ? 'accent' : 'neutral'} className="text-[10px]">
                        {o.fit_score}
                      </Badge>
                    )}
                    <span className="font-mono text-accent/80">#{o.id}</span>
                    <span className="truncate text-ink-muted">{o.company || o.title || '—'}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-faint">
                    <span>{o.status || '—'}</span>
                    {o.prep_artifacts_json && <Badge tone="success" className="text-[10px]">prepped</Badge>}
                    <span className="ml-auto">{new Date(o.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Only OpportunitySelected (let loadOpportunityCmd in effects own success-only ScreenChanged + hydrate/parse/*Succeeded).
                    // Matches Data rows (data-screen:180) + Resume (discover:60) exactly for consistent error UX (failure keeps user here + banner; no unconditional nav).
                    // Per review: avoids flip-to-Discover on getOpps fail / bad blob / edge (effects:428,436,480).
                    dispatch({ type: 'OpportunitySelected', id: o.id })
                  }}
                  className="shrink-0 rounded border border-border-default px-2 py-1 text-[10px] hover:border-accent/50 hover:text-accent"
                  title="Load this opportunity into Discover (exact stored fit+prep via 6a path; stays here + banner on load error)"
                >
                  Open
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
            <span>{leads.length} leads</span>
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
    </div>
  )
}

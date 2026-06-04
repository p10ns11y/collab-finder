import { History, RefreshCw, Search, Star } from 'lucide-react'
import type { Lead, SearchRun } from '../../core/domain/history'
import type { DashboardStats } from '../../core/domain/history'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  searches: SearchRun[]
  leads: Lead[]
  stats: DashboardStats | null
  onRefresh: () => void
  onReuseQuery: (query: string) => void
}

export function HistoryDashboard({ searches, leads, stats, onRefresh, onReuseQuery }: Props) {
  const hasData = searches.length > 0 || leads.length > 0

  return (
    <Card className="border-border-subtle/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-ink-faint" aria-hidden />
          <CardTitle>History &amp; Lookup</CardTitle>
          <Badge tone="neutral" className="ml-1 text-[10px]">sqlite</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 px-2 text-xs">
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Stats (neat summary, dedup-aware) */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Searches" value={String(stats?.total_searches ?? searches.length)} />
          <Metric label="Unique leads" value={String(stats?.total_unique_leads ?? leads.length)} tone="accent" />
          <Metric label="Total surfaces" value={String(stats?.total_surfaces ?? 0)} />
          <Metric label="Pauses logged" value={String(stats?.total_pauses ?? 0)} tone={stats && stats.total_pauses > 0 ? 'warning' : 'neutral'} />
        </div>

        {!hasData && (
          <p className="text-xs text-ink-faint">No history yet — run a search or cycle. Data is persisted in SQLite and survives restarts.</p>
        )}

        {/* Recent searches (with re-use) */}
        {searches.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Recent searches</span>
              <span className="text-[10px] text-ink-faint">{searches.length} runs</span>
            </div>
            <ul className="max-h-44 divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
              {searches.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 px-3 py-1.5 hover:bg-surface-2/60">
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
                    onClick={() => onReuseQuery(s.query)}
                    className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] hover:border-accent/50 hover:text-accent"
                    title="Reuse this query"
                  >
                    <Search className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Captured leads (unique by design + seen_count from dedup strategy) */}
        {leads.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Captured leads (unique)</span>
              <span className="text-[10px] text-ink-faint">{leads.length} opportunities</span>
            </div>
            <ul className="max-h-52 divide-y divide-border-subtle overflow-auto rounded border border-border-subtle bg-surface-2/40 text-xs">
              {leads.slice(0, 12).map((l) => (
                <li key={l.id} className="px-3 py-1.5">
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

        <details className="text-[10px] text-ink-faint">
          <summary className="cursor-pointer">About persistence &amp; dedup</summary>
          <p className="mt-1">Every search, cycle, lead, pause and key TUI action is written to SQLite (WAL). Same X post across runs → 1 lead row with seen_count++. Full provenance (every hit) kept in search_runs/hits. Lookup uses FTS on tweet text where available.</p>
        </details>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'warning' | 'neutral' | 'success' }) {
  return (
    <div className="rounded border border-border-subtle bg-surface-2/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { Event, Lead, SearchRun } from '../../core/domain/history'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

type TableKey = 'searches' | 'leads' | 'events'

export function DataScreen({ view, dispatch }: Props) {
  const [active, setActive] = useState<TableKey>('searches')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'id', dir: 'desc' })

  const { historySearches, historyLeads, historyEvents } = view

  const rows = active === 'searches' ? historySearches : active === 'leads' ? historyLeads : historyEvents

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows as any[]
    return (rows as any[]).filter((r: any) => {
      return Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q))
    })
  }, [rows, filter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, dir } = sort
    arr.sort((a: any, b: any) => {
      const va = a?.[key]
      const vb = b?.[key]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va
      return dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
    return arr
  }, [filtered, sort])

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  function goToLookupForRun(id: number) {
    dispatch({ type: 'ScreenChanged', screen: 'lookup' })
    dispatch({ type: 'SearchRunSelected', id })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-3 lg:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(['searches', 'leads', 'events'] as const).map((k) => (
          <button
            key={k}
            onClick={() => { setActive(k); setFilter('') }}
            className={`px-3 py-1 text-xs rounded border ${active === k ? 'bg-surface-2 border-accent text-accent' : 'border-border-subtle text-ink-muted hover:text-ink'}`}
          >
            {k === 'searches' ? 'Search Runs' : k === 'leads' ? 'Leads' : 'Events'}
            <span className="ml-1 text-ink-faint">({k === 'searches' ? historySearches.length : k === 'leads' ? historyLeads.length : historyEvents.length})</span>
          </button>
        ))}
        <div className="flex-1 min-w-[12rem] ml-auto flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter rows (any column)..."
            className="flex-1 bg-surface-1 border border-border-subtle rounded px-2 py-1 text-xs focus:outline-none focus:border-accent/60"
          />
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'HistoryRefreshRequested' })}>Refresh</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border border-border-subtle rounded bg-surface-1/50">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-ink-faint">
            {active === 'searches' && (
              <tr>
                {['id', 'ts', 'query', 'source', 'num_results', 'cost_incurred'].map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-normal cursor-pointer select-none hover:text-ink hover:underline underline-offset-2" onClick={() => toggleSort(k)}>
                    {k} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
                <th className="px-2"></th>
              </tr>
            )}
            {active === 'leads' && (
              <tr>
                {['id', 'tweet_id', 'first_seen', 'score', 'status', 'seen_count'].map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-normal cursor-pointer select-none hover:text-ink hover:underline underline-offset-2" onClick={() => toggleSort(k)}>
                    {k} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            )}
            {active === 'events' && (
              <tr>
                {['id', 'ts', 'event_type', 'correlation_id'].map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-normal cursor-pointer select-none hover:text-ink hover:underline underline-offset-2" onClick={() => toggleSort(k)}>
                    {k} {sort.key === k ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-ink-faint">No matching rows.</td></tr>
            )}
            {active === 'searches' && (sorted as SearchRun[]).map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-1.5 font-mono text-accent/80">{r.id}</td>
                <td className="px-3 py-1.5 text-ink-muted">{new Date(r.ts).toLocaleString()}</td>
                <td className="px-3 py-1.5 truncate max-w-[32ch] lg:max-w-[48ch]">{r.query}</td>
                <td className="px-3 py-1.5 text-ink-faint">{r.source}</td>
                <td className="px-3 py-1.5">{r.num_results}</td>
                <td className="px-3 py-1.5">{r.cost_incurred}</td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => goToLookupForRun(r.id)}
                    className="text-[10px] px-2 py-1 rounded border border-border-default hover:border-accent/60 hover:text-accent"
                  >
                    Load in Lookup
                  </button>
                </td>
              </tr>
            ))}
            {active === 'leads' && (sorted as Lead[]).map((l) => (
              <tr key={l.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-1.5 font-mono text-accent/80">{l.id}</td>
                <td className="px-3 py-1.5 font-mono">{l.tweet_id}</td>
                <td className="px-3 py-1.5 text-ink-muted">{new Date(l.first_seen).toLocaleString()}</td>
                <td className="px-3 py-1.5">{l.score ?? '—'}</td>
                <td className="px-3 py-1.5"><Badge tone="neutral" className="text-[10px]">{l.status}</Badge></td>
                <td className="px-3 py-1.5">{l.seen_count}</td>
              </tr>
            ))}
            {active === 'events' && (sorted as Event[]).map((e) => (
              <tr key={e.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-1.5 font-mono text-accent/80">{e.id}</td>
                <td className="px-3 py-1.5 text-ink-muted">{new Date(e.ts).toLocaleString()}</td>
                <td className="px-3 py-1.5">{e.event_type}</td>
                <td className="px-3 py-1.5 text-ink-faint truncate">{e.correlation_id ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-ink-faint">Client-side filter + sort. Click headers to sort. Use Lookup for FTS on stored tweets.</p>
    </div>
  )
}

import { useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { Tweet } from '../../core/domain/finder'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

function TweetRow({ t, onHydrate, hydrating }: { t: Tweet; onHydrate: (id: string) => void; hydrating?: boolean }) {
  return (
    <li className="px-3 py-2 border-b border-border-subtle last:border-0 hover:bg-surface-2/40">
      <div className="flex items-start gap-2 text-[11px] text-ink-faint">
        <span className="font-mono text-accent/80 shrink-0">{t.id}</span>
        {t.created_at && <span>{t.created_at}</span>}
        <a
          href={`https://x.com/i/web/status/${t.id}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-accent"
        >
          <ExternalLink className="h-3 w-3" /> X
        </a>
        <button
          onClick={() => onHydrate(t.id)}
          disabled={hydrating}
          className="text-[10px] px-2 py-0.5 rounded border border-border-default hover:border-accent/60 hover:text-accent disabled:opacity-50"
          title="Fetch full text via X (not persisted)"
        >
          Hydrate
        </button>
      </div>
      <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{t.text}</p>
    </li>
  )
}

export function LookupScreen({ view, dispatch }: Props) {
  const { lookupResults, lookupBusy, selectedRunId, selectedRun, hydrateTweet: hydrated } = view
  const [runIdInput, setRunIdInput] = useState<string>(selectedRunId ? String(selectedRunId) : '')

  const doLookup = () => dispatch({ type: 'LookupRequested' })
  const doClear = () => dispatch({ type: 'LookupCleared' })

  const onHydrate = (id: string) => dispatch({ type: 'HydrateRequested', tweetId: id })

  const loadRun = () => {
    const n = parseInt(runIdInput, 10)
    if (!Number.isNaN(n)) {
      dispatch({ type: 'SearchRunSelected', id: n })
    }
  }

  const isHydrating = view.model.hydrate.status === 'loading'

  return (
    <div className="h-full overflow-auto p-3 lg:p-4 grid gap-4 lg:grid-cols-2">
      {/* FTS */}
      <div className="border border-border-subtle rounded p-4 bg-surface-1/40 flex flex-col">
        <div className="font-medium text-sm mb-2">FTS lookup (stored snippets)</div>
        <input
          value={view.model.lookupQuery}
          onChange={(e) => dispatch({ type: 'LookupQueryChanged', query: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') doLookup() }}
          placeholder="e.g. collab OR xai filter:has_engagement"
          className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60"
        />
        <div className="mt-2">
          <Button onClick={doLookup} disabled={lookupBusy || !view.model.lookupQuery.trim()}>
            {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Search stored</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={doClear} disabled={lookupBusy} className="ml-2">
            Clear
          </Button>
        </div>

        <div className="mt-3 flex-1 min-h-[140px] overflow-auto border border-border-subtle rounded bg-surface-0">
          {lookupResults.length === 0 && !lookupBusy && (
            <div className="p-4 text-xs text-ink-faint">No FTS results. Enter query above and search. Results come from previously stored search runs.</div>
          )}
          {lookupBusy && <div className="p-4 text-xs text-ink-faint">Searching stored tweets…</div>}
          <ul>
            {lookupResults.map((t) => (
              <TweetRow key={t.id} t={t} onHydrate={onHydrate} hydrating={isHydrating} />
            ))}
          </ul>
        </div>
      </div>

      {/* Run detail + hydrate preview */}
      <div className="border border-border-subtle rounded p-4 bg-surface-1/40 flex flex-col">
        <div className="font-medium text-sm mb-2">Search run detail</div>
        <div className="space-y-2 mb-3">
          <input
            value={runIdInput}
            onChange={(e) => setRunIdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadRun() }}
            placeholder="Search run ID (e.g. 42 from History/Data)"
            className="w-full bg-surface-0 border border-border-subtle rounded px-2 py-1 text-sm focus:outline-none focus:border-accent/60"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={loadRun} disabled={!runIdInput.trim()}>Load run</Button>
            {selectedRunId != null && (
              <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'SearchRunSelected', id: selectedRunId })}>
                <RefreshCw className="h-3 w-3" /> Reload
              </Button>
            )}
          </div>
        </div>

        {selectedRun && (
          <div className="mb-3 text-xs">
            <div className="text-ink-faint">Run #{selectedRun.run.id} · {selectedRun.run.source} · {selectedRun.run.num_results} results</div>
            <div className="truncate text-ink-muted">{selectedRun.run.query}</div>
          </div>
        )}

        {selectedRun && selectedRun.tweets.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Tweets in run (snippets)</div>
            <ul className="max-h-40 overflow-auto border border-border-subtle rounded text-xs bg-surface-0">
              {selectedRun.tweets.map((t) => (
                <TweetRow key={t.id} t={t} onHydrate={onHydrate} hydrating={isHydrating} />
              ))}
            </ul>
          </div>
        )}

        {!selectedRun && selectedRunId != null && view.model.selectedRun.status === 'loading' && (
          <div className="text-xs text-ink-faint">Loading run…</div>
        )}

        {/* Hydrate preview */}
        <div className="mt-auto pt-3 border-t border-border-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1 flex items-center gap-2">
            Hydrate result (full text, not stored)
            {view.model.hydrate.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          {hydrated ? (
            <div className="rounded border border-accent/30 bg-accent/5 p-3">
              <div className="text-[10px] text-accent mb-1 font-mono">{hydrated.id}</div>
              <p className="text-sm whitespace-pre-wrap">{hydrated.text}</p>
              <button className="mt-2 text-[10px] text-ink-faint hover:text-ink" onClick={() => dispatch({ type: 'HydrateCleared' })}>Clear hydrate</button>
            </div>
          ) : (
            <div className="text-xs text-ink-faint">Click Hydrate on any row above (from FTS or loaded run) to fetch full post via X.</div>
          )}
          {view.model.hydrate.status === 'failed' && (
            <div className="text-xs text-danger mt-1">Hydrate failed: {view.model.hydrate.error?.message}</div>
          )}
        </div>

        <div className="mt-3 text-[10px] text-ink-faint">
          Raw SQL is a guarded stretch goal (not implemented). All access via explicit MVU messages + self-guards.
        </div>
      </div>
    </div>
  )
}

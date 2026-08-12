import { useMemo, useState } from 'react'
import { ExternalLink, Loader2, Mail, Network, Phone, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import {
  filterNetworkPeople,
  primaryMissionTag,
  splitContactField,
  type NetworkFilter,
  type NetworkPerson,
  xProfileUrl,
} from '../../core/domain/network-graph'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

const FILTERS: { id: NetworkFilter; label: string }[] = [
  { id: 'top50', label: 'Top 50' },
  { id: 'ex_colleague', label: 'Ex colleagues' },
  { id: 'collab_fit', label: 'Collab fit' },
  { id: 'has_x', label: 'Has X' },
  { id: 'location_match', label: 'Location' },
  { id: 'all', label: 'All 1st' },
]

export function NetworkScreen({ view, dispatch }: Props) {
  const { model } = view
  const busy = model.networkBusyAction !== 'idle'
  const graph = model.network.status === 'ready' ? model.network.data : null
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!graph) return []
    return filterNetworkPeople(graph.people, model.networkFilter, graph.top_ids)
  }, [graph, model.networkFilter])

  const selected = useMemo(() => {
    if (!graph || !selectedId) return null
    return graph.people.find((p) => p.id === selectedId) ?? null
  }, [graph, selectedId])

  return (
    <div className="h-full flex flex-col overflow-hidden p-3 lg:p-4 gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Network className="h-4 w-4 text-accent" aria-hidden />
            Network
          </div>
          <p className="mt-1 text-xs text-ink-muted max-w-xl">
            Stricter Collab fit: Space / Defence / robotics + software path from your web/SWE base.
            Cards open details (email / phone when present in exports).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => dispatch({ type: 'NetworkLoadRequested' })}
            disabled={busy}
          >
            {model.networkBusyAction === 'load' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Load / refresh</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: 'NetworkLoadRequested', force_reimport: true })}
            disabled={busy}
            title="Re-read gitignored CSVs into SQLite"
          >
            Reimport CSVs
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => dispatch({ type: 'NetworkResolveXRequested' })}
            disabled={busy || !graph}
            title="Official X user lookup for top 50"
          >
            {model.networkBusyAction === 'resolve_x' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Find X (top 50)</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: 'NetworkEnrichLinkedInRequested' })}
            disabled={busy || !graph}
            title="Fetch public LinkedIn pages (rate-limited)"
          >
            {model.networkBusyAction === 'enrich_li' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className={model.networkBusyAction === 'enrich_li' ? 'ml-1' : ''}>
              Enrich LI meta
            </span>
          </Button>
        </div>
      </div>

      {graph && (
        <div className="flex flex-wrap gap-2 text-[11px] text-ink-muted">
          <span>
            {graph.from_db ? 'db' : 'csv'}{' '}
            <span className="font-mono text-ink-faint">{graph.source_path}</span>
          </span>
          {(graph.connections_imported ?? 0) > 0 && (
            <span>· imported conn {graph.connections_imported}</span>
          )}
          {(graph.contacts_imported ?? 0) > 0 && (
            <span>· imported contacts {graph.contacts_imported}</span>
          )}
          <span>· {graph.total} people</span>
          <span>· fit {graph.category_counts.collab_fit}</span>
          <span>· X {graph.category_counts.with_x}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => dispatch({ type: 'NetworkFilterChanged', filter: f.id })}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              model.networkFilter === f.id || (f.id === 'top50' && model.networkFilter === 'top20')
                ? 'bg-accent-soft border-accent/40 text-accent'
                : 'border-border-subtle text-ink-muted hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {model.network.status === 'idle' && (
        <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
          Uses <code className="mx-1 text-ink-muted">data/connections.sample.csv</code> by
          default; drop a real connections export at{' '}
          <code className="mx-1 text-ink-muted">data/connections.csv</code> (gitignored) then Load.
        </div>
      )}

      {model.network.status === 'loading' && (
        <div className="flex-1 flex items-center justify-center text-sm text-ink-muted gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Scoring connections…
        </div>
      )}

      {model.network.status === 'failed' && (
        <div className="text-sm text-danger">{model.network.error.message}</div>
      )}

      {graph && (
        <div className="min-h-0 flex-1 flex gap-3 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((person) => {
                const mission = primaryMissionTag(person.score_reasons)
                const active = selectedId === person.id
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setSelectedId(person.id)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      active
                        ? 'border-accent/50 bg-accent-soft/40'
                        : 'border-border-subtle bg-surface-1/50 hover:bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-ink truncate">{person.full_name}</div>
                        <div className="text-[11px] text-ink-muted truncate mt-0.5">
                          {person.position || '—'}
                        </div>
                        <div className="text-[11px] text-ink-faint truncate">{person.company || '—'}</div>
                      </div>
                      <div className="font-mono text-sm text-accent tabular-nums shrink-0">
                        {person.collab_score.toFixed(0)}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 items-center">
                      {mission && (
                        <Badge tone="accent" className="normal-case tracking-normal">
                          {mission}
                        </Badge>
                      )}
                      {person.categories.includes('collab_fit') && (
                        <Badge tone="success" className="normal-case tracking-normal">
                          fit
                        </Badge>
                      )}
                      {splitContactField(person.emails).length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted" title={person.emails ?? ''}>
                          <Mail className="h-3 w-3" /> email
                        </span>
                      )}
                      {splitContactField(person.phones).length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted" title={person.phones ?? ''}>
                          <Phone className="h-3 w-3" /> phone
                        </span>
                      )}
                      {person.x_profile?.username && (
                        <Badge tone="neutral" className="normal-case tracking-normal">
                          @{person.x_profile.username}
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
              {rows.length === 0 && (
                <div className="col-span-full py-10 text-center text-sm text-ink-faint">
                  No people in this filter. Try Top 50 or Reimport after scoring update.
                </div>
              )}
            </div>
          </div>

          {selected && (
            <PersonDetailPanel person={selected} onClose={() => setSelectedId(null)} />
          )}
        </div>
      )}
    </div>
  )
}

function PersonDetailPanel({
  person,
  onClose,
}: {
  person: NetworkPerson
  onClose: () => void
}) {
  const emails = splitContactField(person.emails)
  const phones = splitContactField(person.phones)
  const mission = primaryMissionTag(person.score_reasons)

  return (
    <aside className="w-full max-w-sm shrink-0 overflow-auto rounded-lg border border-border-subtle bg-surface-1/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-ink">{person.full_name}</div>
          <div className="text-xs text-ink-muted mt-0.5">{person.position || '—'}</div>
          <div className="text-xs text-ink-faint">{person.company || '—'}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-ink-faint hover:text-ink hover:bg-surface-2"
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="accent" className="normal-case tracking-normal font-mono">
          score {person.collab_score.toFixed(0)}
        </Badge>
        {mission && (
          <Badge tone="success" className="normal-case tracking-normal">
            {mission}
          </Badge>
        )}
        {person.categories
          .filter((c) => c !== 'first_connection')
          .map((c) => (
            <Badge key={c} tone="neutral" className="normal-case tracking-normal">
              {c.replace('_', ' ')}
            </Badge>
          ))}
      </div>

      {person.location_bucket && (
        <p className="mt-3 text-xs text-ink-muted">Location: {person.location_bucket}</p>
      )}
      {person.connected_on && (
        <p className="mt-1 text-xs text-ink-faint">Connected: {person.connected_on}</p>
      )}
      <p className="mt-1 text-[10px] text-ink-faint">Source: {person.source ?? 'linkedin_connection'}</p>

      <div className="mt-4 space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Contact</div>
        {emails.length === 0 && phones.length === 0 && (
          <p className="text-xs text-ink-faint">
            No email/phone in export (LinkedIn often omits emails; check contacts.csv merge).
          </p>
        )}
        {emails.map((email) => (
          <a
            key={email}
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-xs text-accent hover:underline break-all"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            {email}
          </a>
        ))}
        {phones.map((phone) => (
          <a
            key={phone}
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="flex items-center gap-2 text-xs text-ink hover:text-accent"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {phone}
          </a>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {person.linkedin_url && (
          <a
            href={person.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
          >
            LinkedIn <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {person.x_profile?.username && (
          <a
            href={xProfileUrl(person.x_profile.username)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            @{person.x_profile.username} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {person.linkedin_enrichment?.headline && (
        <p className="mt-3 text-[11px] text-ink-muted leading-relaxed">
          {person.linkedin_enrichment.headline}
        </p>
      )}
      {person.linkedin_enrichment?.about_snip && (
        <p className="mt-1 text-[11px] text-ink-faint leading-relaxed">
          {person.linkedin_enrichment.about_snip}
        </p>
      )}

      {person.score_reasons.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint mb-1">
            Score reasons
          </div>
          <ul className="space-y-0.5 text-[10px] font-mono text-ink-faint">
            {person.score_reasons.slice(0, 12).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

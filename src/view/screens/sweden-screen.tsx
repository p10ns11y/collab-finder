/**
 * Sweden — full-viewport Platsbanken / JobTech AF runway (peer to Discover).
 * THESIS: Sweden-specific hunt with room for AF workflows; not a Discover side panel.
 * OWN-WORLD: collab-finder instrument (surfaces, chips, amber accent).
 * STORY: Search → select → Import/Evaluate → fit/prep for benefits reporting.
 * FIRST VIEWPORT: left query + municipality chips; right ad list (or fit after evaluate).
 * FORM: Discover φ-split; list is the hero for Swedish emergency/runway work.
 */
import * as React from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { openExternalUrl } from '../../adapters/tauri/open-external'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { SectionLabel } from '../../components/ui/section-label'
import {
  PLATSBANKEN_MUNI_CHIPS,
  type PlatsbankenLead,
} from '../../core/domain/platsbanken'
import { HuntFitPane, huntTargetIsActive } from '../../components/finder/hunt-fit-pane'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function SwedenScreen({ view, dispatch }: Props) {
  const { model } = view
  const [selectedAdId, setSelectedAdId] = React.useState<string | null>(null)
  const busy = model.platsbanken.status === 'loading'
  const leads = model.platsbanken.status === 'ready' ? model.platsbanken.data : []
  const err =
    model.platsbanken.status === 'failed'
      ? model.platsbanken.error?.message || String(model.platsbanken.error)
      : null
  const targetUrl = model.opportunityTargetUrl
  const canSearch = !!model.platsbankenQ.trim()
  const selected = leads.find((lead) => lead.ad_id === selectedAdId)
  const fitForThisHunt =
    huntTargetIsActive(view) &&
    !!selected &&
    (selected.webpage_url === targetUrl || selected.application_url === targetUrl)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      <aside
        className="w-full min-w-0 shrink-0 space-y-3 overflow-x-hidden overflow-y-auto border-b border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:shrink-0 lg:flex-[0_0_var(--pane-minor)] lg:border-b-0 lg:border-r lg:p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <SectionLabel meta={leads.length ? `${leads.length}` : undefined}>Sweden</SectionLabel>
            <p className="ui-meta px-0.5">
              JobTech API (same as Evaluate on a Platsbanken URL) — skips the website cookie wall.
              Tokens are AND (no OR). Employment-grounded vs self-learned AI/agentic.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy || !canSearch}
            onClick={() => dispatch({ type: 'PlatsbankenSearchRequested' })}
            title="Search JobTech JobSearch (Arbetsförmedlingen)"
          >
            <Search className={`mr-1 h-3.5 w-3.5 ${busy ? 'animate-pulse' : ''}`} />
            {busy ? 'Searching…' : 'Search'}
          </Button>
        </div>

        <Input
          value={model.platsbankenQ}
          onChange={(e) => dispatch({ type: 'PlatsbankenQChanged', q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') dispatch({ type: 'PlatsbankenSearchRequested' })
          }}
          placeholder="JobTech query…"
          className="h-8 font-mono text-xs"
        />

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Rail</p>
          <div className="flex flex-wrap gap-1">
            {model.platsbankenRailChips.map((chip) => (
              <Chip
                key={chip.id}
                active={model.platsbankenQ === chip.q && model.huntRail === chip.rail}
                onClick={() =>
                  dispatch({
                    type: 'HuntRailChipApplied',
                    rail: chip.rail,
                    q: chip.q,
                    municipality: chip.municipality,
                    surface: 'sweden',
                  })
                }
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>

        {model.huntHarvested.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-faint">From live ads</p>
            <div className="flex flex-wrap gap-1">
              {model.huntHarvested.map((row) => (
                <Chip
                  key={row.key}
                  active={model.platsbankenQ === row.key}
                  onClick={() =>
                    dispatch({
                      type: 'HuntHarvestKeyApplied',
                      key: row.key,
                      surface: 'sweden',
                    })
                  }
                >
                  {row.key}
                  <span className="ml-1 opacity-60">{row.count}</span>
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Location</p>
          <div className="flex flex-wrap gap-1">
            {PLATSBANKEN_MUNI_CHIPS.map((tag) => (
              <Chip
                key={tag}
                active={model.platsbankenMunicipality === tag}
                onClick={() =>
                  dispatch({
                    type: 'PlatsbankenMunicipalityChanged',
                    municipality: model.platsbankenMunicipality === tag ? '' : tag,
                  })
                }
              >
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        {selected ? (
          <SelectedSwedenLead
            lead={selected}
            dispatch={dispatch}
            onClear={() => setSelectedAdId(null)}
          />
        ) : null}

        {err ? (
          <p className="rounded-md border border-border-subtle bg-surface-0/60 px-2 py-1.5 text-xs text-ink">
            {err}
          </p>
        ) : null}
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-5">
        {leads.length > 0 ? (
          <div className="space-y-3">
            {fitForThisHunt ? <HuntFitPane view={view} dispatch={dispatch} /> : null}
            <SectionLabel meta={`${leads.length} ads`}>Results</SectionLabel>
            <div className="space-y-1.5">
              {leads.map((lead) => (
                <SwedenLeadRow
                  key={lead.ad_id}
                  lead={lead}
                  active={selectedAdId === lead.ad_id}
                  onSelect={() => setSelectedAdId(lead.ad_id)}
                  dispatch={dispatch}
                />
              ))}
            </div>
          </div>
        ) : fitForThisHunt ? (
          <HuntFitPane view={view} dispatch={dispatch} />
        ) : model.platsbanken.status === 'ready' ? (
          <EmptyState
            title="No ads for this query"
            description="Try another JobTech query or clear the city chip, then Search again."
          />
        ) : model.platsbanken.status === 'idle' ? (
          <EmptyState
            title={
              model.history.opportunities.status === 'loading' ||
              model.history.opportunities.status === 'idle'
                ? 'Loading saved ads…'
                : 'Search Platsbanken'
            }
            description={
              model.history.opportunities.status === 'ready'
                ? 'No saved Platsbanken ads yet. Search to persist this rail.'
                : 'Restoring the last saved Sweden list from the local database.'
            }
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy || !canSearch}
                onClick={() => dispatch({ type: 'PlatsbankenSearchRequested' })}
              >
                Search now
              </Button>
            }
          />
        ) : busy ? (
          <EmptyState title="Searching JobTech…" description="Open JobSearch API · Arbetsförmedlingen." />
        ) : null}
      </div>
    </div>
  )
}

function SelectedSwedenLead({
  lead,
  dispatch,
  onClear,
}: {
  lead: PlatsbankenLead
  dispatch: Dispatch<FinderMsg>
  onClear: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border-default bg-surface-1/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {lead.favorite_match ? '★ ' : ''}
            {lead.headline}
          </p>
          <p className="ui-meta truncate">
            {lead.employer}
            {lead.municipality ? ` · ${lead.municipality}` : ''}
          </p>
        </div>
        <button type="button" className="ui-meta shrink-0 hover:text-ink" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {lead.already_in_db && lead.opportunity_id ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => dispatch({ type: 'PlatsbankenRemoveRequested', lead })}
          >
            Remove
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => dispatch({ type: 'PlatsbankenEvaluateRequested', lead })}
        >
          Evaluate
        </Button>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 text-xs text-ink-muted hover:text-accent"
          onClick={() => openExternalUrl(lead.webpage_url)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Platsbanken
        </button>
      </div>
    </div>
  )
}

function SwedenLeadRow({
  lead,
  active,
  onSelect,
  dispatch,
}: {
  lead: PlatsbankenLead
  active: boolean
  onSelect: () => void
  dispatch: Dispatch<FinderMsg>
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${
        active
          ? 'border-accent/60 bg-accent-soft text-ink'
          : 'border-border-subtle/70 bg-surface-1/35 hover:bg-surface-2/50'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">
              {lead.favorite_match ? '★ ' : ''}
              {lead.headline}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted truncate">
              {lead.employer}
              {lead.municipality ? ` · ${lead.municipality}` : ''}
              {lead.occupation ? ` · ${lead.occupation}` : ''}
            </div>
          </div>
          <span className="ui-meta shrink-0 tabular-nums">rank {lead.rank_score.toFixed(1)}</span>
        </div>
        {lead.description_snippet ? (
          <p className="mt-1.5 text-xs text-ink-faint line-clamp-2">{lead.description_snippet}</p>
        ) : null}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {lead.already_in_db ? <Chip active>Saved</Chip> : null}
        <div className="ml-auto flex flex-wrap gap-1">
          {lead.already_in_db && lead.opportunity_id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'PlatsbankenRemoveRequested', lead })}
            >
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'PlatsbankenEvaluateRequested', lead })}
          >
            Evaluate
          </Button>
          <button
            type="button"
            className="inline-flex items-center px-1.5 text-ink-muted hover:text-ink"
            title="Open on Platsbanken"
            onClick={(e) => {
              e.stopPropagation()
              openExternalUrl(lead.webpage_url)
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

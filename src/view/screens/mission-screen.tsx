/**
 * Mission — full-viewport career-board hunt (peer to Discover).
 * THESIS: Scan ranked postings in the major pane; filters stay on the φ-minor rail.
 * OWN-WORLD: collab-finder instrument (surfaces, chips, amber accent).
 * STORY: Pull → select → Import/Evaluate → fit/prep.
 * FIRST VIEWPORT: left filters + Pull; right list (or fit after evaluate).
 * FORM: Discover φ-split extended; list is the hero, not a stacked panel.
 */
import * as React from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { SectionLabel } from '../../components/ui/section-label'
import {
  MISSION_FIRM_CHIPS,
  MISSION_QUERY_CHIPS,
  type MissionFirmLead,
} from '../../core/domain/mission-firms'
import { HuntFitPane, huntTargetIsActive } from '../../components/finder/hunt-fit-pane'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

export function MissionScreen({ view, dispatch }: Props) {
  const { model } = view
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const busy = model.missionFirms.status === 'loading'
  const leads = model.missionFirms.status === 'ready' ? model.missionFirms.data : []
  const err =
    model.missionFirms.status === 'failed'
      ? model.missionFirms.error?.message || String(model.missionFirms.error)
      : null
  const targetUrl = model.opportunityTargetUrl
  const fitForThisHunt =
    huntTargetIsActive(view) &&
    (!!selectedKey || leads.some((lead) => lead.absolute_url === targetUrl))
  const selected = leads.find(
    (lead) => `${lead.source}:${lead.firm_id}:${lead.external_id}` === selectedKey,
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      <aside
        className="w-full min-w-0 shrink-0 space-y-3 overflow-x-hidden overflow-y-auto border-b border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:shrink-0 lg:flex-[0_0_var(--pane-minor)] lg:border-b-0 lg:border-r lg:p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <SectionLabel meta={leads.length ? `${leads.length}` : undefined}>Mission</SectionLabel>
            <p className="ui-meta px-0.5">
              SpaceXAI, Tesla, Nordic/EU boards. Same query caches; new query appends. Shift+Pull
              forces refetch.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={(e) =>
              dispatch({
                type: 'MissionFirmsSearchRequested',
                forceRefresh: e.shiftKey,
              })
            }
            title="Pull career boards (Shift+click forces network refetch)"
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Pulling…' : 'Pull'}
          </Button>
        </div>

        <Input
          value={model.missionFirmsQ}
          onChange={(e) => dispatch({ type: 'MissionFirmsQChanged', q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') dispatch({ type: 'MissionFirmsSearchRequested' })
          }}
          placeholder="Optional title filter…"
          className="h-8 font-mono text-xs"
        />

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Rail</p>
          <div className="flex flex-wrap gap-1">
            {MISSION_QUERY_CHIPS.map((chip) => (
              <Chip
                key={chip.id}
                active={model.missionFirmsQ === chip.q && model.huntRail === chip.rail}
                onClick={() =>
                  dispatch({
                    type: 'HuntRailChipApplied',
                    rail: chip.rail,
                    q: chip.q,
                    surface: 'mission',
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
                  active={model.missionFirmsQ === row.key}
                  onClick={() =>
                    dispatch({
                      type: 'HuntHarvestKeyApplied',
                      key: row.key,
                      surface: 'mission',
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
          <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Firms</p>
          <div className="flex flex-wrap gap-1">
            {MISSION_FIRM_CHIPS.map((firm) => (
              <Chip
                key={firm.id}
                active={model.missionFirmsSelected.includes(firm.id)}
                onClick={() => dispatch({ type: 'MissionFirmsFirmToggled', firmId: firm.id })}
              >
                {firm.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-faint">Bias</p>
          <div className="flex flex-wrap gap-1">
            <Chip
              active={model.missionFirmsTexasOnly}
              onClick={() => dispatch({ type: 'MissionFirmsTexasOnlyToggled' })}
            >
              Texas only
            </Chip>
            <Chip
              active={model.missionFirmsTerafabBias}
              onClick={() => dispatch({ type: 'MissionFirmsTerafabBiasToggled' })}
            >
              Terafab bias
            </Chip>
          </div>
        </div>

        {selected ? (
          <SelectedMissionLead
            lead={selected}
            dispatch={dispatch}
            onClear={() => setSelectedKey(null)}
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
            <SectionLabel meta={`${leads.length} postings`}>Results</SectionLabel>
            <div className="space-y-1.5">
              {leads.map((lead) => {
                const key = `${lead.source}:${lead.firm_id}:${lead.external_id}`
                const active = selectedKey === key
                return (
                  <MissionLeadRow
                    key={key}
                    lead={lead}
                    active={active}
                    onSelect={() => setSelectedKey(key)}
                    dispatch={dispatch}
                  />
                )
              })}
            </div>
          </div>
        ) : fitForThisHunt ? (
          <HuntFitPane view={view} dispatch={dispatch} />
        ) : model.missionFirms.status === 'ready' ? (
          <EmptyState
            title="No postings for this filter"
            description="Widen firms, clear Texas only, or try a different query — then Pull."
          />
        ) : model.missionFirms.status === 'idle' ? (
          <EmptyState
            title="Pull mission postings"
            description="Select firms on the left, optionally add a title filter, then Pull. Results fill this pane."
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => dispatch({ type: 'MissionFirmsSearchRequested' })}
              >
                Pull now
              </Button>
            }
          />
        ) : busy ? (
          <EmptyState title="Pulling boards…" description="Greenhouse, Lever, Ashby, JobTech, Tesla dump." />
        ) : null}
      </div>
    </div>
  )
}

function SelectedMissionLead({
  lead,
  dispatch,
  onClear,
}: {
  lead: MissionFirmLead
  dispatch: Dispatch<FinderMsg>
  onClear: () => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border-default bg-surface-1/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {lead.terafab_adjacent ? '◆ ' : ''}
            {lead.title}
          </p>
          <p className="ui-meta truncate">
            {lead.firm_label}
            {lead.location ? ` · ${lead.location}` : ''}
            {lead.texas_match ? ' · TX' : ''}
          </p>
        </div>
        <button type="button" className="ui-meta shrink-0 hover:text-ink" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={lead.already_in_db}
          onClick={() => dispatch({ type: 'MissionFirmsImportRequested', lead })}
        >
          Import
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => dispatch({ type: 'MissionFirmsEvaluateRequested', lead })}
        >
          Evaluate
        </Button>
        <a
          href={lead.absolute_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 text-xs text-ink-muted hover:text-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      </div>
    </div>
  )
}

function MissionLeadRow({
  lead,
  active,
  onSelect,
  dispatch,
}: {
  lead: MissionFirmLead
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
              {lead.terafab_adjacent ? '◆ ' : ''}
              {lead.title}
            </div>
            <div className="mt-0.5 text-xs text-ink-muted truncate">
              {lead.firm_label}
              {lead.location ? ` · ${lead.location}` : ''}
              {lead.texas_match ? ' · TX' : ''}
              {lead.department ? ` · ${lead.department}` : ''}
            </div>
          </div>
          <span className="ui-meta shrink-0 tabular-nums">rank {lead.rank_score.toFixed(0)}</span>
        </div>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {lead.already_in_db ? <Chip active>In DB</Chip> : null}
        {lead.rank_reasons.slice(0, 2).map((reason) => (
          <span key={reason} className="ui-meta">
            {reason}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={lead.already_in_db}
            onClick={() => dispatch({ type: 'MissionFirmsImportRequested', lead })}
          >
            Import
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'MissionFirmsEvaluateRequested', lead })}
          >
            Evaluate
          </Button>
          <a
            href={lead.absolute_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-1.5 text-ink-muted hover:text-ink"
            title="Open posting"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

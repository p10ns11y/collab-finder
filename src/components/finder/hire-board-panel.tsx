import * as React from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Chip } from '../ui/chip'
import { Input } from '../ui/input'
import { Panel } from '../ui/panel'
import { SectionLabel } from '../ui/section-label'
import {
  HIRE_GEO_TAGS,
  careerUrlUsable,
  type HireBoardLead,
} from '../../core/domain/hire-board'
import { normalizeOpportunityUrl } from '../../core/domain/opportunity-url'
import type { AsyncState } from '../../core/async'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  hireBoard: AsyncState<HireBoardLead[]>
  hireBoardQ: string
  hireBoardGeo: string[]
  dispatch: Dispatch<FinderMsg>
}

export function HireBoardPanel({ hireBoard, hireBoardQ, hireBoardGeo, dispatch }: Props) {
  const [open, setOpen] = React.useState(true)
  const busy = hireBoard.status === 'loading'
  const leads = hireBoard.status === 'ready' ? hireBoard.data : []
  const err =
    hireBoard.status === 'failed' ? hireBoard.error?.message || String(hireBoard.error) : null

  return (
    <Panel dense className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SectionLabel meta={leads.length ? `${leads.length}` : undefined}>
            Hire board {open ? '▾' : '▸'}
          </SectionLabel>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => dispatch({ type: 'HireBoardRefreshRequested' })}
          title="Fetch sheet from local config (config.local.json)"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {open && (
        <>
          <p className="ui-meta px-0.5">
            Sheet URL from gitignored{' '}
            <span className="font-mono">data/hire-board/config.local.json</span>. Select or Evaluate
            writes to opportunities; nothing else is imported.
          </p>

          <Input
            value={hireBoardQ}
            onChange={(e) => dispatch({ type: 'HireBoardQChanged', q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') dispatch({ type: 'HireBoardRefreshRequested' })
            }}
            placeholder="Filter company…"
            className="h-8 font-mono text-xs"
          />

          <div className="flex flex-wrap gap-1">
            {HIRE_GEO_TAGS.map((tag) => (
              <Chip
                key={tag}
                active={hireBoardGeo.includes(tag)}
                onClick={() => dispatch({ type: 'HireBoardGeoToggled', tag })}
              >
                {tag}
              </Chip>
            ))}
          </div>

          {err ? (
            <p className="rounded-md border border-border-subtle bg-surface-0/60 px-2 py-1.5 text-xs text-ink">
              {err}
            </p>
          ) : null}

          {hireBoard.status === 'idle' && !busy ? (
            <p className="ui-meta px-0.5">Press Refresh to skim the configured sheet.</p>
          ) : null}

          {leads.length > 0 ? (
            <div className="max-h-[min(280px,40vh)] space-y-1 overflow-auto text-xs">
              {leads.map((lead) => (
                <HireBoardRow key={`${lead.company}|${lead.career_url}`} lead={lead} dispatch={dispatch} />
              ))}
            </div>
          ) : hireBoard.status === 'ready' ? (
            <p className="ui-meta px-0.5">No matches for this filter.</p>
          ) : null}
        </>
      )}
    </Panel>
  )
}

function HireBoardRow({
  lead,
  dispatch,
}: {
  lead: HireBoardLead
  dispatch: Dispatch<FinderMsg>
}) {
  const href = normalizeOpportunityUrl(lead.career_url)
  const canAct = careerUrlUsable(lead.career_url) && !!href
  const thread = normalizeOpportunityUrl(lead.thread_url)

  return (
    <div className="rounded-md border border-border-subtle/60 bg-surface-0/40 px-2 py-1.5">
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">
            {lead.company}
            {lead.already_in_db ? (
              <span className="ml-1 font-mono text-[10px] text-accent/80">in DB</span>
            ) : null}
          </div>
          <div className="ui-meta truncate">{lead.location || '—'}</div>
          <div className="ui-meta truncate">
            score {lead.skim_score}
            {lead.skim_reasons.length ? ` · ${lead.skim_reasons.slice(0, 2).join(', ')}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-end text-ink-muted hover:text-accent"
              title={href}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {thread ? (
            <a
              href={thread}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[10px] text-ink-muted hover:text-accent"
            >
              thread
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canAct}
          onClick={() => dispatch({ type: 'HireBoardSelectRequested', lead })}
        >
          Select
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canAct}
          onClick={() => dispatch({ type: 'HireBoardEvaluateRequested', lead })}
        >
          Evaluate
        </Button>
      </div>
    </div>
  )
}

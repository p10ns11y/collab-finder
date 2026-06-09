import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import type { OpportunityTargetResult, OpportunityTargetFit, OpportunityTargetPrep } from '../../core/domain/opportunity-target'

type Props = {
  result: OpportunityTargetResult | null
  error: string | null
  busy: boolean
  sourceUrl?: string
  onClear?: () => void
  onPrepRequested?: (opportunityId?: number) => void
}

export function OpportunityTargetFitPanel({ result, error, busy, sourceUrl, onClear, onPrepRequested }: Props) {
  if (busy) {
    return (
      <Card className="border-border-subtle">
        <CardHeader>
          <CardTitle className="text-sm">Working with grok-4.3…</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-4 w-2/3 animate-pulse bg-surface-2 rounded" />
          <div className="mt-2 h-3 w-full animate-pulse bg-surface-2 rounded" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardHeader>
          <CardTitle className="text-sm text-danger">Target analysis failed</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-ink-muted">{error}</CardContent>
      </Card>
    )
  }

  if (!result) {
    return null
  }
  const fit: OpportunityTargetFit | undefined = 'fit' in result ? result.fit : undefined
  const prep: OpportunityTargetPrep | undefined = 'prep' in result ? result.prep : undefined
  if (!fit && !prep) {
    return null
  }

  const [actionCopied, setActionCopied] = React.useState(false)

  const score = fit?.overall ?? 0
  const tone = score >= 75 ? 'success' : score >= 55 ? 'accent' : 'warning'

  const opportunityId = 'opportunity_id' in result ? result.opportunity_id : undefined
  const estCost = 'est_cost_usd' in result ? result.est_cost_usd : undefined
  const packetPreview = 'packet_preview' in result ? result.packet_preview : undefined

  return (
    <Card className="border-border-subtle shadow-glow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            { prep ? 'Fit analysis + Prep' : 'Fit analysis' } <span className="text-[10px] text-accent">grok-4.3</span>
          </CardTitle>
          <Badge tone={tone}>{score}/100</Badge>
        </div>
        <div className="text-[10px] text-ink-faint">
          opportunity #{opportunityId ?? '—'} · ~${estCost?.toFixed(4) ?? '—'}
          {score >= 75 ? ' — Strong fit' : score >= 55 ? ' — Moderate fit — review gaps' : ' — Low fit — significant gaps'}
          {prep ? ' (prep generated)' : ''}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {fit?.rationale && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Rationale</div>
            <p className="text-ink-muted leading-relaxed">{fit.rationale}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Must address</div>
            {fit?.gaps_must && fit.gaps_must.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_must.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Nice to have</div>
            {fit?.gaps_nice && fit.gaps_nice.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_nice.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>
        </div>

        {fit?.recommended_action && (
          <div className="pt-1 border-t border-border-subtle">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Recommended next step</div>
            <p className="text-accent font-medium text-sm">{fit.recommended_action}</p>
          </div>
        )}

        {/* Slice C: Prep artifacts (letter, CV suggestions, research) */}
        { prep && (
          <div className="space-y-3 border-t border-border-subtle pt-3 mt-1">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">Prep pack (grok-4.3)</div>

            {prep.cover_letter && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Cover letter</div>
                <pre className="text-xs whitespace-pre-wrap bg-surface-2 p-2 rounded max-h-48 overflow-auto text-ink-muted">{prep.cover_letter}</pre>
              </div>
            )}

            {prep.cv_suggestions && prep.cv_suggestions.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">CV suggestions</div>
                <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                  {prep.cv_suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {prep.research_notes && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Research notes</div>
                <p className="text-xs text-ink-muted whitespace-pre-wrap">{prep.research_notes}</p>
              </div>
            )}

            {prep.exceptional_work_example && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Exceptional work example</div>
                <p className="text-xs text-ink-muted whitespace-pre-wrap">{prep.exceptional_work_example}</p>
              </div>
            )}
          </div>
        )}

        {/* Polish actions per feedback (Slice B) + Slice C prep trigger */}
        <div className="flex flex-wrap gap-2 pt-1">
          {sourceUrl && (
            <button
              onClick={() => { try { window.open(sourceUrl, '_blank', 'noopener,noreferrer') } catch {} }}
              className="px-2 py-1 text-xs rounded border border-border-default hover:border-accent/60 hover:text-accent"
            >
              Open URL
            </button>
          )}
          {fit?.recommended_action && (
            <button
              onClick={() => {
                const text = fit.recommended_action || ''
                if (text) {
                  navigator.clipboard?.writeText(text).then(() => {
                    setActionCopied(true)
                    window.setTimeout(() => setActionCopied(false), 1200)
                  }).catch(() => {})
                }
              }}
              className="px-2 py-1 text-xs rounded border border-border-default hover:border-accent/60 hover:text-accent"
            >
              {actionCopied ? 'Copied!' : 'Copy recommended action'}
            </button>
          )}
          {onPrepRequested && result && (fit?.overall ?? 0) >= 45 && (
            <button
              onClick={() => onPrepRequested(opportunityId)}
              className="px-2 py-1 text-xs rounded border border-accent/60 hover:bg-accent/10 text-accent"
              title="Generate (or regenerate) prep pack using current CV summary + prior fit analysis. Includes cover letter, CV suggestions (as sidecar proposals), research notes. Skipped for low-fit scores to avoid low-value xAI calls. Prep cost shown after generation."
            >
              {prep ? 'Regenerate prep' : 'Generate prep pack'}
            </button>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="px-2 py-1 text-xs rounded border border-border-default hover:border-accent/60 hover:text-accent ml-auto"
              title="Dismiss this result so X results or empty state can show again"
            >
              Clear / evaluate another
            </button>
          )}
        </div>

        {packetPreview && (
          <details className="text-[10px] text-ink-faint">
            <summary className="cursor-pointer hover:text-ink">Full CV packet was sent (preview of what the model received)</summary>
            <pre className="mt-1 p-2 bg-surface-2 rounded text-[9px] overflow-auto max-h-24 whitespace-pre-wrap">{packetPreview}</pre>
            <div className="mt-1 text-[9px] text-ink-faint/70">The complete packet you have in the input above was included verbatim in the prompt.</div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

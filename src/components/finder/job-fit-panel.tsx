import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

type Fit = {
  overall?: number
  rationale?: string
  gaps_must?: string[]
  gaps_nice?: string[]
  recommended_action?: string
}

type JobResult = {
  opportunity_id?: number
  fit?: Fit
  packet_preview?: string
  est_cost_usd?: number
}

type Props = {
  result: JobResult | null
  error: string | null
  busy: boolean
}

export function JobFitPanel({ result, error, busy }: Props) {
  if (busy) {
    return (
      <Card className="border-border-subtle">
        <CardHeader>
          <CardTitle className="text-sm">Analyzing with grok-4.3…</CardTitle>
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
          <CardTitle className="text-sm text-danger">Analysis failed</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-ink-muted">{error}</CardContent>
      </Card>
    )
  }

  if (!result || !result.fit) {
    return null
  }

  const fit = result.fit
  const score = fit.overall ?? 0
  const tone = score >= 75 ? 'success' : score >= 55 ? 'accent' : 'warning'

  return (
    <Card className="border-border-subtle shadow-glow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Job fit analysis <span className="text-[10px] text-accent">grok-4.3</span>
          </CardTitle>
          <Badge tone={tone as any}>{score}/100</Badge>
        </div>
        <div className="text-[10px] text-ink-faint">
          opportunity #{result.opportunity_id} · ~${result.est_cost_usd?.toFixed(4) ?? '—'}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {fit.rationale && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Rationale</div>
            <p className="text-ink-muted leading-relaxed">{fit.rationale}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Must address</div>
            {fit.gaps_must && fit.gaps_must.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_must.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Nice to have</div>
            {fit.gaps_nice && fit.gaps_nice.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-ink-muted">
                {fit.gaps_nice.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            ) : (
              <div className="text-xs text-ink-faint">None flagged</div>
            )}
          </div>
        </div>

        {fit.recommended_action && (
          <div className="pt-1 border-t border-border-subtle">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-1">Recommended next step</div>
            <p className="text-accent font-medium text-sm">{fit.recommended_action}</p>
          </div>
        )}

        {result.packet_preview && (
          <details className="text-[10px] text-ink-faint">
            <summary className="cursor-pointer hover:text-ink">CV packet preview used (trust)</summary>
            <pre className="mt-1 p-2 bg-surface-2 rounded text-[9px] overflow-auto max-h-24 whitespace-pre-wrap">{result.packet_preview}</pre>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

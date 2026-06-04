import type { Decision } from '../../lib/types'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

type Props = {
  decision: Decision
  onRerun: () => void
  onPromote: () => void
}

export function DecisionPanel({ decision, onRerun, onPromote }: Props) {
  const guarded = decision.guards_triggered.length > 0

  return (
    <Card className={guarded ? 'ring-1 ring-warning/30' : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Latest decision</CardTitle>
        <Badge tone={guarded ? 'warning' : 'success'}>
          {decision.confidence}% confidence
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Action{' '}
          <span className="font-mono font-medium text-accent">{decision.action}</span>
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">{decision.rationale}</p>
        {guarded && (
          <pre className="overflow-x-auto rounded-lg border border-warning/20 bg-warning/5 p-2 text-[10px] text-warning">
            {JSON.stringify(decision.guards_triggered, null, 2)}
          </pre>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onRerun}>
            Re-run with tweak
          </Button>
          <Button variant="ghost" size="sm" onClick={onPromote}>
            Promote insights (guarded)
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
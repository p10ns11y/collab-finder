import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  pauses: string[]
}

export function PauseLog({ pauses }: Props) {
  if (pauses.length === 0) return null

  return (
    <Card className="min-w-0 overflow-hidden border-warning/25 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Pauses & interventions
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <ul className="min-w-0 space-y-2 text-xs text-ink-muted">
          {pauses.map((p, i) => (
            <li
              key={i}
              className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] leading-relaxed"
              title={p}
            >
              {p}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
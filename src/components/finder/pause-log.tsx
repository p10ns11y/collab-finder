import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  pauses: string[]
}

export function PauseLog({ pauses }: Props) {
  if (pauses.length === 0) return null

  return (
    <Card className="border-warning/25 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Pauses & interventions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-xs text-ink-muted">
          {pauses.map((p, i) => (
            <li key={i} className="leading-relaxed">
              {p}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
import type { ReactNode } from 'react'
import { Gauge, PauseCircle, Wallet } from 'lucide-react'
import type { ReactorState } from '../../core/domain/finder'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  reactorState: ReactorState | null
  pauseCount: number
}

export function GuardDashboard({ reactorState, pauseCount }: Props) {
  const cost = reactorState?.current_cost ?? 0
  const rate = reactorState?.x_rate_remaining ?? 450

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reactor guards</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Wallet}
            label="Token budget"
            value={`${cost} / 10k`}
            badge={<Badge tone="accent">active</Badge>}
          />
          <Metric
            icon={Gauge}
            label="X rate headroom"
            value={`${rate} left`}
            badge={<Badge tone="success">ok</Badge>}
          />
          <Metric
            icon={PauseCircle}
            label="Interventions"
            value={String(pauseCount)}
            badge={<Badge tone={pauseCount > 0 ? 'warning' : 'neutral'}>logged</Badge>}
          />
          <div className="rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
              CV promote
            </p>
            <p className="mt-1 text-sm text-ink">Sidecar-first only</p>
            <Badge tone="neutral" className="mt-2">
              cv-promote-guard
            </Badge>
          </div>
        </div>
        {reactorState?.pauses && reactorState.pauses.length > 0 && (
          <p className="mt-3 text-xs text-warning">
            Active pauses: {reactorState.pauses.join(' · ')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: typeof Wallet
  label: string
  value: string
  badge: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        {badge}
      </div>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  )
}
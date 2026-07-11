import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Shared empty surface for Discover/Xplore calm empty states. */
export function EmptyState({ title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'mt-6 rounded-lg border border-border-subtle bg-surface-1/60 px-6 py-8 text-center',
        className,
      )}
    >
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description && <p className="mt-1.5 text-xs text-ink-faint max-w-sm mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

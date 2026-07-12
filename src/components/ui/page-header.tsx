import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Screen-level title block for secondary pages (Settings, History, …). */
export function PageHeader({ title, description, action, className }: Props) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-base font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-xs text-ink-faint leading-relaxed max-w-prose">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

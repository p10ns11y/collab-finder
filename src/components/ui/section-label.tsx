import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Optional trailing meta (counts, status) */
  meta?: ReactNode
}

/** Consistent section header for panels and lists. */
export function SectionLabel({ className, meta, children, ...props }: Props) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)} {...props}>
      <div className="ui-section-label">{children}</div>
      {meta != null && <div className="ui-meta tabular-nums shrink-0">{meta}</div>}
    </div>
  )
}

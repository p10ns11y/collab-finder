import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Tighter padding for dense rails */
  dense?: boolean
}

/** Inset work panel — lighter than Card; use for rails, quick forms, nested blocks. */
export function Panel({ className, dense, ...props }: Props) {
  return (
    <div
      className={cn('ui-panel', dense ? 'p-2.5' : 'p-3', className)}
      {...props}
    />
  )
}

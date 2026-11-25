import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  /** Left sidebar nav (full height) */
  sidebar?: ReactNode
  header: ReactNode
  /** Viewport content (screens provide their own internal scroll containers) */
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AppShell({ sidebar, header, children, footer, className }: Props) {
  return (
    <div className={cn('mesh-bg flex h-screen overflow-hidden', className)}>
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {footer}
      </div>
    </div>
  )
}
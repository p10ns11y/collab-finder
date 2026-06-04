import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = {
  header: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AppShell({ header, children, footer, className }: Props) {
  return (
    <div className={cn('mesh-bg flex min-h-screen flex-col', className)}>
      {header}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</main>
      {footer}
    </div>
  )
}
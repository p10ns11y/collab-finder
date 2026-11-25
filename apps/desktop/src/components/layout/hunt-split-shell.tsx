import type { ReactNode } from 'react'

type Props = {
  document: ReactNode
  controls: ReactNode
}

/** Results left, forms and controls right. Same dock as Discover. */
export function HuntSplitShell({ document, controls }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-5">{document}</div>
      <aside
        className="w-full min-w-0 space-y-3 overflow-x-hidden overflow-y-auto border-t border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:shrink-0 lg:flex-[0_0_var(--pane-minor)] lg:border-t-0 lg:border-l lg:p-4"
      >
        {controls}
      </aside>
    </div>
  )
}

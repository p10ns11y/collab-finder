import { Command, Radar } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type Props = {
  onOpenPalette: () => void
  /** Optional screen title shown next to app name (e.g. "Discover") */
  screenTitle?: string
  /** X bearer connected (search/cycle) */
  xConnected?: boolean
  xChecking?: boolean
  /** Session or DB pause count for interventions */
  pauseCount?: number
  /** Opportunity analyze/prep in flight */
  targetBusy?: boolean
}

export function Header({
  onOpenPalette,
  screenTitle,
  xConnected = false,
  xChecking = false,
  pauseCount = 0,
  targetBusy = false,
}: Props) {
  return (
    <header className="z-40 border-b border-border-subtle glass-panel">
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft ring-1 ring-accent/30"
            aria-hidden
          >
            <Radar className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-semibold tracking-tight text-ink">collab-finder</span>
            {screenTitle && (
              <>
                <span className="text-ink-faint">/</span>
                <span className="truncate text-sm text-ink-muted">{screenTitle}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <Badge
              tone={xChecking ? 'neutral' : xConnected ? 'success' : 'warning'}
              className="text-[10px] px-1.5 py-0"
              title="X API bearer for search/cycle (Xplore)"
            >
              {xChecking ? 'X…' : xConnected ? 'X on' : 'X off'}
            </Badge>
            {pauseCount > 0 && (
              <Badge tone="warning" className="text-[10px] px-1.5 py-0" title="Guards / pauses logged">
                {pauseCount} pause{pauseCount === 1 ? '' : 's'}
              </Badge>
            )}
            {targetBusy && (
              <Badge tone="accent" className="text-[10px] px-1.5 py-0">
                Evaluating…
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenPalette}
            className="shrink-0 border-border-default h-8"
          >
            <Command className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Palette</span>
            <kbd className="ml-1 hidden rounded border border-border-default bg-surface-2 px-1 py-px font-mono text-[10px] text-ink-faint sm:inline">
              ⌘K
            </kbd>
          </Button>
        </div>
      </div>
    </header>
  )
}

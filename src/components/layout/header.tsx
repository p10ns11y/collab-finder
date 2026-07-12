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
    <header className="z-40 glass-panel">
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft ring-1 ring-accent/30"
            aria-hidden
          >
            <Radar className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-ink">
              collab-finder
            </span>
            {screenTitle && (
              <>
                <span className="text-ink-faint/80 select-none" aria-hidden>
                  /
                </span>
                <span className="truncate text-sm font-medium text-ink-muted">{screenTitle}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <Badge
              tone={xChecking ? 'neutral' : xConnected ? 'success' : 'warning'}
              title="X API bearer for search/cycle (Xplore)"
            >
              {xChecking ? 'X…' : xConnected ? 'X on' : 'X off'}
            </Badge>
            {pauseCount > 0 && (
              <Badge tone="warning" title="Guards / pauses logged">
                {pauseCount} pause{pauseCount === 1 ? '' : 's'}
              </Badge>
            )}
            {targetBusy && <Badge tone="accent">Evaluating…</Badge>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenPalette}
            className="h-8 shrink-0 border border-border-subtle"
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

import { Command, Radar } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type Props = {
  onOpenPalette: () => void
  /** Optional screen title shown next to app name (e.g. "Discover") */
  screenTitle?: string
}

export function Header({ onOpenPalette, screenTitle }: Props) {
  return (
    <header className="z-40 border-b border-border-subtle glass-panel">
      <div className="flex h-12 items-center justify-between gap-4 px-4">
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
            <Badge tone="accent" className="text-[10px] px-1.5 py-0">v0.1</Badge>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenPalette}
          className="shrink-0 border-border-default h-8"
        >
          <Command className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Palette</span>
          <kbd className="ml-1 hidden rounded border border-border-default bg-surface-2 px-1 py-px font-mono text-[9px] text-ink-faint sm:inline">
            ⌘K
          </kbd>
        </Button>
      </div>
    </header>
  )
}
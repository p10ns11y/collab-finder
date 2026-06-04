import { Command, Radar } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type Props = {
  onOpenPalette: () => void
}

export function Header({ onOpenPalette }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle glass-panel">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft ring-1 ring-accent/30"
            aria-hidden
          >
            <Radar className="h-4 w-4 text-accent" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight text-ink">
                collab-finder
              </h1>
              <Badge tone="accent">v0.1</Badge>
            </div>
            <p className="truncate text-[11px] text-ink-faint">
              X + xAI · self-guarded reactor · MCP-ready
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenPalette}
          className="shrink-0 border-border-default"
        >
          <Command className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Command palette</span>
          <kbd className="ml-1 hidden rounded border border-border-default bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:inline">
            ⌘K
          </kbd>
        </Button>
      </div>
    </header>
  )
}
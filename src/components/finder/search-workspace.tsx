import { Loader2, Search, Sparkles } from 'lucide-react'
import type { SearchPreset } from '../../core/domain/finder'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

/**
 * Search-specific controls only (query, actions, presets).
 *
 * The CV summary packet was moved out to its own top-level `CvSummaryInput`
 * component. It is shared global context used by Quick Target (analyze/prep)
 * in addition to X search/cycle. Keeping it inside the search card was the root
 * cause of the reported problem: X errors/busy states made the CV hard to reach
 * for recovery or for target-only workflows.
 */

type Props = {
  query: string
  busy: boolean
  canSearch: boolean
  canRunCycle: boolean
  presets: SearchPreset[]
  onQueryChange: (q: string) => void
  onPresetSelect: (query: string) => void
  onSearch: () => void
  onAutonomousCycle: () => void
}

export function SearchWorkspace({
  query,
  busy,
  canSearch,
  canRunCycle,
  presets,
  onQueryChange,
  onPresetSelect,
  onSearch,
  onAutonomousCycle,
}: Props) {
  return (
    <Card className="shadow-glow">
      <CardHeader>
        <CardTitle>Search workspace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search-query">Search query</Label>
          <Input
            id="search-query"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="w-full font-mono text-xs"
            placeholder="X search operators — fully editable"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={onSearch}
              disabled={busy || !canSearch}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              Search
            </Button>
            <Button
              variant="primary"
              onClick={onAutonomousCycle}
              disabled={busy || !canRunCycle}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Run cycle
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-faint">Presets</span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.rationale}
              onClick={() => onPresetSelect(p.query)}
              className="rounded-full border border-border-default bg-surface-2 px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
            >
              {p.tier === 'priority' ? (
                <span className="mr-1 text-accent" aria-hidden>
                  ★
                </span>
              ) : null}
              {p.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
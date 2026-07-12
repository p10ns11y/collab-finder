import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import { isPlausibleCvPacket } from '../../core/domain/cv-packet'

type Props = {
  cvSummary: string
  onCvSummaryChange: (s: string) => void
  /** Restore distilled default + heal localStorage (optional; Discover wires this). */
  onResetToDefault?: () => void
}

/**
 * Collapsible CV packet editor (global grounding for analyze/prep + Xplore).
 * Collapsed by default when the packet looks valid — expand to edit.
 */
export function CvSummaryInput({ cvSummary, onCvSummaryChange, onResetToDefault }: Props) {
  const looksCorrupted = !isPlausibleCvPacket(cvSummary)
  const empty = !cvSummary.trim()
  const [open, setOpen] = React.useState(looksCorrupted || empty)

  React.useEffect(() => {
    if (looksCorrupted || empty) setOpen(true)
  }, [looksCorrupted, empty])

  const preview = cvSummary.trim().split('\n').find((l) => l.trim()) || 'Empty packet'
  const chars = cvSummary.length

  return (
    <div className="ui-panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-accent"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          )}
          <span className="shrink-0 text-xs font-medium">CV packet</span>
          <span className="shrink-0 text-accent ui-meta">shared</span>
          {!open && (
            <span className="truncate font-mono text-[11px] text-ink-faint" title={preview}>
              {preview.slice(0, 48)}
              {preview.length > 48 ? '…' : ''}
            </span>
          )}
        </button>
        <span className="ui-meta shrink-0 tabular-nums">{chars}</span>
        {onResetToDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetToDefault}
            className="h-7 px-2 text-[10px]"
            title="Replace with distilled default and heal localStorage"
          >
            Reset
          </Button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 border-t border-border-subtle/60 pt-2">
          {looksCorrupted && (
            <div className="mb-2 text-[11px] text-warning border border-warning/40 bg-warning/10 rounded px-2 py-1.5">
              Packet looks corrupted. Use <strong>Reset</strong> or paste your English packet.
            </div>
          )}
          <Label htmlFor="cv-summary" className="sr-only">
            CV packet sent in full to the model
          </Label>
          <Textarea
            id="cv-summary"
            value={cvSummary}
            onChange={(e) => onCvSummaryChange(e.target.value)}
            rows={5}
            spellCheck={false}
            title="Sent in full for analyze/prep. State total YOE separately from recency of specific projects."
            className={`w-full bg-surface-0 border rounded px-3 py-1.5 text-xs font-mono leading-snug focus:outline-none focus:border-accent/60 ${
              looksCorrupted ? 'border-warning/60' : 'border-border-subtle'
            }`}
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Sent in full for every analysis. Tip: total YOE ≠ recency of personal projects.
          </p>
        </div>
      )}
    </div>
  )
}

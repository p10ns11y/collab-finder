import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { isPlausibleCvPacket } from '../../core/domain/cv-packet'

type Props = {
  cvSummary: string
  onCvSummaryChange: (s: string) => void
  /** Restore distilled default + heal localStorage (optional; Discover wires this). */
  onResetToDefault?: () => void
}

/**
 * Independent CV summary / context packet editor.
 *
 * This is *global application context* (sourced from data/distillation + eventually
 * cv-promote-guard), not a search-specific input. It is used by:
 * - X search / autonomous cycle (reactor)
 * - Quick Target (analyze + prep)
 *
 * It must remain always reachable and editable, even when search/cycle flows error,
 * are busy, or are not the current focus. Placing it inside SearchWorkspace caused
 * the exact recovery problem: errors in X paths made the grounding data hard to
 * inspect/fix without "restarting the search flow".
 */
export function CvSummaryInput({ cvSummary, onCvSummaryChange, onResetToDefault }: Props) {
  const looksCorrupted = !isPlausibleCvPacket(cvSummary)

  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="font-medium text-sm mb-2 flex items-center gap-2 flex-wrap">
        <span>CV packet (your distilled version — sent in full)</span>
        <span className="text-[10px] text-accent">shared</span>
        {onResetToDefault && (
          <button
            type="button"
            onClick={onResetToDefault}
            className="ml-auto text-[10px] px-2 py-0.5 rounded border border-border-subtle hover:border-accent/60 text-ink-muted hover:text-accent"
            title="Replace textarea + localStorage cache with the distilled default packet"
          >
            Reset to default
          </button>
        )}
      </div>

      {looksCorrupted && (
        <div className="mb-2 text-[11px] text-warning border border-warning/40 bg-warning/10 rounded px-2 py-1.5">
          This packet looks corrupted (encoding garbage / unexpected CJK). Use <strong>Reset to default</strong> or paste your English packet. Corrupted text is not written back to storage.
        </div>
      )}

      <Label htmlFor="cv-summary" className="sr-only">
        CV packet (your distilled version — sent in full to the model)
      </Label>
      <Textarea
        id="cv-summary"
        value={cvSummary}
        onChange={(e) => onCvSummaryChange(e.target.value)}
        rows={6}
        spellCheck={false}
        className={`w-full bg-surface-0 border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60 font-mono leading-snug ${
          looksCorrupted ? 'border-warning/60' : 'border-border-subtle'
        }`}
      />

      <div className="mt-2 text-[10px] text-ink-faint">
        The complete text you put here is sent **in full** to the model for every analysis/prep (this is already your distilled packet). Also used by Xplore cycles. Edit anytime.
        <br />Tip: State total YOE separately from recency of specific projects (e.g. "9+ years industry; recent personal agentic work"). The prep prompt now strongly enforces this to reduce fabrication.
      </div>
    </div>
  )
}

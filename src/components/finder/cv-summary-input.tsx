import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

type Props = {
  cvSummary: string
  onCvSummaryChange: (s: string) => void
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
export function CvSummaryInput({ cvSummary, onCvSummaryChange }: Props) {
  return (
    <div className="border border-border-subtle rounded p-4 bg-surface-1/40">
      <div className="font-medium text-sm mb-2 flex items-center gap-2">
        CV summary packet (from distillation)
        <span className="text-[10px] text-accent">shared</span>
      </div>

      <Label htmlFor="cv-summary" className="sr-only">
        CV summary packet (from distillation)
      </Label>
      <Textarea
        id="cv-summary"
        value={cvSummary}
        onChange={(e) => onCvSummaryChange(e.target.value)}
        rows={3}
        className="w-full bg-surface-0 border border-border-subtle rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60"
      />

      <div className="mt-2 text-[10px] text-ink-faint">
        Used by X cycles, Quick Target analysis, and prep. Edit anytime — independent of search state.
      </div>
    </div>
  )
}

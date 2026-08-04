/** Fit evaluation mode for Discover analyze (strict dual-fit vs relaxed simple fitness). */

export const FIT_MODES = ['strict', 'relaxed'] as const
export type FitMode = (typeof FIT_MODES)[number]

export const DEFAULT_FIT_MODE: FitMode = 'strict'

export function parseFitMode(raw: string | null | undefined): FitMode {
  const t = (raw ?? '').trim().toLowerCase()
  if (t === 'relaxed') return 'relaxed'
  return 'strict'
}

export function isRelaxedFitMode(mode: FitMode | string | null | undefined): boolean {
  return parseFitMode(mode ?? undefined) === 'relaxed'
}

/** Whether Generate prep should be available after a successful evaluate. */
export function canRequestPrepBundle(opts: {
  fitMode: FitMode | string | null | undefined
  overall?: number | null
  candidateToRole?: number | null
}): boolean {
  const overall = opts.overall ?? 0
  if (isRelaxedFitMode(opts.fitMode)) {
    // Simple fitness path: one score opens prep (no dual-fit You↔Role gate).
    return overall >= 45
  }
  // Strict dual-fit: mutual overall (existing gate).
  return overall >= 45
}

export function fitModeLabel(mode: FitMode): string {
  return mode === 'relaxed' ? 'Relaxed match' : 'Strict dual-fit'
}

export function fitModeDescription(mode: FitMode): string {
  return mode === 'relaxed'
    ? 'Simple fitness from relevant CV experience → then prepare bundle. No mission/robotics dual-fit.'
    : 'Mutual fit: hireability + life/mission/comp constraints (physical-world ML, SpaceXAI-tier, etc.).'
}

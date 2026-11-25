import { isPlausibleCvPacket } from './cv-packet.ts'

export type CvCycleSource = 'user-edited' | 'distilled-default' | 'empty' | 'corrupt'

export type CvCycleContext = {
  source: CvCycleSource
  sourceLabel: string
  cycleChars: number
  preview: string
  plausible: boolean
}

/**
 * Describe what the Xplore autonomous cycle will send over IPC (`model.cvSummary` as-is).
 * Distinct from Evaluate's `cvSummaryForIpc` — cycle always transmits the textarea value.
 */
export function describeCvCycleContext(
  cvSummary: string,
  options: { distilledDefault: string; userEdited: boolean },
): CvCycleContext {
  const trimmed = cvSummary.trim()
  const cycleChars = cvSummary.length
  const plausible = isPlausibleCvPacket(cvSummary)
  const preview =
    trimmed.split('\n').find((l) => l.trim())?.trim() || 'Empty packet'

  if (!trimmed) {
    return {
      source: 'empty',
      sourceLabel: 'Empty — cycle sends blank CV string',
      cycleChars,
      preview,
      plausible: false,
    }
  }

  if (!plausible) {
    return {
      source: 'corrupt',
      sourceLabel: 'Corrupt packet — reset on Discover before cycling',
      cycleChars,
      preview,
      plausible: false,
    }
  }

  const isDistilledOnly =
    options.userEdited !== true && trimmed === options.distilledDefault.trim()

  if (isDistilledOnly) {
    return {
      source: 'distilled-default',
      sourceLabel: 'Distilled default (bundled) — packs/devprofile still apply on Evaluate',
      cycleChars,
      preview,
      plausible: true,
    }
  }

  return {
    source: 'user-edited',
    sourceLabel: 'User-edited textarea — sent verbatim to cycle',
    cycleChars,
    preview,
    plausible: true,
  }
}

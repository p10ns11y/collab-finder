export type DiscoverChromeIntent = 'auto' | 'setup-open' | 'evaluate'

export type DiscoverChrome =
  | { kind: 'idle'; setup: 'open'; evaluate: boolean }
  | { kind: 'reading'; setup: 'open' | 'folded'; evaluate: boolean }

/**
 * Fit (evaluate outcome) docks left. Control widgets sit on the right and smart-fold.
 * QuickTarget (evaluate) is a Quest-like overlay from the sticky FAB.
 */
export function resolveDiscoverChrome(input: {
  hasResult: boolean
  intent: DiscoverChromeIntent
}): DiscoverChrome {
  const evaluate = input.intent === 'evaluate'
  if (!input.hasResult) {
    return { kind: 'idle', setup: 'open', evaluate }
  }
  switch (input.intent) {
    case 'auto':
      return { kind: 'reading', setup: 'folded', evaluate: false }
    case 'setup-open':
      return { kind: 'reading', setup: 'open', evaluate: false }
    case 'evaluate':
      return { kind: 'reading', setup: 'folded', evaluate: true }
    default: {
      const _exhaustive: never = input.intent
      return _exhaustive
    }
  }
}

export type DiscoverHydrateStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Only after hydrate leaves loading. Loading must not open Evaluate. */
export function discoverChromeIntentAfterHydrate(input: {
  status: DiscoverHydrateStatus
  hasEvaluateSeed: boolean
}): DiscoverChromeIntent {
  if (input.status === 'loading') return 'auto'
  if (input.status === 'ready' || input.status === 'failed') return 'auto'
  if (input.hasEvaluateSeed) return 'evaluate'
  return 'auto'
}

export function discoverChromeIntentAfterOppChange(input: {
  hasResult: boolean
  hasEvaluateSeed: boolean
}): DiscoverChromeIntent {
  return discoverChromeIntentAfterHydrate({
    status: input.hasResult ? 'ready' : 'idle',
    hasEvaluateSeed: input.hasEvaluateSeed,
  })
}

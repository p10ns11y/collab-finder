export type DiscoverChromeIntent = 'auto' | 'setup-open' | 'evaluate'

export type DiscoverChrome = {
  kind: 'idle' | 'reading'
  setup: 'open' | 'folded'
  evaluate: boolean
}

/**
 * Fit docks left. Setup stays folded until the operator asks.
 * Evaluate is the overlay from the sticky button.
 */
export function resolveDiscoverChrome(input: {
  hasResult: boolean
  intent: DiscoverChromeIntent
}): DiscoverChrome {
  const evaluate = input.intent === 'evaluate'
  const setup = input.intent === 'setup-open' ? 'open' : 'folded'
  return {
    kind: input.hasResult ? 'reading' : 'idle',
    setup,
    evaluate,
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

/**
 * Screen navigation — hash + cluster route helpers. Pure; no I/O except applyScreenHash.
 */
import type { FinderScreen } from '../finder/model'

const HASH_SCREENS: readonly FinderScreen[] = [
  'heading',
  'discover',
  'mission',
  'sweden',
  'stats',
  'history',
  'data',
  'lookup',
  'settings',
  'xplore',
  'network',
]

/** Presentation slug for the heading cockpit. Wire id stays `heading`. */
const HASH_SLUG_BY_SCREEN: Partial<Record<FinderScreen, string>> = {
  heading: 'navigating',
}

const SCREEN_BY_HASH_ALIAS: Record<string, FinderScreen> = {
  navigating: 'heading',
}

function isHashScreen(slug: string): slug is FinderScreen {
  return (HASH_SCREENS as readonly string[]).includes(slug)
}

export function screenFromHash(hash: string): FinderScreen | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const slug = raw.split('?')[0]?.trim().toLowerCase() ?? ''
  const aliased = SCREEN_BY_HASH_ALIAS[slug]
  if (aliased) return aliased
  if (isHashScreen(slug)) return slug
  return null
}

export function hashFromScreen(screen: FinderScreen): string {
  const slug = HASH_SLUG_BY_SCREEN[screen] ?? screen
  return `#${slug}`
}

/** Write `#navigating` (etc.) without adding history or firing hashchange. */
export function applyScreenHash(screen: FinderScreen): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  const next = hashFromScreen(screen)
  if (window.location.hash === next) return
  const url = `${window.location.pathname}${window.location.search}${next}`
  history.replaceState(null, '', url)
}

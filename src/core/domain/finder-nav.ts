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

function isHashScreen(s: string): s is FinderScreen {
  return (HASH_SCREENS as readonly string[]).includes(s)
}

export function screenFromHash(hash: string): FinderScreen | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const slug = raw.split('?')[0]?.trim().toLowerCase() ?? ''
  if (isHashScreen(slug)) return slug
  return null
}

export function hashFromScreen(screen: FinderScreen): string {
  return `#${screen}`
}

/** Write `#heading` (etc.) without adding history or firing hashchange. */
export function applyScreenHash(screen: FinderScreen): void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  const next = hashFromScreen(screen)
  if (window.location.hash === next) return
  const url = `${window.location.pathname}${window.location.search}${next}`
  history.replaceState(null, '', url)
}

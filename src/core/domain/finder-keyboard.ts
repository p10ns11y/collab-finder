/**
 * Pure keyboard → finder navigation helpers.
 * Used by React shell; testable without DOM.
 */
import type { FinderScreen } from '../finder/model'

/** Primary screens — digit shortcuts match SidebarNav order. */
export const SCREEN_BY_DIGIT: Readonly<Record<string, FinderScreen>> = {
  '1': 'heading',
  '2': 'discover',
  '3': 'pipeline',
  '4': 'mission',
  '5': 'sweden',
  '6': 'xplore',
  '7': 'network',
  '8': 'preferences',
  '9': 'settings',
}

export type ShellHotkey =
  | { kind: 'palette' }
  | { kind: 'quest' }
  | { kind: 'screen'; screen: FinderScreen }
  | { kind: 'none' }

/**
 * Resolve a keydown for the app shell when meta/ctrl is held.
 * Pure: does not read window or preventDefault.
 */
export function resolveShellHotkey(
  key: string,
  mods: { meta: boolean; ctrl: boolean },
): ShellHotkey {
  if (!mods.meta && !mods.ctrl) return { kind: 'none' }
  const lower = key.length === 1 ? key.toLowerCase() : key
  if (lower === 'k') return { kind: 'palette' }
  if (lower === 'j') return { kind: 'quest' }
  const screen = SCREEN_BY_DIGIT[key]
  if (screen) return { kind: 'screen', screen }
  return { kind: 'none' }
}

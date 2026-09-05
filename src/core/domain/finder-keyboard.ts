/**
 * Pure keyboard → finder navigation helpers.
 * Used by React shell; testable without DOM.
 */
import type { FinderScreen } from '../finder/model'
import { SIDEBAR_SCREENS } from './finder-nav'

/** Primary screens — digit shortcuts match sidebar order (SIDEBAR_SCREENS). */
export const SCREEN_BY_DIGIT: Readonly<Record<string, FinderScreen>> = Object.fromEntries(
  SIDEBAR_SCREENS.map((screen, index) => [String(index + 1), screen]),
)

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

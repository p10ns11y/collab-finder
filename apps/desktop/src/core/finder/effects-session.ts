import { SESSION_LS_KEY, type PersistedSession } from './model'

export function readPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function persistSessionToLocal(partial: Partial<PersistedSession>) {
  try {
    const prev = readPersistedSession() || {}
    const next: PersistedSession = { ...prev, ...partial }
    localStorage.setItem(SESSION_LS_KEY, JSON.stringify(next))
  } catch {
    console.warn('[finder] persistSessionToLocal failed')
    /* ignore */
  }
}

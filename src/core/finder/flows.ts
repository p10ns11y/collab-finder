import type { FinderModel } from './model'

/** UX flow states — derived, never stored separately (single source of truth). */

export type ConnectionFlow =
  | 'checking'
  | 'disconnected'
  | 'connected'
  | 'saving'
  | 'clearing'

export type SearchFlow = 'idle' | 'blocked' | 'loading' | 'ready' | 'failed'

export function deriveConnectionFlow(model: FinderModel): ConnectionFlow {
  const { credentials } = model
  if (credentials.checking) return 'checking'
  if (credentials.busy && !credentials.connected) return 'saving'
  if (credentials.busy && credentials.connected) return 'clearing'
  return credentials.connected ? 'connected' : 'disconnected'
}

export function deriveSearchFlow(model: FinderModel): SearchFlow {
  if (!model.credentials.connected) return 'blocked'
  if (model.search.status === 'loading') return 'loading'
  if (model.search.status === 'ready') return 'ready'
  if (model.search.status === 'failed') return 'failed'
  return 'idle'
}

export function canSearch(model: FinderModel): boolean {
  return deriveSearchFlow(model) !== 'blocked' && model.search.status !== 'loading'
}

export function canRunCycle(model: FinderModel): boolean {
  return model.credentials.connected && model.cycle.status !== 'loading'
}
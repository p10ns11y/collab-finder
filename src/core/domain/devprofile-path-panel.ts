/**
 * Pure state machine for Settings → devprofile path panel.
 * Isolated local async form (Tauri path config) — not finder MVU domain.
 */

export type DevprofilePanelStatus = 'idle' | 'loading' | 'saving' | 'clearing'

export type DevprofilePanelState = {
  draft: string
  configuredPath: string | null
  status: DevprofilePanelStatus
  notice: string | null
}

export type DevprofilePanelAction =
  | { type: 'SET_DRAFT'; draft: string }
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; path: string | null }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS'; path: string }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'CLEAR_START' }
  | { type: 'CLEAR_SUCCESS' }
  | { type: 'CLEAR_ERROR'; message: string }
  | { type: 'CLEAR_NOTICE' }

export const initialDevprofilePanelState: DevprofilePanelState = {
  draft: '',
  configuredPath: null,
  status: 'idle',
  notice: null,
}

export function devprofilePanelReducer(
  state: DevprofilePanelState,
  action: DevprofilePanelAction,
): DevprofilePanelState {
  switch (action.type) {
    case 'SET_DRAFT':
      return { ...state, draft: action.draft }
    case 'LOAD_START':
      return { ...state, status: 'loading', notice: null }
    case 'LOAD_SUCCESS':
      return {
        ...state,
        status: 'idle',
        configuredPath: action.path,
      }
    case 'SAVE_START':
      return { ...state, status: 'saving', notice: null }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        status: 'idle',
        draft: '',
        configuredPath: action.path,
        notice: 'Saved. Used by analyze/prep and Xplore promote (no restart required).',
      }
    case 'SAVE_ERROR':
      return { ...state, status: 'idle', notice: action.message }
    case 'CLEAR_START':
      return { ...state, status: 'clearing', notice: null }
    case 'CLEAR_SUCCESS':
      return {
        ...state,
        status: 'idle',
        configuredPath: null,
        notice: null,
      }
    case 'CLEAR_ERROR':
      return { ...state, status: 'idle', notice: action.message }
    case 'CLEAR_NOTICE':
      return { ...state, notice: null }
    default:
      return state
  }
}

/** Derive busy flag — not stored separately. */
export function isDevprofilePanelBusy(status: DevprofilePanelStatus): boolean {
  return status !== 'idle'
}

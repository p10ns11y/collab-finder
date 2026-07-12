/**
 * Pure state machine for Settings → xAI key/model panel.
 * Isolated local async form (Tauri secrets) — not finder MVU domain.
 */
import type { BearerStorageStatus } from './credentials'

/** Same shape as bearer storage for UI reuse. */
export type XaiKeyStatus = BearerStorageStatus

export type XaiPanelStatus = 'idle' | 'loading' | 'saving-key' | 'clearing-key' | 'saving-model'

export type XaiPanelState = {
  keyStatus: XaiKeyStatus | null
  model: string
  keyDraft: string
  modelDraft: string
  panelStatus: XaiPanelStatus
  notice: string | null
}

export type XaiPanelAction =
  | { type: 'LOAD_START' }
  | { type: 'KEY_LOADED'; value: XaiKeyStatus | null }
  | { type: 'MODEL_LOADED'; value: string }
  | { type: 'SET_KEY_DRAFT'; draft: string }
  | { type: 'SET_MODEL_DRAFT'; draft: string }
  | { type: 'SAVE_KEY_START' }
  | { type: 'SAVE_KEY_SUCCESS' }
  | { type: 'CLEAR_KEY_START' }
  | { type: 'CLEAR_KEY_SUCCESS' }
  | { type: 'SAVE_MODEL_START' }
  | { type: 'SAVE_MODEL_SUCCESS'; value: string }
  | { type: 'OPERATION_ERROR'; message: string }
  | { type: 'CLEAR_NOTICE' }

export const initialXaiPanelState: XaiPanelState = {
  keyStatus: null,
  model: 'grok-4.5',
  keyDraft: '',
  modelDraft: 'grok-4.5',
  panelStatus: 'idle',
  notice: null,
}

export function xaiPanelReducer(state: XaiPanelState, action: XaiPanelAction): XaiPanelState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, panelStatus: 'loading', notice: null }

    case 'KEY_LOADED':
      return {
        ...state,
        keyStatus: action.value,
        panelStatus: state.panelStatus === 'loading' ? 'idle' : state.panelStatus,
      }

    case 'MODEL_LOADED':
      return {
        ...state,
        model: action.value || 'grok-4.5',
        modelDraft: action.value || 'grok-4.5',
        panelStatus: state.panelStatus === 'loading' ? 'idle' : state.panelStatus,
      }

    case 'SET_KEY_DRAFT':
      return { ...state, keyDraft: action.draft }

    case 'SET_MODEL_DRAFT':
      return { ...state, modelDraft: action.draft }

    case 'SAVE_KEY_START':
      return { ...state, panelStatus: 'saving-key', notice: null }

    case 'SAVE_KEY_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        keyDraft: '',
        notice: 'Saved. Key is not kept in React state after save.',
      }

    case 'CLEAR_KEY_START':
      return { ...state, panelStatus: 'clearing-key', notice: null }

    case 'CLEAR_KEY_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        keyDraft: '',
        notice: 'Disconnected. Analyze/prep will require a key again.',
      }

    case 'SAVE_MODEL_START':
      return { ...state, panelStatus: 'saving-model', notice: null }

    case 'SAVE_MODEL_SUCCESS':
      return {
        ...state,
        panelStatus: 'idle',
        model: action.value,
        modelDraft: action.value,
        notice: `Model set to ${action.value}. Used on next analyze/prep.`,
      }

    case 'OPERATION_ERROR':
      return { ...state, panelStatus: 'idle', notice: action.message }

    case 'CLEAR_NOTICE':
      return { ...state, notice: null }

    default:
      return state
  }
}

/** Derive flags during render — not stored as booleans. */
export function isXaiPanelBusy(status: XaiPanelStatus): boolean {
  return status !== 'idle'
}

export function isXaiPanelChecking(status: XaiPanelStatus): boolean {
  return status === 'loading'
}

export function displayXaiModel(model: string): string {
  return model || 'grok-4.5'
}

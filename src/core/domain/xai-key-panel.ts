/**
 * Settings → xAI key/model panel.
 * XState machine is the behavior; `xaiPanelReducer` is the pure step used by the view.
 * Isolated local async form (Tauri secrets) — not finder MVU domain.
 */
import { assign, createMachine, initialTransition, transition, type AnyMachineSnapshot } from 'xstate'
import type { BearerStorageStatus } from './credentials'

/** Same shape as bearer storage for UI reuse. */
export type XaiKeyStatus = BearerStorageStatus

export type XaiPanelStatus = 'idle' | 'loading' | 'saving-key' | 'clearing-key' | 'saving-model'

export type XaiPanelContext = {
  keyStatus: XaiKeyStatus | null
  model: string
  keyDraft: string
  modelDraft: string
  notice: string | null
}

export type XaiPanelState = XaiPanelContext & {
  panelStatus: XaiPanelStatus
}

export type XaiPanelAction =
  | { type: 'LOAD_START' }
  | { type: 'KEY_LOADED'; value: XaiKeyStatus | null }
  | { type: 'MODEL_LOADED'; value: string }
  | { type: 'SET_KEY_DRAFT'; draft: string }
  | { type: 'SET_MODEL_DRAFT'; draft: string }
  | { type: 'SAVE_KEY_START' }
  | { type: 'CLEAR_KEY_START' }
  | { type: 'SAVE_MODEL_START' }
  | { type: 'SAVE_KEY_SUCCESS' }
  | { type: 'CLEAR_KEY_SUCCESS' }
  | { type: 'SAVE_MODEL_SUCCESS'; value: string }
  | { type: 'OPERATION_ERROR'; message: string }
  | { type: 'CLEAR_NOTICE' }

export const DEFAULT_XAI_MODEL = 'grok-4.6'

const SAVED_KEY_NOTICE = 'Saved. Key is not kept in React state after save.'
const CLEARED_KEY_NOTICE = 'Disconnected. Analyze/prep will require a key again.'

function modelOrDefault(value: string): string {
  return value || DEFAULT_XAI_MODEL
}

function modelSavedNotice(value: string): string {
  return `Model set to ${value}. Used on next analyze/prep.`
}

export const xaiPanelMachine = createMachine({
  id: 'xaiPanel',
  initial: 'idle',
  types: {} as {
    context: XaiPanelContext
    events: XaiPanelAction
  },
  context: {
    keyStatus: null,
    model: DEFAULT_XAI_MODEL,
    keyDraft: '',
    modelDraft: DEFAULT_XAI_MODEL,
    notice: null,
  },
  on: {
    SET_KEY_DRAFT: {
      actions: assign({
        keyDraft: ({ event }) => event.draft,
      }),
    },
    SET_MODEL_DRAFT: {
      actions: assign({
        modelDraft: ({ event }) => event.draft,
      }),
    },
    CLEAR_NOTICE: {
      actions: assign({
        notice: () => null,
      }),
    },
    KEY_LOADED: {
      actions: assign({
        keyStatus: ({ event }) => event.value,
      }),
    },
    MODEL_LOADED: {
      actions: assign({
        model: ({ event }) => modelOrDefault(event.value),
        modelDraft: ({ event }) => modelOrDefault(event.value),
      }),
    },
    LOAD_START: {
      target: '.loading',
      actions: assign({ notice: () => null }),
    },
    SAVE_KEY_START: {
      target: '.saving-key',
      actions: assign({ notice: () => null }),
    },
    CLEAR_KEY_START: {
      target: '.clearing-key',
      actions: assign({ notice: () => null }),
    },
    SAVE_MODEL_START: {
      target: '.saving-model',
      actions: assign({ notice: () => null }),
    },
    SAVE_KEY_SUCCESS: {
      target: '.idle',
      actions: assign({
        keyDraft: () => '',
        notice: () => SAVED_KEY_NOTICE,
      }),
    },
    CLEAR_KEY_SUCCESS: {
      target: '.idle',
      actions: assign({
        keyDraft: () => '',
        notice: () => CLEARED_KEY_NOTICE,
      }),
    },
    SAVE_MODEL_SUCCESS: {
      target: '.idle',
      actions: assign({
        model: ({ event }) => event.value,
        modelDraft: ({ event }) => event.value,
        notice: ({ event }) => modelSavedNotice(event.value),
      }),
    },
    OPERATION_ERROR: {
      target: '.idle',
      actions: assign({
        notice: ({ event }) => event.message,
      }),
    },
  },
  states: {
    idle: {},
    loading: {
      on: {
        KEY_LOADED: {
          target: 'idle',
          actions: assign({
            keyStatus: ({ event }) => event.value,
          }),
        },
        MODEL_LOADED: {
          target: 'idle',
          actions: assign({
            model: ({ event }) => modelOrDefault(event.value),
            modelDraft: ({ event }) => modelOrDefault(event.value),
          }),
        },
      },
    },
    'saving-key': {},
    'clearing-key': {},
    'saving-model': {},
  },
})

const PANEL_STATUSES: readonly XaiPanelStatus[] = [
  'idle',
  'loading',
  'saving-key',
  'clearing-key',
  'saving-model',
]

function isPanelStatus(value: unknown): value is XaiPanelStatus {
  return (PANEL_STATUSES as readonly string[]).includes(value as string)
}

export function snapshotToPanelState(snapshot: AnyMachineSnapshot): XaiPanelState {
  if (!isPanelStatus(snapshot.value)) {
    throw new Error('xAI panel snapshot must be a leaf status')
  }
  const context = snapshot.context as XaiPanelContext
  return {
    keyStatus: context.keyStatus,
    model: context.model,
    keyDraft: context.keyDraft,
    modelDraft: context.modelDraft,
    notice: context.notice,
    panelStatus: snapshot.value,
  }
}

const [initialSnapshot] = initialTransition(xaiPanelMachine)

export const initialXaiPanelState: XaiPanelState = snapshotToPanelState(initialSnapshot)

export function xaiPanelReducer(state: XaiPanelState, action: XaiPanelAction): XaiPanelState {
  const snapshot = xaiPanelMachine.resolveState({
    value: state.panelStatus,
    context: {
      keyStatus: state.keyStatus,
      model: state.model,
      keyDraft: state.keyDraft,
      modelDraft: state.modelDraft,
      notice: state.notice,
    },
  })
  const [next] = transition(xaiPanelMachine, snapshot, action)
  return snapshotToPanelState(next)
}

/** Derive flags during render — not stored as booleans. */
export function isXaiPanelBusy(status: XaiPanelStatus): boolean {
  return status !== 'idle'
}

export function isXaiPanelChecking(status: XaiPanelStatus): boolean {
  return status === 'loading'
}

export function displayXaiModel(model: string): string {
  return model || DEFAULT_XAI_MODEL
}

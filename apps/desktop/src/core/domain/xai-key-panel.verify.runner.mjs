#!/usr/bin/env node
/**
 * Generative coverage for the xAI panel machine.
 * Paths come from @xstate/graph (shortest + simple). Assertions are per state
 * and per event, so new states or transitions extend the suite without a
 * hand-written case per path.
 */
import { createTestModel } from '@xstate/graph'
import { xaiKeyFormBase, parseXaiModelField, parseXaiSettingsForm } from './xai-key-form.ts'
import {
  DEFAULT_XAI_MODEL,
  displayXaiModel,
  initialXaiPanelState,
  isXaiPanelBusy,
  isXaiPanelChecking,
  snapshotToPanelState,
  xaiPanelMachine,
  xaiPanelReducer,
} from './xai-key-panel.ts'

const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

const sampleStatus = {
  connected: true,
  active_source: 'keyring',
  file: {
    present: false,
    path: '',
    encrypted: false,
    permissions: '',
    why_not_encrypted: null,
  },
  keyring: {
    present: true,
    service: 'collab-finder',
    user: 'xai-key',
    reachable: true,
    error: null,
  },
}

const planEvents = [
  { type: 'LOAD_START' },
  { type: 'KEY_LOADED', value: sampleStatus },
  { type: 'MODEL_LOADED', value: 'grok-4.3' },
  { type: 'SET_KEY_DRAFT', draft: 'draft-key' },
  { type: 'SET_MODEL_DRAFT', draft: 'grok-4.5' },
  { type: 'SAVE_KEY_START' },
  { type: 'SAVE_KEY_SUCCESS' },
  { type: 'CLEAR_KEY_START' },
  { type: 'CLEAR_KEY_SUCCESS' },
  { type: 'SAVE_MODEL_START' },
  { type: 'SAVE_MODEL_SUCCESS', value: 'grok-4.5' },
  { type: 'OPERATION_ERROR', message: 'nope' },
  { type: 'CLEAR_NOTICE' },
]

const testModel = createTestModel(xaiPanelMachine, { events: planEvents })

const shortest = testModel.getShortestPaths()
const simple = testModel.getSimplePaths({
  serializeState: (snapshot) => JSON.stringify(snapshot.value),
})

const stateChecks = {
  idle(state) {
    must(state.value === 'idle', 'idle value')
    must(!isXaiPanelBusy(state.value), 'idle is not busy')
    must(!isXaiPanelChecking(state.value), 'idle is not checking')
  },
  loading(state) {
    must(isXaiPanelChecking(state.value), 'loading checks')
    must(isXaiPanelBusy(state.value), 'loading is busy')
    must(state.context.notice === null, 'loading clears notice')
  },
  'saving-key'(state) {
    must(state.value === 'saving-key', 'saving-key value')
    must(isXaiPanelBusy(state.value), 'saving-key is busy')
    must(state.context.notice === null, 'saving-key clears notice')
  },
  'clearing-key'(state) {
    must(state.value === 'clearing-key', 'clearing-key value')
    must(isXaiPanelBusy(state.value), 'clearing-key is busy')
    must(state.context.notice === null, 'clearing-key clears notice')
  },
  'saving-model'(state) {
    must(state.value === 'saving-model', 'saving-model value')
    must(isXaiPanelBusy(state.value), 'saving-model is busy')
    must(state.context.notice === null, 'saving-model clears notice')
  },
}

const eventChecks = {
  LOAD_START({ state }) {
    must(state.value === 'loading', 'LOAD_START → loading')
    must(state.context.notice === null, 'LOAD_START clears notice')
  },
  KEY_LOADED({ state, event }) {
    must(state.context.keyStatus === event.value, 'KEY_LOADED stores status')
    must(state.value !== 'loading', 'KEY_LOADED leaves loading')
  },
  MODEL_LOADED({ state, event }) {
    const expected = event.value || DEFAULT_XAI_MODEL
    must(state.context.model === expected, 'MODEL_LOADED model')
    must(state.context.modelDraft === expected, 'MODEL_LOADED draft')
    must(displayXaiModel(state.context.model) === expected, 'display model')
    must(state.value !== 'loading', 'MODEL_LOADED leaves loading')
  },
  SET_KEY_DRAFT({ state, event }) {
    must(state.context.keyDraft === event.draft, 'SET_KEY_DRAFT')
  },
  SET_MODEL_DRAFT({ state, event }) {
    must(state.context.modelDraft === event.draft, 'SET_MODEL_DRAFT')
  },
  SAVE_KEY_START({ state }) {
    must(state.value === 'saving-key', 'SAVE_KEY_START')
    must(state.context.notice === null, 'SAVE_KEY_START clears notice')
  },
  SAVE_KEY_SUCCESS({ state }) {
    must(state.value === 'idle', 'SAVE_KEY_SUCCESS idle')
    must(state.context.keyDraft === '', 'SAVE_KEY_SUCCESS clears draft')
    must(
      state.context.notice === 'Saved. Key is not kept in React state after save.',
      'SAVE_KEY_SUCCESS notice',
    )
  },
  CLEAR_KEY_START({ state }) {
    must(state.value === 'clearing-key', 'CLEAR_KEY_START')
    must(state.context.notice === null, 'CLEAR_KEY_START clears notice')
  },
  CLEAR_KEY_SUCCESS({ state }) {
    must(state.value === 'idle', 'CLEAR_KEY_SUCCESS idle')
    must(state.context.keyDraft === '', 'CLEAR_KEY_SUCCESS clears draft')
    must(
      state.context.notice === 'Disconnected. Analyze/prep will require a key again.',
      'CLEAR_KEY_SUCCESS notice',
    )
  },
  SAVE_MODEL_START({ state }) {
    must(state.value === 'saving-model', 'SAVE_MODEL_START')
    must(state.context.notice === null, 'SAVE_MODEL_START clears notice')
  },
  SAVE_MODEL_SUCCESS({ state, event }) {
    must(state.value === 'idle', 'SAVE_MODEL_SUCCESS idle')
    must(state.context.model === event.value, 'SAVE_MODEL_SUCCESS model')
    must(state.context.modelDraft === event.value, 'SAVE_MODEL_SUCCESS draft')
    must(
      state.context.notice === `Model set to ${event.value}. Used on next analyze/prep.`,
      'SAVE_MODEL_SUCCESS notice',
    )
  },
  OPERATION_ERROR({ state, event }) {
    must(state.value === 'idle', 'OPERATION_ERROR idle')
    must(state.context.notice === event.message, 'OPERATION_ERROR notice')
  },
  CLEAR_NOTICE({ state }) {
    must(state.context.notice === null, 'CLEAR_NOTICE')
  },
}

const paths = [...shortest, ...simple]
for (const path of paths) {
  await path.test({ states: stateChecks, events: eventChecks })
}

const reached = new Set()
for (const path of shortest) {
  for (const key of Object.keys(stateChecks)) {
    if (path.state.matches(key)) reached.add(key)
  }
}
must(reached.size === Object.keys(stateChecks).length, `shortest paths reach every status (${[...reached].join(',')})`)
must(shortest.length >= Object.keys(stateChecks).length, 'shortest path count grows with states')
must(
  simple.length > Object.keys(stateChecks).length,
  'simple paths walk multi-status sequences, not one hop per state',
)

const seenEvents = new Set()
for (const node of Object.values(testModel.getAdjacencyMap())) {
  for (const edge of Object.values(node.transitions)) {
    seenEvents.add(edge.event.type)
  }
}
must(seenEvents.size === planEvents.length, `adjacency covers every planned event (${seenEvents.size})`)

must(initialXaiPanelState.panelStatus === 'idle', 'initial idle')
must(initialXaiPanelState.model === 'grok-4.6', 'initial model literal')
must(DEFAULT_XAI_MODEL === 'grok-4.6', 'default model literal')
must(initialXaiPanelState.modelDraft === 'grok-4.6', 'initial model draft')
must(initialXaiPanelState.keyDraft === '', 'initial key draft empty')
must(initialXaiPanelState.keyStatus === null, 'initial key empty')
must(initialXaiPanelState.notice === null, 'initial notice')

const fromIdle = xaiPanelReducer(initialXaiPanelState, { type: 'KEY_LOADED', value: sampleStatus })
must(fromIdle.panelStatus === 'idle' && fromIdle.keyStatus?.connected === true, 'KEY_LOADED from idle stores status')

const drafted = xaiPanelReducer(initialXaiPanelState, { type: 'SET_KEY_DRAFT', draft: 'draft-key' })
must(drafted.keyDraft === 'draft-key' && drafted.panelStatus === 'idle', 'SET_KEY_DRAFT from idle')
const draftKept = xaiPanelReducer(drafted, { type: 'LOAD_START' })
must(draftKept.keyDraft === 'draft-key' && draftKept.panelStatus === 'loading', 'LOAD_START keeps the key draft')

const modeled = xaiPanelReducer(initialXaiPanelState, { type: 'MODEL_LOADED', value: 'grok-4.3' })
must(modeled.model === 'grok-4.3' && modeled.modelDraft === 'grok-4.3' && modeled.panelStatus === 'idle', 'MODEL_LOADED from idle')

const noticed = xaiPanelReducer(initialXaiPanelState, { type: 'OPERATION_ERROR', message: 'nope' })
must(noticed.notice === 'nope' && noticed.panelStatus === 'idle', 'OPERATION_ERROR from idle')
const cleared = xaiPanelReducer(noticed, { type: 'CLEAR_NOTICE' })
must(cleared.notice === null && cleared.panelStatus === 'idle', 'CLEAR_NOTICE drops the error')

const loading = xaiPanelReducer(initialXaiPanelState, { type: 'LOAD_START' })
must(loading.panelStatus === 'loading' && loading.notice === null, 'LOAD_START from idle')
const loadedWhileBusy = xaiPanelReducer(loading, { type: 'KEY_LOADED', value: sampleStatus })
must(loadedWhileBusy.panelStatus === 'idle' && loadedWhileBusy.keyStatus === sampleStatus, 'KEY_LOADED ends loading')
const modelWhileBusy = xaiPanelReducer(loading, { type: 'MODEL_LOADED', value: 'grok-4.3' })
must(modelWhileBusy.panelStatus === 'idle' && modelWhileBusy.model === 'grok-4.3', 'MODEL_LOADED ends loading')

const savingKey = xaiPanelReducer(fromIdle, { type: 'SAVE_KEY_START' })
must(savingKey.panelStatus === 'saving-key', 'SAVE_KEY_START')
const keyDuringSave = xaiPanelReducer(savingKey, { type: 'KEY_LOADED', value: null })
must(keyDuringSave.panelStatus === 'saving-key' && keyDuringSave.keyStatus === null, 'KEY_LOADED stays in saving-key')

const clearing = xaiPanelReducer(fromIdle, { type: 'CLEAR_KEY_START' })
must(clearing.panelStatus === 'clearing-key', 'CLEAR_KEY_START')
const savingModel = xaiPanelReducer(fromIdle, { type: 'SAVE_MODEL_START' })
must(savingModel.panelStatus === 'saving-model', 'SAVE_MODEL_START')

const blankModel = xaiPanelReducer(initialXaiPanelState, { type: 'MODEL_LOADED', value: '' })
must(blankModel.model === 'grok-4.6', 'blank model falls back')
must(blankModel.modelDraft === 'grok-4.6', 'blank model draft falls back')
must(blankModel.panelStatus === 'idle', 'blank model load stays idle')

let rejected = false
try {
  snapshotToPanelState({
    value: 'nope',
    context: {
      keyStatus: null,
      model: 'grok-4.6',
      keyDraft: '',
      modelDraft: 'grok-4.6',
      notice: null,
    },
  })
} catch (err) {
  rejected = true
  must(String(err.message).includes('leaf'), 'bad snapshot names a leaf status')
}
must(rejected, 'bad snapshot throws')

const baseEmpty = xaiKeyFormBase.safeParse({})
must(baseEmpty.success, 'base schema allows omitted key and model')

const settingsMissing = parseXaiSettingsForm({})
must(!settingsMissing.success, 'settings consumer rejects an empty form')
const settingsKeyOnly = parseXaiSettingsForm({ key: 'secret-looking-but-fixture' })
must(!settingsKeyOnly.success, 'settings consumer rejects a missing model')
const settingsOk = parseXaiSettingsForm({ key: '  local-key  ', model: ' grok-4.6 ' })
must(settingsOk.success, 'settings consumer accepts trimmed key and model')
if (settingsOk.success) {
  must(settingsOk.data.key === 'local-key', 'settings key is trimmed')
  must(settingsOk.data.model === 'grok-4.6', 'settings model is trimmed')
}

const modelOnly = parseXaiModelField('  grok-4.5 ')
must(modelOnly.success, 'model consumer accepts a model without a key')
const modelBlank = parseXaiModelField('   ')
must(!modelBlank.success, 'model consumer rejects blank model')

console.log('=== xai-key-panel.verify ===')
console.log(
  `paths: ${paths.length} (shortest ${shortest.length}, simple ${simple.length}); events ${seenEvents.size}`,
)
if (failures.length) {
  for (const failure of failures) console.error('FAIL', failure)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

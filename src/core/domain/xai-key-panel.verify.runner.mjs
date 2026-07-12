#!/usr/bin/env node
import {
  displayXaiModel,
  initialXaiPanelState,
  isXaiPanelBusy,
  isXaiPanelChecking,
  xaiPanelReducer,
} from './xai-key-panel.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
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

let s = initialXaiPanelState
must(s.panelStatus === 'idle', 'initial idle')
must(!isXaiPanelBusy(s.panelStatus), 'not busy')

s = xaiPanelReducer(s, { type: 'LOAD_START' })
must(isXaiPanelChecking(s.panelStatus), 'checking')
s = xaiPanelReducer(s, { type: 'KEY_LOADED', value: sampleStatus })
must(s.panelStatus === 'idle', 'idle after key load')
must(s.keyStatus?.connected === true, 'key connected')

s = xaiPanelReducer(s, { type: 'MODEL_LOADED', value: 'grok-4.3' })
must(s.model === 'grok-4.3', 'model loaded')
must(displayXaiModel(s.model) === 'grok-4.3', 'display model')

s = xaiPanelReducer(s, { type: 'SAVE_KEY_START' })
must(s.panelStatus === 'saving-key', 'saving-key')
must(isXaiPanelBusy(s.panelStatus), 'busy')
s = xaiPanelReducer(s, { type: 'SAVE_KEY_SUCCESS' })
must(s.keyDraft === '', 'draft cleared')
must(s.panelStatus === 'idle', 'idle after save')

s = xaiPanelReducer(s, { type: 'OPERATION_ERROR', message: 'nope' })
must(s.notice === 'nope' && s.panelStatus === 'idle', 'error path')

console.log('=== xai-key-panel.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

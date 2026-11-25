#!/usr/bin/env node
import {
  devprofilePanelReducer,
  initialDevprofilePanelState,
  isDevprofilePanelBusy,
} from './devprofile-path-panel.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

let s = initialDevprofilePanelState
must(s.status === 'idle', 'initial idle')
must(!isDevprofilePanelBusy(s.status), 'initial not busy')

s = devprofilePanelReducer(s, { type: 'SET_DRAFT', draft: '/tmp/devprofile' })
must(s.draft === '/tmp/devprofile', 'draft set')

s = devprofilePanelReducer(s, { type: 'SAVE_START' })
must(s.status === 'saving', 'saving')
must(isDevprofilePanelBusy(s.status), 'busy while saving')

s = devprofilePanelReducer(s, { type: 'SAVE_SUCCESS', path: '/tmp/devprofile' })
must(s.status === 'idle', 'idle after save')
must(s.draft === '', 'draft cleared on save')
must(s.configuredPath === '/tmp/devprofile', 'path stored')
must(!!s.notice && s.notice.includes('Saved'), 'success notice')

s = devprofilePanelReducer(s, { type: 'CLEAR_START' })
must(s.status === 'clearing', 'clearing')
s = devprofilePanelReducer(s, { type: 'CLEAR_SUCCESS' })
must(s.configuredPath === null, 'cleared path')
must(s.status === 'idle', 'idle after clear')

s = devprofilePanelReducer(s, { type: 'SAVE_START' })
s = devprofilePanelReducer(s, { type: 'SAVE_ERROR', message: 'boom' })
must(s.status === 'idle', 'idle after error')
must(s.notice === 'boom', 'error notice')

// Impossible dual state: never busy+idle conflict via separate booleans
must(!isDevprofilePanelBusy(s.status) || s.status !== 'idle', 'busy derives from status')

console.log('=== devprofile-path-panel.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
import { resolveShellHotkey, SCREEN_BY_DIGIT } from './finder-keyboard.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(SCREEN_BY_DIGIT['1'] === 'discover', 'digit 1 → discover')
must(SCREEN_BY_DIGIT['2'] === 'xplore', 'digit 2 → xplore')
must(SCREEN_BY_DIGIT['3'] === 'network', 'digit 3 → network')
must(SCREEN_BY_DIGIT['4'] === 'settings', 'digit 4 → settings')

const none = resolveShellHotkey('k', { meta: false, ctrl: false })
must(none.kind === 'none', 'no mod → none')

const palMeta = resolveShellHotkey('k', { meta: true, ctrl: false })
must(palMeta.kind === 'palette', 'meta+k → palette')
const palCtrl = resolveShellHotkey('K', { meta: false, ctrl: true })
must(palCtrl.kind === 'palette', 'ctrl+K → palette')

const scr = resolveShellHotkey('2', { meta: true, ctrl: false })
must(scr.kind === 'screen' && scr.screen === 'xplore', 'meta+2 → xplore')

const junk = resolveShellHotkey('9', { meta: true, ctrl: false })
must(junk.kind === 'none', 'meta+9 → none')

console.log('=== finder-keyboard.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

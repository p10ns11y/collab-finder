#!/usr/bin/env node
import { resolveShellHotkey, SCREEN_BY_DIGIT } from './finder-keyboard.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(SCREEN_BY_DIGIT['1'] === 'discover', 'digit 1 → discover')
must(SCREEN_BY_DIGIT['2'] === 'mission', 'digit 2 → mission')
must(SCREEN_BY_DIGIT['3'] === 'sweden', 'digit 3 → sweden')
must(SCREEN_BY_DIGIT['4'] === 'xplore', 'digit 4 → xplore')
must(SCREEN_BY_DIGIT['5'] === 'network', 'digit 5 → network')
must(SCREEN_BY_DIGIT['6'] === 'settings', 'digit 6 → settings')

const none = resolveShellHotkey('k', { meta: false, ctrl: false })
must(none.kind === 'none', 'no mod → none')

const palMeta = resolveShellHotkey('k', { meta: true, ctrl: false })
must(palMeta.kind === 'palette', 'meta+k → palette')
const palCtrl = resolveShellHotkey('K', { meta: false, ctrl: true })
must(palCtrl.kind === 'palette', 'ctrl+K → palette')
const quest = resolveShellHotkey('j', { meta: true, ctrl: false })
must(quest.kind === 'quest', 'meta+j → quest')

const scr = resolveShellHotkey('2', { meta: true, ctrl: false })
must(scr.kind === 'screen' && scr.screen === 'mission', 'meta+2 → mission')

const junk = resolveShellHotkey('9', { meta: true, ctrl: false })
must(junk.kind === 'none', 'meta+9 → none')

console.log('=== finder-keyboard.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

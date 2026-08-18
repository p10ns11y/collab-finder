#!/usr/bin/env node
import { resolveShellHotkey, SCREEN_BY_DIGIT } from './finder-keyboard.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(SCREEN_BY_DIGIT['1'] === 'heading', 'digit 1 → heading')
must(SCREEN_BY_DIGIT['2'] === 'discover', 'digit 2 → discover')
must(SCREEN_BY_DIGIT['3'] === 'mission', 'digit 3 → mission')
must(SCREEN_BY_DIGIT['4'] === 'sweden', 'digit 4 → sweden')
must(SCREEN_BY_DIGIT['5'] === 'xplore', 'digit 5 → xplore')
must(SCREEN_BY_DIGIT['6'] === 'network', 'digit 6 → network')
must(SCREEN_BY_DIGIT['7'] === 'settings', 'digit 7 → settings')

const none = resolveShellHotkey('k', { meta: false, ctrl: false })
must(none.kind === 'none', 'no mod → none')

const palMeta = resolveShellHotkey('k', { meta: true, ctrl: false })
must(palMeta.kind === 'palette', 'meta+k → palette')
const palCtrl = resolveShellHotkey('K', { meta: false, ctrl: true })
must(palCtrl.kind === 'palette', 'ctrl+K → palette')
const quest = resolveShellHotkey('j', { meta: true, ctrl: false })
must(quest.kind === 'quest', 'meta+j → quest')

const scr = resolveShellHotkey('3', { meta: true, ctrl: false })
must(scr.kind === 'screen' && scr.screen === 'mission', 'meta+3 → mission')
const heading = resolveShellHotkey('1', { meta: true, ctrl: false })
must(heading.kind === 'screen' && heading.screen === 'heading', 'meta+1 → heading')

const junk = resolveShellHotkey('9', { meta: true, ctrl: false })
must(junk.kind === 'none', 'meta+9 → none')

console.log('=== finder-keyboard.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
import { resolveShellHotkey, SCREEN_BY_DIGIT } from './finder-keyboard.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(SCREEN_BY_DIGIT['1'] === 'heading', 'digit 1 → heading')
must(SCREEN_BY_DIGIT['2'] === 'discover', 'digit 2 → discover')
must(SCREEN_BY_DIGIT['3'] === 'pipeline', 'digit 3 → pipeline')
must(SCREEN_BY_DIGIT['4'] === 'mission', 'digit 4 → mission')
must(SCREEN_BY_DIGIT['5'] === 'sweden', 'digit 5 → sweden')
must(SCREEN_BY_DIGIT['6'] === 'xplore', 'digit 6 → xplore')
must(SCREEN_BY_DIGIT['7'] === 'network', 'digit 7 → network')
must(SCREEN_BY_DIGIT['8'] === 'preferences', 'digit 8 → preferences')
must(SCREEN_BY_DIGIT['9'] === 'settings', 'digit 9 → settings')

const none = resolveShellHotkey('k', { meta: false, ctrl: false })
must(none.kind === 'none', 'no mod → none')

const palMeta = resolveShellHotkey('k', { meta: true, ctrl: false })
must(palMeta.kind === 'palette', 'meta+k → palette')
const palCtrl = resolveShellHotkey('K', { meta: false, ctrl: true })
must(palCtrl.kind === 'palette', 'ctrl+K → palette')
const quest = resolveShellHotkey('j', { meta: true, ctrl: false })
must(quest.kind === 'quest', 'meta+j → quest')

const scr = resolveShellHotkey('3', { meta: true, ctrl: false })
must(scr.kind === 'screen' && scr.screen === 'pipeline', 'meta+3 → pipeline')
const heading = resolveShellHotkey('1', { meta: true, ctrl: false })
must(heading.kind === 'screen' && heading.screen === 'heading', 'meta+1 → heading')
const mission = resolveShellHotkey('4', { meta: true, ctrl: false })
must(mission.kind === 'screen' && mission.screen === 'mission', 'meta+4 → mission')
const xplore = resolveShellHotkey('6', { meta: true, ctrl: false })
must(xplore.kind === 'screen' && xplore.screen === 'xplore', 'meta+6 → xplore')
const settings = resolveShellHotkey('9', { meta: true, ctrl: false })
must(settings.kind === 'screen' && settings.screen === 'settings', 'meta+9 → settings')

const junk = resolveShellHotkey('0', { meta: true, ctrl: false })
must(junk.kind === 'none', 'meta+0 → none')

console.log('=== finder-keyboard.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

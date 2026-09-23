#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFromScreen, isMountedShellScreen, screenFromHash } from './finder-nav.ts'

const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

must(screenFromHash('#heading') === 'heading', '#heading → heading')
must(screenFromHash('heading') === 'heading', 'heading → heading')
must(screenFromHash('#navigating') === 'heading', '#navigating → heading')
must(screenFromHash('#discover') === 'discover', '#discover → discover')
must(screenFromHash('#pipeline') === 'pipeline', '#pipeline → pipeline')
must(screenFromHash('pipeline') === 'pipeline', 'pipeline → pipeline')
must(screenFromHash('#mission') === 'mission', '#mission → mission')
must(screenFromHash('#xplore') === 'xplore', '#xplore → xplore')
must(screenFromHash('#nope') === null, '#nope → null')
must(hashFromScreen('heading') === '#navigating', 'heading → #navigating')
must(hashFromScreen('pipeline') === '#pipeline', 'pipeline → #pipeline')
must(hashFromScreen('xplore') === '#xplore', 'xplore → #xplore')
for (const dead of ['#stats', '#history', '#data', '#lookup', 'stats', 'history', 'data', 'lookup']) {
  must(screenFromHash(dead) === null, `${dead} is not a shell route`)
  must(!isMountedShellScreen(dead.replace('#', '')), `${dead} is not mounted`)
}

const here = dirname(fileURLToPath(import.meta.url))
const shell = readFileSync(join(here, '../../view/finder-app-view.tsx'), 'utf8')
for (const gone of ['HistoryScreen', 'DataScreen', 'StatsScreen', 'LookupScreen', 'guard-dashboard']) {
  must(!shell.includes(gone), `shell does not mount ${gone}`)
}

const updateSrc = readFileSync(join(here, '../finder/update.ts'), 'utf8')
must(
  updateSrc.includes('if (!isMountedShellScreen(msg.screen)) return [model]'),
  'ScreenChanged ignores unmounted ids',
)
const modelSrc = readFileSync(join(here, '../finder/model.ts'), 'utf8')
must(modelSrc.includes('isMountedShellScreen(s.activeScreen)'), 'session restore skips unmounted ids')
for (const dead of ["| 'stats'", "| 'history'", "| 'data'", "| 'lookup'"]) {
  must(!modelSrc.includes(dead), `FinderScreen dropped ${dead}`)
}

console.log('=== finder-nav.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

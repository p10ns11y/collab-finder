#!/usr/bin/env node
import { hashFromScreen, screenFromHash, SIDEBAR_SCREENS } from './finder-nav.ts'

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
must(screenFromHash('#nope') === null, '#nope → null')
must(hashFromScreen('heading') === '#navigating', 'heading → #navigating')
must(hashFromScreen('pipeline') === '#pipeline', 'pipeline → #pipeline')
must(
  SIDEBAR_SCREENS.includes('pipeline'),
  'SIDEBAR_SCREENS includes pipeline (hash + Meta+N source of truth)',
)
must(
  JSON.stringify([...SIDEBAR_SCREENS]) ===
    JSON.stringify([
      'heading',
      'discover',
      'pipeline',
      'mission',
      'sweden',
      'xplore',
      'network',
      'preferences',
      'settings',
    ]),
  'SIDEBAR_SCREENS order matches sidebar',
)

console.log('=== finder-nav.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
import { hashFromScreen, screenFromHash } from './finder-nav.ts'

const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

must(screenFromHash('#heading') === 'heading', '#heading → heading')
must(screenFromHash('heading') === 'heading', 'heading → heading')
must(screenFromHash('#navigating') === 'heading', '#navigating → heading')
must(screenFromHash('#discover') === 'discover', '#discover → discover')
must(screenFromHash('#nope') === null, '#nope → null')
must(hashFromScreen('heading') === '#navigating', 'heading → #navigating')

console.log('=== finder-nav.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

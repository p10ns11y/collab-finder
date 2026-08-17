#!/usr/bin/env node
import { hashFromScreen, screenFromHash } from './finder-nav.ts'

const failures = []
function must(c, m) {
  if (!c) failures.push(m)
}

must(screenFromHash('#heading') === 'heading', '#heading → heading')
must(screenFromHash('heading') === 'heading', 'heading → heading')
must(screenFromHash('#discover') === 'discover', '#discover → discover')
must(screenFromHash('#nope') === null, '#nope → null')
must(hashFromScreen('heading') === '#heading', 'heading → #heading')

console.log('=== finder-nav.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { resolveDiscoverChrome, discoverChromeIntentAfterOppChange } = await import(
  pathToFileURL(join(here, 'discover-chrome.ts')).href
)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

const intents = ['auto', 'setup-open', 'evaluate']

assert(typeof resolveDiscoverChrome === 'function', 'shipped resolveDiscoverChrome')
assert(typeof discoverChromeIntentAfterOppChange === 'function', 'shipped discoverChromeIntentAfterOppChange')

assert(
  eq(resolveDiscoverChrome({ hasResult: false, intent: 'auto' }), {
    kind: 'idle',
    setup: 'open',
    evaluate: false,
  }),
  'no result + auto -> idle setup open',
)
assert(
  eq(resolveDiscoverChrome({ hasResult: false, intent: 'evaluate' }), {
    kind: 'idle',
    setup: 'open',
    evaluate: true,
  }),
  'no result + evaluate -> idle with overlay',
)

assert(
  eq(resolveDiscoverChrome({ hasResult: true, intent: 'auto' }), {
    kind: 'reading',
    setup: 'folded',
    evaluate: false,
  }),
  'result + auto -> fit left, setup folded',
)
assert(
  eq(resolveDiscoverChrome({ hasResult: true, intent: 'setup-open' }), {
    kind: 'reading',
    setup: 'open',
    evaluate: false,
  }),
  'result + setup-open -> controls open on the right',
)
assert(
  eq(resolveDiscoverChrome({ hasResult: true, intent: 'evaluate' }), {
    kind: 'reading',
    setup: 'folded',
    evaluate: true,
  }),
  'result + evaluate -> overlay open',
)

assert(
  discoverChromeIntentAfterOppChange({ hasResult: false, hasEvaluateSeed: true }) === 'evaluate',
  'no fit + seeded URL/JD opens Evaluate',
)
assert(
  discoverChromeIntentAfterOppChange({ hasResult: true, hasEvaluateSeed: true }) === 'auto',
  'saved fit does not steal Evaluate overlay',
)
assert(
  discoverChromeIntentAfterOppChange({ hasResult: false, hasEvaluateSeed: false }) === 'auto',
  'empty Discover stays auto',
)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall discover-chrome checks passed (shipped module)')

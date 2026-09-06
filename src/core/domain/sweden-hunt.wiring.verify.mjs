#!/usr/bin/env node
/**
 * Static wiring gate for Sweden / Platsbanken hunt surface.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else console.log('ok:', msg)
}

const sweden = read('src/view/screens/sweden-screen.tsx')
const msg = read('src/core/finder/msg.ts')
const effects = read('src/core/finder/effects-hunt.ts')
const fitPane = read('src/components/finder/hunt-fit-pane.tsx')
const update = read('src/core/finder/update.ts')

assert(!msg.includes('PlatsbankenImportRequested'), 'no phantom Platsbanken Import dispatch')
assert(sweden.includes('PlatsbankenEvaluateRequested'), 'Sweden uses Evaluate')
assert(!sweden.includes('PlatsbankenImportRequested'), 'Sweden screen has no Import button dispatch')
assert(sweden.includes('huntFitVisibleForLeads'), 'fit pane gated by hunt list match not sidebar select')
assert(fitPane.includes('huntFitVisibleForLeads'), 'shared hunt fit helper exported')
assert(sweden.includes('prepareJobtechQuery'), 'Sweden blocks empty JobTech query in UI')
assert(update.includes('municipality-only search is blocked'), 'update refuses empty JobTech query')
assert(effects.includes('prepareJobtechQuery'), 'effects sanitize JobTech query')
assert(sweden.includes('auto-saves') || sweden.includes('auto-persist'), 'copy mentions auto-persist search')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall Sweden hunt wiring checks passed')

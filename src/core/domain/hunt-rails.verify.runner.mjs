#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const {
  jobtechSafeQuery,
  harvestKeysFromTexts,
  mergeHarvested,
  classifyKey,
  PLATSBANKEN_DEFAULT_QUERY,
  PLATSBANKEN_RAIL_CHIPS,
} = await import(pathToFileURL(join(here, 'hunt-rails.ts')).href)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(!PLATSBANKEN_DEFAULT_QUERY.includes('OR'), 'default query has no OR')
assert(PLATSBANKEN_RAIL_CHIPS.some((c) => c.q.toLowerCase().includes('intelligence architect')), 'intel architect chip')
assert(PLATSBANKEN_RAIL_CHIPS.some((c) => c.q.toLowerCase().includes('workflows')), 'workflows chip')

assert(jobtechSafeQuery('utvecklare OR engineer OR machine learning') === 'utvecklare engineer machine learning', 'strip OR')
assert(jobtechSafeQuery('senior -konsult "TypeScript"') === 'senior konsult TypeScript', 'strip quotes and minus')

const harvested = harvestKeysFromTexts([
  'Senior Fullstack Engineer (Stockholm, EU only)',
  'Fullstack Product Engineer',
  'Intelligence Architect',
  'Junior Merchandiser (Womenswear)',
  'Research Scientist, robotics',
])
assert(harvested.some((h) => h.key === 'senior fullstack'), 'harvest senior fullstack')
assert(harvested.some((h) => h.key === 'intelligence architect'), 'harvest intelligence architect')
assert(!harvested.some((h) => h.key.includes('research')), 'banned research scientist')
assert(!harvested.some((h) => h.key.includes('merchandiser')), 'banned merchandiser')

assert(classifyKey('AI workflows architect') === 'stretch', 'workflows is stretch')
assert(classifyKey('typescript') === 'honest', 'typescript is honest')

const merged = mergeHarvested(
  [{ key: 'senior fullstack', rail: 'honest', count: 1 }],
  [{ key: 'senior fullstack', rail: 'honest', count: 2 }],
  12,
)
assert(merged[0].count === 3, 'merge adds counts')

console.log('=== hunt-rails.verify ===')
if (failed) process.exit(1)
console.log('ALL CHECKS PASSED')

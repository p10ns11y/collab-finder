#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mod = await import(pathToFileURL(join(here, 'opportunity-pipeline.ts')).href)
const {
  normalizePipelineStatus,
  isActivePipelineStatus,
  filterOpportunitiesForRail,
  compareOpportunitiesForRail,
  pipelineStatusLabel,
} = mod

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else console.log('ok:', msg)
}

assert(normalizePipelineStatus('prepped') === 'prepped', 'normalize prepped')
assert(normalizePipelineStatus('applied') === 'applied', 'normalize applied')
assert(isActivePipelineStatus('analyzed'), 'analyzed is active')
assert(!isActivePipelineStatus('passed'), 'passed not active')
assert(pipelineStatusLabel('applied') === 'Applied', 'label applied')

const rows = [
  { id: 1, status: 'passed', fit_score: 90, title: 'A' },
  { id: 2, status: 'prepped', fit_score: 70, title: 'B greenhouse' },
  { id: 3, status: 'applied', fit_score: 80, source_url: 'https://x.com' },
]
const active = filterOpportunitiesForRail(rows, 'active', '')
assert(active.length === 1 && active[0].id === 2, 'active filter keeps prepped only')
const gh = filterOpportunitiesForRail(rows, 'all', 'greenhouse')
assert(gh.length === 1 && gh[0].id === 2, 'text filter')
const sorted = [...rows].sort(compareOpportunitiesForRail)
assert(sorted[0].id === 2, 'active sorts before closed')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall opportunity-pipeline checks passed')

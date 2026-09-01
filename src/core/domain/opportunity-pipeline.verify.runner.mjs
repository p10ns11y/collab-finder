#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mod = await import(pathToFileURL(join(here, 'opportunity-pipeline.ts')).href)
const {
  normalizePipelineStatus,
  isActivePipelineStatus,
  filterOpportunitiesForRail,
  filterOpportunitiesForPipelineView,
  compareOpportunitiesForRail,
  pipelineStatusLabel,
  isPipelineRelevant,
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

const missionNoise = [
  { id: 99, kind: 'mission_pull', status: 'new', fit_score: 100, title: 'Noise' },
  { id: 64, kind: 'mission_pull', status: 'new', fit_score: 105, title: 'Tesla', analysis_json: '{}' },
  { id: 2, kind: 'web', status: 'applied', fit_score: 80, title: 'Real' },
]
const pipelineAll = filterOpportunitiesForPipelineView(missionNoise, 'all')
assert(pipelineAll.length === 1 && pipelineAll[0].id === 2, 'pipeline hides mission_pull new')
assert(!isPipelineRelevant({ id: 531, kind: 'web', status: 'analyzed', fit_score: 0 }), 'fit 0 analyzed hidden')
const pipelineWaiting = filterOpportunitiesForPipelineView(
  [{ id: 1, kind: 'web', status: 'applied', outcome_status: 'waiting' }],
  'waiting',
)
assert(pipelineWaiting.length === 1, 'waiting filter')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall opportunity-pipeline checks passed')

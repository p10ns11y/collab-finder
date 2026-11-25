#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const mod = await import(pathToFileURL(join(here, 'apply-reply-lane.ts')).href)
const {
  classifyReplyLane,
  compareForReplyTracking,
  needsCompensatingFollowUp,
  replyWaitingHint,
  COMPENSATING_FOLLOWUP_DAYS,
} = mod

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else console.log('ok:', msg)
}

const now = new Date('2026-09-07T12:00:00Z')

assert(
  classifyReplyLane({ kind: 'platsbanken', source_url: 'https://arbetsformedlingen.se/x' }) === 'sweden',
  'platsbanken → sweden',
)
assert(
  classifyReplyLane({
    kind: 'mission_firm',
    source_url: 'https://boards.greenhouse.io/acme/jobs/1',
    notes: 'mission_firm:acme; source:greenhouse',
  }) === 'compensating',
  'greenhouse mission_firm → compensating',
)
assert(
  classifyReplyLane({
    kind: 'mission_pull',
    source_ref: 'ashby:board:123',
    source_url: 'https://jobs.ashbyhq.com/acme/123',
  }) === 'compensating',
  'mission_pull ashby ref → compensating',
)
assert(classifyReplyLane({ kind: 'web', source_url: 'https://example.com/jobs' }) === 'unknown', 'generic web → unknown')

const swedenWait = {
  id: 1,
  kind: 'platsbanken',
  status: 'applied',
  outcome_status: 'waiting',
  applied_at: '2026-08-01T10:00:00Z',
}
const compFresh = {
  id: 2,
  kind: 'mission_firm',
  status: 'applied',
  outcome_status: 'waiting',
  applied_at: '2026-09-06T10:00:00Z',
  source_url: 'https://boards.greenhouse.io/x/jobs/1',
}
const compStale = {
  id: 3,
  kind: 'mission_firm',
  status: 'applied',
  outcome_status: 'waiting',
  applied_at: '2026-09-04T10:00:00Z',
  source_url: 'https://jobs.lever.co/x/abc',
}

assert(!needsCompensatingFollowUp(swedenWait, COMPENSATING_FOLLOWUP_DAYS, now), 'sweden never follow-up flag')
assert(!needsCompensatingFollowUp(compFresh, COMPENSATING_FOLLOWUP_DAYS, now), 'compensating 1d not follow-up')
assert(needsCompensatingFollowUp(compStale, COMPENSATING_FOLLOWUP_DAYS, now), 'compensating 3d needs follow-up')

assert(
  replyWaitingHint(swedenWait, now)?.includes('silence is normal'),
  'sweden patient copy',
)
assert(
  replyWaitingHint(compStale, now)?.includes('check-in'),
  'compensating stale hint',
)

assert(compareForReplyTracking(compStale, swedenWait, now) < 0, 'stale compensating sorts before sweden')
assert(compareForReplyTracking(compStale, compFresh, now) < 0, 'stale compensating before fresh compensating')

const { filterFollowupOpportunities } = mod
const followupOnly = filterFollowupOpportunities([swedenWait, compFresh, compStale], now)
assert(followupOnly.length === 1 && followupOnly[0].id === 3, 'followup filter keeps stale compensating only')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall apply-reply-lane checks passed')

#!/usr/bin/env node
/**
 * Static wiring gate for Mission hunt cache-first flow.
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

const mission = read('src/view/screens/mission-screen.tsx')
const effects = read('src/core/finder/effects.ts')
const effectsHunt = read('src/core/finder/effects-hunt.ts')
const huntCmd = read('src-tauri/src/commands/hunt.rs')

assert(mission.includes('forceRefresh: false'), 'Mission idle hydrate uses cache-first')
assert(mission.includes('missionHasPullQueryKey'), 'Mission gates network Pull on query key')
assert(effectsHunt.includes('missionFirmsRefilterCmd'), 'refilter helper exported')
assert(effectsHunt.includes('missionFirmsListCachedCmd'), 'list cached command present')
assert(effects.includes('missionFirmsRefilterCmd'), 'effects imports refilter helper')
assert(
  effects.includes("msg.surface === 'mission' ? missionFirmsRefilterCmd"),
  'rail/harvest/preset changes re-filter Mission cache',
)
assert(
  !effects.includes('MissionFirmsSearchRequested\', forceRefresh: true'),
  'Next 10 advance does not force network Pull',
)
assert(
  effects.includes('msg.advanced ? missionFirmsRefilterCmd'),
  'Next 10 advance re-filters cache with new firm selection',
)
assert(
  huntCmd.includes('if filter.force_refresh') && huntCmd.includes('record_search_run'),
  'mission_pull DB writes gated on force_refresh',
)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall Mission hunt wiring checks passed')

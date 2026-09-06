#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')

const { maintainedFirmStatusLabel, maintainedFirmStatusTone } = await import(
  pathToFileURL(join(here, 'firm-durability.ts')).href
)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

for (const [status, label, tone] of [
  ['active', 'Active', 'success'],
  ['watch', 'Watch', 'warning'],
  ['pause', 'Pause', 'neutral'],
  ['excluded', 'Excluded', 'danger'],
]) {
  assert(maintainedFirmStatusLabel(status) === label, `${status} label`)
  assert(maintainedFirmStatusTone(status) === tone, `${status} tone`)
}

const uni = JSON.parse(
  readFileSync(join(root, 'data/durability/universe.v1.json'), 'utf8'),
)
assert(Array.isArray(uni.firms) && uni.firms.length >= 25, 'universe has >= 25 firms')
assert(typeof uni.algorithm_version === 'string' && uni.algorithm_version.length > 0, 'algorithm_version')
assert(typeof uni.scored_at === 'string' && uni.scored_at.length > 0, 'scored_at')

const volvo = uni.firms.find((f) => f.id === 'volvo_cars')
assert(volvo, 'volvo_cars in universe')
assert(volvo.hiring_signal === 1, 'volvo_cars hiring_signal')
assert(volvo.status === 'watch', 'volvo_cars status watch')
assert(
  String(volvo.note ?? '').includes('Stockholm'),
  'volvo_cars note mentions Stockholm',
)

const libRs = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8')
assert(libRs.includes('list_maintained_firms_cmd'), 'list_maintained_firms_cmd registered')

const panel = readFileSync(join(root, 'src/view/screens/preferences-panels.tsx'), 'utf8')
assert(panel.includes("'list_maintained_firms_cmd'"), 'Preferences invokes list_maintained_firms_cmd')
assert(panel.includes('MaintainedFirmListPanel'), 'MaintainedFirmListPanel exported')

const prefs = readFileSync(join(root, 'src/view/screens/preferences-screen.tsx'), 'utf8')
assert(prefs.includes('<MaintainedFirmListPanel'), 'Preferences screen mounts panel')

const cmds = readFileSync(join(root, 'docs/tauri-commands.md'), 'utf8')
assert(cmds.includes('list_maintained_firms_cmd'), 'tauri-commands documents IPC')

const rust = readFileSync(join(root, 'src-tauri/src/firm_durability.rs'), 'utf8')
assert(rust.includes('pnpm firm-list'), 'edit_hint cites pnpm firm-list')

console.log('=== firm-maintained-list.verify ===')
if (failed) process.exit(1)
console.log('ALL CHECKS PASSED')

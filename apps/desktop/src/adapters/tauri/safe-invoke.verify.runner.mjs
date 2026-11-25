#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { isTauri, webPreviewResult, DESKTOP_APP_NEEDED } = await import(
  pathToFileURL(join(here, 'web-preview.ts')).href
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

const adapterSrc = readFileSync(join(here, 'safe-invoke.ts'), 'utf8')
assert(adapterSrc.includes("from './web-preview'"), 'safeInvoke uses the shared web-preview helper')
assert(/if\s*\(\s*!isTauri\(\)\s*\)/.test(adapterSrc), 'safeInvoke checks isTauri() before invoke')
const invokeIdx = adapterSrc.indexOf('await invoke')
const guardIdx = adapterSrc.indexOf('if (!isTauri())')
assert(guardIdx >= 0 && invokeIdx > guardIdx, 'the runtime check is in front of invoke')
assert(!/fromPromise\(\s*invoke/.test(adapterSrc), 'invoke is not called as a bare argument that can throw early')

assert(isTauri() === false, 'isTauri() is false without a Tauri runtime')

const list = webPreviewResult('get_opportunities')
assert(list.ok === true, 'get_opportunities does not throw in a browser')
assert(Array.isArray(list.value) && list.value.length === 0, 'get_opportunities returns an empty list')

const stats = webPreviewResult('get_dashboard_stats')
assert(stats.ok === true, 'get_dashboard_stats does not throw in a browser')
assert(stats.value?.total_searches === 0, 'get_dashboard_stats returns empty counts')

const heading = webPreviewResult('read_heading_snapshot')
assert(heading.ok === true && heading.value?.mapJson === '', 'read_heading_snapshot returns an empty snapshot')

const write = webPreviewResult('set_x_bearer')
assert(write.ok === false, 'write commands do not pretend to succeed')
assert(write.error?.message === DESKTOP_APP_NEEDED, 'write commands explain that the desktop app is needed')

const analyze = webPreviewResult('analyze_opportunity_target')
assert(analyze.ok === false, 'analyze does not call a local engine from the browser')
assert(analyze.error?.message === DESKTOP_APP_NEEDED, 'analyze asks for the desktop app')

const bootCommands = [
  'get_search_history',
  'get_leads',
  'get_recent_pauses',
  'get_events',
  'get_pipeline_opportunities',
  'get_x_bearer_storage',
  'get_fit_mode_cmd',
  'get_xai_key_storage',
  'get_operator_pack_status',
  'get_llm_route_status',
  'get_rank_config',
  'get_cv_home_status',
  'list_mission_firm_registry',
  'get_hunt_rails',
  'read_cluster_route',
]
for (const command of bootCommands) {
  try {
    const res = webPreviewResult(command)
    assert(typeof res === 'object' && 'ok' in res, `${command} returns a Result`)
  } catch (cause) {
    assert(false, `${command} threw: ${cause}`)
  }
}

if (failed > 0) process.exit(1)
console.log('safe-invoke web preview: all checks passed')

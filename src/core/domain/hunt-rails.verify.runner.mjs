#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const {
  jobtechSafeQuery,
  prepareJobtechQuery,
  jobtechDroppedTokensMessage,
  harvestKeysFromTexts,
  mergeHarvested,
  classifyKey,
  PLATSBANKEN_DEFAULT_QUERY,
  PLATSBANKEN_RAIL_CHIPS,
  TRACK_A_HUNT_PRESETS,
  huntRailsFromUnknown,
  applyHuntPresetToModel,
  snapshotHuntPresetUndo,
  adIdFromSavedUrl,
  leadsFromSavedOpportunities,
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

const overlaid = huntRailsFromUnknown({
  missionQueryChips: [{ id: 'honest', rail: 'honest', label: 'From employment', q: 'senior typescript react' }],
  platsbankenRailChips: [{ id: 'honest', rail: 'honest', label: 'From employment', q: 'senior fullstack TypeScript' }],
})
assert(overlaid.missionQueryChips.length === 1 && overlaid.missionQueryChips[0].id === 'honest', 'pack overlay mission chips')
assert(overlaid.platsbankenRailChips.length === 1, 'pack overlay sweden chips')
const emptyOverlay = huntRailsFromUnknown({})
assert(emptyOverlay.missionQueryChips.length > 0, 'empty pack keeps mission fallbacks')
assert(emptyOverlay.platsbankenRailChips.length === PLATSBANKEN_RAIL_CHIPS.length, 'empty pack keeps sweden fallbacks')
assert(emptyOverlay.huntPresets.length === TRACK_A_HUNT_PRESETS.length, 'empty pack keeps hunt presets')

const withPresets = huntRailsFromUnknown({
  huntPresets: [{ id: 'custom', label: 'Custom', q: 'rust agent', rail: 'stretch' }],
})
assert(withPresets.huntPresets.length === 1 && withPresets.huntPresets[0].id === 'custom', 'pack overlay hunt presets')

const snap = snapshotHuntPresetUndo({
  missionFirmsQ: 'before',
  huntRail: 'honest',
  missionFirmsSelected: ['spacexai'],
  platsbankenQ: 'sweden before',
  platsbankenMunicipality: 'Stockholm',
})
const applied = applyHuntPresetToModel(
  {
    missionFirmsQ: 'before',
    huntRail: 'honest',
    missionFirmsSelected: [],
    platsbankenQ: 'sweden before',
    platsbankenMunicipality: 'Stockholm',
  },
  { id: 'track-a-kernel', label: 'Kernel', q: 'rust local-first', rail: 'stretch', firms: ['spacexai'] },
  'mission',
)
assert(applied.missionFirmsQ === 'rust local-first' && applied.huntRail === 'stretch', 'preset applies mission q + rail')
assert(applied.missionFirmsSelected.includes('spacexai'), 'preset applies firm hints')
assert(snap.missionFirmsQ === 'before', 'undo snapshot preserves prior q')

assert(jobtechSafeQuery('utvecklare OR engineer OR machine learning') === 'utvecklare engineer machine learning', 'strip OR')
assert(jobtechSafeQuery('senior -konsult "TypeScript"') === 'senior konsult TypeScript', 'strip quotes and minus')

const emptyPrep = prepareJobtechQuery('   ')
assert(emptyPrep.query === '' && emptyPrep.dropped.length === 0, 'empty raw query')
const orOnly = prepareJobtechQuery('OR and NOT')
assert(orOnly.query === '' && orOnly.dropped.length === 3, 'boolean-only query empties')
assert(
  jobtechDroppedTokensMessage(['OR', 'NOT']) === 'Removed from JobTech query: OR, NOT',
  'dropped token message',
)

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

assert(
  adIdFromSavedUrl('https://arbetsformedlingen.se/platsbanken/annonser/31192648', null) ===
    '31192648',
  'ad id from url',
)
const saved = leadsFromSavedOpportunities([
  {
    id: 9,
    kind: 'platsbanken',
    source_ref: '31192648',
    source_url: 'https://arbetsformedlingen.se/platsbanken/annonser/31192648',
    title: 'Senior Fullstack',
    company: 'Anyfin',
    jd_text: 'TS/React',
    notes: 'platsbanken search; municipality=Stockholm',
  },
  { id: 10, kind: 'web', jd_text: 'ignore' },
])
assert(saved.length === 1 && saved[0].already_in_db && saved[0].municipality === 'Stockholm', 'saved hydrate')

console.log('=== hunt-rails.verify ===')
if (failed) process.exit(1)
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
/**
 * Static wiring gate: Discover rail + fit panel bind external links to source_url /
 * resolved panel URL; CV reset + sanitize remain on the boot path.
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
  } else {
    console.log('ok:', msg)
  }
}

const discover = read('src/view/screens/discover-screen.tsx')
const panel = read('src/components/finder/opportunity-target-fit-panel.tsx')
const effects = read('src/core/finder/effects.ts')
const model = read('src/core/finder/model.ts')
const cvInput = read('src/components/finder/cv-summary-input.tsx')
const msg = read('src/core/finder/msg.ts')

// Rail: external link distinct from select
assert(discover.includes('normalizeOpportunityUrl'), 'discover imports URL normalize')
assert(discover.includes('ExternalLink'), 'discover uses ExternalLink icon')
assert(
  /href=\{href\}/.test(discover) || /href=\{href\}/.test(discover),
  'rail binds href',
)
assert(discover.includes("target=\"_blank\""), 'rail opens new tab')
assert(
  discover.includes('OpportunitySelected') && discover.includes('url: o.source_url'),
  'rail select passes source_url',
)
assert(
  discover.includes('historyOpportunities.find') &&
    discover.includes('source_url') &&
    discover.includes('opportunityTargetUrl'),
  'panel URL falls back to selected opp row',
)

// Fit panel: visible header link
assert(panel.includes('normalizeOpportunityUrl(sourceUrl)'), 'panel normalizes sourceUrl')
assert(panel.includes('externalHref'), 'panel has externalHref')
assert(panel.includes('Open URL'), 'panel Open URL action')
assert(/href=\{externalHref\}/.test(panel), 'panel href uses externalHref')

// History auto-select passes url
assert(
  effects.includes("type: 'OpportunitySelected'") &&
    effects.includes('match.source_url'),
  'HistoryRefreshed auto-select passes source_url',
)

// CV corruption path
assert(model.includes('sanitizeCvPacket'), 'model sanitizes CV on boot')
assert(model.includes('separate') || model.includes('*separate*'), 'model documents separate try/catch')
assert(effects.includes('sanitizeCvPacket') && effects.includes('isPlausibleCvPacket'), 'effects heal CV cache')
assert(effects.includes('resetCvToDefaultCmd') || effects.includes('CvSummaryResetToDefaultRequested'), 'reset effect wired')
assert(msg.includes('CvSummaryResetToDefaultRequested'), 'reset msg exists')
assert(cvInput.includes('onResetToDefault') || cvInput.includes('Reset to default'), 'UI reset control')
assert(discover.includes('CvSummaryResetToDefaultRequested'), 'Discover dispatches reset')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall discover-friction wiring checks passed')

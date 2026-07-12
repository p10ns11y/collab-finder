#!/usr/bin/env node
/**
 * Static wiring gate for full-product UX (Waves A–D).
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

const discover = read('src/view/screens/discover-screen.tsx')
const panel = read('src/components/finder/opportunity-target-fit-panel.tsx')
const app = read('src/app/finder-app.tsx')
const view = read('src/view/finder-app-view.tsx')
const header = read('src/components/layout/header.tsx')
const css = read('src/index.css')
const selectors = read('src/core/finder/selectors.ts')
const lib = read('src-tauri/src/lib.rs')
const cv = read('src/components/finder/cv-summary-input.tsx')
const settings = read('src/view/screens/settings-screen.tsx')
const decision = read('src/components/finder/decision-panel.tsx')

// IA honesty
assert(app.includes("'2': 'xplore'"), 'keyboard 2 = xplore')
assert(app.includes("'3': 'settings'"), 'keyboard 3 = settings')
assert(!app.includes("'2': 'stats'"), 'keyboard no longer maps to stats')
assert(!view.includes('Separate from devprofile'), 'footer manifesto removed')
assert(!discover.includes('Resume last'), 'Resume last deleted')

// φ layout
assert(css.includes('--pane-minor') && css.includes('--phi'), 'CSS φ tokens')
assert(discover.includes('--pane-minor') || discover.includes('pane-minor'), 'Discover uses minor pane')
assert(discover.includes('Your opportunities') || discover.includes('YOUR OPPORTUNITIES') || discover.includes('Your opportunities'), 'rail present')
assert(discover.includes('filterOpportunitiesForRail'), 'rail pipeline filter')
assert(discover.indexOf('Your opportunities') < discover.indexOf('CvSummaryInput') || discover.indexOf('YOUR') < discover.indexOf('CvSummary'), 'rail before CV preferred')

// Links
assert(discover.includes('normalizeOpportunityUrl') && discover.includes('ExternalLink'), 'rail external link')
assert(panel.includes('externalHref') && /href=\{externalHref\}/.test(panel), 'panel URL href')

// CV collapse
assert(cv.includes('aria-expanded') || cv.includes('setOpen'), 'CV collapsible')

// Header chips
assert(header.includes('xConnected') && header.includes('pauseCount'), 'header chips')

// Prep sections + copy
assert(panel.includes('PrepSection') || panel.includes('Copy all prep'), 'prep copy affordances')
assert(panel.includes('Cover letter'), 'sectioned cover letter')

// Pipeline
assert(lib.includes('update_opportunity_status_cmd'), 'status cmd registered')
assert(panel.includes('onStatusChange') || panel.includes('Applied'), 'status actions in panel')
assert(discover.includes('OpportunityStatusChangeRequested'), 'status dispatch from discover')

// Settings calm
assert(!settings.match(/details open/), 'settings details not force-open')
assert(settings.includes('About'), 'settings About')

// Xplore honesty
assert(decision.includes('heuristic'), 'cycle labeled heuristic')
assert(selectors.includes('heuristic'), 'palette cycle heuristic label')

// Palette noise reduced
assert(!selectors.includes('Refresh history dashboard'), 'palette history refresh removed')
assert(!selectors.includes('Clear lookup results'), 'palette lookup clear removed')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall full-product wiring checks passed')

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
const pipeline = read('src/view/screens/pipeline-screen.tsx')
const effects = read('src/core/finder/effects.ts')
const update = read('src/core/finder/update.ts')
const xplore = read('src/view/screens/xplore-screen.tsx')
const cvCyclePanel = read('src/components/finder/cv-cycle-context-panel.tsx')
const panel = read('src/components/finder/opportunity-target-fit-panel.tsx')
const app = read('src/app/finder-app.tsx')
const keyboard = read('src/core/domain/finder-keyboard.ts')
const nav = read('src/core/domain/finder-nav.ts')
const view = read('src/view/finder-app-view.tsx')
const sidebar = read('src/components/layout/sidebar-nav.tsx')
const header = read('src/components/layout/header.tsx')
const css = read('src/index.css')
const selectors = read('src/core/finder/selectors.ts')
const lib = read('src-tauri/src/lib.rs')
const cv = read('src/components/finder/cv-summary-input.tsx')
const settings = read('src/view/screens/settings-screen.tsx')
const preferences = read('src/view/screens/preferences-screen.tsx')
const decision = read('src/components/finder/decision-panel.tsx')

// IA honesty (digit shortcuts match SidebarNav: Navigating, Discover, Pipeline, Mission, …)
assert(keyboard.includes("'3': 'pipeline'"), 'keyboard 3 = pipeline')
assert(keyboard.includes("'4': 'mission'"), 'keyboard 4 = mission')
assert(keyboard.includes("'5': 'sweden'"), 'keyboard 5 = sweden')
assert(keyboard.includes("'6': 'xplore'"), 'keyboard 6 = xplore')
assert(nav.includes("'xplore'"), 'HASH_SCREENS includes xplore')
assert(sidebar.includes("id: 'xplore'"), 'sidebar includes xplore nav item')
assert(sidebar.indexOf("id: 'xplore'") > sidebar.indexOf("id: 'sweden'"), 'xplore after sweden in sidebar (Meta+6)')
assert(keyboard.includes("'7': 'network'"), 'keyboard 7 = network')
assert(keyboard.includes("'8': 'preferences'"), 'keyboard 8 = preferences')
assert(keyboard.includes("'9': 'settings'"), 'keyboard 9 = settings')
assert(!keyboard.includes("'2': 'stats'"), 'keyboard no longer maps 2 to stats')
assert(!keyboard.includes("'3': 'mission'"), 'keyboard 3 no longer mission (pipeline owns Meta+3)')
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
assert(panel.includes("group: 'Prep'") || panel.includes('Copy all prep'), 'prep copy affordances')
assert(panel.includes('cover-letter.md') || panel.includes('cover_letter'), 'sectioned cover letter')

// Pipeline
assert(lib.includes('update_opportunity_status_cmd'), 'status cmd registered')
assert(panel.includes('onStatusChange') || panel.includes('Applied'), 'status actions in panel')
assert(discover.includes('OpportunityStatusChangeRequested'), 'status dispatch from discover')

// Pipeline → Discover: seed JD, do not wipe on missing analysis blobs (cloud-synced apply rows)
assert(pipeline.includes('openInDiscover'), 'pipeline openInDiscover')
assert(pipeline.includes('seedDiscoverJd'), 'pipeline seeds JD before Discover')
assert(pipeline.includes("screen: 'discover'"), 'pipeline navigates to discover')
assert(pipeline.includes('reveal: true'), 'pipeline reveal Discover after load')
assert(pipeline.includes('table-fixed'), 'pipeline table-layout fixed (cell overflow)')
assert(pipeline.includes('min-w-0 flex-1 overflow-auto'), 'pipeline scrollport can shrink (WebKit)')
assert(pipeline.includes('bg-surface-1 ') || pipeline.includes('bg-surface-1 text-'), 'pipeline sticky header opaque')
assert(effects.includes('OpportunityTargetHydrateEmpty'), 'hydrate idles panel without wipe')
assert(effects.includes('hydrateOpportunityTargetPlan'), 'hydrate uses seed plan')
assert(
  !/if \(!o\.analysis_json && !o\.prep_artifacts_json\) \{\s*dispatch\(\{ type: 'OpportunityTargetCleared' \}\)/.test(
    effects,
  ),
  'hydrate no longer clears URL/JD when blobs missing',
)
assert(update.includes("case 'OpportunityTargetHydrateEmpty'"), 'update handles HydrateEmpty')
assert(discover.includes('has no saved fit'), 'Discover empty state names missing fit')

// Settings calm
assert(!settings.match(/details open/), 'settings details not force-open')
assert(preferences.includes('About'), 'preferences About')

// Xplore honesty — separate screen modules (no dual-mode DiscoverScreen)
assert(!discover.includes('SearchWorkspace'), 'discover screen does not host X search')
assert(!discover.includes("mode: 'discover'"), 'discover screen has no mode prop')
assert(xplore.includes('SearchWorkspace'), 'xplore screen owns X search workspace')
assert(xplore.includes('TweetFeed'), 'xplore screen owns tweet feed')
assert(xplore.includes('CvCycleContextPanel'), 'xplore shows cycle CV context panel')
assert(cvCyclePanel.includes('get_operator_pack_status'), 'cycle CV panel reads pack health')
assert(cvCyclePanel.includes('packHealthLabel'), 'cycle CV panel uses pack health tone labels')
assert(!xplore.includes('CvSummaryInput'), 'xplore has read-only CV context, not full editor')
assert(view.includes('XploreScreen'), 'finder routes xplore to XploreScreen')
assert(view.includes('key={activeScreen}'), 'viewport keyed remount prevents Discover/Xplore local-state bleed')
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

#!/usr/bin/env node
/**
 * Runner: imports shipped cn.ts via strip-types.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cn } from './cn.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const cssPath = join(root, 'src/index.css')
const shellPath = join(root, 'src/view/finder-app-view.tsx')
const discoverPath = join(root, 'src/view/screens/discover-screen.tsx')
const settingsPath = join(root, 'src/view/screens/settings-screen.tsx')
const preferencesPath = join(root, 'src/view/screens/preferences-screen.tsx')
const primitives = [
  'src/components/ui/panel.tsx',
  'src/components/ui/chip.tsx',
  'src/components/ui/section-label.tsx',
  'src/components/ui/page-header.tsx',
  'src/components/ui/empty-state.tsx',
  'src/components/ui/button.tsx',
]

const failures = []
const notes = []
function must(c, m) {
  if (!c) failures.push(m)
  else notes.push(`ok: ${m}`)
}

const css = readFileSync(cssPath, 'utf8')
must(css.includes('--color-surface-0'), 'token surface-0')
must(css.includes('--color-accent'), 'token accent')
must(css.includes('--radius-md'), 'token radius-md')
must(css.includes('--text-caption'), 'token text-caption')
must(css.includes('.ui-viewport'), 'utility ui-viewport')
must(css.includes('.ui-panel'), 'utility ui-panel')
must(css.includes('.ui-section-label'), 'utility ui-section-label')
must(css.includes('.ui-chip'), 'utility ui-chip')
must(css.includes('prefers-reduced-motion'), 'reduced-motion')

for (const p of primitives) {
  must(existsSync(join(root, p)), `primitive ${p}`)
}

const shell = readFileSync(shellPath, 'utf8')
must(shell.includes('ui-viewport'), 'shell uses ui-viewport')
must(shell.includes('SidebarNav'), 'shell uses SidebarNav')

const discover = readFileSync(discoverPath, 'utf8')
must(discover.includes('SectionLabel'), 'discover SectionLabel')
must(discover.includes('Panel'), 'discover Panel')
must(discover.includes('Chip'), 'discover Chip')
must(discover.includes("from '../../components/ui/input'"), 'discover uses shared Input')

const settings = readFileSync(settingsPath, 'utf8')
const preferences = readFileSync(preferencesPath, 'utf8')
must(settings.includes('PageHeader'), 'settings uses PageHeader')
must(preferences.includes('PageHeader'), 'preferences uses PageHeader')

// Drive real shipped cn()
const merged = cn('px-2 py-1', 'px-4', 'ui-panel', false && 'hidden')
must(typeof cn === 'function', 'cn is exported function')
must(merged.includes('px-4'), 'cn prefers later padding')
must(!merged.includes('px-2'), 'cn drops overridden padding')
must(merged.includes('ui-panel'), 'cn keeps ui-panel utility')
must(merged.includes('py-1'), 'cn keeps py-1')

console.log('=== ui-tokens.verify ===')
for (const n of notes) console.log(`  ${n}`)
if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nALL CHECKS PASSED')

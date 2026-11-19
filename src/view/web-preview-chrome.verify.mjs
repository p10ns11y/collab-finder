#!/usr/bin/env node
/**
 * Honest gate: the web chrome is named kanithanj.ai, not collab-finder.
 * Run: node src/view/web-preview-chrome.verify.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const html = readFileSync(join(root, 'index.html'), 'utf8')
assert(/<title>kanithanj\.ai<\/title>/.test(html), 'index.html <title> is kanithanj.ai')
assert(/application-name" content="kanithanj\.ai"/.test(html), 'index.html application-name is kanithanj.ai')
assert(!/collab-finder — opportunity reactor/.test(html), 'old opportunity-reactor title is gone')

const header = readFileSync(join(root, 'src/components/layout/header.tsx'), 'utf8')
assert(header.includes('kanithanj.ai'), 'header brand is kanithanj.ai')
assert(!/^\s*collab-finder\s*$/m.test(header), 'header no longer shows collab-finder as the app name')

const view = readFileSync(join(root, 'src/view/finder-app-view.tsx'), 'utf8')
assert(view.includes('web preview'), 'shell tells recruiters this is the web preview')
assert(view.includes('isTauri()'), 'preview notice is gated on the Tauri runtime check')

if (failed > 0) process.exit(1)
console.log('web-preview-chrome: all checks passed')

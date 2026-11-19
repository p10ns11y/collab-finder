#!/usr/bin/env node
/**
 * Scan the Vite web output (dist/) so a public live link cannot ship
 * private profile, ledger, CV, standing-answer or host data.
 *
 * Run after `pnpm build`: node scripts/scan-web-privacy.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

if (!existsSync(dist)) {
  console.error('scan-web-privacy: dist/ is missing. Run pnpm build first.')
  process.exit(1)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = walk(dist)
const textFiles = files.filter((p) => /\.(js|css|html|json|txt|svg|map)$/.test(p))
const corpus = textFiles.map((p) => ({ path: relative(root, p), text: readFileSync(p, 'utf8') }))
const all = corpus.map((c) => c.text).join('\n')

function hits(re) {
  const found = []
  for (const { path, text } of corpus) {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) found.push(`${path}:${i + 1}`)
      re.lastIndex = 0
    }
  }
  return found
}

const report = []
function section(name, rows) {
  report.push({ name, rows })
}

section('@ (all matches, including CSS and packages)', hits(/@/))
section('email-shaped strings', hits(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/))
section('+46', hits(/\+46/))
section('ledger', hits(/ledger/i))
section('standing', hits(/standing/i))
section('cv.normalized', hits(/cv\.normalized/))
const homeHits = hits(/\/home\/|\/Users\/|\\Users\\/).filter((row) => {
  const [file, lineNo] = row.split(':')
  const corpusRow = corpus.find((c) => c.path === file)
  const line = corpusRow ? corpusRow.text.split('\n')[Number(lineNo) - 1] : ''
  // Instructional placeholder in Preferences, not a real home directory.
  return !/\/home\/…\/devprofile/.test(line)
})
section('home paths', homeHits)
section('private host markers', hits(/mza\s*pan|100\.64\.|tailscale/i))

const personalSources = [
  'data/distillation/curation/profile-and-strategy.md',
  'data/distillation/curation/candidate-constraints-compact.txt',
  'data/distillation/public-projects-focused-flatten.json',
  'data/contacts.sample.csv',
]

const leaked = []
for (const rel of personalSources) {
  const src = readFileSync(join(root, rel), 'utf8')
  const markers = src
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 40 && !l.startsWith('{') && !l.startsWith('}') && !l.startsWith('"username"'))
  for (const marker of markers) {
    const needle = marker.slice(0, 80)
    if (all.includes(needle)) leaked.push(`${rel}: ${needle}`)
  }
}
section('real operator files leaking into dist', leaked)

let failed = 0
const mustBeEmpty = [
  'email-shaped strings',
  '+46',
  'ledger',
  'standing',
  'cv.normalized',
  'home paths',
  'private host markers',
  'real operator files leaking into dist',
]

console.log(`scanned ${textFiles.length} files under dist/\n`)
for (const { name, rows } of report) {
  const preview = rows.slice(0, 15)
  console.log(`== ${name}: ${rows.length} hit(s)`)
  for (const row of preview) console.log(`  ${row}`)
  if (rows.length > preview.length) console.log(`  … ${rows.length - preview.length} more`)
  console.log('')
  if (mustBeEmpty.includes(name) && rows.length > 0) failed += 1
}

if (failed > 0) {
  console.error('FAIL: dist/ looks like it ships private or operator data')
  process.exit(1)
}
console.log('OK: dist/ has no private profile, ledger, CV, standing-answer, phone or host data')

#!/usr/bin/env node
/**
 * Scan the public web-preview output so a live link cannot ship
 * private profile, ledger, CV, standing-answer, host or name data.
 *
 * Run after `pnpm build:web`: node scripts/scan-web-privacy.mjs
 * Optional dir: node scripts/scan-web-privacy.mjs apps/desktop/dist-web
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { operatorPersonalNames } from './operator-personal-names.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, process.argv[2] || process.env.WEB_DIST || 'apps/desktop/dist-web')

if (!existsSync(dist)) {
  console.error(`scan-web-privacy: ${relative(root, dist) || dist} is missing. Run pnpm build:web first.`)
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

const names = operatorPersonalNames(root)
if (names.length !== 2) {
  console.error('scan-web-privacy: could not read the operator first and last name from the distilled CV packet')
  process.exit(1)
}
const nameHits = []
for (const name of names) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const row of hits(new RegExp(escaped, 'i'))) {
    nameHits.push(row)
  }
}
section('operator personal name', [...new Set(nameHits)])

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
  'operator personal name',
  'real operator files leaking into dist',
]

console.log(`scanned ${textFiles.length} files under ${relative(root, dist)}\n`)
for (const { name, rows } of report) {
  const preview = rows.slice(0, 15)
  console.log(`== ${name}: ${rows.length} hit(s)`)
  for (const row of preview) console.log(`  ${row}`)
  if (rows.length > preview.length) console.log(`  … ${rows.length - preview.length} more`)
  console.log('')
  if (mustBeEmpty.includes(name) && rows.length > 0) failed += 1
}

if (failed > 0) {
  console.error(`FAIL: ${relative(root, dist)} looks like it ships private or operator data`)
  process.exit(1)
}
console.log(`OK: ${relative(root, dist)} has no private profile, ledger, CV, standing-answer, phone, host or name data`)

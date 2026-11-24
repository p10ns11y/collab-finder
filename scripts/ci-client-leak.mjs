#!/usr/bin/env node
/**
 * Fail when the client build ships standing-answers content or a reference to it.
 * Reports file and marker only, never the matched values.
 *
 * Run after a build: node scripts/ci-client-leak.mjs [dir]
 * dir defaults to $WEB_DIST, then dist-web. Use dist for the desktop bundle.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_KEYS = [
  'office_days_ok',
  'background_check_consent',
  'interview_recording_consent',
  'filler_policy',
  'self_ratings',
  'flag_reviewed',
  'pack_defaults',
  'relocation',
  'start_date',
]
export const SCHEMA_KEY_THRESHOLD = 3

const TEXT_FILE = /\.(js|mjs|cjs|html|json|map|webmanifest|txt|css|svg|xml|md|yml|yaml|csv|ts)$/
const IDENTIFIER = /\bSTANDING_ANSWERS\b/
const PATH = /standing-answers/i

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

function propertyPattern(key) {
  return new RegExp(`(?:^|[^\\w$])["'\\\\]*${key}["'\\\\]*\\s*\\??\\s*:`)
}

const keyPatterns = SCHEMA_KEYS.map((key) => [key, propertyPattern(key)])

export function scanDir(dir) {
  const findings = []
  for (const path of walk(dir)) {
    const file = relative(dir, path)
    if (PATH.test(file)) findings.push({ file, marker: 'standing-answers path in file name' })
    if (!TEXT_FILE.test(path)) continue
    const text = readFileSync(path, 'utf8')
    if (IDENTIFIER.test(text)) findings.push({ file, marker: 'STANDING_ANSWERS identifier' })
    if (PATH.test(text)) findings.push({ file, marker: 'standing-answers path' })
    const keys = keyPatterns.filter(([, re]) => re.test(text)).map(([key]) => key)
    if (keys.length >= SCHEMA_KEY_THRESHOLD) {
      findings.push({ file, marker: `standing-answers schema keys (${keys.join(', ')})` })
    }
  }
  return findings
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dist = resolve(root, process.argv[2] || process.env.WEB_DIST || 'dist-web')
  const label = relative(root, dist) || dist
  if (!existsSync(dist)) {
    console.error(`ci-client-leak: ${label} is missing. Build it first.`)
    process.exit(1)
  }
  const findings = scanDir(dist)
  if (findings.length > 0) {
    for (const { file, marker } of findings) console.error(`  ${file}: ${marker}`)
    console.error(`FAIL: ${label} ships standing-answers content (${findings.length} finding(s))`)
    process.exit(1)
  }
  console.log(`OK: ${label} has no standing-answers content`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

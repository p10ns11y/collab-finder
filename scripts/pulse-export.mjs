#!/usr/bin/env node
/**
 * Export hunt pulse-pack-v1 from kanithanj sync dir (or pulse-memory DB).
 * Default source: ~/.local/share/collab-finder/_sync/pulse/latest.json
 *
 * Usage:
 *   node scripts/pulse-export.mjs [--out hunt-pulse.json]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultLatest = join(homedir(), '.local/share/collab-finder/_sync/pulse/latest.json')

function parseArgs() {
  const outIdx = process.argv.indexOf('--out')
  const out = outIdx >= 0 ? resolve(process.argv[outIdx + 1] || 'hunt-pulse.json') : null
  const srcIdx = process.argv.indexOf('--from')
  const from = srcIdx >= 0 ? resolve(process.argv[srcIdx + 1]) : defaultLatest
  return { from, out }
}

function assertPackShape(raw) {
  const pack = JSON.parse(raw)
  if (pack.format !== 'pulse-pack-v1') {
    throw new Error(`expected format pulse-pack-v1, got ${pack.format}`)
  }
  if (!Array.isArray(pack.traces)) {
    throw new Error('pack.traces must be an array')
  }
  return pack
}

const { from, out } = parseArgs()
if (!existsSync(from)) {
  console.error(`pulse-export: missing ${from} — run kanithanj.ai first or pass --from`)
  process.exit(1)
}

const pack = assertPackShape(readFileSync(from, 'utf8'))
const destination = out || join(repoRoot, `hunt-pulse-${pack.exported_at.replace(/[:.]/g, '-')}.json`)
mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, JSON.stringify(pack, null, 2))
console.log(`pulse-export: ${pack.traces.length} traces → ${destination}`)

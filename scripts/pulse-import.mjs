#!/usr/bin/env node
/**
 * Import pulse-pack-v1 into pulse-memory SQLite (memory_traces upsert on nat_key).
 * Compatible with ensembly pulse_import tooling; does not touch ensembly graph DB.
 *
 * Usage:
 *   node scripts/pulse-import.mjs hunt-pulse.json
 *   PULSE_MEMORY_DB=~/.local/share/pulse-memory/pulse.sqlite node scripts/pulse-import.mjs pack.json
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const packPath = resolve(process.argv[2] || '')
if (!packPath || !existsSync(packPath)) {
  console.error('pulse-import: pass path to pulse-pack-v1 JSON')
  process.exit(1)
}

const pulseDb =
  process.env.PULSE_MEMORY_DB?.trim() ||
  resolve(homedir(), '.local/share/pulse-memory/pulse.sqlite')

const pack = JSON.parse(readFileSync(packPath, 'utf8'))
if (pack.format !== 'pulse-pack-v1') {
  console.error(`pulse-import: unsupported format ${pack.format}`)
  process.exit(1)
}

mkdirSync(dirname(pulseDb), { recursive: true })
execFileSync(
  'sqlite3',
  [
    pulseDb,
    `CREATE TABLE IF NOT EXISTS memory_traces (
      nat_key TEXT PRIMARY KEY,
      snippet TEXT NOT NULL,
      source TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      lock TEXT NOT NULL DEFAULT 'open'
    );`,
  ],
  { stdio: 'ignore' },
)

let n = 0
for (const t of pack.traces) {
  const snippet = String(t.snippet || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/xai-\S+/gi, 'xai-[REDACTED]')
    .slice(0, 480)
  const sql = `INSERT INTO memory_traces (nat_key, snippet, source, time, status, kind, lock)
    VALUES ('${String(t.nat_key).replace(/'/g, "''")}', '${snippet.replace(/'/g, "''")}', '${String(t.source).replace(/'/g, "''")}', '${String(t.time).replace(/'/g, "''")}', '${String(t.status).replace(/'/g, "''")}', '${String(t.kind).replace(/'/g, "''")}', '${String(t.lock || 'open').replace(/'/g, "''")}')
    ON CONFLICT(nat_key) DO UPDATE SET snippet=excluded.snippet, time=excluded.time, status=excluded.status;`
  execFileSync('sqlite3', [pulseDb, sql], { stdio: 'ignore' })
  n += 1
}

console.log(`pulse-import: ${n} traces → ${pulseDb}`)

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

/** @param {unknown} value */
function sqlQuote(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

/** @param {{ time?: string }} trace */
function resolveSeenAt(trace) {
  const t = trace.time?.trim()
  return t || new Date().toISOString()
}

function runSql(dbPath, sql) {
  execFileSync('sqlite3', [dbPath, sql], { stdio: 'ignore' })
}

function querySql(dbPath, sql) {
  return execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' }).trim()
}

function ensureSchema(dbPath) {
  runSql(
    dbPath,
    `CREATE TABLE IF NOT EXISTS memory_traces (
      nat_key TEXT PRIMARY KEY,
      snippet TEXT NOT NULL,
      source TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      lock TEXT NOT NULL DEFAULT 'open',
      seen_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  )

  const cols = new Set(
    querySql(dbPath, "SELECT name FROM pragma_table_info('memory_traces');")
      .split('\n')
      .filter(Boolean),
  )
  const migrations = [
    ['seen_count', 'ALTER TABLE memory_traces ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 1'],
    ['first_seen', "ALTER TABLE memory_traces ADD COLUMN first_seen TEXT NOT NULL DEFAULT (datetime('now'))"],
    ['last_seen', "ALTER TABLE memory_traces ADD COLUMN last_seen TEXT NOT NULL DEFAULT (datetime('now'))"],
  ]
  for (const [col, ddl] of migrations) {
    if (!cols.has(col)) runSql(dbPath, ddl)
  }
}

function sanitizeSnippet(raw) {
  return String(raw || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/xai-\S+/gi, 'xai-[REDACTED]')
    .slice(0, 480)
}

function upsertTrace(dbPath, trace) {
  const seenAt = resolveSeenAt(trace)
  const snippet = sanitizeSnippet(trace.snippet)
  const sql = `INSERT INTO memory_traces (
      nat_key, snippet, source, time, status, kind, lock, first_seen, last_seen
    ) VALUES (
      ${sqlQuote(trace.nat_key)},
      ${sqlQuote(snippet)},
      ${sqlQuote(trace.source)},
      ${sqlQuote(trace.time)},
      ${sqlQuote(trace.status)},
      ${sqlQuote(trace.kind)},
      ${sqlQuote(trace.lock || 'open')},
      ${sqlQuote(seenAt)},
      ${sqlQuote(seenAt)}
    )
    ON CONFLICT(nat_key) DO UPDATE SET
      snippet = excluded.snippet,
      time = excluded.time,
      status = excluded.status,
      last_seen = excluded.last_seen,
      seen_count = seen_count + 1;`
  runSql(dbPath, sql)
}

const pack = JSON.parse(readFileSync(packPath, 'utf8'))
if (pack.format !== 'pulse-pack-v1') {
  console.error(`pulse-import: unsupported format ${pack.format}`)
  process.exit(1)
}

mkdirSync(dirname(pulseDb), { recursive: true })
ensureSchema(pulseDb)

let n = 0
for (const t of pack.traces) {
  upsertTrace(pulseDb, t)
  n += 1
}

console.log(`pulse-import: ${n} traces → ${pulseDb}`)

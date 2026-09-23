#!/usr/bin/env node
/**
 * Fit calibration report. Read-only.
 *
 *   node --experimental-strip-types scripts/fit-calibration.mjs
 *   node --experimental-strip-types scripts/fit-calibration.mjs --fixture src/core/domain/fixtures/outcome-seed.json
 *   node --experimental-strip-types scripts/fit-calibration.mjs --db /path/to/collab-finder.db
 *
 * Default input is the cited outcome fixture (fit_score null — nothing is imputed).
 * --db reads opportunities and does not write. The database path is not printed.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calibrationReport } from '../src/core/domain/fit-calibration.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultFixture = join(root, 'src/core/domain/fixtures/outcome-seed.json')

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  if (i === -1) return null
  return process.argv[i + 1] || null
}

function rowsFromFixture(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  const rows = Array.isArray(parsed.rows) ? parsed.rows : []
  return rows.map((row) => ({
    id: row.id,
    fit_score: row.fit_score ?? null,
    outcome_status: row.outcome_status ?? null,
  }))
}

function rowsFromDb(path) {
  const query = `SELECT id, fit_score, outcome_status FROM opportunities;`
  const child = spawnSync('sqlite3', ['-readonly', '-json', path, query], { encoding: 'utf8' })
  if (child.error) {
    console.error('sqlite3 is not available; pass --fixture instead')
    process.exit(1)
  }
  if ((child.status ?? 1) !== 0) {
    console.error(child.stderr || 'sqlite read failed')
    process.exit(child.status ?? 1)
  }
  const parsed = JSON.parse(child.stdout || '[]')
  if (!Array.isArray(parsed)) {
    console.error('sqlite did not return a row list')
    process.exit(1)
  }
  return parsed.map((row) => ({
    id: row.id,
    fit_score: row.fit_score ?? null,
    outcome_status: row.outcome_status ?? null,
  }))
}

const db = argValue('--db')
const fixture = argValue('--fixture')
if (db && fixture) {
  console.error('pass either --db or --fixture')
  process.exit(1)
}

const rows = db ? rowsFromDb(db) : rowsFromFixture(fixture || defaultFixture)
const report = calibrationReport(rows)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

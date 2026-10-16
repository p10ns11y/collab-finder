#!/usr/bin/env node
/**
 * Nightly snapshot receipt.
 *
 *   node scripts/ci-area-nightly.mjs <receipt.json>
 *
 * Prints applied, held, or missing, and appends one findings row of counts and table names.
 * Receipt JSON: integrity "ok" or "fail", optional outcome "applied" or "held", and tables
 * mapping each table name to insert, update, conflict, and box_newer counts.
 * When outcome is omitted, applied means integrity ok with zero conflicts and zero box-newer rows.
 * Does not open the operator database directory.
 */
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FINDINGS_HEADER = '| Date (UTC) | Finding | Area | Kind | Cluster | Decision | Status |'
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const MAX_RECEIPT_BYTES = 1024 * 1024

export function operatorDataRoot() {
  return resolve(homedir(), '.local', 'share', 'collab-finder')
}

export function isOperatorDataPath(target) {
  const base = operatorDataRoot()
  const abs = resolve(String(target))
  return abs === base || abs.startsWith(base + sep)
}

export function isDatabasePath(target) {
  const lower = String(target).toLowerCase()
  return lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3')
}

function count(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

function unreadable() {
  return {
    status: null,
    finding: 'receipt unreadable',
    decision: 'fix now',
    logStatus: 'open',
    exitCode: 1,
  }
}

export function classifyReceipt(raw) {
  if (raw == null) {
    return {
      status: 'missing',
      finding: 'receipt missing',
      decision: 'ask owner',
      logStatus: 'open',
      exitCode: 0,
    }
  }
  if (typeof raw !== 'string' || raw.includes('\0')) return unreadable()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return unreadable()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return unreadable()
  if (parsed.integrity !== 'ok' && parsed.integrity !== 'fail') return unreadable()
  const tables = parsed.tables
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) return unreadable()

  const names = Object.keys(tables).sort((left, right) => left.localeCompare(right))
  let inserts = 0
  let updates = 0
  let conflicts = 0
  let boxNewer = 0
  for (const name of names) {
    if (!TABLE_NAME.test(name)) return unreadable()
    const row = tables[name]
    if (!row || typeof row !== 'object' || Array.isArray(row)) return unreadable()
    const insert = count(row.insert)
    const update = count(row.update)
    const conflict = count(row.conflict)
    const newer = count(row.box_newer)
    if (insert == null || update == null || conflict == null || newer == null) return unreadable()
    inserts += insert
    updates += update
    conflicts += conflict
    boxNewer += newer
  }

  let status = parsed.outcome
  if (status == null) {
    status = parsed.integrity === 'ok' && conflicts === 0 && boxNewer === 0 ? 'applied' : 'held'
  }
  if (status !== 'applied' && status !== 'held') return unreadable()

  const listed = names.length ? names.join(',') : 'none'
  const finding = `receipt ${status} integrity ${parsed.integrity} inserts ${inserts} updates ${updates} conflicts ${conflicts} box-newer ${boxNewer} tables ${listed}`
  const dirty = parsed.integrity === 'fail' || conflicts > 0 || boxNewer > 0
  if (dirty) {
    return { status, finding, decision: 'fix now', logStatus: 'open', exitCode: 0 }
  }
  if (status === 'applied') {
    return { status, finding, decision: "won't fix", logStatus: 'closed', exitCode: 0 }
  }
  return { status, finding, decision: 'ask owner', logStatus: 'open', exitCode: 0 }
}

export function findingsLine(date, result) {
  return `| ${date} | ${result.finding} | store | data | sync | ${result.decision} | ${result.logStatus} |`
}

export function insertFindingsRow(text, line) {
  const rows = text.split('\n')
  const at = rows.findIndex((row) => row.trim() === FINDINGS_HEADER)
  if (at < 0) return null
  let insertAt = at + 1
  while (insertAt < rows.length && rows[insertAt].startsWith('|')) insertAt += 1
  rows.splice(insertAt, 0, line)
  const joined = rows.join('\n')
  return joined.endsWith('\n') ? joined : `${joined}\n`
}

export function utcDay(now = new Date()) {
  const parsed = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function argValue(argv, index) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) return null
  return value
}

function parseArgs(argv) {
  const out = {
    receipt: null,
    findings: join(root, 'docs/ops/FINDINGS.md'),
    now: null,
  }
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--receipt' || arg === '--findings' || arg === '--now') {
      const value = argValue(argv, i)
      if (value == null) {
        console.error(`missing value for ${arg}`)
        process.exit(2)
      }
      if (arg === '--receipt') out.receipt = value
      else if (arg === '--findings') out.findings = value
      else out.now = value
      i += 1
    } else if (arg.startsWith('--')) {
      console.error(`unknown arg ${arg}`)
      process.exit(2)
    } else {
      positionals.push(arg)
    }
  }
  if (positionals.length > 1 || (positionals.length === 1 && out.receipt)) {
    console.error('one receipt path')
    process.exit(2)
  }
  if (positionals.length === 1) out.receipt = positionals[0]
  if (!out.receipt) {
    console.error('missing receipt path')
    process.exit(2)
  }
  return out
}

function readReceipt(path) {
  let st
  try {
    st = lstatSync(path)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    return undefined
  }
  if (st.isSymbolicLink()) {
    console.error('refusing symlink receipt')
    process.exit(1)
  }
  if (!st.isFile() || st.size > MAX_RECEIPT_BYTES) return undefined
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (isOperatorDataPath(args.receipt) || isOperatorDataPath(args.findings)) {
    console.error('refusing operator data directory')
    process.exit(1)
  }
  if (isDatabasePath(args.receipt)) {
    console.error('refusing database file')
    process.exit(1)
  }
  const day = utcDay(args.now == null ? new Date() : args.now)
  if (!day) {
    console.error('invalid --now')
    process.exit(2)
  }
  const raw = readReceipt(args.receipt)
  const result = raw === undefined ? unreadable() : classifyReceipt(raw)
  let current
  try {
    current = readFileSync(args.findings, 'utf8')
  } catch {
    console.error('findings log missing columns')
    process.exit(1)
  }
  const next = insertFindingsRow(current, findingsLine(day, result))
  if (next == null) {
    console.error('findings log missing columns')
    process.exit(1)
  }
  writeFileSync(args.findings, next)
  if (result.status) console.log(result.status)
  process.exit(result.exitCode)
}

const entry = process.argv[1]
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) main()

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
 * Then maps origin/main's diff for that night through docs/ops/areas.json. A changed file under
 * src-tauri/ whose area is in scope runs scripts/seed-testdata-for-ci.sh and then cargo test --lib.
 * Scope is nightly every day, weekly on Monday, and monthly on the 1st (UTC).
 * Does not open the operator database directory.
 */
import { spawnSync } from 'node:child_process'
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

export function clock(now) {
  if (now == null) return new Date()
  const parsed = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function matchSegment(segment, pattern) {
  const body = pattern.split('*').map(escapeRegExp).join('[^/]*')
  return new RegExp(`^${body}$`).test(segment)
}

function matchParts(pathParts, patternParts) {
  if (patternParts.length === 0) return pathParts.length === 0
  if (patternParts[0] === '**') {
    if (matchParts(pathParts, patternParts.slice(1))) return true
    if (pathParts.length === 0) return false
    return matchParts(pathParts.slice(1), patternParts)
  }
  if (pathParts.length === 0) return false
  if (!matchSegment(pathParts[0], patternParts[0])) return false
  return matchParts(pathParts.slice(1), patternParts.slice(1))
}

function matchGlob(filePath, pattern) {
  return matchParts(filePath.split('/'), pattern.split('/'))
}

export function loadAreas(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || !Array.isArray(parsed.areas) || parsed.areas.length === 0) return null
  for (const area of parsed.areas) {
    if (!area || typeof area.id !== 'string' || area.id === '') return null
    if (!Array.isArray(area.include) || area.include.length === 0) return null
    if (area.exclude != null && !Array.isArray(area.exclude)) return null
  }
  return parsed.areas
}

export function areasFor(filePath, areas) {
  const hits = []
  for (const area of areas) {
    const excluded = (area.exclude ?? []).some((pattern) => matchGlob(filePath, pattern))
    if (excluded) continue
    if (area.include.some((pattern) => matchGlob(filePath, pattern))) hits.push(area.id)
  }
  return hits.sort((left, right) => left.localeCompare(right))
}

export function cadenceByArea(doc) {
  const start = doc.indexOf('<!-- area-map-graph:cadence -->')
  const end = doc.indexOf('<!-- /area-map-graph:cadence -->')
  if (start < 0 || end < start) return null
  const map = new Map()
  for (const line of doc.slice(start, end).split('\n')) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 6) continue
    const area = cells[0]
    const cadence = cells[5]
    if (cadence !== 'Nightly' && cadence !== 'Weekly' && cadence !== 'Monthly') continue
    map.set(area, cadence)
  }
  if (map.size === 0) return null
  return map
}

export function areasDue(cadence, day) {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const monday = date.getUTCDay() === 1
  const first = date.getUTCDate() === 1
  const due = new Set()
  for (const [area, label] of cadence) {
    if (label === 'Nightly' || (label === 'Weekly' && monday) || (label === 'Monthly' && first)) due.add(area)
  }
  return due
}

export function lookbackStart(now) {
  const until = clock(now)
  if (!until) return null
  if (until.getUTCDate() === 1) {
    return new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() - 1, 1)).toISOString()
  }
  const days = until.getUTCDay() === 1 ? 7 : 1
  return new Date(until.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function changedOnMain(sinceIso, spawn = spawnSync) {
  const base = spawn('git', ['rev-list', '-n', '1', `--before=${sinceIso}`, 'origin/main'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (!base || base.status !== 0 || !String(base.stdout ?? '').trim()) {
    return { error: String(base?.stderr || 'no origin/main commit before the night window').trim() }
  }
  const baseSha = String(base.stdout).trim()
  const diff = spawn('git', ['diff', '--name-only', '--no-renames', baseSha, 'origin/main'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (!diff || diff.status !== 0) {
    return { error: String(diff?.stderr || 'git diff failed').trim() }
  }
  const files = [...new Set(String(diff.stdout ?? '').split('\n').filter((line) => line !== ''))]
  return { files }
}

export function rustHits(files, areas, due) {
  const hits = []
  for (const file of files) {
    if (!file.startsWith('src-tauri/')) continue
    const owners = areasFor(file, areas)
    if (owners.length !== 1) continue
    if (!due.has(owners[0])) continue
    hits.push({ file, area: owners[0] })
  }
  return hits
}

export function rustPlan(hits) {
  if (hits.length === 0) return []
  return [
    {
      label: 'bash scripts/seed-testdata-for-ci.sh',
      cmd: 'bash',
      args: ['scripts/seed-testdata-for-ci.sh'],
      cwd: root,
    },
    {
      label: 'cargo test --lib',
      cmd: 'cargo',
      args: ['test', '--lib'],
      cwd: join(root, 'src-tauri'),
    },
  ]
}

export function runPlan(plan, runner) {
  for (const step of plan) {
    const code = runner(step)
    if (code !== 0) return code ?? 1
  }
  return 0
}

export function executeRust(plan, spawn = spawnSync) {
  return runPlan(plan, (step) => {
    const child = spawn(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' })
    return child?.status ?? 1
  })
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
    diffList: null,
    areas: join(root, 'docs/ops/areas.json'),
    cadence: join(root, 'docs/ops/AREAS.md'),
    dryRun: false,
  }
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      out.dryRun = true
    } else if (
      arg === '--receipt' ||
      arg === '--findings' ||
      arg === '--now' ||
      arg === '--diff-list' ||
      arg === '--areas' ||
      arg === '--cadence'
    ) {
      const value = argValue(argv, i)
      if (value == null) {
        console.error(`missing value for ${arg}`)
        process.exit(2)
      }
      if (arg === '--receipt') out.receipt = value
      else if (arg === '--findings') out.findings = value
      else if (arg === '--now') out.now = value
      else if (arg === '--diff-list') out.diffList = value
      else if (arg === '--areas') out.areas = value
      else out.cadence = value
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

function listFiles(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line !== '')
}

function reviewRust(args, when) {
  const since = lookbackStart(when)
  const day = utcDay(when)
  if (!since || !day) {
    console.error('invalid --now')
    process.exit(2)
  }
  let areasText
  let cadenceText
  try {
    areasText = readFileSync(args.areas, 'utf8')
    cadenceText = readFileSync(args.cadence, 'utf8')
  } catch {
    console.error('area map missing')
    process.exit(1)
  }
  const areas = loadAreas(areasText)
  const cadence = cadenceByArea(cadenceText)
  const due = cadence ? areasDue(cadence, day) : null
  if (!areas || !due) {
    console.error('area map missing')
    process.exit(1)
  }
  const diff = args.diffList
    ? { files: [...new Set(listFiles(args.diffList))] }
    : changedOnMain(since)
  if (diff.error) {
    console.error(diff.error)
    process.exit(1)
  }
  const plan = rustPlan(rustHits(diff.files, areas, due))
  if (plan.length === 0) {
    console.log('rust skip')
    return 0
  }
  console.log('rust run')
  for (const step of plan) console.log(step.label)
  if (args.dryRun) return 0
  return executeRust(plan)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const guarded = [args.receipt, args.findings, args.diffList, args.areas, args.cadence]
  if (guarded.some((target) => target && isOperatorDataPath(target))) {
    console.error('refusing operator data directory')
    process.exit(1)
  }
  if (isDatabasePath(args.receipt)) {
    console.error('refusing database file')
    process.exit(1)
  }
  const when = clock(args.now)
  const day = when ? utcDay(when) : null
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
  if (result.exitCode !== 0) process.exit(result.exitCode)
  process.exit(reviewRust(args, when))
}

const entry = process.argv[1]
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) main()

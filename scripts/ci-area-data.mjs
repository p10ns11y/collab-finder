#!/usr/bin/env node
/**
 * Schema version, merge-list coverage, receipt counts, and PII patterns.
 * Receipt mode does not read the operator data directory.
 */
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ISSUE_TABLES = 19
const OPERATOR_MARK = ['.local', 'share', 'collab-finder'].join('/')
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org', 'example.test']
const TEXT_EXT = new Set([
  '.csv',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.rs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
const PHONE = /(?:\+\d{8,15}\b|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/g

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function readRepo(rel) {
  try {
    return readFileSync(join(root, rel), 'utf8')
  } catch {
    fail(`missing ${rel}`)
  }
}

export function schemaVersion(sql) {
  const matches = [...sql.matchAll(/pub const SCHEMA_VERSION:\s*i32\s*=\s*(\d+)\s*;/g)]
  if (matches.length !== 1) return null
  return Number(matches[0][1])
}

export function createTableNames(sql) {
  const names = []
  const re = /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/g
  for (const match of sql.matchAll(re)) names.push(match[1])
  return names
}

export function shadowTables(sql) {
  const match = sql.match(
    /CREATE\s+VIRTUAL\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?tweets_fts\s+USING\s+fts5\s*\(([^;]*)\)/i,
  )
  if (!match) return []
  const external = /\bcontent\s*=/i.test(match[1])
  const suffixes = external
    ? ['config', 'data', 'docsize', 'idx']
    : ['config', 'content', 'data', 'docsize', 'idx']
  return suffixes.map((suffix) => `tweets_fts_${suffix}`)
}

function unique(names) {
  const out = []
  const seen = new Set()
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

export function listDiff(discovered, listed) {
  const found = new Set(discovered)
  const have = new Set()
  const duplicate = []
  const extra = []
  for (const name of listed) {
    if (have.has(name)) duplicate.push(name)
    have.add(name)
    if (!found.has(name)) extra.push(name)
  }
  const missing = discovered.filter((name) => !have.has(name))
  return { missing, extra, duplicate }
}

function listedNames(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

function operatorRoot() {
  return resolve(homedir(), '.local', 'share', 'collab-finder')
}

function mentionsOperator(value) {
  return String(value).split('\\').join('/').includes(OPERATOR_MARK)
}

function insideOperator(abs) {
  const rootDir = operatorRoot()
  return abs === rootDir || abs.startsWith(`${rootDir}${sep}`)
}

function expandHome(input) {
  if (input === '~') return homedir()
  if (input.startsWith('~/')) return join(homedir(), input.slice(2))
  return input
}

function readReceipt(input) {
  if (mentionsOperator(input)) fail('refusing operator data path')
  const expanded = expandHome(input)
  if (mentionsOperator(expanded)) fail('refusing operator data path')
  const abs = resolve(expanded)
  if (insideOperator(abs) || mentionsOperator(abs)) fail('refusing operator data path')
  let info
  try {
    info = lstatSync(abs)
  } catch {
    fail('receipt missing')
  }
  if (info.isSymbolicLink()) {
    const link = readlinkSync(abs)
    const target = resolve(dirname(abs), link)
    if (mentionsOperator(link) || mentionsOperator(target) || insideOperator(target)) {
      fail('refusing operator data path')
    }
  }
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    fail('receipt missing')
  }
}

export function parseReceipt(text) {
  const totals = { insert: null, update: null, conflict: null, 'box-newer': null }
  const tables = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const total = line.match(/^(insert|update|conflict|box-newer)\s+(\d+)$/)
    if (total) {
      if (totals[total[1]] != null) return { error: 'duplicate receipt count' }
      totals[total[1]] = Number(total[2])
      continue
    }
    const row = line.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s+insert\s+(\d+)\s+update\s+(\d+)\s+conflict\s+(\d+)\s+box-newer\s+(\d+)$/,
    )
    if (row) {
      tables.push({
        name: row[1],
        insert: Number(row[2]),
        update: Number(row[3]),
        conflict: Number(row[4]),
        'box-newer': Number(row[5]),
      })
      continue
    }
    return { error: 'receipt line is not a count' }
  }
  const hasTotal = Object.values(totals).some((value) => value != null)
  if (tables.length && hasTotal) return { error: 'receipt mixes totals and table rows' }
  if (!tables.length && !hasTotal) return { error: 'receipt has no counts' }
  if (!tables.length) {
    for (const key of ['insert', 'update', 'conflict', 'box-newer']) {
      if (totals[key] == null) return { error: `receipt missing ${key}` }
    }
    return { totals, tables }
  }
  const sums = { insert: 0, update: 0, conflict: 0, 'box-newer': 0 }
  for (const row of tables) {
    sums.insert += row.insert
    sums.update += row.update
    sums.conflict += row.conflict
    sums['box-newer'] += row['box-newer']
  }
  return { totals: sums, tables }
}

function printReceipt(parsed) {
  console.log(`insert ${parsed.totals.insert}`)
  console.log(`update ${parsed.totals.update}`)
  console.log(`conflict ${parsed.totals.conflict}`)
  console.log(`box-newer ${parsed.totals['box-newer']}`)
  for (const row of parsed.tables) {
    console.log(
      `${row.name} insert ${row.insert} update ${row.update} conflict ${row.conflict} box-newer ${row['box-newer']}`,
    )
  }
}

function reservedEmail(domain) {
  const host = domain.toLowerCase().replace(/\.$/, '')
  return RESERVED_DOMAINS.some((item) => host === item || host.endsWith(`.${item}`))
}

function scanText(rel, text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let email = false
    for (const match of line.matchAll(EMAIL)) {
      if (!reservedEmail(match[1])) email = true
    }
    const phone = [...line.matchAll(PHONE)].length > 0
    if (email) hits.push(`${rel}:${i + 1} email`)
    if (phone) hits.push(`${rel}:${i + 1} phone`)
  }
  return hits
}

function isScanPath(rel) {
  const dot = rel.lastIndexOf('.')
  const ext = dot >= 0 ? rel.slice(dot) : ''
  if (!TEXT_EXT.has(ext)) return false
  if (rel.startsWith('data/')) return true
  return rel === 'fixtures' || rel.startsWith('fixtures/') || rel.includes('/fixtures/')
}

function trackedScanFiles() {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) fail(listed.stderr || 'git ls-files failed')
  return listed.stdout.split('\0').filter(Boolean).filter(isScanPath)
}

function runSecrets() {
  const child = spawnSync(process.execPath, [join(root, 'scripts/ci-secrets-scan.mjs')], {
    cwd: root,
    stdio: 'inherit',
  })
  return child.status ?? 1
}

function schemaMode() {
  const db = readRepo('src-tauri/src/db.rs')
  const pulse = readRepo('src-tauri/src/pulse.rs')
  const version = schemaVersion(db)
  if (version == null) fail('SCHEMA_VERSION missing')
  const created = unique([...createTableNames(db), ...createTableNames(pulse)])
  const shadows = shadowTables(db)
  const discovered = unique([...created, ...shadows])
  const listed = listedNames(readRepo('docs/ops/merge-tables.txt'))
  const diff = listDiff(discovered, listed)
  if (diff.duplicate.length || diff.missing.length || diff.extra.length) {
    for (const name of diff.duplicate) console.error(`duplicate ${name}`)
    for (const name of diff.missing) console.error(`missing ${name}`)
    for (const name of diff.extra) console.error(`extra ${name}`)
    process.exit(1)
  }
  console.log(`schema_version ${version}`)
  console.log(`create_tables ${created.length}`)
  console.log(`shadow_tables ${shadows.length}`)
  console.log(`tables ${discovered.length}`)
  console.log(`issue_tables ${ISSUE_TABLES}`)
  console.log('ok')
}

function receiptMode(path) {
  const parsed = parseReceipt(readReceipt(path))
  if (parsed.error) fail(parsed.error)
  printReceipt(parsed)
}

function piiMode() {
  const hits = []
  for (const rel of trackedScanFiles()) {
    let text
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    if (text.includes('\0')) continue
    hits.push(...scanText(rel, text))
  }
  for (const hit of hits) console.error(hit)
  const secrets = runSecrets()
  if (hits.length || secrets !== 0) process.exit(1)
  console.log('ok')
}

function parseArgs(argv) {
  const out = { mode: 'schema', receipt: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--pii') {
      if (out.mode !== 'schema') fail('one mode only', 2)
      out.mode = 'pii'
    } else if (arg === '--receipt') {
      if (out.mode !== 'schema') fail('one mode only', 2)
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) fail('missing receipt path', 2)
      out.mode = 'receipt'
      out.receipt = value
      i += 1
    } else {
      fail(`unknown arg ${arg}`, 2)
    }
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'pii') piiMode()
  else if (args.mode === 'receipt') receiptMode(args.receipt)
  else schemaMode()
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return resolve(entry) === fileURLToPath(import.meta.url)
}

if (isDirectRun()) main()

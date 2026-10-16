#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  areasDue,
  areasFor,
  cadenceByArea,
  changedOnMain,
  classifyReceipt,
  executeRust,
  isOperatorDataPath,
  loadAreas,
  lookbackStart,
  rustHits,
  rustPlan,
} from './ci-area-nightly.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/ci-area-nightly.mjs')
const findingsTemplate = readFileSync(join(root, 'docs/ops/FINDINGS.md'), 'utf8')
const findingsBefore = findingsTemplate
const failures = []

function must(ok, message) {
  if (!ok) failures.push(message)
}

function appliedBody() {
  return JSON.stringify({
    integrity: 'ok',
    outcome: 'applied',
    tables: {
      tweets: { insert: 0, update: 0, conflict: 0, box_newer: 0 },
      opportunities: { insert: 2, update: 1, conflict: 0, box_newer: 0 },
    },
  })
}

function run(body, { flag = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'nightly-receipt-'))
  const receiptPath = join(dir, 'receipt.json')
  const findingsPath = join(dir, 'FINDINGS.md')
  const diffPath = join(dir, 'diff.txt')
  writeFileSync(findingsPath, findingsTemplate)
  writeFileSync(diffPath, '')
  if (body !== null) writeFileSync(receiptPath, body)
  const receiptArgs = flag ? ['--receipt', receiptPath] : [receiptPath]
  const child = spawnSync(
    process.execPath,
    [script, ...receiptArgs, '--findings', findingsPath, '--diff-list', diffPath, '--now', '2026-10-16T02:30:00Z'],
    { cwd: root, encoding: 'utf8' },
  )
  const findings = readFileSync(findingsPath, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return { status: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '', findings }
}

const missing = run(null)
must(missing.status === 0, `missing exit\n${missing.stderr}`)
must(missing.stdout === 'missing\nrust skip\n', `missing print\n${missing.stdout}`)
must(missing.findings.includes('| 2026-10-16 | receipt missing | store | data | sync | ask owner | open |'), `missing row\n${missing.findings}`)
must(missing.findings.split('\n').filter((line) => line.startsWith('| 2026-10-16 |')).length === 1, 'missing row count')

const applied = run(appliedBody(), { flag: true })
must(applied.status === 0, `applied exit\n${applied.stderr}`)
must(applied.stdout === 'applied\nrust skip\n', `applied print\n${applied.stdout}`)
must(
  applied.findings.includes(
    '| 2026-10-16 | receipt applied integrity ok inserts 2 updates 1 conflicts 0 box-newer 0 tables opportunities,tweets | store | data | sync | won\'t fix | closed |',
  ),
  `applied row\n${applied.findings}`,
)
must(applied.findings.includes('Decision is `fix now`'), 'legend kept')
must(applied.findings.indexOf('| 2026-10-16 |') < applied.findings.indexOf('Decision is'), 'row stays in the table')

const held = run(
  JSON.stringify({
    integrity: 'ok',
    outcome: 'held',
    tables: { opportunities: { insert: 0, update: 1, conflict: 2, box_newer: 1 } },
  }),
)
must(held.status === 0, `held exit\n${held.stderr}`)
must(held.stdout === 'held\nrust skip\n', `held print\n${held.stdout}`)
must(
  held.findings.includes(
    '| 2026-10-16 | receipt held integrity ok inserts 0 updates 1 conflicts 2 box-newer 1 tables opportunities | store | data | sync | fix now | open |',
  ),
  `held row\n${held.findings}`,
)

const derived = classifyReceipt(
  JSON.stringify({
    integrity: 'ok',
    tables: { firm_scores: { insert: 1, update: 0, conflict: 0, box_newer: 0 } },
  }),
)
must(derived.status === 'applied', `derived applied ${derived.status}`)
must(derived.finding.includes('tables firm_scores'), derived.finding)

const derivedHold = classifyReceipt(
  JSON.stringify({
    integrity: 'ok',
    tables: { firm_scores: { insert: 0, update: 0, conflict: 0, box_newer: 3 } },
  }),
)
must(derivedHold.status === 'held', `derived held ${derivedHold.status}`)
must(derivedHold.decision === 'fix now', derivedHold.decision)

const brokenIntegrity = classifyReceipt(
  JSON.stringify({
    integrity: 'fail',
    outcome: 'held',
    tables: { opportunities: { insert: 0, update: 0, conflict: 0, box_newer: 0 } },
  }),
)
must(brokenIntegrity.status === 'held', 'integrity fail stays held')
must(brokenIntegrity.decision === 'fix now', 'integrity fail is fix now')

const positional = run(appliedBody())
must(positional.stdout === 'applied\nrust skip\n', `positional print\n${positional.stdout}`)

const cleanHold = classifyReceipt(
  JSON.stringify({
    integrity: 'ok',
    outcome: 'held',
    tables: { opportunities: { insert: 0, update: 0, conflict: 0, box_newer: 0 } },
  }),
)
must(cleanHold.status === 'held', 'clean hold stays held')
must(cleanHold.decision === 'ask owner', cleanHold.decision)

const bad = run('{')
must(bad.status === 1, `unreadable exit ${bad.status}`)
must(bad.stdout === '', `unreadable stdout\n${bad.stdout}`)
must(bad.findings.includes('| 2026-10-16 | receipt unreadable | store | data | sync | fix now | open |'), `unreadable row\n${bad.findings}`)
must(!bad.findings.includes('{'), 'unreadable row hides the file')

const blocked = join(homedir(), '.local', 'share', 'collab-finder', 'nightly-receipt.json')
must(isOperatorDataPath(blocked), 'operator path detected')
const refused = spawnSync(process.execPath, [script, blocked, '--findings', join(tmpdir(), 'nightly-unused-findings.md'), '--now', '2026-10-16T02:30:00Z'], {
  cwd: root,
  encoding: 'utf8',
})
must(refused.status === 1, `operator path exit ${refused.status}`)
must((refused.stdout ?? '') === '', `operator path stdout\n${refused.stdout}`)
must((refused.stderr ?? '').includes('refusing operator data directory'), `operator path stderr\n${refused.stderr}`)

const dbPath = join(tmpdir(), 'nightly-receipt.db')
const db = spawnSync(process.execPath, [script, dbPath, '--now', '2026-10-16T02:30:00Z'], {
  cwd: root,
  encoding: 'utf8',
})
must(db.status === 1, `database exit ${db.status}`)
must((db.stdout ?? '') === '', `database stdout\n${db.stdout}`)
must((db.stderr ?? '').includes('refusing database file'), `database stderr\n${db.stderr}`)

const linkDir = mkdtempSync(join(tmpdir(), 'nightly-link-'))
const linkPath = join(linkDir, 'receipt.json')
const linkFindings = join(linkDir, 'FINDINGS.md')
writeFileSync(linkFindings, findingsTemplate)
symlinkSync(blocked, linkPath)
const linked = spawnSync(process.execPath, [script, linkPath, '--findings', linkFindings, '--now', '2026-10-16T02:30:00Z'], {
  cwd: root,
  encoding: 'utf8',
})
const linkLog = readFileSync(linkFindings, 'utf8')
must(linked.status === 1, `symlink exit ${linked.status}`)
must((linked.stdout ?? '') === '', `symlink stdout\n${linked.stdout}`)
must(linkLog === findingsTemplate, 'symlink did not write a row')
rmSync(linkDir, { recursive: true, force: true })

const areas = loadAreas(readFileSync(join(root, 'docs/ops/areas.json'), 'utf8'))
const cadence = cadenceByArea(readFileSync(join(root, 'docs/ops/AREAS.md'), 'utf8'))
must(areas != null && cadence != null, 'live area map')
must(cadence.get('store') === 'Nightly', `store cadence ${cadence && cadence.get('store')}`)
must(cadence.get('pipeline') === 'Weekly', `pipeline cadence ${cadence && cadence.get('pipeline')}`)
must(cadence.get('hire-board') === 'Monthly', `hire-board cadence ${cadence && cadence.get('hire-board')}`)
must(areasFor('src-tauri/src/db.rs', areas).join(',') === 'store', 'db.rs is store')
must(areasFor('src-tauri/src/qualify_policy.rs', areas).join(',') === 'pipeline', 'qualify_policy.rs is pipeline')
must(areasFor('src-tauri/src/hire_board.rs', areas).join(',') === 'hire-board', 'hire_board.rs is hire-board')

const friday = areasDue(cadence, '2026-10-16')
const monday = areasDue(cadence, '2026-10-19')
const month = areasDue(cadence, '2026-11-01')
const monthMonday = areasDue(cadence, '2026-06-01')
must(friday.has('store') && !friday.has('pipeline') && !friday.has('hire-board'), 'friday scope')
must(monday.has('store') && monday.has('pipeline') && !monday.has('hire-board'), 'monday scope')
must(month.has('hire-board') && month.has('store') && !month.has('pipeline'), 'first scope')
must(monthMonday.has('pipeline') && monthMonday.has('hire-board'), 'monday the first')
must(rustHits(['src-tauri/src/db.rs', 'src/view/screens/discover-screen.tsx'], areas, friday).length === 1, 'tsx stays out')
must(rustHits(['src-tauri/src/qualify_policy.rs'], areas, friday).length === 0, 'weekly rust waits')
must(rustHits(['src-tauri/src/qualify_policy.rs'], areas, monday).length === 1, 'weekly rust on monday')
must(rustHits(['src-tauri/src/hire_board.rs'], areas, month).length === 1, 'monthly rust on the first')

const two = rustHits(['src-tauri/src/db.rs', 'src-tauri/src/lib.rs'], areas, friday)
must(two.length === 2, `two rust files ${two.length}`)
const suite = rustPlan(two)
must(suite.length === 2, 'one seed and one lib suite')
must(suite[0].args[0] === 'scripts/seed-testdata-for-ci.sh', suite[0].label)
must(suite[1].cmd === 'cargo' && suite[1].args.join(' ') === 'test --lib', suite[1].label)
must(suite[1].cwd === join(root, 'src-tauri'), suite[1].cwd)
must(rustPlan([]).length === 0, 'empty plan')

must(lookbackStart('2026-10-16T02:30:00Z') === '2026-10-15T02:30:00.000Z', lookbackStart('2026-10-16T02:30:00Z'))
must(lookbackStart('2026-10-19T02:30:00Z') === '2026-10-12T02:30:00.000Z', lookbackStart('2026-10-19T02:30:00Z'))
must(lookbackStart('2026-11-01T04:30:00Z') === '2026-10-01T00:00:00.000Z', lookbackStart('2026-11-01T04:30:00Z'))
must(lookbackStart('2026-06-01T02:30:00Z') === '2026-05-01T00:00:00.000Z', lookbackStart('2026-06-01T02:30:00Z'))

const gitCalls = []
const gitFiles = changedOnMain('2026-10-15T02:30:00.000Z', (cmd, args) => {
  gitCalls.push([cmd, ...args])
  if (args[0] === 'rev-list') return { status: 0, stdout: 'abc123\n', stderr: '' }
  return { status: 0, stdout: 'src-tauri/src/db.rs\nsrc-tauri/src/db.rs\n', stderr: '' }
})
must(!gitFiles.error, gitFiles.error)
must(gitFiles.files.length === 1 && gitFiles.files[0] === 'src-tauri/src/db.rs', 'diff names')
must(gitCalls[0][1] === 'rev-list' && gitCalls[0].includes('origin/main'), 'rev-list origin/main')
must(gitCalls[1][1] === 'diff' && gitCalls[1].includes('--name-only') && gitCalls[1].includes('abc123'), 'diff names command')

const spawned = []
const ran = executeRust(suite, (cmd, args, opts) => {
  spawned.push({ cmd, args: args.join(' '), cwd: opts.cwd })
  return { status: 0 }
})
must(ran === 0, `execute ${ran}`)
must(spawned.length === 2, 'seed then one cargo')
must(spawned[0].cmd === 'bash' && spawned[0].args === 'scripts/seed-testdata-for-ci.sh', spawned[0].args)
must(spawned[1].cmd === 'cargo' && spawned[1].args === 'test --lib', spawned[1].args)
must(spawned[1].cwd.endsWith(`${sep}src-tauri`), spawned[1].cwd)
let cargoStarts = 0
const stopped = executeRust(suite, () => {
  cargoStarts += 1
  return { status: 4 }
})
must(stopped === 4 && cargoStarts === 1, 'seed failure skips cargo')

function rustCli(files, day, dryRun) {
  const dir = mkdtempSync(join(tmpdir(), 'nightly-rust-'))
  const receiptPath = join(dir, 'receipt.json')
  const findingsPath = join(dir, 'FINDINGS.md')
  const diffPath = join(dir, 'diff.txt')
  writeFileSync(receiptPath, appliedBody())
  writeFileSync(findingsPath, findingsTemplate)
  writeFileSync(diffPath, `${files.join('\n')}\n`)
  const args = [
    script,
    receiptPath,
    '--findings',
    findingsPath,
    '--diff-list',
    diffPath,
    '--now',
    `${day}T02:30:00Z`,
  ]
  if (dryRun) args.push('--dry-run')
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  rmSync(dir, { recursive: true, force: true })
  return { status: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '' }
}

const dry = rustCli(['src-tauri/src/db.rs', 'src-tauri/src/lib.rs'], '2026-10-16', true)
must(dry.status === 0, `dry exit\n${dry.stderr}`)
must(dry.stdout.startsWith('applied\n'), dry.stdout)
must(dry.stdout.includes('rust run\n'), dry.stdout)
must(dry.stdout.includes('bash scripts/seed-testdata-for-ci.sh\n'), dry.stdout)
must((dry.stdout.match(/cargo test --lib/g) || []).length === 1, dry.stdout)
must(!dry.stdout.includes('Compiling'), dry.stdout)
must(dry.stdout.indexOf('bash scripts/seed-testdata-for-ci.sh') < dry.stdout.indexOf('cargo test --lib'), 'seed before cargo')

const weeklyDry = rustCli(['src-tauri/src/qualify_policy.rs'], '2026-10-16', false)
must(weeklyDry.status === 0, `weekly exit\n${weeklyDry.stderr}`)
must(weeklyDry.stdout === 'applied\nrust skip\n', weeklyDry.stdout)

const mondayRun = rustCli(['src-tauri/src/qualify_policy.rs'], '2026-10-19', true)
must(mondayRun.stdout.includes('rust run\n'), mondayRun.stdout)
must((mondayRun.stdout.match(/cargo test --lib/g) || []).length === 1, mondayRun.stdout)

const screenOnly = rustCli(['src/view/screens/discover-screen.tsx'], '2026-10-16', false)
must(screenOnly.stdout === 'applied\nrust skip\n', screenOnly.stdout)

const findingsAfter = readFileSync(join(root, 'docs/ops/FINDINGS.md'), 'utf8')
must(findingsBefore === findingsAfter, 'repo findings log unchanged')

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}
console.log('ok')

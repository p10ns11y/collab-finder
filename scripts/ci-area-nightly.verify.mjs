#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyReceipt, isOperatorDataPath } from './ci-area-nightly.mjs'

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
  writeFileSync(findingsPath, findingsTemplate)
  if (body !== null) writeFileSync(receiptPath, body)
  const receiptArgs = flag ? ['--receipt', receiptPath] : [receiptPath]
  const child = spawnSync(
    process.execPath,
    [script, ...receiptArgs, '--findings', findingsPath, '--now', '2026-10-16T02:30:00Z'],
    { cwd: root, encoding: 'utf8' },
  )
  const findings = readFileSync(findingsPath, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return { status: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '', findings }
}

const missing = run(null)
must(missing.status === 0, `missing exit\n${missing.stderr}`)
must(missing.stdout === 'missing\n', `missing print\n${missing.stdout}`)
must(missing.findings.includes('| 2026-10-16 | receipt missing | store | data | sync | ask owner | open |'), `missing row\n${missing.findings}`)
must(missing.findings.split('\n').filter((line) => line.startsWith('| 2026-10-16 |')).length === 1, 'missing row count')

const applied = run(appliedBody(), { flag: true })
must(applied.status === 0, `applied exit\n${applied.stderr}`)
must(applied.stdout === 'applied\n', `applied print\n${applied.stdout}`)
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
must(held.stdout === 'held\n', `held print\n${held.stdout}`)
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
must(positional.stdout === 'applied\n', `positional print\n${positional.stdout}`)

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

const findingsAfter = readFileSync(join(root, 'docs/ops/FINDINGS.md'), 'utf8')
must(findingsBefore === findingsAfter, 'repo findings log unchanged')

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}
console.log('ok')

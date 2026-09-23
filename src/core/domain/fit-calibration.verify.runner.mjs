#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { calibrationReport } from './fit-calibration.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

const near = (a, b) => Math.abs(a - b) < 1e-9

const synthetic = calibrationReport([
  { id: 1, fit_score: 80, outcome_status: 'rejected' },
  { id: 2, fit_score: 90, outcome_status: 'offer' },
])
must(synthetic.paired === 2, 'synthetic paired count')
must(synthetic.mae !== null && near(synthetic.mae, 0.45), `mae ${synthetic.mae}`)
must(synthetic.brier !== null && near(synthetic.brier, 0.325), `brier ${synthetic.brier}`)
const high = synthetic.reliability.find((bin) => bin.lo === 80)
must(high?.n === 2, 'both scores land in the top bin')
must(high?.gap !== null && near(high.gap, 0.85 - 0.5), `reliability gap ${high?.gap}`)

const censored = calibrationReport([
  { id: 3, fit_score: 99, outcome_status: 'waiting' },
  { id: 4, fit_score: 10, outcome_status: 'screening' },
])
must(censored.censored === 2 && censored.paired === 0 && censored.brier === null, 'ghost and screening stay out of the score')

const fixture = JSON.parse(
  readFileSync(join(root, 'src/core/domain/fixtures/outcome-seed.json'), 'utf8'),
)
const seedRows = fixture.rows.map((row) => ({
  id: row.id,
  fit_score: row.fit_score,
  outcome_status: row.outcome_status,
}))
must(seedRows.some((row) => row.id === 530), 'Neko #530 is in the seed')
must(seedRows.filter((row) => row.fit_score != null).length === 0, 'seed does not invent fit scores')
const seed = calibrationReport(seedRows)
const paperRejects = [533, 535, 536, 17, 534, 530]
must(seed.unscored === paperRejects.length, `unscored paper rejects ${seed.unscored}`)
must(seed.paired === 0 && seed.brier === null && seed.mae === null, 'no paired seed rows, so no fabricated error')
must(seed.censored === seedRows.length - paperRejects.length, 'waiting, silence, and CAPTCHA stay censored')

const script = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', join(root, 'scripts/fit-calibration.mjs')],
  { encoding: 'utf8', cwd: root },
)
must((script.status ?? 1) === 0, 'fit-calibration.mjs exits 0')
const printed = JSON.parse(script.stdout || '{}')
must(printed.unscored === 6 && printed.brier === null, 'cli report matches the seed')
const homeMark = ['', 'home', ''].join('/')
must(!script.stdout.includes(homeMark), 'cli output has no home path')

console.log('=== fit-calibration.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

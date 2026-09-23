#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  applyOutcome,
  emptyPolicy,
  firmKey,
  qualifies,
  rewardDelta,
} from './qualify-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

must(firmKey('xAI') === 'xai', 'firm key folds case')
must(firmKey('  ') === '', 'blank company is not a firm')
must(rewardDelta('waiting') === null, 'ghost is not a reward')
must(rewardDelta('screening') === null, 'screening is not a reward')
must(rewardDelta('withdrawn') === null, 'withdrawn is not a reward')
must(rewardDelta('rejected') === -8, 'paper reject steps the firm down')
must(rewardDelta('offer') === 8, 'offer steps the firm up')

let policy = emptyPolicy()
const first = applyOutcome(policy, { outcomeId: 533, company: 'Legora', outcomeStatus: 'rejected' })
must(first.changed && first.audit?.delta === -8 && first.audit.before === 0 && first.audit.after === -8, 'one reject, one audit')
must(first.policy.firm_weights.legora === -8, 'legora weight')
const again = applyOutcome(first.policy, { outcomeId: 533, company: 'Legora', outcomeStatus: 'rejected' })
must(!again.changed && again.policy.firm_weights.legora === -8, 'logging the same outcome does not stack')

const waiting = applyOutcome(first.policy, { outcomeId: 540, company: 'Proposales', outcomeStatus: 'waiting' })
must(!waiting.changed && waiting.policy.firm_weights.proposales === undefined, 'interview-wait does not invent a prior')

const cleared = applyOutcome(first.policy, { outcomeId: 533, company: 'Legora', outcomeStatus: '' })
must(cleared.changed && cleared.policy.firm_weights.legora === undefined && cleared.policy.audit.length === 0, 'clearing the outcome reverts the prior')

const noFirm = applyOutcome(emptyPolicy(), { outcomeId: 1, company: '', outcomeStatus: 'rejected' })
must(!noFirm.changed && noFirm.policy.audit.length === 0, 'no company means no invented firm')

must(qualifies(null, 0) === true, 'missing fit at weight 0 stays qualified')
must(qualifies(null, -8) === false, 'missing fit drops when the firm weight goes negative')
must(qualifies(90, -8) === true, 'a stored 90 still clears 70 after one step')
must(qualifies(70, -8) === false, 'a stored 70 fails the gate after one step')

const script = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', join(root, 'scripts/qualify-hillclimb.mjs')],
  { encoding: 'utf8', cwd: root },
)
must((script.status ?? 1) === 0, `hillclimb script exit ${script.status}`)
const report = JSON.parse(script.stdout || '{}')
must(report.metric === 'held_out_false_qualify_rate', 'metric name')
must(report.before === 1 && report.after === 0, `hillclimb ${report.before} → ${report.after}`)
must(report.control_before === 1 && report.control_after === 1, 'Neko control is untouched')
must(report.train_outcome_id === 533 && report.held_out_outcome_id === 535, 'blinded split')
const homeMark = ['', 'home', ''].join('/')
must(!script.stdout.includes(homeMark), 'hillclimb output has no home path')

console.log('=== qualify-policy.verify ===')
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  if (script.stdout) console.error(script.stdout)
  if (script.stderr) console.error(script.stderr)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  applyOutcome,
  classifyRejectFeedback,
  emptyPolicy,
  firmKey,
  GENERIC_REJECT_PHRASES,
  policyDelta,
  qualifies,
  rewardDelta,
  SPECIFIC_REJECT_PHRASES,
} from './qualify-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const failures = []
function must(condition, message) {
  if (!condition) failures.push(message)
}

const specificNote =
  'feedback: not a fit for the staff role; lacking production experience the panel asked about'

must(firmKey('xAI') === 'xai', 'firm key folds case')
must(firmKey('  ') === '', 'blank company is not a firm')
must(rewardDelta('waiting') === null, 'ghost is not a reward')
must(rewardDelta('screening') === null, 'screening is not a reward')
must(rewardDelta('withdrawn') === null, 'withdrawn is not a reward')
must(rewardDelta('rejected') === -8, 'rejected step is still -8')
must(rewardDelta('offer') === 8, 'offer steps the firm up')
must(policyDelta('rejected', '') === null, 'empty reject notes do not write')
must(policyDelta('rejected', 'position filled') === null, 'position filled does not write')
must(policyDelta('rejected', specificNote) === -8, 'specific feedback still steps down')
must(policyDelta('interview', '') === 8, 'interview still steps up without a reject note')
must(policyDelta('offer', 'position filled') === 8, 'offer is not blocked by a generic note')

for (const phrase of GENERIC_REJECT_PHRASES) {
  must(classifyRejectFeedback(phrase) === 'generic', `generic phrase: ${phrase}`)
}
for (const phrase of SPECIFIC_REJECT_PHRASES) {
  must(classifyRejectFeedback(phrase) === 'specific', `specific phrase: ${phrase}`)
}
must(classifyRejectFeedback('   ') === 'generic', 'blank notes are generic')
must(
  classifyRejectFeedback('2026-09-23 Ashby paper, no tailored feedback') === 'generic',
  'Neko paper screen is generic',
)
must(
  classifyRejectFeedback('The position has been filled. Thank you for your interest.') === 'generic',
  'filled-role template is generic',
)
must(
  classifyRejectFeedback('Thank you for your interest. feedback: not a fit; lacking production experience') ===
    'specific',
  'a real reason inside a template is specific',
)

let policy = emptyPolicy()
const first = applyOutcome(policy, {
  outcomeId: 533,
  company: 'Legora',
  outcomeStatus: 'rejected',
  feedback: specificNote,
})
must(first.changed && first.audit?.delta === -8 && first.audit.before === 0 && first.audit.after === -8, 'one specific reject, one audit')
must(first.policy.firm_weights.legora === -8, 'legora weight')
const again = applyOutcome(first.policy, {
  outcomeId: 533,
  company: 'Legora',
  outcomeStatus: 'rejected',
  feedback: specificNote,
})
must(!again.changed && again.policy.firm_weights.legora === -8, 'logging the same outcome does not stack')

const paper = applyOutcome(emptyPolicy(), {
  outcomeId: 533,
  company: 'Legora',
  outcomeStatus: 'rejected',
  feedback: 'paper reject',
})
must(!paper.changed && paper.policy.firm_weights.legora === undefined, 'paper reject does not write')

const neko = applyOutcome(first.policy, {
  outcomeId: 530,
  company: 'Neko',
  outcomeStatus: 'rejected',
  feedback: '2026-09-23 Ashby paper, no tailored feedback',
})
must(!neko.changed && neko.policy.firm_weights.neko === undefined && neko.policy.firm_weights.legora === -8, 'Neko paper screen leaves the prior alone')

const positionFilled = applyOutcome(emptyPolicy(), {
  outcomeId: 9101,
  company: 'Neko',
  outcomeStatus: 'rejected',
  feedback: 'position filled',
})
must(!positionFilled.changed && positionFilled.policy.audit.length === 0, 'position filled is stage-only')

const undone = applyOutcome(first.policy, {
  outcomeId: 533,
  company: 'Legora',
  outcomeStatus: 'rejected',
  feedback: 'position filled',
})
must(undone.changed && undone.policy.firm_weights.legora === undefined && undone.policy.audit.length === 0, 'a later generic note drops the prior')

const waiting = applyOutcome(first.policy, {
  outcomeId: 540,
  company: 'Proposales',
  outcomeStatus: 'waiting',
})
must(!waiting.changed && waiting.policy.firm_weights.proposales === undefined, 'interview-wait does not invent a prior')

const cleared = applyOutcome(first.policy, {
  outcomeId: 533,
  company: 'Legora',
  outcomeStatus: '',
  feedback: specificNote,
})
must(cleared.changed && cleared.policy.firm_weights.legora === undefined && cleared.policy.audit.length === 0, 'clearing the outcome reverts the prior')

const noFirm = applyOutcome(emptyPolicy(), {
  outcomeId: 1,
  company: '',
  outcomeStatus: 'rejected',
  feedback: specificNote,
})
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
must(report.metric === 'false_policy_write_rate_on_generic_rejects', 'metric name')
must(report.before === 1 && report.after === 0, `hillclimb ${report.before} → ${report.after}`)
must(report.neko_weight_after_generic === null, 'Neko weight stays unset after generic rows')
must(report.specific_delta === -8 && report.specific_firm_key === 'legora', 'specific feedback still writes one step')
must(report.specific_outcome_id === 9105, 'specific fixture id')
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

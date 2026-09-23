#!/usr/bin/env node
/**
 * Blinded QUALIFY hillclimb.
 *
 * Metric: false-policy-write rate on generic rejects.
 * Before is the unguarded step: every rejected row with a firm moved the prior.
 * After, the feedback gate is on. Generic phrases and empty notes do not move it.
 * One separate specific-feedback row still writes a single reversible step.
 *
 * The generic set is the cited paper rejects (including the Neko paper screen)
 * plus position-filled, auto-close, and empty-note fixtures. Each row is applied
 * on its own from an empty prior, so a second row cannot hide a write.
 *
 *   node --experimental-strip-types scripts/qualify-hillclimb.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyOutcome,
  classifyRejectFeedback,
  emptyPolicy,
  falsePolicyWriteRate,
  firmKey,
} from '../src/core/domain/qualify-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'src/core/domain/fixtures/outcome-seed.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
const cited = Array.isArray(fixture.rows) ? fixture.rows : []
const gate = fixture.policy_gate
if (!gate || !Array.isArray(gate.generic) || !Array.isArray(gate.specific) || gate.specific.length !== 1) {
  console.error('outcome seed is missing policy_gate fixtures')
  process.exit(1)
}

const citedRejects = cited.filter((row) => (row.outcome_status || '').trim().toLowerCase() === 'rejected')
const generic = [...citedRejects]
for (const row of gate.generic) {
  if (!generic.some((existing) => existing.id === row.id)) generic.push(row)
}
const specific = gate.specific[0]

for (const row of generic) {
  if (row.fit_score != null) {
    console.error(`generic row ${row.id} has a fit_score; the fixture must not invent one`)
    process.exit(1)
  }
  if (classifyRejectFeedback(row.stage_note) !== 'generic') {
    console.error(`row ${row.id} was expected to be generic`)
    process.exit(1)
  }
}
if (specific.fit_score != null) {
  console.error('specific fixture must not invent a fit_score')
  process.exit(1)
}
if (classifyRejectFeedback(specific.stage_note) !== 'specific') {
  console.error('specific fixture did not classify as specific')
  process.exit(1)
}

const before = falsePolicyWriteRate(generic, 'before')
const after = falsePolicyWriteRate(generic, 'after')

let sequential = emptyPolicy()
for (const row of generic) {
  sequential = applyOutcome(sequential, {
    outcomeId: row.id,
    company: row.company,
    outcomeStatus: row.outcome_status,
    feedback: row.stage_note,
  }).policy
}
const specificApplied = applyOutcome(sequential, {
  outcomeId: specific.id,
  company: specific.company,
  outcomeStatus: specific.outcome_status,
  feedback: specific.stage_note,
})
const nekoKey = firmKey('Neko')
const specificKey = firmKey(specific.company)

const report = {
  metric: 'false_policy_write_rate_on_generic_rejects',
  blinded: true,
  generic_count: generic.length,
  before,
  after,
  delta: before === null || after === null ? null : after - before,
  specific_outcome_id: specific.id,
  specific_firm_key: specificKey,
  specific_delta: specificApplied.audit?.delta ?? null,
  neko_weight_after_generic: sequential.firm_weights[nekoKey] ?? null,
  neko_weight_after_specific: specificApplied.policy.firm_weights[nekoKey] ?? null,
  note: 'Before counts an unguarded reject step on every generic row. After, those rows leave the prior unchanged. The specific-feedback row is not part of the rate; it still writes one step.',
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

const genericWeights = Object.keys(sequential.firm_weights)
const ok =
  before === 1 &&
  after === 0 &&
  generic.length >= 8 &&
  genericWeights.length === 0 &&
  specificApplied.changed &&
  specificApplied.audit?.delta === -8 &&
  specificApplied.audit?.firm_key === specificKey &&
  specificApplied.policy.firm_weights[nekoKey] === undefined &&
  specificApplied.policy.firm_weights[specificKey] === -8
if (!ok) process.exit(1)

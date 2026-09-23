#!/usr/bin/env node
/**
 * Blinded QUALIFY hillclimb.
 *
 * Train on Legora AI #533 (paper reject) only.
 * Held-out is Legora SE #535 — same firm, outcome not an input to the update.
 * Control is Neko Lead SE #530 — a different firm, so its weight must stay put.
 *
 * Metric: held-out false-qualify rate.
 * The cited seed has no resolved interview/offer, so QUALIFY precision stays 0
 * before (the reject is a false positive) and is undefined after (no positive
 * prediction left). The rate that moves is false qualifies: 1 → 0.
 *
 * Missing fit_score is not imputed. It counts as historically qualified iff
 * the firm weight is still >= 0 (the application was the qualify decision).
 *
 *   node --experimental-strip-types scripts/qualify-hillclimb.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyOutcome,
  emptyPolicy,
  falseQualifyRate,
} from '../src/core/domain/qualify-policy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = join(root, 'src/core/domain/fixtures/outcome-seed.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
const byId = new Map(fixture.rows.map((row) => [row.id, row]))

const train = byId.get(533)
const heldOut = byId.get(535)
const control = byId.get(530)
if (!train || !heldOut || !control) {
  console.error('outcome seed is missing 533, 535, or 530')
  process.exit(1)
}
for (const row of [train, heldOut, control]) {
  if (row.fit_score !== null) {
    console.error(`seed row ${row.id} has a fit_score; the fixture must not invent one`)
    process.exit(1)
  }
}

function asHill(row) {
  return {
    id: row.id,
    company: row.company,
    outcome_status: row.outcome_status,
    fit_score: row.fit_score,
  }
}

const beforePolicy = emptyPolicy()
const trained = applyOutcome(beforePolicy, {
  outcomeId: train.id,
  company: train.company,
  outcomeStatus: train.outcome_status,
})

const before = falseQualifyRate([asHill(heldOut)], beforePolicy)
const after = falseQualifyRate([asHill(heldOut)], trained.policy)
const controlBefore = falseQualifyRate([asHill(control)], beforePolicy)
const controlAfter = falseQualifyRate([asHill(control)], trained.policy)

const report = {
  metric: 'held_out_false_qualify_rate',
  blinded: true,
  train_outcome_id: train.id,
  held_out_outcome_id: heldOut.id,
  control_outcome_id: control.id,
  before,
  after,
  delta: before === null || after === null ? null : after - before,
  control_before: controlBefore,
  control_after: controlAfter,
  qualify_precision_before: before === 1 ? 0 : null,
  qualify_precision_after: after === 0 ? null : 0,
  audit: trained.audit,
  note: 'Precision is 0 before because the only held-out label is a paper reject. After the firm prior drops, the gate no longer qualifies it, so precision is undefined (no predicted positives). False-qualify rate is the number that moves.',
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

const ok =
  trained.changed &&
  trained.audit?.firm_key === 'legora' &&
  trained.audit?.delta === -8 &&
  before === 1 &&
  after === 0 &&
  controlBefore === 1 &&
  controlAfter === 1 &&
  trained.policy.firm_weights.neko === undefined
if (!ok) process.exit(1)

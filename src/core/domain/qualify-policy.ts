/**
 * QUALIFY firm-weight prior.
 * One logged stage outcome updates one firm, and the audit row is how you undo it.
 * Reward stages: rejected −8, interview/offer +8. Waiting, screening, ghost, and
 * withdrawn do not move the prior (withdrawn is a calibration label, not a reward).
 *
 * Keep STEP, CLAMP, rewards, and the missing-fit qualify rule aligned with
 * src-tauri/src/qualify_policy.rs.
 */

export const QUALIFY_STEP = 8
export const QUALIFY_CLAMP = 40
export const FIT_QUALIFY_THRESHOLD = 70

export type QualifyAudit = {
  outcome_id: number
  firm_key: string
  outcome_status: string
  before: number
  after: number
  delta: number
}

export type QualifyPolicy = {
  version: 1
  firm_weights: Record<string, number>
  audit: QualifyAudit[]
}

export type ApplyResult = {
  policy: QualifyPolicy
  changed: boolean
  audit: QualifyAudit | null
}

export function emptyPolicy(): QualifyPolicy {
  return { version: 1, firm_weights: {}, audit: [] }
}

export function firmKey(company: string | null | undefined): string {
  return (company || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Signed step for a reward stage. Null means "do not learn from this row". */
export function rewardDelta(outcome: string | null | undefined): number | null {
  const s = (outcome || '').trim().toLowerCase()
  if (s === 'rejected') return -QUALIFY_STEP
  if (s === 'interview' || s === 'offer') return QUALIFY_STEP
  return null
}

export function weightOf(policy: QualifyPolicy, company: string | null | undefined): number {
  const key = firmKey(company)
  if (!key) return 0
  return policy.firm_weights[key] ?? 0
}

/**
 * Qualify decision after the prior.
 * A missing fit is the historical "we already submitted" decision: weight >= 0 keeps it.
 * A stored fit uses the existing 70 gate plus the firm weight. Stored fit is never rewritten.
 */
export function qualifies(
  fitScore: number | null | undefined,
  firmWeight: number,
): boolean {
  if (typeof fitScore !== 'number' || !Number.isFinite(fitScore)) return firmWeight >= 0
  return fitScore + firmWeight >= FIT_QUALIFY_THRESHOLD
}

function clamp(n: number): number {
  return Math.max(-QUALIFY_CLAMP, Math.min(QUALIFY_CLAMP, n))
}

function replay(audit: QualifyAudit[]): { weights: Record<string, number>; audit: QualifyAudit[] } {
  const weights: Record<string, number> = {}
  const next = audit.map((entry) => {
    const before = weights[entry.firm_key] ?? 0
    const after = clamp(before + entry.delta)
    if (after === 0) delete weights[entry.firm_key]
    else weights[entry.firm_key] = after
    return { ...entry, before, after }
  })
  return { weights, audit: next }
}

/**
 * Apply exactly one outcome to the prior.
 * Same outcome id + same firm + same reward is a no-op (logging twice does not stack).
 * A cleared or non-reward status drops that id's audit and replays the rest.
 * No company on a reward stage records nothing — the caller must not invent a firm.
 */
export function applyOutcome(
  policy: QualifyPolicy,
  input: {
    outcomeId: number
    company?: string | null
    outcomeStatus?: string | null
  },
): ApplyResult {
  const outcome = (input.outcomeStatus || '').trim().toLowerCase()
  const key = firmKey(input.company)
  const requested = rewardDelta(outcome)
  const existing = policy.audit.find((row) => row.outcome_id === input.outcomeId)
  if (
    existing &&
    requested !== null &&
    key &&
    existing.outcome_status === outcome &&
    existing.firm_key === key &&
    existing.delta === requested
  ) {
    return { policy, changed: false, audit: null }
  }

  const kept = policy.audit.filter((row) => row.outcome_id !== input.outcomeId)
  if (requested === null || !key) {
    const played = replay(kept)
    const changed = kept.length !== policy.audit.length
    return {
      policy: { version: 1, firm_weights: played.weights, audit: played.audit },
      changed,
      audit: null,
    }
  }

  const played = replay([
    ...kept,
    {
      outcome_id: input.outcomeId,
      firm_key: key,
      outcome_status: outcome,
      before: 0,
      after: 0,
      delta: requested,
    },
  ])
  const audit = played.audit[played.audit.length - 1] ?? null
  return {
    policy: { version: 1, firm_weights: played.weights, audit: played.audit },
    changed: true,
    audit,
  }
}

export type HillRow = {
  id: number
  company: string
  outcome_status: string
  fit_score?: number | null
}

/** Share of resolved negatives the gate still qualifies. Null when there are none. */
export function falseQualifyRate(rows: readonly HillRow[], policy: QualifyPolicy): number | null {
  const negatives = rows.filter((row) => {
    const s = row.outcome_status.trim().toLowerCase()
    return s === 'rejected' || s === 'withdrawn'
  })
  if (negatives.length === 0) return null
  const fp = negatives.filter((row) => qualifies(row.fit_score, weightOf(policy, row.company))).length
  return fp / negatives.length
}

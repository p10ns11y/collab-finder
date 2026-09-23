/**
 * QUALIFY firm-weight prior.
 * One logged stage outcome updates one firm, and the audit row is how you undo it.
 * Interview and offer step +8. A rejection steps −8 only when the note is specific
 * feedback (a skill, fit, or stage reason). Empty notes, generic templates, and
 * paper screens with no tailored feedback do not move the prior.
 * Waiting, screening, ghost, and withdrawn do not move the prior
 * (withdrawn is a calibration label, not a reward).
 *
 * Keep STEP, CLAMP, phrase lists, rewards, and the missing-fit qualify rule aligned with
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

/**
 * Named refuse set. Empty text, and any note that misses the allow set, is generic too.
 * Keep this list aligned with GENERIC_REJECT_PHRASES in qualify_policy.rs.
 */
export const GENERIC_REJECT_PHRASES = [
  'position filled',
  'position has been filled',
  'position is filled',
  'role has been filled',
  'role is filled',
  'no longer available',
  'no longer accepting',
  'requisition closed',
  'auto-close',
  'automatically closed',
  'paper reject',
  'paper screen',
  'paper rejection',
  'no tailored feedback',
  'no feedback',
  'thank you for your interest',
  'thank you for applying',
  'thank you for your application',
  'other candidates',
  'not be moving forward',
  'not moving forward',
  'will not be proceeding',
  'high volume of applicants',
  'we regret to inform',
  'application was unsuccessful',
  'ashby paper',
] as const

/**
 * Honest skill, fit, or stage reason. A hit here is specific even inside a template.
 * Keep this list aligned with SPECIFIC_REJECT_PHRASES in qualify_policy.rs.
 */
export const SPECIFIC_REJECT_PHRASES = [
  'feedback:',
  'reject reason:',
  'rejected because',
  'not a fit',
  'not a match',
  'poor fit',
  'skill gap',
  'lacking experience',
  'lacking production',
  'hiring manager said',
  'did not meet the',
  'does not meet the',
  'overqualified',
  'underqualified',
  'too junior',
  'too senior',
  'failed the screen',
  'failed the interview',
  'technical bar',
  'your background in',
] as const

export type RejectFeedbackClass = 'generic' | 'specific'

export function normalizeRejectFeedback(feedback: string | null | undefined): string {
  return (feedback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Generic unless the note contains one allow-list phrase. Empty notes are generic. */
export function classifyRejectFeedback(feedback: string | null | undefined): RejectFeedbackClass {
  const text = normalizeRejectFeedback(feedback)
  if (!text) return 'generic'
  if (SPECIFIC_REJECT_PHRASES.some((phrase) => text.includes(phrase))) return 'specific'
  return 'generic'
}

/**
 * Step that may be written. Negative rejects need specific feedback.
 * Interview and offer still use the stage step when the note is empty.
 */
export function policyDelta(
  outcome: string | null | undefined,
  feedback?: string | null,
): number | null {
  const step = rewardDelta(outcome)
  if (step === null) return null
  if (step < 0 && classifyRejectFeedback(feedback) !== 'specific') return null
  return step
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
 * A cleared status, a non-reward status, or a generic rejection drops that id's audit and replays the rest.
 * No company on a reward stage records nothing — the caller must not invent a firm.
 */
export function applyOutcome(
  policy: QualifyPolicy,
  input: {
    outcomeId: number
    company?: string | null
    outcomeStatus?: string | null
    /** Opportunity notes, or the reject phrase already on the outcome path. */
    feedback?: string | null
    /**
     * Hillclimb before-arm only. Reproduces the unguarded reject step.
     * The outcome command never sets this.
     */
    blindBefore?: boolean
  },
): ApplyResult {
  const outcome = (input.outcomeStatus || '').trim().toLowerCase()
  const key = firmKey(input.company)
  const requested = input.blindBefore
    ? rewardDelta(outcome)
    : policyDelta(outcome, input.feedback)
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

export type GateRow = {
  id: number
  company: string
  outcome_status: string
  stage_note?: string | null
}

/**
 * Share of generic rejects that moved a firm weight.
 * `before` is the unguarded step. `after` is the feedback gate.
 * Null when the fixture has no generic rejects with a firm.
 */
export function falsePolicyWriteRate(
  rows: readonly GateRow[],
  mode: 'before' | 'after',
): number | null {
  const generic = rows.filter((row) => {
    const status = (row.outcome_status || '').trim().toLowerCase()
    return (
      status === 'rejected' &&
      classifyRejectFeedback(row.stage_note) === 'generic' &&
      firmKey(row.company) !== ''
    )
  })
  if (generic.length === 0) return null
  let writes = 0
  for (const row of generic) {
    const applied = applyOutcome(emptyPolicy(), {
      outcomeId: row.id,
      company: row.company,
      outcomeStatus: row.outcome_status,
      feedback: row.stage_note,
      blindBefore: mode === 'before',
    })
    if (applied.changed) writes += 1
  }
  return writes / generic.length
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

/**
 * Predicted fit (`opportunities.fit_score`, 0–100) vs logged stage (`outcome_status`).
 * Rows without a stored fit stay unscored — this module never imputes one.
 *
 * Label map (resolved stages only):
 *   y = 1  interview, offer
 *   y = 0  rejected, withdrawn
 *   censored  waiting, screening, empty, anything else (ghost / HITL / in flight)
 *
 * p = fit_score / 100
 * MAE  = mean |p − y|
 * Brier = mean (p − y)²
 * Reliability bins are left-closed on fit_score, last bin includes 100.
 */

export type CalibrationRow = {
  id: number
  fit_score?: number | null
  outcome_status?: string | null
}

export type ReliabilityBin = {
  lo: number
  hi: number
  n: number
  mean_predicted: number | null
  mean_outcome: number | null
  /** mean_predicted − mean_outcome. Positive means the fit was too high. */
  gap: number | null
}

export type CalibrationReport = {
  paired: number
  unscored: number
  censored: number
  mae: number | null
  brier: number | null
  reliability: ReliabilityBin[]
  label_map: {
    positive: readonly string[]
    negative: readonly string[]
  }
}

export const POSITIVE_OUTCOMES = ['interview', 'offer'] as const
export const NEGATIVE_OUTCOMES = ['rejected', 'withdrawn'] as const

const BINS: ReadonlyArray<readonly [number, number]> = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
]

export function outcomeLabel(status: string | null | undefined): 0 | 1 | null {
  const s = (status || '').trim().toLowerCase()
  if ((POSITIVE_OUTCOMES as readonly string[]).includes(s)) return 1
  if ((NEGATIVE_OUTCOMES as readonly string[]).includes(s)) return 0
  return null
}

function isFit(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function calibrationReport(rows: readonly CalibrationRow[]): CalibrationReport {
  let paired = 0
  let unscored = 0
  let censored = 0
  let absSum = 0
  let brierSum = 0

  const buckets = BINS.map(([lo, hi]) => ({
    lo,
    hi,
    n: 0,
    predSum: 0,
    ySum: 0,
  }))

  for (const row of rows) {
    const y = outcomeLabel(row.outcome_status)
    if (y === null) {
      censored += 1
      continue
    }
    if (!isFit(row.fit_score)) {
      unscored += 1
      continue
    }
    const p = Math.min(100, Math.max(0, row.fit_score)) / 100
    paired += 1
    absSum += Math.abs(p - y)
    brierSum += (p - y) ** 2
    const score = Math.min(100, Math.max(0, row.fit_score))
    const idx = BINS.findIndex(([lo, hi], i) =>
      i === BINS.length - 1 ? score >= lo && score <= hi : score >= lo && score < hi,
    )
    const bin = buckets[idx === -1 ? buckets.length - 1 : idx]
    bin.n += 1
    bin.predSum += p
    bin.ySum += y
  }

  return {
    paired,
    unscored,
    censored,
    mae: paired === 0 ? null : absSum / paired,
    brier: paired === 0 ? null : brierSum / paired,
    reliability: buckets.map((bin) => {
      if (bin.n === 0) {
        return {
          lo: bin.lo,
          hi: bin.hi,
          n: 0,
          mean_predicted: null,
          mean_outcome: null,
          gap: null,
        }
      }
      const mean_predicted = bin.predSum / bin.n
      const mean_outcome = bin.ySum / bin.n
      return {
        lo: bin.lo,
        hi: bin.hi,
        n: bin.n,
        mean_predicted,
        mean_outcome,
        gap: mean_predicted - mean_outcome,
      }
    }),
    label_map: {
      positive: POSITIVE_OUTCOMES,
      negative: NEGATIVE_OUTCOMES,
    },
  }
}

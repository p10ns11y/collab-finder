/**
 * Dual-lane apply→reply tracking for Pipeline.
 * Sweden / AF / JobTech = slow runway; ATS mission firms = compensating fast-reply lane.
 */

export type ReplyLane = 'sweden' | 'compensating' | 'unknown'

/** Compensating-lane items at or past this age get follow-up priority. */
export const COMPENSATING_FOLLOWUP_DAYS = 2

export type ReplyLaneInput = {
  kind?: string | null
  source_url?: string | null
  source_ref?: string | null
  notes?: string | null
}

const SWEDEN_KINDS = new Set(['platsbanken'])
const SWEDEN_URL_MARKERS = ['arbetsformedlingen', 'platsbanken', 'jobtech']
const COMP_URL_MARKERS = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'boards-api.greenhouse']
const COMP_KINDS = new Set(['mission_firm'])
const COMP_SOURCE_PREFIXES = ['gh:', 'lever:', 'ashby:', 'greenhouse:', 'tesla:']
const COMP_NOTES_MARKERS = ['source:greenhouse', 'source:lever', 'source:ashby', 'source:tesla']

function hay(input: ReplyLaneInput): { kind: string; url: string; ref: string; notes: string } {
  return {
    kind: (input.kind || '').toLowerCase(),
    url: (input.source_url || '').toLowerCase(),
    ref: (input.source_ref || '').toLowerCase(),
    notes: (input.notes || '').toLowerCase(),
  }
}

/** Derive reply tempo lane from persisted opportunity metadata — no hardcoded employer ids. */
export function classifyReplyLane(input: ReplyLaneInput): ReplyLane {
  const { kind, url, ref, notes } = hay(input)

  if (SWEDEN_KINDS.has(kind)) return 'sweden'
  if (SWEDEN_URL_MARKERS.some((m) => url.includes(m))) return 'sweden'
  if (ref.startsWith('jobtech:')) return 'sweden'
  if (notes.includes('municipality=')) return 'sweden'
  if (notes.includes('source:jobtech')) return 'sweden'

  if (COMP_KINDS.has(kind)) return 'compensating'
  if (COMP_URL_MARKERS.some((m) => url.includes(m))) return 'compensating'
  if (COMP_SOURCE_PREFIXES.some((p) => ref.startsWith(p))) return 'compensating'
  if (COMP_NOTES_MARKERS.some((m) => notes.includes(m))) return 'compensating'
  if (kind === 'mission_pull' && /^(greenhouse|lever|ashby|tesla):/.test(ref)) return 'compensating'
  if (kind === 'mission_pull' && COMP_URL_MARKERS.some((m) => url.includes(m))) return 'compensating'

  return 'unknown'
}

export function replyLaneLabel(lane: ReplyLane): string {
  switch (lane) {
    case 'sweden':
      return 'Sweden / AF'
    case 'compensating':
      return 'Fast reply'
    default:
      return 'Other'
  }
}

export function replyLaneShort(lane: ReplyLane): string {
  switch (lane) {
    case 'sweden':
      return 'Sweden'
    case 'compensating':
      return 'ATS'
    default:
      return '—'
  }
}

type WaitingOpp = ReplyLaneInput & {
  status?: string | null
  outcome_status?: string | null
  applied_at?: string | null
}

function parseAppliedIso(iso: string | undefined): Date | null {
  if (!iso) return null
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysSinceApplied(iso: string | undefined, now = new Date()): number | null {
  const applied = parseAppliedIso(iso)
  if (!applied) return null
  const ms = now.getTime() - applied.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

export function isWaitingOnEmployer(opp: WaitingOpp): boolean {
  if ((opp.status || '').trim().toLowerCase() !== 'applied') return false
  const outcome = (opp.outcome_status || 'waiting').trim().toLowerCase()
  return outcome === 'waiting' || outcome === 'screening' || outcome === ''
}

export function needsCompensatingFollowUp(
  opp: WaitingOpp,
  thresholdDays = COMPENSATING_FOLLOWUP_DAYS,
  now = new Date(),
): boolean {
  if (!isWaitingOnEmployer(opp)) return false
  if (classifyReplyLane(opp) !== 'compensating') return false
  const days = daysSinceApplied(opp.applied_at ?? undefined, now)
  return days != null && days >= thresholdDays
}

/** Operator-facing hint under lane chip — no chase pressure on Sweden lane. */
export function replyWaitingHint(
  opp: WaitingOpp,
  now = new Date(),
): string | null {
  if (!isWaitingOnEmployer(opp)) return null
  const lane = classifyReplyLane(opp)
  const days = daysSinceApplied(opp.applied_at ?? undefined, now)
  if (lane === 'sweden') {
    return 'AF runway — replies often take weeks; silence is normal'
  }
  if (lane === 'compensating') {
    if (days == null) return 'Typical ATS reply: 1–2 days'
    if (days >= COMPENSATING_FOLLOWUP_DAYS) return `${days}d waiting — light check-in ok`
    if (days >= 1) return `${days}d — still inside typical 1–2d window`
    return 'Within typical 1–2d reply window'
  }
  if (days != null && days >= COMPENSATING_FOLLOWUP_DAYS) {
    return `${days}d waiting on employer`
  }
  return null
}

/** Follow-up queue first, then oldest compensating waits, then Sweden patience, then rest. */
export function compareForReplyTracking(
  a: WaitingOpp,
  b: WaitingOpp,
  now = new Date(),
): number {
  const aFollow = needsCompensatingFollowUp(a, COMPENSATING_FOLLOWUP_DAYS, now) ? 0 : 1
  const bFollow = needsCompensatingFollowUp(b, COMPENSATING_FOLLOWUP_DAYS, now) ? 0 : 1
  if (aFollow !== bFollow) return aFollow - bFollow

  const aWait = isWaitingOnEmployer(a) ? 0 : 1
  const bWait = isWaitingOnEmployer(b) ? 0 : 1
  if (aWait !== bWait) return aWait - bWait

  const aLane = classifyReplyLane(a)
  const bLane = classifyReplyLane(b)
  const aComp = aLane === 'compensating' && isWaitingOnEmployer(a) ? 0 : 1
  const bComp = bLane === 'compensating' && isWaitingOnEmployer(b) ? 0 : 1
  if (aComp !== bComp) return aComp - bComp

  const da = daysSinceApplied(a.applied_at ?? undefined, now) ?? -1
  const db = daysSinceApplied(b.applied_at ?? undefined, now) ?? -1
  if (db !== da) return db - da

  return (b as { id?: number }).id! - (a as { id?: number }).id!
}

export function sortForReplyTracking<T extends WaitingOpp & { id?: number }>(
  rows: T[],
  now = new Date(),
): T[] {
  return [...rows].sort((a, b) => compareForReplyTracking(a, b, now))
}

export function filterFollowupOpportunities<T extends WaitingOpp>(rows: T[], now = new Date()): T[] {
  return sortForReplyTracking(rows.filter((o) => needsCompensatingFollowUp(o, COMPENSATING_FOLLOWUP_DAYS, now)))
}

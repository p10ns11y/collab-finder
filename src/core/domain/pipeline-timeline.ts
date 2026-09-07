import type { Event } from './history'

export type OpportunityTimeline = {
  analyzedAt?: string
  preppedAt?: string
}

function eventOpportunityId(event: Event): number | null {
  if (!event.payload_json) return null
  try {
    const payload = JSON.parse(event.payload_json) as { opportunity_id?: number }
    return typeof payload.opportunity_id === 'number' ? payload.opportunity_id : null
  } catch {
    return null
  }
}

/** Earliest analyze and latest prep timestamps from the events audit log. */
export function timelineFromEvents(events: Event[], opportunityId: number): OpportunityTimeline {
  let analyzedAt: string | undefined
  let preppedAt: string | undefined
  for (const event of events) {
    if (eventOpportunityId(event) !== opportunityId) continue
    if (event.event_type === 'OpportunityTargetAnalyzed') {
      if (!analyzedAt || event.ts < analyzedAt) analyzedAt = event.ts
    }
    if (event.event_type === 'OpportunityTargetPrepped') {
      if (!preppedAt || event.ts > preppedAt) preppedAt = event.ts
    }
  }
  return { analyzedAt, preppedAt }
}

export function parsePipelineIso(iso: string | undefined): Date | null {
  if (!iso) return null
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatPipelineDate(iso: string | undefined): string {
  const parsed = parsePipelineIso(iso)
  if (!parsed) return iso ? iso.slice(0, 10) : '—'
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

/** Whole days since apply timestamp (UTC-normalized). */
export function daysSinceApplied(iso: string | undefined, now = new Date()): number | null {
  const applied = parsePipelineIso(iso)
  if (!applied) return null
  const ms = now.getTime() - applied.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

export function formatDaysWaiting(days: number | null): string {
  if (days == null) return '—'
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  return `${days}d`
}

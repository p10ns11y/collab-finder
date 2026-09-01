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

export function formatPipelineDate(iso: string | undefined): string {
  if (!iso) return '—'
  const parsed = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10)
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

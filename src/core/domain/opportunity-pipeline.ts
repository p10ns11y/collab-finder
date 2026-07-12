/**
 * Pipeline status for opportunities (Discover rail + panel).
 * Maps existing SQLite `status` strings and extends with applied/passed/archived.
 */

export const PIPELINE_STATUSES = [
  'new',
  'analyzed',
  'prepped',
  'applied',
  'passed',
  'archived',
] as const

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number]

export type PipelineFilter = 'active' | 'all' | PipelineStatus

const ACTIVE: ReadonlySet<string> = new Set(['new', 'analyzed', 'prepped', ''])

export function isPipelineStatus(s: string | undefined | null): s is PipelineStatus {
  return !!s && (PIPELINE_STATUSES as readonly string[]).includes(s)
}

/** Normalize DB status for display/filter. */
export function normalizePipelineStatus(raw: string | undefined | null): PipelineStatus {
  if (!raw || raw === 'web' || raw === 'paste') return 'new'
  if (isPipelineStatus(raw)) return raw
  // legacy / unknown → treat as analyzed if it looks like work in progress
  if (raw.includes('prep')) return 'prepped'
  if (raw.includes('analy')) return 'analyzed'
  return 'analyzed'
}

export function isActivePipelineStatus(status: string | undefined | null): boolean {
  const n = normalizePipelineStatus(status)
  return ACTIVE.has(n)
}

export function pipelineStatusLabel(status: string | undefined | null): string {
  const n = normalizePipelineStatus(status)
  switch (n) {
    case 'new':
      return 'New'
    case 'analyzed':
      return 'Analyzed'
    case 'prepped':
      return 'Prepped'
    case 'applied':
      return 'Applied'
    case 'passed':
      return 'Passed'
    case 'archived':
      return 'Archived'
    default:
      return n
  }
}

/** Sort key: active work first, then by fit desc, then id desc. */
export function compareOpportunitiesForRail(
  a: { id: number; status?: string; fit_score?: number },
  b: { id: number; status?: string; fit_score?: number },
): number {
  const aActive = isActivePipelineStatus(a.status) ? 0 : 1
  const bActive = isActivePipelineStatus(b.status) ? 0 : 1
  if (aActive !== bActive) return aActive - bActive
  const fa = a.fit_score ?? -1
  const fb = b.fit_score ?? -1
  if (fb !== fa) return fb - fa
  return b.id - a.id
}

export function filterOpportunitiesForRail<
  T extends { id: number; status?: string; title?: string; company?: string; source_url?: string },
>(
  rows: T[],
  filter: PipelineFilter,
  query: string,
): T[] {
  const q = query.trim().toLowerCase()
  let list = [...rows]
  if (filter === 'active') {
    list = list.filter((o) => isActivePipelineStatus(o.status))
  } else if (filter !== 'all') {
    list = list.filter((o) => normalizePipelineStatus(o.status) === filter)
  }
  if (q) {
    list = list.filter((o) => {
      const hay = [o.title, o.company, o.source_url, String(o.id), o.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }
  list.sort(compareOpportunitiesForRail)
  return list
}

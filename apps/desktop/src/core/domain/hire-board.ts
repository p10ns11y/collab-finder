/**
 * Hire board — ephemeral sheet leads (filter + skim). Durable rows live in Opportunity.
 * Sheet URL/id: gitignored `data/hire-board/config.local.json` (see config.example.json).
 */

export const HIRE_GEO_TAGS = [
  'remote',
  'sf-bay',
  'nyc',
  'london',
  'eu',
  'sweden',
  'other',
] as const

export type HireGeoTag = (typeof HIRE_GEO_TAGS)[number]

export type HireBoardLead = {
  company: string
  location: string
  career_url: string
  thread_url: string
  geo_tags: string[]
  skim_score: number
  skim_reasons: string[]
  already_in_db: boolean
  opportunity_id?: number | null
}

export type HireBoardFilter = {
  q?: string
  geo?: string[]
  require_career_url?: boolean
  limit?: number
  /** Optional override; otherwise Rust reads config.local.json */
  sheet_url?: string
}

export function careerUrlUsable(url: string | null | undefined): boolean {
  const t = (url ?? '').trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (lower === '—' || lower === '-' || lower === '(mentioned)' || lower === 'n/a') return false
  if (lower.includes('@') && !lower.startsWith('http')) return false
  return true
}

export function toggleGeoTag(selected: string[], tag: string): string[] {
  const set = new Set(selected)
  if (set.has(tag)) set.delete(tag)
  else set.add(tag)
  return [...set]
}

/**
 * Dual-rail hunt keys. JobTech `q` is freetext / AND-ish — never send OR / - / quotes.
 * Rail A (honest) = only what previous employment directly supports (Oneflow/Weavler).
 * Rail B = self-learned / learning AI + agentic workflows — decent enough to apply;
 * not a lie, not industry ML YOE. Still skip research-scientist / PhD titles.
 */

export type HuntRail = 'honest' | 'stretch'

export type HuntRailChip = {
  id: string
  rail: HuntRail
  label: string
  q: string
  municipality?: string
}

export type HarvestedKey = {
  key: string
  rail: HuntRail
  count: number
}

/** Tokens you can claim from paid employment only. */
export const HONEST_KEYS = [
  'typescript',
  'react',
  'playwright',
  'python',
  'integrations',
  'fullstack',
  'systemutvecklare',
  'frontend',
  'senior',
] as const

/** Self-learned AI / agentic titles — apply-worthy. Not research scientist / data scientist. */
export const STRETCH_KEYS = [
  'ai product engineer',
  'ai workflows architect',
  'intelligence architect',
  'robotics software',
  'autonomy software',
  'inference',
  'agents',
  'applied ai',
] as const

const BANNED_PHRASES = [
  'research scientist',
  'data scientist',
  'doktorand',
  'merchandiser',
  'gastroenterologist',
  'account manager',
] as const

const PHRASE_BANK = [
  ...STRETCH_KEYS,
  'senior fullstack',
  'fullstack engineer',
  'fullstack product engineer',
  'senior software engineer',
  'software engineer',
  'frontend engineer',
  'systemutvecklare',
] as const

export const PLATSBANKEN_RAIL_CHIPS: readonly HuntRailChip[] = [
  {
    id: 'honest',
    rail: 'honest',
    label: 'From employment',
    q: 'senior fullstack TypeScript',
    municipality: 'Stockholm',
  },
  {
    id: 'stretch',
    rail: 'stretch',
    label: 'Self-learned AI',
    q: 'AI product engineer',
    municipality: 'Stockholm',
  },
  {
    id: 'intel',
    rail: 'stretch',
    label: 'Intelligence architect',
    q: 'intelligence architect',
    municipality: 'Stockholm',
  },
  {
    id: 'workflows',
    rail: 'stretch',
    label: 'AI workflows',
    q: 'AI workflows architect',
    municipality: 'Stockholm',
  },
]

export const MISSION_QUERY_CHIPS: readonly HuntRailChip[] = [
  { id: 'honest', rail: 'honest', label: 'From employment', q: 'senior typescript react' },
  { id: 'stretch', rail: 'stretch', label: 'Autonomy software', q: 'autonomy software' },
  { id: 'intel', rail: 'stretch', label: 'Intelligence architect', q: 'intelligence architect' },
  { id: 'workflows', rail: 'stretch', label: 'AI workflows', q: 'AI workflows architect' },
]

function isRail(v: unknown): v is HuntRail {
  return v === 'honest' || v === 'stretch'
}

function parseChip(raw: unknown): HuntRailChip | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.label !== 'string' || typeof row.q !== 'string') {
    return null
  }
  if (!isRail(row.rail)) return null
  const chip: HuntRailChip = { id: row.id, rail: row.rail, label: row.label, q: row.q }
  if (typeof row.municipality === 'string' && row.municipality.trim()) {
    chip.municipality = row.municipality
  }
  return chip
}

/** Overlay from `packs/hunt-rails.json`. Empty object → keep in-repo fallbacks. */
export function huntRailsFromUnknown(raw: unknown): {
  missionQueryChips: HuntRailChip[]
  platsbankenRailChips: HuntRailChip[]
} {
  if (!raw || typeof raw !== 'object') {
    return {
      missionQueryChips: [...MISSION_QUERY_CHIPS],
      platsbankenRailChips: [...PLATSBANKEN_RAIL_CHIPS],
    }
  }
  const file = raw as Record<string, unknown>
  const mission = Array.isArray(file.missionQueryChips)
    ? file.missionQueryChips.map(parseChip).filter((c): c is HuntRailChip => c !== null)
    : []
  const sweden = Array.isArray(file.platsbankenRailChips)
    ? file.platsbankenRailChips.map(parseChip).filter((c): c is HuntRailChip => c !== null)
    : []
  return {
    missionQueryChips: mission.length ? mission : [...MISSION_QUERY_CHIPS],
    platsbankenRailChips: sweden.length ? sweden : [...PLATSBANKEN_RAIL_CHIPS],
  }
}

/** Default AF query — simple tokens. `OR` collapses JobTech to a handful of junk hits. */
export const PLATSBANKEN_DEFAULT_QUERY = PLATSBANKEN_RAIL_CHIPS[0].q
export const PLATSBANKEN_DEFAULT_MUNICIPALITY = 'Stockholm'

const BOOLEAN_TOKEN = /^(or|and|not)$/i

/** Strip Google-style operators JobTech treats as literal tokens. */
export function jobtechSafeQuery(raw: string): string {
  return raw
    .replace(/[+"'()-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !BOOLEAN_TOKEN.test(t))
    .join(' ')
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
}

function isBanned(text: string): boolean {
  const n = normalize(text)
  return BANNED_PHRASES.some((p) => n.includes(p))
}

export function classifyKey(key: string): HuntRail {
  const n = normalize(key)
  if (STRETCH_KEYS.some((k) => n.includes(k))) return 'stretch'
  return 'honest'
}

/** Pull title phrases from live ads. Does not auto-append to `q` (AND would collapse). */
export function harvestKeysFromTexts(texts: string[]): HarvestedKey[] {
  const counts = new Map<string, { rail: HuntRail; count: number }>()

  for (const raw of texts) {
    if (!raw || isBanned(raw)) continue
    const n = normalize(raw)
    for (const phrase of PHRASE_BANK) {
      if (!n.includes(phrase)) continue
      const rail = classifyKey(phrase)
      const prev = counts.get(phrase)
      counts.set(phrase, { rail, count: (prev?.count ?? 0) + 1 })
    }
  }

  return [...counts.entries()]
    .map(([key, v]) => ({ key, rail: v.rail, count: v.count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export function mergeHarvested(
  prev: HarvestedKey[],
  next: HarvestedKey[],
  cap = 12,
): HarvestedKey[] {
  const counts = new Map<string, HarvestedKey>()
  for (const row of prev) counts.set(row.key, { ...row })
  for (const row of next) {
    const existing = counts.get(row.key)
    if (existing) {
      existing.count += row.count
    } else {
      counts.set(row.key, { ...row })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, cap)
}

export function adIdFromSavedUrl(url?: string | null, sourceRef?: string | null): string {
  if (sourceRef && sourceRef.trim()) return sourceRef.trim()
  const m = (url || '').match(/annonser\/(\d+)/i)
  return m?.[1] ?? ''
}

/** Map persisted opportunities back into the Sweden list (no live JobTech). */
export function leadsFromSavedOpportunities(
  opps: Array<{
    id: number
    kind: string
    source_url?: string
    source_ref?: string
    title?: string
    company?: string
    jd_text: string
    fit_score?: number
    notes?: string
  }>,
): import('./platsbanken').PlatsbankenLead[] {
  return opps
    .filter((o) => o.kind === 'platsbanken')
    .map((o) => {
      const ad_id = adIdFromSavedUrl(o.source_url, o.source_ref)
      const muni = o.notes?.match(/municipality=([^\s;]+)/i)?.[1]
      const snippet = (o.jd_text || '').replace(/\s+/g, ' ').trim().slice(0, 220)
      return {
        ad_id: ad_id || String(o.id),
        headline: o.title || `Saved ad ${ad_id || o.id}`,
        employer: o.company || '',
        municipality: muni && muni !== '-' ? muni : null,
        occupation: null,
        webpage_url:
          o.source_url ||
          (ad_id ? `https://arbetsformedlingen.se/platsbanken/annonser/${ad_id}` : ''),
        application_url: null,
        publication_date: null,
        application_deadline: null,
        description_snippet: snippet,
        api_relevance: 0,
        rank_score: o.fit_score ?? 0,
        rank_reasons: ['saved'],
        favorite_match: false,
        already_in_db: true,
        opportunity_id: o.id,
      }
    })
}

export function harvestFromHuntLeads(
  leads: Array<{ headline?: string; title?: string; occupation?: string | null }>,
): HarvestedKey[] {
  return harvestKeysFromTexts(
    leads.flatMap((l) => [l.headline, l.title, l.occupation ?? undefined].filter(Boolean) as string[]),
  )
}

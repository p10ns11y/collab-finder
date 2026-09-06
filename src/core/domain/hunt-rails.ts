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

/** Named operator hunt preset — loadable from Mission / Sweden / Discover. */
export type HuntPreset = {
  id: string
  label: string
  q: string
  rail?: HuntRail
  /** Mission firm ids to select when applying (optional). */
  firms?: string[]
  /** Sweden municipality hint when applying on JobTech surface. */
  municipality?: string
}

export type HuntPresetUndo = {
  missionFirmsQ: string
  huntRail: HuntRail
  missionFirmsSelected: string[]
  platsbankenQ: string
  platsbankenMunicipality: string
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

/** Track A role packs (enssembly) — in-repo fallback until pack overlay loads. */
export const TRACK_A_HUNT_PRESETS: readonly HuntPreset[] = [
  {
    id: 'track-a-kernel',
    label: 'Kernel / HITL',
    q: 'rust local-first agent runtime HITL workflow',
    rail: 'stretch',
  },
  {
    id: 'track-a-evals',
    label: 'Evals / reliability',
    q: 'agent evaluation LLM eval harness workflow evaluation AI reliability',
    rail: 'stretch',
  },
  {
    id: 'track-a-hungry',
    label: 'Hungry Rust builders',
    q: 'founding engineer rust junior systems open source agent',
    rail: 'stretch',
  },
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

function parseHuntPreset(raw: unknown): HuntPreset | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.label !== 'string' || typeof row.q !== 'string') {
    return null
  }
  const preset: HuntPreset = { id: row.id, label: row.label, q: row.q }
  if (row.rail !== undefined) {
    if (!isRail(row.rail)) return null
    preset.rail = row.rail
  }
  if (Array.isArray(row.firms)) {
    const firms = row.firms.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    if (firms.length) preset.firms = firms
  }
  if (typeof row.municipality === 'string' && row.municipality.trim()) {
    preset.municipality = row.municipality
  }
  return preset
}

export function applyHuntPresetToModel(
  model: {
    missionFirmsQ: string
    huntRail: HuntRail
    missionFirmsSelected: string[]
    platsbankenQ: string
    platsbankenMunicipality: string
  },
  preset: HuntPreset,
  surface: 'mission' | 'sweden',
): {
  missionFirmsQ: string
  huntRail: HuntRail
  missionFirmsSelected: string[]
  platsbankenQ: string
  platsbankenMunicipality: string
} {
  const rail = preset.rail ?? 'stretch'
  const next = { ...model, huntRail: rail }
  if (surface === 'mission' || preset.firms?.length) {
    next.missionFirmsQ = preset.q
    if (preset.firms?.length) {
      next.missionFirmsSelected = [...preset.firms]
    }
  }
  if (surface === 'sweden') {
    next.platsbankenQ = jobtechSafeQuery(preset.q)
    if (preset.municipality) {
      next.platsbankenMunicipality = preset.municipality
    }
  }
  return next
}

export function snapshotHuntPresetUndo(model: {
  missionFirmsQ: string
  huntRail: HuntRail
  missionFirmsSelected: string[]
  platsbankenQ: string
  platsbankenMunicipality: string
}): HuntPresetUndo {
  return {
    missionFirmsQ: model.missionFirmsQ,
    huntRail: model.huntRail,
    missionFirmsSelected: [...model.missionFirmsSelected],
    platsbankenQ: model.platsbankenQ,
    platsbankenMunicipality: model.platsbankenMunicipality,
  }
}

/** Overlay from `packs/hunt-rails.json`. Empty object → keep in-repo fallbacks. */
export function huntRailsFromUnknown(raw: unknown): {
  missionQueryChips: HuntRailChip[]
  platsbankenRailChips: HuntRailChip[]
  huntPresets: HuntPreset[]
} {
  if (!raw || typeof raw !== 'object') {
    return {
      missionQueryChips: [...MISSION_QUERY_CHIPS],
      platsbankenRailChips: [...PLATSBANKEN_RAIL_CHIPS],
      huntPresets: [...TRACK_A_HUNT_PRESETS],
    }
  }
  const file = raw as Record<string, unknown>
  const mission = Array.isArray(file.missionQueryChips)
    ? file.missionQueryChips.map(parseChip).filter((c): c is HuntRailChip => c !== null)
    : []
  const sweden = Array.isArray(file.platsbankenRailChips)
    ? file.platsbankenRailChips.map(parseChip).filter((c): c is HuntRailChip => c !== null)
    : []
  const presets = Array.isArray(file.huntPresets)
    ? file.huntPresets.map(parseHuntPreset).filter((p): p is HuntPreset => p !== null)
    : []
  return {
    missionQueryChips: mission.length ? mission : [...MISSION_QUERY_CHIPS],
    platsbankenRailChips: sweden.length ? sweden : [...PLATSBANKEN_RAIL_CHIPS],
    huntPresets: presets.length ? presets : [...TRACK_A_HUNT_PRESETS],
  }
}

/** Default AF query — simple tokens. `OR` collapses JobTech to a handful of junk hits. */
export const PLATSBANKEN_DEFAULT_QUERY = PLATSBANKEN_RAIL_CHIPS[0].q
export const PLATSBANKEN_DEFAULT_MUNICIPALITY = 'Stockholm'

const BOOLEAN_TOKEN = /^(or|and|not)$/i

export type JobtechQueryPrep = {
  /** Sanitized AND-style freetext for JobTech `q`. */
  query: string
  /** Tokens stripped (boolean operators, punctuation-only). */
  dropped: string[]
}

/** Strip Google-style operators JobTech treats as literal tokens. */
export function prepareJobtechQuery(raw: string): JobtechQueryPrep {
  const dropped: string[] = []
  const kept: string[] = []
  for (const token of raw.replace(/[+"'()-]/g, ' ').split(/\s+/)) {
    const t = token.trim()
    if (!t) continue
    if (BOOLEAN_TOKEN.test(t)) {
      dropped.push(t)
      continue
    }
    kept.push(t)
  }
  return { query: kept.join(' '), dropped }
}

export function jobtechSafeQuery(raw: string): string {
  return prepareJobtechQuery(raw).query
}

export function jobtechDroppedTokensMessage(dropped: string[]): string | null {
  if (!dropped.length) return null
  return `Removed from JobTech query: ${dropped.join(', ')}`
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

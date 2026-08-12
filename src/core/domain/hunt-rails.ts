/**
 * Dual-rail hunt keys. JobTech `q` is freetext / AND-ish — never send OR / - / quotes.
 * Rail A = hireable-now (Oneflow-shaped). Rail B = stretch-adjacent titles only.
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

/** Professional Oneflow / SWE tokens — honest-now search only. */
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

/** Software-shaped future-now titles. Not research scientist / data scientist. */
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
    label: 'Honest now',
    q: 'senior fullstack TypeScript',
    municipality: 'Stockholm',
  },
  {
    id: 'stretch',
    rail: 'stretch',
    label: 'Stretch adjacent',
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
  { id: 'honest', rail: 'honest', label: 'Honest now', q: 'senior typescript react' },
  { id: 'stretch', rail: 'stretch', label: 'Autonomy software', q: 'autonomy software' },
  { id: 'intel', rail: 'stretch', label: 'Intelligence architect', q: 'intelligence architect' },
  { id: 'workflows', rail: 'stretch', label: 'AI workflows', q: 'AI workflows architect' },
]

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

export function harvestFromHuntLeads(
  leads: Array<{ headline?: string; title?: string; occupation?: string | null }>,
): HarvestedKey[] {
  return harvestKeysFromTexts(
    leads.flatMap((l) => [l.headline, l.title, l.occupation ?? undefined].filter(Boolean) as string[]),
  )
}

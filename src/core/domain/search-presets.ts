import catalog from '../../../data/distillation/x-search/queries.json'

export type SearchPresetTier = 'priority' | 'core' | 'niche' | 'community'

export type SearchPreset = {
  id: string
  label: string
  query: string
  tier?: SearchPresetTier
  intent?: string
  geo?: string
  rationale?: string
  fitKeywords?: string[]
}

type QueryCatalog = {
  schemaVersion: number
  operatorsDoc: string
  defaultQuery: string
  defaultCvSummary: string
  presets: SearchPreset[]
}

const loaded = catalog as QueryCatalog

export const DEFAULT_SEARCH_QUERY = loaded.defaultQuery
export const DEFAULT_CV_SUMMARY = loaded.defaultCvSummary
export const X_OPERATORS_DOC_URL = loaded.operatorsDoc

const TIER_ORDER: Record<string, number> = {
  priority: 0,
  core: 1,
  niche: 2,
  community: 3,
}

export function sortSearchPresets(presets: SearchPreset[]): SearchPreset[] {
  return [...presets].sort((a, b) => {
    const ta = TIER_ORDER[a.tier ?? 'core'] ?? 9
    const tb = TIER_ORDER[b.tier ?? 'core'] ?? 9
    return ta - tb
  })
}

export function catalogFromUnknown(raw: unknown): QueryCatalog | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Partial<QueryCatalog>
  if (!Array.isArray(c.presets) || typeof c.defaultQuery !== 'string') return null
  return {
    schemaVersion: typeof c.schemaVersion === 'number' ? c.schemaVersion : 1,
    operatorsDoc: typeof c.operatorsDoc === 'string' ? c.operatorsDoc : loaded.operatorsDoc,
    defaultQuery: c.defaultQuery,
    defaultCvSummary: typeof c.defaultCvSummary === 'string' ? c.defaultCvSummary : loaded.defaultCvSummary,
    presets: c.presets as SearchPreset[],
  }
}

/** UI presets — stub until packs overlay loads at boot. */
export const SEARCH_PRESETS: SearchPreset[] = sortSearchPresets(loaded.presets)

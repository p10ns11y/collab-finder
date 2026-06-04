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

/** UI presets — priority tier first, then core, niche, community */
const TIER_ORDER: Record<string, number> = {
  priority: 0,
  core: 1,
  niche: 2,
  community: 3,
}

export const SEARCH_PRESETS: SearchPreset[] = [...loaded.presets].sort((a, b) => {
  const ta = TIER_ORDER[a.tier ?? 'core'] ?? 9
  const tb = TIER_ORDER[b.tier ?? 'core'] ?? 9
  return ta - tb
})

/**
 * Mission firms — SpaceXAI / Tesla / Swedish JobTech / Nordic+EU career boards.
 * Pull is query-keyed: same query reuses cache; new query fetches and appends to the pool.
 */

export type MissionFirmChip = { id: string; label: string }

/** Loaded from Rust FIRM_REGISTRY at boot — not hardcoded. */
export type MissionFirmChipId = string

export type MissionFirmLead = {
  firm_id: string
  firm_label: string
  source: string
  external_id: string
  title: string
  location: string
  absolute_url: string
  department?: string | null
  rank_score: number
  rank_reasons: string[]
  texas_match: boolean
  terafab_adjacent: boolean
  already_in_db: boolean
  opportunity_id?: number | null
}

export type MissionFirmFilter = {
  q?: string
  firms?: string[]
  texas_only?: boolean
  terafab_bias?: boolean
  limit?: number
  force_refresh?: boolean
}

/** Empty default — change query (or a rail chip) to trigger a new fetch+append. */
export const MISSION_FIRMS_DEFAULT_QUERY = ''

export { MISSION_QUERY_CHIPS } from './hunt-rails'

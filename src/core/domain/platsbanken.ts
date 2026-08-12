/**
 * Platsbanken emergency rail — JobTech JobSearch (AF runway / benefits reporting).
 * Import → existing fit / prep / export pack. Favorites boost ML/AI/Robotics; volume stays visible.
 */

export type PlatsbankenLead = {
  ad_id: string
  headline: string
  employer: string
  municipality?: string | null
  occupation?: string | null
  webpage_url: string
  application_url?: string | null
  publication_date?: string | null
  application_deadline?: string | null
  description_snippet: string
  api_relevance: number
  rank_score: number
  rank_reasons: string[]
  favorite_match: boolean
  already_in_db: boolean
  opportunity_id?: number | null
}

export type PlatsbankenSearchFilter = {
  q?: string
  municipality?: string
  limit?: number
  offset?: number
}

/** Sensible emergency defaults — operator can override in the panel. */
export { PLATSBANKEN_DEFAULT_QUERY, PLATSBANKEN_DEFAULT_MUNICIPALITY } from './hunt-rails'

export const PLATSBANKEN_MUNI_CHIPS = [
  'Stockholm',
  'Göteborg',
  'Malmö',
  'Uppsala',
  'Remote',
] as const

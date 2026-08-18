/** Mirror of Rust `firm_durability` wave types. */

export type ProfileMatch = {
  score: number
  hits: string[]
  misses: string[]
  method: string
}

export type SearchProcedure = {
  name: string
  steps: string[]
  gates: string[]
  weights: string
  split: string
}

export type DurableFirm = {
  firm_id: string
  name: string
  admitted: boolean
  band: 'depth' | 'width' | 'other' | string
  total: number
  quality: number
  geo_bonus: number
  env_bonus?: number
  legal_ease?: number
  place_id?: string
  exclude_reason?: string | null
  product_class: string
  depth_geo: string
  cash_line: string
  source?: string | null
  fortress?: number
  product_moat?: number
  ai_tsunami?: number
  hiring_signal?: number
  spacexai_vector?: number
  profile?: ProfileMatch
}

export type DurabilityIteration = {
  algorithm_version: string
  scored_at: string
  wave?: number
  remaining?: number
  exhausted?: boolean
  exclude_ids?: string[]
  top10: DurableFirm[]
  depth: DurableFirm[]
  width: DurableFirm[]
  excluded: DurableFirm[]
  procedure?: SearchProcedure
  places?: {
    algorithm_version: string
    critic: string[]
    top10: RankedPlace[]
  }
  store: string
}

export type RankedPlace = {
  place_id: string
  name: string
  country: string
  band: string
  env_total: number
  env_bonus: number
  legal_ease: number
  economic: number
  ethics: number
  character: number
  social: number
  family: number
  self_fit: number
  why: string
  cost: string
}

export type MissionInspectResult = {
  opportunity: {
    id: number
    title?: string | null
    company?: string | null
    source_url?: string | null
    jd_text: string
    fit_score?: number | null
  }
  profile: ProfileMatch
}

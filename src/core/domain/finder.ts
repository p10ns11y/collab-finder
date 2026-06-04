export type Tweet = {
  id: string
  text: string
  author_id?: string
  created_at?: string
}

export type Decision = {
  action: string
  confidence: number
  rationale: string
  guards_triggered: unknown[]
  next_steps: string[]
}

export type ReactorState = {
  leads: unknown[]
  current_cost: number
  x_rate_remaining: number
  pauses: string[]
}

export const DEFAULT_SEARCH_QUERY =
  '(hiring OR "we are hiring" OR collab OR "build with me") (react OR typescript OR rust OR ai) -is:retweet lang:en'

export const DEFAULT_CV_SUMMARY =
  'Senior TS/React/Rust engineer, Oneflow leadership, energy-efficient systems, agentic tools, open to collabs in Stockholm or remote.'

export type SearchPreset = {
  id: string
  label: string
  query: string
}

export const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: 'jobs',
    label: 'Jobs',
    query: '(hiring OR "open role") (senior OR staff) (react OR typescript) -is:retweet lang:en',
  },
  {
    id: 'collabs',
    label: 'Collabs',
    query: '(collab OR cofounder OR "build with me") (indie OR agent OR rust) -is:retweet lang:en',
  },
  {
    id: 'side',
    label: 'Side hustles',
    query: '("side project" OR "side hustle") (react OR ai OR rust) -is:retweet lang:en',
  },
  {
    id: 'community',
    label: 'Community',
    query: '("build in public" OR "join me") (community OR together) -is:retweet lang:en',
  },
]
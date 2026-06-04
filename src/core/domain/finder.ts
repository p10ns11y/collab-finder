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

export type CycleResult = {
  decision: Decision
  tweets: Tweet[]
}

export type ReactorState = {
  leads: unknown[]
  current_cost: number
  x_rate_remaining: number
  pauses: string[]
}

/** Operators must match https://docs.x.com/x-api/posts/search/integrate/operators (no since:, min_faves:, filter:). */
export const DEFAULT_SEARCH_QUERY =
  '(hiring OR "we are hiring" OR collab OR "build with me") (react OR typescript OR rust OR ai) lang:en -is:retweet'

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
    query:
      '(hiring OR "open role") (senior OR staff) (react OR typescript) lang:en -is:retweet has:links',
  },
  {
    id: 'collabs',
    label: 'Collabs',
    query:
      '(collab OR cofounder OR "build with me") (indie OR agent OR rust) lang:en -is:retweet',
  },
  {
    id: 'xai',
    label: 'xAI / Grok',
    query:
      'from:xaicareers (hiring OR engineer OR careers OR inference) lang:en -is:retweet has:links',
  },
  {
    id: 'xai-kw',
    label: 'xAI keywords',
    query:
      '("xAI" OR "x.ai" OR Grok) (hiring OR "open roles" OR engineer) lang:en -is:retweet has:links',
  },
  {
    id: 'stockholm',
    label: 'Stockholm AI',
    query:
      '("Senior Software Engineer" OR "AI Engineer" OR "Rust Developer") (Stockholm OR Sweden) (hiring OR jobb) lang:en -is:retweet place_country:SE',
  },
  {
    id: 'side',
    label: 'Side hustles',
    query: '("side project" OR "side hustle") (react OR ai OR rust) lang:en -is:retweet',
  },
  {
    id: 'community',
    label: 'Community',
    query: '("build in public" OR "join me") (community OR together) lang:en -is:retweet',
  },
]
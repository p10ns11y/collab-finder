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

export { PROFILE_STRATEGY_MD, X_OPERATORS_MD } from './distillation'
export {
  DEFAULT_CV_SUMMARY,
  DEFAULT_SEARCH_QUERY,
  SEARCH_PRESETS,
  X_OPERATORS_DOC_URL,
  type SearchPreset,
  type SearchPresetTier,
} from './search-presets'

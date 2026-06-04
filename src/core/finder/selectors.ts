import { isBusy } from '../async'
import {
  PROFILE_STRATEGY_MD,
  SEARCH_PRESETS,
  X_OPERATORS_DOC_URL,
  X_OPERATORS_MD,
} from '../domain/finder'
import { canRunCycle, canSearch, deriveConnectionFlow, deriveSearchFlow } from './flows'
import type { FinderModel } from './model'
import { bannerText, searchResults } from './update'

export type PaletteItem = {
  id: string
  label: string
  msg: import('./msg').FinderMsg
}

/** View-facing projection — keeps JSX dumb and stable. */
export type FinderViewState = {
  model: FinderModel
  connectionFlow: ReturnType<typeof deriveConnectionFlow>
  searchFlow: ReturnType<typeof deriveSearchFlow>
  canSearch: boolean
  canRunCycle: boolean
  busy: boolean
  tweets: ReturnType<typeof searchResults>
  banner: string | null
  presets: typeof SEARCH_PRESETS
  operatorsDocUrl: string
  operatorsReference: string
  strategyReference: string
  paletteItems: PaletteItem[]
}

export function selectFinderView(model: FinderModel): FinderViewState {
  return {
    model,
    connectionFlow: deriveConnectionFlow(model),
    searchFlow: deriveSearchFlow(model),
    canSearch: canSearch(model),
    canRunCycle: canRunCycle(model),
    busy: isBusy(model),
    tweets: searchResults(model),
    banner: bannerText(model),
    presets: SEARCH_PRESETS,
    operatorsDocUrl: X_OPERATORS_DOC_URL,
    operatorsReference: X_OPERATORS_MD,
    strategyReference: PROFILE_STRATEGY_MD,
    paletteItems: [
      { id: 'search', label: 'Search X (live)', msg: { type: 'SearchRequested' } },
      { id: 'cycle', label: 'Run autonomous cycle (guarded)', msg: { type: 'CycleRequested' } },
      ...SEARCH_PRESETS.filter((p) => p.tier === 'priority').map((p) => ({
        id: `preset-${p.id}`,
        label: `Query: ${p.label}`,
        msg: { type: 'PresetSelected' as const, query: p.query },
      })),
      { id: 'promote', label: 'Promote insights (guarded)', msg: { type: 'PromoteRequested' } },
      {
        id: 'state',
        label: 'Refresh reactor state',
        msg: { type: 'ReactorRefreshRequested' },
      },
    ],
  }
}
import { isBusy } from '../async'
import { SEARCH_PRESETS } from '../domain/finder'
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
    paletteItems: [
      { id: 'search', label: 'Search X (live)', msg: { type: 'SearchRequested' } },
      { id: 'cycle', label: 'Run autonomous cycle (guarded)', msg: { type: 'CycleRequested' } },
      { id: 'promote', label: 'Promote insights (guarded)', msg: { type: 'PromoteRequested' } },
      {
        id: 'state',
        label: 'Refresh reactor state',
        msg: { type: 'ReactorRefreshRequested' },
      },
    ],
  }
}
import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { EmptyState } from '../../components/ui/empty-state'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/**
 * Xplore — live X search + autonomous cycle (no opportunity rail / CV; those live on Discover).
 * Layout: φ split (~38% controls / ~62% results).
 */
export function XploreScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-0/40 lg:flex-row">
      <div
        className="w-full min-w-0 space-y-3 overflow-x-hidden overflow-y-auto border-b border-border-subtle p-3 lg:min-w-[280px] lg:max-w-[min(420px,42%)] lg:border-b-0 lg:border-r lg:p-4"
        style={{ flex: '0 0 var(--pane-minor)' }}
      >
        <SearchWorkspace
          query={model.query}
          busy={view.busy}
          canSearch={view.canSearch}
          canRunCycle={view.canRunCycle}
          presets={view.presets}
          onQueryChange={(query) => dispatch({ type: 'QueryChanged', query })}
          onPresetSelect={(query) => dispatch({ type: 'PresetSelected', query })}
          onSearch={() => dispatch({ type: 'SearchRequested' })}
          onAutonomousCycle={() => dispatch({ type: 'CycleRequested' })}
        />
        {!view.canSearch && (
          <p className="ui-meta px-0.5">
            X bearer required.{' '}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => dispatch({ type: 'ScreenChanged', screen: 'settings' })}
            >
              Open Settings
            </button>
          </p>
        )}
        {model.decision && (
          <DecisionPanel
            decision={model.decision}
            onRerun={() => dispatch({ type: 'CycleRequested' })}
            onPromote={() => dispatch({ type: 'PromoteRequested' })}
          />
        )}
        <PauseLog pauses={model.pauses} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 lg:p-5">
        <div className="space-y-3">
          <TweetFeed tweets={view.tweets} />
          {!hasXResults && (
            <EmptyState
              title="No live X results yet"
              description="Run a search or autonomous cycle on the left. Cycle decisions are heuristic until structured analyze is wired."
            />
          )}
        </div>
      </div>
    </div>
  )
}

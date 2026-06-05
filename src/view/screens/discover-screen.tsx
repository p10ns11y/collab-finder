import { DecisionPanel } from '../../components/finder/decision-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { TweetFeed } from '../../components/finder/tweet-feed'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/** Primary workspace: query + CV + presets left; live results feed right (split on lg+). */
export function DiscoverScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasResults = view.tweets.length > 0

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden bg-surface-0">
      {/* Left: controls (scrollable) */}
      <div className="w-full lg:w-[38%] xl:w-[34%] 2xl:w-[30%] lg:min-w-[320px] border-b lg:border-b-0 lg:border-r border-border-subtle overflow-auto p-3 lg:p-4 space-y-4">
        <SearchWorkspace
          query={model.query}
          cvSummary={model.cvSummary}
          busy={view.busy}
          canSearch={view.canSearch}
          canRunCycle={view.canRunCycle}
          presets={view.presets}
          onQueryChange={(query) => dispatch({ type: 'QueryChanged', query })}
          onCvSummaryChange={(cvSummary) =>
            dispatch({ type: 'CvSummaryChanged', cvSummary })
          }
          onPresetSelect={(query) => dispatch({ type: 'PresetSelected', query })}
          onSearch={() => dispatch({ type: 'SearchRequested' })}
          onAutonomousCycle={() => dispatch({ type: 'CycleRequested' })}
        />

        {model.decision && (
          <DecisionPanel
            decision={model.decision}
            onRerun={() => dispatch({ type: 'CycleRequested' })}
            onPromote={() => dispatch({ type: 'PromoteRequested' })}
          />
        )}

        <PauseLog pauses={model.pauses} />
      </div>

      {/* Right: results (fills, scrollable) */}
      <div className="flex-1 min-h-0 overflow-auto p-3 lg:p-4">
        <TweetFeed tweets={view.tweets} />

        {!hasResults && (
          <div className="mt-8 rounded-lg border border-border-subtle bg-surface-1/60 p-6 text-center text-sm text-ink-faint">
            No live results yet.<br />
            Use the form on the left to search or run a guarded autonomous cycle.
          </div>
        )}
      </div>
    </div>
  )
}

import { DecisionPanel } from '../../components/finder/decision-panel'
import { CvCycleContextPanel } from '../../components/finder/cv-cycle-context-panel'
import { PauseLog } from '../../components/finder/pause-log'
import { SearchWorkspace } from '../../components/finder/search-workspace'
import { TweetFeed } from '../../components/finder/tweet-feed'
import { EmptyState } from '../../components/ui/empty-state'
import { HuntSplitShell } from '../../components/layout/hunt-split-shell'
import type { FinderViewState } from '../../core/finder/selectors'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/**
 * Xplore — live X search + autonomous cycle (no opportunity rail; CV editor on Discover).
 * Layout: results left, search/cycle controls right (Discover chrome).
 */
export function XploreScreen({ view, dispatch }: Props) {
  const { model } = view
  const hasXResults = view.tweets.length > 0

  return (
    <HuntSplitShell
      document={
        <div className="space-y-3">
          <TweetFeed tweets={view.tweets} />
          {!hasXResults && (
            <EmptyState
              title="No live X results yet"
              description="Run a search or autonomous cycle on the right. Cycle decisions are heuristic until structured analyze is wired."
            />
          )}
        </div>
      }
      controls={
        <>
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
          <CvCycleContextPanel
            cvSummary={model.cvSummary}
            onEditOnDiscover={() => dispatch({ type: 'ScreenChanged', screen: 'discover' })}
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
        </>
      }
    />
  )
}

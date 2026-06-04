import { AppShell } from '../components/layout/app-shell'
import { Header } from '../components/layout/header'
import { CommandPalette } from '../components/finder/command-palette'
import { CredentialsPanel } from '../components/finder/credentials-panel'
import { DecisionPanel } from '../components/finder/decision-panel'
import { ErrorBanner } from '../components/finder/error-banner'
import { GuardDashboard } from '../components/finder/guard-dashboard'
import { PauseLog } from '../components/finder/pause-log'
import { SearchWorkspace } from '../components/finder/search-workspace'
import { TweetFeed } from '../components/finder/tweet-feed'
import type { FinderViewState } from '../core/finder/selectors'
import type { Dispatch } from '../core/mvu/engine'
import type { FinderMsg } from '../core/finder/msg'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

/** Presentational shell — props in, events out as Msg. No hooks, no invoke. */
export function FinderAppView({ view, dispatch }: Props) {
  const { model } = view

  return (
    <>
      <AppShell
        header={
          <Header onOpenPalette={() => dispatch({ type: 'PaletteToggled' })} />
        }
        footer={
          <footer className="border-t border-border-subtle px-6 py-4 text-[11px] text-ink-faint">
            Separate from devprofile · CV via cv-promote-guard · X via official agent
            resources · self-guards on every path
          </footer>
        }
      >
        <div className="space-y-5">
          <GuardDashboard
            reactorState={model.reactorState}
            pauseCount={model.pauses.length}
          />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <CredentialsPanel
              flow={view.connectionFlow}
              draft={model.credentials.draft}
              notice={model.credentials.notice}
              busy={model.credentials.busy}
              onDraftChange={(draft) =>
                dispatch({ type: 'CredentialsDraftChanged', draft })
              }
              onSave={() => dispatch({ type: 'CredentialsSaveRequested' })}
              onClear={() => dispatch({ type: 'CredentialsClearRequested' })}
            />
            <SearchWorkspace
              query={model.query}
              cvSummary={model.cvSummary}
              busy={view.busy}
              canSearch={view.canSearch}
              canRunCycle={view.canRunCycle}
              presets={view.presets}
              operatorsDocUrl={view.operatorsDocUrl}
              operatorsReference={view.operatorsReference}
              strategyReference={view.strategyReference}
              onQueryChange={(query) => dispatch({ type: 'QueryChanged', query })}
              onCvSummaryChange={(cvSummary) =>
                dispatch({ type: 'CvSummaryChanged', cvSummary })
              }
              onPresetSelect={(query) => dispatch({ type: 'PresetSelected', query })}
              onSearch={() => dispatch({ type: 'SearchRequested' })}
              onAutonomousCycle={() => dispatch({ type: 'CycleRequested' })}
            />
          </div>

          {view.banner && (
            <ErrorBanner
              message={view.banner}
              onDismiss={() => dispatch({ type: 'BannerDismissed' })}
            />
          )}

          {model.decision && (
            <DecisionPanel
              decision={model.decision}
              onRerun={() => dispatch({ type: 'CycleRequested' })}
              onPromote={() => dispatch({ type: 'PromoteRequested' })}
            />
          )}

          <PauseLog pauses={model.pauses} />
          <TweetFeed tweets={view.tweets} />
        </div>
      </AppShell>

      <CommandPalette
        open={model.paletteOpen}
        items={view.paletteItems}
        onSelect={(msg) => dispatch(msg)}
        onClose={() => dispatch({ type: 'PaletteClosed' })}
      />
    </>
  )
}
import { AppShell } from '../components/layout/app-shell'
import { Header } from '../components/layout/header'
import { SidebarNav } from '../components/layout/sidebar-nav'
import { CommandPalette } from '../components/finder/command-palette'
import { QuestDrawer } from '../components/finder/quest-drawer'
import { ErrorBanner } from '../components/finder/error-banner'
import type { FinderViewState } from '../core/finder/selectors'
import type { Dispatch } from '../core/mvu/engine'
import type { FinderMsg } from '../core/finder/msg'
import { DiscoverScreen } from './screens/discover-screen'
import { PipelineScreen } from './screens/pipeline-screen'
import { HeadingScreen } from './screens/heading-screen'
import { MissionScreen } from './screens/mission-screen'
import { SwedenScreen } from './screens/sweden-screen'
import { NetworkScreen } from './screens/network-screen'
import { SettingsScreen } from './screens/settings-screen'
import { PreferencesScreen } from './screens/preferences-screen'
import type { FinderScreen } from '../core/finder/model'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

const SCREEN_LABEL: Record<FinderScreen, string> = {
  heading: 'Navigating',
  discover: 'Discover',
  pipeline: 'Pipeline',
  mission: 'Mission',
  sweden: 'Sweden',
  xplore: 'Xplore',
  network: 'Network',
  settings: 'Settings',
  preferences: 'Preferences',
  stats: 'Statistics',
  history: 'History',
  data: 'Data',
  lookup: 'Lookup',
}

/** Presentational shell — props in, events out as Msg. No hooks, no invoke. */
export function FinderAppView({ view, dispatch }: Props) {
  const { model, activeScreen, banner } = view

  const screenTitle = SCREEN_LABEL[activeScreen]

  function navigate(screen: FinderScreen) {
    dispatch({ type: 'ScreenChanged', screen })
  }

  const viewportContent = (() => {
    switch (activeScreen) {
      case 'heading':
        return <HeadingScreen dispatch={dispatch} />
      case 'discover':
        return <DiscoverScreen view={view} dispatch={dispatch} />
      case 'pipeline':
        return <PipelineScreen view={view} dispatch={dispatch} />
      case 'mission':
        return <MissionScreen view={view} dispatch={dispatch} />
      case 'sweden':
        return <SwedenScreen view={view} dispatch={dispatch} />
      case 'xplore':
        // Xplore: X search/cycle to discover new opportunities on X.
        // DiscoverScreen branches based on activeScreen (Discover = opportunity management + quick target; Xplore = pure X).
        return <DiscoverScreen view={view} dispatch={dispatch} />
      case 'settings':
        return <SettingsScreen view={view} dispatch={dispatch} />
      case 'preferences':
        return <PreferencesScreen view={view} />
      case 'network':
        return <NetworkScreen view={view} dispatch={dispatch} />
      default:
        return <div className="p-6 text-ink-faint">Unknown screen: {activeScreen}</div>
    }
  })()

  return (
    <>
      <AppShell
        sidebar={
          <SidebarNav active={activeScreen} onNavigate={navigate} />
        }
        header={
          <Header
            onOpenPalette={() => dispatch({ type: 'PaletteToggled' })}
            onOpenQuest={() => dispatch({ type: 'QuestToggled' })}
            screenTitle={screenTitle}
            xConnected={view.connectionFlow === 'connected'}
            xChecking={view.connectionFlow === 'checking'}
            pauseCount={
              (view.historyStats?.total_pauses ?? 0) > 0
                ? view.historyStats!.total_pauses
                : model.pauses.length
            }
            targetBusy={model.opportunityTarget?.status === 'loading'}
          />
        }
      >
        {/* Global banner + framed viewport (shared product surface) */}
        <div className="flex h-full flex-col overflow-hidden p-3 pt-2">
          {banner && (
            <div className="mb-2 shrink-0">
              <ErrorBanner message={banner} onDismiss={() => dispatch({ type: 'BannerDismissed' })} />
            </div>
          )}
          <div className="ui-viewport flex min-h-0 flex-1 flex-col">{viewportContent}</div>
        </div>
      </AppShell>

      <CommandPalette
        open={model.paletteOpen}
        items={view.paletteItems}
        onSelect={(msg) => dispatch(msg)}
        onClose={() => dispatch({ type: 'PaletteClosed' })}
      />
      <QuestDrawer
        open={model.questOpen}
        kind={model.questKind}
        draft={model.questDraft}
        turns={model.questTurns}
        contextIds={model.questContextIds}
        sessionId={model.questSessionId}
        recent={model.questRecent}
        hits={model.questHits}
        lookupQ={model.questLookupQ}
        quest={model.quest}
        dispatch={dispatch}
      />
    </>
  )
}
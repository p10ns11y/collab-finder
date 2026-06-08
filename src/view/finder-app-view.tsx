import { AppShell } from '../components/layout/app-shell'
import { Header } from '../components/layout/header'
import { SidebarNav } from '../components/layout/sidebar-nav'
import { CommandPalette } from '../components/finder/command-palette'
import { ErrorBanner } from '../components/finder/error-banner'
import type { FinderViewState } from '../core/finder/selectors'
import type { Dispatch } from '../core/mvu/engine'
import type { FinderMsg } from '../core/finder/msg'
import { DiscoverScreen } from './screens/discover-screen'
import { SettingsScreen } from './screens/settings-screen'
import type { FinderScreen } from '../core/finder/model'

type Props = {
  view: FinderViewState
  dispatch: Dispatch<FinderMsg>
}

const SCREEN_LABEL: Record<FinderScreen, string> = {
  discover: 'Jobs',
  hunt: 'Hunt',
  settings: 'Settings',
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
      case 'discover':
        return <DiscoverScreen view={view} dispatch={dispatch} />
      case 'hunt':
        // Hunt: X only (search, cycle, feed). Jobs path is primary in Discover/Jobs.
        return <DiscoverScreen view={view} dispatch={dispatch} /> // temp reuse for X; full carve later
      case 'settings':
        return <SettingsScreen view={view} dispatch={dispatch} />
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
            screenTitle={screenTitle}
          />
        }
        footer={
          <footer className="border-t border-border-subtle px-3 py-1.5 text-[10px] text-ink-faint bg-surface-1/60">
            Separate from devprofile · CV via cv-promote-guard · X via official agent resources · self-guards on every path
          </footer>
        }
      >
        {/* Global banner + active screen viewport */}
        <div className="h-full flex flex-col overflow-hidden">
          {banner && (
            <div className="px-4 pt-2">
              <ErrorBanner message={banner} onDismiss={() => dispatch({ type: 'BannerDismissed' })} />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
            {viewportContent}
          </div>
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
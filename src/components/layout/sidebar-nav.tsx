import type { LucideIcon } from 'lucide-react'
import {
  Compass,
  Crosshair,
  Kanban,
  MapPinned,
  Network,
  Route,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from 'lucide-react'
import { SIDEBAR_SCREENS } from '../../core/domain/finder-nav'
import type { FinderScreen } from '../../core/finder/model'
import { cn } from '../../lib/cn'

type NavMeta = {
  label: string
  Icon: LucideIcon
}

const NAV_META: Record<(typeof SIDEBAR_SCREENS)[number], NavMeta> = {
  heading: { label: 'Navigating', Icon: Route },
  discover: { label: 'Discover', Icon: Compass },
  pipeline: { label: 'Pipeline', Icon: Kanban },
  mission: { label: 'Mission', Icon: Crosshair },
  sweden: { label: 'Sweden', Icon: MapPinned },
  xplore: { label: 'Xplore', Icon: Search },
  network: { label: 'Network', Icon: Network },
  preferences: { label: 'Preferences', Icon: SlidersHorizontal },
  settings: { label: 'Settings', Icon: SettingsIcon },
}

type Props = {
  active: FinderScreen
  onNavigate: (screen: FinderScreen) => void
  className?: string
}

export function SidebarNav({ active, onNavigate, className }: Props) {
  return (
    <nav
      className={cn(
        'w-14 md:w-[7.25rem] shrink-0 border-r border-border-subtle bg-surface-1/70 flex flex-col py-3',
        className,
      )}
      aria-label="Screen navigation"
    >
      <div className="flex flex-1 flex-col gap-1 px-1.5">
        {SIDEBAR_SCREENS.map((id) => {
          const { label, Icon } = NAV_META[id]
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'group flex h-9 w-full items-center justify-center rounded-md transition-colors duration-150 md:justify-start md:gap-2 md:px-2.5',
                'hover:bg-surface-2/80',
                isActive
                  ? 'bg-accent-soft text-accent ring-1 ring-accent/25'
                  : 'text-ink-muted hover:text-ink',
              )}
              title={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-accent')} aria-hidden />
              <span className="sr-only md:not-sr-only md:truncate md:text-xs md:font-medium">
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

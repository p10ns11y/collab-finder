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
import type { FinderScreen } from '../../core/finder/model'
import { cn } from '../../lib/cn'

type NavItem = {
  id: FinderScreen
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'heading', label: 'Navigating', Icon: Route },
  { id: 'discover', label: 'Discover', Icon: Compass },
  { id: 'pipeline', label: 'Pipeline', Icon: Kanban },
  { id: 'mission', label: 'Mission', Icon: Crosshair },
  { id: 'sweden', label: 'Sweden', Icon: MapPinned },
  { id: 'xplore', label: 'Xplore', Icon: Search },
  { id: 'network', label: 'Network', Icon: Network },
  { id: 'preferences', label: 'Preferences', Icon: SlidersHorizontal },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

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
        {NAV_ITEMS.map(({ id, label, Icon }) => {
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

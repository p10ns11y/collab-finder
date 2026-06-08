import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Clock,
  Compass,
  Database,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react'
import type { FinderScreen } from '../../core/finder/model'
import { cn } from '../../lib/cn'

type NavItem = {
  id: FinderScreen
  label: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'discover', label: 'Discover', Icon: Compass },
  { id: 'stats', label: 'Statistics', Icon: BarChart3 },
  { id: 'history', label: 'History', Icon: Clock },
  { id: 'data', label: 'Data', Icon: Database },
  { id: 'lookup', label: 'Lookup', Icon: Search },
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
        'w-14 md:w-28 border-r border-border-subtle bg-surface-1/60 flex flex-col py-2 shrink-0',
        className,
      )}
      aria-label="Screen navigation"
    >
      <div className="flex-1 flex flex-col gap-1 px-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'group relative flex h-9 w-full items-center justify-center rounded-md transition-colors md:justify-start md:pl-2',
                'hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                isActive
                  ? 'bg-surface-2 text-accent'
                  : 'text-ink-muted hover:text-ink',
              )}
              title={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator rail */}
              {isActive && <span className="absolute left-0 top-1/2 -mt-2 h-4 w-0.5 rounded bg-accent" aria-hidden />}
              <Icon className={cn('h-4 w-4', isActive && 'text-accent')} aria-hidden />
              <span className="sr-only md:hidden">{label}</span>
              <span className="hidden md:inline ml-2 text-[10px] tracking-normal">{label}</span>
            </button>
          )
        })}
      </div>
      <div className="px-1 pt-2 border-t border-border-subtle/60 text-[9px] text-center text-ink-faint tracking-[1px] select-none">
        NAV
      </div>
    </nav>
  )
}

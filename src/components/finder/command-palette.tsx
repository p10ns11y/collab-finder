import { useEffect } from 'react'
import type { PaletteItem } from '../../core/finder/selectors'
import type { FinderMsg } from '../../core/finder/msg'
import { cn } from '../../lib/cn'

type Props = {
  open: boolean
  items: PaletteItem[]
  onSelect: (msg: FinderMsg) => void
  onClose: () => void
}

export function CommandPalette({ open, items, onSelect, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-surface-0/80 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label="Command palette"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-md overflow-hidden rounded-xl border border-border-default',
          'glass-panel shadow-glow',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
          Agent commands
        </div>
        <ul className="p-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-3"
                onClick={() => {
                  onSelect(item.msg)
                  onClose()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
import { useEffect, useRef } from 'react'
import type { PaletteItem } from '../../core/finder/selectors'
import type { FinderMsg } from '../../core/finder/msg'
import { cn } from '../../lib/cn'

type Props = {
  open: boolean
  items: PaletteItem[]
  onSelect: (msg: FinderMsg) => void
  onClose: () => void
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'))
}

export function CommandPalette({ open, items, onSelect, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const [first] = focusableIn(panel)
      if (first) {
        first.focus()
      } else {
        panel.focus()
      }
    })

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key !== 'Tab' || !panelRef.current) return

      const buttons = focusableIn(panelRef.current)
      if (buttons.length === 0) return

      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      restoreFocusRef.current?.focus()
    }
  }, [open, onClose, items.length])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className={cn(
          'flex w-full max-w-md max-h-[min(85vh,36rem)] flex-col overflow-hidden rounded-xl border border-border-default outline-none',
          'glass-panel shadow-glow',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border-subtle px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            Agent commands
          </div>
          <div className="mt-0.5 text-[11px] text-ink-faint">
            {items.length} commands · <kbd className="font-mono text-[10px]">Esc</kbd> to close
          </div>
        </div>
        <ul
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
          aria-label="Command list"
        >
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-3 focus-visible:bg-surface-3"
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
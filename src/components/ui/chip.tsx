import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
}

/** Selectable filter chip (pipeline, tabs). */
export function Chip({ className, active, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      data-active={active ? 'true' : 'false'}
      className={cn('ui-chip', active && 'ui-chip-active', className)}
      aria-pressed={active}
      {...props}
    />
  )
}

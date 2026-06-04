import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-surface-0 font-medium shadow-[0_1px_0_rgb(255_255_255/0.12)_inset] hover:brightness-110 active:brightness-95 disabled:opacity-50',
  secondary:
    'bg-surface-3 text-ink border border-border-default hover:bg-surface-elevated active:bg-surface-2 disabled:opacity-50',
  ghost:
    'text-ink-muted hover:text-ink hover:bg-surface-2 border border-transparent disabled:opacity-50',
  danger:
    'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 disabled:opacity-50',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
  md: 'h-9 px-4 text-sm rounded-md gap-2',
  lg: 'h-11 px-5 text-sm rounded-lg gap-2',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center transition-[color,background,filter] duration-150',
        'focus-visible:outline-offset-2 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
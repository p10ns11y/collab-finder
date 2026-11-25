import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-ink',
        'placeholder:text-ink-faint',
        'transition-colors duration-150',
        'hover:border-border-strong focus:border-accent/50 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
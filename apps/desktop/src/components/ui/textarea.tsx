import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: Props) {
  return (
    <textarea
      className={cn(
        'min-h-[4.5rem] w-full resize-y rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-ink',
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
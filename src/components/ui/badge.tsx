import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-muted border-border-default',
  accent: 'bg-accent-soft text-accent border-accent/25',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
}

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: Tone }

export function Badge({ className, tone = 'neutral', ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
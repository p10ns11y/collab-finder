import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';

const badgeVariants = cva('inline-flex items-center rounded-pill border px-2 py-0.5 text-xs', {
  variants: {
    tone: {
      neutral: 'border-border bg-surface-alt text-text',
      ok: 'border-ok-stroke bg-ok-fill text-ok-text',
      warn: 'border-warn-stroke bg-warn-fill text-warn-text',
      trap: 'border-trap-stroke bg-trap-fill text-trap-text',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

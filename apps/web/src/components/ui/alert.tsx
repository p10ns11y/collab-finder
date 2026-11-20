import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils.ts';

const alertVariants = cva('rounded-md border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-external-stroke bg-external-fill text-external-text',
      warn: 'border-warn-stroke bg-warn-fill text-warn-text',
      trap: 'border-trap-stroke bg-trap-fill text-trap-text',
      broken: 'border-broken-stroke bg-broken-fill text-broken-text',
    },
  },
  defaultVariants: { tone: 'info' },
});

export function Alert({ className, tone, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div className={cn(alertVariants({ tone }), className)} {...props} />;
}

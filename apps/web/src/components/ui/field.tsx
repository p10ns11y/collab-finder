import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

const control = 'w-full rounded-md border border-border bg-bg px-3 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-semibold text-text', className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-32 py-2', className)} {...props} />;
}
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-11', className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'h-11', className)} {...props} />;
}

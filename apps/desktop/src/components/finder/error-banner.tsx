import { X } from 'lucide-react'
import { Button } from '../ui/button'

type Props = {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger"
    >
      <p className="flex-1 leading-relaxed">{message}</p>
      <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 shrink-0 px-2 text-danger">
        <X className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Dismiss</span>
      </Button>
    </div>
  )
}
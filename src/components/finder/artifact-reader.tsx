/**
 * Full-pane reader for prep copy and exported pack files (md / pdf).
 */
import * as React from 'react'
import { X } from 'lucide-react'

export type ArtifactReaderDoc =
  | { title: string; kind: 'text'; text: string }
  | { title: string; kind: 'pdf'; src: string }
  | { title: string; kind: 'error'; message: string }

type Props = {
  doc: ArtifactReaderDoc
  onClose: () => void
}

export function ArtifactReader({ doc, onClose }: Props) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-0/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <div className="min-w-0 text-sm font-medium text-ink truncate">{doc.title}</div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {doc.kind === 'error' ? (
          <p className="p-6 text-sm text-danger">{doc.message}</p>
        ) : doc.kind === 'pdf' ? (
          <iframe title={doc.title} src={doc.src} className="h-full w-full border-0 bg-surface-1" />
        ) : (
          <article className="mx-auto max-w-prose px-5 py-8 text-[15px] leading-7 text-ink">
            <pre className="whitespace-pre-wrap font-sans m-0">{doc.text}</pre>
          </article>
        )}
      </div>
    </div>
  )
}

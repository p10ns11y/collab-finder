/**
 * Full-viewport artifact workspace: file tree + preview (text / PDF).
 * Edit / LLM tweaks are out of scope.
 */
import * as React from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  Minus,
  PanelLeft,
  PanelLeftClose,
  Plus,
  X,
} from 'lucide-react'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'

export type ArtifactTreeNode = {
  id: string
  label: string
  group: string
  /** Inline prep copy (no disk). */
  text?: string
  /** Absolute path under application_packs or apply-cv out/. */
  path?: string
}

type Preview =
  | { kind: 'empty' }
  | { kind: 'loading'; label: string }
  | { kind: 'text'; title: string; text: string }
  | { kind: 'pdf'; title: string; src: string; path?: string }
  | { kind: 'error'; title: string; message: string }

type PdfZoom = 'fit' | 100 | 125 | 160

type Props = {
  title?: string
  nodes: ArtifactTreeNode[]
  initialId?: string
  onClose: () => void
}

function pdfSrcWithView(src: string, zoom: PdfZoom): string {
  const hash = zoom === 'fit' ? 'toolbar=1&navpanes=0&view=FitH' : `toolbar=1&navpanes=0&zoom=${zoom}`
  return `${src}#${hash}`
}

function PdfPane({ title, src, path }: { title: string; src: string; path?: string }) {
  const [zoom, setZoom] = React.useState<PdfZoom>('fit')
  const [openError, setOpenError] = React.useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-0 px-3 py-1.5">
        <div className="min-w-0 flex-1 truncate text-xs text-ink">{title}</div>
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-md px-1.5 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          onClick={() => setZoom((current) => (current === 100 ? 'fit' : current === 'fit' ? 100 : 100))}
          title="Fit page width or 100%"
        >
          {zoom === 'fit' ? 'Fit' : `${zoom}%`}
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          disabled={zoom === 'fit' || zoom === 100}
          onClick={() =>
            setZoom((current) => (current === 160 ? 125 : current === 125 ? 100 : current))
          }
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          disabled={zoom === 160}
          onClick={() =>
            setZoom((current) => (current === 'fit' || current === 100 ? 125 : current === 125 ? 160 : current))
          }
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {path ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-accent hover:bg-accent/10"
            onClick={() => {
              setOpenError(null)
              void safeInvoke<void>('open_pack_artifact', { path }).then((res) => {
                if (!res.ok) setOpenError(res.error.message || String(res.error))
              })
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            System viewer
          </button>
        ) : null}
      </div>
      {openError ? <p className="px-3 py-1 text-[11px] text-danger">{openError}</p> : null}
      <iframe
        key={`${src}-${zoom}`}
        title={title}
        src={pdfSrcWithView(src, zoom)}
        className="min-h-0 w-full flex-1 border-0 bg-surface-1"
      />
    </div>
  )
}

export function ArtifactReader({ title = 'Application artifacts', nodes, initialId, onClose }: Props) {
  const [selectedId, setSelectedId] = React.useState<string | null>(initialId ?? nodes[0]?.id ?? null)
  const [preview, setPreview] = React.useState<Preview>({ kind: 'empty' })
  const [copied, setCopied] = React.useState(false)
  const [treeOpen, setTreeOpen] = React.useState(true)
  const blobUrlRef = React.useRef<string | null>(null)

  const revokeBlob = React.useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  React.useEffect(() => {
    return () => revokeBlob()
  }, [revokeBlob])

  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0]

  React.useEffect(() => {
    if (!selected) {
      setPreview({ kind: 'empty' })
      return
    }
    revokeBlob()
    if (selected.text != null) {
      setPreview({ kind: 'text', title: selected.label, text: selected.text })
      return
    }
    if (!selected.path) {
      setPreview({ kind: 'empty' })
      return
    }
    setPreview({ kind: 'loading', label: selected.label })
    void safeInvoke<{
      filename: string
      kind: string
      text?: string | null
      pdf_base64?: string | null
    }>('read_pack_artifact', { path: selected.path }).then((res) => {
      if (!res.ok) {
        setPreview({
          kind: 'error',
          title: selected.label,
          message: res.error.message || String(res.error),
        })
        return
      }
      if (res.value.kind === 'pdf' && res.value.pdf_base64) {
        const binary = atob(res.value.pdf_base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        blobUrlRef.current = blobUrl
        setPreview({
          title: res.value.filename || selected.label,
          kind: 'pdf',
          src: blobUrl,
          path: selected.path,
        })
        setTreeOpen(false)
        return
      }
      setPreview({
        kind: 'text',
        title: res.value.filename || selected.label,
        text: res.value.text || '',
      })
    })
  }, [selected, revokeBlob])

  const groups = React.useMemo(() => {
    const order: string[] = []
    const map = new Map<string, ArtifactTreeNode[]>()
    for (const node of nodes) {
      if (!map.has(node.group)) {
        map.set(node.group, [])
        order.push(node.group)
      }
      map.get(node.group)?.push(node)
    }
    return order.map((group) => ({ group, items: map.get(group) ?? [] }))
  }, [nodes])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-0"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
            onClick={() => setTreeOpen((open) => !open)}
            aria-label={treeOpen ? 'Hide file list' : 'Show file list'}
          >
            {treeOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
          <div className="min-w-0 text-sm font-medium text-ink truncate">{title}</div>
        </div>
        <div className="flex items-center gap-1">
          {preview.kind === 'text' && preview.text ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
              onClick={() => {
                navigator.clipboard?.writeText(preview.text).then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1200)
                }).catch(() => {})
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {treeOpen ? (
          <aside className="w-[min(280px,38%)] shrink-0 overflow-auto border-r border-border-subtle bg-surface-1/60 py-2">
            {groups.map(({ group, items }) => (
              <div key={group} className="mb-2">
                <div className="flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-wide text-ink-faint">
                  <Folder className="h-3 w-3" />
                  {group}
                </div>
                {items.map((node) => {
                  const active = node.id === (selected?.id ?? selectedId)
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={
                        active
                          ? 'flex w-full items-center gap-1.5 px-3 py-1 text-left text-[12px] bg-accent/15 text-accent'
                          : 'flex w-full items-center gap-1.5 px-3 py-1 text-left text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }
                      onClick={() => setSelectedId(node.id)}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{node.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </aside>
        ) : null}
        <section className="min-w-0 flex-1 overflow-hidden bg-surface-0">
          {preview.kind === 'empty' ? (
            <p className="p-6 text-sm text-ink-muted">Select a file.</p>
          ) : preview.kind === 'loading' ? (
            <p className="p-6 text-sm text-ink-muted">Opening {preview.label}…</p>
          ) : preview.kind === 'error' ? (
            <p className="p-6 text-sm text-danger">{preview.message}</p>
          ) : preview.kind === 'pdf' ? (
            <PdfPane title={preview.title} src={preview.src} path={preview.path} />
          ) : (
            <article className="h-full overflow-auto">
              <pre className="mx-auto max-w-3xl whitespace-pre-wrap px-6 py-8 font-sans text-[15px] leading-7 text-ink m-0">
                {preview.text}
              </pre>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}

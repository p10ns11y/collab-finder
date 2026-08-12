import { useEffect, useRef } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '../ui/button'
import { Chip } from '../ui/chip'
import { SectionLabel } from '../ui/section-label'
import {
  QUEST_KIND_CHIPS,
  type QuestKind,
  type QuestResult,
  type QuestTurn,
} from '../../core/domain/quest'
import type { AsyncState } from '../../core/async'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Props = {
  open: boolean
  kind: QuestKind
  draft: string
  turns: QuestTurn[]
  sessionId?: string
  quest: AsyncState<QuestResult>
  dispatch: Dispatch<FinderMsg>
}

export function QuestDrawer({ open, kind, draft, turns, sessionId, quest, dispatch }: Props) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const busy = quest.status === 'loading'
  const answer = quest.status === 'ready' ? quest.data : null
  const err = quest.status === 'failed' ? quest.error?.message || String(quest.error) : null

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => fieldRef.current?.focus())
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        dispatch({ type: 'QuestClosed' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, dispatch])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="h-full flex-1 bg-surface-0/70"
        aria-label="Close quest"
        onClick={() => dispatch({ type: 'QuestClosed' })}
      />
      <aside
        role="dialog"
        aria-label="Local Grok quest"
        className="flex h-full w-full max-w-[min(420px,92vw)] flex-col border-l border-border-subtle bg-surface-1"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <div className="min-w-0">
            <SectionLabel>Quest</SectionLabel>
            <p className="ui-meta px-0.5">
              Local Grok thread. Free answers + search. Follow-ups keep session.
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => dispatch({ type: 'QuestThreadCleared' })}
            >
              New thread
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: 'QuestClosed' })}>
              Close
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 px-3 pt-3">
          {QUEST_KIND_CHIPS.map((chip) => (
            <Chip
              key={chip.id}
              active={kind === chip.id}
              onClick={() => dispatch({ type: 'QuestKindChanged', kind: chip.id })}
            >
              {chip.label}
            </Chip>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(e) => dispatch({ type: 'QuestDraftChanged', draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (!busy) dispatch({ type: 'QuestRequested' })
              }
            }}
            placeholder={
              sessionId ? 'Follow-up — same thread…' : 'Ask a free-form question…'
            }
            className="min-h-[88px] resize-none rounded-md border border-border-default bg-surface-0/70 px-2.5 py-2 font-mono text-xs text-ink outline-none focus-visible:ring-1 focus-visible:ring-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="ui-meta">
              {sessionId ? 'thread on · follow-ups keep context' : '⌘↵ send · new thread'}
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => dispatch({ type: 'QuestRequested' })}
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              {busy ? 'Asking…' : 'Ask local Grok'}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border-subtle bg-surface-0/40 p-2.5">
            {turns.length > 0 ? (
              <div className="space-y-3">
                {turns.map((turn, i) => (
                  <div key={`${turn.role}-${i}`}>
                    <p className="ui-meta mb-0.5">{turn.role === 'user' ? 'You' : 'Grok'}</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{turn.text}</p>
                  </div>
                ))}
                {answer ? (
                  <p className="ui-meta">
                    {answer.backend} · {answer.prompt_chars} chars · {answer.elapsed_ms} ms
                  </p>
                ) : null}
              </div>
            ) : err ? (
              <p className="text-xs text-ink-muted">{err}</p>
            ) : (
              <p className="ui-meta">
                Free: answer + web if needed. EVA/Hunt/Apply stay compact. No yolo. No writes.
              </p>
            )}
            {err && turns.length > 0 ? <p className="mt-2 text-xs text-ink-muted">{err}</p> : null}
          </div>
        </div>
      </aside>
    </div>
  )
}

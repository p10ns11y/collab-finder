/**
 * Navigating — cash-path cockpit (not the Mission hunt screen).
 * Reads mission-map SoT. Writes stay with mm-lifeos-graph / CF apply cmds.
 */
import { useEffect, useState } from 'react'
import { readHeadingSnapshot } from '../../adapters/tauri/heading-boot'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { SectionLabel } from '../../components/ui/section-label'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'

type Stage = {
  id?: string
  what?: string
  class?: string
  contact?: {
    url?: string
    email?: string
    followup_stage?: string
    followup_when?: string
    last_touch?: string
  }
}

type Props = {
  dispatch: Dispatch<FinderMsg>
}

export function HeadingScreen({ dispatch: _dispatch }: Props) {
  const [err, setErr] = useState<string | null>(null)
  const [g, setG] = useState('')
  const [stages, setStages] = useState<Stage[]>([])
  const [contacts, setContacts] = useState('')
  const [chip, setChip] = useState('')

  useEffect(() => {
    void (async () => {
      const snap = await readHeadingSnapshot()
      if (!snap.ok) {
        setErr(snap.error.message)
        return
      }
      try {
        const map = JSON.parse(snap.value.mapJson || '{}') as {
          g?: string
          stages?: Stage[]
        }
        setG(map.g || '')
        setStages(Array.isArray(map.stages) ? map.stages : [])
        setContacts(snap.value.contacts || '')
        const wb = JSON.parse(snap.value.waybar || '{}') as { text?: string }
        setChip(wb.text || '')
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  const next = stages.find((s) => (s.class || '').toLowerCase() === 'do')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
      <div>
        <SectionLabel>Navigating</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">
          Arrive: {g || '—'} {chip ? `· now: ${chip}` : ''}
        </p>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {next && (
        <div className="rounded-md border border-accent/30 bg-accent-soft/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Do this now</p>
          <p className="mt-1 text-sm text-ink">{next.what}</p>
          <StageActions stage={next} />
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {stages.map((s, i) => (
          <li
            key={s.id || i}
            className="rounded-md border border-border-subtle bg-surface-2/50 px-3 py-2"
          >
            <p className="text-sm text-ink">{s.what || s.id}</p>
            <p className="text-xs text-ink-muted">
              {s.class}
              {s.contact?.followup_stage ? ` · ${s.contact.followup_stage}` : ''}
              {s.contact?.followup_when ? ` · ${s.contact.followup_when}` : ''}
            </p>
            <StageActions stage={s} />
          </li>
        ))}
      </ul>
      {contacts && (
        <pre className="whitespace-pre-wrap rounded-md bg-surface-1 p-3 text-xs text-ink-muted">
          {contacts}
        </pre>
      )}
    </div>
  )
}

function StageActions({ stage }: { stage: Stage }) {
  const url = stage.contact?.url
  const email = stage.contact?.email
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {url && (
        <button
          type="button"
          className="text-xs text-accent underline"
          onClick={() => void safeInvoke('open_external_url', { url })}
        >
          Open posting
        </button>
      )}
      {email && (
        <button
          type="button"
          className="text-xs text-accent underline"
          onClick={() => void navigator.clipboard.writeText(email)}
        >
          Copy mail
        </button>
      )}
    </div>
  )
}



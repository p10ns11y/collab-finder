/**
 * Navigating — cash-path cockpit (not the Mission hunt screen).
 * Reads mission-map SoT. Writes stay with mm-lifeos-graph / CF apply cmds.
 */
import { useEffect, useMemo, useState } from 'react'
import { readHeadingSnapshot } from '../../adapters/tauri/heading-boot'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { SectionLabel } from '../../components/ui/section-label'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { FinderScreen } from '../../core/finder/model'
import {
  decodeWaybarChip,
  findNextDo,
  groupStagesExcludingDo,
  parseContactsActionable,
  parseMissionMap,
  stageActions,
  stageMetaLine,
  type ContactHint,
  type MissionStage,
  type StageAction,
} from '../../core/domain/heading-cockpit'

type Props = {
  dispatch: Dispatch<FinderMsg>
}

export function HeadingScreen({ dispatch }: Props) {
  const [err, setErr] = useState<string | null>(null)
  const [g, setG] = useState('')
  const [stages, setStages] = useState<MissionStage[]>([])
  const [contactHints, setContactHints] = useState<ContactHint[]>([])
  const [waybarPlain, setWaybarPlain] = useState('')

  useEffect(() => {
    void (async () => {
      const snap = await readHeadingSnapshot()
      if (!snap.ok) {
        setErr(snap.error.message)
        return
      }
      try {
        const map = parseMissionMap(snap.value.mapJson || '{}')
        setG(map.g || '')
        setStages(map.stages ?? [])
        setContactHints(parseContactsActionable(snap.value.contacts || ''))
        const wb = JSON.parse(snap.value.waybar || '{}') as { text?: string }
        setWaybarPlain(decodeWaybarChip(wb.text || '').plain)
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  const nextDo = useMemo(() => findNextDo(stages), [stages])
  const groups = useMemo(() => groupStagesExcludingDo(stages), [stages])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
      <div>
        <SectionLabel>Navigating</SectionLabel>
        <p className="mt-1 text-sm text-ink">
          {g ? (
            <>
              Arrive: <span className="font-medium">{g}</span>
            </>
          ) : (
            <span className="text-ink-muted">Arrive: —</span>
          )}
        </p>
        {waybarPlain && (
          <p className="mt-1 text-xs text-ink-muted">{waybarPlain}</p>
        )}
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}

      {nextDo ? (
        <div className="rounded-md border border-accent/30 bg-accent-soft/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Next do</p>
          <p className="mt-1 text-sm font-medium text-ink">{nextDo.what}</p>
          <StageActionsRow stage={nextDo} dispatch={dispatch} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No Do stage in mission map.</p>
      )}

      <StageGroupSection title="Wait" stages={groups.wait} dispatch={dispatch} />
      <StageGroupSection title="Done" stages={groups.done} dispatch={dispatch} muted />
      <StageGroupSection title="Risk" stages={groups.risk} dispatch={dispatch} />
      {groups.park.length > 0 && (
        <details className="rounded-md border border-border-subtle/60 bg-surface-1/40">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
            Park ({groups.park.length})
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-2">
            {groups.park.map((s, i) => (
              <StageRow key={s.id || i} stage={s} dispatch={dispatch} muted />
            ))}
          </ul>
        </details>
      )}

      {contactHints.length > 0 && (
        <div className="rounded-md border border-border-subtle bg-surface-1/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Contacts</p>
          <ul className="mt-2 flex flex-col gap-1">
            {contactHints.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span className="text-ink-muted">{c.label}</span>
                {c.url && (
                  <button
                    type="button"
                    className="text-xs text-accent underline"
                    onClick={() => void safeInvoke('open_external_url', { url: c.url })}
                  >
                    Open
                  </button>
                )}
                {c.email && (
                  <button
                    type="button"
                    className="text-xs text-accent underline"
                    onClick={() => void navigator.clipboard.writeText(c.email!)}
                  >
                    Copy mail
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StageGroupSection({
  title,
  stages,
  dispatch,
  muted = false,
}: {
  title: string
  stages: MissionStage[]
  dispatch: Dispatch<FinderMsg>
  muted?: boolean
}) {
  if (stages.length === 0) return null
  return (
    <section>
      <p
        className={`mb-2 text-xs font-medium uppercase tracking-wide ${muted ? 'text-ink-faint' : 'text-ink-muted'}`}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {stages.map((s, i) => (
          <StageRow key={s.id || i} stage={s} dispatch={dispatch} muted={muted} />
        ))}
      </ul>
    </section>
  )
}

function StageRow({
  stage,
  dispatch,
  muted = false,
}: {
  stage: MissionStage
  dispatch: Dispatch<FinderMsg>
  muted?: boolean
}) {
  return (
    <li
      className={`rounded-md border border-border-subtle px-3 py-2 ${
        muted ? 'bg-surface-1/30 opacity-80' : 'bg-surface-2/50'
      }`}
    >
      <p className="text-sm text-ink">{stage.what || stage.id}</p>
      <p className="text-xs text-ink-muted">{stageMetaLine(stage)}</p>
      <StageActionsRow stage={stage} dispatch={dispatch} />
    </li>
  )
}

function StageActionsRow({
  stage,
  dispatch,
}: {
  stage: MissionStage
  dispatch: Dispatch<FinderMsg>
}) {
  const actions = stageActions(stage)
  if (actions.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {actions.map((a) => (
        <ActionButton key={actionKey(a)} action={a} dispatch={dispatch} />
      ))}
    </div>
  )
}

function actionKey(a: StageAction): string {
  if (a.kind === 'open_url') return `url:${a.url}`
  if (a.kind === 'copy_email') return `mail:${a.email}`
  return `nav:${a.screen}`
}

function ActionButton({
  action,
  dispatch,
}: {
  action: StageAction
  dispatch: Dispatch<FinderMsg>
}) {
  if (action.kind === 'open_url') {
    return (
      <button
        type="button"
        className="text-xs text-accent underline"
        onClick={() => void safeInvoke('open_external_url', { url: action.url })}
      >
        {action.label}
      </button>
    )
  }
  if (action.kind === 'copy_email') {
    return (
      <button
        type="button"
        className="text-xs text-accent underline"
        onClick={() => void navigator.clipboard.writeText(action.email)}
      >
        {action.label}
      </button>
    )
  }
  return (
    <button
      type="button"
      className="text-xs text-accent underline"
      onClick={() => dispatch({ type: 'ScreenChanged', screen: action.screen as FinderScreen })}
    >
      {action.label}
    </button>
  )
}

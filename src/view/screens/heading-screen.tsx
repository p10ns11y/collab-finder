/**
 * Navigating — one Next Do.
 * Mission-map SoT still loads through heading-boot. Craft, fleet, weather, people,
 * and the stage log stay off this screen so the act is the first thing you read.
 * CAPTCHA / BankID / pay / send pauses stay; nothing here submits an application.
 */
import { useEffect, useMemo, useState } from 'react'
import { readHeadingSnapshot } from '../../adapters/tauri/heading-boot'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { Button } from '../../components/ui/button'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { FinderScreen } from '../../core/finder/model'
import {
  nextDoFrame,
  parseMissionMap,
  stageActions,
  type MissionStage,
  type StageAction,
} from '../../core/domain/heading-cockpit'

type Props = {
  dispatch: Dispatch<FinderMsg>
}

export function HeadingScreen({ dispatch }: Props) {
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [stages, setStages] = useState<MissionStage[]>([])

  useEffect(() => {
    void (async () => {
      const snap = await readHeadingSnapshot()
      if (!snap.ok) {
        setErr(snap.error.message)
        setReady(true)
        return
      }
      try {
        const map = parseMissionMap(snap.value.mapJson || '{}')
        setStages(map.stages ?? [])
        setErr(null)
      } catch (e) {
        setErr(String(e))
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const frame = useMemo(() => nextDoFrame(stages), [stages])
  const actions = frame.next ? stageActions(frame.next) : []

  function run(action: StageAction) {
    if (action.kind === 'open_url') void safeInvoke('open_external_url', { url: action.url })
    else if (action.kind === 'copy_email') void navigator.clipboard.writeText(action.email)
    else dispatch({ type: 'ScreenChanged', screen: action.screen as FinderScreen })
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-6 overflow-auto px-8 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Next Do</p>
      {err && <p className="text-body-sm text-danger">{err}</p>}
      {ready && frame.next && (
        <>
          <h1 className="max-w-3xl text-4xl font-medium leading-[1.15] tracking-tight text-ink">
            {frame.next.what || frame.next.id}
          </h1>
          {frame.heroIsHitl && (
            <p className="text-body text-warning">Paused for you. Nothing is sent automatically.</p>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((action, i) => (
                <Button
                  key={actionKey(action)}
                  type="button"
                  size="lg"
                  variant={i === 0 ? 'primary' : 'secondary'}
                  onClick={() => run(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {ready && !frame.next && !err && (
        <h1 className="max-w-3xl text-3xl font-medium text-ink-muted">No Do stage on the map.</h1>
      )}
      {ready && frame.hitl.length > 0 && (
        <section aria-label="HITL pauses" className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Paused for you
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {frame.hitl.map((stage, i) => (
              <li key={stage.id || i} className="text-body text-ink">
                {stage.what || stage.id}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function actionKey(action: StageAction): string {
  if (action.kind === 'open_url') return `url:${action.url}`
  if (action.kind === 'copy_email') return `mail:${action.email}`
  return `nav:${action.screen}`
}

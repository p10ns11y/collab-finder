/**
 * Navigating — one Next Do, with the transport frame around that act.
 * Stages paint only when synced-at is current. A failed refresh is one sentence
 * and no hero. Fleet, people, the stage log, and craft artwork stay off.
 * Sailing is not a view.
 * CAPTCHA / BankID / pay / send pauses stay; nothing here submits an application.
 */
import { useEffect, useMemo, useState } from 'react'
import { formatSyncedAt, readHeadingSnapshot } from '../../adapters/tauri/heading-boot'
import { safeInvoke } from '../../adapters/tauri/safe-invoke'
import { Button } from '../../components/ui/button'
import type { Dispatch } from '../../core/mvu/engine'
import type { FinderMsg } from '../../core/finder/msg'
import type { FinderScreen } from '../../core/finder/model'
import {
  decodeWaybarChip,
  isHitlPause,
  nextDoFrame,
  parseMissionMap,
  stageActions,
  type MissionStage,
  type StageAction,
} from '../../core/domain/heading-cockpit'
import { actCopy, buildCockpit, heroChipLabel } from '../../core/domain/heading-transport'

type Props = {
  dispatch: Dispatch<FinderMsg>
}

export function HeadingScreen({ dispatch }: Props) {
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [stages, setStages] = useState<MissionStage[]>([])
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [waybar, setWaybar] = useState('')

  useEffect(() => {
    void (async () => {
      const snap = await readHeadingSnapshot()
      if (!snap.ok) {
        setErr(snap.error.message)
        setStages([])
        setSyncedAt(null)
        setSyncError(null)
        setGoal('')
        setWaybar('')
        setReady(true)
        return
      }
      if (snap.value.syncError) {
        setErr(null)
        setStages([])
        setSyncedAt(null)
        setSyncError(snap.value.syncError)
        setGoal('')
        setWaybar('')
        setReady(true)
        return
      }
      try {
        const map = parseMissionMap(snap.value.mapJson || '{}')
        setStages(map.stages ?? [])
        setSyncedAt(snap.value.syncedAt)
        setSyncError(null)
        setGoal(map.g ?? '')
        setWaybar(snap.value.waybar || '')
        setErr(null)
      } catch (e) {
        setErr(String(e))
        setStages([])
        setSyncedAt(null)
        setSyncError(null)
        setGoal('')
        setWaybar('')
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const cockpit = useMemo(
    () =>
      buildCockpit({
        g: goal,
        stages,
        waybar: decodeWaybarChip(waybar),
      }),
    [goal, stages, waybar],
  )
  const frame = useMemo(() => nextDoFrame(stages), [stages])
  const act = cockpit.hero.act
  const craft = cockpit.hero.craft
  const blackout = cockpit.weather.state === 'blackout'
  const actions = act ? stageActions(act) : []
  const chip = act && craft ? heroChipLabel(craft, cockpit.focus.focus) : null
  const badges = act ? actCopy(act).badges : []
  const syncedLine = syncedAt ? formatSyncedAt(syncedAt) : ''
  const showMap = ready && !syncError

  function run(action: StageAction) {
    if (action.kind === 'open_url') void safeInvoke('open_external_url', { url: action.url })
    else if (action.kind === 'copy_email') void navigator.clipboard.writeText(action.email)
    else dispatch({ type: 'ScreenChanged', screen: action.screen as FinderScreen })
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-6 overflow-auto px-8 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Next Do</p>
      {syncedLine && <p className="text-body-sm text-ink-muted">Synced {syncedLine}</p>}
      {syncError && <p className="text-body text-danger">{syncError}</p>}
      {err && <p className="text-body-sm text-danger">{err}</p>}
      {showMap && blackout && (
        <>
          <h1 className="max-w-3xl text-4xl font-medium leading-[1.15] tracking-tight text-ink">
            {cockpit.hero.flavor}
          </h1>
          <p className="max-w-3xl text-body text-ink-muted">{cockpit.weather.sentence}</p>
        </>
      )}
      {showMap && !blackout && act && chip && (
        <>
          <p className="w-fit rounded-full border border-border-default bg-surface-2 px-3 py-1 text-body-sm text-ink">
            {chip}
          </p>
          <h1 className="max-w-3xl text-4xl font-medium leading-[1.15] tracking-tight text-ink">
            {act.what || act.id}
          </h1>
          <p className="max-w-3xl text-body text-ink">{cockpit.weather.sentence}</p>
          {badges.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <li key={badge} className="rounded-full bg-surface-3 px-3 py-1 text-body-sm text-ink">
                  {badge}
                </li>
              ))}
            </ul>
          )}
          {cockpit.hero.arrive && <p className="text-body text-ink">{cockpit.hero.arrive}</p>}
          {cockpit.hero.extraActs > 0 && (
            <p className="text-body-sm text-ink-muted">Extra acts · {cockpit.hero.extraActs}</p>
          )}
          {isHitlPause(act) && (
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
      {showMap && !blackout && !act && !err && (
        <h1 className="max-w-3xl text-3xl font-medium text-ink-muted">No Do stage on the map.</h1>
      )}
      {showMap && !blackout && frame.hitl.length > 0 && (
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

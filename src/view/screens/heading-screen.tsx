/**
 * Navigating — cash-path cockpit (not the Mission hunt screen).
 * Reads mission-map SoT. Writes stay with mm-lifeos-graph / CF apply cmds.
 *
 * Four life slots map 1:1 to four transport families, all of them first-class:
 * debt/Space, career/Air, sweden/Water, body/Land. The slot in focus is the hero craft;
 * the other three sit in the dock and can transport the hero. Navigating opens in the Air
 * cockpit because this is the career hunt surface.
 *
 * Layout is a deliberate single column, not the phi split of the hunt screens: a cockpit's
 * hero is a band, and splitting it would halve the vehicle's claim on first glance.
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
  parseContactsActionable,
  parseMissionMap,
  stageActions,
  type ContactHint,
  type MissionStage,
  type WaybarStatus,
} from '../../core/domain/heading-cockpit'
import {
  buildCockpit,
  transportFocus,
  type Slot,
} from '../../core/domain/heading-transport'
import {
  CockpitLog,
  FleetDock,
  HeroBerth,
  PeoplePanel,
  WeatherStrip,
  type ActionHandlers,
} from './navigating-zones'

type Props = {
  dispatch: Dispatch<FinderMsg>
}

const NO_WAYBAR = decodeWaybarChip('')

export function HeadingScreen({ dispatch }: Props) {
  const [err, setErr] = useState<string | null>(null)
  const [g, setG] = useState('')
  const [stages, setStages] = useState<MissionStage[]>([])
  const [contactHints, setContactHints] = useState<ContactHint[]>([])
  const [waybar, setWaybar] = useState<WaybarStatus>(NO_WAYBAR)
  /** Focus resets per visit, so Navigating always opens in the Air cockpit. */
  const [userFocus, setUserFocus] = useState<Slot | null>(null)
  const [announce, setAnnounce] = useState('')

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
        setWaybar(decodeWaybarChip(wb.text || ''))
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  const cockpit = useMemo(
    () => buildCockpit({ g, stages, waybar, userFocus, mapError: err }),
    [g, stages, waybar, userFocus, err],
  )

  const handlers: ActionHandlers = useMemo(
    () => ({
      openUrl: (url) => void safeInvoke('open_external_url', { url }),
      copyEmail: (email) => void navigator.clipboard.writeText(email),
      navigate: (screen) => dispatch({ type: 'ScreenChanged', screen: screen as FinderScreen }),
    }),
    [dispatch],
  )

  function transport(target: Slot) {
    const next = transportFocus(cockpit.focus.focus, target)
    setUserFocus(next.focus)
    setAnnounce(next.announce)
  }

  const heroStage = cockpit.hero.act ?? cockpit.hero.waitingOn

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
      <div>
        <SectionLabel>Navigating</SectionLabel>
        {cockpit.hero.arrive && (
          <p className="mt-1 text-body text-ink">{cockpit.hero.arrive}</p>
        )}
      </div>

      {err && <p className="text-body-sm text-danger">{err}</p>}

      <HeroBerth
        hero={cockpit.hero}
        focus={cockpit.focus.focus}
        actions={heroStage ? stageActions(heroStage) : []}
        handlers={handlers}
      />

      <WeatherStrip weather={cockpit.weather} />

      <FleetDock
        dock={cockpit.dock}
        hint={cockpit.weather.transportHint}
        onTransport={transport}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <CockpitLog
        waiting={cockpit.log.waiting}
        risk={cockpit.log.risk}
        done={cockpit.log.done}
        park={cockpit.log.park}
        unclassified={cockpit.log.unclassified}
        handlers={handlers}
      />

      <PeoplePanel hints={contactHints} handlers={handlers} />
    </div>
  )
}

/**
 * Navigating zones — presentational bands for the cash-path cockpit.
 *
 * DOM order is the attention order: vehicle → one act → weather → dock → log.
 * Props in, events out; every string comes from heading-transport or the SoT itself.
 */
import { TransportCraft, WeatherGlyph } from '../../components/finder/transport-craft'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { SectionLabel } from '../../components/ui/section-label'
import {
  stageActions,
  stageMetaLine,
  type ContactHint,
  type MissionStage,
  type StageAction,
} from '../../core/domain/heading-cockpit'
import {
  actCopy,
  bandLabel,
  craftFor,
  slotLabel,
  type Craft,
  type HeroBand,
  type Slot,
  type SlotSummary,
  type Weather,
} from '../../core/domain/heading-transport'

export type ActionHandlers = {
  openUrl: (url: string) => void
  copyEmail: (email: string) => void
  navigate: (screen: string) => void
}

/**
 * ① VEHICLE + ② ONE ACT. The craft claims the space, the job sentence claims the type —
 * a hire visitor reads the plain act first and the metaphor only as a footnote.
 */
export function HeroBerth({
  hero,
  focus,
  actions,
  handlers,
}: {
  hero: HeroBand
  focus: Slot
  actions: StageAction[]
  handlers: ActionHandlers
}) {
  const craft = hero.craft
  const shown = hero.act ?? hero.waitingOn
  const copy = hero.actCopy ?? (hero.waitingOn ? actCopy(hero.waitingOn) : null)
  /** The operator's own instruction wins: a don't-chase wait never gets a primary button. */
  const chaseable = Boolean(hero.act) || !(craft?.dying || copy?.badges.includes("Don't chase"))
  return (
    <section className="ui-craft-berth flex items-center gap-5 p-5" aria-label="Current craft">
      {craft && (
        <TransportCraft
          variant={craft.variant}
          motion={craft.motion}
          alert={craft.alert}
          size="hero"
          className="shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="ui-section-label uppercase tracking-[0.06em] text-ink-muted">
          {craft ? bandLabel(craft.family) : ''} · {slotLabel(focus)}
        </p>

        {copy ? (
          <>
            {!hero.act && (
              <p className="mt-2 ui-meta uppercase tracking-wide">Waiting on</p>
            )}
            <ActLines
              head={copy.head}
              qualifier={copy.qualifier}
              badges={copy.badges}
              full={shown?.what}
              muted={!hero.act}
            />
          </>
        ) : (
          <p className="mt-2 text-body text-ink-muted">{hero.emptyCopy}</p>
        )}

        {craft && <p className="mt-2 ui-meta">{hero.flavor}</p>}

        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((action, i) => (
              <StageActionButton
                key={actionKey(action)}
                action={action}
                handlers={handlers}
                primary={i === 0 && chaseable}
              />
            ))}
          </div>
        )}

        {hero.extraActs > 0 && (
          <p className="mt-2 ui-meta">
            {hero.extraActs === 1
              ? '1 more act in this cockpit — below.'
              : `${hero.extraActs} more acts in this cockpit — below.`}
          </p>
        )}
      </div>
    </section>
  )
}

function ActLines({
  head,
  qualifier,
  badges,
  full,
  muted = false,
}: {
  head: string
  qualifier: string | null
  badges: string[]
  full?: string
  muted?: boolean
}) {
  return (
    <>
      <p
        className={`mt-1 line-clamp-2 text-xl font-medium leading-snug ${muted ? 'text-ink-muted' : 'text-ink'}`}
        title={full}
      >
        {head}
      </p>
      {qualifier && <p className="mt-1 line-clamp-3 text-body-sm text-ink-muted">{qualifier}</p>}
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge}>{badge}</Badge>
          ))}
        </div>
      )}
    </>
  )
}

/** ③ WEATHER. Plain sentence first, flavor word second — never the flavor word alone. */
export function WeatherStrip({ weather }: { weather: Weather }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-1/60 px-3 py-2"
    >
      <WeatherGlyph state={weather.state} className="h-5 w-5 shrink-0 text-ink-muted" />
      <p className="min-w-0 flex-1 text-body-sm text-ink-muted">{weather.sentence}</p>
      <span className="ui-chip shrink-0">{weather.flavor}</span>
    </div>
  )
}

/** ④ DOCK. The three slots you are not sitting in; clicking one transports the hero. */
export function FleetDock({
  dock,
  hint,
  onTransport,
}: {
  dock: SlotSummary[]
  hint: Slot | null
  onTransport: (slot: Slot) => void
}) {
  return (
    <section>
      <SectionLabel>Fleet dock</SectionLabel>
      <div role="group" aria-label="Other slots" className="mt-2 grid grid-cols-3 gap-2">
        {dock.map((tile) => (
          <button
            key={tile.slot}
            type="button"
            onClick={() => onTransport(tile.slot)}
            className={`ui-craft-slot w-full text-left ${hint === tile.slot ? 'border-accent/45' : ''}`}
            title={`${slotLabel(tile.slot)} — ${bandLabel(tile.family)}. Show this craft.`}
          >
            <TransportCraft
              variant={tile.craft}
              motion={tile.motion}
              alert={tile.risk > 0}
              size="dock"
              className="shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm text-ink">{slotLabel(tile.slot)}</span>
              <span className="ui-meta block truncate">
                {tile.headline ?? 'Nothing on the map'}
              </span>
            </span>
            {tile.risk > 0 && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-danger"
              />
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

/** Everything past the two-second budget: the focused cockpit's own stages. */
export function CockpitLog({
  waiting,
  risk,
  done,
  park,
  unclassified,
  handlers,
}: {
  waiting: MissionStage[]
  risk: MissionStage[]
  done: MissionStage[]
  park: MissionStage[]
  unclassified: number
  handlers: ActionHandlers
}) {
  return (
    <>
      <StageSection title="Risk in this cockpit" stages={risk} handlers={handlers} />
      <StageSection title="Waiting in this cockpit" stages={waiting} handlers={handlers} />
      <CollapsedSection title="Flown" stages={done} handlers={handlers} cap={8} />
      <CollapsedSection title="Parked" stages={park} handlers={handlers} cap={12} />
      {unclassified > 0 && (
        <p className="ui-meta">
          {unclassified === 1
            ? '1 stage has no class and is not shown.'
            : `${unclassified} stages have no class and are not shown.`}
        </p>
      )}
    </>
  )
}

function StageSection({
  title,
  stages,
  handlers,
}: {
  title: string
  stages: MissionStage[]
  handlers: ActionHandlers
}) {
  if (stages.length === 0) return null
  return (
    <section>
      <SectionLabel meta={stages.length}>{title}</SectionLabel>
      <ul className="mt-2 flex flex-col gap-2">
        {stages.map((stage, i) => (
          <StageRow key={stage.id || i} stage={stage} handlers={handlers} />
        ))}
      </ul>
    </section>
  )
}

function CollapsedSection({
  title,
  stages,
  handlers,
  cap,
}: {
  title: string
  stages: MissionStage[]
  handlers: ActionHandlers
  cap: number
}) {
  if (stages.length === 0) return null
  const shown = stages.slice(0, cap)
  const rest = stages.length - shown.length
  return (
    <details className="rounded-lg border border-border-subtle/60 bg-surface-1/40">
      <summary className="ui-section-label cursor-pointer px-3 py-2">
        {title} ({stages.length})
      </summary>
      <ul className="flex flex-col gap-2 px-3 pb-3">
        {shown.map((stage, i) => (
          <StageRow key={stage.id || i} stage={stage} handlers={handlers} muted />
        ))}
        {rest > 0 && <li className="ui-meta">+{rest} more</li>}
      </ul>
    </details>
  )
}

/** A log row wears its own craft, so the fleet reads consistently below the hero too. */
function StageRow({
  stage,
  handlers,
  muted = false,
}: {
  stage: MissionStage
  handlers: ActionHandlers
  muted?: boolean
}) {
  const craft = craftFor(stage)
  return (
    <li
      className={`flex items-start gap-3 rounded-md border border-border-subtle px-3 py-2 ${
        muted ? 'bg-surface-1/30 opacity-80' : 'bg-surface-2/50'
      }`}
    >
      <TransportCraft
        variant={craft.variant}
        motion={craft.motion}
        alert={craft.alert}
        size="dock"
        className="mt-1 shrink-0 text-ink-muted"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-ink">{stage.what || stage.id}</p>
        <p className="ui-meta">{stageMetaLine(stage)}</p>
        <p className="ui-meta">{craftFlavor(craft)}</p>
        <StageActionsRow stage={stage} handlers={handlers} />
      </div>
    </li>
  )
}

function craftFlavor(craft: Craft): string {
  const marks = [craft.label]
  if (craft.dying) marks.push('dying unless they write')
  else if (craft.stale) marks.push('past its own reply window')
  return marks.join(' · ')
}

function StageActionsRow({
  stage,
  handlers,
}: {
  stage: MissionStage
  handlers: ActionHandlers
}) {
  const actions = stageActions(stage)
  if (actions.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {actions.map((action) => (
        <StageActionButton key={actionKey(action)} action={action} handlers={handlers} link />
      ))}
    </div>
  )
}

function actionKey(action: StageAction): string {
  if (action.kind === 'open_url') return `url:${action.url}`
  if (action.kind === 'copy_email') return `mail:${action.email}`
  return `nav:${action.screen}`
}

function StageActionButton({
  action,
  handlers,
  primary = false,
  link = false,
}: {
  action: StageAction
  handlers: ActionHandlers
  primary?: boolean
  link?: boolean
}) {
  const onClick = () => {
    if (action.kind === 'open_url') handlers.openUrl(action.url)
    else if (action.kind === 'copy_email') handlers.copyEmail(action.email)
    else handlers.navigate(action.screen)
  }
  if (link) {
    return (
      <button type="button" className="text-xs text-accent underline" onClick={onClick}>
        {action.label}
      </button>
    )
  }
  return (
    <Button size="sm" variant={primary ? 'primary' : 'ghost'} onClick={onClick}>
      {action.label}
    </Button>
  )
}

/** Contacts stay optional: no empty box, because an empty box costs glance budget. */
export function PeoplePanel({
  hints,
  handlers,
}: {
  hints: ContactHint[]
  handlers: ActionHandlers
}) {
  if (hints.length === 0) return null
  return (
    <section>
      <SectionLabel>People</SectionLabel>
      <ul className="mt-2 flex flex-col gap-1">
        {hints.map((hint, i) => (
          <li
            key={`${hint.label}-${i}`}
            className="flex flex-wrap items-center gap-2 text-body-sm text-ink"
          >
            <span className="text-ink-muted">{hint.label}</span>
            {hint.url && (
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => handlers.openUrl(hint.url!)}
              >
                Open
              </button>
            )}
            {hint.email && (
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => handlers.copyEmail(hint.email!)}
              >
                Copy mail
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

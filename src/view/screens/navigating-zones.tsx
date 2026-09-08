/**
 * Navigating zones — presentational bands for the cash-path cockpit.
 *
 * DOM order is the attention order: vehicle → one act → weather → dock → log.
 * Props in, events out; every string comes from heading-transport or the SoT itself.
 */
import type { Ref } from 'react'
import { AlertTriangle, ChevronRight, ExternalLink, Mail } from 'lucide-react'
import { TransportCraft, WeatherGlyph } from '../../components/finder/transport-craft'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { SectionLabel } from '../../components/ui/section-label'
import {
  contactDetail,
  contactDisplayName,
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
  heroChipLabel,
  roleLabel,
  slotLabel,
  slotRole,
  type Craft,
  type HeroBand,
  type Slot,
  type SlotSummary,
  type Weather,
  type WeatherAlert,
} from '../../core/domain/heading-transport'

export type ActionHandlers = {
  openUrl: (url: string) => void
  copyEmail: (email: string) => void
  navigate: (screen: string) => void
}

/** Plain reader note behind the role tag — states what the slot is, never coaches. */
function roleTitle(slot: Slot): string {
  return slotRole(slot) === 'core'
    ? 'Career & cash — the product runs here.'
    : 'A life area, kept in view but off the hunt.'
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="ui-section-label uppercase tracking-[0.06em] text-ink-muted">
            {craft ? heroChipLabel(craft, focus) : slotLabel(focus)}
          </p>
          {!craft?.chaos && (
            <Badge tone="neutral" title={roleTitle(focus)}>
              {roleLabel(slotRole(focus))}
            </Badge>
          )}
        </div>

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

/**
 * ③ WEATHER. Plain sentence first, flavor word second. A storm is not ambient: it names the risk
 * and offers a real decide path, so it renders as an actionable alert instead of a status line.
 */
export function WeatherStrip({
  weather,
  handlers,
  onShowRisk,
}: {
  weather: Weather
  handlers: ActionHandlers
  onShowRisk: (slot: Slot) => void
}) {
  if (weather.alert) {
    return (
      <RiskAlert
        alert={weather.alert}
        sentence={weather.sentence}
        flavor={weather.flavor}
        handlers={handlers}
        onShowRisk={onShowRisk}
      />
    )
  }
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

/**
 * The storm surface. One obvious primary act: the risk's own SoT action when it has one (Open
 * posting / Copy mail / Open Pipeline), otherwise the jump to the risk row. "Show risk" is always
 * present as the decide path, and transports to the slot the risk actually lives in.
 */
function RiskAlert({
  alert,
  sentence,
  flavor,
  handlers,
  onShowRisk,
}: {
  alert: WeatherAlert
  sentence: string
  flavor: string
  handlers: ActionHandlers
  onShowRisk: (slot: Slot) => void
}) {
  const actions = stageActions(alert.lead)
  const showRiskLabel = alert.count > 1 ? `Show risks · ${alert.count}` : 'Show risk'
  return (
    <section
      aria-label="Risk to decide"
      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p role="status" aria-live="polite" className="text-body-sm font-medium text-ink">
            {sentence}
          </p>
          {alert.consequence && (
            <p className="mt-0.5 text-body-sm text-ink-muted">{alert.consequence}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions.map((action, i) => (
              <StageActionButton
                key={actionKey(action)}
                action={action}
                handlers={handlers}
                primary={i === 0}
              />
            ))}
            <Button
              size="sm"
              variant={actions.length === 0 ? 'primary' : 'ghost'}
              onClick={() => onShowRisk(alert.slot)}
            >
              {showRiskLabel}
            </Button>
          </div>
        </div>
        <span className="ui-chip shrink-0">{flavor}</span>
      </div>
    </section>
  )
}

/**
 * ④ DOCK. The slots you are not sitting in. By default these are the three life attention-spots;
 * clicking one opens it as the hero. Tiles read as buttons (pointer, chevron, focus ring) and carry
 * a quiet notification dot when a spot needs a glance.
 */
export function FleetDock({
  dock,
  hint,
  onTransport,
}: {
  dock: SlotSummary[]
  hint: Slot | null
  onTransport: (slot: Slot) => void
}) {
  const allSpots = dock.every((tile) => slotRole(tile.slot) === 'spot')
  return (
    <section>
      <SectionLabel>{allSpots ? 'Life spots' : 'Other cockpits'}</SectionLabel>
      <p className="ui-meta mt-0.5">
        {allSpots
          ? 'Life areas outside the hunt — click one to open it.'
          : 'Click a cockpit to open it.'}
      </p>
      <div
        role="group"
        aria-label={allSpots ? 'Life spots' : 'Other cockpits'}
        className="mt-2 grid grid-cols-3 gap-2"
      >
        {dock.map((tile) => (
          <DockTile
            key={tile.slot}
            tile={tile}
            hinted={hint === tile.slot}
            onTransport={onTransport}
          />
        ))}
      </div>
    </section>
  )
}

/** A single dock tile — an obvious button that opens its cockpit. */
function DockTile({
  tile,
  hinted,
  onTransport,
}: {
  tile: SlotSummary
  hinted: boolean
  onTransport: (slot: Slot) => void
}) {
  const dueActs = Math.max(0, tile.live - tile.waiting - tile.risk)
  const attention = tile.risk > 0 ? 'risk' : dueActs > 0 ? 'act' : 'none'
  const attnNote =
    attention === 'risk'
      ? ` — ${tile.risk} risk${tile.risk > 1 ? 's' : ''} to decide`
      : attention === 'act'
        ? ` — ${dueActs} to do`
        : ''
  const isCore = slotRole(tile.slot) === 'core'
  return (
    <button
      type="button"
      onClick={() => onTransport(tile.slot)}
      aria-label={`Open ${slotLabel(tile.slot)} — ${bandLabel(tile.family)}${attnNote}`}
      className={`ui-craft-slot w-full text-left ${hinted ? 'border-accent/45' : ''}`}
      title={`${slotLabel(tile.slot)} — ${bandLabel(tile.family)}. Open this cockpit.`}
    >
      <TransportCraft
        variant={tile.craft}
        motion={tile.motion}
        alert={tile.risk > 0}
        size="dock"
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-body-sm text-ink">{slotLabel(tile.slot)}</span>
          {isCore && (
            <Badge tone="neutral" className="shrink-0">
              The hunt
            </Badge>
          )}
        </span>
        <span className="ui-meta block truncate">{tile.headline ?? 'Nothing on the map'}</span>
      </span>
      {attention !== 'none' && (
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${
            attention === 'risk' ? 'bg-danger' : 'bg-accent/70'
          }`}
        />
      )}
      <ChevronRight
        className="ui-craft-slot__chevron size-4 shrink-0 text-ink-faint"
        aria-hidden="true"
      />
    </button>
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
  riskRef,
}: {
  waiting: MissionStage[]
  risk: MissionStage[]
  done: MissionStage[]
  park: MissionStage[]
  unclassified: number
  handlers: ActionHandlers
  /** The weather strip's "Show risk" jumps here. */
  riskRef?: Ref<HTMLElement>
}) {
  return (
    <>
      <StageSection
        title="Risk in this cockpit"
        stages={risk}
        handlers={handlers}
        sectionRef={riskRef}
        id="cockpit-risk"
      />
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
  sectionRef,
  id,
}: {
  title: string
  stages: MissionStage[]
  handlers: ActionHandlers
  sectionRef?: Ref<HTMLElement>
  id?: string
}) {
  if (stages.length === 0) return null
  return (
    <section ref={sectionRef} id={id} className="scroll-mt-4">
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
      <ul className="mt-2 flex flex-col gap-2">
        {hints.map((hint, i) => (
          <PersonRow key={`${hint.label}-${i}`} hint={hint} handlers={handlers} />
        ))}
      </ul>
    </section>
  )
}

/**
 * A contact row in the same card language as the log rows: a clear name, a quiet detail line, and
 * the action as a proper labelled button — never a raw `email` / `url` key jammed against "Open".
 */
function PersonRow({ hint, handlers }: { hint: ContactHint; handlers: ActionHandlers }) {
  const name = contactDisplayName(hint)
  const detail = contactDetail(hint)
  return (
    <li className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-2/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm text-ink">{name}</p>
        {detail && <p className="ui-meta truncate">{detail}</p>}
      </div>
      {hint.email && (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => handlers.copyEmail(hint.email!)}
        >
          <Mail className="size-3.5" aria-hidden="true" />
          Copy email
        </Button>
      )}
      {hint.url && (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => handlers.openUrl(hint.url!)}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open link
        </Button>
      )}
    </li>
  )
}

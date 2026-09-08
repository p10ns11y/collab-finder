/**
 * Navigating transport model — pure slot/craft/weather transforms over mission-map SoT.
 *
 * Three axes stay independent, and that separation is the whole design:
 *   slot   = life area   (topic tokens on id / what / followup_stage)
 *   class  = lifecycle   (existing normalizeStageClass — never reaches slot)
 *   motion = energy      (class + tempo — never reads topic tokens)
 * variant = FAMILY_CRAFT[family][motion]; weather is screen-level, not stage-level.
 *
 * All four slots are first-class. No I/O, no React, no icons; `now` is injectable on
 * every time-dependent function and only defaults to `new Date()` at the boundary.
 * Token lists are SCREAMING_SNAKE module constants so one rule can be extended
 * without reading the algorithm.
 */
import {
  decodeWaybarChip,
  findNextDo,
  groupStagesExcludingDo,
  normalizeStageClass,
} from './heading-cockpit.ts'
import type { MissionStage, StageClass, WaybarStatus } from './heading-cockpit.ts'

// ── vocabulary ────────────────────────────────────────────────────────────────

export type Slot = 'debt' | 'career' | 'season' | 'body'
export type Family = 'space' | 'air' | 'water' | 'land'
export type Motion = 'thrust' | 'timetable' | 'drift' | 'long_haul' | 'berth'

/** The drawable crafts. Berth reuses a real craft; "in the hangar" lives in the gloss. */
export type Variant =
  | 'jet'
  | 'airliner'
  | 'glider'
  | 'dinghy'
  | 'ferry'
  | 'yacht'
  | 'freighter'
  | 'motorcycle'
  | 'bus'
  | 'taxi'
  | 'truck'
  | 'spaceship'
  | 'probe'
  | 'lander'

export type TempoBand = 'same_day' | 'days' | 'weeks' | 'unknown'
export type WeatherState = 'clear' | 'crosswind' | 'becalmed' | 'storm' | 'blackout'

export type SlotReason =
  | 'explicit_tag'
  | 'debt_token'
  | 'body_token'
  | 'season_logistics'
  | 'entitlement_report'
  | 'season_institution'
  | 'hiring_act'
  | 'default_career'

export type FocusReason = 'user' | 'one_act' | 'default'

/**
 * Product role of a slot. Career/Cash is the app's core cockpit — the actual hunt for work and
 * money. The other three are life attention-spots: real, kept in view, but never the product's job.
 */
export type SlotRole = 'core' | 'spot'

// ── constants ─────────────────────────────────────────────────────────────────

/** Canonical order — dock tiles never re-sort, so muscle memory holds. */
export const SLOT_ORDER: readonly Slot[] = ['debt', 'career', 'season', 'body']
export const DEFAULT_FOCUS: Slot = 'career'

/** A career wait past its own stated reply band (the operator's "3–10 days to book"). */
export const STALE_WAIT_DAYS = 10
/** Three weeks is bulk transit, not a wait. */
export const LONG_TRANSIT_DAYS = 21
/** Un-forceable waits only become weather noise once they stack. */
export const UNFORCEABLE_NOISE = 2
/** A day band whose upper bound reaches this is really a weeks band. */
export const LONG_BAND_DAYS = 14
/** The weather strip renders at most this many "because" chips. */
export const BECAUSE_MAX = 3

export const FAMILY_BY_SLOT: Readonly<Record<Slot, Family>> = {
  debt: 'space',
  career: 'air',
  season: 'water',
  body: 'land',
}

/**
 * Clock ownership is the product law expressed as code, and it is deliberately asymmetric.
 * Water ("cannot force progress") and Land ("do not agent-force") → a schedule beats thrust:
 * even your own act departs on an institution's or another human's clock, and that clock is
 * the story. Air ("turbulence acceptable") and Space ("max chaos") → thrust beats a schedule:
 * if you have an act you push, timetable notwithstanding.
 */
export const CLOCK_OWNED: Readonly<Record<Family, boolean>> = {
  air: false,
  space: false,
  water: true,
  land: true,
}

/**
 * The everyday fleet. Aircraft, ships and automobiles carry all normal work; `spaceship` is
 * deliberately absent from this table and is reserved for CHAOS_CRAFT below, so a routine debt
 * call never gets dressed up as a crewed burn.
 */
export const FAMILY_CRAFT: Readonly<Record<Family, Record<Motion, Variant>>> = {
  air: { thrust: 'jet', timetable: 'airliner', drift: 'airliner', long_haul: 'airliner', berth: 'glider' },
  water: { thrust: 'dinghy', timetable: 'ferry', drift: 'yacht', long_haul: 'freighter', berth: 'freighter' },
  land: { thrust: 'motorcycle', timetable: 'taxi', drift: 'taxi', long_haul: 'truck', berth: 'bus' },
  space: { thrust: 'probe', timetable: 'probe', drift: 'probe', long_haul: 'probe', berth: 'lander' },
}

/** Rare chaos only: the SoT is unreadable or the keys are bricked. Never an everyday craft. */
export const CHAOS_CRAFT: Variant = 'spaceship'

// ── token lists (grep one, extend one) ────────────────────────────────────────

/** Geography is a location qualifier, never a slot signal. Stripped before matching. */
const GEO_QUALIFIERS =
  /\b(sweden|swedish|sverige|svenska?|nordics?|scandinavian?|eu|emea|europe|european|stockholm|goteborg|gothenburg|malmo|uppsala|lund|linkoping|vasteras|orebro|umea)\b/g

const DEBT_TOKENS =
  /\b(inkasso|kronofogden|betalningsanmarkning|creditor|collections?|collection agency|bailiff|arrears|overdue|payoff|repayment|instal?lments?|emi|loan|lan|credit card|kreditkort|interest rate|ranta|minimum payment|csn|skuld|debt|settlement (figure|offer|amount)|settle the (debt|claim|balance))\b/

/** Removed before debt matching so body and career prose never lands in the Debt slot. */
const DEBT_EXCLUSIONS = /\b(sleep debt|technical debt|tech debt|karma debt|debt of gratitude)\b/g

const BODY_TOKENS =
  /\b(son|sonen|kids?|child|children|daughter|school|skola|forskola|preschool|fritids|pick ?up|drop ?off|parent|teacher|utvecklingssamtal|doctor|lakare|dentist|tandlakare|vardcentral|1177|bvc|hospital|sjukhus|medicine|medication|prescription|recept|therapy|terapi|sleep|somn|gym|walk|meal|cook|dinner|groceries|birthday|custody|vardnad|body)\b/

/**
 * Hiring acts and objects. `platsbanken` / `jobtech` live here on purpose: a job board is
 * career infrastructure, not time-bound life logistics, so they must never reach the Season slot.
 * A hiring act is the collision breaker: it keeps a stage in career (Air), never Water.
 */
const HIRING_ACTS =
  /\b(apply|applications?|submit|send (cv|resume)|posting|req|role|vacancy|recruiter|screen(ing)?s?|interview|round|hiring[- ]manager|hm[- ]round|tech(nical)? round|take[- ]home|panel|onsite|offer|pack|cover letter|cv|resume|referral|intro(duction)?|notice period|start date|ats|greenhouse|lever|ashby|platsbanken|jobtech)\b/

/**
 * Season = temporary, important, time-bound life attention. The travel / move / trip logistics
 * that fill this slot in ordinary use. `pack` is deliberately absent (it is an application pack in
 * `HIRING_ACTS`); `packing` and `packing list` are the safe, unambiguous forms. Geography is not a
 * signal here — `stripGeoQualifiers` removes it before matching, so "flight to Sweden" matches on
 * `flight`, never on the place.
 */
const SEASON_LOGISTICS =
  /\b(travel(l?ing|l?ed)?|trip|itinerary|flight|flights|boarding pass|luggage|baggage|suitcase|packing|packing list|unpack|move|moving|movers|removal van|relocat(e|ing|ion)|sublet|temporary housing|temp housing|short[- ]term (?:rental|lease|stay)|hotel booking|airbnb|departure|depart|arrival|arrive by|check[- ]?in|passport|visa appointment)\b/

/**
 * Time-bound civic / permission bodies and their artefacts — the Swedish life-admin that also
 * lives in the Season slot (a permit renewal or an a-kassa decision is a dated obligation, not a
 * job act). Entitlement institutions only: no job boards, no countries.
 */
const SEASON_INSTITUTIONS =
  /\b(arbetsformedlingen|af|a-?kassa|arbetsloshetskassa|unemployment insurance|aktivitetsrapport|activity report|handlingsplan|forsakringskassan|migrationsverket|uppehallstillstand|residence permit|work permit|permit|personnummer|samordningsnummer|skatteverket|socialtjanst|socialkontor|forsorjningsstod|ersattning|bidrag|sfi|etablering|inskrivning|arbetsgivarintyg|intyg)\b/

/** The collision breaker: verb intent that only an entitlement process asks for. */
const ENTITLEMENT_ACTS =
  /\b(report|rapport(era)?|redovisa|lamna in|file|renew|fornya|extend|extension|register|skriv in|inskrivning|appointment|meeting with|book (a )?(meeting|mote|time)|apply for (a-?kassa|permit|ersattning|bidrag|benefit)|decision|beslut)\b/

/** Acts the operator can perform alone, today, without anyone's permission. */
const FORCEABLE_VERBS =
  /\b(submit|send|apply|upload|write|draft|call|book|report|rapportera|pay|paid|prepare|prep|export|sign|file|fill|renew|register|walk|cook|collect|pick ?up|drop ?off|ask|email|mail|reach out|follow up|log)\b/

/**
 * Markers that someone else owns the departure time. Soft deadlines ("before it lapses",
 * "asap", "soon") are deliberately absent: they are common hiring prose and would convert
 * Air jets into airliners across the whole career slot.
 */
const SCHEDULE_MARKERS =
  /\b(round|interview|screen(ing)?|panel|onsite|hiring[- ]manager|offer|appointment|mote|meeting|hearing|court|booked|booking|window|deadline|due|opens|at \d{1,2}[:.]\d{2}|by (the )?\d{1,2}(st|nd|rd|th)?|by \d{4}-\d{2}-\d{2})\b/

const SCHEDULED_FOLLOWUP_STAGES = new Set([
  'screen',
  'screening',
  'tech_round',
  'technical',
  'hm_round',
  'hiring_manager',
  'offer',
  'appointment',
  'meeting',
])

const DO_NOT_CHASE =
  /\b(do ?n[o']?t chase|do not chase|no chase|treat as dying|dying unless|unless they write)\b/

const DYING_TOKEN = /\bdying\b/

/**
 * The operator's deterministic hook: naming a stage `af-report-w38` forces its slot.
 * The research brief also proposed `opp` / `app` / `role` / `w\d+` as career tags; they are
 * left out because career is the fallback slot anyway and those prefixes are indistinguishable
 * from ordinary stage ids (`w1` is wait #1, not week 1), so routing on them would short-circuit
 * the very token paths the adversarial cases exist to exercise.
 */
const EXPLICIT_TAGS: Readonly<Record<string, Slot>> = {
  debt: 'debt',
  dbt: 'debt',
  loan: 'debt',
  kfm: 'debt',
  career: 'career',
  season: 'season',
  af: 'season',
  permit: 'season',
  visa: 'season',
  benefit: 'season',
  fk: 'season',
  mv: 'season',
  trip: 'season',
  move: 'season',
  son: 'body',
  body: 'body',
  health: 'body',
  kid: 'body',
  family: 'body',
}

const WHAT_TAG = /^(debt|career|season|af|body|son)\s*:/

const COMBINING_MARKS = /\p{M}+/gu
const ID_SEPARATOR = /[^a-z0-9]+/
const NON_LETTER = /[^a-z]+/g
const WHITESPACE = /\s+/g
const EN_DASH = /[–—]/g
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const TOUCH_AGO = /^(\d+)\s*(d|days?|w|weeks?)\s+ago$/
const ACT_SPLIT = /[—–;]/
const SAME_DAY_BAND = /\b(same[- ]day|today|tonight|24h)\b/
const WEEKS_BAND = /(\d+)\s*(?:-\s*(\d+))?\s*(w|weeks?|veckor)\b/
const MONTHS_BAND = /(\d+)\s*(?:-\s*(\d+))?\s*(months?|manader)\b/
const DAYS_BAND = /(\d+)\s*(?:-\s*(\d+))?\s*(d|days?|dagar)\b/

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = 7
const MONTH_DAYS = 30

// ── text normalisation ────────────────────────────────────────────────────────

/** ö/ä/å fold to o/a/a so every token list above can stay ASCII and greppable. */
export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '')
}

function normalize(text: string): string {
  return foldDiacritics(text).toLowerCase().replace(WHITESPACE, ' ').trim()
}

/** Ids and followup_stage are identifiers (`af-report-w38`, `tech_round`) — split to words. */
function identifierWords(raw?: string): string {
  return normalize(raw || '').replace(NON_LETTER, ' ').trim()
}

function firstMatch(text: string, token: RegExp): string | null {
  const m = token.exec(normalize(text))
  return m ? m[0] : null
}

export function stripGeoQualifiers(text: string): string {
  return normalize(normalize(text).replace(GEO_QUALIFIERS, ' '))
}

/**
 * Slot signal = id + what + followup_stage only. The Arrive goal `g` is not a stage field and
 * `contact.url` is excluded on purpose: a posting hosted on a board says where the board lives,
 * not which life the act belongs to.
 */
export function slotSignalText(stage: MissionStage): string {
  const parts = [
    identifierWords(stage.id),
    stage.what || '',
    identifierWords(stage.contact?.followup_stage),
  ]
  return stripGeoQualifiers(parts.join(' '))
}

// ── labels / copy ─────────────────────────────────────────────────────────────

const SLOT_LABEL: Readonly<Record<Slot, string>> = {
  debt: 'Debt',
  career: 'Career',
  season: 'Season',
  body: 'Son & body',
}

/**
 * What each slot is *for*, in one plain reader word. Career/Cash carries the product; the rest are
 * life spots the product surfaces so nothing slips — a description, never a nudge.
 */
const ROLE_LABEL: Readonly<Record<SlotRole, string>> = {
  core: 'Product core',
  spot: 'Life spot',
}

/** The operator's band vocabulary. This is what the hero chip and the dock say. */
const BAND_LABEL: Readonly<Record<Family, string>> = {
  air: 'Aircraft',
  water: 'Sailing',
  land: 'Automobiles',
  space: 'Deep space',
}

/** Spoken form for the transport announcement, where the band name alone reads oddly. */
const COCKPIT_LABEL: Readonly<Record<Family, string>> = {
  air: 'Aircraft band',
  water: 'Sailing band',
  land: 'Automobiles band',
  space: 'Deep space band',
}

type CraftCopy = { label: string; gloss: string }

/**
 * Keyed by (family, motion), not by variant. Two motions may share a craft — a cruising airliner
 * is the same aeroplane whether it is on a schedule or just waiting — and the motion CSS still
 * draws them apart, so the label can repeat while the gloss says which wait this is.
 */
const CRAFT_COPY: Readonly<Record<Family, Record<Motion, CraftCopy>>> = {
  air: {
    thrust: { label: 'Scramble jet', gloss: "Act today. Thrust is yours; nobody's permission needed." },
    timetable: { label: 'Airliner', gloss: 'Cruising on their schedule. You board when they call the gate.' },
    drift: { label: 'Airliner', gloss: "Cruising inside their reply window. No thrust available, and that's fine." },
    long_haul: { label: 'Airliner', gloss: 'Long cruise. Their own window has passed; nothing to add but time.' },
    berth: { label: 'Glider', gloss: 'Parked. Engine off, logged, nothing to do.' },
  },
  water: {
    thrust: { label: 'Dinghy', gloss: 'Small and local. You can row this one yourself, now.' },
    timetable: { label: 'Ferry', gloss: 'A polite schedule. It leaves when it leaves; be at the terminal.' },
    drift: { label: 'Racing yacht', gloss: 'Trim the sails all you like. You cannot make wind.' },
    long_haul: { label: 'Freighter', gloss: 'Long horizon. Weeks of sea, and nothing you do speeds it up.' },
    berth: { label: 'Freighter', gloss: 'Moored. This one is settled.' },
  },
  land: {
    thrust: { label: 'Motorcycle', gloss: 'Fast dash. Ten minutes, human-paced, no agent.' },
    timetable: { label: 'Taxi at the curb', gloss: 'Booked pickup. A person has to show up, on their clock.' },
    drift: { label: 'Taxi at the curb', gloss: "Kerbside. You're waiting on a person, not a process." },
    long_haul: { label: 'Truck', gloss: 'Prep haul. Heavy load, steady weeks, not a sprint.' },
    berth: { label: 'City bus', gloss: 'Background. Archived and running without you.' },
  },
  space: {
    thrust: { label: 'Probe', gloss: 'Sent into the dark. Push it out and wait for telemetry.' },
    timetable: { label: 'Probe', gloss: 'Sent into the dark. Their window governs the next signal.' },
    drift: { label: 'Probe', gloss: 'Query sent into the dark. Waiting on telemetry.' },
    long_haul: { label: 'Probe', gloss: 'Deep transit. Months out, no signal expected soon.' },
    berth: { label: 'Lander', gloss: 'Down and safe. No burn scheduled.' },
  },
}

/** Chaos copy is not on the (family, motion) grid — it replaces the craft, whatever the slot. */
const CHAOS_COPY: CraftCopy = {
  label: 'Spaceship',
  gloss: 'Unknown terrain. The map or the keys are gone — crew this one by hand.',
}

const WEATHER_FLAVOR: Readonly<Record<WeatherState, Record<Family, string>>> = {
  clear: { air: 'clear air', water: 'steady breeze', land: 'open road', space: 'clear window' },
  crosswind: { air: 'crosswind', water: 'choppy', land: 'traffic', space: 'debris field' },
  becalmed: { air: 'no thrust', water: 'becalmed', land: 'kerbside', space: 'coasting' },
  storm: { air: 'turbulence', water: 'gale', land: 'black ice', space: 'hull alarm' },
  blackout: { air: 'instruments dark', water: 'fog', land: 'engine off', space: 'signal lost' },
}

export function familyOfSlot(slot: Slot): Family {
  return FAMILY_BY_SLOT[slot]
}

export function slotLabel(slot: Slot): string {
  return SLOT_LABEL[slot]
}

/** Career/Cash is the product core; the other three are life attention-spots. */
export function slotRole(slot: Slot): SlotRole {
  return slot === DEFAULT_FOCUS ? 'core' : 'spot'
}

export function roleLabel(role: SlotRole): string {
  return ROLE_LABEL[role]
}

export function bandLabel(family: Family): string {
  return BAND_LABEL[family]
}

export function cockpitLabel(family: Family): string {
  return COCKPIT_LABEL[family]
}

export function craftLabel(family: Family, motion: Motion): string {
  return CRAFT_COPY[family][motion].label
}

export function craftGloss(family: Family, motion: Motion): string {
  return CRAFT_COPY[family][motion].gloss
}

// ── slot inference ────────────────────────────────────────────────────────────

/** The tag is the id segment before the first separator: `af-report-w38` tags, `af1` does not. */
function explicitTagToken(stage: MissionStage): string | null {
  const segment = normalize(stage.id || '').split(ID_SEPARATOR)[0] || ''
  if (EXPLICIT_TAGS[segment]) return segment
  const tagged = WHAT_TAG.exec(normalize(stage.what || ''))
  return tagged && EXPLICIT_TAGS[tagged[1]] ? tagged[1] : null
}

export function explicitSlotTag(stage: MissionStage): Slot | null {
  const token = explicitTagToken(stage)
  return token ? EXPLICIT_TAGS[token] : null
}

function debtMatch(text: string): string | null {
  return firstMatch(normalize(text).replace(DEBT_EXCLUSIONS, ' '), DEBT_TOKENS)
}

export function isDebtSignal(text: string): boolean {
  return debtMatch(text) !== null
}

export function isBodySignal(text: string): boolean {
  return firstMatch(text, BODY_TOKENS) !== null
}

export function isHiringAct(text: string): boolean {
  return firstMatch(text, HIRING_ACTS) !== null
}

export function isEntitlementAct(text: string): boolean {
  return firstMatch(text, ENTITLEMENT_ACTS) !== null
}

export function hasSeasonInstitution(text: string): boolean {
  return firstMatch(text, SEASON_INSTITUTIONS) !== null
}

export function isSeasonLogistics(text: string): boolean {
  return firstMatch(text, SEASON_LOGISTICS) !== null
}

/**
 * A Season signal is time-bound life logistics (travel / move / trip) or a civic institution act.
 * A hiring act keeps the stage in career (Air) and never votes Season — the one exception is an
 * institution paired with an entitlement verb, which is a dated civic obligation, not a job act.
 */
export function isSeasonSignal(text: string): boolean {
  return seasonProbe(text) !== null
}

/** Career tokens are the hiring acts, objects and job-board infrastructure. */
export function isCareerSignal(text: string): boolean {
  return isHiringAct(text)
}

export type SlotDecision = {
  slot: Slot
  family: Family
  reason: SlotReason
  matched: string | null
}

type SlotProbe = { slot: Slot; reason: SlotReason; matched: string | null }

function seasonProbe(text: string): SlotProbe | null {
  const institution = firstMatch(text, SEASON_INSTITUTIONS)
  const logistics = firstMatch(text, SEASON_LOGISTICS)
  if (!institution && !logistics) return null
  // Collision guard: a hiring act keeps the stage in career (Air), never Season. The lone
  // exception is a civic institution paired with an entitlement verb (a dated obligation).
  if (isHiringAct(text)) {
    const entitlement = institution ? firstMatch(text, ENTITLEMENT_ACTS) : null
    return entitlement ? { slot: 'season', reason: 'entitlement_report', matched: entitlement } : null
  }
  if (institution) return { slot: 'season', reason: 'season_institution', matched: institution }
  return { slot: 'season', reason: 'season_logistics', matched: logistics }
}

/**
 * Ordered by token specificity, not importance: `inkasso` and `tandlakare` never appear in hiring
 * or entitlement copy so they can pre-empt, while `apply` / `submit` appear inside entitlement
 * copy, so career must be checked last — and is also the default, because this is the hunt surface.
 */
function probeSlot(stage: MissionStage, text: string): SlotProbe {
  const tag = explicitTagToken(stage)
  if (tag) return { slot: EXPLICIT_TAGS[tag], reason: 'explicit_tag', matched: tag }
  const debt = debtMatch(text)
  if (debt) return { slot: 'debt', reason: 'debt_token', matched: debt }
  const body = firstMatch(text, BODY_TOKENS)
  if (body) return { slot: 'body', reason: 'body_token', matched: body }
  const season = seasonProbe(text)
  if (season) return season
  const hiring = firstMatch(text, HIRING_ACTS)
  if (hiring) return { slot: 'career', reason: 'hiring_act', matched: hiring }
  return { slot: 'career', reason: 'default_career', matched: null }
}

export function slotOf(stage: MissionStage): SlotDecision {
  const probe = probeSlot(stage, slotSignalText(stage))
  return { ...probe, family: FAMILY_BY_SLOT[probe.slot] }
}

export function inferSlot(stage: MissionStage): Slot {
  return slotOf(stage).slot
}

// ── tempo + motion ────────────────────────────────────────────────────────────

export type Tempo = {
  band: TempoBand
  maxDays: number | null
  forceable: boolean
  scheduled: boolean
  doNotChase: boolean
  staleDays: number | null
}

const EMPTY_TEMPO: Tempo = Object.freeze({
  band: 'unknown' as TempoBand,
  maxDays: null,
  forceable: false,
  scheduled: false,
  doNotChase: false,
  staleDays: null,
})

function upperBound(match: RegExpExecArray): number {
  return Number.parseInt(match[2] || match[1], 10)
}

/** Reads `contact.followup_when` only — prose like "next week" is not a tempo band. */
export function parseFollowupBand(when?: string): { band: TempoBand; maxDays: number | null } {
  const text = normalize(when || '').replace(EN_DASH, '-')
  if (!text) return { band: 'unknown', maxDays: null }
  if (SAME_DAY_BAND.test(text)) return { band: 'same_day', maxDays: 0 }
  const weeks = WEEKS_BAND.exec(text)
  if (weeks) return { band: 'weeks', maxDays: upperBound(weeks) * WEEK_DAYS }
  const months = MONTHS_BAND.exec(text)
  if (months) return { band: 'weeks', maxDays: upperBound(months) * MONTH_DAYS }
  const days = DAYS_BAND.exec(text)
  if (!days) return { band: 'unknown', maxDays: null }
  const maxDays = upperBound(days)
  return { band: maxDays >= LONG_BAND_DAYS ? 'weeks' : 'days', maxDays }
}

export function isForceableAct(text: string): boolean {
  return FORCEABLE_VERBS.test(normalize(text))
}

export function isScheduledProcess(stage: MissionStage): boolean {
  const followupStage = (stage.contact?.followup_stage || '').trim().toLowerCase()
  if (SCHEDULED_FOLLOWUP_STAGES.has(followupStage)) return true
  const text = [
    stage.what || '',
    identifierWords(stage.contact?.followup_stage),
    stage.contact?.followup_when || '',
  ].join(' ')
  return SCHEDULE_MARKERS.test(normalize(text))
}

export function isDoNotChase(text: string): boolean {
  return DO_NOT_CHASE.test(normalize(text))
}

/** The operator's own words, so the badge quotes them rather than paraphrasing. */
export function isDying(text: string): boolean {
  return isDoNotChase(text) && DYING_TOKEN.test(normalize(text))
}

/** `YYYY-MM-DD`, ISO datetime, or `N (d|days|w|weeks) ago`. Unparseable → null, never a guess. */
export function daysSinceTouch(lastTouch?: string, now = new Date()): number | null {
  const raw = normalize(lastTouch || '')
  if (!raw) return null
  const ago = TOUCH_AGO.exec(raw)
  if (ago) {
    const count = Number.parseInt(ago[1], 10)
    return ago[2].startsWith('w') ? count * WEEK_DAYS : count
  }
  if (!ISO_DATE.test(raw)) return null
  const touched = new Date(DATE_ONLY.test(raw) ? `${raw}T00:00:00Z` : raw)
  if (Number.isNaN(touched.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - touched.getTime()) / DAY_MS))
}

export function readTempo(stage: MissionStage, now = new Date()): Tempo {
  const what = stage.what || ''
  const band = parseFollowupBand(stage.contact?.followup_when)
  return {
    band: band.band,
    maxDays: band.maxDays,
    forceable: isForceableAct(what),
    scheduled: isScheduledProcess(stage),
    doNotChase: isDoNotChase(what),
    staleDays: daysSinceTouch(stage.contact?.last_touch, now),
  }
}

export function motionFor(stage: MissionStage, family: Family, now = new Date()): Motion {
  const cls = normalizeStageClass(stage.class)
  if (cls === 'done' || cls === 'park') return 'berth'
  // Debt risk is a crewed burn, never a passive probe.
  if (family === 'space' && cls === 'risk') return 'thrust'
  const tempo = readTempo(stage, now)
  // The clock-ownership asymmetry: for Water and Land the schedule is the story.
  if (tempo.scheduled && CLOCK_OWNED[family]) return 'timetable'
  if (cls === 'do' && tempo.forceable) return 'thrust'
  if (tempo.scheduled) return 'timetable'
  // A Do with no verb we recognise is still yours.
  if (cls === 'do') return 'thrust'
  if (tempo.band === 'weeks') return 'long_haul'
  if (tempo.staleDays !== null && tempo.staleDays >= LONG_TRANSIT_DAYS) return 'long_haul'
  return 'drift'
}

// ── craft ─────────────────────────────────────────────────────────────────────

export type Craft = {
  slot: Slot
  family: Family
  motion: Motion
  variant: Variant
  label: string
  gloss: string
  alert: boolean
  dying: boolean
  stale: boolean
  /** True only for the chaos craft, where the slot itself can no longer be trusted. */
  chaos: boolean
  tempo: Tempo
}

function isStale(cls: StageClass, staleDays: number | null): boolean {
  if (cls !== 'wait' && cls !== 'risk') return false
  return staleDays !== null && staleDays >= STALE_WAIT_DAYS
}

export function craftFor(stage: MissionStage, now = new Date()): Craft {
  const decision = slotOf(stage)
  const cls = normalizeStageClass(stage.class)
  const motion = motionFor(stage, decision.family, now)
  const tempo = readTempo(stage, now)
  return {
    slot: decision.slot,
    family: decision.family,
    motion,
    variant: FAMILY_CRAFT[decision.family][motion],
    label: craftLabel(decision.family, motion),
    gloss: craftGloss(decision.family, motion),
    alert: cls === 'risk',
    dying: isDying(stage.what || ''),
    stale: isStale(cls, tempo.staleDays),
    chaos: false,
    tempo,
  }
}

export function variantFor(stage: MissionStage, now = new Date()): Variant {
  return craftFor(stage, now).variant
}

/**
 * The one place a spaceship is drawn: the mission map is unreadable or the keys are bricked, so
 * no slot craft can be trusted. Everyday work never reaches this.
 */
export function chaosCraft(slot: Slot): Craft {
  return {
    slot,
    family: FAMILY_BY_SLOT[slot],
    motion: 'thrust',
    variant: CHAOS_CRAFT,
    label: CHAOS_COPY.label,
    gloss: CHAOS_COPY.gloss,
    alert: true,
    dying: false,
    stale: false,
    chaos: true,
    tempo: EMPTY_TEMPO,
  }
}

/** A slot with nothing on the map still needs a silhouette to draw. */
export function berthedCraft(slot: Slot): Craft {
  const family = FAMILY_BY_SLOT[slot]
  return {
    slot,
    family,
    motion: 'berth',
    variant: FAMILY_CRAFT[family].berth,
    label: craftLabel(family, 'berth'),
    gloss: craftGloss(family, 'berth'),
    alert: false,
    dying: false,
    stale: false,
    chaos: false,
    tempo: EMPTY_TEMPO,
  }
}

// ── copy ──────────────────────────────────────────────────────────────────────

export type ActCopy = { head: string; qualifier: string | null; badges: string[] }

function actBadges(stage: MissionStage): string[] {
  const what = stage.what || ''
  const badges: string[] = []
  if (isDoNotChase(what)) badges.push("Don't chase")
  if (isDying(what)) badges.push('Dying unless they write')
  if (parseFollowupBand(stage.contact?.followup_when).band === 'same_day') badges.push('Same-day')
  return badges
}

/** Splits `what` at the first —/–/; into head + qualifier. Never paraphrases, never summarises. */
export function actCopy(stage: MissionStage): ActCopy {
  const text = (stage.what || '').trim() || (stage.id || '').trim()
  const at = text.search(ACT_SPLIT)
  const head = at >= 0 ? text.slice(0, at).trim() : text
  const qualifier = at >= 0 ? text.slice(at + 1).trim() : ''
  return { head, qualifier: qualifier || null, badges: actBadges(stage) }
}

export function flavorLine(craft: Craft): string {
  return `${craft.label} — ${craft.gloss}`
}

/** The chip above the act. In chaos the slot is not trustworthy, so it is not claimed. */
export function heroChipLabel(craft: Craft, focus: Slot): string {
  return craft.chaos
    ? `${CHAOS_COPY.label} · Unknown signal`
    : `${bandLabel(craft.family)} · ${slotLabel(focus)}`
}

/** `Arrive` is the mission map's own word for the goal; the view does not rename it. */
export function arriveLine(g?: string): string {
  const goal = (g || '').trim()
  return goal ? `Arrive: ${goal}` : ''
}

// ── focus + dock ──────────────────────────────────────────────────────────────

export type FocusDecision = { focus: Slot; family: Family; reason: FocusReason }

function decide(focus: Slot, reason: FocusReason): FocusDecision {
  return { focus, family: FAMILY_BY_SLOT[focus], reason }
}

/** Dock click wins, then the slot holding the one act, then the hunt surface itself. */
export function selectFocus(input: { userFocus?: Slot | null; stages: MissionStage[] }): FocusDecision {
  if (input.userFocus) return decide(input.userFocus, 'user')
  const act = findNextDo(input.stages)
  if (act) return decide(inferSlot(act), 'one_act')
  return decide(DEFAULT_FOCUS, 'default')
}

/**
 * Transport swaps the hero; it never navigates away from Navigating. The origin slot is part of
 * the call so the view can pass its current focus, but the destination alone decides the result.
 */
export function transportFocus(_current: Slot, target: Slot): FocusDecision & { announce: string } {
  const decision = decide(target, 'user')
  return {
    ...decision,
    announce: `Transported to the ${cockpitLabel(decision.family)} — ${slotLabel(target)}.`,
  }
}

export function dockSlots(focus: Slot): Slot[] {
  return SLOT_ORDER.filter((slot) => slot !== focus)
}

export type SlotSummary = {
  slot: Slot
  family: Family
  craft: Variant
  motion: Motion
  live: number
  waiting: number
  risk: number
  headline: string | null
  empty: boolean
}

function isLiveClass(cls: StageClass): boolean {
  return cls === 'do' || cls === 'wait' || cls === 'risk'
}

function countClass(stages: MissionStage[], cls: StageClass): number {
  return stages.filter((s) => normalizeStageClass(s.class) === cls).length
}

export function partitionBySlot(stages: MissionStage[]): Record<Slot, MissionStage[]> {
  const out: Record<Slot, MissionStage[]> = { debt: [], career: [], season: [], body: [] }
  for (const stage of stages) out[inferSlot(stage)].push(stage)
  return out
}

export function summarizeSlot(slot: Slot, stages: MissionStage[], now = new Date()): SlotSummary {
  const mine = stages.filter((stage) => inferSlot(stage) === slot)
  const family = FAMILY_BY_SLOT[slot]
  const alive = mine.find((stage) => isLiveClass(normalizeStageClass(stage.class))) ?? null
  const shown = alive ?? mine[0] ?? null
  const craft = shown ? craftFor(shown, now) : berthedCraft(slot)
  const waiting = countClass(mine, 'wait')
  const risk = countClass(mine, 'risk')
  return {
    slot,
    family,
    craft: craft.variant,
    motion: craft.motion,
    live: countClass(mine, 'do') + waiting + risk,
    waiting,
    risk,
    headline: alive ? actCopy(alive).head : null,
    empty: mine.length === 0,
  }
}

export function slotSummaries(stages: MissionStage[], now = new Date()): Record<Slot, SlotSummary> {
  return {
    debt: summarizeSlot('debt', stages, now),
    career: summarizeSlot('career', stages, now),
    season: summarizeSlot('season', stages, now),
    body: summarizeSlot('body', stages, now),
  }
}

// ── weather ───────────────────────────────────────────────────────────────────

export type WeatherInput = {
  stages: MissionStage[]
  waybar?: WaybarStatus
  focus: Slot
  mapError?: string | null
  now?: Date
}

/**
 * The one risk the storm strip names and offers a decide path for. `lead` is the first risk stage
 * in map order (the operator's own ordering); `count` is every risk on the map, so the strip can
 * say "+N more" and still stay clickable to the whole risk list.
 */
export type WeatherAlert = {
  lead: MissionStage
  slot: Slot
  head: string
  consequence: string | null
  count: number
}

export type Weather = {
  state: WeatherState
  sentence: string
  flavor: string
  because: string[]
  transportHint: Slot | null
  /** Set only in a storm: the named risk plus a slot to transport to. Never vague. */
  alert: WeatherAlert | null
}

/** Missing waybar decodes to the existing empty status — its signals simply do not fire. */
const NO_WAYBAR: WaybarStatus = decodeWaybarChip('')

const UNFORCEABLE_MOTIONS: readonly Motion[] = ['drift', 'long_haul', 'timetable']

type WeatherCounts = {
  risk: number
  riskLead: MissionStage | null
  unforceableWaits: number
  staleWaits: number
  focusHasThrust: boolean
  thrustSlots: Slot[]
}

function readCounts(stages: MissionStage[], focus: Slot, now: Date): WeatherCounts {
  const thrust = new Set<Slot>()
  let risk = 0
  let riskLead: MissionStage | null = null
  let unforceableWaits = 0
  let staleWaits = 0
  for (const stage of stages) {
    const cls = normalizeStageClass(stage.class)
    const craft = craftFor(stage, now)
    if (cls === 'risk') {
      risk += 1
      if (!riskLead) riskLead = stage
    }
    if (craft.motion === 'thrust') thrust.add(craft.slot)
    if (cls !== 'wait') continue
    if (UNFORCEABLE_MOTIONS.includes(craft.motion)) unforceableWaits += 1
    if (craft.stale) staleWaits += 1
  }
  return {
    risk,
    riskLead,
    unforceableWaits,
    staleWaits,
    focusHasThrust: thrust.has(focus),
    thrustSlots: SLOT_ORDER.filter((slot) => thrust.has(slot)),
  }
}

/**
 * Names the concrete risk and asks for the decision, in plain hire-visitor words — never the old
 * "something is going wrong". Extra risks fold into a "+N more" the strip keeps clickable.
 */
function stormSentence(alert: WeatherAlert): string {
  const more = alert.count > 1 ? ` (+${alert.count - 1} more)` : ''
  return `Decide on the risk: ${alert.head}${more}.`
}

function unforceablePhrase(count: number): string {
  return count === 1
    ? '1 reply is not yours to force'
    : `${count} replies are not yours to force`
}

function stalePhrase(count: number): string {
  return count === 1
    ? '1 wait is past its own reply window'
    : `${count} waits are past their own reply window`
}

/** Reuses decodeWaybarChip's own plural copy rather than forking it. */
function pausePhrase(waybar: WaybarStatus): string | null {
  return waybar.plain.split(' · ').find((part) => part.includes('on pause')) ?? null
}

function elsewherePhrase(slots: Slot[]): string {
  const label = slotLabel(slots[0])
  return slots.length === 1
    ? `the only forceable act is in ${label}`
    : `the next forceable act is in ${label}`
}

function weatherSignals(counts: WeatherCounts, waybar: WaybarStatus, hint: Slot | null): string[] {
  const because: string[] = []
  if (waybar.xOn === false) because.push('X search is off')
  const pauses = pausePhrase(waybar)
  if (pauses) because.push(pauses)
  if (counts.unforceableWaits >= UNFORCEABLE_NOISE) {
    because.push(unforceablePhrase(counts.unforceableWaits))
  }
  if (counts.staleWaits > 0) because.push(stalePhrase(counts.staleWaits))
  if (hint) because.push(elsewherePhrase(counts.thrustSlots))
  return because
}

/** Weather is screen-level: any risk on the map is a storm, whichever cockpit you are sitting in. */
function weatherState(input: WeatherInput, counts: WeatherCounts, noise: string[]): WeatherState {
  if (input.mapError || input.stages.length === 0) return 'blackout'
  if (counts.risk > 0) return 'storm'
  if (!counts.focusHasThrust) return 'becalmed'
  return noise.length > 0 ? 'crosswind' : 'clear'
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function blackoutSentence(mapError?: string | null): string {
  return mapError
    ? `Could not read the mission map: ${mapError}`
    : 'No mission map on disk yet — Navigating has nothing to read.'
}

function becalmedSentence(focus: Slot, counts: WeatherCounts, hint: Slot | null): string {
  const base = `Nothing in ${slotLabel(focus)} can be forced today — the next move belongs to someone else.`
  return hint ? `${base} ${capitalize(elsewherePhrase(counts.thrustSlots))}.` : base
}

function weatherSentence(
  state: WeatherState,
  input: WeatherInput,
  counts: WeatherCounts,
  noise: string[],
  hint: Slot | null,
  alert: WeatherAlert | null,
): string {
  switch (state) {
    case 'blackout':
      return blackoutSentence(input.mapError)
    case 'storm':
      return alert ? stormSentence(alert) : 'Decide on the open risk.'
    case 'becalmed':
      return becalmedSentence(input.focus, counts, hint)
    case 'crosswind':
      return `You can move the one act now — ${noise.join('; ')}.`
    default:
      return 'Clear run. The one act is yours and nothing is blocking it.'
  }
}

/** The storm's own risk is named in the sentence, so `because` only carries the extra conditions. */
function becauseFor(state: WeatherState, noise: string[]): string[] {
  if (state === 'blackout') return []
  return noise.slice(0, BECAUSE_MAX)
}

export function weatherFlavor(state: WeatherState, family: Family): string {
  return WEATHER_FLAVOR[state][family]
}

/** A storm always has a risk stage, so it always names one; other states never carry an alert. */
function weatherAlert(state: WeatherState, counts: WeatherCounts): WeatherAlert | null {
  if (state !== 'storm' || !counts.riskLead) return null
  const copy = actCopy(counts.riskLead)
  return {
    lead: counts.riskLead,
    slot: inferSlot(counts.riskLead),
    head: copy.head,
    consequence: copy.qualifier,
    count: counts.risk,
  }
}

export function computeWeather(input: WeatherInput): Weather {
  const waybar = input.waybar ?? NO_WAYBAR
  const counts = readCounts(input.stages, input.focus, input.now ?? new Date())
  const hint = counts.focusHasThrust ? null : counts.thrustSlots[0] ?? null
  const noise = weatherSignals(counts, waybar, hint)
  const state = weatherState(input, counts, noise)
  const alert = weatherAlert(state, counts)
  return {
    state,
    sentence: weatherSentence(state, input, counts, noise, hint, alert),
    flavor: weatherFlavor(state, FAMILY_BY_SLOT[input.focus]),
    because: becauseFor(state, noise),
    transportHint: state === 'blackout' ? null : hint,
    alert,
  }
}

// ── assembled cockpit ─────────────────────────────────────────────────────────

export type HeroBand = {
  craft: Craft | null
  act: MissionStage | null
  actCopy: ActCopy | null
  waitingOn: MissionStage | null
  flavor: string
  arrive: string
  extraActs: number
  empty: boolean
  emptyCopy: string | null
}

export type CockpitLog = {
  waiting: MissionStage[]
  risk: MissionStage[]
  done: MissionStage[]
  park: MissionStage[]
  unclassified: number
}

export type Cockpit = {
  focus: FocusDecision
  hero: HeroBand
  weather: Weather
  dock: SlotSummary[]
  log: CockpitLog
}

export type CockpitInput = {
  g?: string
  stages: MissionStage[]
  waybar?: WaybarStatus
  userFocus?: Slot | null
  mapError?: string | null
  now?: Date
}

function heroEmptyCopy(focus: Slot, mapEmpty: boolean, slotEmpty: boolean): string | null {
  if (mapEmpty) return 'No mission map on disk yet.'
  return slotEmpty ? `Nothing on the map for ${slotLabel(focus)}.` : null
}

/**
 * `waitingOn` replaces the act only when the focused slot has no Do at all. A Do on someone
 * else's clock (school pickup at 15:00) is still the operator's one act and stays an act.
 */
function buildHero(input: CockpitInput, focus: Slot, now: Date, chaos: boolean): HeroBand {
  const mine = input.stages.filter((stage) => inferSlot(stage) === focus)
  const acts = mine.filter((stage) => normalizeStageClass(stage.class) === 'do')
  const act = acts[0] ?? null
  const waitingOn = act ? null : mine.find((stage) => isLiveClass(normalizeStageClass(stage.class))) ?? null
  const shown = act ?? waitingOn
  const everyday = shown ? craftFor(shown, now) : berthedCraft(focus)
  const craft = chaos ? chaosCraft(focus) : everyday
  return {
    craft,
    act,
    actCopy: act ? actCopy(act) : null,
    waitingOn,
    flavor: flavorLine(craft),
    arrive: arriveLine(input.g),
    extraActs: Math.max(0, acts.length - 1),
    empty: mine.length === 0,
    emptyCopy: heroEmptyCopy(focus, input.stages.length === 0, mine.length === 0),
  }
}

/** Unknown-class stages are counted honestly and never rendered as a row. */
function buildLog(stages: MissionStage[], focus: Slot): CockpitLog {
  const mine = stages.filter((stage) => inferSlot(stage) === focus)
  const groups = groupStagesExcludingDo(mine)
  return {
    waiting: groups.wait,
    risk: groups.risk,
    done: groups.done,
    park: groups.park,
    unclassified: countClass(mine, 'unknown'),
  }
}

export function buildCockpit(input: CockpitInput): Cockpit {
  const now = input.now ?? new Date()
  const focus = selectFocus({ userFocus: input.userFocus, stages: input.stages })
  const weather = computeWeather({
    stages: input.stages,
    waybar: input.waybar,
    focus: focus.focus,
    mapError: input.mapError,
    now,
  })
  return {
    focus,
    // Blackout is the chaos gate: unreadable map or bricked keys, the only spaceship in the app.
    hero: buildHero(input, focus.focus, now, weather.state === 'blackout'),
    weather,
    dock: dockSlots(focus.focus).map((slot) => summarizeSlot(slot, input.stages, now)),
    log: buildLog(input.stages, focus.focus),
  }
}

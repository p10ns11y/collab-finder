#!/usr/bin/env node
import { decodeWaybarChip } from './heading-cockpit.ts'
import {
  CLOCK_OWNED,
  FAMILY_BY_SLOT,
  CHAOS_CRAFT,
  FAMILY_CRAFT,
  SLOT_ORDER,
  actCopy,
  buildCockpit,
  computeWeather,
  craftFor,
  craftGloss,
  craftLabel,
  daysSinceTouch,
  arriveLine,
  bandLabel,
  dockSlots,
  flavorLine,
  heroChipLabel,
  inferSlot,
  isSwedenWindowSignal,
  parseFollowupBand,
  selectFocus,
  slotOf,
  slotRole,
  roleLabel,
  slotSignalText,
  slotSummaries,
  stripGeoQualifiers,
  transportFocus,
  variantFor,
  weatherFlavor,
} from './heading-transport.ts'

const failures = []
let checks = 0
function must(condition, message) {
  checks += 1
  if (!condition) failures.push(message)
}

/** Fixed clock for every vector — W37, matching the operator's real map. */
const NOW = new Date('2026-09-08T12:00:00Z')

const VARIANTS = [
  'jet',
  'airliner',
  'glider',
  'dinghy',
  'ferry',
  'yacht',
  'freighter',
  'motorcycle',
  'bus',
  'taxi',
  'truck',
  'spaceship',
  'probe',
  'lander',
]

// ── §10.1 stage → slot / family / motion / variant ───────────────────────────

const VECTORS = [
  {
    row: 1,
    stage: {
      id: 'do1',
      what: 'Submit one relevant application next week — do not wait for replies',
      class: 'do',
    },
    slot: 'career',
    family: 'air',
    motion: 'thrust',
    variant: 'jet',
    reason: 'hiring_act',
  },
  {
    row: 2,
    stage: {
      id: 'w1',
      what: 'Same-day reply if the live introduction writes — do not chase; treat as dying unless they write',
      class: 'wait',
      contact: { followup_when: 'same-day' },
    },
    slot: 'career',
    family: 'air',
    motion: 'drift',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 3,
    stage: {
      id: 'w2',
      what: 'Technical round — usually 3–10 days to book if a submitted pack is moving; one W37 lane stated 3–4d reply',
      class: 'wait',
      contact: { followup_stage: 'tech_round', followup_when: '3–10 days' },
    },
    slot: 'career',
    family: 'air',
    motion: 'timetable',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 4,
    stage: {
      id: 'w3',
      what: 'Team or hiring-manager round (typical Swedish SWE loop)',
      class: 'wait',
      contact: { followup_stage: 'hm_round' },
    },
    slot: 'career',
    family: 'air',
    motion: 'timetable',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 5,
    stage: {
      id: 'w4',
      what: 'Offer and start — unemployed, no long notice period',
      class: 'wait',
      contact: { followup_stage: 'offer' },
    },
    slot: 'career',
    family: 'air',
    motion: 'timetable',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 6,
    stage: {
      id: 'd1',
      what: 'W37 batch plus older pool waiting on screens; one older closed req',
      class: 'done',
    },
    slot: 'career',
    family: 'air',
    motion: 'berth',
    // Brief said `hangar`; berth reuses a drawable craft and "In the hangar" moved to the gloss.
    variant: 'glider',
    reason: 'hiring_act',
  },
  {
    row: 7,
    stage: {
      id: 'opp-77',
      what: 'Apply to the Platsbanken posting in Uppsala',
      class: 'do',
      contact: { url: 'https://arbetsformedlingen.se/platsbanken/annonser/123' },
    },
    slot: 'career',
    family: 'air',
    motion: 'thrust',
    variant: 'jet',
    reason: 'hiring_act',
  },
  {
    row: 8,
    stage: {
      id: 'af1',
      what: 'Report September applications to Arbetsförmedlingen by the 14th',
      class: 'do',
      contact: { followup_when: 'by 14 Sep' },
    },
    slot: 'sweden',
    family: 'water',
    motion: 'timetable',
    variant: 'ferry',
    reason: 'entitlement_report',
  },
  {
    row: 9,
    stage: { id: 'af3', what: 'Upload the a-kassa income certificate', class: 'do' },
    slot: 'sweden',
    family: 'water',
    motion: 'thrust',
    variant: 'dinghy',
    reason: 'sweden_institution',
  },
  {
    row: 10,
    stage: {
      id: 'af4',
      what: 'Booked AF meeting — bring the activity report',
      class: 'wait',
      contact: { followup_stage: 'appointment', followup_when: 'same-day' },
    },
    slot: 'sweden',
    family: 'water',
    motion: 'timetable',
    variant: 'ferry',
    reason: 'sweden_institution',
  },
  {
    row: 11,
    stage: {
      id: 'permit1',
      what: 'Uppehållstillstånd extension decision still in transit',
      class: 'wait',
      contact: { followup_when: '8–12 weeks' },
    },
    slot: 'sweden',
    family: 'water',
    motion: 'long_haul',
    variant: 'freighter',
    reason: 'sweden_institution',
  },
  {
    row: 12,
    stage: {
      id: 'af5',
      what: 'Waiting on the a-kassa ersättning decision; no date given',
      class: 'wait',
      contact: { last_touch: '2026-08-25' },
    },
    slot: 'sweden',
    family: 'water',
    motion: 'drift',
    variant: 'yacht',
    reason: 'sweden_institution',
  },
  {
    row: 13,
    stage: { id: 'af-report-w38', what: "Send in last week's job search log", class: 'do' },
    slot: 'sweden',
    family: 'water',
    motion: 'thrust',
    variant: 'dinghy',
    reason: 'explicit_tag',
  },
  {
    row: 14,
    stage: { id: 'debt1', what: 'Call the inkasso agent about the settlement figure', class: 'do' },
    slot: 'debt',
    family: 'space',
    motion: 'thrust',
    variant: 'probe',
    reason: 'debt_token',
  },
  {
    row: 15,
    stage: {
      id: 'debt2',
      what: 'Waiting on the creditor payoff statement',
      class: 'wait',
      contact: { last_touch: '2026-08-20' },
    },
    slot: 'debt',
    family: 'space',
    motion: 'drift',
    variant: 'probe',
    reason: 'debt_token',
  },
  {
    row: 16,
    stage: { id: 'debt3', what: 'Kronofogden claim escalates unless the plan is signed', class: 'risk' },
    slot: 'debt',
    family: 'space',
    motion: 'thrust',
    variant: 'probe',
    reason: 'debt_token',
  },
  {
    row: 17,
    stage: { id: 'debt4', what: 'Court hearing on the Kronofogden claim on 22 Sep', class: 'wait' },
    slot: 'debt',
    family: 'space',
    motion: 'timetable',
    variant: 'probe',
    reason: 'debt_token',
  },
  {
    row: 18,
    stage: { id: 'debt5', what: 'CSN repayment plan settled', class: 'done' },
    slot: 'debt',
    family: 'space',
    motion: 'berth',
    // Berth reuses a drawable craft: Space rests as the lander.
    variant: 'lander',
    reason: 'debt_token',
  },
  {
    row: 19,
    stage: { id: 'son1', what: 'School pickup at 15:00 — no agent, I go myself', class: 'do' },
    slot: 'body',
    family: 'land',
    motion: 'timetable',
    variant: 'taxi',
    reason: 'body_token',
  },
  {
    row: 20,
    stage: { id: 'body2', what: 'Walk 30 minutes today', class: 'do' },
    slot: 'body',
    family: 'land',
    motion: 'thrust',
    variant: 'motorcycle',
    reason: 'body_token',
  },
  {
    row: 21,
    stage: {
      id: 'son2',
      what: 'Ask the dentist for an earlier slot; waiting for them to call back',
      class: 'wait',
      contact: { followup_when: '2–3 days' },
    },
    slot: 'body',
    family: 'land',
    motion: 'drift',
    variant: 'taxi',
    reason: 'body_token',
  },
  {
    row: 22,
    stage: {
      id: 'body1',
      what: 'Sleep debt recovery — no late sessions for the next 3–4 weeks',
      class: 'wait',
      contact: { followup_when: '3–4 weeks' },
    },
    slot: 'body',
    family: 'land',
    motion: 'long_haul',
    variant: 'truck',
    reason: 'body_token',
  },
  {
    row: 23,
    stage: { id: 'son3', what: 'Weekend with him — no work', class: 'park' },
    slot: 'body',
    family: 'land',
    motion: 'berth',
    // Brief said `garage`; the drawable berth craft is the truck, gloss keeps "In the garage".
    variant: 'bus',
    reason: 'body_token',
  },
  {
    row: 24,
    stage: {
      id: 'w5',
      what: 'Recruiter said they will come back after the Swedish holidays',
      class: 'wait',
      contact: { last_touch: '2026-07-15' },
    },
    slot: 'career',
    family: 'air',
    motion: 'long_haul',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 25,
    stage: { id: 'do2', what: 'Book the technical round slot they offered', class: 'do' },
    slot: 'career',
    family: 'air',
    motion: 'thrust',
    variant: 'jet',
    reason: 'hiring_act',
  },
  {
    row: 26,
    stage: {
      id: 'r2',
      what: 'Pack for the W37 lane is missing a cover letter — could sink the submission',
      class: 'risk',
    },
    slot: 'career',
    family: 'air',
    motion: 'drift',
    variant: 'airliner',
    reason: 'hiring_act',
  },
  {
    row: 27,
    stage: { id: 'p1', what: 'Old Berlin lead parked until spring', class: 'park' },
    slot: 'career',
    family: 'air',
    motion: 'berth',
    variant: 'glider',
    reason: 'default_career',
  },
  {
    row: 28,
    stage: { id: 'x1', what: 'Random note with no class' },
    slot: 'career',
    family: 'air',
    motion: 'drift',
    variant: 'airliner',
    reason: 'default_career',
  },
  {
    row: 29,
    stage: { id: 'af6', what: 'Apply to the Arbetsförmedlingen posting for a backend role', class: 'do' },
    slot: 'career',
    family: 'air',
    motion: 'thrust',
    variant: 'jet',
    reason: 'hiring_act',
  },
  {
    row: 30,
    stage: { id: 'fk1', what: 'Renew the Försäkringskassan certificate before it lapses', class: 'do' },
    slot: 'sweden',
    family: 'water',
    motion: 'thrust',
    variant: 'dinghy',
    reason: 'sweden_institution',
  },
]

const S = {}
for (const vector of VECTORS) S[vector.row] = vector.stage

for (const v of VECTORS) {
  const decision = slotOf(v.stage)
  const craft = craftFor(v.stage, NOW)
  must(decision.slot === v.slot, `row ${v.row} slot: want ${v.slot}, got ${decision.slot}`)
  must(decision.family === v.family, `row ${v.row} family: want ${v.family}, got ${decision.family}`)
  must(decision.reason === v.reason, `row ${v.row} reason: want ${v.reason}, got ${decision.reason}`)
  must(craft.motion === v.motion, `row ${v.row} motion: want ${v.motion}, got ${craft.motion}`)
  must(craft.variant === v.variant, `row ${v.row} variant: want ${v.variant}, got ${craft.variant}`)
  must(
    variantFor(v.stage, NOW) === v.variant,
    `row ${v.row} variantFor agrees with craftFor`,
  )
  must(
    isSwedenWindowSignal(slotSignalText(v.stage)) === (v.slot === 'sweden'),
    `row ${v.row} isSwedenWindowSignal agrees with the cascade`,
  )
}

// ── §2.4 the four Sweden guards ──────────────────────────────────────────────

must(
  !slotSignalText(S[7]).includes('arbetsformedlingen'),
  'guard 4: contact.url never reaches the slot signal text',
)
must(stripGeoQualifiers('Swedish SWE loop in Uppsala').includes('swe loop'), 'geo strip keeps prose')
must(!stripGeoQualifiers('Team round in Sweden').includes('sweden'), 'geo strip removes sweden')
must(!stripGeoQualifiers('Malmö and Umeå and Örebro').includes('malmo'), 'geo strip folds ö/å')
must(inferSlot(S[4]) === 'career', 'guard 2: "Swedish" never reaches Water')
must(inferSlot(S[7]) === 'career', 'guard 3: platsbanken is a job board, not an institution')
must(inferSlot(S[29]) === 'career', 'collision breaker: institution + hiring act, no entitlement verb')
must(inferSlot(S[8]) === 'sweden', 'collision breaker: institution + hiring act + report verb')
must(inferSlot(S[5]) === 'career', 'bare "unemployed" is not a Water token')

const GOAL = 'started a decent Sweden/Nordics/EU full-time role'
const realMap = [S[1], S[2], S[3], S[4], S[5], S[6]]
const withGoal = buildCockpit({ g: GOAL, stages: realMap, waybar: decodeWaybarChip('X ON / 2 PAUSES'), now: NOW })
const withoutGoal = buildCockpit({ stages: realMap, waybar: decodeWaybarChip('X ON / 2 PAUSES'), now: NOW })
must(
  withGoal.focus.focus === withoutGoal.focus.focus &&
    withGoal.weather.state === withoutGoal.weather.state,
  'guard 1: the Arrive goal never votes on slot or weather',
)
must(withGoal.hero.arrive === `Arrive: ${GOAL}`, "goal keeps the map's own Arrive wording")

// ── §3 axes, tables and flags ────────────────────────────────────────────────

must(SLOT_ORDER.join(',') === 'debt,career,sweden,body', 'canonical slot order')
must(
  CLOCK_OWNED.air === false && CLOCK_OWNED.space === false,
  'Air and Space own their own clock — thrust beats timetable',
)
must(
  CLOCK_OWNED.water === true && CLOCK_OWNED.land === true,
  'Water and Land run on someone else\'s clock — timetable beats thrust',
)
for (const [slot, family] of Object.entries(FAMILY_BY_SLOT)) {
  const cells = Object.values(FAMILY_CRAFT[family])
  must(cells.length === 5, `${slot}/${family} has five motions`)
  must(cells.every((variant) => VARIANTS.includes(variant)), `${slot}/${family} only draws real crafts`)
}
must(FAMILY_CRAFT.space.thrust === FAMILY_CRAFT.space.timetable, 'a scheduled burn is still the crewed vessel')
must(craftLabel('air', 'berth') === 'Glider', 'berthed Air is the parked glider')
must(craftLabel('water', 'berth') === 'Freighter', 'berthed Water is the moored freighter')
must(craftLabel('land', 'berth') === 'City bus', 'berthed Land is the background city bus')
must(craftLabel('space', 'berth') === 'Lander', 'berthed Space is the lander')
must(craftGloss('air', 'berth').startsWith('Parked.'), 'berth gloss says parked')
must(craftGloss('space', 'berth').startsWith('Down and safe.'), 'berth gloss says down and safe')
must(
  flavorLine(craftFor(S[6], NOW)) === 'Glider — Parked. Engine off, logged, nothing to do.',
  'flavor line',
)

const w1craft = craftFor(S[2], NOW)
must(w1craft.dying === true, 'row 2 dying flag from the operator\'s own words')
must(w1craft.tempo.doNotChase === true, 'row 2 doNotChase flag')
must(w1craft.tempo.band === 'same_day', 'row 2 same-day band')
must(w1craft.stale === false, 'row 2 has no last_touch — staleness is never synthesised')
must(w1craft.tempo.staleDays === null, 'row 2 staleDays stays null')
must(craftFor(S[3], NOW).tempo.maxDays === 10, 'row 3 en-dash band parses to maxDays 10')
must(craftFor(S[3], NOW).tempo.band === 'days', 'row 3 band is days')
must(craftFor(S[11], NOW).tempo.band === 'weeks', 'row 11 weeks band')
must(craftFor(S[12], NOW).stale === true, 'row 12 is 14 days stale')
must(craftFor(S[12], NOW).tempo.staleDays === 14, 'row 12 staleDays')
must(craftFor(S[15], NOW).tempo.staleDays === 19, 'row 15 staleDays')
must(craftFor(S[15], NOW).stale === true, 'row 15 stale badge')
must(craftFor(S[24], NOW).tempo.staleDays === 55, 'row 24 staleDays')
must(craftFor(S[24], NOW).stale === true, 'row 24 stale badge')
must(craftFor(S[16], NOW).alert === true, 'row 16 risk raises alert')
must(craftFor(S[26], NOW).alert === true, 'row 26 risk raises alert')
must(craftFor(S[1], NOW).alert === false, 'a do stage never alerts')
must(craftFor(S[1], NOW).tempo.band === 'unknown', 'row 1: "next week" in prose is not a tempo band')

must(parseFollowupBand('same-day').band === 'same_day', 'band same-day')
must(parseFollowupBand('3–10 days').maxDays === 10, 'band 3–10 days')
must(parseFollowupBand('8–12 weeks').band === 'weeks', 'band 8–12 weeks')
must(parseFollowupBand('3–4d').maxDays === 4, 'band 3–4d shorthand')
must(parseFollowupBand('2–3 weeks').maxDays === 21, 'weeks band converts to days')
must(parseFollowupBand('10–20 days').band === 'weeks', 'a day band past 14 promotes to weeks')
must(parseFollowupBand('by 14 Sep').band === 'unknown', 'a date is not a tempo band')
must(parseFollowupBand(undefined).band === 'unknown', 'missing followup_when is unknown')

must(daysSinceTouch('2026-08-25', NOW) === 14, 'daysSinceTouch ISO date')
must(daysSinceTouch('2026-09-08T00:00:00Z', NOW) === 0, 'daysSinceTouch ISO datetime')
must(daysSinceTouch('2 weeks ago', NOW) === 14, 'daysSinceTouch relative weeks')
must(daysSinceTouch('14 days ago', NOW) === 14, 'daysSinceTouch relative days')
must(daysSinceTouch('sometime in the summer', NOW) === null, 'unparseable last_touch is never guessed')
must(daysSinceTouch(undefined, NOW) === null, 'absent last_touch is null')

// ── §10.2 weather scenarios ──────────────────────────────────────────────────

function weatherOf(stages, waybarText, focus, mapError) {
  return computeWeather({
    stages,
    waybar: decodeWaybarChip(waybarText),
    focus,
    mapError: mapError ?? null,
    now: NOW,
  })
}

function sameList(actual, expected) {
  return actual.length === expected.length && actual.every((value, i) => value === expected[i])
}

const WEATHER = [
  {
    id: 'W1',
    stages: realMap,
    waybar: 'X ON / 2 PAUSES',
    focus: 'career',
    state: 'crosswind',
    because: ['2 opportunities are on pause', '4 replies are not yours to force'],
  },
  {
    id: 'W2',
    stages: [S[2], S[3], S[4], S[5]],
    waybar: 'X ON / 0 PAUSES',
    focus: 'career',
    state: 'becalmed',
    because: ['4 replies are not yours to force'],
  },
  {
    id: 'W3',
    stages: [S[1], S[26]],
    waybar: 'X ON / 0 PAUSES',
    focus: 'career',
    state: 'storm',
    because: [],
  },
  { id: 'W4', stages: [], waybar: 'X ON / 2 PAUSES', focus: 'career', state: 'blackout', because: [] },
  { id: 'W5', stages: [S[1], S[2]], waybar: 'X ON / 0 PAUSES', focus: 'career', state: 'clear', because: [] },
  {
    id: 'W6',
    stages: [S[1]],
    waybar: 'X OFF',
    focus: 'career',
    state: 'crosswind',
    because: ['X search is off'],
  },
  {
    id: 'W7',
    stages: [S[14], S[2]],
    waybar: 'X ON / 0 PAUSES',
    focus: 'career',
    state: 'becalmed',
    because: ['the only forceable act is in Debt'],
    hint: 'debt',
  },
  {
    id: 'W8',
    stages: [S[14], S[16]],
    waybar: 'X ON / 0 PAUSES',
    focus: 'debt',
    state: 'storm',
    because: [],
  },
  {
    id: 'W9',
    stages: [],
    waybar: '',
    focus: 'career',
    state: 'blackout',
    because: [],
    mapError: 'permission denied',
    contains: 'permission denied',
  },
  {
    id: 'W10',
    stages: realMap,
    waybar: '',
    focus: 'career',
    state: 'crosswind',
    because: ['4 replies are not yours to force'],
  },
  {
    id: 'W11',
    stages: [S[1], S[24]],
    waybar: 'X ON / 0 PAUSES',
    focus: 'career',
    state: 'crosswind',
    because: ['1 wait is past its own reply window'],
  },
]

for (const w of WEATHER) {
  const weather = weatherOf(w.stages, w.waybar, w.focus, w.mapError)
  must(weather.state === w.state, `${w.id} state: want ${w.state}, got ${weather.state}`)
  must(
    sameList(weather.because, w.because),
    `${w.id} because: want [${w.because.join(' | ')}], got [${weather.because.join(' | ')}]`,
  )
  must(
    weather.transportHint === (w.hint ?? null),
    `${w.id} transportHint: want ${w.hint ?? null}, got ${weather.transportHint}`,
  )
  if (w.contains) must(weather.sentence.includes(w.contains), `${w.id} sentence quotes the real error`)
}

const w1 = weatherOf(realMap, 'X ON / 2 PAUSES', 'career')
must(
  w1.sentence ===
    'You can move the one act now — 2 opportunities are on pause; 4 replies are not yours to force.',
  'W1 sentence is plain first',
)
must(w1.flavor === 'crosswind', 'W1 flavor chip is secondary')
must(
  weatherOf([S[2], S[3], S[4], S[5]], 'X ON / 0 PAUSES', 'career').sentence ===
    'Nothing in Career can be forced today — the next move belongs to someone else.',
  'W2 becalmed sentence',
)
must(
  weatherOf([S[14], S[2]], 'X ON / 0 PAUSES', 'career').sentence.endsWith(
    'The only forceable act is in Debt.',
  ),
  'W7 names the slot that holds the act',
)
must(
  weatherOf([S[1], S[26]], 'X ON / 0 PAUSES', 'career').sentence ===
    'Decide on the risk: Pack for the W37 lane is missing a cover letter.',
  'W3 storm sentence names the concrete risk and asks for the decision',
)
must(
  !weatherOf([S[1], S[26]], 'X ON / 0 PAUSES', 'career').sentence.includes('something is going wrong'),
  'W3 storm never falls back to the vague "something is going wrong"',
)

// ── storm alert: named risk + decide path (Fix 1) ────────────────────────────
const storm1 = weatherOf([S[1], S[26]], 'X ON / 0 PAUSES', 'career')
must(storm1.alert !== null, 'storm carries a named alert')
must(storm1.alert.lead === S[26], 'alert.lead is the first risk stage in map order')
must(storm1.alert.slot === 'career', 'alert.slot is where the risk lives')
must(storm1.alert.head === 'Pack for the W37 lane is missing a cover letter', 'alert names the risk')
must(storm1.alert.consequence === 'could sink the submission', 'alert keeps the stakes clause')
must(storm1.alert.count === 1, 'alert counts one risk')

const storm2 = weatherOf([S[26], S[16]], 'X ON / 0 PAUSES', 'career')
must(storm2.alert.count === 2, 'alert counts every risk on the map')
must(storm2.alert.lead === S[26], 'alert.lead stays the top risk when several exist')
must(
  storm2.sentence === 'Decide on the risk: Pack for the W37 lane is missing a cover letter (+1 more).',
  'multiple risks show the top one plus a +N more the strip keeps clickable',
)

const stormElsewhere = weatherOf([S[1], S[16]], 'X ON / 0 PAUSES', 'career')
must(
  stormElsewhere.alert.slot === 'debt',
  'a risk outside the focused cockpit still names its own slot for the decide path',
)
must(stormElsewhere.alert.consequence === null, 'a risk with no stakes clause has a null consequence')

must(weatherOf([S[1], S[2]], 'X ON / 0 PAUSES', 'career').alert === null, 'a clear run carries no alert')
must(weatherOf([], 'X ON / 0 PAUSES', 'career').alert === null, 'a blackout carries no alert')

// ── slot roles: product core vs life spots (Fix 2) ───────────────────────────
must(slotRole('career') === 'core', 'Career/Cash is the product core')
must(
  slotRole('debt') === 'spot' && slotRole('sweden') === 'spot' && slotRole('body') === 'spot',
  'the other three slots are life attention-spots',
)
must(roleLabel('core') === 'Product core', 'core role label')
must(roleLabel('spot') === 'Life spot', 'spot role label')
must(
  weatherOf([], 'X ON / 2 PAUSES', 'career').sentence ===
    'No mission map on disk yet — Navigating has nothing to read.',
  'W4 blackout sentence',
)
must(
  weatherOf([S[1], S[2]], 'X ON / 0 PAUSES', 'career').sentence ===
    'Clear run. The one act is yours and nothing is blocking it.',
  'W5 clear sentence',
)
must(
  !weatherOf(realMap, '', 'career').because.some((b) => b.includes('X search')),
  'W10 never renders an X signal from absent waybar data',
)
must(weatherOf([S[14], S[16]], 'X ON / 0 PAUSES', 'debt').flavor === 'hull alarm', 'W8 space storm flavor')
must(weatherFlavor('becalmed', 'water') === 'becalmed', 'water becalmed flavor')
must(weatherFlavor('clear', 'land') === 'open road', 'land clear flavor')
must(weatherFlavor('blackout', 'space') === 'signal lost', 'space blackout flavor')

// ── §10.3 focus / dock ───────────────────────────────────────────────────────

const waybar0 = decodeWaybarChip('X ON / 0 PAUSES')

const f1 = buildCockpit({ stages: realMap, waybar: waybar0, now: NOW })
must(f1.focus.focus === 'career' && f1.focus.reason === 'one_act', 'F1 focus follows the one act')
must(f1.focus.family === 'air', 'F1 hero family is Air')
must(sameList(f1.dock.map((d) => d.slot), ['debt', 'sweden', 'body']), 'F1 dock order')
must(f1.dock.every((d) => d.empty), 'F1 the other three lives are honestly empty')
must(f1.dock.every((d) => d.headline === null), 'F1 empty tiles fabricate no headline')
must(f1.hero.act === S[1], 'F1 hero act is the first Do')
must(f1.log.waiting.length === 4, 'F1 log keeps the four waits')
must(f1.log.done.length === 1, 'F1 log keeps the flown row')

const f2 = buildCockpit({ stages: [], waybar: waybar0, now: NOW })
must(f2.focus.focus === 'career' && f2.focus.reason === 'default', 'F2 empty map defaults to career')
must(sameList(f2.dock.map((d) => d.slot), ['debt', 'sweden', 'body']), 'F2 dock order')
must(f2.dock.every((d) => d.empty), 'F2 dock is three silhouettes')
must(f2.hero.emptyCopy === 'No mission map on disk yet.', 'F2 hero says the map is empty')
must(f2.hero.craft.variant === CHAOS_CRAFT, 'F2 an unreadable map is the chaos case, not a berth')

const f3 = buildCockpit({ stages: [S[8], S[2], S[3]], waybar: waybar0, now: NOW })
must(f3.focus.focus === 'sweden' && f3.focus.reason === 'one_act', 'F3 focus follows the AF act')
must(sameList(f3.dock.map((d) => d.slot), ['debt', 'career', 'body']), 'F3 dock order')

const f4 = buildCockpit({ stages: realMap, waybar: waybar0, userFocus: 'debt', now: NOW })
must(f4.focus.focus === 'debt' && f4.focus.reason === 'user', 'F4 dock click wins')
must(sameList(f4.dock.map((d) => d.slot), ['career', 'sweden', 'body']), 'F4 dock order')
must(f4.hero.empty === true, 'F4 focused slot is empty')
must(f4.hero.emptyCopy === 'Nothing on the map for Debt.', 'F4 empty cockpit copy')
must(f4.hero.act === null && f4.hero.waitingOn === null, 'F4 fabricates no act')

const f5 = buildCockpit({ stages: [S[2], S[3]], waybar: waybar0, now: NOW })
must(f5.focus.focus === 'career' && f5.focus.reason === 'default', 'F5 no Do anywhere')
must(f5.hero.act === null, 'F5 hero has no act line')
must(f5.hero.waitingOn === S[2], 'F5 hero waits on the first live stage')
must(f5.weather.state === 'becalmed', 'F5 all-wait reads becalmed')

const f6 = transportFocus('body', 'career')
must(f6.focus === 'career' && f6.reason === 'user', 'F6 transport target wins')
must(f6.announce === 'Transported to the Aircraft band — Career.', 'F6 announce copy')
must(
  transportFocus('career', 'sweden').announce === 'Transported to the Sailing band — Sweden window.',
  'F6 announce copy for the Sweden window',
)

const f7 = buildCockpit({ stages: [S[16], S[1]], waybar: waybar0, now: NOW })
must(f7.focus.focus === 'career' && f7.focus.reason === 'one_act', 'F7 risk never steals focus')
must(f7.dock[0].slot === 'debt' && f7.dock[0].risk === 1, 'F7 the debt tile carries the alert')
must(f7.weather.state === 'storm', 'F7 risk raises weather instead of hijacking the cockpit')

const summaries = slotSummaries([S[1], S[2], S[14], S[19]], NOW)
must(summaries.career.live === 2, 'summary counts do + wait + risk')
must(summaries.career.waiting === 1, 'summary counts waits')
must(summaries.career.headline === 'Submit one relevant application next week', 'summary headline')
must(summaries.debt.craft === 'probe', 'summary craft comes from the most alive stage')
must(summaries.debt.motion === 'thrust', 'summary carries the motion so the dock need not re-derive it')
must(summaries.sweden.craft === FAMILY_CRAFT.water.berth, 'empty slot draws a berthed craft, not a burning one')
must(summaries.sweden.motion === 'berth', 'empty slot motion is berth')
must(summaries.sweden.empty === true, 'empty slot is honest about it')
must(summaries.body.live === 1, 'body slot counts its own act')
must(sameList(dockSlots('sweden'), ['debt', 'career', 'body']), 'dockSlots preserves canonical order')
must(selectFocus({ userFocus: 'sweden', stages: [] }).reason === 'user', 'selectFocus honours user focus')

const unknownLog = buildCockpit({ stages: [S[1], S[28]], waybar: waybar0, now: NOW })
must(unknownLog.log.unclassified === 1, 'unknown-class stages are counted, never rendered')
must(
  !unknownLog.log.waiting.includes(S[28]) && !unknownLog.log.done.includes(S[28]),
  'unknown-class stages stay out of the log',
)
must(buildCockpit({ stages: [S[1], S[25]], waybar: waybar0, now: NOW }).hero.extraActs === 1, 'Also doable count')

// ── §10.4 copy ───────────────────────────────────────────────────────────────

const c1 = actCopy(S[1])
must(c1.head === 'Submit one relevant application next week', 'C1 head')
must(c1.qualifier === 'do not wait for replies', 'C1 qualifier')
must(c1.badges.length === 0, 'C1 badges')

const c2 = actCopy(S[2])
must(c2.head === 'Same-day reply if the live introduction writes', 'C2 head')
must(c2.qualifier === 'do not chase; treat as dying unless they write', 'C2 qualifier')
must(
  sameList(c2.badges, ["Don't chase", 'Dying unless they write', 'Same-day']),
  `C2 badges quote the operator: [${c2.badges.join(' | ')}]`,
)

const c3 = actCopy(S[3])
must(c3.head === 'Technical round', 'C3 head splits at the first em dash')
must(
  c3.qualifier ===
    'usually 3–10 days to book if a submitted pack is moving; one W37 lane stated 3–4d reply',
  'C3 qualifier is byte-identical to the operator substring',
)
must(c3.badges.length === 0, 'C3 badges')

const c4 = actCopy(S[4])
must(c4.head === 'Team or hiring-manager round (typical Swedish SWE loop)', 'C4 head keeps the full string')
must(c4.qualifier === null, 'C4 has no qualifier')
must(c4.badges.length === 0, 'C4 badges')

const c5 = actCopy({ id: 'w9' })
must(c5.head === 'w9', 'C5 falls back to the id')
must(c5.qualifier === null, 'C5 has no qualifier')
must(c5.badges.length === 0, 'C5 badges')

must(
  arriveLine('started a decent Sweden/Nordics/EU full-time role') ===
    'Arrive: started a decent Sweden/Nordics/EU full-time role',
  'C6 Arrive line keeps the operator\'s own word',
)
must(arriveLine('') === '', 'C7 empty goal renders nothing')
must(arriveLine(undefined) === '', 'C7 absent goal renders nothing')

// Band vocabulary is the operator's: Spaceship / Aircraft / Sailing / Road.
// ── fleet lock: spaceship is rare chaos only ─────────────────────────────────
// Aircraft, ships and automobiles carry every ordinary act. A routine debt call must never be
// dressed up as a crewed burn, so `spaceship` may not appear anywhere in the everyday table.
const everydayCraft = Object.values(FAMILY_CRAFT).flatMap((row) => Object.values(row))
must(!everydayCraft.includes('spaceship'), 'no spaceship anywhere in the everyday fleet table')
must(CHAOS_CRAFT === 'spaceship', 'the chaos craft is the spaceship')

const chaosMap = buildCockpit({ g: GOAL, stages: [], waybar: waybar0, now: NOW })
must(chaosMap.weather.state === 'blackout', 'an unreadable SoT is blackout')
must(chaosMap.hero.craft.variant === 'spaceship', 'unknown SoT scrambles the spaceship')
must(chaosMap.hero.craft.alert === true, 'the chaos craft is an alert craft')
must(chaosMap.hero.craft.chaos === true, 'the chaos craft is flagged as chaos')
must(
  heroChipLabel(chaosMap.hero.craft, 'career') === 'Spaceship · Unknown signal',
  'the chaos chip does not claim a slot it cannot trust',
)
must(
  heroChipLabel(craftFor(S[1], NOW), 'career') === 'Aircraft · Career',
  'an ordinary chip names the band and the slot',
)
must(craftFor(S[1], NOW).chaos === false, 'ordinary craft are not chaos')

const brick = buildCockpit({ stages: [], mapError: 'keyring locked', waybar: waybar0, now: NOW })
must(brick.hero.craft.variant === 'spaceship', 'a bricked read scrambles the spaceship')
must(brick.weather.sentence.includes('keyring locked'), 'the blackout sentence carries the reason')

const ordinary = buildCockpit({ g: GOAL, stages: [S[14]], waybar: waybar0, now: NOW })
must(ordinary.focus.focus === 'debt', 'a debt act focuses the debt slot')
must(ordinary.hero.craft.variant === 'probe', 'an everyday debt act is a probe, never a spaceship')

must(bandLabel('space') === 'Deep space', 'band label space')
must(bandLabel('air') === 'Aircraft', 'band label air')
must(bandLabel('water') === 'Sailing', 'band label water')
must(bandLabel('land') === 'Automobiles', 'band label land')

console.log('=== heading-transport.verify ===')
console.log(`${checks} assertions`)
if (failures.length) {
  for (const f of failures) console.error('FAIL', f)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')

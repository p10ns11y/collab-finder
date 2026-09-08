# Navigating — the transport model

Navigating is the cash-path cockpit. Before this model it rendered a flat stack of identical
cards under `Next do` / `Wait` / `Done` / `Risk` / `Park`, so every line carried the same visual
weight and the first glance answered nothing. This note is the design law behind the replacement.

## Four slots, four transports

The operator's life has four slots. Each is locked 1:1 to a transport family, and **all four are
first-class** — none is a rare special case.

| Slot | Family key | Band (what the UI says) | Energy signature |
|------|-----------|-------------------------|------------------|
| Debt (hardest) | `space` | **Spaceship** | max chaos, hardest cognitive load, unknown terrain |
| Cash / career (hiring loop) | `air` | **Aircraft** | high priority, turbulence expected and acceptable |
| Sweden window | `water` | **Sailing** | most uncertainty — wind and wait, cannot force progress |
| Son / body (human-only) | `land` | **Road** | relative slowness is fine, do not agent-force |

The family key is the internal axis value; `bandLabel()` renders the operator's band vocabulary,
which is what the hero chip and the dock tiles show.

**Focus is the hero craft.** The slot in focus is drawn large; the other three sit in the dock and
can transport the hero. Navigating opens in the **Aircraft band** because it is the career hunt
surface, not because Air outranks the others.

## What is preserved

The redesign is presentation only. `Arrive` keeps the mission map's own word (`arriveLine()` never
renames it), the one act is still the first `do` stage via the existing `findNextDo`, and pipeline
routing is the existing `stageActions` verbatim — an apply-intent stage with no URL still offers
**Open Pipeline**.

## First glance, in order

The DOM order is the attention order:

1. **vehicle** — which slot-craft am I in
2. **one act** — the single body act
3. **weather** — the conditions
4. **dock** — the other three slot crafts

Everything past the dock (the focused cockpit's waits, risks, flown and parked stages, and people)
is outside the two-second budget and is allowed to be a list.

## Three independent axes

The model's whole value is that these stay separate. Collapsing any two turns the redesign back
into renamed headers.

| Axis | Question | Values | Source |
|------|----------|--------|--------|
| `slot` | which life area | `debt · career · sweden · body` | topic tokens in `id` / `what` / `followup_stage` |
| `class` | where in the lifecycle | `do · wait · done · risk · park` | the SoT field, unchanged, from `heading-cockpit` |
| `motion` | what energy it demands | `thrust · timetable · drift · long_haul · berth` | `class` plus tempo signals |

The craft is then `FAMILY_CRAFT[family][motion]`. This is why a **waiting career stage is an Air
glider**, not a Water craft: waiting is a lifecycle fact, Water is the Sweden-window slot. The two
have nothing to do with each other.

| family | thrust | timetable | drift | long_haul | berth |
|--------|--------|-----------|-------|-----------|-------|
| air | jet | airliner | glider | glider | airliner (hangar) |
| water | dinghy | ferry | yacht | freighter | freighter (harbour) |
| land | motorcycle | bus | taxi | truck | truck (garage) |
| space | spaceship | spaceship | probe | probe | lander (holding orbit) |

Berth reuses a drawable craft; the "in the hangar" reading comes from `craftLabel` /
`craftGloss`, which key off `(family, motion)` rather than the variant alone.

## The two rules that are easy to get wrong

**The Sweden collision.** The career goal literally contains the word "Sweden" and career postings
are hosted on `arbetsformedlingen.se`, so a naive keyword match files half the hiring loop into the
Water slot. Four guards prevent it: the goal string never votes (`inferSlot` takes a stage, not the
map), `stripGeoQualifiers()` removes geography before matching, Water's allowlist holds only
entitlement and permission institutions (`platsbanken` and `jobtech` are job boards, so they are
career), and `contact.url` is excluded from the signal text. The remaining two-token case is broken
by verb intent — an entitlement verb sends it to Water, a hiring verb keeps it in Air.

**Clock ownership.** `CLOCK_OWNED = { air: false, space: false, water: true, land: true }`. For
Water and Land a schedule beats thrust, because those slots' product law is "cannot force" and
"must not be agent-forced". For Air and Space, thrust wins. That asymmetry is the product law
expressed as data.

## Weather

Weather is screen-level, not per-stage: `clear · crosswind · becalmed · storm · blackout`. It
always renders a plain sentence first and the family flavor word second — never the flavor word
alone. Numbers in the sentence come only from stages that exist; a missing waybar simply does not
fire its signals.

## Where the code lives

| Concern | File |
|---------|------|
| Slot / motion / craft / weather transforms (pure) | `src/core/domain/heading-transport.ts` |
| Test vectors | `src/core/domain/heading-transport.verify.runner.mjs` |
| Craft artwork and weather glyphs | `src/components/finder/transport-craft.tsx` |
| Berth / dock / craft surfaces | `src/index.css` (`.ui-craft*`) |
| Screen zones | `src/view/screens/navigating-zones.tsx` |
| Data + focus container | `src/view/screens/heading-screen.tsx` |

Token lists in the domain module are `SCREAMING_SNAKE` module constants so a future agent can grep
and extend one list — `DEBT_TOKENS`, `BODY_TOKENS`, `SWEDEN_INSTITUTIONS`, `HIRING_ACTS`,
`ENTITLEMENT_ACTS`, `GEO_QUALIFIERS`, `FORCEABLE_VERBS`, `SCHEDULE_MARKERS` — without reading the
algorithm around them.

## Visual law

Craft are single-weight `currentColor` line drawings on a shared `0 0 64 40` viewBox with a common
datum, in the grammar of an aircraft-recognition plate rather than a game HUD. **A craft never
carries amber**: amber stays reserved for the focused berth and the one act, per the one-accent
rule in `PRODUCT.md`. Family tint is a dock-tile affordance only, at `oklch(71.2% 0.045 H)` —
`--color-ink-muted`'s own lightness, hue-rotated, so the dock reads as a fleet and not as a
multi-colour card grid.

Craft CSS keys on `data-motion` and `data-alert`, never on lifecycle class. Every motion state has
a **static** encoding across three channels (plume = can this move, datum = how solid the ground,
trail = what wake it leaves), so the screen is fully legible with animation off. Motion is a hero-
only layer on top, and every keyframe rests at identity so the global `prefers-reduced-motion` snap
in `src/index.css` lands on a valid pose instead of freezing a craft mid-animation.

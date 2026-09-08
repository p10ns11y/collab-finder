# Navigating — the transport model

Navigating is the cash-path cockpit. Before this model it rendered a flat stack of identical
cards under `Next do` / `Wait` / `Done` / `Risk` / `Park`, so every line carried the same visual
weight and the first glance answered nothing. This note is the design law behind the replacement.

## Four slots, four transports

The operator's life has four slots. Each is locked 1:1 to a transport family, and **all four are
first-class** — none is a rare special case.

| Slot | Family key | Band (what the UI says) | Energy signature |
|------|-----------|-------------------------|------------------|
| Cash / career (hiring loop) | `air` | **Aircraft** | high priority, turbulence expected and acceptable |
| Season (time-bound life logistics) | `water` | **Sailing** | most uncertainty — wind and wait, cannot force progress |
| Son / body (human-only) | `land` | **Automobiles** | relative slowness is fine, do not agent-force |
| Debt (hardest) | `space` | **Deep space** | hardest slot, long signal delays, little leverage |

The `season` slot is **temporary, important, time-bound life attention** — travel, packing, a move,
a flight, a visa appointment, temporary housing, departure and arrival logistics — plus the dated
Swedish civic admin (permit renewals, a-kassa / Försäkringskassan decisions, AF activity reports)
that lives on the same clock. It is **not** the Sweden hiring market: job boards, ATS work and
Arbetsförmedlingen job ads are career (Air). The current fill is often Sweden travel/packing, but
the reader UI label is the neutral **Season**, never a hardcoded country.

The family key is the internal axis value; `bandLabel()` renders the operator's band vocabulary,
which is what the hero chip and the dock tiles show.

**Focus is the hero craft.** The slot in focus is drawn large; the other three sit in the dock and
can transport the hero. Navigating opens in the **Aircraft band** because it is the career hunt
surface, not because Aircraft outranks the others.

### Product role: core vs life spots

All four slots are mechanically first-class — same craft, motion and weather transforms — but they
do not play the same *product* role, and the UI now says so. `slotRole()` splits them:

- **Career/Cash → `core` ("Product core").** This is what the app is *for*: the hunt for work and
  money. It is the default hero and gets the full berth treatment. Cash is the career money need, so
  it lives in the same Air family — there is no fifth slot.
- **Debt / Sweden / Son & body → `spot` ("Life spot").** Real life areas the product keeps in view
  so nothing slips, even though they are not the product's job. In the dock they read as quiet
  notification tiles: a danger dot when a risk needs a decision, a soft dot when an act is due.

The hero carries a plain role tag so docking into a life spot reads as intentional rather than a
wrong turn. The copy is descriptive (what the slot *is*), never a coach's nudge.

### The spaceship is not an everyday craft

Aircraft, ships and automobiles carry all ordinary work, and the Debt slot's everyday craft is the
**probe** — a query sent into the dark. `spaceship` is deliberately absent from `FAMILY_CRAFT` and
lives alone in `CHAOS_CRAFT`, drawn only when the source of truth is unreadable: no mission map on
disk, or the read failed (a bricked keyring surfaces here today, since Navigating has no separate
auth signal). That is the `blackout` weather state, and it is the only spaceship in the app. A
verify assertion enforces the absence, so the everyday table cannot quietly regain one.

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
is outside the two-second budget and is allowed to be a list. The People rows share the log's card
language: a clear contact name and a labelled **Copy email** / **Open link** button. When a
`contacts.md` entry was written with a bare schema key (`- email: …`), `contactDisplayName()` shows
the address or the link host instead — a raw `email` / `url` key never becomes a person's name.

## Three independent axes

The model's whole value is that these stay separate. Collapsing any two turns the redesign back
into renamed headers.

| Axis | Question | Values | Source |
|------|----------|--------|--------|
| `slot` | which life area | `debt · career · season · body` | topic tokens in `id` / `what` / `followup_stage` |
| `class` | where in the lifecycle | `do · wait · done · risk · park` | the SoT field, unchanged, from `heading-cockpit` |
| `motion` | what energy it demands | `thrust · timetable · drift · long_haul · berth` | `class` plus tempo signals |

The craft is then `FAMILY_CRAFT[family][motion]`. This is why a **waiting career stage is a
cruising airliner**, not a Sailing craft: waiting is a lifecycle fact, Sailing is the
Season slot. The two have nothing to do with each other.

| band | thrust | timetable | drift | long_haul | berth |
|------|--------|-----------|-------|-----------|-------|
| Aircraft | **scramble jet** — act today | **airliner** — cruise on their schedule | airliner — cruise inside their reply window | airliner — long cruise, window passed | **glider** — parked |
| Sailing | **dinghy** — small local act | **ferry** — a polite schedule | **racing yacht** — patient, cannot make wind | **freighter** — long horizon | freighter — moored |
| Automobiles | **motorcycle** — fast dash | **taxi at the curb** — booked pickup | taxi at the curb — waiting on a person (HITL) | **truck** — prep haul | **city bus** — background, archived |
| Deep space | probe — pushed into the dark | probe — their window governs | probe — waiting on telemetry | probe — deep transit | **lander** — down and safe |

Chaos sits off this grid entirely: **spaceship**, and only for an unreadable SoT.

Two motions may share a craft — a cruising airliner is the same aeroplane whether it is on a
schedule or merely inside a reply window — and the motion CSS still draws them apart, so the label
repeats while the gloss says which wait it is. `craftLabel` / `craftGloss` key off
`(family, motion)` rather than the variant alone, which is how a berthed Aircraft stage reads
"Glider — parked" instead of borrowing the cruise wording.

## The two rules that are easy to get wrong

**The Season / career collision.** The career goal literally contains the word "Sweden", career
postings are hosted on `arbetsformedlingen.se`, and hiring prose borrows Season-flavoured words
("relocation package", "visa sponsorship", "willing to travel"), so a naive keyword match files
half the hiring loop into the Sailing slot. The guards: the goal string never votes (`inferSlot`
takes a stage, not the map), `stripGeoQualifiers()` removes geography before matching, Season's
lists hold only time-bound life logistics (`SEASON_LOGISTICS`) and entitlement / permission
institutions (`SEASON_INSTITUTIONS`) — `platsbanken` and `jobtech` are job boards, so they are
career — and `contact.url` is excluded from the signal text. The breaker is verb intent: **a hiring
act keeps the stage in Aircraft and never votes Season**, the one exception being a civic
institution paired with an entitlement verb (a dated obligation, e.g. reporting to AF), which sails.

**Clock ownership.** `CLOCK_OWNED = { air: false, space: false, water: true, land: true }`. For
Sailing and Automobiles a schedule beats thrust, because those slots' product law is "cannot force" and
"must not be agent-forced". For Air and Space, thrust wins. That asymmetry is the product law
expressed as data.

## Weather

Weather is screen-level, not per-stage: `clear · crosswind · becalmed · storm · blackout`. It
always renders a plain sentence first and the family flavor word second — never the flavor word
alone. Numbers in the sentence come only from stages that exist; a missing waybar simply does not
fire its signals.

**A storm is actionable, not ambient.** `computeWeather` attaches a `WeatherAlert` in the storm
state: the first risk stage in map order (`lead`), the slot it lives in, its named `head` and
`consequence` from `actCopy`, and the total risk `count`. The strip then names the concrete risk and
offers a real decide path — the risk's own SoT action when it has one (Open posting / Copy mail /
Open Pipeline), plus a **Show risk** button that transports to the risk's slot and jumps to its row.
With several risks it shows the top one and a `+N more` that is still clickable to the whole list.
The old vague "Something is going wrong" copy is gone: a storm always names its risk.

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
and extend one list — `DEBT_TOKENS`, `BODY_TOKENS`, `SEASON_LOGISTICS`, `SEASON_INSTITUTIONS`,
`HIRING_ACTS`, `ENTITLEMENT_ACTS`, `GEO_QUALIFIERS`, `FORCEABLE_VERBS`, `SCHEDULE_MARKERS` — without
reading the algorithm around them.

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

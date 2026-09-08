import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Craft fleet sprites for the Navigating cockpit.
 *
 * Three axes, three attributes — they stay separate on purpose:
 *   `data-family` life area (tints the dock)  ·  `data-motion` energy of one stage
 *   `data-alert`  composes on top of any motion
 *
 * The JSX below is the only copy of this artwork in the repo. Every craft is a
 * single-weight `currentColor` line drawing in strict side elevation on a shared
 * datum at y=34, inside a 64x40 box (8:5 ≈ φ). Weight comes from `--craft-stroke`
 * on the `<svg>` root; never set `stroke-width` on a child.
 *
 * The hook classes (`craft-datum`, `craft-star`, `craft-trail`, `craft-rig`,
 * `craft-body`, `craft-wing`, `craft-drive`, `craft-wheel`, `craft-plume`,
 * `craft-detail`) are targeted by `.ui-craft*` in src/index.css. `craft-datum`,
 * `craft-star` and `craft-trail` sit outside `craft-rig` so the medium stays put
 * while the craft moves.
 *
 * Driveless is meaningful, not missing: glider, yacht, dinghy and probe carry no
 * `craft-drive` and no `craft-plume` because they are exactly the craft that
 * cannot force progress. Do not give them an engine.
 */

export type CraftVariant =
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

export type CraftMotion = 'thrust' | 'timetable' | 'drift' | 'long_haul' | 'berth'

export type CraftWeather = 'clear' | 'crosswind' | 'becalmed' | 'storm' | 'blackout'

export type CraftFamily = 'air' | 'water' | 'land' | 'space'

/** The family is drawn into every craft — how it meets the horizon. */
export const CRAFT_FAMILY: Record<CraftVariant, CraftFamily> = {
  jet: 'air',
  airliner: 'air',
  glider: 'air',
  dinghy: 'water',
  ferry: 'water',
  yacht: 'water',
  freighter: 'water',
  motorcycle: 'land',
  bus: 'land',
  taxi: 'land',
  truck: 'land',
  spaceship: 'space',
  probe: 'space',
  lander: 'space',
}

export const CRAFT_PATHS: Record<CraftVariant, ReactNode> = {
  /* AIR — above the line, no ink below y≈27. */
  jet: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 23.5H12" />
      <g className="craft-rig">
        <path className="craft-body" d="M60 11 30 19l-3 5.5L57 15.5Z" />
        <path className="craft-wing" d="M46 19 24 28l10-5Z" />
        <path className="craft-wing" d="M34 17.5 28 8h3l8 8Z" />
        <path className="craft-drive" d="M30 19l-3.5 1.3-2.5 5.5 3-1.3" />
        <path className="craft-plume" d="M22.5 21.2 18.5 23l4 2" />
      </g>
    </>
  ),
  airliner: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 15H12" />
      <g className="craft-rig">
        <path className="craft-body" d="M18 10H52c4.5 0 8 2 8 5s-3.5 5-8 5H21c-4.5 0-7.5-4.5-8-10Z" />
        <path className="craft-wing" d="M20 10 15 3h3.5L24 10Z" />
        <path className="craft-wing" d="M17 12.5 11 10" />
        <path className="craft-wing" d="M47 20H33l-12 6Z" />
        <path className="craft-drive" d="M31 23.5v1.5" />
        <path
          className="craft-drive"
          d="M27 25h9c1.7 0 2.5.7 2.5 1.8s-.8 1.7-2.5 1.7h-9c-1.7 0-2.5-.6-2.5-1.7S25.3 25 27 25Z"
        />
        <path className="craft-detail" d="M26 13.5H50" strokeDasharray="1 3.5" />
        <path className="craft-detail" d="m54 12.5 3 1.5" />
      </g>
    </>
  ),
  glider: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 21H12" />
      <g className="craft-rig">
        <path className="craft-body" d="M30 21.5 36 19h11l9 2.5-9 2.5H36Z" />
        <path className="craft-body" d="M30 21.5H18" />
        <path className="craft-wing" d="M12 16c14-1.4 34-2 46-1" />
        <path className="craft-wing" d="M40 15v4" />
        <path className="craft-wing" d="M18 21.5V9.5" />
        <path className="craft-wing" d="M13.5 8.5h9" />
        <path className="craft-detail" d="M47 19.4c3 .3 5 .8 6 1.6" />
      </g>
    </>
  ),

  /* WATER — through the line; the hull draws its own bottom edge at y=34 and
     nothing below, so the "cut by the waterline" read survives every restyle
     of `craft-datum`. */
  dinghy: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M15 25c0 5.5 5 9 11 9h12c6 0 11-3.5 11-9" />
        <path className="craft-wing" d="M36 9c-3 6.5-8 12.5-14 16h14Z" />
        <path className="craft-detail" d="M21 30h16" />
      </g>
    </>
  ),
  ferry: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M14 28h41l3.5 2.5-1.5 3.5H19c-3-1-4.6-3.5-5-6Z" />
        <rect className="craft-body" x="21" y="20" width="26" height="8" rx="1" />
        <rect className="craft-body" x="27" y="12.5" width="16" height="7.5" rx="1" />
        <rect className="craft-drive" x="32" y="7.5" width="7" height="5" rx="1.2" />
        <path className="craft-plume" d="M35.5 7.5c-1-3-3.5-4.5-6.5-4.5" />
        <path className="craft-detail" d="M24 24H44" strokeDasharray="1.5 3" />
        <path className="craft-detail" d="M30 16.5h10" strokeDasharray="1.5 3" />
        <path className="craft-detail" d="M52 28v6" />
      </g>
    </>
  ),
  yacht: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M17 28h36l4-3c-.8 4-2 7.5-3.5 9H23c-3-1-5-3.5-6-6Z" />
        <path className="craft-wing" d="M34 28V5" />
        <path className="craft-wing" d="M34 7c-4 7-8 14-11 18.5h11Z" />
        <path className="craft-wing" d="M34 9.5c6 5.5 12 11 16 17H34Z" />
        <path className="craft-detail" d="M34 5 56.5 25" />
        <path className="craft-detail" d="M21 30.5h26" strokeDasharray="1 4" />
      </g>
    </>
  ),
  freighter: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M14 30h43l3-3-1 7H18c-2.5-.5-3.8-2-4-4Z" />
        <path className="craft-body" d="M23 24h28v6H23z" />
        <rect className="craft-body" x="15" y="24" width="7" height="6" rx="0.5" />
        <rect className="craft-drive" x="17" y="17.5" width="3.5" height="6.5" rx="0.8" />
        <path className="craft-plume" d="M18.5 17.5c-1-3.5-2.5-5.5-5.5-6.5" />
        <path className="craft-detail" d="M32 24v6M41 24v6M23 27h28" />
      </g>
    </>
  ),

  /* LAND — on the line; wheel circles tangent at y=34. */
  motorcycle: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M22 29 27.5 22h9.5l6 2.5L48 29" />
        <path className="craft-body" d="M28 22c3-3.5 8.5-3.5 11-1.5Z" />
        <path className="craft-body" d="M43.5 24.5 46.5 17" />
        <path className="craft-body" d="M44 16h5.5" />
        <path className="craft-drive" d="M31 23.5h6.5l2.5 6H30l-2-3.5Z" />
        <path className="craft-drive" d="M27 27.5H17" />
        <path className="craft-plume" d="M15.5 27.5c-2.5-1-5-.5-7.5.5" />
        <circle className="craft-drive craft-wheel" cx="22" cy="29" r="5" />
        <circle className="craft-drive craft-wheel" cx="48" cy="29" r="5" />
        <path className="craft-detail" d="M47.5 20.5h2.5" />
      </g>
    </>
  ),
  bus: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path className="craft-body" d="M13 14c0-2 1.5-3 4-3h38c2.5 0 4 1 4 3v16H13Z" />
        <circle className="craft-drive craft-wheel" cx="22" cy="29.5" r="4.5" />
        <circle className="craft-drive craft-wheel" cx="50" cy="29.5" r="4.5" />
        <rect className="craft-detail" x="17" y="15" width="38" height="7" rx="1" />
        <path className="craft-detail" d="M28 15v7M39 15v7M50 15v7" />
        <path className="craft-detail" d="M56 26h2" />
      </g>
    </>
  ),
  taxi: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <path
          className="craft-body"
          d="M14 29l2.5-5c1.5-2.5 3.5-4 7.5-4.5h14l7.5 4H55c2.5.5 3.5 2 3.5 5.5Z"
        />
        <rect className="craft-body" x="27" y="15.5" width="8" height="4" rx="1" />
        <circle className="craft-drive craft-wheel" cx="23" cy="29.5" r="4.5" />
        <circle className="craft-drive craft-wheel" cx="49" cy="29.5" r="4.5" />
        <path className="craft-detail" d="M24.5 20.5 22.5 23.5H30v-3Z" />
        <path className="craft-detail" d="M32 20.5h5l5 3H32Z" />
      </g>
    </>
  ),
  truck: (
    <>
      <path className="craft-datum" d="M4 34H60" />
      <path className="craft-trail" d="M2 35.5H16" />
      <g className="craft-rig">
        <rect className="craft-body" x="14" y="10" width="26" height="18" rx="1.5" />
        <path className="craft-body" d="M44 29V17c0-1.5 1-2 2.5-2H55l4 6v8Z" />
        <path className="craft-body" d="M40 26h4" />
        <path className="craft-drive" d="M45 15v-5" />
        <path className="craft-plume" d="M45 10c-1-3-3-4-6-4" />
        <circle className="craft-drive craft-wheel" cx="20" cy="29.5" r="4.5" />
        <circle className="craft-drive craft-wheel" cx="31" cy="29.5" r="4.5" />
        <circle className="craft-drive craft-wheel" cx="52" cy="29.5" r="4.5" />
        <rect className="craft-detail" x="47" y="17.5" width="7" height="4.5" rx="1" />
        <path className="craft-detail" d="M34 10v18" />
      </g>
    </>
  ),

  /* SPACE — no line at all; `craft-star` dots stand in for the datum, which is
     why the plume channel exists. `lander` is the documented exception: it
     carries a curved datum, because you did land on something. */
  spaceship: (
    <>
      <path className="craft-star" d="M10 8h0M17 27h0M52 33h0M44 5h0M8 20h0" />
      <path className="craft-trail" d="m20 33 -6 4" />
      <g className="craft-rig">
        <path className="craft-body" d="M57 7 50 16 33.5 29 29.5 23.5 46.5 11Z" />
        <path className="craft-wing" d="M34 20.5 27 18l2.5 5.5Z" />
        <path className="craft-wing" d="M37 26l.5 7-4-4Z" />
        <path className="craft-drive" d="M29.5 23.5 26.5 25l5 7 2-3" />
        <path className="craft-plume" d="M28 26.5 20.5 32M30.5 30 24 35M25.5 23.5 19.5 28" />
      </g>
    </>
  ),
  probe: (
    <>
      <path className="craft-star" d="M12 34h0M22 9h0M55 33h0M50 8h0M34 37h0" />
      <path className="craft-trail" d="M4 35H18" />
      <g className="craft-rig">
        <path className="craft-body" d="M30 17h8l3 3v6l-3 3h-8l-3-3v-6Z" />
        <path className="craft-body" d="M34 17v-5" />
        <path className="craft-body" d="M25.5 12.5c2-6.5 13-6.5 15 0" />
        <path className="craft-wing" d="M27 23h-7M41 23h7" />
        <path className="craft-wing" d="M20 18.5 8 20v6.5l12-1.5Z" />
        <path className="craft-wing" d="M44 18.5 56 20v6.5l-12-1.5Z" />
        <path className="craft-detail" d="M12 19.4v6.6M16 18.9v6.9M52 18.9v6.9M48 19.4v6.6" />
      </g>
    </>
  ),
  lander: (
    <>
      <path className="craft-datum" d="M5 38c12-7 42-7 54 0" />
      <path className="craft-star" d="M12 10h0M52 8h0M30 4h0" />
      <path className="craft-trail" d="M2 30H12" />
      <g className="craft-rig">
        <path className="craft-body" d="M24 18h20l2 10H22Z" />
        <path className="craft-body" d="M34 18v-6" />
        <path className="craft-body" d="M30 12c1.5-3 6.5-3 8 0" />
        <path className="craft-wing" d="M26 28 19 34M42 28l7 6" />
        <path className="craft-wing" d="M16 34h6M46 34h6" />
        <path className="craft-drive" d="M31 28l-2.5 5h11l-2.5-5" />
        <path className="craft-detail" d="M27 21h14" strokeDasharray="1.5 3" />
      </g>
    </>
  ),
}

/**
 * Screen-level weather — a separate axis from motion, on the house 24x24 Lucide
 * box so these drop into `.ui-chip` and button rows with no new sizing rules.
 */
export const WEATHER_GLYPH: Record<CraftWeather, ReactNode> = {
  clear: (
    <>
      <path d="M2 12h13" />
      <path d="m15 7 5 5-5 5" />
      <path d="M4 6h6M4 18h4" />
    </>
  ),
  crosswind: (
    <>
      <path d="M2 8c3.5-3 6 3 9.5 0S18.5 5 22 8" />
      <path d="M2 16c3.5-3 6 3 9.5 0S18.5 13 22 16" />
    </>
  ),
  becalmed: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7M14 8.5v7" />
    </>
  ),
  storm: (
    <>
      <path d="M16.5 2 9.5 11.5H15l-2.5 4" />
      <path d="M2 18.5h7.5l2.5 3H22" />
    </>
  ),
  blackout: (
    <>
      <path d="M3 7h13M8 12h13M3 17h10" />
    </>
  ),
}

type CraftProps = {
  variant: CraftVariant
  motion: CraftMotion
  /** The stage is at risk. Composes on top of any motion. */
  alert?: boolean
  size: 'hero' | 'dock'
  className?: string
  /** Only pass this when the craft is the sole label for its slot. */
  title?: string
}

/** A craft sprite. Decorative by default — the slot's text carries the meaning. */
export function TransportCraft({
  variant,
  motion,
  alert = false,
  size,
  className,
  title,
}: CraftProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-family={CRAFT_FAMILY[variant]}
      data-craft={variant}
      data-motion={motion}
      data-alert={alert ? 'true' : 'false'}
      className={cn('ui-craft', size === 'hero' ? 'ui-craft-hero' : 'ui-craft-dock', className)}
    >
      {title ? <title>{title}</title> : null}
      {CRAFT_PATHS[variant]}
    </svg>
  )
}

type GlyphProps = {
  state: CraftWeather
  className?: string
  /** Only pass this when the glyph is the sole label for the weather. */
  title?: string
}

/** Weather mark on the house icon box. Size it with `h-*`/`w-*` like a Lucide icon. */
export function WeatherGlyph({ state, className, title }: GlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-glyph={state}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {WEATHER_GLYPH[state]}
    </svg>
  )
}

# Product

## Register

product

## Users

Solo operator / builder (primary: the project author) using a desktop Tauri app to discover high-fit jobs, collabs, side hustles, and community opportunities on X. Context: deep work sessions, intermittent autonomous reactor runs, credentials already in keyring. Primary tasks per screen: **Discover** (opportunity memory + quick target fit/prep), **Xplore** (live X search + autonomous cycle), **Settings** (X bearer + xAI key + paths). Intervention only when self-guards pause (fit, cost, rate, CV promote).

## Product Purpose

collab-finder is a self-guarded, agentic opportunity reactor: search X, analyze with xAI grounded in a distilled CV packet, prepare application materials, track history in SQLite, and safely propose CV insights — without mutating the external portfolio without explicit gates. Success = high-signal opportunities prepared with minimal babysitting; the UI disappears into the hunt.

## Brand Personality

**Calm · precise · autonomous.** Dark instrument panel for serious operators — not a marketing site, not a toy. Confidence through clarity (status chips, pause signals, pipeline state), not decoration. Warm amber accent as the single “alive” signal on a cool near-black surface ramp.

## Anti-references

- Generic SaaS cream/sand dashboards and multi-color card grids
- Loud neon “AI agent” cosplay with decorative glass everywhere
- Sidebar with every admin link expanded; cluttered Chrome-extension density without hierarchy
- Gradient text, side-stripe callout cards, hero-metric vanity tiles
- Unbounded “chat with agent” as the only surface (this is a structured tool with explicit screens)

## Design Principles

1. **Task first** — every surface answers “what can I do next?” (evaluate target, search X, fix credentials).
2. **Guards visible, not alarming** — pauses and connection state are calm status, not red walls of text.
3. **One visual system** — shared surfaces, type scale, chips, and empty states across Discover / Xplore / Settings.
4. **Progressive density** — φ-split workspaces; advanced reference material stays collapsed.
5. **Trust through restraint** — accent for primary action and selection only; no decorative motion.

## Accessibility & Inclusion

- Dark theme default (`color-scheme: dark`); preserve visible focus rings (accent outline).
- Prefer `prefers-reduced-motion` for any non-essential animation.
- Target WCAG AA contrast for body and interactive labels on surface ramps.
- Keyboard: command palette (⌘K), focus-visible controls, semantic nav `aria-current`.

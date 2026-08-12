# Product

## Positioning

collab-finder is a self-guarded, agentic opportunity reactor for a solo operator: hunt high-fit roles and collabs, prepare application materials, and track history in SQLite — with explicit gates before any external portfolio mutation.

## Users

Solo operator / builder (primary: the project author) on a desktop Tauri app. Context: deep work sessions, intermittent autonomous reactor runs, credentials in the keyring. Intervention only when self-guards pause (fit, cost, rate, CV promote).

## Operating Context

Desktop dark instrument panel. Primary screens:

- **Discover** — opportunity memory, hire board skim, quick target fit/prep/export
- **Mission** — SpaceXAI / Tesla / Nordic–EU career boards (query-keyed cache; Import → Evaluate → fit/prep)
- **Sweden** — Platsbanken / JobTech AF benefits runway (municipality chips; Sweden-specific workflows)
- **Xplore** — live X search + autonomous cycle
- **Network** — local LinkedIn graph (PII stays on disk)
- **Settings** — X bearer, xAI key, paths

## Product Purpose

Search and ingest postings (career boards, JobTech, X), analyze with xAI grounded in a distilled CV packet, prepare application packs, and safely propose CV insights. Success = high-signal opportunities prepared with minimal babysitting; the UI disappears into the hunt.

## Brand Personality

**Calm · precise · autonomous.** Dark instrument panel for serious operators — not a marketing site, not a toy. Confidence through clarity (status chips, pause signals, pipeline state), not decoration. Warm amber accent as the single “alive” signal on a cool near-black surface ramp.

## Anti-references

- Generic SaaS cream/sand dashboards and multi-color card grids
- Loud neon “AI agent” cosplay with decorative glass everywhere
- Sidebar with every admin link expanded; cluttered Chrome-extension density without hierarchy
- Gradient text, side-stripe callout cards, hero-metric vanity tiles
- Unbounded “chat with agent” as the only surface (this is a structured tool with explicit screens)
- Stacking Mission + Sweden hunt lists into Discover’s left rail (those are full-viewport peers)

## Design Principles

1. **Task first** — every surface answers “what can I do next?” (pull boards, search Platsbanken, evaluate target, search X).
2. **Guards visible, not alarming** — pauses and connection state are calm status, not red walls of text.
3. **One visual system** — shared surfaces, type scale, chips, and empty states across Discover / Mission / Sweden / Xplore / Settings.
4. **Progressive density** — φ-split workspaces; hunt lists own the major pane; advanced reference stays collapsed.
5. **Trust through restraint** — accent for primary action and selection only; no decorative motion.

## Platform

Desktop (Tauri). UI is web tech inside a native shell; design language is product Operate, not mobile-native.

## Accessibility & Inclusion

- Dark theme default (`color-scheme: dark`); preserve visible focus rings (accent outline).
- Prefer `prefers-reduced-motion` for any non-essential animation.
- Target WCAG AA contrast for body and interactive labels on surface ramps.
- Keyboard: command palette (⌘K), ⌘1–6 screen digits, focus-visible controls, semantic nav `aria-current`.

# Design system — collab-finder

Captured from existing tokens + components; refined in the looper/impeccable polish pass.

## Visual theme

Dark product instrument: near-black surfaces, cool gray ink ramp, single warm amber accent. Soft mesh glow at top of shell only (not on every card). Radius modest (sm–lg); cards at `rounded-xl` max.

## Color

| Token | Role |
|-------|------|
| `--color-surface-0` … `3`, `elevated` | Background ramp |
| `--color-border-subtle/default/strong` | Borders |
| `--color-ink`, `ink-muted`, `ink-faint` | Text |
| `--color-accent`, `accent-soft`, `accent-glow` | Primary action / selection |
| `--color-success/warning/danger` | Semantic state |

## Typography

- Family: DM Sans Variable (`--font-sans`); mono for IDs, URLs, tokens.
- Product scale: caption 11px, body-sm 13px, body 15px; section titles `text-sm font-semibold`.
- Section labels: `.ui-section-label` (caption weight, not shouty all-caps sprawl on every block).

## Spacing & layout

- Space scale: `--space-1`…`--space-6`.
- φ panes: `--pane-minor` / `--pane-major` for Discover/Xplore split.
- Shell: sidebar + header + **framed viewport** (inset surface, no double padding drift).

## Components

- **Button** — primary / secondary / ghost / danger; sm/md/lg.
- **Card** — elevated work blocks (settings, search workspace, fit panel).
- **Panel** — lighter inset blocks (opportunity rail, quick target).
- **Input / Textarea / Label** — shared form vocabulary; prefer these over raw inputs.
- **Badge** — status chips (connection, pauses, pipeline).
- **Chip** — selectable filters (pipeline rail).
- **EmptyState** — calm empty with optional action.
- **SectionLabel** — consistent section headers.

## Motion

- 150ms color/filter transitions on controls.
- No page-load choreography; honor `prefers-reduced-motion`.

# collab-finder

Personal intelli dashboard (Tauri desktop app) for discovering and preparing for jobs, collabs, side hustles, and community builds using **live X API** + **xAI**.

- Fully editable X search queries (tune anytime, presets as starting points).
- xAI-powered analysis, cover letters, CV deltas (sidecars always).
- "Promote insights" flow to safely evolve your master CV in the portfolio repo (with preview + backup).
- Local-only, portable JSON data (shareable with future Hono viewer or scripts).
- Designed to let you finish prep for promising leads **without leaving the app**.

Separate repo from your public [devprofile](https://github.com/p10ns11y/devprofile) portfolio (which maintains the canonical `cvdata.json` + PDF).

## Status

Scaffold phase. Real X search, xAI calls (with CV pruning), lead management, prep packs, export, tracker, and promote coming in phases.

## Quick start (after full setup)

```bash
pnpm install
# one-time: cargo install tauri-cli (or use the one in path)
pnpm tauri dev
```

Configure X Bearer token + xAI key + path to your devprofile checkout in the app (first run / settings). Keys stored securely via Tauri plugins (Rust side only).

## Key design choices (per your guidance)

- Tauri (Rust backend + React web frontend) for the contained "finish everything" interface.
- Separate from portfolio → no bloat on the public site.
- Sidecars + explicit promote for CV.
- Maximum flexibility: live editable queries + manual add (paste from arena lists, LinkedIn, etc.).
- Data files enable web viewers / other tools to coexist.

See plan.md in the devprofile session artifacts for full architecture, phases, and surplus notes.

## X + xAI tips

- Use xurl (official) or the X playground for testing complex queries before pasting into the app.
- The app will support the full recent search operators so you stay in control.
- CV is pruned (fission-style) before sending to xAI for token efficiency and focus.

Built for Peramanathan Sathyamoorthy (@peramanathan / p10ns11y).

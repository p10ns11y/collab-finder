# collab-finder

Desktop Tauri app (Rust + React) that hunts high-fit roles, prepares application packs, and tracks history in SQLite. You intervene when **guards** fire — fit, cost, rate, or CV promote — not on every step.

Planning and session status live in [life-os](https://github.com/p10ns11y/life-os) (`Projects/collab-finder`). How-to for agents: **[AGENTS.md](AGENTS.md)**.

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js** | LTS |
| **pnpm** | `corepack enable` or install globally |
| **Rust** | Stable + `cargo` |
| **Tauri v2** | Linux: GTK/WebKit, `libsecret`. [Prerequisites](https://v2.tauri.app/start/prerequisites/). |

Arch notes, credentials, troubleshooting: **[docs/SETUP.md](docs/SETUP.md)**.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

First launch: **Discover**. Sidebar: **Heading · Discover · Mission · Sweden · Xplore · Network · Settings**. Heading is the cash-path cockpit (mission-map JSON + contacts). Mission remains career-board hunt. Cluster law: `ensembly/docs/SATELLITE-CLUSTER.md`. Palette: ⌘K / Ctrl+K. Quest: header control (threads persist in SQLite).

## First-run

### Settings

1. **X connection** — Bearer token, **Save**. Stored in Rust (keyring + file fallback). Status via `get_x_bearer_storage`.
2. **xAI key** — for Evaluate / Prepare. Same storage pattern (`get_xai_key_storage`).
3. **devprofile path** — needed for **Generate apply CV** (PDF). Never auto-writes the master CV.

### Hunt → prepare → apply

| Screen | Job |
|--------|-----|
| **Discover** | Opportunity rail, hire-board skim, Quick Target (URL or pasted JD). |
| **Mission** | Career-board hunt (SpaceXAI / Tesla / Nordic–EU). Import → Evaluate. |
| **Sweden** | Platsbanken via **JobTech API** (skips the website cookie wall). Search → Evaluate. |
| **Xplore** | Live X search + autonomous cycle (`guarded_search`). |
| **Network** | Local LinkedIn graph (PII stays on disk). |

**Quick Target loop:** paste URL or JD → **Evaluate fit** (xAI) → **Prepare** → **Generate apply CV** → **Artifacts** (markdown + PDFs) → **Applied**. Platsbanken URLs load the ad from JobTech, not HTML. A JobTech JD body is not a URL even if it contains a Platsbanken link.

Click a rail row to restore fit + prep from SQLite (no new xAI call). Pack files live under `~/.local/share/collab-finder/application_packs/` and reappear after reload.

## Verify

```bash
pnpm build
cd src-tauri && cargo check && cargo test
```

`cargo test` covers secrets, db, reactor, and query validation (no live X token). Frontend typecheck: `pnpm exec tsc -b`. `package.json` has no `lint` / `precommit` scripts yet.

## Architecture

| Layer | Location |
|-------|----------|
| MVU UI | `src/core/finder/`, `src/view/`, `src/components/finder/` |
| Screens | `src/view/screens/`, `src/components/layout/sidebar-nav.tsx` |
| Tauri bridge | `src/adapters/tauri/`, `src/ports/` |
| X + secrets | `src-tauri/src/lib.rs`, `secrets.rs`, `app_dirs.rs` |
| Target / packs / apply CV | `src-tauri/src/opportunity_target.rs` |
| Platsbanken / JobTech | `src-tauri/src/platsbanken.rs` |
| SQLite | `src-tauri/src/db.rs` |
| Reactor | `src-tauri/src/finder_reactor.rs` |

Invoke inventory: **[docs/tauri-commands.md](docs/tauri-commands.md)** (MCP planned; today `invoke` only).

## Docs

| Doc | Purpose |
|-----|---------|
| [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) | Product + visual system |
| [docs/SETUP.md](docs/SETUP.md) | Install, credentials, verify |
| [docs/quest-flows.md](docs/quest-flows.md) | Quest chips + example prompts |
| [docs/agentic-architecture.md](docs/agentic-architecture.md) | System map |
| [docs/tauri-commands.md](docs/tauri-commands.md) | `invoke` handlers |
| [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) | IPC failures in dev |
| [docs/secrets-agent-safety.md](docs/secrets-agent-safety.md) | Never dump keys |
| [docs/x-tools.md](docs/x-tools.md) | Official X agent resources |
| [data/distillation/README.md](data/distillation/README.md) | Presets and analyze prompts |
| [.agents/x-resources/README.md](.agents/x-resources/README.md) | Vendored X skill.md / llms |

## Agents

- **AGENTS.md** — skills, triage, conventions
- **.agents/skills/** — finder-reactor, tauri-agentic, cv-promote-guard, x-agent-resources

## X content

Official X API only. SQLite stores **IDs**, `https://x.com/i/web/status/{id}` links, and **280-character snippets** — not full bodies. Full text via `hydrate_tweet` on demand. `collab-finder.db` is never committed.

See [docs/x-content-storage-distributin-policy.md](docs/x-content-storage-distributin-policy.md).

Private tool for p10ns11y.

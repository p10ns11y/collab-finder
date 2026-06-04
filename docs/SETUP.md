# Setup — collab-finder

Desktop Tauri app (Rust + React). This guide matches what works in the repo today.

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js** | LTS recommended; project uses `pnpm` |
| **pnpm** | `corepack enable` or install pnpm globally |
| **Rust** | Stable toolchain + `cargo` |
| **Tauri v2 system deps** | Linux: GTK/WebKit, `libsecret`/keyring for credential storage. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). |

## Install and run

```bash
git clone <your-remote> collab-finder
cd collab-finder
pnpm install
pnpm tauri dev
```

Production build:

```bash
pnpm build          # tsc + vite (frontend)
cd src-tauri && cargo build
pnpm tauri build    # full desktop bundle
```

## Verify (commands that exist today)

```bash
pnpm build
cd src-tauri && cargo check
```

`package.json` does not yet define `type-check`, `lint`, or `precommit` scripts.

## X Bearer credentials

1. Create an app on the [X Developer Portal](https://developer.x.com/) and copy the **Bearer token** (app-only).
2. In the app, open **X connection** (credentials panel).
3. Paste the token and choose **Save to keychain**.
4. The draft field is cleared after save; the token is **not** kept in React state.

**Storage (Rust `src-tauri/src/secrets.rs`):**

- Primary: OS keyring (`collab-finder` / `x-bearer`)
- Reliable fallback: plaintext file `~/.local/share/collab-finder/x-bearer` (mode `0600`) when keyring is unavailable; requires `keyring` crate `sync-secret-service` feature on Linux (see `src-tauri/Cargo.toml`)
- Search and reactor commands read the token from storage — you do not pass `bearer` on each search invoke

## What works vs stubs

| Feature | Status |
|---------|--------|
| Recent X search (`search_x_recent`) | Live HTTP to `api.x.com` |
| Credential save/clear | Live |
| Autonomous cycle (`run_finder_cycle_cmd`) | Live X search in cycle; heuristic analyze (xAI planned); populates tweet feed |
| Durable history (SQLite) | Searches, leads, pauses, events; dashboard refresh on start; best-effort if DB init fails |
| CV / devprofile grounding | Not wired (hardcoded path in reactor) |
| MCP server for external agents | Planned (today: Tauri `invoke` only) |
| xAI structured decisions | Planned (stub in `finder_reactor.rs`) |

See [tauri-commands.md](./tauri-commands.md) and [agentic-architecture.md](./agentic-architecture.md).

## Optional: agent dev skills

Symlink project skills into Cursor (see root `AGENTS.md`). Load `finder-reactor`, `tauri-agentic`, and `x-agent-resources` when changing reactor, UI, or X integration.

## Arch Linux

Install system deps from [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Arch section). Bearer and sqlite paths, keyring vs file fallback, and how that relates to `invoke`: **[tauri-ipc-and-intent-engine.md](./tauri-ipc-and-intent-engine.md#arch-linux-and-minimal-desktops)**. Debug IPC in dev: **[tauri-ipc-debugging.md](./tauri-ipc-debugging.md)**.

## Troubleshooting

- **"X bearer not configured"** — Save token in credentials panel; restart app if read-back failed.
- **X API 401/403** — Regenerate bearer; check app permissions and query syntax (see `docs/x-tools.md`).
- **Keyring warnings in terminal** — Common on Arch without Secret Service; file store under `~/.local/share/collab-finder/` still holds the token (see IPC doc).

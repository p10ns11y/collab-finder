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
cd src-tauri && cargo test
```

`cargo test` covers secrets, db, reactor, and query validation (no live X token required). `package.json` does not yet define `type-check`, `lint`, or `precommit` scripts.

## X Bearer credentials

1. Create an app on the [X Developer Portal](https://developer.x.com/) and copy the **Bearer token** (app-only).
2. In the app, open **X connection** (credentials panel).
3. Paste the token and choose **Save credentials**.
4. The draft field is cleared after save; the token is **not** kept in React state. The panel calls `get_x_bearer_storage` to show active source, file path, and keyring reachability.

**Storage (Rust `src-tauri/src/secrets.rs` + `app_dirs.rs`):**

- **On save:** always writes the file fallback; keyring write is best-effort (may log and skip if Secret Service is unavailable).
- **On read:** keyring first when present, else plaintext file `~/.local/share/collab-finder/x-bearer` (mode `0600`).
- Keyring entry: service `collab-finder`, user `x-bearer`. Linux needs `keyring` crate `sync-secret-service` (see `src-tauri/Cargo.toml`).
- Search and reactor commands read the token from storage — you do not pass `bearer` on each search invoke.

**Stability note:** The bearer/keyring + dual file fallback + `get_x_bearer_storage` status surface is a known hotspot that unrelated refactors (especially anything involving "storage", DB paths, lib.rs command lists, or content policy work) have broken repeatedly. The sources contain loud STABILITY CONTRACT headers. See root AGENTS.md and docs/tauri-commands.md before touching. Always run `cargo test` + manually check the credentials panel after changes.

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

### Keyring reachable but not active (most common "it used to work" case on Linux)

This exact scenario was hit after an unrelated "X content storage policy" refactor (storing snippets + `hydrate_tweet` instead of full tweet bodies) accidentally touched credential paths:

Terminal (new observability log added for this exact problem):
```
[secrets] bearer storage status: active_source=File, keyring_reachable=true, keyring_present=false, keyring_error=None, file_present=true.
```

**Meaning**:
- The OS Secret Service (`gnome-keyring-daemon`, etc.) **is reachable** on the session D-Bus (`keyring_reachable=true`, no error).
- But there is **no entry** yet for `service="collab-finder" / user="x-bearer"` (`present=false`).
- Therefore reads fall back to the plaintext file (`active_source=File`).
- File is still there (dual-write safety net).

**Typical root causes**:
- A previous `set_x_bearer` hit a transient failure in `write_keyring` → the code intentionally did `clear_keyring()` to avoid shadowing the file (see `set_x_bearer` in `src-tauri/src/secrets.rs`).
- Daemon was in a bad state (multiple `gnome-keyring-daemon --foreground` instances, one with a typo, Cursor also using the backend, etc.).
- The entry was cleared during a buggy refactor window.

**Diagnostic commands that revealed the real state** (run in the same graphical session you launch the app from):

```bash
# Who actually owns the secrets service?
busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus GetNameOwner s org.freedesktop.secrets

# What keyring/secret processes are running?
ps aux | grep -E '[g]nome-keyring|[k]walletd|[s]ecret' | cat

# All D-Bus names related to secrets
busctl --user list | grep -iE 'secret|keyring|kwallet' | cat
```

**Fix**:
1. Get a single healthy `gnome-keyring-daemon` providing `org.freedesktop.secrets` (the main one at boot time, not the manual ones you just started). Kill stray manual foreground instances if needed.
2. In the **X connection** panel: **Disconnect** (clears both stores) then **Save credentials** again.
3. Watch for the success log:
   ```
   [secrets] bearer token also written to keyring
   ```
4. The very next status line should flip to:
   ```
   [secrets] bearer storage status: active_source=Keyring, keyring_reachable=true, keyring_present=true, keyring_error=None, file_present=true.
   ```
5. Panel will now say "Active: OS keyring (Secret Service)" and "Entry: Present...". Searches will log "bearer token loaded from keyring".

**Prevention for future work**:
- This entire credential flow (4 Tauri commands + `BearerStorageStatus` shape + dual-write + `x_bearer()` helper) is a **stability hotspot**.
- Before touching `lib.rs` command registration, `secrets.rs`, `file_store.rs`, or `app_dirs.rs`, read the giant **STABILITY CONTRACT** header at the top of `src-tauri/src/secrets.rs` (and the one in `src-tauri/src/app_dirs.rs`).
- Any `src-tauri/src/` change requires `cd src-tauri && cargo test` (not just `check`).
- See root `AGENTS.md` (bearer row + conventions) and `docs/tauri-commands.md`.

The new `[secrets] bearer storage status:...` log (plus the write success/skipped logs) was added specifically so this class of problem is trivial to diagnose in the future.

**Future refactor safety**: This flow is deliberately one of the most heavily protected areas in the codebase (loud STABILITY CONTRACT headers in the two Rust files, `app_dirs` decoupling, mandatory `cargo test` for any `src-tauri/src/` change, expanded agent instructions in root `AGENTS.md`, and now this documented troubleshooting playbook). When an agent is working on anything storage-, db-, or lib.rs-related, the instructions explicitly tell it to read the headers first.

See also:
- [tauri-ipc-debugging.md](./tauri-ipc-debugging.md) (practical workflow + logs)
- [tauri-ipc-and-intent-engine.md](./tauri-ipc-and-intent-engine.md#arch-linux-and-minimal-desktops) (Arch/Hyprland daemon setup)
- The Rust sources themselves (headers + `probe_keyring` / `resolve_active_source` / `set_x_bearer`).

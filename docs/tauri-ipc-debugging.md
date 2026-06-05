# Debugging Tauri IPC in dev

How to observe and debug `invoke` traffic between the React shell and Rust in collab-finder. There is no built-in IPC proxy (unlike HTTP mitm tools); you wrap the adapter seam or log in command handlers.

See [tauri-ipc-and-intent-engine.md](./tauri-ipc-and-intent-engine.md) for the mental model and Intent Engine. Command names: [tauri-commands.md](./tauri-commands.md).

**Agent skill (systematic triage):** [.agents/skills/tauri-ipc-debug/SKILL.md](../.agents/skills/tauri-ipc-debug/SKILL.md)

## What you are debugging

| Layer | What to log | Where |
|-------|-------------|--------|
| **Intent** | `FinderMsg` type | `src/core/finder/effects.ts`, `update.ts` |
| **IPC request** | command + JSON args | `src/adapters/tauri/safe-invoke.ts` |
| **IPC handler** | Rust entry + side effects | `src-tauri/src/lib.rs` (handlers), `commands.rs` (persist helpers), `secrets.rs`, `db.rs` |
| **External HTTP** | X API, TLS | Rust terminal only — not browser Network tab |

`invoke` uses [asynchronous message passing](https://v2.tauri.app/concept/inter-process-communication/) (JSON-serialized requests/responses), not HTTP to your app.

## 1. Rust side (works today, no code changes)

Run dev and watch the **same terminal** as `pnpm tauri dev`:

```bash
pnpm tauri dev
```

More panic detail:

```bash
RUST_BACKTRACE=1 pnpm tauri dev
```

Handlers already log with `eprintln!`:

| Prefix | Source | When |
|--------|--------|------|
| `[secrets]` | `secrets.rs`, `file_store.rs` | Bearer load/save, keyring fallback |
| `[db]` | `db.rs`, `lib.rs` | SQLite init, search/cycle persist |
| `[x]` | `lib.rs` | X rate remaining after search |

To intercept **one** command, add at the top of the handler in `lib.rs`:

```rust
eprintln!("[ipc] search_x_recent query={query:?} max={max_results:?}");
```

**Debugger:** attach to the Tauri/Rust process (VS Code / rust-analyzer) and break inside `search_x_recent`, `run_finder_cycle_cmd`, etc.

## 2. Frontend intercept (recommended seam)

All IPC goes through a single file:

```typescript
// src/adapters/tauri/safe-invoke.ts
invoke<T>(command, args) → Result<T, AppError>
```

Dev-only wrapper (do not ship verbose logs in release):

```typescript
import { invoke } from '@tauri-apps/api/core'
import { toAppError, type AppError } from '../../core/error'
import { fromPromise, type Result } from '../../core/result'

const ipcDebug = import.meta.env.DEV

export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Result<T, AppError>> {
  const t0 = performance.now()
  if (ipcDebug) console.debug('[ipc →]', command, args)

  const result = await fromPromise(invoke<T>(command, args), toAppError)

  if (ipcDebug) {
    console.debug(
      '[ipc ←]',
      command,
      result.ok ? 'ok' : result.error,
      `${(performance.now() - t0).toFixed(0)}ms`,
    )
  }
  return result
}
```

That gives **command name, args, ok/err, latency** for every Intent Engine port call.

## 3. WebView devtools

With `devUrl: http://localhost:5173` in `tauri.conf.json`, the UI is an embedded browser.

**Full guide:** [tauri-webview-and-devtools.md](./tauri-webview-and-devtools.md) — why Linux WebView looks like Safari (WebKitGTK), opening the inspector, and console `invoke` recipes (including `hydrate_tweet` manual QA).

Quick notes:

- Open **WebView inspector** (right-click → Inspect where enabled, or your desktop’s Tauri dev shortcut).
- **Console:** `[ipc →]` / `[ipc ←]` from §2; ad-hoc `window.__TAURI__.core.invoke(...)` when a command has no UI yet.
- **Network tab:** Vite HMR and any **webview** fetches only.

**Not in Network tab:** `invoke` calls. X API traffic runs in **Rust** (`reqwest` in `x_search.rs`) and appears in the **terminal**, not as browser requests to `api.x.com`.

Official: [Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/).

## 4. MVU layer (why a command fired)

Trace above IPC:

```text
User action
  → dispatch(FinderMsg)     // e.g. SearchRequested
  → updateFinder            // pure model
  → effectForMsg            // searchCmd, historyRefreshCmd, …
  → port → safeInvoke
```

Temporary dev logs:

```typescript
// effectForMsg or start of each *Cmd in effects.ts
console.debug('[intent]', msg.type)
```

Separates **user intent** from **IPC payload**.

## 5. Optional tooling (not in repo yet)

| Tool | Role |
|------|------|
| [CrabNebula DevTools](https://v2.tauri.app/develop/debug/) | Tauri plugin — IPC, events, app state |
| `tauri-plugin-log` | Route Rust logs to file or webview |
| Tauri **Events** | Fire-and-forget IPC (Rust → UI); collab-finder uses **Commands** only today |

Current `Cargo.toml` plugins: `tauri-plugin-opener` only.

## 6. Arch Linux / minimal desktop

| Symptom | Likely cause |
|---------|----------------|
| No `[db]` / `[secrets]` after UI action | Handler not reached — check `[ipc ←]` in console for early JS error |
| `invoke` hangs | Rust blocked (X HTTP, sqlite lock) — watch terminal; try `RUST_BACKTRACE=1` |
| `[secrets] keyring read failed (falling back…)` | Not IPC failure; token may still load from `~/.local/share/collab-finder/x-bearer` |
| `[secrets] bearer storage status: active_source=File, keyring_reachable=true, keyring_present=false...` | Service works but no entry yet (common after daemon hiccups or refactors). See [SETUP.md troubleshooting](./SETUP.md#keyring-reachable-but-not-active-most-common-it-used-to-work-case-on-linux) — usually just Disconnect + Save again. |
| Blank window on `tauri dev` | Missing WebKit/GTK — fix [prerequisites](https://v2.tauri.app/start/prerequisites/) before debugging IPC |

Details: [tauri-ipc-and-intent-engine.md — Arch Linux](./tauri-ipc-and-intent-engine.md#arch-linux-and-minimal-desktops).

## Practical workflow (collab-finder)

1. **Terminal:** `pnpm tauri dev` — watch `[secrets]`, `[db]`, `[x]`.
   - The new `[secrets] bearer storage status: active_source=..., keyring_reachable=..., keyring_present=..., keyring_error=...` line (emitted on every credentials panel load/refresh) is the primary diagnostic for "why is keyring not active?".
2. **WebView console:** dev logs in `safe-invoke.ts` (§2).
3. **Optional:** `[intent]` in `effects.ts` for `FinderMsg` types.
4. **Failing search:** confirm `SearchRequested` → `search_x_recent` in console, then `[x]` / `[db]` in terminal.

For the full "reachable but no entry" keyring case (very common on Arch after daemon or refactor issues), see the detailed case + commands in [SETUP.md](./SETUP.md#keyring-reachable-but-not-active-most-common-it-used-to-work-case-on-linux).

## Related code

| File | Role |
|------|------|
| `src/adapters/tauri/safe-invoke.ts` | Sole `invoke` import — add dev intercept here |
| `src/core/finder/effects.ts` | Maps `FinderMsg` → port calls |
| `src-tauri/src/lib.rs` | `#[tauri::command]` handlers |

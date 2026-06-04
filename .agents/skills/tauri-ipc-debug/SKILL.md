---
name: tauri-ipc-debug
description: Systematic Tauri IPC debugging for collab-finder — triage Intent Engine layers (MVU → safeInvoke → Rust commands → X/sqlite/keyring), follow docs/tauri-ipc-debugging.md, avoid false leads (browser Network tab, keyring noise). Use when invoke fails, search/cycle/history broken, bearer errors, tauri dev hangs, blank window, or user asks to debug Tauri/desktop shell issues.
---

# Tauri IPC Debug — collab-finder

**Mission:** Fix desktop shell issues fast by tracing **one layer at a time**. Do not patch random files until the failing layer is identified.

**Canonical doc (read first):** [docs/tauri-ipc-debugging.md](../../../docs/tauri-ipc-debugging.md)  
**Context:** [docs/tauri-ipc-and-intent-engine.md](../../../docs/tauri-ipc-and-intent-engine.md) · [docs/tauri-commands.md](../../../docs/tauri-commands.md)

Pair with `tauri-agentic` for architecture; `finder-reactor` for guard/cycle logic; `x-agent-resources` for X API 400/401 after IPC proves Rust ran.

---

## Rules (non-negotiable)

1. **`invoke` is not HTTP** — Browser Network tab will not show `search_x_recent`. X API calls appear in the **terminal** running `pnpm tauri dev`.
2. **Single IPC seam** — Only `src/adapters/tauri/safe-invoke.ts` imports `@tauri-apps/api`. Debug there before scattering `invoke` elsewhere.
3. **Bearer never on each search** — Rust reads storage in commands. "Not configured" → secrets/keyring/file, not missing invoke args.
4. **Keyring fallback ≠ IPC failure** — `[secrets] keyring read failed (falling back to file store)` is expected on Arch without Secret Service.
5. **Verify with evidence** — Quote `[ipc →/←]`, `[db]`, `[x]`, or handler `eprintln!` before claiming root cause.

---

## Triage checklist (copy and tick)

```text
IPC debug progress:
- [ ] Repro captured (user action + expected vs actual)
- [ ] Layer identified (intent | ipc-js | ipc-rust | x-http | sqlite | webview)
- [ ] Dev running: pnpm tauri dev (terminal visible)
- [ ] Console: [intent] / [ipc →] / [ipc ←] (enable safe-invoke dev logs if missing)
- [ ] Terminal: [secrets] / [db] / [x] after repro
- [ ] Fix applied at correct layer only
- [ ] Repro retried; pnpm build + cargo check if code changed
```

---

## Step 0 — Classify symptom

| Symptom | Start at step |
|---------|----------------|
| Blank window / crash on launch | **8** (WebKit/GTK) — not IPC |
| UI frozen, no error banner | **4** (hang: Rust blocked) |
| Error banner in app (AppError) | **2** (ipc-js) then **3** (rust) |
| "X bearer not configured" | **6** (secrets) |
| X API 400/401/403 in message | **7** (X + x_query) after **3** proves invoke ran |
| History empty after restart | **5** (sqlite) + HistoryRefreshRequested path |
| Wrong tweets / no results | **7** then distillation query validity |
| Works once, fails after reload | **6** then **5** |

---

## Step 1 — Intent layer (MVU)

**Question:** Did the right `FinderMsg` fire?

1. Grep `msg.type` handlers in `src/core/finder/update.ts` and `effects.ts`.
2. Add temporary `console.debug('[intent]', msg.type)` at `effectForMsg` entry (dev only).
3. Confirm UI dispatches e.g. `SearchRequested`, not only `QueryChanged`.

**If no intent log on click** → bug in view (`finder-app-view.tsx`) or `canSearch` / credentials gate (`credentials-policy.ts`, `flows.ts`). **Stop** — do not edit Rust yet.

---

## Step 2 — IPC JS layer (`safeInvoke`)

**Question:** Did `invoke` run and return?

1. Ensure dev logging in `safe-invoke.ts` (see debugging doc §2): `[ipc →] command args`, `[ipc ←] ok|err ms`.
2. Map command name to [tauri-commands.md](../../../docs/tauri-commands.md).
3. On `err`: read `AppError` message — often Rust `String` from handler.

**If `[ipc →]` without `[ipc ←]`** → hang in Rust (step 4).  
**If no `[ipc →]`** → port/effects not called (step 1).

---

## Step 3 — IPC Rust layer (command handler)

**Question:** Did the handler run?

1. Watch terminal during repro.
2. Add `eprintln!("[ipc] {command} …")` at handler start in `src-tauri/src/lib.rs` if logs absent.
3. Confirm command registered in `generate_handler!` (typo = invoke error in JS).

**If handler runs but fails** → read `Result::Err` string; branch to step 5–7 by message.

---

## Step 4 — Hang / timeout

1. `RUST_BACKTRACE=1 pnpm tauri dev`
2. Repro once; note last `[ipc →]` command.
3. Likely: `reqwest` to X (network), or sqlite lock in `db.rs`.

**Do not** add JS timeouts until Rust completion path is understood.

---

## Step 5 — SQLite (`AppDb`)

Look for `[db] init failed` (history disabled, search may still work) or `[db] … persist skipped`.

- Path: `~/.local/share/collab-finder/collab-finder.db` (Linux/XDG).
- History UI: `HistoryRefreshRequested` → `get_search_history` / `get_leads` in effects.

**If search works but history empty** → refresh msg or db init; not X API.

---

## Step 6 — Secrets / bearer

Terminal clues:

- `[secrets] bearer token loaded from file store`
- `[secrets] keyring read failed (falling back…)`

1. UI: credentials panel save → `set_x_bearer`.
2. Rust: `x_bearer()` in command before X call.
3. Arch: file fallback is normal — see IPC doc Arch section.

**If bearer present in file but "not configured"** → bug in `get_x_bearer_optional` path, not invoke transport.

---

## Step 7 — X API (after IPC confirmed)

Only after step 3 shows handler entered and called `x_search`:

1. Read error text — query validation: `src-tauri/src/x_query.rs` (reject `since:`, `min_faves:`, etc.).
2. Presets: `data/distillation/x-search/queries.json` — v2 operators only.
3. 401/403 → token or app permissions ([docs/x-tools.md](../../../docs/x-tools.md)).

**Never** “fix” IPC when the failure is invalid query string.

---

## Step 8 — WebView / system deps (no window)

Not IPC. Arch/Linux:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- `webkit2gtk`, `gtk3`, etc. — [SETUP.md](../../../docs/SETUP.md#arch-linux)

---

## Report format (when handing off or closing)

```markdown
## IPC debug result

**Symptom:** …
**Failing layer:** intent | ipc-js | ipc-rust | sqlite | secrets | x-api | webview
**Evidence:** (paste [ipc]/[db]/[secrets] lines or console snippet)
**Root cause:** one sentence
**Fix:** files changed + why
**Verify:** repro steps + `pnpm build` / `cargo check`
```

---

## Smart defaults (intelli)

| Situation | Prefer |
|-----------|--------|
| First debug pass | Run `pnpm tauri dev`, repro once, collect terminal + console |
| Unclear layer | Bottom-up: intent → safeInvoke → terminal |
| Intermittent | Log `correlationId` via `log_event`; grep `[db] recorded search_run` |
| “Search broken” after doc change | Check query validation before reactor/heuristic |
| Production build | `TAURI_DEBUG` / release has no `import.meta.env.DEV` logs — use Rust `eprintln!` |

---

## Surplus

Reusable pattern: **layer isolation** beats cross-stack guessing. Same checklist applies when MCP wraps the same Rust commands later — only the adapter changes, not the triage order.

## Related

- `tauri-agentic` — shell design, ports, MCP future
- `finder-reactor` — cycle, guards, `guarded_search`
- `agent-orchestrator` — escalate to full brief if fix spans >3 layers or unknowns stack

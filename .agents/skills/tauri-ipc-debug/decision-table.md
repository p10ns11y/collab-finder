# IPC debug — quick decision table

Use with [SKILL.md](./SKILL.md). Full steps: [docs/tauri-ipc-debugging.md](../../../docs/tauri-ipc-debugging.md).

| Evidence | Layer | Next action |
|----------|-------|-------------|
| No UI reaction on button | Intent / view | `dispatch`? `canSearch`? credentials gate |
| `[intent]` but no `[ipc →]` | Effects / ports | `effectForMsg` branch for that msg |
| `[ipc →]` err immediately | IPC JS / Rust registration | command name, `generate_handler!`, serde args |
| `[ipc →]` no `[ipc ←]`, terminal silent | Rust hang | `RUST_BACKTRACE=1`, break in handler |
| `[ipc ←] err` + bearer message | Secrets | file `~/.local/share/collab-finder/x-bearer`, keyring fallback |
| `[secrets] bearer storage status: ... reachable=true, present=false` | Secrets (backend ok, just no stored entry) | Detailed diagnosis + "Disconnect then Save" fix in [SETUP.md](../../../docs/SETUP.md#keyring-reachable-but-not-active-most-common-it-used-to-work-case-on-linux) |
| `[ipc ←] err` + query/operator text | x_query + distillation | fix query string, not MVU |
| `[ipc ←] ok`, empty tweets | X API / query fit | terminal `[x]`, query content |
| `[ipc ←] ok`, history UI empty | sqlite + HistoryRefresh | `[db] init`, `HistoryRefreshRequested` |
| keyring fallback log only | — (healthy on Arch) | continue repro |
| crash before window | WebKit/GTK | prerequisites, not invoke |

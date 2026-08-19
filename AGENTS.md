# Agent instructions — collab-finder

Tauri desktop app (Rust + React) for high-fit jobs, collabs, and community opportunities on X, with xAI analysis and guarded CV/prep flows. Autonomy with **self-guards, pauses, and explicit approval gates**.

**Session SoT:** `~/life-os/Projects/collab-finder/README.md` — read `next_action` before coding; update energy / next_action / review_date when the session ends. If the user says "update what we are going to do in this session", edit that note first.

**How (on demand, not sticky):** [docs/agent-playbook.md](docs/agent-playbook.md) · [docs/agentic-architecture.md](docs/agentic-architecture.md) · [.agents/README.md](.agents/README.md)

Ignore global Thepulimaangani (poem/metre) naming here. Use **opportunity, reactor, guard, pack** vocabulary.

## Verify (commands that exist)

| Change | Command |
|--------|---------|
| TS/TSX | `pnpm type-check` (`tsc -b`) |
| Domain TS machines | `pnpm verify` |
| Any edit under `src-tauri/src/` | `cd src-tauri && cargo test` |
| Full CI parity | `pnpm gate` |
| `package.json` / lockfile | `pnpm install` then `pnpm audit` |

There is **no** `pnpm lint` or `pnpm precommit`. Rust format: `cargo fmt` + `cargo clippy`.

Hotspots (`secrets.rs` / `app_dirs.rs` **STABILITY CONTRACT**): grep headers before touching bearer/keyring. After those edits, `cargo test` plus a manual credentials-panel check.

## Secrets

**NEVER** `secret-tool search/lookup`, `cat` of `x-bearer`/`xai-key`, or log raw tokens. Status metadata only. Rotate if a transcript may have dumped a key. Full policy: [docs/secrets-agent-safety.md](docs/secrets-agent-safety.md).

## Routing (load skill only when the task matches)

| Working on | Read |
|------------|------|
| X API, queries, xAI prompts | `.agents/x-resources/README.md` → `skill.md` → `x-agent-resources` |
| Finder reactor / guards | `finder-reactor` (+ x-resources if X is involved) |
| Tauri IPC / `invoke` / history DB | `tauri-agentic` → [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) |
| Bearer / xAI key storage | [docs/SETUP.md](docs/SETUP.md) + `secrets.rs` STABILITY CONTRACT |
| CV promote | `cv-promote-guard` |
| Loops / multi-model | `looper` |
| Setup / run | [docs/SETUP.md](docs/SETUP.md) |

## Triage

- **Single-shot** (≤2 files, obvious): implement + smallest verify row above.
- **Light**: 3–5 bullets, then implement.
- **Full** / vague / multi-agent: `agent-orchestrator`.
- Fusion surplus: only when the user says **"use fusion"** or **"ignite"**.

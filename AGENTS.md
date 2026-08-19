# Agent instructions — collab-finder

> **Load rule:** Sticky router only. Expand [docs/agent-playbook.md](docs/agent-playbook.md) **only if** routing or conventions are ambiguous.

```text
App ≔ Tauri desktop · Rust backend · React shell · xAI + X opportunity reactor
Autonomy ≔ self-guards · pauses · explicit approval gates
SessionSoT ≔ ~/life-os/Projects/collab-finder/README.md  // next_action before code
Vocab ≔ opportunity · reactor · guard · pack  // ¬ global Thepulimaangani poem/metre naming

VerifySoT:
  TS/TSX        → pnpm type-check     // tsc -b
  domain TS     → pnpm verify
  src-tauri/src → cd src-tauri && cargo test
  CI parity     → pnpm gate
  deps/lockfile → pnpm install; pnpm audit
  ¬ pnpm lint · ¬ pnpm precommit
  Rust fmt      → cargo fmt; cargo clippy

Hotspot ≔ secrets.rs · app_dirs.rs STABILITY CONTRACT  // grep before bearer/keyring edits
```

**Session:** read `SessionSoT` `next_action` before coding; update energy / next_action / review_date when done. User says "update what we are going to do in this session" → edit life-os note **first**.

**Secrets:** **NEVER** `secret-tool search/lookup`, `cat` x-bearer/xai-key, log raw tokens. Metadata only. [docs/secrets-agent-safety.md](docs/secrets-agent-safety.md).

## Routing (load on match only)

| Task | Read |
|------|------|
| X API · queries · xAI prompts | `.agents/x-resources/README.md` → `skill.md` → `x-agent-resources` |
| Reactor · guards | `finder-reactor` (+ x-resources if X) |
| Tauri IPC · invoke · DB | `tauri-agentic` → [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) |
| Bearer · xAI storage | [docs/SETUP.md](docs/SETUP.md) + `secrets.rs` STABILITY CONTRACT |
| CV promote | `cv-promote-guard` |
| Multi-step loop · routing · thrash | `control-graph` (legacy: `looper` redirects) |
| Setup · run | [docs/SETUP.md](docs/SETUP.md) |

## Triage

| Mode | When |
|------|------|
| **single_shot** | ≤2 files · obvious → smallest VerifySoT row |
| **light** | 3–5 bullets then implement |
| **full** | vague · multi-agent → `agent-orchestrator` |
| **fusion** | user says **ignite** or **use fusion** only |

Deep: [docs/agent-playbook.md](docs/agent-playbook.md) · [docs/agentic-architecture.md](docs/agentic-architecture.md) · [.agents/README.md](.agents/README.md)

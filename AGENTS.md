# Agent instructions — collab-finder

**Owner:** Kanithanj Desk  
**Product:** **kanithanj.ai** — Tauri desktop hunt reactor (high-fit roles, application packs, SQLite history).

> **Load rule:** Sticky router only. Expand [docs/agent-playbook.md](docs/agent-playbook.md) **only if** routing or conventions are ambiguous.

```text
App ≔ Tauri desktop · Rust backend · React shell · xAI + X opportunity reactor
Autonomy ≔ self-guards · pauses · explicit approval gates
SessionSoT ≔ ~/life-os/Projects/collab-finder/README.md  // next_action before code
Navigating ≔ kanithanj.ai sidebar screen (id heading) — cash-path cockpit; ¬ generic “navigation docs”
Vocab ≔ opportunity · reactor · guard · pack  // ¬ global Thepulimaangani poem/metre naming
Names ≔ architecture-synthesis (canonical fusion) · fusion-sage (legacy alias; both dirs in repo) · context-ignite (workflow chain, not a rename)

RuntimeSoT ≔ ~/.local/share/collab-finder/   // operator disk — agents read metadata only
  collab-finder.db · application_packs/ · x-bearer · xai-key · mission_firms_cache/ · …

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

## Hard nos

- **No operator data mutation** — do not edit, seed, delete, or migrate `~/.local/share/collab-finder` DB, `application_packs/`, or on-disk secrets in agent sessions (structure/docs PRs stay in-repo only).
- **No secret dumps** — see [docs/secrets-agent-safety.md](docs/secrets-agent-safety.md); IPC status metadata only.
- **No force-push** · **no dependency upgrades** unless the task requires it · **no CI workflow burn** on other orgs/repos.
- **No phantom verify** — `pnpm lint` and `pnpm precommit` are not project scripts.
- **No unrelated hiring-product behavior** when the task is agentic layout / docs / structure only.

## Skills wiring (`.cursor` → library)

Canonical skills and rules live under **`.agents/`** (committed). **`.cursor/` is local-only** (gitignored) — recreate per machine:

```bash
ln -sfn ../.agents/rules .cursor/rules
ln -sfn ../.agents/skills .cursor/skills
```

Portable catalog: [skills.sh/p10ns11y/skills](https://www.skills.sh/p10ns11y/skills) · lock: [skills-lock.json](skills-lock.json) · restore: `npx skills experimental_install` · sync: `./scripts/sync-agent-skills.sh --lock`. Deep wiring: [.agents/README.md](.agents/README.md) · [docs/agent-playbook.md](docs/agent-playbook.md).

## Routing (load on match only)

| Task | Read |
|------|------|
| X API · queries · xAI prompts | `.agents/x-resources/README.md` → `skill.md` → `x-agent-resources` |
| Reactor · guards | `finder-reactor` (+ x-resources if X) |
| Tauri IPC · invoke · DB | `tauri-agentic` → [docs/tauri-ipc-debugging.md](docs/tauri-ipc-debugging.md) |
| Bearer · xAI storage | [docs/SETUP.md](docs/SETUP.md) + `secrets.rs` STABILITY CONTRACT |
| CV promote | `cv-promote-guard` |
| Multi-step loop · routing · thrash | `control-graph` (legacy: `looper`) |
| Architecture / surplus | `architecture-synthesis` (**ignite** / **use fusion**; legacy: `fusion-sage`) |
| Setup · run | [docs/SETUP.md](docs/SETUP.md) |
| Prove Gate · PR verification · VerifySoT map | `verify-collab-finder` |

## Triage

| Mode | When |
|------|------|
| **single_shot** | ≤2 files · obvious → smallest VerifySoT row |
| **light** | 3–5 bullets then implement |
| **full** | vague · multi-agent → `agent-orchestrator` |
| **fusion** | user says **ignite** or **use fusion** → `architecture-synthesis` |

Deep: [docs/agent-session-context.md](docs/agent-session-context.md) · [docs/agent-playbook.md](docs/agent-playbook.md) · [skills-lock.json](skills-lock.json) · [.agents/README.md](.agents/README.md)

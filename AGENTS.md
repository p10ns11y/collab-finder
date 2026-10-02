# Agent instructions — collab-finder

**Owner:** Kanithanj Desk  
**Product:** **kanithanj.ai** — Tauri desktop hunt reactor (high-fit roles, application packs, SQLite history).

> **Load rule:** Sticky router only. Expand [docs/agent-playbook.md](docs/agent-playbook.md) **only if** routing or conventions are ambiguous.

```text
App ≔ Tauri desktop · Rust backend · React shell · xAI + X opportunity reactor
Autonomy ≔ self-guards · pauses · explicit approval gates
SessionSoT ≔ session-sot.local  // gitignored pointer; next_action before code
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

**Session:** resolve `session-sot.local`, read `next_action` before coding; update energy / next_action / review_date when done. User says "update what we are going to do in this session" → edit the operator session card **first**. Do not guess a vault path.

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

## Working agreement for coding agents

Inspired by NVIDIA's TensorRT Model Connect agent guide (https://nvidia.github.io/TensorRT-Model-Connect/agent-guide).

### Before you act
- Read the AGENTS.md closest to the files you are changing; it wins over this block.
- Check the branch, `git status`, remotes, and any uncommitted changes. Changes you did not make belong to the user: leave them alone.
- Use **VerifySoT** (above) and the repo's real config, scripts, and manifests. Do not guess commands or versions.
- An empty skill list does not mean no skill covers the task. See **Skills wiring** and look for SKILL.md files directly.

### Workflow
1. Read the instructions.
2. Inspect the current state.
3. Make the smallest change that solves the task.
4. Run the smallest check that proves it (see VerifySoT).
5. Report (format below).
6. Wait for approval before anything external or destructive.

### Report format
- **Read only:** what you confirmed by reading code or docs, without running anything.
- **Ran locally:** the exact commands and what they printed.
- **Tests and CI:** which suites or CI jobs ran, and their results.
- **Not run:** every relevant check you skipped, and why. Always include this list, even if it is "none".

### Never
- Weaken a test, tolerance, assertion, or CI check just to make it pass. Fix the cause or report the failure.
- Put credentials, tokens, private URLs, real host names, usernames, home paths, or personal data in commits, PRs, issues, or any other public output — see **Secrets** and **Hard nos** above; use aliases such as `laptop-1`.
- Swap a pinned version, model, or dependency for one that is "close enough" — see **Hard nos** (no dependency upgrades unless the task requires it).

### Stop and ask first
- Before you delete, overwrite, reset, rebase, merge, publish, or deploy, or do anything outside the scope you were given (force-push is covered under **Hard nos**).
- On a conflict, show it concretely (files, lines, both versions) and ask. Do not pick a side silently.

### Code style
- Near-zero comments. Make the code explain itself through names and structure.
- Subtract first: remove before you add, and keep new seams small enough to delete later.
- Do not rewrite working code you were not asked to touch.
- Write in ordinary English: no internal slang or code words, and don't use vague words like "gate" when "check", "filter", or "precondition" says it better.

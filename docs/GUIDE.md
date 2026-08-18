# collab-finder — usage guide

Desktop app for hunting high-fit roles, preparing application packs, and tracking history. You step in when **guards** fire (fit, cost, rate, CV promote) — not on every step.

Planning and session notes: [life-os](https://github.com/p10ns11y/life-os) → `Projects/collab-finder`. Agent how-to: [AGENTS.md](../AGENTS.md).

---

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js** | LTS |
| **pnpm** | `corepack enable` or install globally |
| **Rust** | Stable + `cargo` |
| **Tauri v2** | Linux: GTK/WebKit, `libsecret`. [Prerequisites](https://v2.tauri.app/start/prerequisites/) |

Arch, credentials, troubleshooting: [SETUP.md](./SETUP.md).

---

## Install and run

```bash
pnpm install
pnpm tauri dev
```

**Arch / Omarchy:** crate name stays `collab-finder`; the PATH binary is **`kanithanj.ai`**.

```bash
pnpm install:local   # build + install to ~/.local/bin/kanithanj.ai
```

**GitHub Release:** push a semver tag (`v0.2.0`). CI attaches `kanithanj.ai-linux-x86_64`. Helper: `scripts/cut-release.sh 0.2.0 --push`. See [release.md](./release.md). Do not reuse integer tags like `v2`.

---

## Navigation

Sidebar screens (Meta+1 … Meta+8):

| # | Screen | Role |
|---|--------|------|
| 1 | **Navigating** | Cash-path cockpit (mission-map JSON + contacts) |
| 2 | **Discover** | Opportunity rail, hire-board skim, Quick Target |
| 3 | **Mission** | Career-board hunt (SpaceXAI / Tesla / Nordic–EU) |
| 4 | **Sweden** | Platsbanken via JobTech API |
| 5 | **Xplore** | Live X search + autonomous cycle |
| 6 | **Network** | Local LinkedIn graph (PII stays on disk) |
| 7 | **Settings** | X bearer + xAI API key only |
| 8 | **Preferences** | Fit mode, rank packs, CV maker, references |

Palette: **⌘K / Ctrl+K**. Quest: header control (threads persist in SQLite).

Cluster law (sibling apps): `ensembly/docs/SATELLITE-CLUSTER.md`.

---

## First-run checklist

### 1. Settings (secrets)

1. **X connection** — Bearer token → **Save**. Keyring + file fallback. Status: `get_x_bearer_storage`.
2. **xAI API key** — Required for **Evaluate fit** and **Prepare**. Same storage pattern.

### 2. Preferences (grounding + rank)

1. **Install kanithanj.cv** — Co-located apply-CV PDF maker (`~/.local/bin/kanithanj.cv`). One-time; links `cvdata.json` from devprofile path if set.
2. **devprofile path** (optional) — Source for pruned CV packet when Discover textarea is empty. Never auto-writes master CV.
3. **Rank packs / fit mode** — See [config.md](./config.md) for `~/.config/collab-finder/rank.json` + `packs/`.

Operator identity seed (first machine): `scripts/seed-operator-config.sh`.

### 3. CV packet (no LLM)

Quick Target sends a **CV packet** to xAI. Resolved locally, in order:

1. Discover textarea (if filled)
2. devprofile path → pruned `cvdata.json`
3. kanithanj.cv install → same prune
4. Operator pack fallback → `~/.config/collab-finder/packs/cv-packet.txt`

Configure grounding **before** the xAI key; Analyze/Prep need the key.

---

## Hunt → prepare → apply

| Screen | Job |
|--------|-----|
| **Discover** | Rail, hire-board skim, Quick Target (URL or pasted JD) |
| **Mission** | Career-board import → Evaluate |
| **Sweden** | JobTech search → Evaluate (skips Platsbanken cookie wall) |
| **Xplore** | Live X + `guarded_search` cycle |
| **Network** | Graph import / enrich (local only) |

**Quick Target loop:** paste URL or JD → **Evaluate fit** (xAI) → **Prepare** → **Generate apply CV** (PDF, local) → **Artifacts** → **Applied**.

- Platsbanken URLs load the ad from JobTech, not HTML.
- A JobTech JD body is not a URL even if it contains a Platsbanken link.
- Click a rail row to restore fit + prep from SQLite (no new xAI call).
- Packs: `~/.local/share/collab-finder/application_packs/`.

---

## Verify

```bash
pnpm run gate          # build + 16 domain verify runners + cargo test --lib
pnpm run verify        # domain verify only
pnpm run complexity    # Lizard CCN gate (threshold 15)
```

CI details: [ci.md](./ci.md).

---

## Architecture (map)

| Layer | Location |
|-------|----------|
| MVU UI | `src/core/finder/`, `src/view/`, `src/components/finder/` |
| Screens | `src/view/screens/`, `src/components/layout/sidebar-nav.tsx` |
| Tauri bridge | `src/adapters/tauri/`, `src/ports/` |
| X + secrets | `src-tauri/src/lib.rs`, `secrets.rs`, `app_dirs.rs` |
| Target / packs / apply CV | `src-tauri/src/opportunity_target.rs`, `cv_home.rs` |
| Rank / operator pack | `rank_config.rs`, `operator_pack.rs` |
| Platsbanken / JobTech | `src-tauri/src/platsbanken.rs` |
| SQLite | `src-tauri/src/db.rs` |
| Reactor | `src-tauri/src/finder_reactor.rs` |

Invoke inventory: [tauri-commands.md](./tauri-commands.md). MCP planned; today `invoke` only.

Full system map: [agentic-architecture.md](./agentic-architecture.md).

---

## Documentation index

| Doc | Purpose |
|-----|---------|
| [SETUP.md](./SETUP.md) | Install, credentials, troubleshooting |
| [config.md](./config.md) | Rank JSON + operator packs |
| [mission-flow-relevance.md](./mission-flow-relevance.md) | Mission Pull / Next 10 / Evaluate lanes, persistence, CV packet |
| [mission-flow-coming-next.md](../reports/mission-flow-coming-next.md) | Spacemap audit: scorecard, SN-* cards, sprint order |
| [ci.md](./ci.md) | Gate, complexity, CRAP report |
| [release.md](./release.md) | Tag-driven GitHub releases |
| [quest-flows.md](./quest-flows.md) | Quest chips + example prompts |
| [tauri-commands.md](./tauri-commands.md) | `invoke` handlers |
| [tauri-ipc-debugging.md](./tauri-ipc-debugging.md) | IPC failures in dev |
| [secrets-agent-safety.md](./secrets-agent-safety.md) | Never dump keys |
| [x-tools.md](./x-tools.md) | Official X agent resources |
| [PRODUCT.md](../PRODUCT.md) / [DESIGN.md](../DESIGN.md) | Product + visual system |
| [data/distillation/README.md](../data/distillation/README.md) | Presets and analyze prompts |
| [.agents/x-resources/README.md](../.agents/x-resources/README.md) | Vendored X skill.md / llms |

---

## Agents

- **[AGENTS.md](../AGENTS.md)** — skills, triage, conventions
- **`.agents/skills/`** — finder-reactor, tauri-agentic, cv-promote-guard, x-agent-resources

---

## X content policy

Official X API only. SQLite stores **IDs**, status URLs, and **280-character snippets** — not full bodies. Full text via `hydrate_tweet` on demand. `collab-finder.db` is never committed.

See [x-content-storage-distributin-policy.md](./x-content-storage-distributin-policy.md).

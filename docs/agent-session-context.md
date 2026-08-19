# Agent session context — collab-finder

> **Load rule:** Read once when onboarding or debugging “why did the agent do X?” On-demand — not sticky every turn.

A typical Cursor/Grok session stacks **many layers**. They are not interchangeable: each layer has a different job, cost, and trigger.

```text
// Context stack (bottom = widest reach, top = narrowest / latest)
L0  Host system prompt        // mode, tools, citation rules, safety
L1  Global user rules          // ~/.cursor user settings, CLAUDE.md, hooks
L2  Global always-on rules     // HODA, north-star, CLT DualLoad, naming (filter per project)
L3  Project always-on rules    // .agents/rules/*.mdc (dev-loop, agent-workflow, secrets)
L4  Project router             // AGENTS.md (VerifySoT, routing, triage)
L5  Skills catalog             // name + description index every turn (not full SKILL.md)
L6  Skill bodies               // Read / match / slash / @ — on demand
L7  Plugins + MCP              // agenc, Vercel, calendar, … tool schemas when enabled
L8  Slash commands             // .cursor/commands, /session-start, /gate, /eva
L9  @ attachments              // files, life-os note, folders
L10 Conversation history        // prior turns in this chat
L11 User message                // current turn
```

## Layer guide

| Layer | Source | Sticky? | Role |
|-------|--------|---------|------|
| **L0–L1** | Cursor / IDE / your global settings | Every turn | How the agent uses tools, commits, communicates |
| **L2** | `~/.cursor/rules/` | Every turn (unless scoped off) | Portfolio habits — **may not fit this repo** (e.g. poem naming) |
| **L3** | `.agents/rules/` → `.cursor/rules` | Every turn | Project process: dev-loop, triage, secrets |
| **L4** | `AGENTS.md` | Every turn | Short router: VerifySoT, domain routing, life-os pointer |
| **L5** | Skill index | Every turn | Discovery blurbs — **token cost scales with plugin count** |
| **L6** | `.agents/skills/*/SKILL.md` | On match / Read / slash | Formal SoT for a concern (orchestrator, reactor, control-graph) |
| **L7** | MCP servers, Cursor plugins | When enabled | External tools (marketplace, calendar, …) |
| **L8** | `.agents/commands/` | When invoked | One-shot procedure injection |
| **L9** | User @ | That turn (+ thread if cited) | Session SoT, specs, files |
| **L10–L11** | Chat | Cumulative | Task + prior tool results |

**Deep how-to (not sticky):** [agent-playbook.md](./agent-playbook.md) · [agentic-architecture.md](./agentic-architecture.md)

## Project vs library skills

```text
Locked (skills-lock.json)  ≔ portable pack from p10ns11y/skills — copied into .agents/skills/
In-repo only               ≔ cv-promote-guard, tauri-ipc-debug, x-agent-resources, workflows, …
Overlays                   ≔ .agents/overlays/*.md — project tweaks; not in lockfile
```

| Kind | Examples | Sync |
|------|----------|------|
| **Locked portable** | agent-orchestrator, control-graph, ai-optimization, architecture-synthesis, … | `skills-lock.json` + `npx skills experimental_install` |
| **Project-born** | cv-promote-guard, x-agent-resources, explore-then-edit, CV pack skills | git only |
| **Workflows** | context-ignite (library) = ai-optimization → architecture-synthesis | Grok `/workflow` or manual chain |

**Names:** `architecture-synthesis` = canonical fusion skill. `fusion-sage` = legacy alias. `context-ignite` = **workflow**, not a rename.

## Sync (two paths)

### A — Lockfile restore (teammates / CI / cold clone)

Catalog: [skills.sh/p10ns11y/skills](https://www.skills.sh/p10ns11y/skills)

```bash
# From repo root — restores pinned hashes from skills-lock.json
npx skills experimental_install
```

Commit **`skills-lock.json`**. Locked trees live under `.agents/skills/<name>/` as **copies** (no machine-local absolute symlinks).

### B — Local dev (fast, same machine as library checkout)

When `~/Work/personal/skills` is current:

```bash
./scripts/sync-agent-skills.sh --pull
# or explicitly:
SKILLS_ROOT=~/Work/personal/skills \
  "$SKILLS_ROOT/master-planner/scripts/pull-skills.sh" \
  --project "$(pwd)" --pack agentic-desktop
```

`pull-skills.sh` **symlinks** from local library; it **skips** in-repo directories. Use after adding project-born skills or when you prefer symlinks over copies.

### C — Refresh lockfile after library bump

```bash
./scripts/sync-agent-skills.sh --lock
# runs npx skills add … --copy and updates skills-lock.json
```

Run when upstream `p10ns11y/skills` changes and you want teammates on the same hashes.

## Verify overlay (locked skills)

Portable skills default to generic `type-check` + `lint`. **This repo:**

See [.agents/overlays/collab-finder-verify.md](../.agents/overlays/collab-finder-verify.md) and `AGENTS.md` **VerifySoT** — no `pnpm lint` / `pnpm precommit`.

## Typical session flow

```text
1. User opens chat (L0–L5 already loaded)
2. /session-start  OR  @ life-os README     → L8/L9 session scope
3. Agent triages (agent-workflow / AGENTS)    → L3–L4
4. Task matches domain                        → Read skill L6 (e.g. finder-reactor)
5. Multi-step / thrash risk                   → control-graph + Card
6. Architecture / surplus                     → architecture-synthesis (ignite)
7. Cold huge repo                             → context-ignite workflow chain
8. Edit + dev-loop verify                     → pnpm type-check / verify / cargo test
9. /gate before push                          → full CI parity
```

## Wiring checklist

```bash
ln -sfn ../.agents/rules .cursor/rules
ln -sfn ../.agents/skills .cursor/skills
mkdir -p .cursor/commands
ln -sfn ../../.agents/commands/session-start.md .cursor/commands/session-start.md
ln -sfn ../../.agents/commands/gate.md .cursor/commands/gate.md
```

## Reduce waste

| Problem | Fix |
|---------|-----|
| Global rules wrong for this repo | Disable or scope in Cursor settings |
| Plugin skill catalog bloat | Disable unused plugin packs (e.g. Vercel when not on Next) |
| Duplicate global + project skills | Prefer lockfile or symlinks; don’t vendor portable copies by hand |
| Stale locked skills | `./scripts/sync-agent-skills.sh --lock` + commit lockfile |
| Life-os SoT missing | `@~/life-os/Projects/collab-finder/README.md` or `/session-start` |

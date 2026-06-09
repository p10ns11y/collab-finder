# X agent resources (downstream snapshots)

Official X documentation for agents — **vendored in-repo** for offline use, reproducible prompts, and fast Cursor starts. **Upstream URLs are always authoritative** when behavior drifts; refresh snapshots after API/doc changes.

Canonical hub for agents: read this file **before** editing X search, queries, or xAI prompts.

## Upstream (source of truth)

| Asset | URL | Role |
|-------|-----|------|
| **skill.md** | https://docs.x.com/skill.md | Capability contract: actions, params, constraints, workflows, gotchas |
| **llms.txt** | https://docs.x.com/llms.txt | Doc index — use to pick which `.md` page to fetch next |
| **llms-full.txt** | https://docs.x.com/llms-full.txt | Full doc bundle (large; use sparingly in prompts) |
| **AI tools overview** | https://docs.x.com/tools/ai.md | MCP, xurl, integration patterns |
| **Search operators** | https://docs.x.com/x-api/posts/search/integrate/operators | Required for query strings (also enforced in `x_query.rs`) |

## Downstream (this directory)

| File | Purpose | Refresh often? |
|------|---------|----------------|
| [skill.md](./skill.md) | Snapshot for prompts + reactor context | **Yes** — when X changes capabilities or you see 400/undocumented behavior |
| [llms.txt](./llms.txt) | Snapshot of doc navigation | **Yes** — when adding new API areas or MCP links break |
| `llms-full.txt` | Not vendored yet (optional; large) | On demand only |

**Not stored here:** app-specific presets and curation → [data/distillation/](../../data/distillation/README.md).

## Agent read order (X-related work)

1. **This README** — snapshot vs live, refresh policy.
2. **[.agents/x-resources/skill.md](./skill.md)** — ground behavior; do not invent operators or endpoints.
3. **[.agents/skills/x-agent-resources/SKILL.md](../skills/x-agent-resources/SKILL.md)** — how collab-finder integrates MCP, xurl, reactor, guards.
4. **[data/distillation/x-search/operators.md](../../data/distillation/x-search/operators.md)** + [queries.json](../../data/distillation/x-search/queries.json) — *our* qualified presets (must stay consistent with skill + operators doc).
5. **Live page** — if snapshot disagrees with API: fetch the relevant `https://docs.x.com/....md` URL from `llms.txt`, then update vendored files in the same PR.

For **Tauri IPC / invoke**, not X docs: [docs/tauri-ipc-debugging.md](../../docs/tauri-ipc-debugging.md).

## Refresh downstream snapshots

From **repo root**:

```bash
curl -fsSL https://docs.x.com/skill.md -o .agents/x-resources/skill.md
curl -fsSL https://docs.x.com/llms.txt -o .agents/x-resources/llms.txt
# Optional (large):
# curl -fsSL https://docs.x.com/llms-full.txt -o .agents/x-resources/llms-full.txt
```

Or:

```bash
./.agents/x-resources/refresh.sh
```

**When to refresh**

- Before a milestone touching X search, xAI analyze, or MCP/XMCP.
- After X API 400s that smell like doc drift (new/removed operators).
- Quarterly or when [llms.txt](https://docs.x.com/llms.txt) navigation changes materially.

**After refresh:** run `pnpm build` / `cargo check` if queries or validation changed; commit snapshot + note in PR body (“refreshed X skill/llms from upstream”).

## How this relates to other layers

```text
Upstream (docs.x.com)     →  .agents/x-resources/     →  agents & prompts
                         →  data/distillation/       →  UI presets + curation
                         →  src-tauri/x_query.rs     →  hard reject bad operators
                         →  src-tauri/x_search.rs    →  live HTTP
```

- **skill.md** = what X allows agents to do.
- **distillation** = what *you* want to find (SpaceXAI, Stockholm, etc.).
- **Never** replace skill.md with distillation alone.

## App runtime (today)

`finder_reactor.rs` may load `skill.md` from a dev-relative path — production should use app-data cache filled from the same snapshots (see `x-agent-resources` skill). Prompts: [data/distillation/prompts/xai-analyze-opportunity.md](../../data/distillation/prompts/xai-analyze-opportunity.md).

## Related

- [docs/x-tools.md](../../docs/x-tools.md) — XMCP, xurl, discovery links
- [AGENTS.md](../../AGENTS.md) — agent routing table
- Root [SKILL.md](../../SKILL.md) — collab-finder as an agent skill (separate from X’s skill.md)

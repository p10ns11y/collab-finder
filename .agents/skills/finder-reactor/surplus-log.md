# Finder Reactor Surplus Log

## 2026-06 (durable history + dedup dashboard)

**Change**: Full SQLite layer (rusqlite, WAL, FTS5, versioned migrations, best-effort, disabled fallback) + persistence on every search/cycle/pause/promote/event + dedup strategy (tweet PK + lead UNIQUE + seen_count++ on re-surface) + MVU history slice + HistoryDashboard (stats, unique leads with seen badges, search reuse, FTS lookup) integrated exactly into existing Guard/Pause/Tweet patterns.

**Q value**: ~2.1 (high because history was the #1 "data loss" complaint and enables all future self-improvement loops + MCP queries + "what worked" analysis).

**Concrete wins this enables**:
- Searches/cycles no longer ephemeral: restart app, full history + leads + pauses still there.
- Duplicate posts (very common on X hiring) no longer spam the dashboard — clean unique leads list + "seen N" signal (tells you a query is high-signal if it resurfaces the same post).
- FTS + SQL filters = instant "find that one rust agent collab post from last week".
- Audit trail for surplus generator: can now query past decisions, guard triggers, re-seen rates to propose better presets/guards.
- Future autonomous scans can write to same DB without UI.

**Saved future effort**: No need for ad-hoc JSON appends or "log to file" hacks; one robust store serves UI dashboard, reactor, MCP, surplus, debugging.

**Follow-up compounds**:
- Add "export history" or "prune old" guarded action.
- In surplus after cycles: auto-analyze recent leads for "new high-fit pattern" and suggest preset.
- Wire rate_snapshots into GuardDashboard sparkline.
- Background daily scan (using same DB + reactor) that only notifies on new unique high-score leads.

(Tracked per finder-reactor/SKILL.md + AGENTS.md surplus rule.)

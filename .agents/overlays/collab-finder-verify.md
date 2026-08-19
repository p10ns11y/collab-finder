# collab-finder — verify overlay

> **Load rule:** Apply when any **locked portable skill** (agent-orchestrator, git-worktrees, fix-dependency-security, …) mentions `pnpm lint`, `pnpm precommit`, or generic `type-check` + `lint` without project context. **SoT:** root [AGENTS.md](../../AGENTS.md).

```text
VerifySoT (collab-finder):
  TS/TSX        → pnpm type-check          // tsc -b
  domain TS     → pnpm verify
  src-tauri/src → cd src-tauri && cargo test
  CI parity     → pnpm gate
  deps/lockfile → pnpm install --frozen-lockfile; pnpm audit

¬ pnpm lint · ¬ pnpm precommit
```

Orchestrator briefs and worker handback must cite these commands, not devprofile/Biome defaults.

# Task brief — `<slug>`

> Orchestrator fills this before delegating. Worker returns with commit + verification log.

## Meta

| Field | Value |
|-------|--------|
| **Task ID** | `<slug>` |
| **Worker** | `cursor` / `hermes` / `grok-build` / … |
| **Workspace** | branch `agent/<tool>/<slug>` · path `.worktrees/<tool>-<slug>` |
| **Base ref** | `<branch>` @ `<short-sha>` |
| **Wave** | spike / foundation / feature / hygiene |

## Problem

Why this work exists (symptom, ticket, tech debt). One short paragraph.

## Outcome (definition of done)

Observable results when correct — bullet list. Example:

- [ ] `document-viewer.tsx` loads PDF via `next/dynamic` + Suspense
- [ ] No module-scope `require("react-pdf")` in parent file
- [ ] `pnpm type-check` (and `pnpm verify` / `cargo test` per [AGENTS.md](../../../AGENTS.md)) pass in worktree

## Non-goals

- …
- No dependency upgrades
- No unrelated refactors

## Standards (read before coding)

- [ ] Repo agent docs (`AGENTS.md` or README verification section)
- [ ] Applicable skill `SKILL.md` files — _list paths_

## Files

| May touch | Must not touch |
|-----------|----------------|
| `src/...` | `package.json` (unless brief says) |

## Verification (orchestrator runs these — worker runs first)

```bash
cd <worktree-path>
pnpm install --frozen-lockfile   # if needed
pnpm type-check
pnpm verify                        # domain machines
# cd src-tauri && cargo test       # if Rust touched
# pnpm gate                        # full CI parity
```

See [.agents/overlays/collab-finder-verify.md](../../../overlays/collab-finder-verify.md).

## Worker handback

When claiming done, provide:

1. Commit SHA on `agent/<tool>/<slug>`
2. Commands run + exit codes
3. Two-sentence summary of approach
4. Known limitations / follow-ups

**Orchestrator will re-run verification before merge.**

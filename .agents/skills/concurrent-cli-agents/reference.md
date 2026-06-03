# Concurrent CLI agents — reference

## CLI quick reference

| Tool | Concurrent isolation | Non-interactive | Reads AGENTS.md / skills |
|------|---------------------|-----------------|--------------------------|
| **Hermes** | `hermes -w` / `--worktree`, manual `git worktree` | query flags per CLI version | yes (project docs) |
| **Grok Build** | subagents + worktrees | `grok -p "…"` | yes |
| **OpenClaw** | per-agent workspace in gateway config | `openclaw agent --message` | skills + workspace |
| **Claude Code** | `git worktree` + separate cwd | `-p` / `--print` | CLAUDE.md + AGENTS.md |
| **Cursor Agent** | worktree + separate checkout; cloud agent | SDK / CLI non-interactive | rules + skills |

## Cloud sandbox matrix

| Provider | Isolation | Best for | Limits / caveats |
|----------|-----------|----------|------------------|
| [Modal Sandboxes](https://modal.com/products/sandboxes) | gVisor | Mass concurrent code run, GPU, Python orchestration | Not a full IDE; wire git + CLI yourself |
| [Daytona](https://www.daytona.io/) | container (default) | Fast dev env, previews, Codex-in-sandbox guides | API keys via Daytona secrets |
| [E2B](https://e2b.dev/docs/use-cases/coding-agents) | Firecracker microVM | Many isolated agent VMs, git in sandbox | Session time limits by plan |
| [Fly.io Sprites](https://fly.io/blog/code-and-let-live/) | Firecracker + persistent disk | Long-lived agent “computers” on Fly | Fly ecosystem |
| [CodeSandbox](https://codesandbox.io/) | microVM | Fork/concurrent browser sandboxes | Web-centric |
| **GitHub Codespaces** | per-codespace VM | Branch-aligned remote dev | Cost, org policies |
| **Dev container** | container on host/remote | Repeatable team env | Slower burst than Modal/E2B |

### When to escalate off local worktrees

- Agent runs **untrusted** generated code (CI fixes from unknown PRs).
- Host lacks **Node/pnpm/Brave** and reproducing via devcontainer is too heavy for a quick task.
- Need **>3–5** full clones and laptop disk/RAM is saturated.
- Task needs **GPU** or **thousands** of concurrent eval environments (Modal).
- Need a **public preview URL** without tunneling localhost (Daytona).

## Git concurrency

Concurrent `git worktree add` on the same repo can cause `SIGBUS` / index corruption on some macOS setups. Mitigations:

- Serialize worktree creation with a short delay (`sleep 1`) between adds.
- Use `git -c core.optionalLocks=false worktree add …` when documented for your git version.
- Fallback: clone to `/tmp/agent-<id>` (full copy, higher disk use).

## Branch and path conventions

| Item | Convention |
|------|------------|
| Branch | `agent/<tool>/<slug>` |
| Local path | `.worktrees/<tool>-<slug>` (repo-relative) |
| Manifest | `.agents/workspaces.json` (gitignore) |

## Environment files

Hermes `.worktreeinclude` (one path per line):

```text
.env
.env.local
```

Do not copy secrets into the manifest JSON or commit them.

## Links

- Hermes worktrees: https://hermes-agent.nousresearch.com/docs/user-guide/git-worktrees
- Grok Build: https://docs.x.ai/build/overview
- OpenClaw: https://github.com/openclaw/openclaw
- Modal coding agents: https://modal.com/solutions/coding-agents
- Daytona + Codex: https://www.daytona.io/docs/

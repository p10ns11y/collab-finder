# Fusion Sage — Context Sage Evolved

Fusion reactor built on [ai-optimization](../ai-optimization/SKILL.md) (fission). Router: [`.agents/rules/fusion-sage.mdc`](../../rules/fusion-sage.mdc).

## Quick Start (devprofile)
1. Symlink `.agents/rules/fusion-sage.mdc` → `.cursor/rules/fusion-sage.mdc` (`alwaysApply: true`)
2. Symlink both skills into `.cursor/skills/`
3. Optional seed: `fusion-state.json` (preloaded with BraveE2e + ConnectedReactor nodes)

## Files
| File | Purpose |
|---|---|
| `SKILL.md` | Fusion reactor definition |
| `fusion-playbooks.md` | Portable synthesis rules |
| `references/devprofile-fusion-playbook.md` | **devprofile** domain fusion map |
| `fusion-surplus-examples.md` | Q calculations (includes devprofile E2E) |
| `fusion-state.schema.json` | Knowledge graph schema |
| `fusion-state.json` | Seeded graph (optional, git-tracked) |

## Philosophy
> Fission keeps you fast. Fusion makes you unstoppable.

See root [AGENTS.md](../../../AGENTS.md#agent-skills--connected-system) for the connected system setup.

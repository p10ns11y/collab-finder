---
name: subagent-delegation
description: Delegate broad exploration to a subagent with a fixed Return format. Use when the task needs readonly repo mapping, token/CSS/prosody surveys, QA module exploration, or "explore thoroughly" with numbered deliverables.
---

# Subagent delegation

## When to use

- User lists numbered exploration goals (files, entry points, data flow, pain points)
- Task is breadth-first across many files; parent session should stay lightweight
- User says "explore in readonly mode" or references agent/subagent branches

## Spawn contract

Give the subagent:

1. **Scope** — directory or repo root (use `{REPO_ROOT}` in notes)
2. **Readonly** — explore agents should not implement unless asked
3. **Return format** (required):
   - File tree with one-line purpose per file
   - Mermaid or bullet flow (entry → core → output)
   - Pain points / readability notes
   - Direct answers to numbered questions

## Parent session

- Link subagent output back to the user’s original numbered list
- Do not duplicate full exploration in the parent — synthesize and propose next steps
- If subagent finds a small fix, parent implements after exploration returns

## Tool pattern (from gold subagents)

Typical chain: **UpdateCurrentStep** → **Glob** → **Grep** → **Read** — no Write until parent approves implementation.

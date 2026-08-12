---
name: structured-repo-explore
description: >
  Systematic Glob → Grep → Read exploration before edits or answers. Use for
  explore/map requests, unfamiliar modules, or /structured-repo-explore.
---

# Structured repo explore

## When to use

- User says explore, map, find where, or how does X work
- First turn in an unfamiliar area of a large repo
- Before proposing a multi-file change

## Steps

1. **Glob** for file patterns or entrypoints named by the user.
2. **Grep** for symbols / strings.
3. **list_dir** on directories that matter.
4. **Read** 2–3 key files (not everything).
5. Return a short numbered map: path → one-line purpose.
6. Stop after ≤3 explore rounds unless the user asks to go deeper — then propose next action or spawn a readonly subagent.

## Done when

The user has a concrete file list and clear next step (edit, verify, or deeper explore).

---
name: looper
description: >-
  DEPRECATED alias for control-graph. Outer state machine/loop + inner DAG or
  nested loops, budgets, HITL, multi-model routing. Prefer control-graph;
  this file only redirects. Triggers: looper (legacy).
---

# looper → control-graph

**This skill was renamed to [`control-graph`](../control-graph/SKILL.md).**

```text
looper  ≔  legacy name
control-graph  ≔  Outer(state machine | loop) + Inner(DAG | nested loop)
```

1. Load **[../control-graph/SKILL.md](../control-graph/SKILL.md)** (formal SoT).  
2. Optional English: [../control-graph/references/english-procedure.md](../control-graph/references/english-procedure.md) only if formal is ambiguous.  
3. Control Card: [../control-graph/references/control-card.md](../control-graph/references/control-card.md).  
4. Cursor rule: [../rules/control-graph.mdc](../rules/control-graph.mdc).  
5. CLT pre-filter (always-on when installed): [../rules/clt-dual-load.mdc](../rules/clt-dual-load.mdc).  
6. Validate: `node control-graph/scripts/validate-skill.mjs`

Update symlinks: `~/.cursor/skills/looper` → repoint or replace with `control-graph`.

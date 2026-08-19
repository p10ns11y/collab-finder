---
name: looper
description: >-
  DEPRECATED alias for control-graph. Outer state machine/loop + inner DAG or
  nested loops, budgets, HITL, multi-model routing. Prefer control-graph;
  this file only redirects. Triggers: looper (legacy).
---

# looper → control-graph

**Renamed to [`control-graph`](../control-graph/SKILL.md).**

```text
looper        ≔ legacy name
control-graph ≔ Outer(SM | loop) + Inner(DAG | nested loop) + Budget + HITL
Library       ≔ ~/Work/personal/skills/control-graph
```

1. Load **[../control-graph/SKILL.md](../control-graph/SKILL.md)** (formal SoT).  
2. English: `control-graph/references/english-procedure.md` **only if** formal ambiguous.  
3. Card: `control-graph/references/control-card.md`.  
4. Rule: [../../rules/control-graph.mdc](../../rules/control-graph.mdc).  
5. Validate: `node control-graph/scripts/validate-skill.mjs`
